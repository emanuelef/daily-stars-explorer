package handlers

import (
	"fmt"
	"log"
	"strconv"
	"time"

	cache "github.com/Code-Hex/go-generics-cache"
	"github.com/emanuelef/gh-repo-stats-server/news"
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
