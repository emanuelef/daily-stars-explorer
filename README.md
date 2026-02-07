# Daily Stars Explorer

> Uncover the complete star history of any GitHub repository - beyond the 40K limit.

<img width="1509" height="826" alt="Screenshot 2026-02-01 at 09 19 23" src="https://github.com/user-attachments/assets/444f9f03-dc7f-433a-9502-f80c8181d9ce" />

---

## Why This Exists

GitHub's REST API limits star history to 40,000 stars per repository. For popular projects, that's frustrating.

**But there's more to stars than just a number.**

- A high star count doesn't guarantee quality
- Hidden gems often have low counts
- Popular repos can fizzle out over time
- **A growing or stable trend matters more than total count**

This tool helps you see the complete picture - daily trends, cumulative growth, and the real trajectory of any repository.

> Learn more about [what drives daily stars](./website/src/info.md#factors-contributing-to-daily-stars)

---

## Try It Now

**Hosted version:** [emanuelef.github.io/daily-stars-explorer](https://emanuelef.github.io/daily-stars-explorer/#/helm/helm)

**Mobile-friendly version:** [emanuelef.github.io/daily-stars-mobile](https://emanuelef.github.io/daily-stars-mobile)

---

## Features

| Feature | Description |
|---------|-------------|
| **Full Star History** | Access complete star history for any repository - daily counts and cumulative graphs |
| **Export Data** | Download star history as CSV or JSON with daily and cumulative counts |
| **Smart Caching** | Data cached for 7 days with option to refresh to current day |
| **Compare Repos** | Side-by-side comparison of multiple repositories |
| **Trends & Aggregates** | See [aggregate.md](./aggregate.md) for trend calculations |

---

## Run It Yourself

### Requirements

- Docker (for containerized setup) or Go (for local development)
- GitHub [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) (PAT)

> The PAT only needs access to public repos - no private access required.

### Option 1: Docker (Recommended)

```bash
# Create .env file (see .env.example)
cp .env.example .env
# Edit .env and add your PAT

# Run the container
docker run --rm --name daily-stars-explorer \
  --env-file .env \
  -p 8080:8080 \
  ghcr.io/emanuelef/daily-stars-explorer:latest
```

Open [localhost:8080](http://localhost:8080)

> **Tip:** If you see errors loading `/assets`, hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)

### Option 2: Local Development

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

### Single Repository View
https://github.com/emanuelef/daily-stars-explorer/assets/48717/f5e96d63-3807-43fb-9838-3de56355124e

**Example:** [kubernetes/kubernetes](https://emanuelef.github.io/daily-stars-explorer/#/kubernetes/kubernetes)

### Compare Mode
https://github.com/emanuelef/daily-stars-explorer/assets/48717/9b14f989-ffc2-4b54-a17c-03284f0327f5

**Try it:** [Compare repositories](https://emanuelef.github.io/daily-stars-explorer/#/compare)

---

## Limitations

| Limitation | Details |
|------------|---------|
| **Fetch Time** | Large repos take longer. Kubernetes (~100K stars) takes ~3 minutes. The GraphQL API doesn't support parallel requests, so we fetch from both ends simultaneously. |
| **Rate Limits** | 500,000 stars/hour per PAT. If exceeded, wait for hourly refresh. Future: bring-your-own-PAT support. |
| **Error Handling** | Currently minimal. Improvements planned for rate limit warnings. |

---

## Articles

- [How to get full history of GitHub stars](https://medium.com/@emafuma/how-to-get-full-history-of-github-stars-f03cc93183a7)
- [Building a Cost-Free, Always-On Personal Project Stack](https://medium.com/@emafuma/building-a-cost-free-always-on-personal-project-stack-3eaa02ac16b6)
- [Introducing My GitHub Stars History Project](https://www.reddit.com/r/github/comments/17e31ab/introducing_my_github_stars_history_project/)
- [GitHub Daily Stars Explorer: New Features](https://medium.com/@emafuma/github-daily-stars-explorer-new-features-and-user-requested-improvements-f2805ac98cfd)

---

## Contributing

Contributions welcome! Feel free to [open an issue](https://github.com/emanuelef/daily-stars-explorer/issues) or create a pull request.
