package news

import (
	"fmt"
	"testing"
)

func TestFetchShowHNGitHubPosts(t *testing.T) {
	// Test with default sort (date)
	posts, err := FetchShowHNGitHubPosts("date")
	if err != nil {
		t.Fatalf("FetchShowHNGitHubPosts(\"date\") returned an error: %v", err)
	}

	if len(posts) == 0 {
		t.Log("FetchShowHNGitHubPosts() returned 0 posts, which might be expected if there are no recent Show HN posts with GitHub links.")
	} else {
		fmt.Printf("Found %d posts (sorted by date)\n", len(posts))
		for i, post := range posts {
			if i > 5 { // Print first 5 posts
				break
			}
			fmt.Printf("Post: %s, URL: %s, Points: %d, Comments: %d, Date: %s\n",
				post.Title, post.URL, post.Points, post.NumComments, post.CreatedAt)
		}
		t.Logf("Test passed successfully")
	}
}
