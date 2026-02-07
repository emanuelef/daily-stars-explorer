# Daily Stars Explorer

**Explore the full history of any GitHub repository.**

<p align="center">
  <img width="800" alt="Daily Stars Explorer Screenshot" src="https://github.com/user-attachments/assets/444f9f03-dc7f-433a-9502-f80c8181d9ce" />
</p>

<p align="center">
  <a href="https://emanuelef.github.io/daily-stars-explorer/#/helm/helm"><strong>Try the Live Demo →</strong></a>
</p>

---

## About

A tool to explore the **complete history** of any GitHub repository. Not just stars, but commits, forks, PRs, issues, and contributors over time.

Unlike other star history tools that show a straight line from 40K to the current count, this one shows the actual daily data for repos with 40K+ stars.

---

## ✨ Features at a Glance

| Feature | What it does |
|---------|-------------|
| 📈 **Full Star History** | Complete daily star counts for any repo |
| ⏰ **Hourly Stars** | Hour-by-hour activity with timezone support |
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

No signup. No installation. No cookies. No ads. Just paste a repo and explore.

---

## 📸 Screenshots

### Star History with Feed Mentions
See exactly when a repo went viral and why.

https://github.com/emanuelef/daily-stars-explorer/assets/48717/f5e96d63-3807-43fb-9838-3de56355124e

### Compare Mode

https://github.com/emanuelef/daily-stars-explorer/assets/48717/9b14f989-ffc2-4b54-a17c-03284f0327f5

---

## 🚀 Run locally or self-host using Docker image

If you want to run locally or self-host you can use the docker image available in ghcr.

**Requirements:**

- Docker
- GitHub account to generate a Personal Access Token (PAT) to call GH APIs
- A `.env` file (refer to `.env.example`)

> **Note:** Only PAT is required. The other environment variables are needed if you want to visualize feeds from different providers (HN, Reddit, YouTube).
> 
> PAT can be generated with no access to any of your repos—it's just needed to call GraphQL APIs on public repositories. Get one at [github.com/settings/tokens](https://github.com/settings/tokens)

### Docker

```bash
# 1. Create .env with your GitHub PAT
echo "PAT=your_github_token" > .env

# 2. Run
docker run --rm --env-file .env -p 8080:8080 ghcr.io/emanuelef/daily-stars-explorer:latest
```

Open `localhost:8080`. Done.

> **Note:** Without a PAT, GitHub's GraphQL API won't work and the REST API is limited to 60 requests/hour (essentially unusable for this tool). With a PAT you get 5,000 requests/hour.

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
2. **Wait for the fetch** (large repos take ~3 min, we fetch from both ends simultaneously)
3. **Explore the data** with interactive charts, filters, and exports
4. **Data is cached** for 7 days with option to refresh

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
| **Initial fetch time** | Large repos (100K+ stars) take ~3 minutes for the first fetch. The tool fetches star history from both ends simultaneously to speed things up. |
| **Cached data** | Once a repo is fully fetched, it's cached for 7 days. Subsequent visits only fetch the delta (new stars since last update), which takes just seconds. |
| **Rate limits** | With a GitHub PAT, you can fetch ~500K stars per hour. Without a PAT, you're limited to 60 requests/hour (not practical for this tool). |

---

## 📚 Learn More

- [How to get full history of GitHub stars](https://medium.com/@emafuma/how-to-get-full-history-of-github-stars-f03cc93183a7)
- [Building a Cost-Free, Always-On Personal Project Stack](https://medium.com/@emafuma/building-a-cost-free-always-on-personal-project-stack-3eaa02ac16b6)

---

## 🤝 Contributing

PRs welcome! [Open an issue](https://github.com/emanuelef/daily-stars-explorer/issues) or submit a pull request.
