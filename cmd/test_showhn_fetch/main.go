package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
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
	IsGitHubRepo bool   `json:"is_github_repo"`
	ObjectID     string `json:"object_id"`
}

func main() {
	// Time window - one month
	end := time.Now()
	start := end.AddDate(0, -1, 0)
	startUnix := start.Unix()
	endUnix := end.Unix()

	baseURL := "https://hn.algolia.com/api/v1/search_by_date"

	// Just fetch one page to test
	u, err := url.Parse(baseURL)
	if err != nil {
		fmt.Printf("Error parsing URL: %v\n", err)
		os.Exit(1)
	}

	q := u.Query()
	q.Set("tags", "story,show_hn")
	q.Set("hitsPerPage", "100")
	q.Set("numericFilters", fmt.Sprintf("created_at_i>%d,created_at_i<%d", startUnix, endUnix))
	u.RawQuery = q.Encode()

	apiURL := u.String()
	fmt.Printf("Fetching from URL: %s\n", apiURL)

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		fmt.Printf("Error creating request: %v\n", err)
		os.Exit(1)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("Error making request: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	var result struct {
		Hits []struct {
			ObjectID    string `json:"objectID"`
			Title       string `json:"title"`
			URL         string `json:"url"`
			Points      int    `json:"points"`
			NumComments int    `json:"num_comments"`
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
		fmt.Printf("Error reading response: %v\n", err)
		os.Exit(1)
	}

	if err := json.Unmarshal(bodyBytes, &result); err != nil {
		fmt.Printf("Error parsing JSON: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Found %d hits out of %d total hits, %d pages\n\n",
		len(result.Hits), result.NbHits, result.NbPages)

	var allPosts []ShowHNPost
	var kittenTTSFound bool

	for _, hit := range result.Hits {
		isGitHubRepo := false
		if hit.URL != "" {
			parsedURL, err := url.Parse(hit.URL)
			if err == nil && strings.Contains(strings.ToLower(parsedURL.Host), "github.com") {
				pathParts := strings.Split(strings.TrimPrefix(parsedURL.Path, "/"), "/")
				if len(pathParts) >= 2 && pathParts[0] != "" && pathParts[1] != "" {
					isGitHubRepo = true
				}
			}
		}

		post := ShowHNPost{
			Title:        hit.Title,
			URL:          hit.URL,
			Points:       hit.Points,
			NumComments:  hit.NumComments,
			CreatedAt:    hit.CreatedAt,
			IsGitHubRepo: isGitHubRepo,
			ObjectID:     hit.ObjectID,
		}

		// Check if this is the Kitten TTS post
		if strings.Contains(hit.Title, "Kitten TTS") {
			fmt.Printf("Found Kitten TTS post!\n")
			fmt.Printf("Title: %s\n", hit.Title)
			fmt.Printf("URL: %s\n", hit.URL)
			fmt.Printf("Points: %d\n", hit.Points)
			fmt.Printf("Comments: %d\n", hit.NumComments)
			fmt.Printf("Created at: %s\n", hit.CreatedAt)
			fmt.Printf("Created at timestamp: %d\n", hit.CreatedAtI)
			fmt.Printf("Is GitHub repo: %v\n", isGitHubRepo)
			kittenTTSFound = true
		}

		// Only add GitHub repos to our list
		if isGitHubRepo {
			allPosts = append(allPosts, post)
		}
	}

	if !kittenTTSFound {
		fmt.Println("Kitten TTS post was not found in the first page of results")
	}

	// Sort by points
	sort.Slice(allPosts, func(i, j int) bool {
		return allPosts[i].Points > allPosts[j].Points
	})

	fmt.Printf("\nTop GitHub repo posts by points:\n")
	for i, post := range allPosts {
		if i >= 10 {
			break
		}
		fmt.Printf("%d. %s - %d points, %d comments\n", i+1, post.Title, post.Points, post.NumComments)
		fmt.Printf("   URL: %s\n", post.URL)
	}
}
