package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	cache "github.com/Code-Hex/go-generics-cache"
	"github.com/gofiber/contrib/otelfiber"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/pprof"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/emanuelef/gh-repo-stats-server/news"
	"github.com/emanuelef/gh-repo-stats-server/otel_instrumentation"
	"github.com/emanuelef/gh-repo-stats-server/routes"
	"github.com/emanuelef/gh-repo-stats-server/session"
	"github.com/emanuelef/gh-repo-stats-server/types"
	"github.com/emanuelef/gh-repo-stats-server/utils"
	"github.com/emanuelef/github-repo-activity-stats/repostats"
	"github.com/emanuelef/github-repo-activity-stats/stats"
	_ "github.com/joho/godotenv/autoload"
)

var currentSessions session.SessionsLock
var allStarsRequestStats types.RequestStats

// getRecentStarsByHourHandler handles API requests for hourly stars
func main() {
	ctx := context.Background()
	tp, exp, err := otel_instrumentation.InitializeGlobalTracerProvider(ctx)

	// Handle shutdown to ensure all sub processes are closed correctly and telemetry is exported
	defer func() {
		_ = exp.Shutdown(ctx)
		_ = tp.Shutdown(ctx)
	}()

	if err != nil {
		log.Fatalf("failed to initialize OpenTelemetry: %e", err)
	}

	cacheOverall := cache.New[string, *stats.RepoStats]()
	cacheStars := cache.New[string, types.StarsWithStatsResponse]()
	cacheIssues := cache.New[string, types.IssuesWithStatsResponse]()
	cacheForks := cache.New[string, types.ForksWithStatsResponse]()
	cachePRs := cache.New[string, types.PRsWithStatsResponse]()
	cacheCommits := cache.New[string, types.CommitsWithStatsResponse]()
	cacheContributors := cache.New[string, types.ContributorsWithStatsResponse]()
	cacheNewRepos := cache.New[string, types.NewReposWithStatsResponse]()

	cacheHackerNews := cache.New[string, []news.Article]()
	cacheReddit := cache.New[string, []news.ArticleData]()
	cacheYouTube := cache.New[string, []news.YTVideoMetadata]()
	cacheReleases := cache.New[string, []stats.ReleaseInfo]()
	cacheShowHN := cache.New[string, []news.ShowHNPost]()
	cacheRedditGitHub := cache.New[string, []news.RedditGitHubPost]()
	cacheRecentStarsByHour := cache.New[string, []types.HourlyStars]()
	cacheGitHubMentions := cache.New[string, types.GitHubMentionsResponse]()

	onGoingStars := make(map[string]bool)
	onGoingIssues := make(map[string]bool)
	onGoingForks := make(map[string]bool)
	onGoingPRs := make(map[string]bool)
	onGoingCommits := make(map[string]bool)
	onGoingContributors := make(map[string]bool)
	onGoingNewRepos := make(map[string]bool)

	ghStatClients := make(map[string]*repostats.ClientGQL)

	ghStatClients["PAT"] = utils.NewClientWithPAT(os.Getenv("PAT"))
	if pat2 := os.Getenv("PAT2"); pat2 != "" {
		ghStatClients["PAT2"] = utils.NewClientWithPAT(pat2)
	}

	app := fiber.New()

	app.Use(pprof.New())

	app.Use(otelfiber.Middleware(otelfiber.WithNext(func(c *fiber.Ctx) bool {
		return c.Path() == "/health" || c.Path() == "/sse"
	})))

	rateLimiter := limiter.New(limiter.Config{
		Max:        120,           // Maximum number of requests allowed per hour
		Expiration: 1 * time.Hour, // Duration for the rate limit window
		KeyGenerator: func(c *fiber.Ctx) string {
			ip := c.Get("X-Forwarded-For")
			// If X-Forwarded-For is empty, fallback to RemoteIP
			if ip == "" {
				ip = "unknown"
			}
			return ip
		},
	})

	rateLimiterFeed := limiter.New(limiter.Config{
		Max:        200,           // Maximum number of requests allowed per hour
		Expiration: 1 * time.Hour, // Duration for the rate limit window
		KeyGenerator: func(c *fiber.Ctx) string {
			ip := c.Get("X-Forwarded-For")
			// If X-Forwarded-For is empty, fallback to RemoteIP
			if ip == "" {
				ip = "unknown"
			}
			return ip
		},
	})

	app.Use("/allStars", rateLimiter)
	app.Use("/youtube", rateLimiterFeed)
	app.Use("/showhn", rateLimiterFeed)
	app.Use("/redditrepos", rateLimiterFeed)
	app.Use("/reddit", rateLimiterFeed)
	app.Use("/hackernews", rateLimiterFeed)
	app.Use("/ghmentions", rateLimiterFeed)
	app.Use("/allReleases", rateLimiter)
	app.Use(recover.New())
	app.Use(cors.New())
	app.Use(compress.New())

	// Initialize caches struct
	caches := &routes.Caches{
		Overall:           cacheOverall,
		Stars:             cacheStars,
		Issues:            cacheIssues,
		Forks:             cacheForks,
		PRs:               cachePRs,
		Commits:           cacheCommits,
		Contributors:      cacheContributors,
		NewRepos:          cacheNewRepos,
		HackerNews:        cacheHackerNews,
		Reddit:            cacheReddit,
		YouTube:           cacheYouTube,
		Releases:          cacheReleases,
		ShowHN:            cacheShowHN,
		RedditGitHub:      cacheRedditGitHub,
		RecentStarsByHour: cacheRecentStarsByHour,
		GitHubMentions:    cacheGitHubMentions,
	}

	// Initialize ongoing operations map
	onGoingMaps := &routes.OnGoingMaps{
		Stars:        onGoingStars,
		Issues:       onGoingIssues,
		Forks:        onGoingForks,
		PRs:          onGoingPRs,
		Commits:      onGoingCommits,
		Contributors: onGoingContributors,
		NewRepos:     onGoingNewRepos,
	}

	// Register system routes
	routes.RegisterSystemRoutes(app)

	// serve the static files from the website/dist folder
	app.Static("/", "./website/dist")

	// serve the assets files from the website/dist/assets folder
	app.Static("/daily-stars-explorer/assets", "./website/dist/assets")

	// Register news routes
	routes.RegisterNewsRoutes(app, caches)

	// Register GitHub stats routes
	routes.RegisterGitHubStatsRoutes(app, ctx, ghStatClients, caches)

	// Register cache routes
	routes.RegisterCacheRoutes(app, caches, onGoingStars)

	// Register request stats routes
	routes.RegisterRequestStatsRoutes(app, &allStarsRequestStats)

	// Register stars routes
	routes.RegisterStarsRoutes(app, ctx, ghStatClients, caches, onGoingStars, &currentSessions, &allStarsRequestStats)

	// Register repository activity routes
	routes.RegisterRepoActivityRoutes(app, ctx, ghStatClients, caches, onGoingMaps, &currentSessions)

	// Register SSE routes
	routes.RegisterSSERoutes(app, &currentSessions)

	// Register limits routes
	routes.RegisterLimitsRoutes(app, ctx, ghStatClients)

	host := utils.GetEnv("HOST", "0.0.0.0")
	port := utils.GetEnv("PORT", "8080")
	hostAddress := fmt.Sprintf("%s:%s", host, port)

	err = app.Listen(hostAddress)
	if err != nil {
		log.Panic(err)
	}
}
