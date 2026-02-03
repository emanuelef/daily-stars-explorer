package news

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"golang.org/x/net/html"
)

// ScrapeShowHN fetches Show HN posts directly from the HN website
func ScrapeShowHN() ([]ShowHNPost, error) {
	// HN Show page URL
	showHNURL := "https://news.ycombinator.com/show"

	// Make HTTP request
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", showHNURL, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error making request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("received non-200 response: %d", resp.StatusCode)
	}

	// Parse the HTML
	doc, err := html.Parse(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error parsing HTML: %w", err)
	}

	// Extract Show HN posts
	var posts []ShowHNPost
	if posts, err = extractShowHNPosts(doc); err != nil {
		return nil, err
	}

	// Filter for GitHub repos
	var gitHubPosts []ShowHNPost
	for _, post := range posts {
		if isGitHubURL(post.URL) || strings.Contains(strings.ToLower(post.Title), "github.com") {
			post.IsGitHubRepo = true
			gitHubPosts = append(gitHubPosts, post)
		}
	}

	return gitHubPosts, nil
}

// Helper function to check if a URL is a GitHub repository
func isGitHubURL(urlStr string) bool {
	if urlStr == "" {
		return false
	}

	// Direct GitHub links
	if strings.Contains(strings.ToLower(urlStr), "github.com") {
		return true
	}

	return false
}

// Helper function to extract Show HN posts from HTML
func extractShowHNPosts(n *html.Node) ([]ShowHNPost, error) {
	var posts []ShowHNPost

	// Find all rows in the table
	var findRows func(*html.Node)
	findRows = func(n *html.Node) {
		// Look for table rows with Show HN content
		if n.Type == html.ElementNode && n.Data == "tr" {
			// Check if this is a story row (contains a title, points, etc.)
			var titleLink *html.Node
			var titleText string
			var urlStr string
			var pointsStr string
			var commentsLink string
			var objectID string
			var timeAgo string

			// Traverse the row to find title, URL, points
			var traverse func(*html.Node)
			traverse = func(n *html.Node) {
				if n.Type == html.ElementNode && n.Data == "a" {
					// Check if this is the title link
					for _, attr := range n.Attr {
						if attr.Key == "href" {
							if strings.HasPrefix(attr.Val, "item?id=") {
								// This is the comments link
								commentsLink = "https://news.ycombinator.com/" + attr.Val
								// Extract object ID from comments link
								parts := strings.Split(attr.Val, "=")
								if len(parts) >= 2 {
									objectID = parts[1]
								}
							} else if !strings.HasPrefix(attr.Val, "from?") && urlStr == "" {
								// This is likely the story URL
								if strings.HasPrefix(attr.Val, "http") {
									urlStr = attr.Val
								} else {
									urlStr = "https://news.ycombinator.com/" + attr.Val
								}
							}
						}
					}

					// Check if this link contains the title text
					if n.FirstChild != nil && n.FirstChild.Type == html.TextNode && titleText == "" {
						text := n.FirstChild.Data
						if strings.HasPrefix(text, "Show HN:") {
							titleText = text
							titleLink = n
						}
					}
				} else if n.Type == html.ElementNode && n.Data == "span" {
					// Check for points count
					for _, attr := range n.Attr {
						if attr.Key == "class" && attr.Val == "score" && n.FirstChild != nil {
							pointsText := n.FirstChild.Data
							pointsStr = strings.TrimSuffix(pointsText, " points")
						}
					}
				} else if n.Type == html.ElementNode && n.Data == "span" {
					// Check for time ago
					for _, attr := range n.Attr {
						if attr.Key == "class" && (attr.Val == "age" || attr.Val == "score") && n.FirstChild != nil && n.FirstChild.Type == html.ElementNode && n.FirstChild.Data == "a" {
							if n.FirstChild.FirstChild != nil {
								timeAgo = n.FirstChild.FirstChild.Data
							}
						}
					}
				}

				// Continue traversing
				for c := n.FirstChild; c != nil; c = c.NextSibling {
					traverse(c)
				}
			}

			traverse(n)

			// If we found a Show HN post, create a ShowHNPost object
			if titleText != "" && strings.HasPrefix(titleText, "Show HN:") {
				// Parse points
				points := 0
				if pointsStr != "" {
					if p, err := strconv.Atoi(pointsStr); err == nil {
						points = p
					}
				}

				// Parse comments count
				comments := 0
				if commentsLink != "" {
					// Try to extract comment count from siblings of the title link
					var nextSibling *html.Node
					if titleLink != nil && titleLink.Parent != nil {
						nextSibling = titleLink.Parent.NextSibling
					}

					// Look for text like "123 comments"
					if nextSibling != nil {
						commentText := getTextContent(nextSibling)
						re := regexp.MustCompile(`(\d+)\s+comments?`)
						matches := re.FindStringSubmatch(commentText)
						if len(matches) >= 2 {
							if c, err := strconv.Atoi(matches[1]); err == nil {
								comments = c
							}
						}
					}
				}

				// Generate approximate time
				createdAt := time.Now().Format(time.RFC3339)
				if timeAgo != "" {
					// Parse relative time (e.g., "5 hours ago")
					createdAt = approximateTimeFromRelative(timeAgo)
				}

				post := ShowHNPost{
					Title:       titleText,
					URL:         urlStr,
					Points:      points,
					NumComments: comments,
					CreatedAt:   createdAt,
					HNLink:      commentsLink,
					ObjectID:    objectID,
				}

				posts = append(posts, post)
			}
		}

		// Continue traversing the DOM
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			findRows(c)
		}
	}

	findRows(n)

	if len(posts) == 0 {
		return nil, errors.New("no Show HN posts found")
	}

	return posts, nil
}

// Helper function to get text content of a node
func getTextContent(n *html.Node) string {
	if n == nil {
		return ""
	}

	var text string
	var extract func(*html.Node)
	extract = func(n *html.Node) {
		if n.Type == html.TextNode {
			text += n.Data
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			extract(c)
		}
	}

	extract(n)
	return text
}

// Helper function to approximate timestamp from relative time string
func approximateTimeFromRelative(relTime string) string {
	now := time.Now()

	// Parse common patterns like "5 hours ago", "2 days ago"
	if strings.Contains(relTime, "minute") {
		re := regexp.MustCompile(`(\d+)`)
		matches := re.FindStringSubmatch(relTime)
		if len(matches) >= 2 {
			if minutes, err := strconv.Atoi(matches[1]); err == nil {
				return now.Add(-time.Duration(minutes) * time.Minute).Format(time.RFC3339)
			}
		}
	} else if strings.Contains(relTime, "hour") {
		re := regexp.MustCompile(`(\d+)`)
		matches := re.FindStringSubmatch(relTime)
		if len(matches) >= 2 {
			if hours, err := strconv.Atoi(matches[1]); err == nil {
				return now.Add(-time.Duration(hours) * time.Hour).Format(time.RFC3339)
			}
		}
	} else if strings.Contains(relTime, "day") {
		re := regexp.MustCompile(`(\d+)`)
		matches := re.FindStringSubmatch(relTime)
		if len(matches) >= 2 {
			if days, err := strconv.Atoi(matches[1]); err == nil {
				return now.AddDate(0, 0, -days).Format(time.RFC3339)
			}
		}
	}

	// Default to current time if parsing fails
	return now.Format(time.RFC3339)
}
