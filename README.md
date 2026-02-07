# Daily Stars Explorer

<img width="1509" height="826" alt="Screenshot 2026-02-01 at 09 19 23" src="https://github.com/user-attachments/assets/444f9f03-dc7f-433a-9502-f80c8181d9ce" />

## Hosted Version

A free hosted version is available at **[emanuelef.github.io/daily-stars-explorer](https://emanuelef.github.io/daily-stars-explorer/#/helm/helm)**

---

## Why This Tool?

Don't be blinded by stars! While they show popularity, they don't guarantee quality.

- Underdog libraries with amazing potential often have low counts
- Even high-starred repos can fizzle out
- A **growing or stable trend** suggests sustainable interest and community engagement

This tool shows you the complete timeline so you can make informed decisions about which projects to use, contribute to, or watch.

> Learn more about [what drives daily stars](./website/src/info.md#factors-contributing-to-daily-stars)

---

## Features

### Full Star History
Access the complete history of stars for any GitHub repository, even those with 100K+ stars (GitHub's API limits you to 40K). View stars per day and cumulative graphs to see how popularity evolved over time.

### Hourly Stars
Track star activity hour by hour. See exactly when repos get attention and spot viral moments in real time.

### Multiple Timelines
Not just stars. Explore **commits**, **forks**, **pull requests**, **issues**, and **contributors** over time to see the full picture of a project's health.

### Compare Repositories
Put projects side by side. Which one is trending up? Which peaked years ago? Make data-driven choices.

### Track Your Favorites
Pin repositories you care about. Build a personal dashboard of projects to watch.

### Feeds
See what's trending across GitHub, Hacker News, and other sources. Discover projects before they blow up.

### Export Data
Download complete history as CSV or JSON with daily and cumulative counts for every day since creation.

### Smart Caching
Data is cached for seven days. You can refresh to get the latest data up to the current day.

---

## Self-Host or Run Locally

### Using Docker

Requirements:
- Docker
- A GitHub [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) (PAT)

The PAT only needs access to public repositories. Create a `.env` file based on [.env.example](.env.example). Only `PAT` is required; other variables are for optional feed integrations.

```bash
docker run --rm --name daily-stars-explorer --env-file .env -p 8080:8080 ghcr.io/emanuelef/daily-stars-explorer:latest
```

Then access the UI at `localhost:8080`.

> **Note:** If you see errors loading `/assets`, hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R).

### Local Development

**Backend (Go)**
```bash
cp .env.example .env   # Add your PAT
go run main.go         # Runs on port 8080
```

**Frontend (React)**
```bash
cd website
npm install
npm start
```

---

## Demo

[Watch the demo video](https://www.loom.com/share/b1728c0305e74a8ebf1e23c419c84549?sid=3bdcbbf6-d205-4157-bed5-825d4ba5f5e3)

### Single Repository
https://github.com/emanuelef/daily-stars-explorer/assets/48717/f5e96d63-3807-43fb-9838-3de56355124e

[Try it: kubernetes/kubernetes](https://emanuelef.github.io/daily-stars-explorer/#/kubernetes/kubernetes)

### Compare Mode
https://github.com/emanuelef/daily-stars-explorer/assets/48717/9b14f989-ffc2-4b54-a17c-03284f0327f5

[Try it: Compare repositories](https://emanuelef.github.io/daily-stars-explorer/#/compare)

---

## Limitations

**Fetching Time:** Large repos take longer. Kubernetes (~100K stars) takes about 3 minutes. We fetch from both ends simultaneously to speed things up.

**Rate Limits:** 500K stars/hour per PAT. If exceeded, wait for the hourly refresh.

---

## Articles

- [How to get full history of GitHub stars](https://medium.com/@emafuma/how-to-get-full-history-of-github-stars-f03cc93183a7)
- [Building a Cost-Free, Always-On Personal Project Stack](https://medium.com/@emafuma/building-a-cost-free-always-on-personal-project-stack-3eaa02ac16b6)
- [Introducing My GitHub Stars History Project](https://www.reddit.com/r/github/comments/17e31ab/introducing_my_github_stars_history_project/)
- [GitHub Daily Stars Explorer: New Features](https://medium.com/@emafuma/github-daily-stars-explorer-new-features-and-user-requested-improvements-f2805ac98cfd)

---

## Contributing

Contributions welcome! Feel free to open an issue or create a pull request.

If you find this useful, consider giving it a star!
