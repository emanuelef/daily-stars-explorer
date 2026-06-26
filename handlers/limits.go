package handlers

import (
	"context"

	"github.com/emanuelef/github-repo-activity-stats/repostats"
	"github.com/gofiber/fiber/v2"
)

// LimitsHandler handles the /limits endpoint to check GitHub API rate limits
func LimitsHandler(
	ghStatClients map[string]*repostats.ClientGQL,
	ctx context.Context,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		client, ok := ghStatClients["PAT"]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		result, err := client.GetCurrentLimits(ctx)
		if err != nil {
			return fiber.NewError(fiber.StatusBadGateway, "error getting PAT limits: "+err.Error())
		}

		if client, ok = ghStatClients["PAT2"]; ok {
			tmpResult, err := client.GetCurrentLimits(ctx)
			if err != nil {
				return fiber.NewError(fiber.StatusBadGateway, "error getting PAT2 limits: "+err.Error())
			}

			result.Remaining += tmpResult.Remaining
			result.Limit += tmpResult.Limit
		}

		return c.JSON(result)
	}
}
