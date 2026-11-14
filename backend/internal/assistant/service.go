package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"
)

// Limits of a conversation.
const (
	MaxSteps       = 6    // model turns that may call tools
	MaxMessages    = 20   // history kept
	MaxMessageLen  = 2000 // characters of a user message
	maxToolPayload = 24000
)

// Event is something the user sees happen while Ember answers.
type Event struct {
	Type    string          `json:"type"` // tool_start | tool_end | text | done | error
	ID      string          `json:"id,omitempty"`
	Name    string          `json:"name,omitempty"`
	Args    json.RawMessage `json:"args,omitempty"`
	OK      *bool           `json:"ok,omitempty"`
	Error   string          `json:"error,omitempty"`
	Card    *Card           `json:"card,omitempty"`
	Text    string          `json:"text,omitempty"`
	Elapsed int64           `json:"elapsed_ms,omitempty"`
}

// Turn is a message of the conversation as the web app sends it.
type Turn struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// PageContext is what the user was looking at when they asked.
type PageContext struct {
	Area string `json:"area,omitempty"` // web app URL form, e.g. "bbox:-9.6,35.9,4.4,43.9"
	Name string `json:"name,omitempty"`
	From string `json:"from,omitempty"`
	To   string `json:"to,omitempty"`
}

// ErrInvalid means the conversation can't be answered as sent.
var ErrInvalid = errors.New("invalid conversation")

// Service runs the conversation loop.
type Service struct {
	llm   LLM
	tools map[string]Tool
	specs []ToolSpec
	now   func() time.Time
	log   *slog.Logger
}

// NewService builds a Service.
func NewService(llm LLM, tools []Tool, now func() time.Time, log *slog.Logger) *Service {
	if now == nil {
		now = time.Now
	}
	if log == nil {
		log = slog.Default()
	}
	s := &Service{llm: llm, tools: map[string]Tool{}, now: now, log: log}
	for _, t := range tools {
		spec := t.Spec()
		s.tools[spec.Name] = t
		s.specs = append(s.specs, spec)
	}
	return s
}

func validate(turns []Turn) ([]Message, error) {
	if len(turns) == 0 {
		return nil, fmt.Errorf("%w: no messages", ErrInvalid)
	}
	turns = turns[max(0, len(turns)-MaxMessages):]
	out := make([]Message, 0, len(turns))
	for _, t := range turns {
		if t.Role != RoleUser && t.Role != RoleAssistant {
			return nil, fmt.Errorf("%w: role must be user or assistant", ErrInvalid)
		}
		c := strings.TrimSpace(t.Content)
		if c == "" {
			continue
		}
		if t.Role == RoleUser && len([]rune(c)) > MaxMessageLen {
			return nil, fmt.Errorf("%w: messages are limited to %d characters", ErrInvalid, MaxMessageLen)
		}
		if len([]rune(c)) > 4*MaxMessageLen {
			c = string([]rune(c)[:4*MaxMessageLen])
		}
		out = append(out, Message{Role: t.Role, Content: c})
	}
	if len(out) == 0 || out[len(out)-1].Role != RoleUser {
		return nil, fmt.Errorf("%w: the last message must be the user's", ErrInvalid)
	}
	return out, nil
}

// Validate checks a conversation before the stream starts.
func (s *Service) Validate(turns []Turn) error {
	_, err := validate(turns)
	return err
}

// Answer runs the model and its tools until it answers, calling emit for
// every event. Errors after the stream starts are emitted, not returned.
func (s *Service) Answer(ctx context.Context, turns []Turn, page *PageContext, emit func(Event)) error {
	msgs, err := validate(turns)
	if err != nil {
		return err
	}
	var mu sync.Mutex
	send := func(e Event) {
		mu.Lock()
		defer mu.Unlock()
		emit(e)
	}
	req := Request{System: systemPrompt(s.now(), page), Messages: msgs, Tools: s.specs}
	for step := 0; ; step++ {
		if step == MaxSteps {
			req.Tools = nil // make it answer with what it has
		}
		reply, err := s.llm.Stream(ctx, req, func(t string) { send(Event{Type: "text", Text: t}) })
		if err != nil {
			s.log.ErrorContext(ctx, "assistant model", "error", err)
			send(Event{Type: "error", Error: "Ember lost the connection to the model. Try again in a moment."})
			return nil
		}
		if len(reply.ToolCalls) == 0 || req.Tools == nil {
			send(Event{Type: "done"})
			return nil
		}
		req.Messages = append(req.Messages, Message{Role: RoleAssistant, Content: reply.Content, ToolCalls: reply.ToolCalls})
		results := make([]Message, len(reply.ToolCalls))
		var wg sync.WaitGroup
		for i, call := range reply.ToolCalls {
			wg.Go(func() {
				results[i] = Message{Role: RoleTool, ToolCallID: call.ID, Content: s.run(ctx, call, send)}
			})
		}
		wg.Wait()
		req.Messages = append(req.Messages, results...)
	}
}

