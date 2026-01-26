package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"math/rand"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	cache "github.com/Code-Hex/go-generics-cache"
	"github.com/gofiber/contrib/otelfiber"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/pprof"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/valyala/fasthttp"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"golang.org/x/exp/maps"
	"golang.org/x/sync/errgroup"

	"github.com/emanuelef/gh-repo-stats-server/config"
	"github.com/emanuelef/gh-repo-stats-server/handlers"
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

	app.Get("/allIssues", func(c *fiber.Ctx) error {
		param := c.Query("repo")
		randomIndex := rand.Intn(len(maps.Keys(ghStatClients)))
		clientKey := c.Query("client", maps.Keys(ghStatClients)[randomIndex])
		forceRefetch := c.Query("forceRefetch", "false") == "true"

		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		// needed because c.Query cannot be used as a map key
		repo = fmt.Sprintf("%s", repo)
		repo = strings.ToLower(repo)

		ip := c.Get("X-Forwarded-For")

		// If X-Forwarded-For is empty, fallback to RemoteIP
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("Issues Request from IP: %s, Repo: %s User-Agent: %s\n", ip, repo, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))

		if forceRefetch {
			cacheIssues.Delete(repo)
		}

		if res, hit := cacheIssues.Get(repo); hit {
			return c.JSON(res)
		}

		// if another request is already getting the data, skip and rely on SSE updates
		if _, hit := onGoingIssues[repo]; hit {
			return c.SendStatus(fiber.StatusNoContent)
		}

		onGoingIssues[repo] = true

		updateChannel := make(chan int)
		var allIssues []stats.IssuesPerDay

		eg, ctx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			allIssues, err = client.GetAllIssuesHistory(ctx, repo, updateChannel)
			if err != nil {
				return err
			}
			return nil
		})

		for progress := range updateChannel {
			// fmt.Printf("Progress: %d\n", progress)

			wg := &sync.WaitGroup{}

			for _, s := range currentSessions.Sessions {
				wg.Add(1)
				go func(cs *session.Session) {
					defer wg.Done()
					if cs.Repo == repo {
						cs.StateChannel <- progress
					}
				}(s)
			}
			wg.Wait()
		}

		if err := eg.Wait(); err != nil {
			delete(onGoingIssues, repo)
			return err
		}

		// defer close(updateChannel)

		res := types.IssuesWithStatsResponse{
			Issues: allIssues,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheIssues.Set(repo, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingIssues, repo)

		return c.JSON(res)
	})

	app.Get("/allForks", func(c *fiber.Ctx) error {
		param := c.Query("repo")
		randomIndex := rand.Intn(len(maps.Keys(ghStatClients)))
		clientKey := c.Query("client", maps.Keys(ghStatClients)[randomIndex])
		forceRefetch := c.Query("forceRefetch", "false") == "true"

		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		// needed because c.Query cannot be used as a map key
		repo = fmt.Sprintf("%s", repo)
		repo = strings.ToLower(repo)

		ip := c.Get("X-Forwarded-For")

		// If X-Forwarded-For is empty, fallback to RemoteIP
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("Forks Request from IP: %s, Repo: %s User-Agent: %s\n", ip, repo, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))

		if forceRefetch {
			cacheForks.Delete(repo)
		}

		if res, hit := cacheForks.Get(repo); hit {
			return c.JSON(res)
		}

		// if another request is already getting the data, skip and rely on SSE updates
		if _, hit := onGoingForks[repo]; hit {
			return c.SendStatus(fiber.StatusNoContent)
		}

		onGoingForks[repo] = true

		updateChannel := make(chan int)
		var allForks []stats.ForksPerDay

		eg, ctx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			allForks, err = client.GetAllForksHistory(ctx, repo, updateChannel)
			if err != nil {
				return err
			}
			return nil
		})

		for progress := range updateChannel {
			// fmt.Printf("Progress: %d\n", progress)

			wg := &sync.WaitGroup{}

			for _, s := range currentSessions.Sessions {
				wg.Add(1)
				go func(cs *session.Session) {
					defer wg.Done()
					if cs.Repo == repo {
						cs.StateChannel <- progress
					}
				}(s)
			}
			wg.Wait()
		}

		if err := eg.Wait(); err != nil {
			delete(onGoingForks, repo)
			return err
		}

		// defer close(updateChannel)

		res := types.ForksWithStatsResponse{
			Forks: allForks,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheForks.Set(repo, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingForks, repo)

		return c.JSON(res)
	})

	app.Get("/allPRs", func(c *fiber.Ctx) error {
		param := c.Query("repo")
		randomIndex := rand.Intn(len(maps.Keys(ghStatClients)))
		clientKey := c.Query("client", maps.Keys(ghStatClients)[randomIndex])
		forceRefetch := c.Query("forceRefetch", "false") == "true"

		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		// needed because c.Query cannot be used as a map key
		repo = fmt.Sprintf("%s", repo)
		repo = strings.ToLower(repo)

		ip := c.Get("X-Forwarded-For")

		// If X-Forwarded-For is empty, fallback to RemoteIP
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("PRs Request from IP: %s, Repo: %s User-Agent: %s\n", ip, repo, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))

		if forceRefetch {
			cachePRs.Delete(repo)
		}

		if res, hit := cachePRs.Get(repo); hit {
			return c.JSON(res)
		}

		// if another request is already getting the data, skip and rely on SSE updates
		if _, hit := onGoingPRs[repo]; hit {
			return c.SendStatus(fiber.StatusNoContent)
		}

		onGoingPRs[repo] = true

		updateChannel := make(chan int)
		var allPRs []stats.PRsPerDay

		eg, ctx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			allPRs, err = client.GetAllPRsHistory(ctx, repo, updateChannel)
			if err != nil {
				return err
			}
			return nil
		})

		for progress := range updateChannel {
			// fmt.Printf("Progress: %d\n", progress)

			wg := &sync.WaitGroup{}

			for _, s := range currentSessions.Sessions {
				wg.Add(1)
				go func(cs *session.Session) {
					defer wg.Done()
					if cs.Repo == repo {
						cs.StateChannel <- progress
					}
				}(s)
			}
			wg.Wait()
		}

		// defer close(updateChannel)

		if err := eg.Wait(); err != nil {
			delete(onGoingPRs, repo)
			return err
		}

		res := types.PRsWithStatsResponse{
			PRs: allPRs,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cachePRs.Set(repo, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingPRs, repo)

		return c.JSON(res)
	})

	app.Get("/allCommits", func(c *fiber.Ctx) error {
		param := c.Query("repo")
		randomIndex := rand.Intn(len(maps.Keys(ghStatClients)))
		clientKey := c.Query("client", maps.Keys(ghStatClients)[randomIndex])
		forceRefetch := c.Query("forceRefetch", "false") == "true"

		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		// needed because c.Query cannot be used as a map key
		repo = fmt.Sprintf("%s", repo)
		repo = strings.ToLower(repo)

		ip := c.Get("X-Forwarded-For")

		// If X-Forwarded-For is empty, fallback to RemoteIP
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("Commits Request from IP: %s, Repo: %s User-Agent: %s\n", ip, repo, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))

		if forceRefetch {
			cacheCommits.Delete(repo)
		}

		if res, hit := cacheCommits.Get(repo); hit {
			return c.JSON(res)
		}

		// if another request is already getting the data, skip and rely on SSE updates
		if _, hit := onGoingCommits[repo]; hit {
			return c.SendStatus(fiber.StatusNoContent)
		}

		onGoingCommits[repo] = true

		updateChannel := make(chan int)
		var allCommits []stats.CommitsPerDay
		var branchName string

		eg, ctx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			allCommits, branchName, err = client.GetAllCommitsHistory(ctx, repo, updateChannel)
			if err != nil {
				return err
			}
			return nil
		})

		for progress := range updateChannel {
			// fmt.Printf("Progress: %d\n", progress)

			wg := &sync.WaitGroup{}

			for _, s := range currentSessions.Sessions {
				wg.Add(1)
				go func(cs *session.Session) {
					defer wg.Done()
					if cs.Repo == repo {
						cs.StateChannel <- progress
					}
				}(s)
			}
			wg.Wait()
		}

		if err := eg.Wait(); err != nil {
			delete(onGoingCommits, repo)
			return err
		}

		// defer close(updateChannel)

		res := types.CommitsWithStatsResponse{
			Commits:       allCommits,
			DefaultBranch: branchName,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheCommits.Set(repo, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingCommits, repo)

		return c.JSON(res)
	})

	app.Get("/allContributors", func(c *fiber.Ctx) error {
		param := c.Query("repo")
		randomIndex := rand.Intn(len(maps.Keys(ghStatClients)))
		clientKey := c.Query("client", maps.Keys(ghStatClients)[randomIndex])
		forceRefetch := c.Query("forceRefetch", "false") == "true"

		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		// needed because c.Query cannot be used as a map key
		repo = fmt.Sprintf("%s", repo)
		repo = strings.ToLower(repo)

		ip := c.Get("X-Forwarded-For")

		// If X-Forwarded-For is empty, fallback to RemoteIP
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("Contributors Request from IP: %s, Repo: %s User-Agent: %s\n", ip, repo, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))

		if forceRefetch {
			cacheContributors.Delete(repo)
		}

		if res, hit := cacheContributors.Get(repo); hit {
			return c.JSON(res)
		}

		// if another request is already getting the data, skip and rely on SSE updates
		if _, hit := onGoingContributors[repo]; hit {
			return c.SendStatus(fiber.StatusNoContent)
		}

		onGoingContributors[repo] = true

		updateChannel := make(chan int)
		var allContributors []stats.NewContributorsPerDay

		eg, ctx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			allContributors, err = client.GetNewContributorsHistory(ctx, repo, updateChannel)
			if err != nil {
				return err
			}
			return nil
		})

		for progress := range updateChannel {
			// fmt.Printf("Progress: %d\n", progress)

			wg := &sync.WaitGroup{}

			for _, s := range currentSessions.Sessions {
				wg.Add(1)
				go func(cs *session.Session) {
					defer wg.Done()
					if cs.Repo == repo {
						cs.StateChannel <- progress
					}
				}(s)
			}
			wg.Wait()
		}

		if err := eg.Wait(); err != nil {
			delete(onGoingContributors, repo)
			return err
		}

		// defer close(updateChannel)

		res := types.ContributorsWithStatsResponse{
			Contributors: allContributors,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheContributors.Set(repo, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingContributors, repo)

		return c.JSON(res)
	})

	app.Get("/newRepos", func(c *fiber.Ctx) error {
		randomIndex := rand.Intn(len(maps.Keys(ghStatClients)))
		clientKey := c.Query("client", maps.Keys(ghStatClients)[randomIndex])
		startDateStr := c.Query("startDate")
		endDateStr := c.Query("endDate")
		includeForks := c.Query("includeForks", "false") == "true"
		forceRefetch := c.Query("forceRefetch", "false") == "true"

		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		// Parse dates
		if startDateStr == "" || endDateStr == "" {
			return c.Status(400).SendString("startDate and endDate are required parameters")
		}

		startDate, err := time.Parse("2006-01-02", startDateStr)
		if err != nil {
			return c.Status(400).SendString("Invalid startDate format. Use YYYY-MM-DD")
		}

		endDate, err := time.Parse("2006-01-02", endDateStr)
		if err != nil {
			return c.Status(400).SendString("Invalid endDate format. Use YYYY-MM-DD")
		}

		ip := c.Get("X-Forwarded-For")
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("NewRepos Request from IP: %s, StartDate: %s, EndDate: %s, User-Agent: %s\n", ip, startDateStr, endDateStr, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.startDate", startDateStr))
		span.SetAttributes(attribute.String("github.endDate", endDateStr))
		span.SetAttributes(attribute.String("caller.ip", ip))

		// Create cache key with dates and includeForks flag
		cacheKey := fmt.Sprintf("%s_%s_%t", startDateStr, endDateStr, includeForks)

		if forceRefetch {
			cacheNewRepos.Delete(cacheKey)
		}

		if res, hit := cacheNewRepos.Get(cacheKey); hit {
			return c.JSON(res)
		}

		// if another request is already getting the data, skip and rely on SSE updates
		if _, hit := onGoingNewRepos[cacheKey]; hit {
			return c.SendStatus(fiber.StatusNoContent)
		}

		onGoingNewRepos[cacheKey] = true

		updateChannel := make(chan int)
		var newReposHistory []stats.NewReposPerDay

		eg, ctx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			newReposHistory, err = client.GetNewReposCountHistory(ctx, startDate, endDate, includeForks, updateChannel)
			if err != nil {
				return err
			}
			return nil
		})

		for progress := range updateChannel {
			wg := &sync.WaitGroup{}

			for _, s := range currentSessions.Sessions {
				wg.Add(1)
				go func(cs *session.Session) {
					defer wg.Done()
					if cs.Repo == cacheKey {
						cs.StateChannel <- progress
					}
				}(s)
			}
			wg.Wait()
		}

		if err := eg.Wait(); err != nil {
			delete(onGoingNewRepos, cacheKey)
			return err
		}

		res := types.NewReposWithStatsResponse{
			NewRepos: newReposHistory,
		}

		// Cache for 7 days like other endpoints
		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheNewRepos.Set(cacheKey, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingNewRepos, cacheKey)

		return c.JSON(res)
	})

	app.Get("/limits", func(c *fiber.Ctx) error {
		client, ok := ghStatClients["PAT"]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}
		result, err := client.GetCurrentLimits(ctx)
		if err != nil {
			log.Fatalf("Error getting limits %v", err)
		}

		if client, ok = ghStatClients["PAT2"]; ok {
			tmpResult, err := client.GetCurrentLimits(ctx)
			if err != nil {
				log.Fatalf("Error getting limits %v", err)
			}

			result.Remaining += tmpResult.Remaining
			result.Limit += tmpResult.Limit
		}

		return c.JSON(result)
	})

	app.Get("/infos", handlers.InfosHandler)

	app.Get("/connections", handlers.ConnectionsHandler(app))

	app.Post("/cleanAllCache", func(c *fiber.Ctx) error {
		cacheOverall.DeleteExpired()
		cacheStars.DeleteExpired()
		return c.Send(nil)
	})

	app.Get("/allStarsCsv", func(c *fiber.Ctx) error {
		param := c.Query("repo")
		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		repo = fmt.Sprintf("%s", repo)

		// Check if the data is cached
		if res, hit := cacheStars.Get(repo); hit {
			// Generate CSV data from the cached data
			csvData, err := utils.GenerateCSVData(repo, res.Stars)
			if err != nil {
				log.Printf("Error generating CSV data: %v", err)
				return c.Status(500).SendString("Internal Server Error")
			}

			// Set response headers for CSV download
			c.Set("Content-Disposition", `attachment; filename="stars_history.csv"`)
			c.Set("Content-Type", "text/csv")

			// Return the CSV data as a response
			return c.SendString(csvData)
		}

		// Data not found in cache
		return c.Status(404).SendString("Data not found")
	})

	app.Get("/status", func(c *fiber.Ctx) error {
		param := c.Query("repo")
		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		repo = fmt.Sprintf("%s", repo)

		_, cached := cacheStars.Get(repo)
		_, onGoing := onGoingStars[repo]

		data := map[string]any{
			"cached":  cached,
			"onGoing": onGoing,
		}

		return c.JSON(data)
	})

	app.Get("/allStarsRequestStats", handlers.RequestStatsHandler(&allStarsRequestStats))

	app.Get("/sse", func(c *fiber.Ctx) error {
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		c.Set("Transfer-Encoding", "chunked")

		param := c.Query("repo")
		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		// needed because c.Query cannot be used as a map key
		repo = fmt.Sprintf("%s", repo)

		log.Printf("New Request %s\n", repo)

		stateChan := make(chan int)

		s := session.Session{
			Repo:         repo,
			StateChannel: stateChan,
		}

		currentSessions.AddSession(&s)

		notify := c.Context().Done()

		c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
			keepAliveTickler := time.NewTicker(15 * time.Second)
			keepAliveMsg := ":keepalive\n"

			// listen to signal to close and unregister (doesn't seem to be called)
			go func() {
				<-notify
				log.Printf("Stopped Request\n")
				currentSessions.RemoveSession(&s)
				keepAliveTickler.Stop()
			}()

			for loop := true; loop; {
				select {

				case ev := <-stateChan:
					sseMessage, err := session.FormatSSEMessage("current-value", ev)
					if err != nil {
						log.Printf("Error formatting sse message: %v\n", err)
						continue
					}

					// send sse formatted message
					_, err = fmt.Fprintf(w, sseMessage)

					if err != nil {
						log.Printf("Error while writing Data: %v\n", err)
						continue
					}

					err = w.Flush()
					if err != nil {
						log.Printf("Error while flushing Data: %v\n", err)
						currentSessions.RemoveSession(&s)
						keepAliveTickler.Stop()
						loop = false
						break
					}
				case <-keepAliveTickler.C:
					fmt.Fprintf(w, keepAliveMsg)
					err := w.Flush()
					if err != nil {
						log.Printf("Error while flushing: %v.\n", err)
						currentSessions.RemoveSession(&s)
						keepAliveTickler.Stop()
						loop = false
						break
					}
				}
			}

			log.Println("Exiting stream")
		}))

		return nil
	})

	app.Get("/deleteRecentStarsCache", func(c *fiber.Ctx) error {
		param := c.Query("repo")
		nStr := c.Query("days", "0")
		if param == "" {
			return c.Status(400).SendString("Missing repo parameter")
		}
		n, err := strconv.Atoi(nStr)
		if err != nil || n <= 0 {
			return c.Status(400).SendString("Invalid days parameter")
		}
		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}
		repo = fmt.Sprintf("%s", repo)
		repo = strings.ToLower(repo)

		// Get the cache entry
		cached, found := cacheStars.Get(repo)
		if !found {
			return c.Status(404).SendString("No cache for this repo")
		}

		// Remove the last n days from the cached stars slice
		if n >= len(cached.Stars) {
			cached.Stars = []stats.StarsPerDay{}
		} else {
			cached.Stars = cached.Stars[:len(cached.Stars)-n]
		}

		// Update the cache entry
		cacheStars.Set(repo, cached)

		return c.SendString(fmt.Sprintf("Removed last %d days from cache for repo %s.", n, repo))
	})

	host := utils.GetEnv("HOST", "0.0.0.0")
	port := utils.GetEnv("PORT", "8080")
	hostAddress := fmt.Sprintf("%s:%s", host, port)

	err = app.Listen(hostAddress)
	if err != nil {
		log.Panic(err)
	}
}
