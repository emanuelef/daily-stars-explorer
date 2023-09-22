package main

import (
	"context"
	"fmt"
	"log"
	"os"

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

const (
	externalURL = "https://pokeapi.co/api/v2/pokemon/ditto"
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

	// Basic GET API to show the OtelFiber middleware is taking
	// care of creating the span when called
	app.Get("/hello", func(c *fiber.Ctx) error {
		result, err := client.GetAllStats(ctx, "kubernetes/kubernetes")
		if err != nil {
			log.Fatalf("Error getting all stats %v", err)
		}

		log.Println(result.Stars)

		return c.Send(nil)
	})

	app.Get("/limits", func(c *fiber.Ctx) error {
		result, err := client.GetCurrentLimits(ctx)
		if err != nil {
			log.Fatalf("Error getting limits %v", err)
		}

		return c.JSON(result)
	})

	host := getEnv("HOST", "localhost")
	port := getEnv("PORT", "8080")
	hostAddress := fmt.Sprintf("%s:%s", host, port)

	err = app.Listen(hostAddress)
	if err != nil {
		log.Panic(err)
	}
}
