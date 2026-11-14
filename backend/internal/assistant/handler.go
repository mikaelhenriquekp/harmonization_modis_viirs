package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/nasa-challenge/app/backend/internal/httpx"
)

// Answerer is what the handler needs from the service.
type Answerer interface {
	Validate(turns []Turn) error
	Answer(ctx context.Context, turns []Turn, page *PageContext, emit func(Event)) error
}

// StreamPath is the chat route, which streams and must not be cut by the
// router's request timeout.
const StreamPath = "/api/assistant/chat"

// AnswerTimeout bounds a whole answer.
const AnswerTimeout = 2 * time.Minute

// Handler exposes Ember over HTTP.
type Handler struct {
	svc     Answerer // nil when no model is configured
	model   string
	limiter *Limiter
}

// NewHandler builds a Handler; a nil svc reports the assistant as disabled.
func NewHandler(svc Answerer, model string, limiter *Limiter) *Handler {
	return &Handler{svc: svc, model: model, limiter: limiter}
}

// Routes mounts the assistant routes.
func (h *Handler) Routes(r chi.Router) {
	r.Get("/assistant/status", h.status)
	r.Post("/assistant/chat", h.chat)
}

// Status says whether Ember can answer.
type Status struct {
	Enabled bool   `json:"enabled"`
	Model   string `json:"model,omitempty"`
}

func (h *Handler) status(w http.ResponseWriter, _ *http.Request) {
	if h.svc == nil {
		httpx.JSON(w, http.StatusOK, Status{})
		return
	}
	httpx.JSON(w, http.StatusOK, Status{Enabled: true, Model: h.model})
}

// ChatRequest is the body of a chat request.
type ChatRequest struct {
	Messages []Turn       `json:"messages"`
	Context  *PageContext `json:"context,omitempty"`
}

func clip(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

func (h *Handler) chat(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "Ember is not configured on this server")
		return
	}
	var req ChatRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "body must be JSON: {messages: [{role, content}]}")
		return
	}
	if err := h.svc.Validate(req.Messages); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if ok, wait := h.limiter.Allow(ClientIP(r)); !ok {
		mins := int(math.Ceil(wait.Minutes()))
		w.Header().Set("Retry-After", fmt.Sprint(int(math.Ceil(wait.Seconds()))))
		httpx.Error(w, http.StatusTooManyRequests,
			fmt.Sprintf("Ember needs to cool down: you've asked a lot of questions. Try again in %d minute%s.", mins, plural(mins)))
		return
	}
	if c := req.Context; c != nil {
		c.Area, c.Name, c.From, c.To = clip(c.Area, 4000), clip(c.Name, 80), clip(c.From, 7), clip(c.To, 7)
	}

	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Now().Add(AnswerTimeout + 10*time.Second))
	ctx, cancel := context.WithTimeout(r.Context(), AnswerTimeout)
	defer cancel()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	_ = rc.Flush()

	emit := func(e Event) {
		b, err := json.Marshal(e)
		if err != nil {
			return
		}
		_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", e.Type, b)
		_ = rc.Flush()
	}
	if err := h.svc.Answer(ctx, req.Messages, req.Context, emit); err != nil {
		msg := "could not answer"
		if errors.Is(err, ErrInvalid) {
			msg = err.Error()
		}
		emit(Event{Type: "error", Error: msg})
	}
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}
