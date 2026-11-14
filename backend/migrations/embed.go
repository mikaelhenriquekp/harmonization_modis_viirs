// Package migrations embeds the SQL migration files into the binary.
package migrations

import "embed"

// FS contains all *.sql migrations, applied automatically on startup.
//
//go:embed *.sql
var FS embed.FS
