package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

func main() {
	// Direct search for the Kitten TTS post using its object ID from our earlier search
	objectID := "44807868"

	apiURL := fmt.Sprintf("https://hn.algolia.com/api/v1/items/%s", objectID)
	fmt.Printf("Fetching from URL: %s\n", apiURL)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		fmt.Printf("Error making request: %v\n", err)
		return
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("Error reading response: %v\n", err)
		return
	}

	var item struct {
		ID         int    `json:"id"`
		Title      string `json:"title"`
		URL        string `json:"url"`
		Points     int    `json:"points"`
		CreatedAt  string `json:"created_at"`
		CreatedAtI int    `json:"created_at_i"`
	}

	if err := json.Unmarshal(bodyBytes, &item); err != nil {
		fmt.Printf("Error parsing JSON: %v\n", err)
		return
	}

	fmt.Printf("Item details:\n")
	fmt.Printf("ID: %d\n", item.ID)
	fmt.Printf("Title: %s\n", item.Title)
	fmt.Printf("URL: %s\n", item.URL)
	fmt.Printf("Points: %d\n", item.Points)
	fmt.Printf("Created at: %s\n", item.CreatedAt)
	fmt.Printf("Created at timestamp: %d\n", item.CreatedAtI)

	// Check if this is a GitHub repo URL
	isGitHubRepo := false
	if item.URL != "" && strings.Contains(strings.ToLower(item.URL), "github.com") {
		fmt.Printf("\nThis is a GitHub URL\n")
		isGitHubRepo = true
	} else {
		fmt.Printf("\nThis is NOT a GitHub URL\n")
	}

	// Get the current time and calculate days ago
	now := time.Now()
	createdTime := time.Unix(int64(item.CreatedAtI), 0)
	daysAgo := int(now.Sub(createdTime).Hours() / 24)

	fmt.Printf("Post was created %d days ago\n", daysAgo)

	// Check if it's within the time frame (last month)
	isWithinTimeFrame := now.Sub(createdTime) <= 30*24*time.Hour
	fmt.Printf("Is within last month: %v\n", isWithinTimeFrame)

	conclusion := "should NOT"
	if isGitHubRepo && isWithinTimeFrame {
		conclusion = "SHOULD"
	}
	fmt.Printf("\nConclusion: This post %s be included in your API results\n", conclusion)
}
