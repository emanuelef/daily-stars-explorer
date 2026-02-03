package handlers

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"

	cache "github.com/Code-Hex/go-generics-cache"
	"github.com/emanuelef/gh-repo-stats-server/types"
	"github.com/emanuelef/gh-repo-stats-server/utils"
	"github.com/emanuelef/github-repo-activity-stats/stats"
	"github.com/gofiber/fiber/v2"
)

func AllKeysHandler(cacheOverall *cache.Cache[string, *stats.RepoStats]) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return c.JSON(cacheOverall.Keys())
	}
}

func AllStarsKeysHandler(cacheStars *cache.Cache[string, types.StarsWithStatsResponse]) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return c.JSON(cacheStars.Keys())
	}
}

func AllReleasesKeysHandler(cacheReleases *cache.Cache[string, []stats.ReleaseInfo]) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return c.JSON(cacheReleases.Keys())
	}
}

func CleanAllCacheHandler(
	cacheOverall *cache.Cache[string, *stats.RepoStats],
	cacheStars *cache.Cache[string, types.StarsWithStatsResponse],
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		cacheOverall.DeleteExpired()
		cacheStars.DeleteExpired()
		return c.Send(nil)
	}
}

func AllStarsCSVHandler(cacheStars *cache.Cache[string, types.StarsWithStatsResponse]) fiber.Handler {
	return func(c *fiber.Ctx) error {
		param := c.Query("repo")
		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		if res, hit := cacheStars.Get(repo); hit {
			csvData, err := utils.GenerateCSVData(repo, res.Stars)
			if err != nil {
				return c.Status(500).SendString("Internal Server Error")
			}

			c.Set("Content-Disposition", `attachment; filename="stars_history.csv"`)
			c.Set("Content-Type", "text/csv")

			return c.SendString(csvData)
		}

		return c.Status(404).SendString("Data not found")
	}
}

func StatusHandler(
	cacheStars *cache.Cache[string, types.StarsWithStatsResponse],
	onGoingStars map[string]bool,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		param := c.Query("repo")
		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		_, cached := cacheStars.Get(repo)
		_, onGoing := onGoingStars[repo]

		data := map[string]any{
			"cached":  cached,
			"onGoing": onGoing,
		}

		return c.JSON(data)
	}
}

func DeleteRecentStarsCacheHandler(cacheStars *cache.Cache[string, types.StarsWithStatsResponse]) fiber.Handler {
	return func(c *fiber.Ctx) error {
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
		repo = strings.ToLower(repo)

		cached, found := cacheStars.Get(repo)
		if !found {
			return c.Status(404).SendString("No cache for this repo")
		}

		if n >= len(cached.Stars) {
			cached.Stars = []stats.StarsPerDay{}
		} else {
			cached.Stars = cached.Stars[:len(cached.Stars)-n]
		}

		cacheStars.Set(repo, cached)

		return c.SendString(fmt.Sprintf("Removed last %d days from cache for repo %s.", n, repo))
	}
}