// run executes one tool call and returns what the model reads back.
func (s *Service) run(ctx context.Context, call ToolCall, send func(Event)) string {
	start := s.now()
	args := call.Args
	if !json.Valid(args) {
		args = json.RawMessage("{}")
	}
	send(Event{Type: "tool_start", ID: call.ID, Name: call.Name, Args: args})
	fail := func(msg string) string {
		no := false
		send(Event{Type: "tool_end", ID: call.ID, Name: call.Name, OK: &no, Error: msg, Elapsed: s.now().Sub(start).Milliseconds()})
		b, _ := json.Marshal(map[string]string{"error": msg})
		return string(b)
	}
	t, ok := s.tools[call.Name]
	if !ok {
		return fail("unknown tool " + call.Name)
	}
	res, err := t.Call(ctx, call.Args)
	switch {
	case errors.Is(err, ErrBadArgs):
		return fail(err.Error())
	case err != nil:
		s.log.ErrorContext(ctx, "assistant tool", "tool", call.Name, "error", err)
		return fail("the data service failed; tell the user and do not invent numbers")
	}
	b, err := json.Marshal(res.ForModel)
	if err != nil {
		return fail("could not encode the result")
	}
	if len(b) > maxToolPayload {
		b = append(b[:maxToolPayload:maxToolPayload], []byte(`... (truncated)`)...)
	}
	yes := true
	send(Event{Type: "tool_end", ID: call.ID, Name: call.Name, OK: &yes, Card: res.Card, Elapsed: s.now().Sub(start).Milliseconds()})
	return string(b)
}

func systemPrompt(now time.Time, page *PageContext) string {
	var b strings.Builder
	fmt.Fprintf(&b, `You are Ember, the fire analyst of Ctrl + Fire, a NASA Space Apps project. Today is %s.

Ctrl + Fire turns NASA FIRMS satellite active-fire detections into a consistent monthly record from 2002-07 to today, on a 0.25° grid:
- 2002-07 to 2012-01: MODIS Aqua counts rebuilt as "what VIIRS would have seen" with each country's harmonization model (estimates: good for patterns, not single fires).
- 2012-02 onwards: VIIRS Suomi NPP from the archive, then recent near real time VIIRS days (provisional). NOAA-20 is used to check continuity.
- A hotspot is a satellite pixel with active fire, not a fire: one large fire makes many hotspots, and clouds, smoke or small short fires can hide fire.
- The current month is incomplete; it is compared at its current pace ("projected").

How to answer:
- Never guess numbers. Call the tools to get data, then answer from what they return. For a country, call find_region first to get its bbox. For well-known regions without a country (e.g. "the Amazon", "Siberia", "California") use a bbox from your knowledge and give it a name.
- Prefer one or two well-chosen tool calls; call several in parallel when comparing places.
- Answer in the user's language, in concise, vivid Markdown: lead with a clear verdict (above / below / about normal) in one or two sentences with the key number in **bold**, then a few bullets of evidence (months, years, anomalies vs the usual month), then one line of caveat when it matters. Use a small table only when comparing several items. No headings for short answers.
- For 'this year' questions use year_to_date and the current month from get_calendar (without a from), not a calendar limited to this year.
- Round numbers sensibly ("about 12,400 hotspots") and say "hotspots", not "fires".
- The user also sees a visual card for every tool you call, so don't recite long series.
- If a question is unrelated to fire, the data or the method, answer briefly and steer back to what you can do.
- Data credit: NASA FIRMS (LANCE / ESDIS). Mention it only if asked about sources.
`, now.Format("Monday 2 January 2006"))
	if page != nil && (page.Area != "" || page.From != "" || page.To != "") {
		b.WriteString("\nThe user opened this chat from the analysis of ")
		if page.Name != "" {
			fmt.Fprintf(&b, "%q ", page.Name)
		}
		if page.Area != "" {
			fmt.Fprintf(&b, "(area %s, in the web app's form kind:values; bbox is west,south,east,north and point is lat,lon,radius_km) ", page.Area)
		}
		if page.From != "" || page.To != "" {
			fmt.Fprintf(&b, "for %s to %s ", or(page.From, "2002-07"), or(page.To, "now"))
		}
		b.WriteString("— when they say \"here\", \"this area\" or don't name a place, they mean this one.\n")
	}
	return b.String()
}

func or(s, fallback string) string {
	if s == "" {
		return fallback
	}
	return s
}
