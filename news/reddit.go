package news

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"
)

// Replace with your own client ID and client secret
var (
	ClientID     = os.Getenv("REDDIT_CLIENT_ID")
	ClientSecret = os.Getenv("REDDIT_CLIENT_SECRET")
	Username     = os.Getenv("REDDIT_USERNAME")
	Password     = os.Getenv("REDDIT_PASSWORD")
	UserAgent    = os.Getenv("REDDIT_USER_AGENT")
)

type TokenResponse struct {
	AccessToken string `json:"access_token"`
}

type PostData struct {
	Title       string  `json:"title"`
	SelfText    string  `json:"selftext"`
	Created     float64 `json:"created"`
	Ups         int     `json:"ups"`
	NumComments int     `json:"num_comments"`
	Permalink   string  `json:"permalink"`
}

type ArticleData struct {
	Title       string `json:"title"`
	Created     string `json:"created"`
	Ups         int    `json:"ups"`
	NumComments int    `json:"num_comments"`
	Url         string `json:"url"`
	Content     string `json:"content,omitempty"` // Add this field to store the content of the first post
}

type RedditResponse struct {
	Data struct {
		Children []struct {
			Data PostData `json:"data"`
		} `json:"children"`
	} `json:"data"`
}

func getRedditToken() (string, error) {
	client := &http.Client{}
	data := url.Values{}
	data.Set("grant_type", "password")
	data.Set("username", Username)
	data.Set("password", Password)

	req, err := http.NewRequest("POST", "https://www.reddit.com/api/v1/access_token", strings.NewReader(data.Encode()))
	if err != nil {
		return "", err
	}

	req.SetBasicAuth(ClientID, ClientSecret)
	req.Header.Set("User-Agent", UserAgent)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var tokenResponse TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResponse); err != nil {
		return "", err
	}

	return tokenResponse.AccessToken, nil
}

// Represent a GitHub repository post from Reddit
type RedditGitHubPost struct {
	Title        string `json:"title"`
	URL          string `json:"url"`    // GitHub repo URL if found, otherwise the post URL
	Points       int    `json:"points"` // Upvotes
	NumComments  int    `json:"num_comments"`
	CreatedAt    string `json:"created_at"`
	RedditLink   string `json:"reddit_link"`
	IsGitHubRepo bool   `json:"is_github_repo"`
	PostID       string `json:"post_id"`
	Subreddit    string `json:"subreddit"`
}

// Extract GitHub URL from post content
func extractGitHubURL(content string) string {
	// We'll just search for GitHub links directly in the content
	r := strings.NewReader(content)
	scanner := bufio.NewScanner(r)

	for scanner.Scan() {
		line := scanner.Text()
		matches := strings.Split(line, " ")
		for _, match := range matches {
			if strings.Contains(match, "github.com") && strings.Count(match, "/") >= 2 {
				// Ensure it starts with http/https
				if !strings.HasPrefix(match, "http") {
					match = "https://" + match
				}
				// Clean the URL (remove trailing characters)
				match = strings.TrimRight(match, ".,;:!?)")
				return match
			}
		}
	}
	return ""
}

