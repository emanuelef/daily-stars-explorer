package handlers

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	cache "github.com/Code-Hex/go-generics-cache"
	"github.com/emanuelef/gh-repo-stats-server/news"
	"github.com/emanuelef/gh-repo-stats-server/types"
	"github.com/emanuelef/gh-repo-stats-server/utils"
	"github.com/gofiber/fiber/v2"
)

func HackerNewsHandler(cacheHackerNews *cache.Cache[string, []news.Article]) fiber.Handler {
	return func(c *fiber.Ctx) error {
		query := c.Query("query", "golang")

		if res, hit := cacheHackerNews.Get(query); hit {
			return c.JSON(res)
		}

		limit, err := strconv.Atoi(c.Query("limit", "10"))
		if err != nil {
			return c.Status(400).SendString("Invalid limit parameter")
		}

		articles, err := news.FetchHackerNewsArticles(query, limit)
		if err != nil {
			log.Printf("Error fetching Hacker News articles: %v", err)
			return c.Status(500).SendString("Internal Server Error")
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(1 * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheHackerNews.Set(query, articles, cache.WithExpiration(durationUntilEndOfDay))

		return c.JSON(articles)
	}
}

func RedditHandler(cacheReddit *cache.Cache[string, []news.ArticleData]) fiber.Handler {
	return func(c *fiber.Ctx) error {
		query := c.Query("query", "golang")

		if res, hit := cacheReddit.Get(query); hit {
			return c.JSON(res)
		}

		limit, err := strconv.Atoi(c.Query("limit", "2"))
		if err != nil {
			return c.Status(400).SendString("Invalid limit parameter")
		}

		articles, err := news.FetchRedditPosts(query, limit)
		if err != nil {
			log.Printf("Error fetching Reddit articles: %v", err)
			return c.Status(500).SendString("Internal Server Error")
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(1 * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheReddit.Set(query, articles, cache.WithExpiration(durationUntilEndOfDay))

		return c.JSON(articles)
	}
}

func YouTubeHandler(cacheYouTube *cache.Cache[string, []news.YTVideoMetadata]) fiber.Handler {
	return func(c *fiber.Ctx) error {
		query := c.Query("query", "golang")

		if res, hit := cacheYouTube.Get(query); hit {
			return c.JSON(res)
		}

		limit, err := strconv.Atoi(c.Query("limit", "10"))
		if err != nil {
			return c.Status(400).SendString("Invalid limit parameter")
		}

		articles, err := news.FetchYouTubeVideos(query, limit)
		if err != nil {
			log.Printf("Error fetching YouTube videos: %v", err)
			return c.Status(500).SendString("Internal Server Error")
		}

		now := time.Now()
		nextDay := now.UTC().Truncate(24 * time.Hour).Add(1 * 24 * time.Hour)
		durationUntilEndOfDay := nextDay.Sub(now)

		cacheYouTube.Set(query, articles, cache.WithExpiration(durationUntilEndOfDay))

		return c.JSON(articles)
	}
}

func ShowHNHandler(cacheShowHN *cache.Cache[string, []news.ShowHNPost]) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sortBy := c.Query("sort", "date")

		validSort := sortBy == "date" || sortBy == "points" || sortBy == "comments"
		if !validSort {
			sortBy = "date"
		}

		minPointsStr := c.Query("min_points", "0")
		minCommentsStr := c.Query("min_comments", "0")

		minPoints, err := strconv.Atoi(minPointsStr)
		if err != nil || minPoints < 0 {
			minPoints = 0
		}

		minComments, err := strconv.Atoi(minCommentsStr)
		if err != nil || minComments < 0 {
			minComments = 0
		}

		cacheKey := fmt.Sprintf("showhn:%s", sortBy)

		var posts []news.ShowHNPost

		if res, hit := cacheShowHN.Get(cacheKey); hit {
			posts = res
		} else {
			var err error
			posts, err = news.FetchShowHNGitHubPosts(sortBy)
			if err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "error fetching Show HN posts: "+err.Error())
			}

			cacheShowHN.Set(cacheKey, posts, cache.WithExpiration(4*time.Hour))
		}

		if minPoints > 0 || minComments > 0 {
			filteredPosts := make([]news.ShowHNPost, 0)
			for _, post := range posts {
				if post.Points >= minPoints && post.NumComments >= minComments {
					filteredPosts = append(filteredPosts, post)
				}
			}
			posts = filteredPosts
		}

		return c.JSON(posts)
	}
}

func RedditReposHandler(cacheRedditGitHub *cache.Cache[string, []news.RedditGitHubPost]) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sortBy := c.Query("sort", "date")

		validSort := sortBy == "date" || sortBy == "points" || sortBy == "comments"
		if !validSort {
			sortBy = "date"
		}

		minPointsStr := c.Query("min_points", "0")
		minCommentsStr := c.Query("min_comments", "0")

		minPoints, err := strconv.Atoi(minPointsStr)
		if err != nil || minPoints < 0 {
			minPoints = 0
		}

		minComments, err := strconv.Atoi(minCommentsStr)
		if err != nil || minComments < 0 {
			minComments = 0
		}

		cacheKey := fmt.Sprintf("redditrepos:%s", sortBy)

		var posts []news.RedditGitHubPost

		if res, hit := cacheRedditGitHub.Get(cacheKey); hit {
			posts = res
		} else {
			var err error
			posts, err = news.FetchRedditGitHubPosts(sortBy)
			if err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "error fetching Reddit GitHub posts: "+err.Error())
			}

			cacheRedditGitHub.Set(cacheKey, posts, cache.WithExpiration(4*time.Hour))
		}

		if minPoints > 0 || minComments > 0 {
			filteredPosts := make([]news.RedditGitHubPost, 0)
			for _, post := range posts {
				if post.Points >= minPoints && post.NumComments >= minComments {
					filteredPosts = append(filteredPosts, post)
				}
			}
			posts = filteredPosts
		}

		return c.JSON(posts)
	}
}

func GitHubMentionsHandler(cacheGitHubMentions *cache.Cache[string, types.GitHubMentionsResponse]) fiber.Handler {
	return func(c *fiber.Ctx) error {
		repo := c.Query("repo", "")
		if repo == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "repo parameter is required (e.g., ?repo=owner/repo)",
			})
		}

		// Check cache first
		if res, hit := cacheGitHubMentions.Get(repo); hit {
			return c.JSON(res)
		}

		// Get limit parameter
		limit, err := strconv.Atoi(c.Query("limit", "50"))
		if err != nil || limit <= 0 {
			limit = 50
		}
		if limit > 100 {
			limit = 100
		}

		// Create GitHub client using PAT
		pat := os.Getenv("PAT")
		if pat == "" {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "GitHub PAT not configured",
			})
		}

		client := utils.NewClientWithPAT(pat)

		// Fetch mentions
		result, err := client.GetRepoMentions(context.Background(), repo, limit)
		if err != nil {
			log.Printf("Error fetching GitHub mentions for %s: %v", repo, err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to fetch GitHub mentions",
			})
		}

		// Convert to response type
		response := types.GitHubMentionsResponse{
			TargetRepo:        result.TargetRepo,
			TotalMentions:     result.TotalMentions,
			IssuesCount:       result.IssuesCount,
			PullRequestsCount: result.PullRequestsCount,
			DiscussionsCount:  result.DiscussionsCount,
			Mentions:          result.Mentions,
		}

		// Cache for 4 hours
		cacheGitHubMentions.Set(repo, response, cache.WithExpiration(4*time.Hour))

		return c.JSON(response)
	}
}
