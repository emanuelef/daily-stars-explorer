package handlers

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	cache "github.com/Code-Hex/go-generics-cache"
	"github.com/emanuelef/gh-repo-stats-server/config"
	"github.com/emanuelef/gh-repo-stats-server/session"
	"github.com/emanuelef/gh-repo-stats-server/types"
	"github.com/emanuelef/github-repo-activity-stats/repostats"
	"github.com/emanuelef/github-repo-activity-stats/stats"
	"github.com/gofiber/fiber/v2"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"golang.org/x/sync/errgroup"
)

// AllIssuesHandler handles the /allIssues endpoint
func AllIssuesHandler(
	ghStatClients map[string]*repostats.ClientGQL,
	cacheIssues *cache.Cache[string, types.IssuesWithStatsResponse],
	onGoingIssues map[string]bool,
	currentSessions *session.SessionsLock,
	ctx context.Context,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		param := c.Query("repo")
		forceRefetch := c.Query("forceRefetch", "false") == "true"
		overrideClient := c.Query("client", "")

		clientKey, client := SelectBestClient(ctx, ghStatClients, overrideClient)
		if client == nil {
			return c.Status(500).SendString("No GitHub API client available")
		}

		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		repo = strings.ToLower(repo)
		repo = strings.Clone(repo) // Fiber's c.Query returns unsafe strings backed by a reusable buffer

		ip := c.Get("X-Forwarded-For")
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("Issues Request from IP: %s, Repo: %s User-Agent: %s, Client: %s\n", ip, repo, userAgent, clientKey)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))

		if forceRefetch {
			cacheIssues.Delete(repo)
		}

		if res, hit := cacheIssues.Get(repo); hit {
			return c.JSON(res)
		}

		if _, hit := onGoingIssues[repo]; hit {
			return c.SendStatus(fiber.StatusNoContent)
		}

		onGoingIssues[repo] = true

		updateChannel := make(chan int)
		var allIssues []stats.IssuesPerDay

		eg, localCtx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			var err error
			allIssues, err = client.GetAllIssuesHistory(localCtx, repo, updateChannel)
			if err != nil {
				return err
			}
			return nil
		})

		for progress := range updateChannel {
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
			delete(onGoingIssues, repo)
			return err
		}

		res := types.IssuesWithStatsResponse{
			Issues: allIssues,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheIssues.Set(repo, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingIssues, repo)

		return c.JSON(res)
	}
}

// AllForksHandler handles the /allForks endpoint
func AllForksHandler(
	ghStatClients map[string]*repostats.ClientGQL,
	cacheForks *cache.Cache[string, types.ForksWithStatsResponse],
	onGoingForks map[string]bool,
	currentSessions *session.SessionsLock,
	ctx context.Context,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		param := c.Query("repo")

		clientKeys := make([]string, 0, len(ghStatClients))
		for k := range ghStatClients {
			clientKeys = append(clientKeys, k)
		}
		randomIndex := rand.Intn(len(clientKeys))
		clientKey := c.Query("client", clientKeys[randomIndex])
		forceRefetch := c.Query("forceRefetch", "false") == "true"

		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		repo = strings.ToLower(repo)
		repo = strings.Clone(repo) // Fiber's c.Query returns unsafe strings backed by a reusable buffer

		ip := c.Get("X-Forwarded-For")
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("Forks Request from IP: %s, Repo: %s User-Agent: %s\n", ip, repo, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))

		if forceRefetch {
			cacheForks.Delete(repo)
		}

		if res, hit := cacheForks.Get(repo); hit {
			return c.JSON(res)
		}

		if _, hit := onGoingForks[repo]; hit {
			return c.SendStatus(fiber.StatusNoContent)
		}

		onGoingForks[repo] = true

		updateChannel := make(chan int)
		var allForks []stats.ForksPerDay

		eg, localCtx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			var err error
			allForks, err = client.GetAllForksHistory(localCtx, repo, updateChannel)
			if err != nil {
				return err
			}
			return nil
		})

		for progress := range updateChannel {
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
			delete(onGoingForks, repo)
			return err
		}

		res := types.ForksWithStatsResponse{
			Forks: allForks,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheForks.Set(repo, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingForks, repo)

		return c.JSON(res)
	}
}

