# Daily Stars Explorer

> See the real story behind any GitHub repository: stars, commits, forks, PRs, issues, and more.

<img width="1509" height="826" alt="Screenshot 2026-02-01 at 09 19 23" src="https://github.com/user-attachments/assets/444f9f03-dc7f-433a-9502-f80c8181d9ce" />

---

## Don't Be Blinded by Stars

A high star count doesn't guarantee quality. Hidden gems often have low counts. Popular repos can fizzle out.

**What actually matters:**
- Is the project growing or declining?
- When did it peak? Is it still active?
- How does it compare to alternatives?

This tool shows you the complete timeline so you can make informed decisions about which projects to use, contribute to, or watch.

> Learn more about [what drives daily stars](./website/src/info.md#factors-contributing-to-daily-stars)

---

## Try It Now

**[Launch Daily Stars Explorer](https://emanuelef.github.io/daily-stars-explorer/#/helm/helm)** | [Mobile Version](https://emanuelef.github.io/daily-stars-mobile)

---

## What You Can Do

### Multiple Timelines
Not just stars. Explore **commits**, **forks**, **pull requests**, **issues**, and **contributors** over time. See the full picture of a project's health and momentum.

### Compare Repositories
Put projects side-by-side. Which one is trending up? Which peaked years ago? Make data-driven choices.

### Track Your Favorites
Pin repositories you care about. Build a personal dashboard of projects to watch.

### Stay Informed with Feeds
See what's trending across GitHub, Hacker News, and other sources. Discover projects before they blow up.

### Export Your Data
Download complete history as CSV or JSON. Daily and cumulative counts for every day since creation.

### Full Star History
While GitHub's API limits you to 40K stars, this tool fetches the complete history for any repository, no matter how popular.

---

## Run It Yourself

### Requirements

- Docker (recommended) or Go + Node.js
- GitHub [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) (PAT). Only needs public repo access.

### Docker

```bash
cp .env.example .env   # Add your PAT

docker run --rm --name daily-stars-explorer \
  --env-file .env \
  -p 8080:8080 \
  ghcr.io/emanuelef/daily-stars-explorer:latest
```

Open [localhost:8080](http://localhost:8080)

> **Tip:** If assets don't load, hard refresh (Ctrl+Shift+R / Cmd+Shift+R)

### Local Development

**Backend**
```bash
cp .env.example .env && go run main.go   # Port 8080
```

**Frontend**
```bash
cd website && npm install && npm start
```

---

## See It In Action

[Watch the demo](https://www.loom.com/share/b1728c0305e74a8ebf1e23c419c84549?sid=3bdcbbf6-d205-4157-bed5-825d4ba5f5e3)

### Single Repository
https://github.com/emanuelef/daily-stars-explorer/assets/48717/f5e96d63-3807-43fb-9838-3de56355124e

**Try:** [kubernetes/kubernetes](https://emanuelef.github.io/daily-stars-explorer/#/kubernetes/kubernetes)

### Compare Mode
https://github.com/emanuelef/daily-stars-explorer/assets/48717/9b14f989-ffc2-4b54-a17c-03284f0327f5

**Try:** [Compare repositories](https://emanuelef.github.io/daily-stars-explorer/#/compare)

---

## Limitations

| Limitation | Details |
|------------|---------|
| **Fetch Time** | Large repos take longer (~3 min for Kubernetes). We fetch from both ends simultaneously to speed things up. |
| **Rate Limits** | 500K stars/hour per PAT. Future: bring-your-own-PAT support. |

---

## Read More

- [How to get full history of GitHub stars](https://medium.com/@emafuma/how-to-get-full-history-of-github-stars-f03cc93183a7)
- [Building a Cost-Free, Always-On Personal Project Stack](https://medium.com/@emafuma/building-a-cost-free-always-on-personal-project-stack-3eaa02ac16b6)
- [Introducing My GitHub Stars History Project](https://www.reddit.com/r/github/comments/17e31ab/introducing_my_github_stars_history_project/)
- [GitHub Daily Stars Explorer: New Features](https://medium.com/@emafuma/github-daily-stars-explorer-new-features-and-user-requested-improvements-f2805ac98cfd)

---

## Contributing

Found this useful? Give it a star! Contributions welcome. [Open an issue](https://github.com/emanuelef/daily-stars-explorer/issues) or submit a PR.
