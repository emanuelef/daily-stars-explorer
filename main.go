package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"math/rand"
	"net/url"
	"os"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2/middleware/pprof"

	//"github.com/emanuelef/gh-repo-stats-server/cache"
	cache "github.com/Code-Hex/go-generics-cache"
	"github.com/emanuelef/gh-repo-stats-server/news"
	"github.com/emanuelef/gh-repo-stats-server/otel_instrumentation"
	"github.com/emanuelef/gh-repo-stats-server/session"
	"github.com/emanuelef/github-repo-activity-stats/repostats"
	"github.com/emanuelef/github-repo-activity-stats/stats"
	_ "github.com/joho/godotenv/autoload"
	"github.com/valyala/fasthttp"
	"golang.org/x/exp/maps"
	"golang.org/x/oauth2"
	"golang.org/x/sync/errgroup"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"

	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/gofiber/contrib/otelfiber"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

var currentSessions session.SessionsLock

type RequestStats struct {
	mu           sync.RWMutex
	currentDate  string
	requestCount int
	uniqueIPs    map[string]bool
	uniqueRepos  map[string]bool
}

func (rs *RequestStats) RecordRequest(ip, repo string) {
	rs.mu.Lock()
	defer rs.mu.Unlock()

	today := time.Now().UTC().Format("2006-01-02")

	// Reset if it's a new day
	if rs.currentDate != today {
		rs.currentDate = today
		rs.requestCount = 0
		rs.uniqueIPs = make(map[string]bool)
		rs.uniqueRepos = make(map[string]bool)
	}

	rs.requestCount++
	rs.uniqueIPs[ip] = true
	rs.uniqueRepos[repo] = true
}

func (rs *RequestStats) GetStats() (date string, requestCount int, uniqueIPs int, uniqueRepos int) {
	rs.mu.RLock()
	defer rs.mu.RUnlock()

	return rs.currentDate, rs.requestCount, len(rs.uniqueIPs), len(rs.uniqueRepos)
}

var allStarsRequestStats RequestStats

const DAY_CACHED = 7

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

func getEnv(key, fallback string) string {
	value, exists := os.LookupEnv(key)
	if !exists {
		value = fallback
	}
	return value
}

func bToMb(b uint64) uint64 {
	return b / 1024 / 1024
}

func generateCSVData(repo string, data []stats.StarsPerDay) (string, error) {
	csvData := []string{"date,day-stars,total-stars"}

	for _, entry := range data {
		csvData = append(csvData, fmt.Sprintf("%s,%d,%d",
			time.Time(entry.Day).Format("02-01-2006"),
			entry.Stars,
			entry.TotalStars))
	}

	return strings.Join(csvData, "\n"), nil
}

func NewClientWithPAT(token string) *repostats.ClientGQL {
	tokenSource := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: token},
	)

	oauthClient := oauth2.NewClient(context.Background(), tokenSource)
	return repostats.NewClientGQL(oauthClient)
}