// AllPRsHandler handles the /allPRs endpoint
func AllPRsHandler(
	ghStatClients map[string]*repostats.ClientGQL,
	cachePRs *cache.Cache[string, types.PRsWithStatsResponse],
	onGoingPRs map[string]bool,
	currentSessions *session.SessionsLock,
	ctx context.Context,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		param := c.Query("repo")

		clientKeys := make([]string, 0, len(ghStatClients))
		for k := range ghStatClients {
			clientKeys = append(clientKeys, k)
		}
		randomIndex := rand.Intn(len(clientKeys))
		clientKey := c.Query("client", clientKeys[randomIndex])
		forceRefetch := c.Query("forceRefetch", "false") == "true"

		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		repo = strings.ToLower(repo)
		repo = strings.Clone(repo) // Fiber's c.Query returns unsafe strings backed by a reusable buffer

		ip := c.Get("X-Forwarded-For")
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("PRs Request from IP: %s, Repo: %s User-Agent: %s\n", ip, repo, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))

		if forceRefetch {
			cachePRs.Delete(repo)
		}

		if res, hit := cachePRs.Get(repo); hit {
			return c.JSON(res)
		}

		if _, hit := onGoingPRs[repo]; hit {
			return c.SendStatus(fiber.StatusNoContent)
		}

		onGoingPRs[repo] = true

		updateChannel := make(chan int)
		var allPRs []stats.PRsPerDay

		eg, localCtx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			var err error
			allPRs, err = client.GetAllPRsHistory(localCtx, repo, updateChannel)
			if err != nil {
				return err
			}
			return nil
		})

		for progress := range updateChannel {
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
			delete(onGoingPRs, repo)
			return err
		}

		res := types.PRsWithStatsResponse{
			PRs: allPRs,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cachePRs.Set(repo, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingPRs, repo)

		return c.JSON(res)
	}
}

// AllCommitsHandler handles the /allCommits endpoint
func AllCommitsHandler(
	ghStatClients map[string]*repostats.ClientGQL,
	cacheCommits *cache.Cache[string, types.CommitsWithStatsResponse],
	onGoingCommits map[string]bool,
	currentSessions *session.SessionsLock,
	ctx context.Context,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		param := c.Query("repo")

		clientKeys := make([]string, 0, len(ghStatClients))
		for k := range ghStatClients {
			clientKeys = append(clientKeys, k)
		}
		randomIndex := rand.Intn(len(clientKeys))
		clientKey := c.Query("client", clientKeys[randomIndex])
		forceRefetch := c.Query("forceRefetch", "false") == "true"

		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		repo = strings.ToLower(repo)
		repo = strings.Clone(repo) // Fiber's c.Query returns unsafe strings backed by a reusable buffer

		ip := c.Get("X-Forwarded-For")
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("Commits Request from IP: %s, Repo: %s User-Agent: %s\n", ip, repo, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))

		if forceRefetch {
			cacheCommits.Delete(repo)
		}

		if res, hit := cacheCommits.Get(repo); hit {
			return c.JSON(res)
		}

		if _, hit := onGoingCommits[repo]; hit {
			return c.SendStatus(fiber.StatusNoContent)
		}

		onGoingCommits[repo] = true

		updateChannel := make(chan int)
		var allCommits []stats.CommitsPerDay
		var defaultBranch string

		eg, localCtx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			var err error
			allCommits, defaultBranch, err = client.GetAllCommitsHistory(localCtx, repo, updateChannel)
			if err != nil {
				return err
			}
			return nil
		})

		for progress := range updateChannel {
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
			delete(onGoingCommits, repo)
			return err
		}

		res := types.CommitsWithStatsResponse{
			Commits:       allCommits,
			DefaultBranch: defaultBranch,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheCommits.Set(repo, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingCommits, repo)

		return c.JSON(res)
	}
}

