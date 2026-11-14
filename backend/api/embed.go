// Package api embeds the OpenAPI document of the HTTP API.
package api

import _ "embed"

// OpenAPI is the OpenAPI 3.1 document.
//
//go:embed openapi.yaml
var OpenAPI []byte
