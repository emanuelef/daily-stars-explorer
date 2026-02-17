package news

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"regexp"
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
	URL         string  `json:"url"`
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
	if !strings.Contains(content, "github.com") {
		return ""
	}

	// Process content line by line for better control
	r := strings.NewReader(content)
	scanner := bufio.NewScanner(r)

	for scanner.Scan() {
		line := scanner.Text()

		// Handle markdown links with GitHub URLs - most common in Reddit posts
		// Example: [repo name](https://github.com/user/repo)
		markdownLinkRegex := regexp.MustCompile(`\[.*?\]\((https?://)?github\.com/([^/\s]+/[^/\s\)]+)`)
		markdownMatches := markdownLinkRegex.FindStringSubmatch(line)
		if len(markdownMatches) > 2 {
			return cleanGitHubURL("https://github.com/" + markdownMatches[2])
		}

		// Handle markdown nested in brackets
		// Example: [https://github.com/user/repo](https://github.com/user/repo)
		nestedMarkdownRegex := regexp.MustCompile(`\[(https?://)?github\.com/([^/\s\]]+/[^/\s\]]+)\]`)
		nestedMatches := nestedMarkdownRegex.FindStringSubmatch(line)
		if len(nestedMatches) > 2 {
			return cleanGitHubURL("https://github.com/" + nestedMatches[2])
		}

		// Handle URLs with text prefixes like "months:", "Link]", etc.
		// Example: months: [https://github.com/user/repo](https://github.com/user/repo
		prefixedURLRegex := regexp.MustCompile(`(?:months:|Link[\]\)]|APK[\]\)]|GitHub:|Github[\]\)]|https?://)?\s*(?:\[|\()?(?:https?://)?github\.com/([^/\s\]\)]+/[^/\s\]\)]+)`)
		prefixMatches := prefixedURLRegex.FindStringSubmatch(line)
		if len(prefixMatches) > 1 {
			return cleanGitHubURL("https://github.com/" + prefixMatches[1])
		}

		// Basic GitHub URL pattern as fallback
		basicURLRegex := regexp.MustCompile(`(?:https?://)?github\.com/([^/\s]+/[^/\s]+)`)
		basicMatches := basicURLRegex.FindStringSubmatch(line)
		if len(basicMatches) > 1 {
			return cleanGitHubURL("https://github.com/" + basicMatches[1])
		}
	}

	return ""
}

