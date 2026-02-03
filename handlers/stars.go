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
		forceRefetch := c.Query("forceRefetch", "false") == "true"
		overrideClient := c.Query("client", "")

		clientKey, client := SelectBestClient(ctx, ghStatClients, overrideClient)
		if client == nil {
			return c.Status(500).SendString("No GitHub API client available")
		}
		log.Printf("AllStars using client: %s", clientKey)

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

		// Mark this client as busy during the long-running operation
		MarkClientBusy(clientKey, repo)

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
			MarkClientIdle(clientKey) // Mark client as available again
			log.Printf("Error fetching stars for %s: %v", repo, err)
			status, message := classifyGitHubError(err)
			return c.Status(status).SendString(message)
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
		MarkClientIdle(clientKey) // Mark client as available after successful completion

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
		overrideClient := c.Query("client", "")

		clientKey, client := SelectBestClient(ctx, ghStatClients, overrideClient)
		if client == nil {
			return c.Status(500).SendString("No GitHub API client available")
		}
		log.Printf("RecentStars using client: %s", clientKey)

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

// RecentStarsByHourHandler handles the /recentStarsByHour endpoint with incremental caching
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

		// Cache key is just the repo (not including lastDays) for incremental updates
		cacheKey := repo

		// Get cached hourly data
		var cachedHourly []types.HourlyStars
		var oldestCachedTime time.Time
		var newestCachedTime time.Time

		if cached, found := cacheRecentStarsByHour.Get(cacheKey); found {
			log.Printf("[CACHE HIT] %s: found %d hours in cache", repo, len(cached))
			cachedHourly = cached
			if len(cachedHourly) > 0 {
				// Find oldest and newest hours in cache
				for i, h := range cachedHourly {
					t, parseErr := time.Parse(time.RFC3339, h.Hour)
					if parseErr != nil {
						continue
					}
					if i == 0 {
						oldestCachedTime = t
						newestCachedTime = t
					} else {
						if t.Before(oldestCachedTime) {
							oldestCachedTime = t
						}
						if t.After(newestCachedTime) {
							newestCachedTime = t
						}
					}
				}
				log.Printf("[CACHE BOUNDS] %s: oldest=%v, newest=%v", repo, oldestCachedTime.Format(time.RFC3339), newestCachedTime.Format(time.RFC3339))
			}
		} else {
			log.Printf("[CACHE MISS] %s: no data in cache", repo)
		}

		// Calculate what time range we need to fetch
		requestedStartTime := time.Now().UTC().AddDate(0, 0, -lastDays)

		// Allow overriding requestedStartTime with 'since' parameter
		if sinceStr := c.Query("since"); sinceStr != "" {
			if t, err := time.Parse(time.RFC3339, sinceStr); err == nil {
				requestedStartTime = t
			}
		}

		log.Printf("[REQUEST] %s: lastDays=%d, requestedStart=%v, now=%v", repo, lastDays, requestedStartTime.Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339))
		var starsPerHour []stats.StarsPerHour

		// Use a background context with timeout for the GitHub API call
		// This prevents the fetch from being cancelled if the HTTP request times out (e.g. 504 Gateway Timeout)
		// allowing the cache to be populated for subsequent requests.
		// Increased to 20 minutes for very large repos (e.g., openclaw with many stars)
		bgCtx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
		defer cancel()

		if len(cachedHourly) == 0 {
			// No cache - fetch full requested range
			log.Printf("[FETCH FULL] %s: fetching %d days from %v to now", repo, lastDays, requestedStartTime.Format(time.RFC3339))
			starsPerHour, err = client.GetRecentStarsHistoryByHourRange(
				bgCtx,
				repo,
				requestedStartTime,
				// Workaround: Pass now+1h to ensure the current partial hour is included.
				time.Now().UTC().Add(time.Hour),
				nil,
			)
			if err != nil {
				log.Printf("Error getting stars by hour: %v", err)
				return c.Status(500).SendString("Internal Server Error")
			}
		} else {
			// We have cache - determine what's missing
			needsOlderData := oldestCachedTime.After(requestedStartTime)
			log.Printf("[CACHE ANALYSIS] %s: oldestCached=%v, requestedStart=%v, needsOlder=%v",
				repo, oldestCachedTime.Format(time.RFC3339), requestedStartTime.Format(time.RFC3339), needsOlderData)

			// Determine if we need to fetch newer data
			// If 'complete' param is true, we only care about data up to the last full hour
			// If the cache contains the last full hour (or more), we skip fetching newer data
			completeOnly := c.Query("complete") == "true"
			now := time.Now().UTC()
			var needsNewerData bool

			if completeOnly {
				// We want data up to Truncated Hour
				targetEnd := now.Truncate(time.Hour)
				// If cache newest timestamp covers >= targetEnd - small_buffer, we are good
				// Actually cache timestamps are hour starts. So if newestCachedTime >= now.Truncate(Hour) - 1hr,
				// it means we have the data for the hour slot PRIOR to the current one?
				// Example: Now 10:45. Truncate -> 10:00.
				// We want 09:00 bar. 09:00 bar has timestamp 09:00.
				// If newestCachedTime is 09:00, we have data up to 10:00 exclusive.
				// So if newestCachedTime >= now.Truncate(Hour).Add(-time.Hour), we have latest COMPLETE hour.

				threshold := targetEnd.Add(-1 * time.Hour)
				if newestCachedTime.After(threshold) || newestCachedTime.Equal(threshold) {
					needsNewerData = false
					log.Printf("[FRESHNESS] %s: requesting complete only, cache has newest=%v (>= %v), skipping update", repo, newestCachedTime, threshold)
				} else {
					needsNewerData = true
					log.Printf("[FRESHNESS] %s: requesting complete only, cache stale (newest=%v < %v), fetching update", repo, newestCachedTime, threshold)
				}
			} else {
				// Always fetch newer data to get real-time updates up to current second
				needsNewerData = true
			}

			timeSinceNewest := now.Sub(newestCachedTime) // Use now.Sub() for more reliable calculation

			// Sanity check: if newestCachedTime is in the future, reset it
			if timeSinceNewest < 0 {
				log.Printf("[WARN] %s: newestCachedTime is in future! Resetting. newestCached=%v, now=%v",
					repo, newestCachedTime.Format(time.RFC3339), now.Format(time.RFC3339))
				// Reset to a safe past time to ensure we fetch correct data.
				// We subtract 1 hour from Now to ensure we at least have the previous full hour anchor.
				newestCachedTime = now.Add(-1 * time.Hour).Truncate(time.Hour)
			}

			log.Printf("[FRESHNESS] %s: timeSinceNewest=%.1f min, always fetching newer data",
				repo, timeSinceNewest.Minutes())

			var olderData []stats.StarsPerHour
			var newerData []stats.StarsPerHour

			if needsOlderData {
				// Fetch older data: from requestedStartTime to oldestCachedTime
				log.Printf("[FETCH OLDER] %s: from %v to %v",
					repo, requestedStartTime.Format(time.RFC3339), oldestCachedTime.Format(time.RFC3339))
				olderData, err = client.GetRecentStarsHistoryByHourRange(
					bgCtx,
					repo,
					requestedStartTime,
					oldestCachedTime,
					nil,
				)
				if err != nil {
					log.Printf("[ERROR OLDER] %s: %v", repo, err)
					return c.Status(500).SendString("Internal Server Error")
				}
			}

			if needsNewerData {
				// Fetch newer data starting from the last cached hour.
				// We re-fetch the last cached hour because it might have been cached when it was partial (incomplete).
				// We do NOT go back further (-1h) as that would re-fetch a likely complete hour repeatedly.
				fetchFrom := newestCachedTime

				log.Printf("[FETCH NEWER] %s: from %v to %v",
					repo, fetchFrom.Format(time.RFC3339), now.Format(time.RFC3339))
				// Workaround: Pass now+1h to ensure the current partial hour is included.
				// The library truncates endTime to the hour and uses strict inequality (< truncatedTime),
				// which excludes stars in the current hour if we just pass 'now'.
				newerData, err = client.GetRecentStarsHistoryByHourRange(
					bgCtx,
					repo,
					fetchFrom,
					now.Add(time.Hour),
					nil,
				)
				if err != nil {
					log.Printf("[ERROR NEWER] %s: %v", repo, err)
					// Don't fail the whole request, just use cached data
					newerData = []stats.StarsPerHour{}
				}
			}

			// Combine older and newer data
			starsPerHour = append(olderData, newerData...)
			log.Printf("[MERGE INPUT] %s: %d older + %d newer = %d total fetched",
				repo, len(olderData), len(newerData), len(starsPerHour))
		}

		// Convert new data to types.HourlyStars format
		newHourly := make([]types.HourlyStars, len(starsPerHour))
		for i, h := range starsPerHour {
			hourStr := time.Time(h.Hour).UTC().Format(time.RFC3339)
			newHourly[i] = types.HourlyStars{
				Hour:       hourStr,
				Stars:      h.Stars,
				TotalStars: h.TotalStars,
			}
			if h.Stars > 0 {
				log.Printf("Fetched hour %s: %d stars", hourStr, h.Stars)
			}
		}

		// Merge with cached data (newer data overwrites older)
		mergedMap := make(map[string]types.HourlyStars)

		// Add cached data first
		for _, h := range cachedHourly {
			mergedMap[h.Hour] = h
		}
		log.Printf("[MERGE] %s: added %d cached hours to map", repo, len(cachedHourly))

		// Add/overwrite with new data
		for _, h := range newHourly {
			mergedMap[h.Hour] = h
		}
		log.Printf("[MERGE] %s: overwrote with %d new hours, map size: %d", repo, len(newHourly), len(mergedMap))

		// Convert back to slice
		allHourly := make([]types.HourlyStars, 0, len(mergedMap))
		// Filter out any future hours that might have crept in (sanity check)
		now := time.Now().UTC()
		nowNextHour := now.Truncate(time.Hour).Add(time.Hour)

		for _, h := range mergedMap {
			// Parse hour to check sanity
			if t, err := time.Parse(time.RFC3339, h.Hour); err == nil {
				if t.After(nowNextHour) || (t.After(now) && !t.Equal(now.Truncate(time.Hour))) {
					// Skip strictly future hours.
					// t > now IS allowed ONLY if t == currentHourStart (partial hour).
					// Actually, currentHourStart <= now. So t can never be > now if t is an hour start.
					// e.g. Now=16:16. CurrentHour=16:00. 16:00 < 16:16.
					// NextHour=17:00. 17:00 > 16:16.
					// So any hour start > now should be excluded.
					// Wait, strictly speaking > now?
					// If Now=16:16.
					// 16:00 is OK.
					// 17:00 is Future.
					if t.After(now) {
						continue
					}
				}
			}
			allHourly = append(allHourly, h)
		}

		// Sort by hour
		sort.Slice(allHourly, func(i, j int) bool {
			return allHourly[i].Hour < allHourly[j].Hour
		})

		// Recalculate cumulative totals (including current partial hour)
		if len(allHourly) > 0 {
			runningTotal := 0
			for i := range allHourly {
				runningTotal += allHourly[i].Stars
				allHourly[i].TotalStars = runningTotal
			}
		}

		// Cache the full result (including current hour for faster subsequent requests)
		// The current hour will be overwritten on next fetch with updated data
		cacheRecentStarsByHour.Set(cacheKey, allHourly, cache.WithExpiration(7*24*time.Hour))

		// Filter to requested period before returning
		now = time.Now().UTC()
		cutoffTime := requestedStartTime
		completeOnly := c.Query("complete") == "true"

		log.Printf("[FILTER] %s: cutoff=%v, now=%v, filtering from %d hours",
			repo, cutoffTime.Format(time.RFC3339), now.Format(time.RFC3339), len(allHourly))
		filtered := make([]types.HourlyStars, 0, len(allHourly))
		var beforeCutoff, afterNow int

		// If completeOnly, we filter out any incomplete hours (current hour)
		// Current hour starts at now.Truncate(Hour)

		for _, h := range allHourly {
			t, parseErr := time.Parse(time.RFC3339, h.Hour)
			if parseErr != nil {
				continue
			}

			if completeOnly && !t.Before(now.Truncate(time.Hour)) {
				// Skip current (incomplete) hour or future
				continue
			}

			// Only include hours that are within the requested period and not in the future
			if t.Before(cutoffTime) {
				beforeCutoff++
			} else if t.After(now) {
				afterNow++
			} else {
				filtered = append(filtered, h)
			}
		}
		log.Printf("[RESULT] %s: returning %d (excluded: %d before cutoff, %d after now)", repo, len(filtered), beforeCutoff, afterNow)

		return c.JSON(filtered)
	}
}
