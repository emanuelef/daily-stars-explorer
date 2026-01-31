package routes

import (
	"context"

	cache "github.com/Code-Hex/go-generics-cache"
	"github.com/emanuelef/gh-repo-stats-server/handlers"
	"github.com/emanuelef/gh-repo-stats-server/news"
	"github.com/emanuelef/gh-repo-stats-server/session"
	"github.com/emanuelef/gh-repo-stats-server/types"
	"github.com/emanuelef/github-repo-activity-stats/repostats"
	"github.com/emanuelef/github-repo-activity-stats/stats"
	"github.com/gofiber/fiber/v2"
)

// Caches holds all the cache instances used by the application
type Caches struct {
	Overall           *cache.Cache[string, *stats.RepoStats]
	Stars             *cache.Cache[string, types.StarsWithStatsResponse]
	Issues            *cache.Cache[string, types.IssuesWithStatsResponse]
	Forks             *cache.Cache[string, types.ForksWithStatsResponse]
	PRs               *cache.Cache[string, types.PRsWithStatsResponse]
	Commits           *cache.Cache[string, types.CommitsWithStatsResponse]
	Contributors      *cache.Cache[string, types.ContributorsWithStatsResponse]
	NewRepos          *cache.Cache[string, types.NewReposWithStatsResponse]
	HackerNews        *cache.Cache[string, []news.Article]
	Reddit            *cache.Cache[string, []news.ArticleData]
	YouTube           *cache.Cache[string, []news.YTVideoMetadata]
	Releases          *cache.Cache[string, []stats.ReleaseInfo]
	ShowHN            *cache.Cache[string, []news.ShowHNPost]
	RedditGitHub      *cache.Cache[string, []news.RedditGitHubPost]
	RecentStarsByHour *cache.Cache[string, []types.HourlyStars]
}

// OnGoingMaps holds all the ongoing operation tracking maps
type OnGoingMaps struct {
	Stars        map[string]bool
	Issues       map[string]bool
	Forks        map[string]bool
	PRs          map[string]bool
	Commits      map[string]bool
	Contributors map[string]bool
	NewRepos     map[string]bool
}

// RegisterSystemRoutes registers system-related routes
func RegisterSystemRoutes(app *fiber.App) {
	app.Get("/health", handlers.HealthHandler)
	app.Get("/robots.txt", handlers.RobotsHandler)
	app.Get("/gc", handlers.GCHandler)
	app.Get("/infos", handlers.InfosHandler)
	app.Get("/connections", handlers.ConnectionsHandler(app))
}

// RegisterNewsRoutes registers news-related routes
func RegisterNewsRoutes(app *fiber.App, caches *Caches) {
	app.Get("/hackernews", handlers.HackerNewsHandler(caches.HackerNews))
	app.Get("/reddit", handlers.RedditHandler(caches.Reddit))
	app.Get("/youtube", handlers.YouTubeHandler(caches.YouTube))
	app.Get("/showhn", handlers.ShowHNHandler(caches.ShowHN))
	app.Get("/redditrepos", handlers.RedditReposHandler(caches.RedditGitHub))
}

// RegisterGitHubStatsRoutes registers GitHub statistics routes
func RegisterGitHubStatsRoutes(
	app *fiber.App,
	ctx context.Context,
	ghStatClients map[string]*repostats.ClientGQL,
	caches *Caches,
) {
	app.Get("/stats", handlers.StatsHandler(ctx, ghStatClients, caches.Overall))
	app.Get("/totalStars", handlers.TotalStarsHandler(ctx, ghStatClients))
	app.Get("/allReleases", handlers.AllReleasesHandler(ctx, ghStatClients, caches.Releases))
}

