package openai

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/nasa-challenge/app/backend/internal/assistant"
)

func sse(chunks ...string) string {
	var b strings.Builder
	for _, c := range chunks {
		fmt.Fprintf(&b, "data: %s\n\n", c)
	}
	b.WriteString("data: [DONE]\n\n")
	return b.String()
}

func TestStream(t *testing.T) {
	tests := []struct {
		name      string
		stream    string
		wantText  string
		wantCalls []assistant.ToolCall
	}{
		{
			name: "text",
			stream: sse(
				`{"choices":[{"delta":{"role":"assistant","content":""}}]}`,
				`{"choices":[{"delta":{"content":"Hot "}}]}`,
				`{"choices":[{"delta":{"content":"summer."}}]}`,
				`{"choices":[{"delta":{},"finish_reason":"stop"}]}`,
			),
			wantText: "Hot summer.",
		},
		{
			name: "a tool call in pieces",
			stream: sse(
				`{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_calendar","arguments":""}}]}}]}`,
				`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"area\":{\"kind\""}}]}}]}`,
				`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\"world\"}}"}}]}}]}`,
				`{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}`,
			),
			wantCalls: []assistant.ToolCall{{ID: "call_1", Name: "get_calendar", Args: json.RawMessage(`{"area":{"kind":"world"}}`)}},
		},
		{
			name: "parallel calls, no args",
			stream: sse(
				`{"choices":[{"delta":{"tool_calls":[{"index":1,"id":"b","function":{"name":"get_coverage","arguments":""}}]}}]}`,
				`{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"a","function":{"name":"find_region","arguments":"{\"query\":\"Chile\"}"}}]}}]}`,
			),
			wantCalls: []assistant.ToolCall{
				{ID: "a", Name: "find_region", Args: json.RawMessage(`{"query":"Chile"}`)},
				{ID: "b", Name: "get_coverage", Args: json.RawMessage(`{}`)},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got body
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/chat/completions" || r.Header.Get("Authorization") != "Bearer k" {
					t.Errorf("request %s auth %q", r.URL.Path, r.Header.Get("Authorization"))
				}
				_ = json.NewDecoder(r.Body).Decode(&got)
				w.Header().Set("Content-Type", "text/event-stream")
				_, _ = io.WriteString(w, tt.stream)
			}))
			defer srv.Close()
			c := NewClient("k", "m")
			c.BaseURL = srv.URL
			var streamed strings.Builder
			reply, err := c.Stream(t.Context(), assistant.Request{
				System:   "sys",
				Messages: []assistant.Message{{Role: "user", Content: "hi"}},
				Tools:    []assistant.ToolSpec{{Name: "x", Description: "d", Parameters: json.RawMessage(`{"type":"object"}`)}},
			}, func(s string) { streamed.WriteString(s) })
			if err != nil {
				t.Fatal(err)
			}
			if reply.Content != tt.wantText || streamed.String() != tt.wantText {
				t.Errorf("text = %q, streamed %q, want %q", reply.Content, streamed.String(), tt.wantText)
			}
			if len(reply.ToolCalls) != len(tt.wantCalls) {
				t.Fatalf("calls = %+v, want %+v", reply.ToolCalls, tt.wantCalls)
			}
			for i, w := range tt.wantCalls {
				g := reply.ToolCalls[i]
				if g.ID != w.ID || g.Name != w.Name || string(g.Args) != string(w.Args) {
					t.Errorf("call %d = %+v (%s), want %+v (%s)", i, g, g.Args, w, w.Args)
				}
			}
			if !got.Stream || got.Model != "m" || got.Messages[0].Role != "system" || got.Tools[0].Type != "function" {
				t.Errorf("sent %+v", got)
			}
		})
	}
}

func TestEncodeToolTurns(t *testing.T) {
	b := encode("m", assistant.Request{Messages: []assistant.Message{
		{Role: "user", Content: "q"},
		{Role: "assistant", ToolCalls: []assistant.ToolCall{{ID: "1", Name: "t"}}},
		{Role: "tool", ToolCallID: "1", Content: `{"ok":true}`},
	}})
	raw, _ := json.Marshal(b.Messages)
	for _, want := range []string{
		`{"role":"assistant","content":null,"tool_calls":[{"id":"1","type":"function","function":{"name":"t","arguments":"{}"}}]}`,
		`{"role":"tool","content":"{\"ok\":true}","tool_call_id":"1"}`,
	} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("messages %s\nmissing %s", raw, want)
		}
	}
}

func TestStreamErrors(t *testing.T) {
	tests := []struct {
		name      string
		status    []int
		body      string
		wantCalls int32
		wantErr   string
	}{
		{"bad key is not retried", []int{401}, `{"error":{"message":"Incorrect API key"}}`, 1, "Incorrect API key"},
		{"server error is retried once", []int{500, 500}, `{"error":{"message":"boom"}}`, 2, "boom"},
		{"retry succeeds", []int{429, 200}, sse(`{"choices":[{"delta":{"content":"ok"}}]}`), 2, ""},
		{"cut stream", []int{200}, "data: {\"choices\":[{\"delta\":{\"content\":\"o\"}}]}\n\n", 1, "ended early"},
		{"error in stream", []int{200}, `data: {"error":{"message":"overloaded"}}` + "\n\n", 1, "overloaded"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var calls atomic.Int32
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				n := calls.Add(1)
				w.WriteHeader(tt.status[min(int(n)-1, len(tt.status)-1)])
				_, _ = io.WriteString(w, tt.body)
			}))
			defer srv.Close()
			c := NewClient("k", "m")
			c.BaseURL, c.Backoff = srv.URL, 0
			_, err := c.Stream(t.Context(), assistant.Request{Messages: []assistant.Message{{Role: "user", Content: "hi"}}}, nil)
			if calls.Load() != tt.wantCalls {
				t.Errorf("calls = %d, want %d", calls.Load(), tt.wantCalls)
			}
			switch {
			case tt.wantErr == "" && err != nil:
				t.Errorf("err = %v", err)
			case tt.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tt.wantErr)):
				t.Errorf("err = %v, want %q", err, tt.wantErr)
			}
			var apiErr *Error
			if tt.name == "bad key is not retried" && (!errors.As(err, &apiErr) || apiErr.Status != 401) {
				t.Errorf("err = %#v, want *Error 401", err)
			}
		})
	}
}
