package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

// Copy of the extractGitHubURL function for testing
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
		markdownLinkRegex := regexp.MustCompile(`\[.*?\]\((https?://)?github\.com/([^/\s]+/[^/\s]+)`)
		markdownMatches := markdownLinkRegex.FindStringSubmatch(line)
		if len(markdownMatches) > 2 {
			return "https://github.com/" + markdownMatches[2]
		}

		// Handle markdown nested in brackets
		// Example: [https://github.com/user/repo](https://github.com/user/repo)
		nestedMarkdownRegex := regexp.MustCompile(`\[(https?://)?github\.com/([^/\s\]]+/[^/\s\]]+)\]`)
		nestedMatches := nestedMarkdownRegex.FindStringSubmatch(line)
		if len(nestedMatches) > 2 {
			return "https://github.com/" + nestedMatches[2]
		}

		// Handle URLs with text prefixes like "months:", "Link]", etc.
		// Example: months: [https://github.com/user/repo](https://github.com/user/repo
		prefixedURLRegex := regexp.MustCompile(`(?:months:|Link[\]\)]|APK[\]\)]|GitHub:|Github[\]\)]|\⁦|https?://)?\s*(?:\[|\()?(?:https?://)?github\.com/([^/\s\]\)]+/[^/\s\]\)]+)`)
		prefixMatches := prefixedURLRegex.FindStringSubmatch(line)
		if len(prefixMatches) > 1 {
			// Clean the repo name from any trailing characters
			repoName := strings.TrimRight(prefixMatches[1], ".,;:!?)\\]\"")
			return "https://github.com/" + repoName
		}

		// Basic GitHub URL pattern as fallback
		basicURLRegex := regexp.MustCompile(`(?:https?://)?github\.com/([^/\s]+/[^/\s]+)`)
		basicMatches := basicURLRegex.FindStringSubmatch(line)
		if len(basicMatches) > 1 {
			// Clean the repo name from any trailing characters
			repoName := strings.TrimRight(basicMatches[1], ".,;:!?)\\]\"")
			return "https://github.com/" + repoName
		}
	}

	return ""
}

func main() {
	// Test cases from the provided data
	testURLs := []string{
		"https://months: [https://github.com/getlilac/lilac](https://github.com/getlilac/lilac",
		"https://[MCPJam](https://github.com/MCPJam/inspector",
		"https://[https://github.com/NevaMind-AI/memU](https://github.com/NevaMind-AI/memU",
		"https://⁦https://github.com/clidey/dory",
		"https://[Leaflet](https://github.com/Leaflet/Leaflet",
		"https://[https://github.com/TrueTheos/Aniki](https://github.com/TrueTheos/Aniki",
		"https://[https://github.com/spel987/PolyUploader](https://github.com/spel987/PolyUploader/",
		"https://github.com/naruaika/eruo-data-studio", // A proper URL for comparison
		"https://GitHub: [https://github.com/timoheimonen/securememo.app](https://github.com/timoheimonen/securememo.app",
		"https://[https://github.com/MCPJam/inspector](https://github.com/MCPJam/inspector",
		"https://(https://github.com/nsarathy/coffy",
		"https://[https://github.com/comma-compliance](https://github.com/comma-compliance",
		"https://Link](http://github.com/rohankishore/Schemix/",
		"https://APK](https://github.com/adeeteya/Awake-AlarmApp/releases/latest/download/Awake-Android.apk",
	}

	fmt.Println("Testing GitHub URL extraction...")

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