// RegisterCacheRoutes registers cache management routes
func RegisterCacheRoutes(app *fiber.App, caches *Caches, onGoingStars map[string]bool) {
	app.Get("/allKeys", handlers.AllKeysHandler(caches.Overall))
	app.Get("/allStarsKeys", handlers.AllStarsKeysHandler(caches.Stars))
	app.Get("/allReleasesKeys", handlers.AllReleasesKeysHandler(caches.Releases))
	app.Post("/cleanAllCache", handlers.CleanAllCacheHandler(caches.Overall, caches.Stars))
	app.Get("/allStarsCsv", handlers.AllStarsCSVHandler(caches.Stars))
	app.Get("/status", handlers.StatusHandler(caches.Stars, onGoingStars))
	app.Get("/deleteRecentStarsCache", handlers.DeleteRecentStarsCacheHandler(caches.Stars))
	app.Get("/activeOps", handlers.ActiveOperationsHandler(onGoingStars))
}

// RegisterRequestStatsRoutes registers request statistics routes
func RegisterRequestStatsRoutes(app *fiber.App, allStarsRequestStats *types.RequestStats) {
	app.Get("/allStarsRequestStats", handlers.RequestStatsHandler(allStarsRequestStats))
}

// RegisterStarsRoutes registers stars-related routes
func RegisterStarsRoutes(
	app *fiber.App,
	ctx context.Context,
	ghStatClients map[string]*repostats.ClientGQL,
	caches *Caches,
	onGoingStars map[string]bool,
	currentSessions *session.SessionsLock,
	requestStats *types.RequestStats,
) {
	app.Get("/allStars", handlers.AllStarsHandler(
		ghStatClients,
		caches.Stars,
		onGoingStars,
		currentSessions,
		requestStats,
		ctx,
	))
	app.Get("/recentStars", handlers.RecentStarsHandler(
		ghStatClients,
		caches.Stars,
		ctx,
	))
	app.Get("/recentStarsByHour", handlers.RecentStarsByHourHandler(
		ghStatClients,
		caches.RecentStarsByHour,
	))
}

// RegisterRepoActivityRoutes registers repository activity routes
func RegisterRepoActivityRoutes(
	app *fiber.App,
	ctx context.Context,
	ghStatClients map[string]*repostats.ClientGQL,
	caches *Caches,
	onGoingMaps *OnGoingMaps,
	currentSessions *session.SessionsLock,
) {
	app.Get("/allIssues", handlers.AllIssuesHandler(
		ghStatClients,
		caches.Issues,
		onGoingMaps.Issues,
		currentSessions,
		ctx,
	))
	app.Get("/allForks", handlers.AllForksHandler(
		ghStatClients,
		caches.Forks,
		onGoingMaps.Forks,
		currentSessions,
		ctx,
	))
	app.Get("/allPRs", handlers.AllPRsHandler(
		ghStatClients,
		caches.PRs,
		onGoingMaps.PRs,
		currentSessions,
		ctx,
	))
	app.Get("/allCommits", handlers.AllCommitsHandler(
		ghStatClients,
		caches.Commits,
		onGoingMaps.Commits,
		currentSessions,
		ctx,
	))
	app.Get("/allContributors", handlers.AllContributorsHandler(
		ghStatClients,
		caches.Contributors,
		onGoingMaps.Contributors,
		currentSessions,
		ctx,
	))
	app.Get("/newRepos", handlers.NewReposHandler(
		ghStatClients,
		caches.NewRepos,
		onGoingMaps.NewRepos,
		currentSessions,
		ctx,
	))
}

// RegisterSSERoutes registers Server-Sent Events routes
func RegisterSSERoutes(app *fiber.App, currentSessions *session.SessionsLock) {
	app.Get("/sse", handlers.SSEHandler(currentSessions))
}

// RegisterLimitsRoutes registers API limits routes
func RegisterLimitsRoutes(
	app *fiber.App,
	ctx context.Context,
	ghStatClients map[string]*repostats.ClientGQL,
) {
	app.Get("/limits", handlers.LimitsHandler(ghStatClients, ctx))
}
