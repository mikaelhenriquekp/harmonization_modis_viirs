package assistant

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Limiter is a token bucket per client: Burst questions at once, refilled at
// PerHour questions an hour. It keeps the public site from spending the
// model's budget.
type Limiter struct {
	PerHour float64
	Burst   float64
	now     func() time.Time
	mu      sync.Mutex
	buckets map[string]*bucket
}

type bucket struct {
	tokens float64
	at     time.Time
}

// NewLimiter builds a Limiter; perHour <= 0 disables it.
func NewLimiter(perHour, burst int, now func() time.Time) *Limiter {
	if now == nil {
		now = time.Now
	}
	return &Limiter{PerHour: float64(perHour), Burst: float64(max(burst, 1)), now: now, buckets: map[string]*bucket{}}
}

// Allow takes a token for key; when there is none it says how long to wait.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	if l == nil || l.PerHour <= 0 {
		return true, 0
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if len(l.buckets) > 10000 {
		for k, b := range l.buckets {
			if now.Sub(b.at) > time.Hour {
				delete(l.buckets, k)
			}
		}
	}
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.Burst, at: now}
		l.buckets[key] = b
	}
	b.tokens = min(l.Burst, b.tokens+now.Sub(b.at).Hours()*l.PerHour)
	b.at = now
	if b.tokens < 1 {
		wait := time.Duration((1 - b.tokens) / l.PerHour * float64(time.Hour))
		return false, wait
	}
	b.tokens--
	return true, 0
}

// ClientIP is the client's address: Caddy puts it first in X-Forwarded-For.
func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		first, _, _ := strings.Cut(xff, ",")
		if ip := strings.TrimSpace(first); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
