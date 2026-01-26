package handlers

import (
	"runtime"

	"github.com/emanuelef/gh-repo-stats-server/utils"
	"github.com/gofiber/fiber/v2"
)

func HealthHandler(c *fiber.Ctx) error {
	return c.Send(nil)
}

func RobotsHandler(c *fiber.Ctx) error {
	return c.SendString("User-agent: *\nDisallow: /")
}

func GCHandler(c *fiber.Ctx) error {
	runtime.GC()
	return c.Send(nil)
}

func InfosHandler(c *fiber.Ctx) error {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	res := map[string]any{
		"Alloc":      utils.BToMb(m.Alloc),
		"TotalAlloc": utils.BToMb(m.TotalAlloc),
		"tSys":       utils.BToMb(m.Sys),
		"tNumGC":     m.NumGC,
		"goroutines": runtime.NumGoroutine(),
	}

	return c.JSON(res)
}

func ConnectionsHandler(app *fiber.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		m := map[string]any{
			"open-connections": app.Server().GetOpenConnectionsCount(),
		}
		return c.JSON(m)
	}
}
