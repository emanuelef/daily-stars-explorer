# daily-stars-explorer

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Project Limitations](#project-limitations)
- [Contributing](#contributing)

## Introduction

Do you ever wonder about the complete history of stars for GitHub repositories? GitHub's REST APIs come with certain limitations, allowing you to retrieve only up to 40,000 stars per repository. For those tracking a repository with more stars, this limitation can be quite frustrating.

Don't be blinded by stars! While they show popularity, they don't guarantee quality.  
Underdog libraries with amazing potential often have low counts.  
Remember, even high-starred repos can fizzle out - stars can decline, too!  
In my quest for code, I've found hidden gems with few stars that were perfect, while some popular choices were bloated or on the way down.  
A growing or stable star count, rather than just a total high number, suggests sustainable interest and community engagement.

In [Factors contributing to daily stars](./website/src/info.md#factors-contributing-to-daily-stars) I explain what are the reasons why some repos can get high number of stars.

## Hosted version

There's a [version hosted](https://emanuelef.github.io/daily-stars-explorer/#/helm/helm) that is using my PAT.  
A new project was created to make this more mobile friendly and can be found [here](https://emanuelef.github.io/daily-stars-mobile).


## Run locally or self-host using Docker image

If you want to run locally or self-host you can use the docker image available in `ghcr`. 

Requirements:
- Docker
- GitHub account to generate a [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) (PAT) to call GH APIs
- A `.env` file and you can refer to [.env.example](.env.example).  
  
Only `PAT` is required, the others are needed if you want to visualise the feeds from different providers.  
`PAT` can be generated with no access to any of your repos, is just needed to call GraphQL APIs on public reposistories.  

```bash
docker run --rm --name daily-stars-explorer --env-file .env -p 8080:8080 ghcr.io/emanuelef/daily-stars-explorer:latest
```

Then access the UI at `localhost:8080`.  
Note: If you've previously run the application and encounter errors accessing the `/assets` path, hard refresh your browser to ensure the latest version of the UI is loaded. This can usually be done by pressing Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (macOS).  

## Run locally

### Backend in Go

```sh
# Make sure you have Go installed
cp .env.example .env   # Create your environment file
go run main.go
```
An `.env` file is needed as described in the previous section.
The backend runs on port 8080.

### Frontend Web

```sh
cd website
npm install
npm start
```

## Demo

[Demo Video](https://www.loom.com/share/b1728c0305e74a8ebf1e23c419c84549?sid=3bdcbbf6-d205-4157-bed5-825d4ba5f5e3)

## Single repo

https://github.com/emanuelef/daily-stars-explorer/assets/48717/f5e96d63-3807-43fb-9838-3de56355124e

https://emanuelef.github.io/daily-stars-explorer/#/kubernetes/kubernetes

## Compare

https://github.com/emanuelef/daily-stars-explorer/assets/48717/9b14f989-ffc2-4b54-a17c-03284f0327f5

https://emanuelef.github.io/daily-stars-explorer/#/compare

## Articles

- [How to get full history of GitHub stars](https://medium.com/@emafuma/how-to-get-full-history-of-github-stars-f03cc93183a7)
- [Building a Cost-Free, Always-On Personal Project Stack](https://medium.com/@emafuma/building-a-cost-free-always-on-personal-project-stack-3eaa02ac16b6)
- [Introducing My GitHub Stars History Project: Unlocking the Full Star Story Beyond 40K and Daily Trends](https://www.reddit.com/r/github/comments/17e31ab/introducing_my_github_stars_history_project/)
- [GitHub Daily Stars Explorer: New Features and User-Requested Improvements](https://medium.com/@emafuma/github-daily-stars-explorer-new-features-and-user-requested-improvements-f2805ac98cfd)

## Features

### Full History of Stars

My project offers you the ability to access the full history of stars for a GitHub repository. It not only shows you the stars per day but also provides a cumulative stars graph. This way, you can visualize how a repository's popularity has evolved over time.

### Generate CSV and JSON

Easily save the star history as CSV or JSON files, with a daily and cumulative star count for each day since the repository's creation.

### Caching and Data Refresh

To keep things efficient, I've implemented a caching mechanism. Once you've fetched the history of stars, the data is cached for seven days. During this period, you have the option to refresh the data up to the current day. Please note that the graph will display data up to the last complete UTC day.

### Compare Repositories

For those curious about how two repositories stack up against each other, my project offers a comparison feature. While stars might not be the sole determinant of a project's worth, this comparison can provide valuable insights.

### Aggregates and trends

Go to https://github.com/emanuelef/daily-stars-explorer/blob/main/aggregate.md for the explanation of the current ways of aggregating the data and the trends that are calcualted.

---

## Project Limitations

### Fetching Time

The time it takes to retrieve all stars depends on the total number of stars. To overcome the 40,000-star limit, I leveraged the GitHub GraphQL API. Unfortunately, this doesn't allow for parallel requests. The workaround is to fetch the first half of the stars from the beginning and the other half from the end simultaneously, which can be time-consuming for large repositories.

Retrieving the complete star history for Kubernetes typically takes about 3 minutes.

### Rate Limits

With a single Personal Access Token (PAT), you can query up to 500,000 stars per hour. If this limit has already been reached, you will need to wait until the next hourly refresh. In the future, I intend to implement the option to use your own PAT, similar to other star history tools.

### Limited Error Handling

Currently, my project has limited error handling. I plan to improve this aspect, which includes implementing warnings to alert users when the rate limit might hinder the completion of the star retrieval.

### UI and Code Quality

I'm aware that the user interface and code quality have room for improvement. Your feedback and suggestions are welcome as I continue to refine these aspects.

## Contributing

Contributions are welcome! Feel free to open an issue or create a pull request.
