// Package assistant is Ember, the fire analyst: a language model that answers
// questions about the data by calling the app's own services as tools.
//
// The model sits behind the LLM port, so the provider is an adapter (see
// internal/openai) and the loop, tools and HTTP handler know nothing about it.
package assistant

import (
	"context"
	"encoding/json"
)

// Roles of a message.
const (
	RoleUser      = "user"
	RoleAssistant = "assistant"
	RoleTool      = "tool"
)

// Message is one turn of the conversation.
type Message struct {
	Role       string
	Content    string
	ToolCalls  []ToolCall // assistant turns that call tools
	ToolCallID string     // tool turns: the call answered
}

// ToolCall is the model asking to run a tool.
type ToolCall struct {
	ID   string
	Name string
	Args json.RawMessage
}

// ToolSpec describes a tool to the model. Parameters is a JSON schema.
type ToolSpec struct {
	Name        string
	Description string
	Parameters  json.RawMessage
}

// Request is what the model is given on every step.
type Request struct {
	System   string
	Messages []Message
	Tools    []ToolSpec
}

// Reply is a complete model turn: text, tool calls, or both.
type Reply struct {
	Content   string
	ToolCalls []ToolCall
}

// LLM is the port to a language model that can call tools. Stream calls
// onText with every piece of text as it arrives and returns the whole turn.
type LLM interface {
	Stream(ctx context.Context, req Request, onText func(string)) (Reply, error)
}
