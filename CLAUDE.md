# CLAUDE.md

This file provides context for AI assistants working on this codebase.

## Project Overview

**Daily Stars Explorer** — a full-stack web app that visualizes the complete daily star history for any GitHub repository, along with correlated activity (commits, PRs, issues, forks, contributors) and news mentions (HackerNews, Reddit, YouTube, ShowHN).

Live: https://emanuelef.github.io/daily-stars-explorer

## Tech Stack

| Layer     | Technology                                                    |
| --------- | ------------------------------------------------------------- |
| Backend   | Go 1.26, Fiber v2, OpenTelemetry, go-generics-cache          |
| Frontend  | React 19, TypeScript, Vite 7, MUI v7, Highcharts, Plotly     |
| Real-time | SSE (Server-Sent Events) for live progress during long fetches|
| Infra     | Docker (multi-stage), GitHub Actions, GitHub Pages, GHCR      |
| Testing   | Go: testify + stdlib / Frontend: ESLint (no test runner yet)  |

## Quick Reference Commands

```bash
# Backend
go build ./...                          # Build
go test ./...                           # Run all Go tests
go run main.go                          # Start server (needs .env)

# Frontend
cd website && npm install               # Install deps
cd website && npm run build             # Production build
cd website && npm run dev               # Dev server
cd website && npm run lint              # ESLint (strict: max-warnings 0)

# Docker
docker compose up --build               # Full stack locally
```

## Architecture

The backend follows a **modular handler pattern** extracted from a previous monolithic `main.go`. See `REFACTORING.md` for full context.

### How a request flows

```
main.go (init + middleware) → routes/routes.go (registration) → handlers/*.go (business logic)
```

### Handler pattern

Every handler is a **factory function** that accepts dependencies and returns `fiber.Handler`:

```go
func MyHandler(cache *cache.Cache[string, MyType], ...) fiber.Handler {
    return func(c *fiber.Ctx) error {
        // handler logic
    }
}
```

### Dependency injection

Dependencies are grouped into two structs defined in `routes/routes.go`:

- **`routes.Caches`** — all in-memory cache instances (stars, issues, forks, news, etc.)
- **`routes.OnGoingMaps`** — `map[string]bool` tracking in-progress fetches to prevent duplicates

These are initialized in `main.go` and passed through `routes.Register*()` functions.

### Key directories

```
handlers/          → HTTP handlers grouped by feature (stars, news, cache, etc.)
routes/            → Centralized route registration with DI
types/             → Request/response structs
news/              → External feed integrations (HN, Reddit, YouTube, ShowHN)
cache/             → In-memory cache wrapper
session/           → SSE session management
config/            → Constants (e.g., DayCached = 7)
utils/             → Helpers (PAT client creation, env vars)
otel_instrumentation/ → OpenTelemetry setup
website/           → React frontend (separate build)
```

## Adding a New Endpoint

1. Create handler in `handlers/<feature>.go` using the factory pattern above
2. Add route in `routes/routes.go` inside the appropriate `Register*Routes()` function
3. If new dependencies are needed, add them to `Caches` or `OnGoingMaps` structs and wire in `main.go`

## Adding a New Frontend Page

1. Create component in `website/src/`
2. Add route in `website/src/App.tsx` using React Router
3. Frontend is served as static files from `website/dist/` — base path is `/daily-stars-explorer/`

## Environment

Requires a `.env` file (see `.env.example`). The only **required** variable is:
- `PAT` — GitHub Personal Access Token

Optional: `PAT2` (second GitHub token for parallel queries), Reddit credentials, YouTube API key.

**Never commit `.env` files or tokens.**

## Testing Conventions

- Go tests use **testify** for assertions
- Test files live next to the code they test (`*_test.go`)
- Tests use table-driven patterns where appropriate
- Reset global state in tests (e.g., `globalClientSelector = NewClientSelector()`)
- Run `go test ./...` — all tests should pass before committing

## Code Style

### Go
- Follow standard Go conventions (gofmt, golangci-lint)
- Handlers return `fiber.Handler` (factory pattern, not direct funcs)
- Use `log.Printf` for logging (no structured logger yet)
- Error handling: return `c.Status(code).JSON(fiber.Map{"error": msg})` in handlers
- Cache TTL: 7 days (`config.DayCached`)

### TypeScript/React
- ESLint strict mode: zero warnings allowed (`--max-warnings 0`)
- MUI v7 for UI components
- Highcharts for time series, Plotly for interactive charts
- `date-fns` for date formatting (not moment.js)
- PapaParse for CSV operations

## CI/CD

- **golangci-lint** runs on all PRs (Go files only, excludes tests)
- **publish-website** deploys frontend to GitHub Pages on website/ changes
- **ghcr-build-push** builds multi-arch Docker image on backend changes
- **Dependabot** handles weekly dependency updates (Go, npm, Docker, Actions)

## Common Pitfalls

- The GitHub API has aggressive rate limits (5000 req/hr per PAT). The `ClientSelector` in `handlers/client_selector.go` manages dual-PAT rotation — respect this pattern when adding new API calls.
- `onGoingMaps` prevent duplicate concurrent fetches for the same repo. Always check/set these before starting long operations and clean up after.
- Frontend `base` path is `/daily-stars-explorer/` (configured in `vite.config.ts`). Static assets are served from this path.
- SSE connections are tracked via `session.SessionsLock` — used for real-time progress updates to the frontend during long fetches.
