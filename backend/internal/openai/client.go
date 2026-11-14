// Package openai is the OpenAI adapter of the assistant's LLM port: Chat
// Completions with streaming and function calling, over plain net/http.
package openai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/nasa-challenge/app/backend/internal/assistant"
)

// DefaultBaseURL is OpenAI's API.
const DefaultBaseURL = "https://api.openai.com/v1"

// Client talks to the Chat Completions API.
type Client struct {
	BaseURL string
	Key     string
	Model   string
	// ReasoningEffort is sent to reasoning models when set (none, low, medium, high).
	ReasoningEffort string
	MaxTokens       int
	HTTP            *http.Client
	Retries         int
	Backoff         time.Duration
}

var _ assistant.LLM = (*Client)(nil)

// NewClient builds a Client.
func NewClient(key, model string) *Client {
	return &Client{
		BaseURL: DefaultBaseURL, Key: key, Model: model, MaxTokens: 4000,
		HTTP: &http.Client{Timeout: 3 * time.Minute}, Retries: 1, Backoff: time.Second,
	}
}

type fn struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type toolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function fn     `json:"function"`
}

type message struct {
	Role       string     `json:"role"`
	Content    *string    `json:"content"`
	ToolCalls  []toolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

type tool struct {
	Type     string `json:"type"`
	Function struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		Parameters  json.RawMessage `json:"parameters"`
	} `json:"function"`
}

type body struct {
	Model           string    `json:"model"`
	Messages        []message `json:"messages"`
	Tools           []tool    `json:"tools,omitempty"`
	Stream          bool      `json:"stream"`
	MaxTokens       int       `json:"max_completion_tokens,omitempty"`
	ReasoningEffort string    `json:"reasoning_effort,omitempty"`
}

type chunk struct {
	Choices []struct {
		Delta struct {
			Content   string `json:"content"`
			ToolCalls []struct {
				Index    int    `json:"index"`
				ID       string `json:"id"`
				Function fn     `json:"function"`
			} `json:"tool_calls"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Error *apiError `json:"error"`
}

type apiError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Code    any    `json:"code"`
}

// Error is an error answer of the API.
type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string { return fmt.Sprintf("openai: status %d: %s", e.Status, e.Message) }

func str(s string) *string { return &s }

func encode(model string, req assistant.Request) body {
	b := body{Model: model, Stream: true}
	if req.System != "" {
		b.Messages = append(b.Messages, message{Role: "system", Content: str(req.System)})
	}
	for _, m := range req.Messages {
		out := message{Role: m.Role, ToolCallID: m.ToolCallID}
		if m.Content != "" || len(m.ToolCalls) == 0 {
			out.Content = str(m.Content)
		}
		for _, c := range m.ToolCalls {
			args := string(c.Args)
			if args == "" {
				args = "{}"
			}
			out.ToolCalls = append(out.ToolCalls, toolCall{ID: c.ID, Type: "function", Function: fn{Name: c.Name, Arguments: args}})
		}
		b.Messages = append(b.Messages, out)
	}
	for _, s := range req.Tools {
		t := tool{Type: "function"}
		t.Function.Name, t.Function.Description, t.Function.Parameters = s.Name, s.Description, s.Parameters
		b.Tools = append(b.Tools, t)
	}
	return b
}

func retryable(status int) bool { return status == http.StatusTooManyRequests || status >= 500 }

// Stream implements assistant.LLM.
func (c *Client) Stream(ctx context.Context, req assistant.Request, onText func(string)) (assistant.Reply, error) {
	b := encode(c.Model, req)
	b.MaxTokens, b.ReasoningEffort = c.MaxTokens, c.ReasoningEffort
	payload, err := json.Marshal(b)
	if err != nil {
		return assistant.Reply{}, err
	}
	var res *http.Response
	for attempt := 0; ; attempt++ {
		res, err = c.post(ctx, payload)
		if err == nil && res.StatusCode == http.StatusOK {
			break
		}
		if err == nil {
			apiErr := readError(res)
			if !retryable(res.StatusCode) || attempt >= c.Retries {
				return assistant.Reply{}, apiErr
			}
		} else if ctx.Err() != nil || attempt >= c.Retries {
			return assistant.Reply{}, err
		}
		select {
		case <-ctx.Done():
			return assistant.Reply{}, ctx.Err()
		case <-time.After(c.Backoff * time.Duration(attempt+1)):
		}
	}
	defer res.Body.Close()
	return read(res.Body, onText)
}

func (c *Client) post(ctx context.Context, payload []byte) (*http.Response, error) {
	r, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimSuffix(c.BaseURL, "/")+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	r.Header.Set("Authorization", "Bearer "+c.Key)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Accept", "text/event-stream")
	return c.HTTP.Do(r)
}

func readError(res *http.Response) error {
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 64<<10))
	var e struct {
		Error apiError `json:"error"`
	}
	msg := strings.TrimSpace(string(raw))
	if json.Unmarshal(raw, &e) == nil && e.Error.Message != "" {
		msg = e.Error.Message
	}
	return &Error{Status: res.StatusCode, Message: msg}
}

// read parses the server-sent events of a streamed completion, assembling
// tool calls whose arguments arrive in pieces.
func read(r io.Reader, onText func(string)) (assistant.Reply, error) {
	type partial struct {
		id, name string
		args     strings.Builder
	}
	calls := map[int]*partial{}
	var text strings.Builder
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64<<10), 4<<20)
	done := false
	for sc.Scan() {
		line := sc.Text()
		data, ok := strings.CutPrefix(line, "data:")
		if !ok {
			continue
		}
		data = strings.TrimSpace(data)
		if data == "[DONE]" {
			done = true
			break
		}
		var ch chunk
		if err := json.Unmarshal([]byte(data), &ch); err != nil {
			return assistant.Reply{}, fmt.Errorf("openai: bad chunk: %w", err)
		}
		if ch.Error != nil {
			return assistant.Reply{}, &Error{Status: http.StatusOK, Message: ch.Error.Message}
		}
		for _, choice := range ch.Choices {
			if d := choice.Delta.Content; d != "" {
				text.WriteString(d)
				if onText != nil {
					onText(d)
				}
			}
			for _, tc := range choice.Delta.ToolCalls {
				p := calls[tc.Index]
				if p == nil {
					p = &partial{}
					calls[tc.Index] = p
				}
				if tc.ID != "" {
					p.id = tc.ID
				}
				if tc.Function.Name != "" {
					p.name += tc.Function.Name
				}
				p.args.WriteString(tc.Function.Arguments)
			}
		}
	}
	if err := sc.Err(); err != nil {
		return assistant.Reply{}, fmt.Errorf("openai: read stream: %w", err)
	}
	if !done {
		return assistant.Reply{}, errors.New("openai: stream ended early")
	}
	idx := make([]int, 0, len(calls))
	for i := range calls {
		idx = append(idx, i)
	}
	sort.Ints(idx)
	reply := assistant.Reply{Content: text.String()}
	for _, i := range idx {
		p := calls[i]
		args := p.args.String()
		if strings.TrimSpace(args) == "" {
			args = "{}"
		}
		reply.ToolCalls = append(reply.ToolCalls, assistant.ToolCall{ID: p.id, Name: p.name, Args: json.RawMessage(args)})
	}
	return reply, nil
}
