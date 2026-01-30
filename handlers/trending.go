package handlers

import (
	"sort"
	"time"

	cache "github.com/Code-Hex/go-generics-cache"
	"github.com/emanuelef/gh-repo-stats-server/types"
	"github.com/gofiber/fiber/v2"
)

// TrendingRepo represents a repository with velocity metrics
type TrendingRepo struct {
	Repo           string  `json:"repo"`
	Stars1h        int     `json:"stars1h"`
	Stars24h       int     `json:"stars24h"`
	Stars7d        int     `json:"stars7d"`
	TotalStars     int     `json:"totalStars"`
	VelocityPerHour float64 `json:"velocityPerHour"`
	GrowthPercent  float64 `json:"growthPercent"`
	LastUpdated    string  `json:"lastUpdated"`
}

// TrendingHandler returns repos sorted by star velocity
func TrendingHandler(
	cacheRecentStarsByHour *cache.Cache[string, []types.HourlyStars],
	cacheStars *cache.Cache[string, types.StarsWithStatsResponse],
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		now := time.Now().UTC()

		// Time boundaries
		oneHourAgo := now.Add(-1 * time.Hour)
		oneDayAgo := now.Add(-24 * time.Hour)
		sevenDaysAgo := now.Add(-7 * 24 * time.Hour)

		// Get all repos from hourly cache
		repoKeys := cacheRecentStarsByHour.Keys()

		trending := make([]TrendingRepo, 0, len(repoKeys))

		for _, repo := range repoKeys {
			hourlyData, found := cacheRecentStarsByHour.Get(repo)
			if !found || len(hourlyData) == 0 {
				continue
			}

			var stars1h, stars24h, stars7d int
			var lastTotalStars int
			var lastUpdated string

			// Calculate stars in different time windows
			for _, h := range hourlyData {
				t, err := time.Parse(time.RFC3339, h.Hour)
				if err != nil {
					continue
				}

				if t.After(oneHourAgo) {
					stars1h += h.Stars
				}
				if t.After(oneDayAgo) {
					stars24h += h.Stars
				}
				if t.After(sevenDaysAgo) {
					stars7d += h.Stars
				}

				// Track the most recent data
				if h.TotalStars > lastTotalStars {
					lastTotalStars = h.TotalStars
					lastUpdated = h.Hour
				}
			}

			// If we don't have hourly total, try to get from daily cache
			if lastTotalStars == 0 {
				if dailyData, found := cacheStars.Get(repo); found && len(dailyData.Stars) > 0 {
					lastStar := dailyData.Stars[len(dailyData.Stars)-1]
					lastTotalStars = lastStar.TotalStars
				}
			}

			// Skip repos with no recent activity
			if stars24h == 0 && stars7d == 0 {
				continue
			}

			// Calculate velocity (stars per hour over last 24h)
			velocityPerHour := float64(stars24h) / 24.0

			// Calculate growth percentage (24h stars / total stars * 100)
			growthPercent := 0.0
			if lastTotalStars > 0 {
				growthPercent = (float64(stars24h) / float64(lastTotalStars)) * 100
			}

			trending = append(trending, TrendingRepo{
				Repo:           repo,
				Stars1h:        stars1h,
				Stars24h:       stars24h,
				Stars7d:        stars7d,
				TotalStars:     lastTotalStars,
				VelocityPerHour: velocityPerHour,
				GrowthPercent:  growthPercent,
				LastUpdated:    lastUpdated,
			})
		}

		// Sort by 24h stars (descending) by default
		sortBy := c.Query("sort", "stars24h")
		switch sortBy {
		case "stars1h":
			sort.Slice(trending, func(i, j int) bool {
				return trending[i].Stars1h > trending[j].Stars1h
			})
		case "stars24h":
			sort.Slice(trending, func(i, j int) bool {
				return trending[i].Stars24h > trending[j].Stars24h
			})
		case "stars7d":
			sort.Slice(trending, func(i, j int) bool {
				return trending[i].Stars7d > trending[j].Stars7d
			})
		case "velocity":
			sort.Slice(trending, func(i, j int) bool {
				return trending[i].VelocityPerHour > trending[j].VelocityPerHour
			})
		case "growth":
			sort.Slice(trending, func(i, j int) bool {
				return trending[i].GrowthPercent > trending[j].GrowthPercent
			})
		}

		// Limit results
		limit := c.QueryInt("limit", 50)
		if limit > 0 && len(trending) > limit {
			trending = trending[:limit]
		}

		return c.JSON(trending)
	}
}
