package main

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/emanuelef/gh-repo-stats-server/otel_instrumentation"
	"github.com/emanuelef/github-repo-activity-stats/repostats"
	_ "github.com/joho/godotenv/autoload"
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

// Cache represents an in-memory cache.
type Cache[T any] struct {
	mu    sync.Mutex
	items map[string]CacheItem[T]
}

// CacheItem represents an item stored in the cache.
type CacheItem[T any] struct {
	Value      T
	Expiration time.Time
}

// NewCache creates a new instance of the cache.
func NewCache[T any]() *Cache[T] {
	return &Cache[T]{
		items: make(map[string]CacheItem[T]),
	}
}

// Set adds an item to the cache with a specified key and expiration time.
func (c *Cache[T]) Set(key string, value T, expiration time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.items[key] = CacheItem[T]{
		Value:      value,
		Expiration: expiration,
	}
}

// Get retrieves an item from the cache by its key.
func (c *Cache[T]) Get(key string) (T, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	item, found := c.items[key]
	if !found {
		var zero T
		return zero, false
	}

	if item.Expiration.Before(time.Now()) {
		// Item has expired, remove it from the cache
		delete(c.items, key)
		var zero T
		return zero, false
	}

	return item.Value, true
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

	cache := NewCache[*repostats.RepoStats]()
	cacheStars := NewCache[[]repostats.StarsPerDay]()

	tokenSource := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: os.Getenv("PAT")},
	)

	oauthClient := oauth2.NewClient(context.Background(), tokenSource)
	// client := repostats.NewClient(&oauthClient.Transport)
	client := repostats.NewClientGQL(oauthClient)

	app := fiber.New()

	app.Use(otelfiber.Middleware(otelfiber.WithNext(func(c *fiber.Ctx) bool {
		return c.Path() == "/health"
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

		if res, hit := cache.Get(repo); hit {
			return c.JSON(res)
		}

		result, err := client.GetAllStats(ctx, repo)
		if err != nil {
			log.Printf("Error getting all stats %v", err)
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		nextDay := time.Now().UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)

		cache.Set(repo, result, nextDay)
		return c.JSON(result)
	})

	app.Get("/allStars", func(c *fiber.Ctx) error {
		param := c.Query("repo")
		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

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

		go func() {
			allStars, _ = client.GetAllStarsHistory(ctx, repo, result.CreatedAt, updateChannel)
		}()

		for progress := range updateChannel {
			fmt.Printf("Progress: %d\n", progress)
		}

		nextDay := time.Now().UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)

		cacheStars.Set(repo, allStars, nextDay)
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
			"cachesize":  len(cache.items),
		}

		// percent, _ := cpu.Percent(time.Second, true)
		// fmt.Printf("  User: %.2f\n", percent[cpu.CPUser])

		return c.JSON(res)
	})

	host := getEnv("HOST", "localhost")
	port := getEnv("PORT", "8080")
	hostAddress := fmt.Sprintf("%s:%s", host, port)

	err = app.Listen(hostAddress)
	if err != nil {
		log.Panic(err)
	}
}