// AllContributorsHandler handles the /allContributors endpoint
func AllContributorsHandler(
	ghStatClients map[string]*repostats.ClientGQL,
	cacheContributors *cache.Cache[string, types.ContributorsWithStatsResponse],
	onGoingContributors map[string]bool,
	currentSessions *session.SessionsLock,
	ctx context.Context,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		param := c.Query("repo")

		clientKeys := make([]string, 0, len(ghStatClients))
		for k := range ghStatClients {
			clientKeys = append(clientKeys, k)
		}
		randomIndex := rand.Intn(len(clientKeys))
		clientKey := c.Query("client", clientKeys[randomIndex])
		forceRefetch := c.Query("forceRefetch", "false") == "true"

		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		repo, err := url.QueryUnescape(param)
		if err != nil {
			return err
		}

		repo = strings.ToLower(repo)
		repo = strings.Clone(repo) // Fiber's c.Query returns unsafe strings backed by a reusable buffer

		ip := c.Get("X-Forwarded-For")
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("Contributors Request from IP: %s, Repo: %s User-Agent: %s\n", ip, repo, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("github.repo", repo))
		span.SetAttributes(attribute.String("caller.ip", ip))

		if forceRefetch {
			cacheContributors.Delete(repo)
		}

		if res, hit := cacheContributors.Get(repo); hit {
			return c.JSON(res)
		}

		if _, hit := onGoingContributors[repo]; hit {
			return c.SendStatus(fiber.StatusNoContent)
		}

		onGoingContributors[repo] = true

		updateChannel := make(chan int)
		var allContributors []stats.NewContributorsPerDay

		eg, localCtx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			var err error
			allContributors, err = client.GetNewContributorsHistory(localCtx, repo, updateChannel)
			if err != nil {
				return err
			}
			return nil
		})

		for progress := range updateChannel {
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
			delete(onGoingContributors, repo)
			return err
		}

		res := types.ContributorsWithStatsResponse{
			Contributors: allContributors,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheContributors.Set(repo, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingContributors, repo)

		return c.JSON(res)
	}
}

// NewReposHandler handles the /newRepos endpoint
func NewReposHandler(
	ghStatClients map[string]*repostats.ClientGQL,
	cacheNewRepos *cache.Cache[string, types.NewReposWithStatsResponse],
	onGoingNewRepos map[string]bool,
	currentSessions *session.SessionsLock,
	ctx context.Context,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		startDate := c.Query("startDate")
		endDate := c.Query("endDate")
		includeForksStr := c.Query("includeForks", "false")

		clientKeys := make([]string, 0, len(ghStatClients))
		for k := range ghStatClients {
			clientKeys = append(clientKeys, k)
		}
		randomIndex := rand.Intn(len(clientKeys))
		clientKey := c.Query("client", clientKeys[randomIndex])
		forceRefetch := c.Query("forceRefetch", "false") == "true"

		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		parsedStartDate, err := time.Parse("2006-01-02", startDate)
		if err != nil {
			return c.Status(400).SendString("Invalid start date format")
		}

		parsedEndDate, err := time.Parse("2006-01-02", endDate)
		if err != nil {
			return c.Status(400).SendString("Invalid end date format")
		}

		includeForks, err := strconv.ParseBool(includeForksStr)
		if err != nil {
			includeForks = false
		}

		cacheKey := fmt.Sprintf("%s_%s_%t", startDate, endDate, includeForks)

		ip := c.Get("X-Forwarded-For")
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("NewRepos Request from IP: %s, StartDate: %s, EndDate: %s, IncludeForks: %t User-Agent: %s\n",
			ip, startDate, endDate, includeForks, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("start_date", startDate))
		span.SetAttributes(attribute.String("end_date", endDate))
		span.SetAttributes(attribute.String("caller.ip", ip))

		if forceRefetch {
			cacheNewRepos.Delete(cacheKey)
		}

		if res, hit := cacheNewRepos.Get(cacheKey); hit {
			return c.JSON(res)
		}

		if _, hit := onGoingNewRepos[cacheKey]; hit {
			return c.SendStatus(fiber.StatusNoContent)
		}

		onGoingNewRepos[cacheKey] = true

		updateChannel := make(chan int)
		var newRepos []stats.NewReposPerDay

		eg, localCtx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			var err error
			newRepos, err = client.GetNewReposCountHistory(localCtx, parsedStartDate, parsedEndDate, includeForks, updateChannel)
			if err != nil {
				return err
			}
			return nil
		})

		for progress := range updateChannel {
			wg := &sync.WaitGroup{}

			for _, s := range currentSessions.Sessions {
				wg.Add(1)
				go func(cs *session.Session) {
					defer wg.Done()
					if cs.Repo == cacheKey {
						cs.StateChannel <- progress
					}
				}(s)
			}
			wg.Wait()
		}

		if err := eg.Wait(); err != nil {
			delete(onGoingNewRepos, cacheKey)
			return err
		}

		res := types.NewReposWithStatsResponse{
			NewRepos: newRepos,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheNewRepos.Set(cacheKey, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingNewRepos, cacheKey)

		return c.JSON(res)
	}
}

