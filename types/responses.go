package types

import (
	"github.com/emanuelef/gh-repo-stats-server/starhistory"
	"github.com/emanuelef/github-repo-activity-stats/repostats"
	"github.com/emanuelef/github-repo-activity-stats/stats"
)

// StarsWithStatsResponse is the /allStars and /recentStars payload.
//
// Star types come from the local starhistory package rather than the
// github-repo-activity-stats library: GitHub restricted the GraphQL stargazers
// connection the library walks, so stars are now fetched over REST here. The
// JSON is unchanged — starhistory's wire test pins it against the library
// types these replaced.
type StarsWithStatsResponse struct {
	Stars         []starhistory.StarsPerDay `json:"stars"`
	NewLast10Days int                       `json:"newLast10Days"`
	MaxPeriods    []starhistory.MaxPeriod   `json:"maxPeriods"`
	MaxPeaks      []starhistory.PeakDay     `json:"maxPeaks"`
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

type NewPRsWithStatsResponse struct {
	NewPRs []stats.NewPRsPerDay `json:"newPRs"`
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
