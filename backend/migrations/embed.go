// Package migrations embeds the SQL migration files into the binary.
package migrations

import "embed"

// FS contains the SQL migrations.
//
//go:embed *.sql
var FS embed.FS
