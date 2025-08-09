package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

func main() {
	// Try to find the specific post about Kitten TTS
	searchTerm := "Kitten TTS"

	// Set up API request
	baseURL := "https://hn.algolia.com/api/v1/search"
	u, err := url.Parse(baseURL)
	if err != nil {
		fmt.Printf("Error parsing URL: %v\n", err)
		os.Exit(1)
	}

	q := u.Query()
	q.Set("tags", "story,show_hn")
	q.Set("query", searchTerm)
	q.Set("hitsPerPage", "100")
	u.RawQuery = q.Encode()

	apiURL := u.String()
	fmt.Printf("Searching with URL: %s\n", apiURL)

	// Make the request
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

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		fmt.Printf("Received non-200 response: %d, body: %s\n", resp.StatusCode, string(bodyBytes))
		os.Exit(1)
	}

	// Parse the response
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("Error reading response: %v\n", err)
		os.Exit(1)
	}

	var result struct {
		Hits []struct {
			ObjectID    string `json:"objectID"`
			Title       string `json:"title"`
			URL         string `json:"url"`
			Points      int    `json:"points"`
			NumComments int    `json:"num_comments"`
			CreatedAt   string `json:"created_at"`
		} `json:"hits"`
	}

	if err := json.Unmarshal(bodyBytes, &result); err != nil {
		fmt.Printf("Error parsing JSON: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Found %d hits\n", len(result.Hits))

	// Display the results focusing on the Kitten TTS post
	for _, hit := range result.Hits {
		if strings.Contains(hit.Title, "Kitten TTS") {
			fmt.Printf("\nFound post: %s\n", hit.Title)
			fmt.Printf("URL: %s\n", hit.URL)
			fmt.Printf("Points: %d\n", hit.Points)
			fmt.Printf("Comments: %d\n", hit.NumComments)
			fmt.Printf("Created at: %s\n", hit.CreatedAt)
			fmt.Printf("Object ID: %s\n", hit.ObjectID)

			if hit.URL != "" {
				parsedURL, err := url.Parse(hit.URL)
				if err != nil {
					fmt.Printf("Error parsing URL: %v\n", err)
				} else {
					fmt.Printf("\nParsed URL components:\n")
					fmt.Printf("Scheme: %s\n", parsedURL.Scheme)
					fmt.Printf("Host: %s\n", parsedURL.Host)
					fmt.Printf("Path: %s\n", parsedURL.Path)

					pathParts := strings.Split(strings.TrimPrefix(parsedURL.Path, "/"), "/")
					fmt.Printf("Path parts count: %d\n", len(pathParts))

					for i, part := range pathParts {
						fmt.Printf("  Part %d: %s\n", i, part)
					}

					isGitHubRepo := strings.Contains(strings.ToLower(parsedURL.Host), "github.com") &&
						len(pathParts) >= 2 && pathParts[0] != "" && pathParts[1] != ""

					fmt.Printf("\nWould be detected as GitHub repo: %v\n", isGitHubRepo)
				}
			} else {
				fmt.Println("\nURL is empty")
			}
		}
	}
}
