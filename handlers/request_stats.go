package handlers

import (
	"github.com/gofiber/fiber/v2"
)

func RequestStatsHandler(stats interface {
	GetStats() (string, int, int, int)
}) fiber.Handler {
	return func(c *fiber.Ctx) error {
		date, requestCount, uniqueIPs, uniqueRepos := stats.GetStats()

		data := map[string]any{
			"date":         date,
			"requestCount": requestCount,
			"uniqueIPs":    uniqueIPs,
			"uniqueRepos":  uniqueRepos,
		}

		return c.JSON(data)
	}
}
