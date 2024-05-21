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
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2/middleware/pprof"

	//"github.com/emanuelef/gh-repo-stats-server/cache"
	cache "github.com/Code-Hex/go-generics-cache"
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

const DAY_CACHED = 7

type StarsWithStatsResponse struct {
	Stars         []stats.StarsPerDay   `json:"stars"`
	NewLast10Days int                   `json:"newLast10Days"`
	MaxPeriods    []repostats.MaxPeriod `json:"maxPeriods"`
	MaxPeaks      []repostats.PeakDay   `json:"maxPeaks"`
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

	onGoingStars := make(map[string]bool)

	ghStatClients := make(map[string]*repostats.ClientGQL)

	ghStatClients["PAT"] = NewClientWithPAT(os.Getenv("PAT"))
	ghStatClients["PAT2"] = NewClientWithPAT(os.Getenv("PAT2"))

	app := fiber.New()

	app.Use(pprof.New())

	app.Use(otelfiber.Middleware(otelfiber.WithNext(func(c *fiber.Ctx) bool {
		return c.Path() == "/health" || c.Path() == "/sse"
	})))

	rateLimiter := limiter.New(limiter.Config{
		Max:        40,            // Maximum number of requests allowed per hour
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
	app.Use(recover.New())
	app.Use(cors.New())
	app.Use(compress.New())

	// Just to check health and an example of a very frequent request
	// that we might not want to generate traces
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.Send(nil)
	})

	app.Get("/gc", func(c *fiber.Ctx) error {
		runtime.GC()
		return c.Send(nil)
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

	app.Get("/limits", func(c *fiber.Ctx) error {
		client, ok := ghStatClients["PAT"]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}
		result, err := client.GetCurrentLimits(ctx)
		if err != nil {
			log.Fatalf("Error getting limits %v", err)
		}

		client, ok = ghStatClients["PAT2"]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		tmpResult, err := client.GetCurrentLimits(ctx)
		if err != nil {
			log.Fatalf("Error getting limits %v", err)
		}

		result.Remaining += tmpResult.Remaining
		result.Limit += tmpResult.Limit

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
