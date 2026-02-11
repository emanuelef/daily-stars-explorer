# Frontend — CLAUDE.md

React frontend for Daily Stars Explorer.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Vite dev server (default port 5173)
npm run build        # Production build → dist/
npm run lint         # ESLint, strict (max-warnings 0)
npm run debug        # Dev server on port 4000
```

## Stack

- React 19 + TypeScript, bundled with Vite 7
- MUI v7 for UI components, Emotion for CSS-in-JS
- Highcharts + Plotly for charts, d3-regression for trend lines
- React Router v7 for navigation
- PapaParse for CSV, date-fns for dates, react-toastify for notifications

## Structure

- `App.tsx` — root component, sidebar navigation, route definitions, theme/repo providers
- `MainPage.jsx` — API limits dashboard
- `TimeSeriesChart.jsx` — primary star history chart (desktop)
- `MobileStarsView.jsx` — mobile-optimized star history
- `HourlyStarsChart.jsx` — hourly granularity chart
- `CompareChart.jsx` — side-by-side repo comparison
- `*TimeSeriesChart.jsx` — activity charts (commits, PRs, issues, forks, contributors, new repos)
- `FeaturedReposPage.tsx` — social feed mentions (HN, Reddit, YouTube, ShowHN)
- `InfoPage.jsx` — app info and documentation
- `ThemeContext.tsx` — dark/light theme state
- `RepoContext.tsx` — selected repo state (persisted across pages)

## Patterns

- **State management**: React Context API (`ThemeContext`, `RepoContext`) — no Redux
- **Routing**: React Router v7 with params like `/:user/:repository`
- **Mobile**: Detected via `window.innerWidth <= 768`, renders `MobileStarsView` instead of `TimeSeriesChart`
- **SSE**: Frontend connects to `/sse` for real-time progress during long data fetches
- **Base path**: `/daily-stars-explorer/` (set in `vite.config.ts`)

## Backend API

The frontend talks to the Go backend. In dev, the Vite dev server proxies to `localhost:8080`. Key endpoints:

| Endpoint              | Purpose                        |
| --------------------- | ------------------------------ |
| `/allStars?repo=x`    | Full daily star history        |
| `/recentStarsByHour`  | Hourly star data               |
| `/allIssues?repo=x`   | Issues timeline                |
| `/allForks?repo=x`    | Forks timeline                 |
| `/allPRs?repo=x`      | PRs timeline                   |
| `/allCommits?repo=x`  | Commits timeline               |
| `/allContributors`    | Contributors timeline          |
| `/hackernews`         | HackerNews mentions            |
| `/reddit`             | Reddit mentions                |
| `/youtube`            | YouTube mentions               |
| `/showhn`             | ShowHN posts                   |
| `/sse`                | Server-Sent Events (progress)  |
| `/health`             | Health check                   |

## Style Guidelines

- ESLint strict mode — zero warnings tolerated
- Use MUI components, not raw HTML elements
- Use `date-fns` for date operations
- Prefer TypeScript (`.tsx`) for new files — existing `.jsx` files are legacy
