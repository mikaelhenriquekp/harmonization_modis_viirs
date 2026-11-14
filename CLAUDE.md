# CLAUDE.md

Production: https://paparajotelunar.com

- `backend/`: Go, chi, pgx, golang-migrate
- `frontend/`: React, Vite, TypeScript, Tailwind, shadcn/ui, lucide-react, TanStack Query
- `deploy/`: production compose and Caddyfile
- `.github/workflows/`: CI and deploy

## Commands

```bash
cd backend && docker compose up        # postgres + api on :8080, hot reload
cd frontend && npm run dev             # :5173, proxies /api to :8080

cd backend && go test -race ./... && golangci-lint run ./...
cd frontend && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
```

Ports can be changed with `API_HOST_PORT`, `DB_HOST_PORT` (default 5433) and `VITE_API_PROXY_TARGET`.

To run the frontend against production data, put `VITE_API_PROXY_TARGET=https://paparajotelunar.com` in `frontend/.env.development.local` (gitignored) and run `npm run dev`; no local backend needed.

## Backend

- One package per feature in `internal/<feature>/`, split into `handler.go`, `service.go` and `repository.go`.
- Handlers only deal with HTTP. Services hold the logic and depend on interfaces defined in their own package. Repositories only run SQL.
- Wiring is done in `cmd/api/main.go`. All routes are under `/api`.
- Config comes from env vars only.
- Table-driven tests with fakes.

Migrations live in `backend/migrations/` and run on startup. Create them with `make migrate-new name=<name>`. Don't edit a migration that's already on `main`, and always write the down migration.

## Frontend

- `src/api/`: fetch client and one module per resource
- `src/hooks/`: TanStack Query hooks
- `src/components/ui/`: shadcn components (`npx shadcn@latest add <name>`)
- `src/components/`: app components
- `src/pages/`: route components
- `src/app/`: providers and router

Components don't call `fetch` directly. Use the `@/` alias and kebab-case file names. Tests sit next to the code.

## Git

- `main` deploys to production on every push. Don't commit to it directly.
- Branch from `main` as `<type>/<description>`, e.g. `feat/user-signup`. Keep branches short-lived, rebase on `main`, open a PR and squash merge once CI passes.
- Commits and PR titles follow Conventional Commits: `<type>(<scope>): <summary>`.
  - Types: feat, fix, refactor, perf, test, docs, style, build, ci, chore, revert.
  - Scopes: backend, frontend, deploy, ci, or a feature name.
- Keep commits small, one change each.
- No AI attribution: no `Co-Authored-By: Claude` and no "Generated with Claude Code" in commits or PRs.

## Deploy

`deploy.yml` runs CI, then on the self-hosted runner writes `deploy/.env` from GitHub variables and secrets and runs `docker compose -p app -f deploy/docker-compose.prod.yml up -d --build`. Database data lives in the `app_pgdata` volume, so never run `down -v` in production.
