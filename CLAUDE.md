# CLAUDE.md

Guidance for Claude (and humans) working in this repository.

## Project

Full-stack web app deployed to **https://paparajotelunar.com**.

| Layer    | Stack                                                                                   |
| -------- | --------------------------------------------------------------------------------------- |
| Frontend | React + Vite + TypeScript, Tailwind CSS v4, shadcn/ui, lucide-react, TanStack Query, React Router |
| Backend  | Go + chi, pgx, golang-migrate (migrations embedded and applied automatically on startup) |
| Database | PostgreSQL 17                                                                           |
| Infra    | Docker Compose (dev + prod), Caddy (TLS + reverse proxy), GitHub Actions (CI + deploy on a self-hosted runner) |

```
backend/    Go API (chi). docker-compose.yml here = dev stack (db + api with air)
frontend/   React SPA (Vite)
deploy/     Production docker-compose + Caddyfile
.github/    CI (ci.yml) and deploy (deploy.yml) workflows
```

## Running locally

```bash
cd backend && docker compose up      # Postgres + API with hot reload on :8080 (migrations run on boot)
cd frontend && npm install && npm run dev   # Vite on :5173, proxies /api → localhost:8080
```

Port clashes: set `API_HOST_PORT` / `DB_HOST_PORT` for compose (DB defaults to host port 5433) and
`VITE_API_PROXY_TARGET` for Vite (see `frontend/.env.example`).

Checks (same as CI, run them before pushing):

```bash
cd backend  && go test -race ./... && golangci-lint run ./...
cd frontend && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
```

## Backend conventions

- Feature packages under `internal/<feature>/` with three layers:
  - `handler.go`: HTTP only (decode, validate, call the service, encode with `internal/httpx`). Exposes `Routes(chi.Router)`.
  - `service.go`: business logic. Depends on a `Repository` **interface declared in the same package (consumer side)**.
  - `repository.go`: SQL via pgx. No business logic.
- Wiring happens only in `cmd/api/main.go` (repo → service → handler → `server.NewRouter`).
- Every route lives under `/api` (mounted by `internal/server`).
- Config comes only from env vars (`internal/config`). Never hardcode secrets.
- Log with `log/slog`. Wrap errors with `fmt.Errorf("context: %w", err)`.
- Tests are table-driven and use fakes for the interfaces (see `internal/health/*_test.go`). Use `NewRequestWithContext` in tests.

### Migrations

- SQL files in `backend/migrations/`, named `NNNNNN_description.{up,down}.sql`. Create them with
  `make migrate-new name=create_users`.
- They're embedded in the binary and **applied automatically on startup** in dev and prod.
- Never edit a migration that has already been merged to `main`. Add a new one instead.
- Always write a working `down` migration.

## Frontend conventions

```
src/api/          HTTP layer: client.ts (fetch wrapper, ApiError) + one module per resource (health.ts)
src/hooks/        TanStack Query hooks wrapping the api modules (use-health.ts)
src/components/ui shadcn primitives. Add more with `npx shadcn@latest add <component>`; don't hand-edit unless needed
src/components/   Reusable app components (presentational, props-driven, testable)
src/pages/        Route-level components that compose hooks + components
src/app/          Providers and router
src/lib/          Utilities (cn)
```

- Components never call `fetch` directly: page → hook → api module → `client.ts`.
- Use the `@/` import alias. Files are kebab-case, components PascalCase.
- Tests live next to the code (`*.test.ts(x)`, Vitest + Testing Library).

## Git workflow

### Branches (trunk-based)

- `main` is the only long-lived branch. It's always deployable, and **every push to `main` deploys to production**.
- Never commit directly to `main`. Create a short-lived branch from an up-to-date `main`:
  `<type>/<short-kebab-description>`, e.g. `feat/user-signup`, `fix/health-timeout`, `chore/bump-deps`.
- Keep branches small and short-lived (hours to a few days). Rebase on `main` (`git pull --rebase origin main`) instead of merging `main` in.
- Open a PR to `main`. CI must be green before merging. Merge with **squash merge**. The squash commit title must itself be a valid Conventional Commit (normally the PR title).
- Delete the branch after merging.

### Commits: Conventional Commits

All commit messages **and PR titles/descriptions** follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <short imperative summary, lowercase, no trailing period>

<optional body: what and why, wrapped at ~72 chars>

<optional footer: BREAKING CHANGE: ..., Refs #123>
```

- **Types:** `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `build`, `ci`, `chore`, `revert`.
- **Scopes:** `backend`, `frontend`, `deploy`, `ci`, `docs`, or a feature name (`health`, `auth`, …).
- Subject at most 72 chars, imperative mood ("add", not "added"/"adds").
- Breaking changes: `feat(backend)!: ...` plus a `BREAKING CHANGE:` footer.
- **Small, atomic commits.** One logical change per commit, and each commit should build and pass tests. Split unrelated changes (e.g. a refactor and a feature) into separate commits.
- PR description: a short summary of what and why, and how it was tested.

### Attribution

- **Never** add Claude/AI as co-author or author. No `Co-Authored-By: Claude …` trailers and no "Generated with Claude Code" lines in commits or PRs.
- Commits are authored by the repo's configured git user (`Mikael Kruppel <mikaelhenriquekp@gmail.com>`).

## CI / Deploy

- `ci.yml` runs on every PR (and is reused by deploy): backend lint/test/build, frontend lint/format/typecheck/test/build, Docker image builds.
- `deploy.yml` runs on push to `main`: it reruns CI, then on the **self-hosted runner** (the VPS) it writes `deploy/.env` from GitHub variables/secrets and runs
  `docker compose -p app -f deploy/docker-compose.prod.yml up -d --build`, then waits for `/api/health`.
- Caddy handles HTTPS certificates automatically. Production data lives in the `app_pgdata` Docker volume. **Never** run `docker compose down -v` in prod.
