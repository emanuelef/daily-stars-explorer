# Daily Stars Explorer

Explore the complete daily history of any GitHub repository: stars, commits, pull requests, issues, forks, contributors, and social mentions.

<p align="center">
  <img width="800" height="826" alt="Daily Stars Explorer Screenshot" src="https://github.com/user-attachments/assets/f99a0e66-e5ec-4e2c-a9d8-206def211fe4" />
</p>

<p align="center">
  <a href="https://emanuelef.github.io/daily-stars-explorer/#/helm/helm"><strong>Try the Live Demo</strong></a>
</p>

## Why this exists

Most star-history tools show a smooth line from past to present. This project reconstructs day-by-day history, including large repositories, then correlates that history with:

- Code activity (commits, PRs, issues, forks, contributors)
- External attention (Hacker News, Reddit, YouTube, GitHub mentions)
- Hourly star deltas for short-term spikes

## Features

- Full daily stars history for public repositories
- Hourly stars view with incremental caching
- Repository comparison view
- Timeline overlays for commits/PRs/issues/forks/contributors
- SSE progress updates for long-running fetches
- Feed mentions from multiple sources
- CSV/JSON export
- In-memory caching with force refresh support

## Live demo

- https://emanuelef.github.io/daily-stars-explorer/#/helm/helm

## Quick start (Docker image)

Prerequisites:

- Docker
- A GitHub Personal Access Token in `.env` as `PAT`

Minimal run:

```bash
echo "PAT=your_github_token" > .env
docker run --rm --env-file .env -p 8080:8080 ghcr.io/emanuelef/daily-stars-explorer:latest
```

Then open `http://localhost:8080`.

Notes:

- `PAT` is required for practical usage with GitHub APIs.
- Without `PAT`, public API limits are too low for this workload.
- `PAT2` is optional and enables a second GitHub client for better throughput.

## Local development

### 1) Backend

```bash
cp .env.example .env
go run main.go
```

Server defaults:

- Host: `0.0.0.0`
- Port: `8080`

### 2) Frontend (optional, separate terminal)

```bash
cd website
npm install
npm run dev
```

### 3) Full stack with Compose

```bash
docker compose up --build
```

## Environment variables

Required:

- `PAT`: GitHub PAT used by the backend client.

Optional:

- `PAT2`: second GitHub PAT for client failover/load distribution.
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_USER_AGENT`
- `REDDIT_USERNAME`
- `REDDIT_PASSWORD`
- `YOUTUBE_API_KEY`
- `HOST` (default `0.0.0.0`)
- `PORT` (default `8080`)

See `.env.example`.

## Build and test

```bash
# Backend
go build ./...
go test ./...

# Frontend
cd website && npm install && npm run build
cd website && npm run lint
```

## API quick reference

Common endpoints:

- `GET /health` - health check.
- `GET /allStars?repo=owner/repo` - full daily stars history.
- `GET /recentStars?repo=owner/repo&lastDays=30` - recent stars.
- `GET /recentStarsByHour?repo=owner/repo&lastDays=2` - hourly stars.
- `GET /allIssues?repo=owner/repo`
- `GET /allForks?repo=owner/repo`
- `GET /allPRs?repo=owner/repo`
- `GET /allCommits?repo=owner/repo`
- `GET /allContributors?repo=owner/repo`
- `GET /allReleases?repo=owner/repo`
- `GET /hackernews?query=owner/repo&limit=10`
- `GET /reddit?query=owner/repo&limit=10&strict=true`
- `GET /youtube?query=owner/repo&limit=10`
- `GET /showhn?sort=date&min_points=0&min_comments=0`
- `GET /redditrepos?sort=date&min_points=0&min_comments=0`
- `GET /ghmentions?repo=owner/repo&limit=50`
- `GET /sse?repo=owner/repo` - SSE stream for fetch progress.

## Screenshots

Star history with feed mentions:

https://github.com/emanuelef/daily-stars-explorer/assets/48717/f5e96d63-3807-43fb-9838-3de56355124e

Compare mode:

https://github.com/emanuelef/daily-stars-explorer/assets/48717/9b14f989-ffc2-4b54-a17c-03284f0327f5

Hourly mode:

<img width="1507" height="732" alt="Hourly Mode Screenshot" src="https://github.com/user-attachments/assets/ab33f614-8bdf-46b7-8154-8d1058eb0b5f" />

Mobile:

<img width="400" alt="Mobile Screenshot" src="https://github.com/user-attachments/assets/f4b6119d-fd5e-42d1-a0ae-0d54a3200132" />

## Limitations

- First-time fetch for very large repositories can take minutes.
- Rate limits still apply even with caching.
- Feed integrations depend on third-party API/service availability.

## Additional docs

- Aggregation/trend details: [aggregate.md](aggregate.md)
- Star growth context: [website/src/info.md](website/src/info.md#factors-contributing-to-daily-stars)
- Project timeline notes: [timeline.md](timeline.md)

## Learn more

- https://medium.com/@emafuma/how-to-get-full-history-of-github-stars-f03cc93183a7
- https://medium.com/@emafuma/building-a-cost-free-always-on-personal-project-stack-3eaa02ac16b6

## Contributing

Issues and PRs are welcome.
