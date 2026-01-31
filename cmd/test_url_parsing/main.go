package main

import (
	"bufio"
	"fmt"
	"net/url"
	"regexp"
	"strings"
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
	fmt.Println()

	for _, testURL := range testURLs {
		extracted := extractGitHubURL(testURL)
		fmt.Printf("Input:     %s\n", testURL)
		fmt.Printf("Extracted: %s\n", extracted)

		if extracted != "" {
			parsedURL, err := url.Parse(extracted)
			if err != nil {
				fmt.Printf("Error parsing URL: %v\n", err)
			} else {
				pathParts := strings.Split(strings.TrimPrefix(parsedURL.Path, "/"), "/")
				if len(pathParts) >= 2 {
					fmt.Printf("Repo:      %s/%s\n", pathParts[0], pathParts[1])
				}
			}
		}
		fmt.Println()
	}
}
