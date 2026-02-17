package news

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

type ShowHNPost struct {
	Title        string `json:"title"`
	URL          string `json:"url"`
	Points       int    `json:"points"`
	NumComments  int    `json:"num_comments"`
	CreatedAt    string `json:"created_at"`
	HNLink       string `json:"hn_link"`
	IsGitHubRepo bool   `json:"is_github_repo"`
	ObjectID     string `json:"object_id"`
}

// FetchShowHNGitHubPosts fetches Show HN posts from the last month that mention a GitHub repo
// sortBy can be "date" (default), "points", or "comments"
func FetchShowHNGitHubPosts(sortBy string) ([]ShowHNPost, error) {
	// Algolia API for HN: https://hn.algolia.com/api
	// Search for Show HN posts from the last 7 days
	end := time.Now()
	// Use a 7-day window to get recent posts
	start := end.AddDate(0, 0, -7)
	startUnix := start.Unix()
	endUnix := end.Unix()

	// Use search instead of search_by_date to get more relevant results
	baseURL := "https://hn.algolia.com/api/v1/search"

	// Number of pages to fetch (each page has 20 posts by default)
	// Fetch multiple pages to get more results
	maxPages := 5

	var allPosts []ShowHNPost

	// Fetch multiple pages of results
	for page := 0; page < maxPages; page++ {
		u, err := url.Parse(baseURL)
		if err != nil {
			return nil, fmt.Errorf("error parsing base URL: %w", err)
		}

		q := u.Query()
		q.Set("tags", "story,show_hn")
		q.Set("hitsPerPage", "100") // Request 100 items per page
		q.Set("page", fmt.Sprintf("%d", page))
		q.Set("numericFilters", fmt.Sprintf("created_at_i>%d,created_at_i<%d,points>3", startUnix, endUnix))
		u.RawQuery = q.Encode()

		apiURL := u.String()

		client := &http.Client{Timeout: 10 * time.Second}
		req, err := http.NewRequest("GET", apiURL, nil)
		if err != nil {
			return nil, fmt.Errorf("error creating request: %w", err)
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")
		req.Header.Set("Accept", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("error fetching HN posts (page %d): %w", page, err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			bodyBytes, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("received non-200 response (page %d): %d, body: %s", page, resp.StatusCode, string(bodyBytes))
		}

		var result struct {
			Hits []struct {
				ObjectID    string `json:"objectID"`
				Title       string `json:"title"`
				URL         string `json:"url"`
				Points      int    `json:"points"`
				NumComments int    `json:"num_comments"`
				Text        string `json:"story_text"`
				CreatedAt   string `json:"created_at"`
				CreatedAtI  int    `json:"created_at_i"`
			} `json:"hits"`
			NbHits      int `json:"nbHits"`
			NbPages     int `json:"nbPages"`
			Page        int `json:"page"`
			HitsPerPage int `json:"hitsPerPage"`
		}

		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("error reading response body (page %d): %w", page, err)
		}

		if err := json.Unmarshal(bodyBytes, &result); err != nil {
			return nil, fmt.Errorf("error decoding response (page %d): %w, body: %s", page, err, string(bodyBytes))
		}

		// Process hits from this page
		for _, hit := range result.Hits {
			// Check if this post links to GitHub or mentions GitHub in the title/URL
			isGitHubRepo := false

			// First check the URL for GitHub links
			if hit.URL != "" {
				parsedURL, err := url.Parse(hit.URL)

				// Direct GitHub links
				if err == nil && strings.Contains(strings.ToLower(parsedURL.Host), "github.com") {
					isGitHubRepo = true
				}

				// Links with "github" in the URL
				if !isGitHubRepo && strings.Contains(strings.ToLower(hit.URL), "github") {
					isGitHubRepo = true
				}
			}

			// Check title and text for GitHub mentions
			if !isGitHubRepo {
				if strings.Contains(strings.ToLower(hit.Title), "github") {
					isGitHubRepo = true
				} else if hit.Text != "" && strings.Contains(strings.ToLower(hit.Text), "github.com") {
					isGitHubRepo = true
				}
			}

			// Create HN discussion link
			hnLink := fmt.Sprintf("https://news.ycombinator.com/item?id=%s", hit.ObjectID)

			// Only include posts with GitHub URLs
			if isGitHubRepo {
				allPosts = append(allPosts, ShowHNPost{
					Title:        hit.Title,
					URL:          hit.URL,
					Points:       hit.Points,
					NumComments:  hit.NumComments,
					CreatedAt:    hit.CreatedAt,
					HNLink:       hnLink,
					IsGitHubRepo: true,
					ObjectID:     hit.ObjectID,
				})

				// Safety check to ensure we don't go over 500 posts total
				if len(allPosts) >= 500 {
					break
				}
			}
		}

		// If we've reached the last page or hit our limit, stop
		if result.Page >= result.NbPages-1 || len(result.Hits) == 0 || len(allPosts) >= 500 {
			break
		}

		// Add a small delay between requests to avoid rate limiting
		time.Sleep(200 * time.Millisecond)
	}

	// Use allPosts for sorting and returning
	posts := allPosts

	// Sort the posts based on the sortBy parameter
	switch sortBy {
	case "points":
		// Sort by points (highest first)
		sort.Slice(posts, func(i, j int) bool {
			return posts[i].Points > posts[j].Points
		})
	case "comments":
		// Sort by number of comments (highest first)
		sort.Slice(posts, func(i, j int) bool {
			return posts[i].NumComments > posts[j].NumComments
		})
	default:
		// Default: sort by date (most recent first)
		sort.Slice(posts, func(i, j int) bool {
			// Parse dates using RFC3339 format
			iTime, errI := time.Parse(time.RFC3339, posts[i].CreatedAt)
			jTime, errJ := time.Parse(time.RFC3339, posts[j].CreatedAt)

			// If we can't parse either date, fall back to string comparison
			if errI != nil || errJ != nil {
				return posts[i].CreatedAt > posts[j].CreatedAt
			}

			return iTime.After(jTime)
		})
	}

	return posts, nil
}
