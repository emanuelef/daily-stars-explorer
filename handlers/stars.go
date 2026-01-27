package handlers

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	cache "github.com/Code-Hex/go-generics-cache"
	"github.com/emanuelef/gh-repo-stats-server/config"
	"github.com/emanuelef/gh-repo-stats-server/session"
	"github.com/emanuelef/gh-repo-stats-server/types"
	"github.com/emanuelef/github-repo-activity-stats/repostats"
	"github.com/emanuelef/github-repo-activity-stats/stats"
	"github.com/gofiber/fiber/v2"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"golang.org/x/sync/errgroup"
)

// AllStarsHandler handles the /allStars endpoint
func AllStarsHandler(
	ghStatClients map[string]*repostats.ClientGQL,
	cacheStars *cache.Cache[string, types.StarsWithStatsResponse],
	onGoingStars map[string]bool,
	currentSessions *session.SessionsLock,
	requestStats *types.RequestStats,
	ctx context.Context,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		param := c.Query("repo")

		clientKeys := make([]string, 0, len(ghStatClients))
		for k := range ghStatClients {
			clientKeys = append(clientKeys, k)
		}
		randomIndex := rand.Intn(len(clientKeys))
		clientKey := c.Query("client", clientKeys[randomIndex])
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
		} else {
			// X-Forwarded-For can contain multiple IPs, get the first one (client IP)
			if commaIndex := strings.Index(ip, ","); commaIndex != -1 {
				ip = strings.TrimSpace(ip[:commaIndex])
			}
		}

		userAgent := c.Get("User-Agent")
		log.Printf("Request from IP: %s, Repo: %s User-Agent: %s\n", ip, repo, userAgent)

		// Track the request
		requestStats.RecordRequest(ip, repo)

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

		eg, localCtx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			var err error
			allStars, err = client.GetAllStarsHistoryTwoWays(localCtx, repo, updateChannel)
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

		res := types.StarsWithStatsResponse{
			Stars:         allStars,
			NewLast10Days: newLastNDays,
			MaxPeriods:    maxPeriods,
			MaxPeaks:      maxPeaks,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheStars.Set(repo, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingStars, repo)

		return c.JSON(res)
	}
}

// RecentStarsHandler handles the /recentStars endpoint
func RecentStarsHandler(
	ghStatClients map[string]*repostats.ClientGQL,
	cacheStars *cache.Cache[string, types.StarsWithStatsResponse],
	ctx context.Context,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		param := c.Query("repo")
		lastDaysStr := c.Query("lastDays", "30") // Default to 30 days if not provided

		clientKeys := make([]string, 0, len(ghStatClients))
		for k := range ghStatClients {
			clientKeys = append(clientKeys, k)
		}
		randomIndex := rand.Intn(len(clientKeys))
		clientKey := c.Query("client", clientKeys[randomIndex])

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
		var cachedRes types.StarsWithStatsResponse
		var found bool
		if cachedRes, found = cacheStars.Get(repo); found {
			cachedStars = cachedRes.Stars
		}

		// 3. Create a map to hold all stars data (both cached and recent)
		mergedMap := make(map[string]stats.StarsPerDay)
		for _, entry := range cachedStars {
			dayStr := time.Time(entry.Day).Format("02-01-2006")
			mergedMap[dayStr] = entry
		}

		// Do not add today when merging recentStars
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

		res := types.StarsWithStatsResponse{
			Stars:         mergedStars,
			NewLast10Days: newLastNDays,
			MaxPeriods:    maxPeriods,
			MaxPeaks:      maxPeaks,
		}

		if hasNewEntries {
			// Update cache only if there are new days
			now := time.Now()
			nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
			durationUntilEndOfDay := nextDay.Sub(now)
			cacheStars.Set(repo, res, cache.WithExpiration(durationUntilEndOfDay))
		}

		return c.JSON(res)
	}
}

// RecentStarsByHourHandler handles the /recentStarsByHour endpoint
func RecentStarsByHourHandler(
	ghStatClients map[string]*repostats.ClientGQL,
	cacheRecentStarsByHour *cache.Cache[string, []types.HourlyStars],
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		param := c.Query("repo")

		clientKeys := make([]string, 0, len(ghStatClients))
		for k := range ghStatClients {
			clientKeys = append(clientKeys, k)
		}
		randomIndex := rand.Intn(len(clientKeys))
		clientKey := c.Query("client", clientKeys[randomIndex])

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

		// Get lastDays parameter, default to 2
		lastDays, err := strconv.Atoi(c.Query("lastDays", "2"))
		if err != nil || lastDays < 1 {
			lastDays = 2
		}

		// Check cache first - cache key includes repo and lastDays
		cacheKey := fmt.Sprintf("%s:%d", repo, lastDays)
		if cachedResult, found := cacheRecentStarsByHour.Get(cacheKey); found {
			return c.JSON(cachedResult)
		}

		// Fetch data if not in cache
		starsPerHour, err := client.GetRecentStarsHistoryByHour(c.Context(), repo, lastDays, nil)
		if err != nil {
			log.Printf("Error getting stars by hour: %v", err)
			return c.Status(500).SendString("Internal Server Error")
		}

		// Convert to types.HourlyStars format
		out := make([]types.HourlyStars, len(starsPerHour))
		for i, h := range starsPerHour {
			out[i] = types.HourlyStars{
				Hour:       time.Time(h.Hour).UTC().Format(time.RFC3339),
				Stars:      h.Stars,
				TotalStars: h.TotalStars,
			}
		}

		// Cache for 1 hour
		cacheRecentStarsByHour.Set(cacheKey, out, cache.WithExpiration(1*time.Hour))

		return c.JSON(out)
	}
}
