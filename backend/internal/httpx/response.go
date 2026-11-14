// Package httpx contains small HTTP helpers shared by handlers.
package httpx

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// ErrorResponse is the standard error body returned by the API.
type ErrorResponse struct {
	Error string `json:"error"`
}

// JSON writes v as a JSON response with the given status code.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("encode json response", "error", err)
	}
}

// Error writes a standard JSON error response.
func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, ErrorResponse{Error: msg})
}
