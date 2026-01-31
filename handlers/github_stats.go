package handlers

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"net/url"
	"strings"
	"time"

	cache "github.com/Code-Hex/go-generics-cache"
	"github.com/emanuelef/gh-repo-stats-server/config"
	"github.com/emanuelef/github-repo-activity-stats/repostats"
	"github.com/emanuelef/github-repo-activity-stats/stats"
	"github.com/gofiber/fiber/v2"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"golang.org/x/exp/maps"
)

// classifyGitHubError returns the appropriate HTTP status code and message based on the error
func classifyGitHubError(err error) (int, string) {
	errStr := strings.ToLower(err.Error())

	// Check for rate limit errors
	if strings.Contains(errStr, "rate limit") ||
		strings.Contains(errStr, "ratelimit") ||
		strings.Contains(errStr, "api rate") ||
		strings.Contains(errStr, "secondary rate") ||
		strings.Contains(errStr, "exceeded") {
		return 429, "GitHub API rate limit exceeded. Please try again later."
	}

	// Check for not found errors
	if strings.Contains(errStr, "not found") ||
		strings.Contains(errStr, "could not resolve") ||
		strings.Contains(errStr, "does not exist") {
		return 404, "Repository not found on GitHub"
	}

	// Check for authorization errors
	if strings.Contains(errStr, "unauthorized") ||
		strings.Contains(errStr, "bad credentials") ||
		strings.Contains(errStr, "401") {
		return 401, "GitHub API authorization error"
	}

	// Default to 500 for unknown errors
	return 500, "Internal server error while fetching GitHub data"
}

func AllReleasesHandler(
	ctx context.Context,
	ghStatClients map[string]*repostats.ClientGQL,
	cacheReleases *cache.Cache[string, []stats.ReleaseInfo],
) fiber.Handler {
	return func(c *fiber.Ctx) error {
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

		repo = fmt.Sprintf("%s", repo)
		repo = strings.ToLower(repo)

		ip := c.Get("X-Forwarded-For")
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("Request from IP: %s, Repo: %s, User-Agent: %s\n", ip, repo, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))

		cacheKey := repo + "_releases"

		if forceRefetch {
			cacheReleases.Delete(cacheKey)
		}

		if res, hit := cacheReleases.Get(cacheKey); hit {
			return c.JSON(res)
		}

		releases, err := client.GetAllReleasesFeed(ctx, repo)
		if err != nil {
			log.Printf("Error fetching releases for %s: %v", repo, err)
			status, message := classifyGitHubError(err)
			return c.Status(status).SendString(message)
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheReleases.Set(cacheKey, releases, cache.WithExpiration(durationUntilEndOfDay))

		return c.JSON(releases)
	}
}

func StatsHandler(
	ctx context.Context,
	ghStatClients map[string]*repostats.ClientGQL,
	cacheOverall *cache.Cache[string, *stats.RepoStats],
) fiber.Handler {
	return func(c *fiber.Ctx) error {
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
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheOverall.Set(repo, result, cache.WithExpiration(durationUntilEndOfDay))
		return c.JSON(result)
	}
}

func TotalStarsHandler(
	ctx context.Context,
	ghStatClients map[string]*repostats.ClientGQL,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
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
			log.Printf("Error getting total stars for %s: %v", repo, err)
			status, message := classifyGitHubError(err)
			return c.Status(status).SendString(message)
		}

		data := map[string]any{
			"stars":     stars,
			"createdAt": createdAt,
		}

		return c.JSON(data)
	}
}
