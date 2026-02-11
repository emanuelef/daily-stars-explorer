# AGENTS.md

Instructions for AI coding agents working on this repository.

## Project

**Daily Stars Explorer** — a full-stack web application that visualizes the complete daily star history for any GitHub repository, along with correlated activity data (commits, PRs, issues, forks, contributors) and social media mentions (HackerNews, Reddit, YouTube, ShowHN).

- **Backend**: Go 1.26, Fiber v2, OpenTelemetry, in-memory caching
- **Frontend**: React 19, TypeScript, Vite 7, MUI v7, Highcharts, Plotly
- **Real-time**: SSE (Server-Sent Events) for live progress updates during long GitHub API fetches
- **Infra**: Docker multi-stage build, GitHub Actions CI/CD, GitHub Pages

## Build & Test

```bash
# Backend
go build ./...
go test ./...

# Frontend
cd website && npm install && npm run build
cd website && npm run lint   # strict: max-warnings 0

# Full stack
docker compose up --build
```

## Architecture

### Backend

The backend uses a **modular handler pattern**. Each HTTP handler is a factory function:

```go
func MyHandler(cache *cache.Cache[string, T], ...) fiber.Handler {
    return func(c *fiber.Ctx) error {
        // handler logic
    }
}
```

Key structures (defined in `routes/routes.go`):
- `routes.Caches` — groups all in-memory cache instances
- `routes.OnGoingMaps` — tracks in-progress fetch operations to prevent duplicates

Request flow: `main.go` (init) → `routes/routes.go` (registration) → `handlers/*.go` (logic)

### Frontend

- React Context for state (`ThemeContext`, `RepoContext`)
- React Router v7 with URL params (`/:user/:repository`)
- SSE connection to `/sse` for real-time progress during long API fetches
- Base path: `/daily-stars-explorer/`

## Adding Features

### New backend endpoint
1. Create handler in `handlers/<feature>.go` using the factory pattern
2. Register route in `routes/routes.go` inside appropriate `Register*Routes()` function
3. If new dependencies needed, add to `Caches`/`OnGoingMaps` structs and wire in `main.go`

### New frontend page
1. Create component in `website/src/` (use `.tsx`)
2. Add route in `website/src/App.tsx`

## Rules

- Use `SelectBestClient()` from `handlers/client_selector.go` for all GitHub API calls
- Always check/set `onGoingMaps` before starting long fetch operations
- Error responses: `c.Status(code).JSON(fiber.Map{"error": msg})`
- Tests use testify assertions, live next to source as `*_test.go`
- Frontend ESLint must pass with zero warnings
- Never commit `.env` files or tokens
- Prefer `.tsx` for new frontend files (`.jsx` is legacy)

## Environment

Requires `.env` with at minimum `PAT` (GitHub Personal Access Token). See `.env.example`.
