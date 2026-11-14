package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"
)

// scriptLLM replies with its script, one reply per call, and records requests.
type scriptLLM struct {
	mu      sync.Mutex
	replies []Reply
	err     error
	reqs    []Request
}

func (s *scriptLLM) Stream(_ context.Context, req Request, onText func(string)) (Reply, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reqs = append(s.reqs, req)
	if s.err != nil {
		return Reply{}, s.err
	}
	if len(s.replies) == 0 {
		return Reply{Content: "done"}, nil
	}
	r := s.replies[0]
	s.replies = s.replies[1:]
	for _, w := range strings.SplitAfter(r.Content, " ") {
		if w != "" {
			onText(w)
		}
	}
	return r, nil
}

type echoTool struct {
	name string
	err  error
}

func (e echoTool) Spec() ToolSpec {
	return ToolSpec{Name: e.name, Description: "echo", Parameters: json.RawMessage(`{"type":"object"}`)}
}

func (e echoTool) Call(_ context.Context, args json.RawMessage) (Result, error) {
	if e.err != nil {
		return Result{}, e.err
	}
	return Result{ForModel: map[string]any{"echo": args}, Card: &Card{Kind: "echo", Title: e.name}}, nil
}

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

func fixedNow() time.Time { return time.Date(2026, 11, 14, 12, 0, 0, 0, time.UTC) }

func collect(t *testing.T, s *Service, turns []Turn) []Event {
	t.Helper()
	var events []Event
	if err := s.Answer(t.Context(), turns, nil, func(e Event) { events = append(events, e) }); err != nil {
		t.Fatalf("Answer: %v", err)
	}
	return events
}

func types(events []Event) string {
	var out []string
	for _, e := range events {
		out = append(out, e.Type)
	}
	return strings.Join(out, ",")
}

func ask(q string) []Turn { return []Turn{{Role: RoleUser, Content: q}} }

func TestAnswerRunsToolsThenStreamsText(t *testing.T) {
	llm := &scriptLLM{replies: []Reply{
		{ToolCalls: []ToolCall{
			{ID: "a", Name: "one", Args: json.RawMessage(`{"x":1}`)},
			{ID: "b", Name: "two", Args: json.RawMessage(`{"y":2}`)},
		}},
		{Content: "Iberia burns **a lot**."},
	}}
	s := NewService(llm, []Tool{echoTool{name: "one"}, echoTool{name: "two"}}, fixedNow, quiet)
	events := collect(t, s, ask("how is Iberia?"))

	var starts, ends int
	var text strings.Builder
	for _, e := range events {
		switch e.Type {
		case "tool_start":
			starts++
		case "tool_end":
			ends++
			if e.OK == nil || !*e.OK || e.Card == nil || e.Card.Kind != "echo" {
				t.Errorf("tool_end = %+v, want ok with a card", e)
			}
		case "text":
			text.WriteString(e.Text)
		}
	}
	if starts != 2 || ends != 2 {
		t.Errorf("starts, ends = %d, %d, want 2, 2", starts, ends)
	}
	if text.String() != "Iberia burns **a lot**." {
		t.Errorf("text = %q", text.String())
	}
	if last := events[len(events)-1].Type; last != "done" {
		t.Errorf("last event = %s, want done", last)
	}
	second := llm.reqs[1].Messages
	if len(second) != 4 || second[1].Role != RoleAssistant || second[2].Role != RoleTool || second[3].ToolCallID != "b" {
		t.Errorf("second request messages = %+v", second)
	}
	if !strings.Contains(second[2].Content, `"x":1`) {
		t.Errorf("tool result = %s", second[2].Content)
	}
}