// NewPRsHandler handles the /newPRs endpoint
func NewPRsHandler(
	ghStatClients map[string]*repostats.ClientGQL,
	cacheNewPRs *cache.Cache[string, types.NewPRsWithStatsResponse],
	onGoingNewPRs map[string]bool,
	currentSessions *session.SessionsLock,
	ctx context.Context,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		startDate := c.Query("startDate")
		endDate := c.Query("endDate")

		clientKeys := make([]string, 0, len(ghStatClients))
		for k := range ghStatClients {
			clientKeys = append(clientKeys, k)
		}
		randomIndex := rand.Intn(len(clientKeys))
		clientKey := c.Query("client", clientKeys[randomIndex])
		forceRefetch := c.Query("forceRefetch", "false") == "true"

		client, ok := ghStatClients[clientKey]
		if !ok {
			return c.Status(404).SendString("Resource not found")
		}

		parsedStartDate, err := time.Parse("2006-01-02", startDate)
		if err != nil {
			return c.Status(400).SendString("Invalid start date format")
		}

		parsedEndDate, err := time.Parse("2006-01-02", endDate)
		if err != nil {
			return c.Status(400).SendString("Invalid end date format")
		}

		cacheKey := fmt.Sprintf("newprs_%s_%s", startDate, endDate)

		ip := c.Get("X-Forwarded-For")
		if ip == "" {
			ip = c.IP()
		}

		userAgent := c.Get("User-Agent")
		log.Printf("NewPRs Request from IP: %s, StartDate: %s, EndDate: %s User-Agent: %s\n",
			ip, startDate, endDate, userAgent)

		if strings.Contains(userAgent, "python-requests") {
			return c.Status(404).SendString("Custom 404 Error: Resource not found")
		}

		span := trace.SpanFromContext(c.UserContext())
		span.SetAttributes(attribute.String("start_date", startDate))
		span.SetAttributes(attribute.String("end_date", endDate))
		span.SetAttributes(attribute.String("caller.ip", ip))

		if forceRefetch {
			cacheNewPRs.Delete(cacheKey)
		}

		if res, hit := cacheNewPRs.Get(cacheKey); hit {
			return c.JSON(res)
		}

		if _, hit := onGoingNewPRs[cacheKey]; hit {
			return c.SendStatus(fiber.StatusNoContent)
		}

		onGoingNewPRs[cacheKey] = true

		updateChannel := make(chan int)
		var newPRs []stats.NewPRsPerDay

		eg, localCtx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			var err error
			newPRs, err = client.GetNewPRsCountHistory(localCtx, parsedStartDate, parsedEndDate, updateChannel)
			if err != nil {
				return err
			}
			return nil
		})

		for progress := range updateChannel {
			wg := &sync.WaitGroup{}

			for _, s := range currentSessions.Sessions {
				wg.Add(1)
				go func(cs *session.Session) {
					defer wg.Done()
					if cs.Repo == cacheKey {
						cs.StateChannel <- progress
					}
				}(s)
			}
			wg.Wait()
		}

		if err := eg.Wait(); err != nil {
			delete(onGoingNewPRs, cacheKey)
			return err
		}

		res := types.NewPRsWithStatsResponse{
			NewPRs: newPRs,
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(config.DayCached * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheNewPRs.Set(cacheKey, res, cache.WithExpiration(durationUntilEndOfDay))
		delete(onGoingNewPRs, cacheKey)

		return c.JSON(res)
	}
}
