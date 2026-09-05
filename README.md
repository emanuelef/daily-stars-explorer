# Daily Stars Explorer

**Explore the full history of any GitHub repository.**

<p align="center">
  <img alt="Daily Stars Explorer Screenshot"" src="https://github.com/user-attachments/assets/f99a0e66-e5ec-4e2c-a9d8-206def211fe4" />
</p>

<p align="center">
  <a href="https://emanuelef.github.io/daily-stars-explorer/#/helm/helm"><strong>Try the Live Demo →</strong></a>
</p>

---

## About

A tool to explore the **complete history** of any GitHub repository. Not just stars, but commits, forks, PRs, issues, and contributors over time.

Exact daily star counts used to be the hard part — reconstructing them meant paging through every stargazer, so most tools sampled and drew a near-straight line for large repos. [GitHub's star history endpoint](#-star-history-and-the-2026-api-changes) made that cheap for everyone in September 2026, which is a good thing.

So the point of this tool isn't the star curve on its own — it's the **context around it**: what the repo was actually doing at the time (commits, PRs, issues, contributors), what was said about it on HN, Reddit and YouTube when a spike happened, how two repos compare side by side, and the aggregations that turn a noisy daily series into a trend.

---

## ✨ Features at a Glance

| Feature | What it does |
|---------|-------------|
| 📈 **Full Star History** | Complete daily star counts for any repo |
| ⏰ **Hourly Stars** | ⚠️ Unavailable — see [Star history and the 2026 API changes](#-star-history-and-the-2026-api-changes) |
| 🔀 **Compare Repos** | Side-by-side comparison of any two repositories |
| 📊 **Activity Timelines** | Commits, PRs, Issues, Forks, Contributors over time |
| 📌 **Pin Favorites** | Bookmark repos for quick access without retyping |
| 📰 **Feed Mentions** | See when repos were mentioned on HN, Reddit, YouTube, GitHub |
| 💾 **Export Data** | Download as CSV or JSON |
| 🌙 **Dark Mode** | Easy on the eyes |

---

## 🎯 Why Use This?

**Stars are a bit controversial, but clearly valued.** Many repos show them prominently and even ask for them.

They don't always correlate with quality though. Plenty of great tools stay small, while others blow up due to timing, distribution, or hitting the right audience.

See [Factors contributing to daily stars](https://github.com/emanuelef/daily-stars-explorer/blob/main/website/src/info.md#factors-contributing-to-daily-stars) for an explanation of why some repos get high numbers of stars.

Still, getting stars feels good and can be motivating. Feedback and engagement matter even more.

This tool shows you the trajectory so you can make informed decisions about which libraries to use, which projects to contribute to, and which ones to watch.

---

## 🖥️ Live Demo

**[emanuelef.github.io/daily-stars-explorer](https://emanuelef.github.io/daily-stars-explorer/#/helm/helm)**

No signup. No cookies. No ads. Just paste a repo and explore.

---

## 📸 Screenshots

### Star History with Feed Mentions
See exactly when a repo went viral and why.

https://github.com/emanuelef/daily-stars-explorer/assets/48717/f5e96d63-3807-43fb-9838-3de56355124e

### Compare Mode

https://github.com/emanuelef/daily-stars-explorer/assets/48717/9b14f989-ffc2-4b54-a17c-03284f0327f5

## Hourly Mode (retired)

> Kept for the record. Hourly resolution needed per-stargazer timestamps, which GitHub no longer exposes —
> see [Star history and the 2026 API changes](#-star-history-and-the-2026-api-changes).

<img width="1507" height="732" alt="Screenshot 2026-02-07 at 16 55 57" src="https://github.com/user-attachments/assets/ab33f614-8bdf-46b7-8154-8d1058eb0b5f" />

## Mobile (limited functionalities)

<img width="400" alt="screencapture-emanuelef-github-io-daily-stars-explorer-2026-02-07-16_57_12" src="https://github.com/user-attachments/assets/f4b6119d-fd5e-42d1-a0ae-0d54a3200132" />

---

## 🚀 Run locally or self-host using Docker image

If you want to run locally or self-host you can use the docker image available in ghcr.

**Requirements:**

- Docker
- GitHub account to generate a Personal Access Token (PAT) to call GH APIs
- A `.env` file (refer to `.env.example`)

> **Note:** Only PAT is required. The other environment variables are needed if you want to visualize feeds from different providers (HN, Reddit, YouTube).
> 
> PAT can be generated with no access to any of your repos—it's just needed to call GitHub's public APIs. Get one at [github.com/settings/tokens](https://github.com/settings/tokens)

### Docker

```bash
# 1. Create .env with your GitHub PAT
echo "PAT=your_github_token" > .env

# 2. Run
docker run --rm --env-file .env -p 8080:8080 ghcr.io/emanuelef/daily-stars-explorer:latest
```

Open `localhost:8080`. Done.

> **Note:** Since the move to the [star history endpoint](#-star-history-and-the-2026-api-changes), star charts
> work **without a PAT** — a full history costs ~1–33 requests and unauthenticated REST allows 60/hour. A PAT
> raises that to 5,000/hour and is still required for the other timelines (commits, PRs, issues, forks,
> contributors), which use the GraphQL API.

### Local Development

```bash
# Backend
cp .env.example .env && go run main.go

# Frontend (separate terminal)
cd website && npm install && npm start
```

---

## 📖 How It Works

1. **Enter any GitHub repo** (e.g., `kubernetes/kubernetes`)
2. **Wait for the fetch** — usually a second or two, even for 100K+ star repos
3. **Explore the data** with interactive charts, filters, and exports
4. **Data is cached** for 7 days with option to refresh

---

## 🛰️ Star history and the 2026 API changes

In mid-2026 GitHub [restricted access to the stargazer listing endpoints](https://github.blog/changelog/2026-06-30-upcoming-access-restrictions-to-public-api-endpoints-and-ui-views/)
to repository admins and collaborators, to protect user privacy. The restriction covered the GraphQL
`Repository.stargazers` connection too, which is what this tool walked to reconstruct daily history — so star
charts stopped working for repositories you don't own ([#363](https://github.com/emanuelef/daily-stars-explorer/issues/363)).

On **September 4, 2026** GitHub shipped a purpose-built replacement:
[**New API endpoint provides privacy-safe star history data**](https://github.blog/changelog/2026-09-04-new-api-endpoint-provides-privacy-safe-star-history-data/)
([REST docs](https://docs.github.com/en/rest/activity/starring#get-repository-star-history)).

```
GET /repos/{owner}/{repo}/stargazers/history
```

It returns star counts aggregated into weekly buckets with per-day breakdowns, and never exposes who starred
anything. Daily Stars Explorer now builds its charts entirely from this endpoint.

**Why this is a big improvement.** The old approach paged through stargazers 100 at a time, so cost scaled with
the *number of stars*. The new one returns 30 weeks per request, so cost scales with the *age of the repo*:

| Repository | Stars | Old: ~requests | New: requests | Measured time |
|---|---|---|---|---|
| `gofiber/fiber` | 40K | ~400 | 13 | ~1.3s |
| `kubernetes/kubernetes` | 126K | ~1,260 | 23 | ~1.4s |

Every repository on GitHub fits in **at most ~33 requests**, so the first fetch went from minutes to seconds.

**What this changed for the tool:**

- ⚡ Fetches are seconds instead of minutes, so the progress bar rarely appears.
- 🔓 Star history now works **without a PAT** (60 requests/hour is plenty at ~1–33 requests per repo).
- 📅 Data is **daily**, which is all the main chart ever displayed.
- ⚠️ **Hourly stars are gone.** Reconstructing hour-by-hour activity needed individual `starredAt`
  timestamps, and the aggregate endpoint's finest granularity is one day. There is no API that can restore it.
- ℹ️ Totals come from GitHub's aggregate, which can differ from the headline `stargazers_count` by a star or
  two (deleted or suspended accounts).

---

## 📊 Aggregates and Trends

The tool offers various ways to aggregate and analyze star data beyond simple daily counts.

See [aggregate.md](https://github.com/emanuelef/daily-stars-explorer/blob/main/aggregate.md) for a detailed explanation of:
- Available aggregation methods (moving averages, LOESS smoothing, derivatives, etc.)
- How trends are calculated and predicted
- Use cases for different visualization modes

---

## ⚠️ Limitations

| What | Details |
|------|---------|
| **Initial fetch time** | A second or two, even for repos with 100K+ stars — the [star history endpoint](#-star-history-and-the-2026-api-changes) returns 30 weeks per request. |
| **Cached data** | Once a repo is fully fetched, it's cached for 7 days. Subsequent visits only fetch the delta (new stars since last update). |
| **No hourly stars** | The aggregate endpoint's finest granularity is one day, and per-stargazer timestamps are no longer available. |
| **Star totals** | Reconstructed from GitHub's aggregate, which can differ from `stargazers_count` by a star or two (deleted or suspended accounts). |
| **Other timelines** | Commits, PRs, issues, forks and contributors still use the GraphQL API and still need a PAT. |

---

## 🚧 Known Issues & Areas for Improvement

**Limited Error Handling**

Currently, the project has limited error handling. I plan to improve this aspect, which includes implementing warnings to alert users when the rate limit might hinder the completion of the star retrieval.

**UI and Code Quality**

I'm aware that the user interface and code quality have room for improvement. Your feedback and suggestions are welcome as I continue to refine these aspects.

---

## 📚 Learn More

- [How to get full history of GitHub stars](https://medium.com/@emafuma/how-to-get-full-history-of-github-stars-f03cc93183a7)
- [Building a Cost-Free, Always-On Personal Project Stack](https://medium.com/@emafuma/building-a-cost-free-always-on-personal-project-stack-3eaa02ac16b6)

---

## 🤝 Contributing

PRs welcome! [Open an issue](https://github.com/emanuelef/daily-stars-explorer/issues) or submit a pull request.
