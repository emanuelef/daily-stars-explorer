# Copilot Instructions

## Project

Daily Stars Explorer — full-stack app (Go + React) that visualizes GitHub repository star history with daily/hourly granularity, correlated activity data, and social media mentions.

## Backend (Go)

- **Framework**: Fiber v2 with OpenTelemetry observability
- **Architecture**: Modular handler pattern — each handler is a factory function returning `fiber.Handler`
- **Dependencies injected** via `routes.Caches` and `routes.OnGoingMaps` structs
- **Caching**: In-memory with `go-generics-cache`, 7-day TTL
- **Real-time**: SSE (Server-Sent Events) via `session/session.go` for live progress updates to frontend
- **GitHub API**: Dual PAT support with `ClientSelector` for rate-limit-aware rotation
- **Testing**: testify assertions, `*_test.go` files alongside source

### Handler pattern

```go
func MyHandler(cache *cache.Cache[string, MyType]) fiber.Handler {
    return func(c *fiber.Ctx) error {
        // logic
    }
}
```

### New endpoint checklist

1. Handler in `handlers/<feature>.go`
2. Route in `routes/routes.go` → `Register*Routes()`
3. Wire dependencies in `main.go` if new caches/maps needed

## Frontend (React + TypeScript)

- **Stack**: React 19, Vite 7, MUI v7, Highcharts, Plotly
- **State**: React Context (`ThemeContext`, `RepoContext`) — no Redux
- **Routing**: React Router v7 with `/:user/:repository` params
- **Lint**: ESLint strict (`--max-warnings 0`)
- **Base path**: `/daily-stars-explorer/`
- Prefer `.tsx` for new files; existing `.jsx` is legacy

## Commands

```bash
go test ./...                    # Backend tests
go build ./...                   # Backend build
cd website && npm run build      # Frontend build
cd website && npm run lint       # Frontend lint
```

## Key rules

- Never commit `.env` or tokens
- Check `onGoingMaps` before starting long GitHub API operations
- Use `SelectBestClient()` for GitHub API calls (handles PAT rotation)
- Frontend SSE at `/sse` for progress during long fetches
