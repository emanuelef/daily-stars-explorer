# ⭐ Daily Stars Explorer

**The complete GitHub analytics tool you didn't know you needed.**

<p align="center">
  <img width="800" alt="Daily Stars Explorer Screenshot" src="https://github.com/user-attachments/assets/444f9f03-dc7f-433a-9502-f80c8181d9ce" />
</p>

<p align="center">
  <a href="https://emanuelef.github.io/daily-stars-explorer/#/helm/helm"><strong>Try the Live Demo →</strong></a>
</p>

---

## What is this?

A tool to explore the **complete history** of any GitHub repository. Not just stars, but commits, forks, PRs, issues, and contributors over time.

GitHub's API limits star history to 40K. This tool has no limits.

---

## ✨ Features at a Glance

| Feature | What it does |
|---------|-------------|
| 📈 **Full Star History** | Complete daily star counts for any repo, even 100K+ stars |
| ⏰ **Hourly Stars** | Hour-by-hour activity with timezone support |
| 🔀 **Compare Repos** | Side-by-side comparison of any two repositories |
| 📊 **Activity Timelines** | Commits, PRs, Issues, Forks, Contributors over time |
| 📌 **Pin Favorites** | Save repos to your personal dashboard |
| 📰 **Feed Mentions** | See when repos were mentioned on HN, Reddit, YouTube |
| 💾 **Export Data** | Download as CSV or JSON |
| 🌙 **Dark Mode** | Easy on the eyes |

---

## 🎯 Why Use This?

**Don't be blinded by star counts.**

- A repo with 50K stars might be dead
- A repo with 500 stars might be exploding
- The **trend** tells you more than the total

This tool shows you the trajectory so you can make informed decisions about which libraries to use, which projects to contribute to, and which ones to watch.

---

## 🖥️ Live Demo

**[emanuelef.github.io/daily-stars-explorer](https://emanuelef.github.io/daily-stars-explorer/#/helm/helm)**

No signup. No installation. Just paste a repo and explore.

---

## 📸 Screenshots

### Star History with Feed Mentions
See exactly when a repo went viral and why.

https://github.com/emanuelef/daily-stars-explorer/assets/48717/f5e96d63-3807-43fb-9838-3de56355124e

### Compare Mode
Which framework should you bet on?

https://github.com/emanuelef/daily-stars-explorer/assets/48717/9b14f989-ffc2-4b54-a17c-03284f0327f5

---

## 🚀 Self-Host

Want to run your own instance? Easy.

### Docker (30 seconds)

```bash
# 1. Create .env with your GitHub PAT
echo "PAT=your_github_token" > .env

# 2. Run
docker run --rm --env-file .env -p 8080:8080 ghcr.io/emanuelef/daily-stars-explorer:latest
```

Open `localhost:8080`. Done.

> **Note:** PAT only needs public repo access. Get one at [github.com/settings/tokens](https://github.com/settings/tokens)

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

## ⚠️ Limitations

| What | Details |
|------|---------|
| Fetch time | ~3 min for 100K star repos |
| Rate limit | 500K stars/hour per PAT |

---

## 📚 Learn More

- [How to get full history of GitHub stars](https://medium.com/@emafuma/how-to-get-full-history-of-github-stars-f03cc93183a7)
- [Building a Cost-Free, Always-On Personal Project Stack](https://medium.com/@emafuma/building-a-cost-free-always-on-personal-project-stack-3eaa02ac16b6)

---

## 🤝 Contributing

PRs welcome! [Open an issue](https://github.com/emanuelef/daily-stars-explorer/issues) or submit a pull request.

**If this helped you, consider giving it a ⭐**
