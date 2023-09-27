package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"net/url"
	"os"
	"runtime"
	"sync"
	"time"

	//"github.com/emanuelef/gh-repo-stats-server/cache"
	cache "github.com/Code-Hex/go-generics-cache"
	"github.com/emanuelef/gh-repo-stats-server/otel_instrumentation"
	"github.com/emanuelef/gh-repo-stats-server/session"
	"github.com/emanuelef/github-repo-activity-stats/repostats"
	_ "github.com/joho/godotenv/autoload"
	"github.com/valyala/fasthttp"
	"golang.org/x/oauth2"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/gofiber/contrib/otelfiber"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
)

var tracer trace.Tracer

var currentSessions session.SessionsLock

func init() {
	tracer = otel.Tracer("github.com/emanuelef/gh-repo-stats-server")
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

	cacheOverall := cache.New[string, *repostats.RepoStats]()
	cacheStars := cache.New[string, []repostats.StarsPerDay]()

	tokenSource := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: os.Getenv("PAT")},
	)

	oauthClient := oauth2.NewClient(context.Background(), tokenSource)
	// client := repostats.NewClient(&oauthClient.Transport)
	client := repostats.NewClientGQL(oauthClient)

	app := fiber.New()

	app.Use(otelfiber.Middleware(otelfiber.WithNext(func(c *fiber.Ctx) bool {
		return c.Path() == "/health" || c.Path() == "/sse"
	})))

	app.Use(recover.New())
	app.Use(cors.New())
	app.Use(compress.New())

	// Just to check health and an example of a very frequent request
	// that we might not want to generate traces
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.Send(nil)
	})

	app.Get("/stats", func(c *fiber.Ctx) error {
		param := c.Query("repo")
		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		// needed because c.Query cannot be used as a map key
		repo = fmt.Sprintf("%s", repo)

		if res, hit := cacheOverall.Get(repo); hit {
			return c.JSON(res)
		}

		result, err := client.GetAllStats(ctx, repo)
		if err != nil {
			log.Printf("Error getting all stats %v", err)
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)
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

	app.Get("/allStars", func(c *fiber.Ctx) error {
		param := c.Query("repo")
		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		// needed because c.Query cannot be used as a map key
		repo = fmt.Sprintf("%s", repo)

		if res, hit := cacheStars.Get(repo); hit {
			return c.JSON(res)
		}

		result, err := client.GetAllStats(ctx, repo)
		if err != nil {
			log.Printf("Error getting all stats %v", err)
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		updateChannel := make(chan int)
		var allStars []repostats.StarsPerDay
		var wg sync.WaitGroup

		wg.Add(1) // Increment the WaitGroup counter

		go func() {
			defer wg.Done()
			allStars, _ = client.GetAllStarsHistory(ctx, repo, result.CreatedAt, updateChannel)
		}()

		for progress := range updateChannel {
			fmt.Printf("Progress: %d\n", progress)

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

		wg.Wait()

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheStars.Set(repo, allStars, cache.WithExpiration(durationUntilEndOfDay))
		return c.JSON(allStars)
	})

	app.Get("/limits", func(c *fiber.Ctx) error {
		result, err := client.GetCurrentLimits(ctx)
		if err != nil {
			log.Fatalf("Error getting limits %v", err)
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

	host := getEnv("HOST", "localhost")
	port := getEnv("PORT", "8080")
	hostAddress := fmt.Sprintf("%s:%s", host, port)

	err = app.Listen(hostAddress)
	if err != nil {
		log.Panic(err)
	}
}