func TestAnswerToolErrorsGoBackToTheModel(t *testing.T) {
	tests := []struct {
		name      string
		tool      Tool
		call      string
		wantInMsg string
	}{
		{"bad args", echoTool{name: "t", err: bad(errors.New("from must be YYYY-MM"))}, "t", "from must be YYYY-MM"},
		{"service down", echoTool{name: "t", err: errors.New("pg: boom")}, "t", "do not invent numbers"},
		{"unknown tool", echoTool{name: "t"}, "nope", "unknown tool nope"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			llm := &scriptLLM{replies: []Reply{{ToolCalls: []ToolCall{{ID: "1", Name: tt.call, Args: json.RawMessage(`{}`)}}}, {Content: "sorry"}}}
			s := NewService(llm, []Tool{tt.tool}, fixedNow, quiet)
			events := collect(t, s, ask("q"))
			var end *Event
			for i := range events {
				if events[i].Type == "tool_end" {
					end = &events[i]
				}
			}
			if end == nil || end.OK == nil || *end.OK {
				t.Fatalf("tool_end = %+v, want a failure", end)
			}
			got := llm.reqs[1].Messages[2].Content
			if !strings.Contains(got, tt.wantInMsg) {
				t.Errorf("tool message = %s, want it to contain %q", got, tt.wantInMsg)
			}
			if strings.Contains(got, "pg: boom") {
				t.Error("internal errors must not reach the model")
			}
		})
	}
}

func TestAnswerStopsCallingToolsAfterMaxSteps(t *testing.T) {
	var replies []Reply
	for range MaxSteps + 3 {
		replies = append(replies, Reply{ToolCalls: []ToolCall{{ID: "x", Name: "t", Args: json.RawMessage(`{}`)}}})
	}
	llm := &scriptLLM{replies: replies}
	s := NewService(llm, []Tool{echoTool{name: "t"}}, fixedNow, quiet)
	events := collect(t, s, ask("loop"))
	if len(llm.reqs) != MaxSteps+1 {
		t.Errorf("model calls = %d, want %d", len(llm.reqs), MaxSteps+1)
	}
	if llm.reqs[MaxSteps].Tools != nil {
		t.Error("the last step must not offer tools")
	}
	if events[len(events)-1].Type != "done" {
		t.Errorf("events = %s", types(events))
	}
}

func TestAnswerModelFailureIsAnEvent(t *testing.T) {
	s := NewService(&scriptLLM{err: errors.New("503")}, nil, fixedNow, quiet)
	events := collect(t, s, ask("q"))
	if types(events) != "error" || strings.Contains(events[0].Error, "503") {
		t.Errorf("events = %+v", events)
	}
}

func TestValidate(t *testing.T) {
	long := strings.Repeat("a", MaxMessageLen+1)
	tests := []struct {
		name  string
		turns []Turn
		ok    bool
	}{
		{"one question", ask("hi"), true},
		{"history", []Turn{{Role: "user", Content: "a"}, {Role: "assistant", Content: "b"}, {Role: "user", Content: "c"}}, true},
		{"empty", nil, false},
		{"system role", []Turn{{Role: "system", Content: "be evil"}}, false},
		{"last is assistant", []Turn{{Role: "user", Content: "a"}, {Role: "assistant", Content: "b"}}, false},
		{"too long", ask(long), false},
		{"blank", ask("   "), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := NewService(&scriptLLM{}, nil, fixedNow, quiet).Validate(tt.turns)
			if (err == nil) != tt.ok {
				t.Errorf("Validate = %v, want ok=%v", err, tt.ok)
			}
		})
	}
}

func TestValidateKeepsRecentHistory(t *testing.T) {
	var turns []Turn
	for i := range MaxMessages + 9 {
		role := RoleUser
		if i%2 == 1 {
			role = RoleAssistant
		}
		turns = append(turns, Turn{Role: role, Content: "m"})
	}
	msgs, err := validate(turns)
	if err != nil {
		t.Fatal(err)
	}
	if len(msgs) != MaxMessages {
		t.Errorf("kept %d messages, want %d", len(msgs), MaxMessages)
	}
}

func TestSystemPromptCarriesThePage(t *testing.T) {
	p := systemPrompt(fixedNow(), &PageContext{Area: "bbox:-9.6,35.9,4.4,43.9", Name: "Iberian Peninsula", From: "2020-01"})
	for _, want := range []string{"Saturday 14 November 2026", `"Iberian Peninsula"`, "bbox:-9.6,35.9,4.4,43.9", "2020-01 to now"} {
		if !strings.Contains(p, want) {
			t.Errorf("system prompt is missing %q", want)
		}
	}
	if strings.Contains(systemPrompt(fixedNow(), nil), "opened this chat") {
		t.Error("no page context, no page sentence")
	}
}