// getRecentStarsByHourHandler handles API requests for hourly stars
func getRecentStarsByHourHandler(ghStatClients map[string]*repostats.ClientGQL, cacheRecentStarsByHour *cache.Cache[string, []HourlyStars]) fiber.Handler {
	return func(c *fiber.Ctx) error {
		param := c.Query("repo")
		lastDaysStr := c.Query("lastDays", "7")
		if param == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Missing repo parameter"})
		}
		lastDays, err := strconv.Atoi(lastDaysStr)
		if err != nil || lastDays < 1 || lastDays > 60 {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid lastDays parameter"})
		}

		repo, err := url.QueryUnescape(param)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid repo parameter"})
		}
		repo = strings.ToLower(fmt.Sprintf("%s", repo))

		// Get random client (PAT or PAT2)
		randomIndex := rand.Intn(len(maps.Keys(ghStatClients)))
		clientKey := c.Query("client", maps.Keys(ghStatClients)[randomIndex])
		forceRefetch := c.Query("forceRefetch", "false") == "true"
		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		// --- Add IP logging and OpenTelemetry span attribute ---
		ip := c.Get("X-Forwarded-For")
		if ip == "" {
			ip = c.IP()
		}
		userAgent := c.Get("User-Agent")
		log.Printf("Request from IP: %s, Repo: %s, User-Agent: %s\n", ip, repo, userAgent)
		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))
		// --- End IP logging ---

		// Create cache key with repo and lastDays
		cacheKey := fmt.Sprintf("%s_hourly_%d", repo, lastDays)

		if forceRefetch {
			cacheRecentStarsByHour.Delete(cacheKey)
		}

		// Check cache
		if res, hit := cacheRecentStarsByHour.Get(cacheKey); hit {
			return c.JSON(res)
		}

		starsPerHour, err := client.GetRecentStarsHistoryByHour(c.Context(), repo, lastDays, nil)
		if err != nil {
			log.Printf("Error getting hourly stars: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}

		out := make([]HourlyStars, len(starsPerHour))
		for i, h := range starsPerHour {
			out[i] = HourlyStars{
				Hour:       h.Hour.UTC().Format(time.RFC3339),
				Stars:      h.Stars,
				TotalStars: h.TotalStars,
			}
		}

		// Cache the result for 10 minutes
		cacheRecentStarsByHour.Set(cacheKey, out, cache.WithExpiration(10*time.Minute))

		return c.JSON(out)
	}
}

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
	cacheStars := cache.New[string, StarsWithStatsResponse]()
	cacheIssues := cache.New[string, IssuesWithStatsResponse]()
	cacheForks := cache.New[string, ForksWithStatsResponse]()
	cachePRs := cache.New[string, PRsWithStatsResponse]()
	cacheCommits := cache.New[string, CommitsWithStatsResponse]()
	cacheContributors := cache.New[string, ContributorsWithStatsResponse]()
	cacheNewRepos := cache.New[string, NewReposWithStatsResponse]()

	cacheHackerNews := cache.New[string, []news.Article]()
	cacheReddit := cache.New[string, []news.ArticleData]()
	cacheYouTube := cache.New[string, []news.YTVideoMetadata]()
	cacheReleases := cache.New[string, []stats.ReleaseInfo]()
	cacheShowHN := cache.New[string, []news.ShowHNPost]()
	cacheRecentStarsByHour := cache.New[string, []HourlyStars]()

	onGoingStars := make(map[string]bool)
	onGoingIssues := make(map[string]bool)
	onGoingForks := make(map[string]bool)
	onGoingPRs := make(map[string]bool)
	onGoingCommits := make(map[string]bool)
	onGoingContributors := make(map[string]bool)
	onGoingNewRepos := make(map[string]bool)

	ghStatClients := make(map[string]*repostats.ClientGQL)

	ghStatClients["PAT"] = NewClientWithPAT(os.Getenv("PAT"))
	if pat2 := os.Getenv("PAT2"); pat2 != "" {
		ghStatClients["PAT2"] = NewClientWithPAT(pat2)
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

	// Just to check health and an example of a very frequent request
	// that we might not want to generate traces
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.Send(nil)
	})

	// Do not index the website
	app.Get("/robots.txt", func(c *fiber.Ctx) error {
		return c.SendString("User-agent: *\nDisallow: /")
	})

	// serve the static files from the website/dist folder
	app.Static("/", "./website/dist")

	// serve the assets files from the website/dist/assets folder
	app.Static("/daily-stars-explorer/assets", "./website/dist/assets")

	app.Get("/gc", func(c *fiber.Ctx) error {
		runtime.GC()
		return c.Send(nil)
	})

	app.Get("/hackernews", func(c *fiber.Ctx) error {
		query := c.Query("query", "golang")

		if res, hit := cacheHackerNews.Get(query); hit {
			return c.JSON(res)
		}

		limit, err := strconv.Atoi(c.Query("limit", "10"))
		if err != nil {
			return c.Status(400).SendString("Invalid limit parameter")
		}

		articles, err := news.FetchHackerNewsArticles(query, limit)
		if err != nil {
			log.Printf("Error fetching Hacker News articles: %v", err)
			return c.Status(500).SendString("Internal Server Error")
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(1 * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheHackerNews.Set(query, articles, cache.WithExpiration(durationUntilEndOfDay))

		return c.JSON(articles)
	})

	app.Get("/reddit", func(c *fiber.Ctx) error {
		query := c.Query("query", "golang")

		if res, hit := cacheReddit.Get(query); hit {
			return c.JSON(res)
		}

		limit, err := strconv.Atoi(c.Query("limit", "2"))
		if err != nil {
			return c.Status(400).SendString("Invalid limit parameter")
		}

		articles, err := news.FetchRedditPosts(query, limit)
		if err != nil {
			log.Printf("Error fetching Reddit articles: %v", err)
			return c.Status(500).SendString("Internal Server Error")
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(1 * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheReddit.Set(query, articles, cache.WithExpiration(durationUntilEndOfDay))

		return c.JSON(articles)
	})

	app.Get("/youtube", func(c *fiber.Ctx) error {
		query := c.Query("query", "golang")

		if res, hit := cacheYouTube.Get(query); hit {
			return c.JSON(res)
		}

		limit, err := strconv.Atoi(c.Query("limit", "10"))
		if err != nil {
			return c.Status(400).SendString("Invalid limit parameter")
		}

		articles, err := news.FetchYouTubeVideos(query, limit)
		if err != nil {
			log.Printf("Error fetching Hacker News articles: %v", err)
			return c.Status(500).SendString("Internal Server Error")
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(1 * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheYouTube.Set(query, articles, cache.WithExpiration(durationUntilEndOfDay))

		return c.JSON(articles)
	})

	app.Get("/allReleases", func(c *fiber.Ctx) error {
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
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("Request from IP: %s, Repo: %s, User-Agent: %s\n", ip, repo, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))

		cacheKey := repo + "_releases"

		if forceRefetch {
			cacheReleases.Delete(cacheKey)
		}

		if res, hit := cacheReleases.Get(cacheKey); hit {
			return c.JSON(res)
		}

		releases, err := client.GetAllReleasesFeed(ctx, repo)
		if err != nil {
			log.Printf("Error fetching releases: %v", err)
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(DAY_CACHED * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheReleases.Set(cacheKey, releases, cache.WithExpiration(durationUntilEndOfDay))

		return c.JSON(releases)
	})

	app.Get("/showhn", func(c *fiber.Ctx) error {
		// Get sort parameter, default to "date" if not provided
		sortBy := c.Query("sort", "date")

		// Validate sort parameter
		validSort := sortBy == "date" || sortBy == "points" || sortBy == "comments"
		if !validSort {
			sortBy = "date" // Default to date if invalid parameter
		}

		// Get minimum points/comments filters
		minPointsStr := c.Query("min_points", "0")
		minCommentsStr := c.Query("min_comments", "0")

		minPoints, err := strconv.Atoi(minPointsStr)
		if err != nil || minPoints < 0 {
			minPoints = 0
		}

		minComments, err := strconv.Atoi(minCommentsStr)
		if err != nil || minComments < 0 {
			minComments = 0
		}

		// Create cache key based on sort parameter
		cacheKey := fmt.Sprintf("showhn:%s", sortBy)

		var posts []news.ShowHNPost

		// Try to get from cache first
		if res, hit := cacheShowHN.Get(cacheKey); hit {
			posts = res
		} else {
			// Fetch fresh data if not in cache
			var err error
			posts, err = news.FetchShowHNGitHubPosts(sortBy)
			if err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "error fetching Show HN posts: "+err.Error())
			}

			// Store in cache with a shorter 10-minute expiration to get fresh content
			cacheShowHN.Set(cacheKey, posts, cache.WithExpiration(4*time.Hour))
		}

		// Apply filters after retrieving from cache
		if minPoints > 0 || minComments > 0 {
			filteredPosts := make([]news.ShowHNPost, 0)
			for _, post := range posts {
				if post.Points >= minPoints && post.NumComments >= minComments {
					filteredPosts = append(filteredPosts, post)
				}
			}
			posts = filteredPosts
		}

		return c.JSON(posts)
	})

	// Cache for Reddit GitHub repos
	cacheRedditGitHub := cache.New[string, []news.RedditGitHubPost]()

	app.Get("/redditrepos", func(c *fiber.Ctx) error {
		// Get sort parameter, default to "date" if not provided
		sortBy := c.Query("sort", "date")

		// Validate sort parameter
		validSort := sortBy == "date" || sortBy == "points" || sortBy == "comments"
		if !validSort {
			sortBy = "date" // Default to date if invalid parameter
		}

		// Get minimum points/comments filters
		minPointsStr := c.Query("min_points", "0")
		minCommentsStr := c.Query("min_comments", "0")

		minPoints, err := strconv.Atoi(minPointsStr)
		if err != nil || minPoints < 0 {
			minPoints = 0
		}

		minComments, err := strconv.Atoi(minCommentsStr)
		if err != nil || minComments < 0 {
			minComments = 0
		}

		// Create cache key based on sort parameter
		cacheKey := fmt.Sprintf("redditrepos:%s", sortBy)

		var posts []news.RedditGitHubPost

		// Try to get from cache first
		if res, hit := cacheRedditGitHub.Get(cacheKey); hit {
			posts = res
		} else {
			// Fetch fresh data if not in cache
			var err error
			posts, err = news.FetchRedditGitHubPosts(sortBy)
			if err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "error fetching Reddit GitHub posts: "+err.Error())
			}

			// Store in cache with expiration
			cacheRedditGitHub.Set(cacheKey, posts, cache.WithExpiration(4*time.Hour))
		}

		// Apply filters after retrieving from cache
		if minPoints > 0 || minComments > 0 {
			filteredPosts := make([]news.RedditGitHubPost, 0)
			for _, post := range posts {
				if post.Points >= minPoints && post.NumComments >= minComments {
					filteredPosts = append(filteredPosts, post)
				}
			}
			posts = filteredPosts
		}

		return c.JSON(posts)
	})

	app.Get("/stats", func(c *fiber.Ctx) error {
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

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))

		if forceRefetch {
			cacheOverall.Delete(repo)
		}

		if res, hit := cacheOverall.Get(repo); hit {
			return c.JSON(res)
		}

		result, err := client.GetAllStats(ctx, repo)
		if err != nil {
			log.Printf("Error getting all stats %v", err)
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(DAY_CACHED * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheOverall.Set(repo, result, cache.WithExpiration(durationUntilEndOfDay))
		return c.JSON(result)
	})

	app.Get("/allKeys", func(c *fiber.Ctx) error {
		return c.JSON(cacheOverall.Keys())
	})

	app.Get("/allStarsKeys", func(c *fiber.Ctx) error {
		return c.JSON(cacheStars.Keys())
	})

	app.Get("/allReleasesKeys", func(c *fiber.Ctx) error {
		return c.JSON(cacheReleases.Keys())
	})

	app.Get("/totalStars", func(c *fiber.Ctx) error {
		param := c.Query("repo")
		randomIndex := rand.Intn(len(maps.Keys(ghStatClients)))
		clientKey := c.Query("client", maps.Keys(ghStatClients)[randomIndex])
		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		repo = fmt.Sprintf("%s", repo)

		stars, createdAt, err := client.GetTotalStars(ctx, repo)
		if err != nil {
			log.Printf("Error getting total stars %v", err)
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		data := map[string]any{
			"stars":     stars,
			"createdAt": createdAt,
		}

		return c.JSON(data)
	})

	app.Get("/allStars", func(c *fiber.Ctx) error {
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
		log.Printf("Request from IP: %s, Repo: %s User-Agent: %s\n", ip, repo, userAgent)

		// Track the request
		allStarsRequestStats.RecordRequest(ip, repo)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))

		if forceRefetch {
			cacheStars.Delete(repo)
		}

		if res, hit := cacheStars.Get(repo); hit {
			return c.JSON(res)
		}

		// if another request is already getting the data, skip and rely on SSE updates
		if _, hit := onGoingStars[repo]; hit {
			return c.SendStatus(fiber.StatusNoContent)
		}

		onGoingStars[repo] = true

		updateChannel := make(chan int)
		var allStars []stats.StarsPerDay

		eg, ctx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			allStars, err = client.GetAllStarsHistoryTwoWays(ctx, repo, updateChannel)
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
			delete(onGoingStars, repo)
			return err
		}

		defer close(updateChannel)

		// Remove incomplete (today's) day before creating response and caching in /allStars ---
		if len(allStars) > 0 {
			todayStr := time.Now().Format("02-01-2006")
			lastDayStr := time.Time(allStars[len(allStars)-1].Day).Format("02-01-2006")
			if lastDayStr == todayStr {
				allStars = allStars[:len(allStars)-1] // remove incomplete day
			}
		}

		maxPeriods, maxPeaks, err := repostats.FindMaxConsecutivePeriods(allStars, 10)
		if err != nil {
			return err
		}

		newLastNDays := repostats.NewStarsLastDays(allStars, 10)

		res := StarsWithStatsResponse{
			Stars:         allStars,
			NewLast10Days: newLastNDays,
			MaxPeriods:    maxPeriods,
			MaxPeaks:      maxPeaks,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(DAY_CACHED * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheStars.Set(repo, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingStars, repo)

		return c.JSON(res)
	})

	app.Get("/recentStars", func(c *fiber.Ctx) error {
		param := c.Query("repo")
		lastDaysStr := c.Query("lastDays", "30") // Default to 30 days if not provided
		randomIndex := rand.Intn(len(maps.Keys(ghStatClients)))
		clientKey := c.Query("client", maps.Keys(ghStatClients)[randomIndex])

		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		repo = fmt.Sprintf("%s", repo)
		repo = strings.ToLower(repo)

		lastDays, err := strconv.Atoi(lastDaysStr)
		if err != nil || lastDays <= 0 {
			return c.Status(400).SendString("Invalid lastDays parameter")
		}

		ip := c.Get("X-Forwarded-For")
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("Request from IP: %s, Repo: %s, LastDays: %d, User-Agent: %s\n", ip, repo, lastDays, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))

		// 1. Fetch recent daily stars (no cumulative) for the last N days
		recentStars, err := client.GetRecentStarsHistoryTwoWays(ctx, repo, lastDays, nil)
		if err != nil {
			return err
		}

		// 2. Get cached stars for this repo (if any)
		var cachedStars []stats.StarsPerDay
		var cachedRes StarsWithStatsResponse
		var found bool
		if cachedRes, found = cacheStars.Get(repo); found {
			cachedStars = cachedRes.Stars
		}

		// --- PATCH: Only add recent days strictly after the last cached day ---
		// Find the last cached day (if any)
		// var lastCachedDay time.Time // no longer needed

		// 3. Create a map to hold all stars data (both cached and recent)
		mergedMap := make(map[string]stats.StarsPerDay)
		for _, entry := range cachedStars {
			dayStr := time.Time(entry.Day).Format("02-01-2006")
			mergedMap[dayStr] = entry
		}

		// --- PATCH: Do not add today when merging recentStars ---
		todayStr := time.Now().Format("02-01-2006")
		var hasNewEntries bool
		for _, entry := range recentStars {
			entryDayStr := time.Time(entry.Day).Format("02-01-2006")
			if entryDayStr == todayStr {
				continue // skip today
			}
			if _, exists := mergedMap[entryDayStr]; exists {
				hasNewEntries = true // treat as new if we update the value
			}
			mergedMap[entryDayStr] = entry
			if !hasNewEntries {
				if _, exists := mergedMap[entryDayStr]; !exists {
					hasNewEntries = true
				}
			}
		}
		// --- END PATCH ---

		// 4. Convert map back to slice and sort by date
		var mergedStars []stats.StarsPerDay
		for _, entry := range mergedMap {
			mergedStars = append(mergedStars, entry)
		}

		// Sort by date
		sort.Slice(mergedStars, func(i, j int) bool {
			return time.Time(mergedStars[i].Day).Before(time.Time(mergedStars[j].Day))
		})

		// 5. Recalculate cumulative totals
		if len(mergedStars) > 0 {
			runningTotal := 0
			for i := range mergedStars {
				runningTotal += mergedStars[i].Stars
				mergedStars[i].TotalStars = runningTotal
			}
		}

		maxPeriods, maxPeaks, err := repostats.FindMaxConsecutivePeriods(mergedStars, 10)
		if err != nil {
			return err
		}
		newLastNDays := repostats.NewStarsLastDays(mergedStars, 10)

		res := StarsWithStatsResponse{
			Stars:         mergedStars,
			NewLast10Days: newLastNDays,
			MaxPeriods:    maxPeriods,
			MaxPeaks:      maxPeaks,
		}

		if hasNewEntries {
			// Update cache only if there are new days
			now := time.Now()
			nextDay := now.UTC().Truncate(24 * time.Hour).Add(DAY_CACHED * 24 * time.Hour)
			durationUntilEndOfDay := nextDay.Sub(now)
			cacheStars.Set(repo, res, cache.WithExpiration(durationUntilEndOfDay))
		}

		return c.JSON(res)
	})

	app.Get("/recentStarsByHour", getRecentStarsByHourHandler(ghStatClients, cacheRecentStarsByHour))

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

		res := IssuesWithStatsResponse{
			Issues: allIssues,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(DAY_CACHED * 24 * time.Hour)
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

		res := ForksWithStatsResponse{
			Forks: allForks,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(DAY_CACHED * 24 * time.Hour)
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

		res := PRsWithStatsResponse{
			PRs: allPRs,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(DAY_CACHED * 24 * time.Hour)
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

		res := CommitsWithStatsResponse{
			Commits:       allCommits,
			DefaultBranch: branchName,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(DAY_CACHED * 24 * time.Hour)
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

		res := ContributorsWithStatsResponse{
			Contributors: allContributors,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(DAY_CACHED * 24 * time.Hour)
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

		res := NewReposWithStatsResponse{
			NewRepos: newReposHistory,
		}

		// Cache for 7 days like other endpoints
		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(DAY_CACHED * 24 * time.Hour)
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

	app.Get("/infos", func(c *fiber.Ctx) error {
		var m runtime.MemStats
		runtime.ReadMemStats(&m)

		res := map[string]any{
			"Alloc":      bToMb(m.Alloc),
			"TotalAlloc": bToMb(m.TotalAlloc),
			"tSys":       bToMb(m.Sys),
			"tNumGC":     m.NumGC,
			"goroutines": runtime.NumGoroutine(),
			"cachesize":  len(cacheOverall.Keys()),
			"cacheStars": len(cacheStars.Keys()),
		}

		// percent, _ := cpu.Percent(time.Second, true)
		// fmt.Printf("  User: %.2f\n", percent[cpu.CPUser])

		return c.JSON(res)
	})

	app.Get("/connections", func(c *fiber.Ctx) error {
		m := map[string]any{
			"open-connections": app.Server().GetOpenConnectionsCount(),
			"Sessions":         len(currentSessions.Sessions),
		}
		return c.JSON(m)
	})

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
			csvData, err := generateCSVData(repo, res.Stars)
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

	app.Get("/allStarsRequestStats", func(c *fiber.Ctx) error {
		date, requestCount, uniqueIPs, uniqueRepos := allStarsRequestStats.GetStats()

		data := map[string]any{
			"date":         date,
			"requestCount": requestCount,
			"uniqueIPs":    uniqueIPs,
			"uniqueRepos":  uniqueRepos,
		}

		return c.JSON(data)
	})

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

	host := getEnv("HOST", "0.0.0.0")
	port := getEnv("PORT", "8080")
	hostAddress := fmt.Sprintf("%s:%s", host, port)

	err = app.Listen(hostAddress)
	if err != nil {
		log.Panic(err)
	}
}
