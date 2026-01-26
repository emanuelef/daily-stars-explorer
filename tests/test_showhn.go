package tests

import (
	"encoding/json"
	"fmt"

	"github.com/emanuelef/gh-repo-stats-server/news"
)

func TestShowHN() {
	// Test sorting by date (default)
	fmt.Println("=== Testing sort by date ===")
	postsByDate, err := news.FetchShowHNGitHubPosts("date")
	if err != nil {
		fmt.Printf("Error fetching by date: %v\n", err)
	} else {
		fmt.Printf("Found %d posts sorted by date\n", len(postsByDate))
		if len(postsByDate) > 0 {
			jsonData, _ := json.MarshalIndent(postsByDate[0], "", "  ")
			fmt.Printf("Sample post (sorted by date):\n%s\n", string(jsonData))
		}
	}

	// Test sorting by points
	fmt.Println("\n=== Testing sort by points ===")
	postsByPoints, err := news.FetchShowHNGitHubPosts("points")
	if err != nil {
		fmt.Printf("Error fetching by points: %v\n", err)
	} else {
		fmt.Printf("Found %d posts sorted by points\n", len(postsByPoints))
		if len(postsByPoints) > 0 {
			fmt.Printf("Top post has %d points\n", postsByPoints[0].Points)
		}
	}

	// Test sorting by comments
	fmt.Println("\n=== Testing sort by comments ===")
	postsByComments, err := news.FetchShowHNGitHubPosts("comments")
	if err != nil {
		fmt.Printf("Error fetching by comments: %v\n", err)
	} else {
		fmt.Printf("Found %d posts sorted by comments\n", len(postsByComments))
		if len(postsByComments) > 0 {
			fmt.Printf("Top post has %d comments\n", postsByComments[0].NumComments)
		}
	}
}