// Helper function to clean GitHub URLs
func cleanGitHubURL(url string) string {
	// Clean trailing characters that aren't part of repository names
	url = strings.TrimRight(url, ".,;:!?)\"")

	// Extract just the owner and repo name
	parts := strings.Split(url, "github.com/")
	if len(parts) < 2 {
		return url
	}

	repoPath := parts[1]
	// Split by / and take just the owner/repo part
	repoParts := strings.Split(repoPath, "/")
	if len(repoParts) < 2 {
		return url
	}

	// Handle some special cases with trailing characters
	owner := repoParts[0]
	repo := repoParts[1]

	// Remove trailing parenthesis or other punctuation from repo name
	repo = strings.TrimRight(repo, ".,;:!?)\"")
	repo = strings.Split(repo, "?")[0]
	repo = strings.Split(repo, "#")[0]

	// Return the clean URL
	return "https://github.com/" + owner + "/" + repo
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
			if extractedURL := extractGitHubURL(child.Data.URL); extractedURL != "" {
				isGitHubPost = true
				githubURL = extractedURL
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

func FetchRedditPosts(query string, minUpvotes int, strict bool) ([]ArticleData, error) {
	token, err := getRedditToken()
	if err != nil {
		return nil, err
	}

	client := &http.Client{}
	owner, repo := parseRepoQuery(query)
	searchQueries := buildRedditSearchQueries(query, owner, repo)
	allPosts := make([]PostData, 0)
	seenPermalinks := make(map[string]struct{})

	for _, searchQuery := range searchQueries {
		searchResults, err := searchRedditPosts(client, token, searchQuery)
		if err != nil {
			return nil, err
		}

		for _, post := range searchResults {
			if post.Permalink == "" {
				continue
			}
			if _, seen := seenPermalinks[post.Permalink]; seen {
				continue
			}

			seenPermalinks[post.Permalink] = struct{}{}
			allPosts = append(allPosts, post)
		}
	}

	var articles []ArticleData

	for _, post := range allPosts {
		if post.Ups < minUpvotes {
			continue
		}

		if !matchesRepoQuery(post, owner, repo, strict) {
			continue
		}

		createdAt := time.Unix(int64(post.Created), 0).Format("2006-01-02 15:04:05")
		article := ArticleData{
			Title:       post.Title,
			Created:     createdAt,
			Ups:         post.Ups,
			NumComments: post.NumComments,
			Url:         "https://www.reddit.com" + post.Permalink,
			Content:     post.SelfText,
		}

		articles = append(articles, article)
	}

	return articles, nil
}

func searchRedditPosts(client *http.Client, token string, query string) ([]PostData, error) {
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

	posts := make([]PostData, 0, len(redditResponse.Data.Children))
	for _, child := range redditResponse.Data.Children {
		posts = append(posts, child.Data)
	}

	return posts, nil
}

func parseRepoQuery(query string) (string, string) {
	normalized := strings.ToLower(strings.TrimSpace(query))
	normalized = strings.Trim(normalized, "\"'")

	prefixes := []string{
		"https://github.com/",
		"http://github.com/",
		"https://www.github.com/",
		"http://www.github.com/",
		"www.github.com/",
		"github.com/",
	}
	for _, prefix := range prefixes {
		normalized = strings.TrimPrefix(normalized, prefix)
	}
	normalized = strings.TrimPrefix(normalized, "/")
	normalized = strings.TrimSuffix(normalized, "/")

	parts := strings.Split(normalized, "/")
	if len(parts) < 2 {
		return "", normalized
	}

	owner := strings.TrimSpace(parts[0])
	repo := strings.TrimSpace(parts[1])
	repo = strings.Split(repo, "?")[0]
	repo = strings.Split(repo, "#")[0]

	return owner, repo
}

func buildRedditSearchQueries(rawQuery string, owner string, repo string) []string {
	seen := make(map[string]struct{})
	queries := make([]string, 0, 3)

	appendQuery := func(q string) {
		q = strings.TrimSpace(q)
		if q == "" {
			return
		}
		if _, exists := seen[q]; exists {
			return
		}
		seen[q] = struct{}{}
		queries = append(queries, q)
	}

	if owner != "" && repo != "" {
		appendQuery(fmt.Sprintf("github.com/%s/%s", owner, repo))
		appendQuery(fmt.Sprintf("\"%s/%s\"", owner, repo))
		appendQuery(repo)
		return queries
	}

	appendQuery(strings.TrimSpace(rawQuery))
	if repo != "" {
		appendQuery(repo)
	}

	return queries
}

func matchesRepoQuery(post PostData, owner string, repo string, strict bool) bool {
	text := strings.ToLower(strings.Join([]string{
		post.Title,
		post.SelfText,
		post.URL,
	}, " "))

	if repo == "" {
		return false
	}

	if !strict {
		if owner != "" && containsOwnerRepoMention(text, owner, repo) {
			return true
		}
		return strings.Contains(text, repo)
	}

	if owner != "" {
		return containsOwnerRepoMention(text, owner, repo)
	}

	if containsGitHubRepoURLWithRepo(text, repo) {
		return true
	}

	if !containsRepoToken(text, repo) {
		return false
	}

	return strings.Contains(text, "github")
}

func containsOwnerRepoMention(text string, owner string, repo string) bool {
	pattern := fmt.Sprintf(`(?:github\.com/)?%s/%s(?:[/?#\s\)\]\},;:.!]|$)`,
		regexp.QuoteMeta(owner),
		regexp.QuoteMeta(repo),
	)

	return regexp.MustCompile(pattern).MatchString(text)
}

func containsGitHubRepoURLWithRepo(text string, repo string) bool {
	pattern := fmt.Sprintf(`github\.com/[^/\s]+/%s(?:[/?#\s\)\]\},;:.!]|$)`,
		regexp.QuoteMeta(repo),
	)

	return regexp.MustCompile(pattern).MatchString(text)
}

func containsRepoToken(text string, repo string) bool {
	pattern := fmt.Sprintf(`(^|[^a-z0-9])%s([^a-z0-9]|$)`, regexp.QuoteMeta(repo))
	return regexp.MustCompile(pattern).MatchString(text)
}
