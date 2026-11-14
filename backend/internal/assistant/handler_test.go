package assistant

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

func serve(t *testing.T, h *Handler, method, target, body string, header map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	h.Routes(r)
	req := httptest.NewRequestWithContext(t.Context(), method, target, strings.NewReader(body))
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestHandlerStatus(t *testing.T) {
	tests := []struct {
		name string
		h    *Handler
		want Status
	}{
		{"disabled", NewHandler(nil, "", nil), Status{}},
		{"enabled", NewHandler(NewService(&scriptLLM{}, nil, fixedNow, quiet), "gpt-x", nil), Status{Enabled: true, Model: "gpt-x"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serve(t, tt.h, http.MethodGet, "/assistant/status", "", nil)
			var got Status
			if err := json.NewDecoder(rec.Body).Decode(&got); err != nil || got != tt.want {
				t.Errorf("status = %+v (%v), want %+v", got, err, tt.want)
			}
		})
	}
}

func TestHandlerChatStreamsEvents(t *testing.T) {
	llm := &scriptLLM{replies: []Reply{
		{ToolCalls: []ToolCall{{ID: "1", Name: "t", Args: json.RawMessage(`{}`)}}},
		{Content: "Hello there"},
	}}
	h := NewHandler(NewService(llm, []Tool{echoTool{name: "t"}}, fixedNow, quiet), "m", nil)
	rec := serve(t, h, http.MethodPost, "/assistant/chat",
		`{"messages":[{"role":"user","content":"hi"}],"context":{"area":"world","name":"World"}}`, nil)

	if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "text/event-stream" {
		t.Fatalf("status %d, type %q", rec.Code, rec.Header().Get("Content-Type"))
	}
	body := rec.Body.String()
	for _, want := range []string{"event: tool_start\ndata: {", "event: tool_end\n", "event: text\ndata: {\"type\":\"text\",\"text\":\"Hello \"}\n\n", "event: done\n"} {
		if !strings.Contains(body, want) {
			t.Errorf("stream is missing %q:\n%s", want, body)
		}
	}
	if !strings.Contains(llm.reqs[0].System, `"World"`) {
		t.Error("page context did not reach the model")
	}
}

func TestHandlerChatRejects(t *testing.T) {
	enabled := func() *Handler { return NewHandler(NewService(&scriptLLM{}, nil, fixedNow, quiet), "m", nil) }
	tests := []struct {
		name string
		h    *Handler
		body string
		want int
	}{
		{"disabled", NewHandler(nil, "", nil), `{"messages":[{"role":"user","content":"hi"}]}`, http.StatusServiceUnavailable},
		{"not json", enabled(), `hi`, http.StatusBadRequest},
		{"no messages", enabled(), `{"messages":[]}`, http.StatusBadRequest},
		{"bad role", enabled(), `{"messages":[{"role":"system","content":"x"}]}`, http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if rec := serve(t, tt.h, http.MethodPost, "/assistant/chat", tt.body, nil); rec.Code != tt.want {
				t.Errorf("status = %d, want %d: %s", rec.Code, tt.want, rec.Body)
			}
		})
	}
}

func TestHandlerChatRateLimitsPerClient(t *testing.T) {
	h := NewHandler(NewService(&scriptLLM{}, nil, fixedNow, quiet), "m", NewLimiter(1, 2, fixedNow))
	body := `{"messages":[{"role":"user","content":"hi"}]}`
	a := map[string]string{"X-Forwarded-For": "1.1.1.1"}
	b := map[string]string{"X-Forwarded-For": "2.2.2.2, 10.0.0.1"}
	for i, want := range []int{200, 200, 429} {
		if rec := serve(t, h, http.MethodPost, "/assistant/chat", body, a); rec.Code != want {
			t.Errorf("request %d from a = %d, want %d", i, rec.Code, want)
		} else if want == 429 && (rec.Header().Get("Retry-After") == "" || !strings.Contains(rec.Body.String(), "cool down")) {
			t.Errorf("429 without a friendly message: %s", rec.Body)
		}
	}
	if rec := serve(t, h, http.MethodPost, "/assistant/chat", body, b); rec.Code != http.StatusOK {
		t.Errorf("another client = %d, want 200", rec.Code)
	}
}

func TestLimiterRefills(t *testing.T) {
	now := fixedNow()
	l := NewLimiter(60, 1, func() time.Time { return now })
	if ok, _ := l.Allow("k"); !ok {
		t.Fatal("first must pass")
	}
	ok, wait := l.Allow("k")
	if ok || wait <= 0 || wait > time.Minute {
		t.Fatalf("second = %v, wait %v; want a wait up to a minute", ok, wait)
	}
	now = now.Add(time.Minute)
	if ok, _ := l.Allow("k"); !ok {
		t.Error("a minute later a token is back")
	}
	if ok, _ := (*Limiter)(nil).Allow("k"); !ok {
		t.Error("nil limiter allows")
	}
	if ok, _ := NewLimiter(0, 0, nil).Allow("k"); !ok {
		t.Error("0 per hour means no limit")
	}
}

type blockingAnswerer struct{}

func (blockingAnswerer) Validate([]Turn) error { return nil }
func (blockingAnswerer) Answer(ctx context.Context, _ []Turn, _ *PageContext, emit func(Event)) error {
	emit(Event{Type: "done"})
	if _, ok := ctx.Deadline(); !ok {
		emit(Event{Type: "error", Error: "no deadline"})
	}
	return nil
}

func TestHandlerChatBoundsTheAnswer(t *testing.T) {
	rec := serve(t, NewHandler(blockingAnswerer{}, "m", nil), http.MethodPost, "/assistant/chat",
		`{"messages":[{"role":"user","content":"hi"}]}`, nil)
	if strings.Contains(rec.Body.String(), "no deadline") {
		t.Error("the answer must have a deadline")
	}
}