// FetchRedditGitHubPosts fetches GitHub repos from specified subreddits from the last two weeks
func FetchRedditGitHubPosts(sortBy string) ([]RedditGitHubPost, error) {
	token, err := getRedditToken()
	if err != nil {
		return nil, err
	}

	client := &http.Client{}

	// List of subreddits to check
	subreddits := []string{"github", "opensource"}

	// Calculate dates for two weeks ago
	twoWeeksAgo := time.Now().AddDate(0, 0, -14)

	var allPosts []RedditGitHubPost

	// Get top posts from each subreddit
	for _, subreddit := range subreddits {
		params := url.Values{}
		params.Set("t", "week") // Get top posts from past week
		params.Set("limit", "100")

		req, err := http.NewRequest("GET", "https://oauth.reddit.com/r/"+subreddit+"/top?"+params.Encode(), nil)
		if err != nil {
			continue // Skip this subreddit if there's an error
		}

		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("User-Agent", UserAgent)

		resp, err := client.Do(req)
		if err != nil {
			continue // Skip this subreddit if there's an error
		}

		var redditResponse RedditResponse
		if err := json.NewDecoder(resp.Body).Decode(&redditResponse); err != nil {
			resp.Body.Close()
			continue // Skip this subreddit if there's an error
		}
		resp.Body.Close()

		// Process posts from this subreddit
		for _, child := range redditResponse.Data.Children {
			postCreatedAt := time.Unix(int64(child.Data.Created), 0)

			// Skip posts older than two weeks
			if postCreatedAt.Before(twoWeeksAgo) {
				continue
			}

			// Format created time
			createdAtFormatted := postCreatedAt.Format(time.RFC3339)

			// Create Reddit link
			redditLink := "https://www.reddit.com" + child.Data.Permalink

			// Check for GitHub links in title, selftext, or URL
			isGitHubPost := false
			githubURL := ""

			// Check post URL first
			if strings.Contains(strings.ToLower(child.Data.Permalink), "github.com") {
				isGitHubPost = true
				githubURL = child.Data.Permalink
			}

			// If not found in URL, check title and self text
			if !isGitHubPost {
				// Check in self text
				if child.Data.SelfText != "" {
					extractedURL := extractGitHubURL(child.Data.SelfText)
					if extractedURL != "" {
						isGitHubPost = true
						githubURL = extractedURL
					}
				}

				// Check in title if still not found
				if !isGitHubPost && strings.Contains(strings.ToLower(child.Data.Title), "github.com") {
					extractedURL := extractGitHubURL(child.Data.Title)
					if extractedURL != "" {
						isGitHubPost = true
						githubURL = extractedURL
					}
				}
			}

			// Add only posts with GitHub repos
			if isGitHubPost {
				post := RedditGitHubPost{
					Title:        child.Data.Title,
					URL:          githubURL,
					Points:       child.Data.Ups,
					NumComments:  child.Data.NumComments,
					CreatedAt:    createdAtFormatted,
					RedditLink:   redditLink,
					IsGitHubRepo: true,
					PostID:       redditLink, // Use Reddit permalink as ID
					Subreddit:    subreddit,
				}

				allPosts = append(allPosts, post)
			}
		}

		// Add a small delay between API calls
		time.Sleep(200 * time.Millisecond)
	}

	// Sort posts based on the specified criteria
	switch sortBy {
	case "points":
		// Sort by upvotes (highest first)
		sort.Slice(allPosts, func(i, j int) bool {
			return allPosts[i].Points > allPosts[j].Points
		})
	case "comments":
		// Sort by number of comments (highest first)
		sort.Slice(allPosts, func(i, j int) bool {
			return allPosts[i].NumComments > allPosts[j].NumComments
		})
	default:
		// Default: sort by date (most recent first)
		sort.Slice(allPosts, func(i, j int) bool {
			iTime, errI := time.Parse(time.RFC3339, allPosts[i].CreatedAt)
			jTime, errJ := time.Parse(time.RFC3339, allPosts[j].CreatedAt)

			// If we can't parse either date, fall back to string comparison
			if errI != nil || errJ != nil {
				return allPosts[i].CreatedAt > allPosts[j].CreatedAt
			}

			return iTime.After(jTime)
		})
	}

	return allPosts, nil
}

func FetchRedditPosts(query string, minUpvotes int) ([]ArticleData, error) {
	token, err := getRedditToken()
	if err != nil {
		return nil, err
	}

	client := &http.Client{}
	params := url.Values{}
	params.Set("q", query)
	params.Set("sort", "relevance")
	params.Set("limit", "120")

	req, err := http.NewRequest("GET", "https://oauth.reddit.com/search?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", UserAgent)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var redditResponse RedditResponse
	if err := json.NewDecoder(resp.Body).Decode(&redditResponse); err != nil {
		return nil, err
	}

	var articles []ArticleData

	for _, child := range redditResponse.Data.Children {
		if child.Data.Ups >= minUpvotes {
			createdAt := time.Unix(int64(child.Data.Created), 0).Format("2006-01-02 15:04:05")
			article := ArticleData{
				Title:       child.Data.Title,
				Created:     createdAt,
				Ups:         child.Data.Ups,
				NumComments: child.Data.NumComments,
				Url:         "https://www.reddit.com" + child.Data.Permalink,
			}

			if strings.Contains(strings.ToLower(child.Data.Title), strings.ToLower(query)) || strings.Contains(strings.ToLower(child.Data.SelfText), strings.ToLower(query)) {
				article.Content = child.Data.SelfText
				articles = append(articles, article)
			}
		}
	}

	return articles, nil
}
