package types

import (
	"github.com/emanuelef/github-repo-activity-stats/repostats"
	"github.com/emanuelef/github-repo-activity-stats/stats"
)

type StarsWithStatsResponse struct {
	Stars         []stats.StarsPerDay   `json:"stars"`
	NewLast10Days int                   `json:"newLast10Days"`
	MaxPeriods    []repostats.MaxPeriod `json:"maxPeriods"`
	MaxPeaks      []repostats.PeakDay   `json:"maxPeaks"`
}

type IssuesWithStatsResponse struct {
	Issues []stats.IssuesPerDay `json:"issues"`
}

type ForksWithStatsResponse struct {
	Forks []stats.ForksPerDay `json:"forks"`
}

type PRsWithStatsResponse struct {
	PRs []stats.PRsPerDay `json:"prs"`
}

type CommitsWithStatsResponse struct {
	Commits       []stats.CommitsPerDay `json:"commits"`
	DefaultBranch string                `json:"defaultBranch"`
}

type ContributorsWithStatsResponse struct {
	Contributors []stats.NewContributorsPerDay `json:"contributors"`
}

type NewReposWithStatsResponse struct {
	NewRepos []stats.NewReposPerDay `json:"newRepos"`
}

type HourlyStars struct {
	Hour       string `json:"hour"`
	Stars      int    `json:"stars"`
	TotalStars int    `json:"totalStars"`
}

type GitHubMentionsResponse struct {
	TargetRepo        string                  `json:"targetRepo"`
	TotalMentions     int                     `json:"totalMentions"`
	IssuesCount       int                     `json:"issuesCount"`
	PullRequestsCount int                     `json:"pullRequestsCount"`
	DiscussionsCount  int                     `json:"discussionsCount"`
	Mentions          []repostats.RepoMention `json:"mentions"`
}
