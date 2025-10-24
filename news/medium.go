package news

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// MediumArticle represents an article from Medium
type MediumArticle struct {
	Title       string    `json:"title"`
	PublishedAt time.Time `json:"published_at"`
	URL         string    `json:"url"`
	Author      string    `json:"author"`
	Content     string    `json:"content,omitempty"`
}

// MediumRSSFeed represents the Medium RSS feed structure
type MediumRSSFeed struct {
	XMLName xml.Name      `xml:"rss"`
	Channel MediumChannel `xml:"channel"`
}

type MediumChannel struct {
	XMLName     xml.Name        `xml:"channel"`
	Title       string          `xml:"title"`
	Description string          `xml:"description"`
	Items       []MediumRSSItem `xml:"item"`
}

type MediumRSSItem struct {
	XMLName     xml.Name `xml:"item"`
	Title       string   `xml:"title"`
	Link        string   `xml:"link"`
	PubDate     string   `xml:"pubDate"`
	Creator     string   `xml:"creator"`
	Description string   `xml:"description"`
	Content     string   `xml:"encoded"`
	Categories  []string `xml:"category"`
}

// FetchMediumArticles fetches articles from Medium that match the given query
// This implementation uses Medium's tag RSS feeds
func FetchMediumArticles(query string) ([]MediumArticle, error) {
	// Medium uses URL-friendly tag names for RSS feeds
	// Convert query to tag format (lowercase, replace spaces with hyphens)
	tag := strings.ToLower(strings.Replace(query, " ", "-", -1))

	// Medium RSS feed URL for tags
	feedURL := fmt.Sprintf("https://medium.com/feed/tag/%s", url.QueryEscape(tag))
	fmt.Printf("Fetching Medium articles from: %s\n", feedURL)

	return fetchMediumFromURL(feedURL)
}

// extractExcerpt extracts a clean excerpt of specified length from HTML content
func extractExcerpt(html string, maxLength int) string {
	// Simple HTML tag removal (not perfect but works for basic cases)
	text := strings.ReplaceAll(html, "<p>", "")
	text = strings.ReplaceAll(text, "</p>", " ")
	text = strings.ReplaceAll(text, "<br>", " ")
	text = strings.ReplaceAll(text, "<br/>", " ")
	text = strings.ReplaceAll(text, "<br />", " ")

	// Remove other HTML tags with a simple regex-like approach
	for strings.Contains(text, "<") && strings.Contains(text, ">") {
		start := strings.Index(text, "<")
		end := strings.Index(text, ">")
		if start < end {
			text = text[:start] + text[end+1:]
		} else {
			break
		}
	}

	// Trim spaces and limit length
	text = strings.TrimSpace(text)
	if len(text) > maxLength {
		text = text[:maxLength] + "..."
	}

	return text
}

// fetchMediumFromURL fetches articles from a specific Medium RSS feed URL
func fetchMediumFromURL(feedURL string) ([]MediumArticle, error) {
	var articles []MediumArticle

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	req, err := http.NewRequest("GET", feedURL, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %w", err)
	}

	// Set user agent to avoid being blocked
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error making request to Medium: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("received non-200 response: %d", resp.StatusCode)
	}

	// Read and parse the RSS feed
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response body: %w", err)
	}

	var feed MediumRSSFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil, fmt.Errorf("error parsing RSS feed: %w", err)
	}

	fmt.Printf("Found %d items in feed\n", len(feed.Channel.Items))

	// Process each article
	for _, item := range feed.Channel.Items {
		// Debug the pubDate format
		fmt.Printf("Processing Medium article with PubDate: %s\n", item.PubDate)

		// Parse the publication date
		fmt.Printf("Raw pubDate string from RSS: '%s'\n", item.PubDate)
		pubDate, err := time.Parse(time.RFC1123Z, item.PubDate)
		if err != nil {
			fmt.Printf("Failed to parse using RFC1123Z: %v\n", err)
			// Try a few other common formats
			formats := []string{
				time.RFC1123,
				time.RFC3339,
				"Mon, 02 Jan 2006 15:04:05 MST",
				"Mon, 02 Jan 2006 15:04:05 -0700",
				// Add more formats that Medium might use
				"2006-01-02T15:04:05Z",
				"2006-01-02T15:04:05-07:00",
				"Monday, 02-Jan-06 15:04:05 MST",
				"Mon, 2 Jan 2006 15:04:05 -0700",
			}

			parsed := false
			for _, format := range formats {
				if parsedDate, parseErr := time.Parse(format, item.PubDate); parseErr == nil {
					pubDate = parsedDate
					parsed = true
					fmt.Printf("Successfully parsed date using format: %s -> %s\n", format, pubDate.Format(time.RFC3339))
					break
				} else {
					fmt.Printf("Failed to parse using format %s: %v\n", format, parseErr)
				}
			}

			if !parsed {
				// Use current time as fallback if parsing fails
				fmt.Printf("Failed to parse date with all formats: %s. Using current time as fallback.\n", item.PubDate)
				pubDate = time.Now()
				fmt.Printf("WARNING: Using current time for article: %s\n", item.Title)
			}
		} else {
			fmt.Printf("Successfully parsed date using RFC1123Z: %s\n", pubDate.Format(time.RFC3339))
		}

		// Extract a short excerpt from the content
		excerpt := extractExcerpt(item.Description, 200)

		// Make sure the pubDate is in UTC
		pubDate = pubDate.UTC()

		// Debug the final date that will be sent to the frontend
		fmt.Printf("Final pubDate for article '%s': %s\n", item.Title, pubDate.Format(time.RFC3339))

		articles = append(articles, MediumArticle{
			Title:       item.Title,
			PublishedAt: pubDate,
			URL:         item.Link,
			Author:      item.Creator,
			Content:     excerpt,
		})
	}

	return articles, nil
}

// SearchMediumArticles searches for articles from Medium that match the given repository name
// This is a more specific search function focused on GitHub repositories
func SearchMediumArticles(repoName string) ([]MediumArticle, error) {
	var allArticles []MediumArticle
	var searchErrors []error

	// Track URLs to avoid duplicates
	seen := make(map[string]bool)

	// Try different search strategies
	searchStrategies := []struct {
		description string
		queryFn     func() string
	}{
		{
			description: "Exact repo name",
			queryFn:     func() string { return repoName },
		},
		{
			description: "Repo name with 'react' keyword",
			queryFn:     func() string { return repoName + " react" },
		},
		{
			description: "Repo name with 'tutorial' keyword",
			queryFn:     func() string { return repoName + " tutorial" },
		},
	}

	// Add repo part only if it's in owner/repo format
	parts := strings.Split(repoName, "/")
	if len(parts) > 1 {
		searchStrategies = append(searchStrategies, struct {
			description string
			queryFn     func() string
		}{
			description: "Repo part only",
			queryFn:     func() string { return parts[1] },
		})

		// Add spaces instead of hyphens variant
		if strings.Contains(parts[1], "-") {
			searchStrategies = append(searchStrategies, struct {
				description string
				queryFn     func() string
			}{
				description: "Repo with spaces instead of hyphens",
				queryFn:     func() string { return strings.ReplaceAll(parts[1], "-", " ") },
			})
		}

		// Add parts of hyphenated name
		if strings.Contains(parts[1], "-") {
			hyphenParts := strings.Split(parts[1], "-")
			for i, part := range hyphenParts {
				if len(part) > 3 { // Only use meaningful parts, not short ones
					partCopy := part // Create a copy for the closure
					searchStrategies = append(searchStrategies, struct {
						description string
						queryFn     func() string
					}{
						description: fmt.Sprintf("Hyphen part %d: %s", i, partCopy),
						queryFn:     func() string { return partCopy },
					})
				}
			}
		}
	}

	// Try search on multiple domains
	searchDomains := []struct {
		name   string
		urlFmt string
	}{
		{
			name:   "tag",
			urlFmt: "https://medium.com/feed/tag/%s",
		},
		{
			name:   "search",
			urlFmt: "https://medium.com/search/feed/%s",
		},
	}

	// Try all combinations of strategies and domains
	for _, strategy := range searchStrategies {
		query := strategy.queryFn()

		// Skip empty queries
		if query == "" {
			continue
		}

		fmt.Printf("Trying Medium search strategy: %s (%s)\n", strategy.description, query)

		for _, domain := range searchDomains {
			// Create a custom fetch function for this specific URL
			fetchURL := fmt.Sprintf(domain.urlFmt, url.QueryEscape(strings.ToLower(strings.Replace(query, " ", "-", -1))))

			fmt.Printf("  Fetching from: %s\n", fetchURL)

			// Custom fetch for this URL
			articles, err := fetchMediumFromURL(fetchURL)

			if err != nil {
				searchErrors = append(searchErrors, fmt.Errorf("error for %s using %s: %w", query, domain.name, err))
				continue
			}

			// Add unique articles to the result
			for _, article := range articles {
				// Skip articles with suspicious dates (articles from the future or from far past)
				now := time.Now()
				if article.PublishedAt.After(now.Add(24 * time.Hour)) {
					fmt.Printf("Skipping article with future date: %s (%s)\n",
						article.Title, article.PublishedAt.Format(time.RFC3339))
					continue
				}

				// Skip articles older than 10 years (likely parsing errors)
				if article.PublishedAt.Before(now.AddDate(-10, 0, 0)) {
					fmt.Printf("Skipping article with very old date: %s (%s)\n",
						article.Title, article.PublishedAt.Format(time.RFC3339))
					continue
				}

				// Check if today's date (possible fallback)
				if article.PublishedAt.Year() == now.Year() &&
					article.PublishedAt.Month() == now.Month() &&
					article.PublishedAt.Day() == now.Day() {
					fmt.Printf("Warning: Article with today's date (possible fallback): %s\n", article.Title)
					// Don't skip these yet, just log a warning
				}

				if !seen[article.URL] {
					seen[article.URL] = true
					allArticles = append(allArticles, article)
				}
			}
		}
	}

	// If we have no articles but have errors, return the first error
	if len(allArticles) == 0 && len(searchErrors) > 0 {
		return nil, searchErrors[0]
	}

	// Sort articles by date (newest first)
	sort.Slice(allArticles, func(i, j int) bool {
		return allArticles[i].PublishedAt.After(allArticles[j].PublishedAt)
	})

	// If no articles found or if all articles have today's date, try GraphQL API
	allTodayArticles := true
	today := time.Now().UTC()

	for _, article := range allArticles {
		// If we find at least one article not from today, set flag to false
		if article.PublishedAt.Year() != today.Year() ||
			article.PublishedAt.Month() != today.Month() ||
			article.PublishedAt.Day() != today.Day() {
			allTodayArticles = false
			break
		}
	}

	if len(allArticles) == 0 || allTodayArticles {
		fmt.Printf("No historical articles found, trying GraphQL API for %s\n", repoName)

		// Try using GraphQL API with the first strategy
		if len(searchStrategies) > 0 {
			query := searchStrategies[0].queryFn()

			// Skip empty queries
			if query != "" {
				fmt.Printf("Trying Medium GraphQL API with query: %s\n", query)

				// Fetch from GraphQL API
				graphQLArticles, err := fetchMediumFromGraphQL(query)

				if err != nil {
					searchErrors = append(searchErrors, fmt.Errorf("GraphQL error for %s: %w", query, err))
				} else {
					// Add unique articles to the result
					for _, article := range graphQLArticles {
						if !seen[article.URL] {
							seen[article.URL] = true
							allArticles = append(allArticles, article)
						}
					}

					// Sort again after adding GraphQL results
					sort.Slice(allArticles, func(i, j int) bool {
						return allArticles[i].PublishedAt.After(allArticles[j].PublishedAt)
					})
				}
			}
		}
	}

	// If no articles found from RSS or GraphQL, try the API search
	if len(allArticles) == 0 {
		fmt.Printf("No articles found from RSS or GraphQL, trying API search for %s\n", repoName)

		// Try using the API search with each strategy
		for _, strategy := range searchStrategies {
			query := strategy.queryFn()

			// Skip empty queries
			if query == "" {
				continue
			}

			fmt.Printf("Trying Medium API search with strategy: %s (%s)\n", strategy.description, query)

			// Fetch from API
			apiArticles, err := fetchMediumFromAPISearch(query)

			if err != nil {
				searchErrors = append(searchErrors, fmt.Errorf("API search error for %s: %w", query, err))
				continue
			}

			// Add unique articles to the result
			for _, article := range apiArticles {
				// Skip articles with suspicious dates (articles from the future or from far past)
				now := time.Now()
				if article.PublishedAt.After(now.Add(24 * time.Hour)) {
					fmt.Printf("Skipping API article with future date: %s (%s)\n",
						article.Title, article.PublishedAt.Format(time.RFC3339))
					continue
				}

				// Skip articles older than 10 years (likely parsing errors)
				if article.PublishedAt.Before(now.AddDate(-10, 0, 0)) {
					fmt.Printf("Skipping API article with very old date: %s (%s)\n",
						article.Title, article.PublishedAt.Format(time.RFC3339))
					continue
				}

				// Check if today's date (possible fallback)
				if article.PublishedAt.Year() == now.Year() &&
					article.PublishedAt.Month() == now.Month() &&
					article.PublishedAt.Day() == now.Day() {
					fmt.Printf("Warning: API article with today's date (possible fallback): %s\n", article.Title)
					// Don't skip these yet, just log a warning
				}

				if !seen[article.URL] {
					seen[article.URL] = true
					allArticles = append(allArticles, article)
				}
			}

			// If we found some articles, we can stop
			if len(allArticles) > 0 {
				break
			}
		}

		// Sort again after adding API results
		sort.Slice(allArticles, func(i, j int) bool {
			return allArticles[i].PublishedAt.After(allArticles[j].PublishedAt)
		})
	}

	fmt.Printf("Found %d unique Medium articles\n", len(allArticles))

	// Ensure articles have varied dates - if all have the same date, it's suspicious
	if len(allArticles) > 1 {
		allSameDate := true
		firstDate := allArticles[0].PublishedAt

		for i := 1; i < len(allArticles); i++ {
			// If we find any article with a different date, they're not all the same
			if !allArticles[i].PublishedAt.Equal(firstDate) {
				allSameDate = false
				break
			}
		}

		if allSameDate {
			fmt.Printf("WARNING: All %d articles have the same date (%s). This is suspicious and may indicate a parsing issue.\n",
				len(allArticles), firstDate.Format(time.RFC3339))
		}
	}

	return allArticles, nil
}

// MediumAPIResponse represents the structure of a response from Medium's unofficial API
type MediumAPIResponse struct {
	Success bool             `json:"success"`
	Payload MediumAPIPayload `json:"payload"`
}

// MediumAPIPayload contains the actual data from a Medium API response
type MediumAPIPayload struct {
	Value    MediumAPIValue              `json:"value"`
	Posts    map[string]MediumAPIPost    `json:"references,omitempty"`
	PostRefs map[string]MediumAPIPostRef `json:"posts,omitempty"`
}

// MediumAPIValue contains search results
type MediumAPIValue struct {
	Posts []string `json:"posts"`
}

// MediumAPIPostRef is an alternative structure for posts
type MediumAPIPostRef struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	CreatorID   string `json:"creatorId"`
	CreatedAt   int64  `json:"createdAt"`
	UpdatedAt   int64  `json:"updatedAt"`
	PublishedAt int64  `json:"firstPublishedAt"`
	SlugURL     string `json:"uniqueSlug"`
	MediumURL   string `json:"mediumUrl"`
}

// MediumAPIPost represents a post from Medium's API
type MediumAPIPost struct {
	ID             string                  `json:"id"`
	Title          string                  `json:"title"`
	CreatorID      string                  `json:"creatorId"`
	Creator        MediumAPICreator        `json:"creator"`
	CreatedAt      int64                   `json:"createdAt"`
	UpdatedAt      int64                   `json:"updatedAt"`
	PublishedAt    int64                   `json:"firstPublishedAt"`
	URL            string                  `json:"uniqueSlug"`
	HomepageURL    string                  `json:"mediumUrl"`
	PreviewContent MediumAPIPreviewContent `json:"previewContent"`
}

// MediumAPICreator represents a creator from Medium's API
type MediumAPICreator struct {
	Name string `json:"name"`
}

// MediumAPIPreviewContent represents the preview content of a post
type MediumAPIPreviewContent struct {
	SeoDescription string `json:"subtitle"`
}

// fetchMediumFromAPISearch fetches articles from Medium's unofficial API
func fetchMediumFromAPISearch(query string) ([]MediumArticle, error) {
	var articles []MediumArticle

	// This is using Medium's unofficial API - it might change without notice
	// Using it alongside RSS feeds for better results
	apiURL := fmt.Sprintf(
		"https://medium.com/_/api/posts/search?q=%s&limit=25&sortBy=relevance",
		url.QueryEscape(query))

	fmt.Printf("Fetching from Medium API: %s\n", apiURL)

	client := &http.Client{
		Timeout: 15 * time.Second,
	}

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating API request: %w", err)
	}

	// Set headers to make it look like a browser request
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error making API request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("received non-200 response from API: %d", resp.StatusCode)
	}

	// Read the response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading API response body: %w", err)
	}

	// The API response starts with a security prefix that needs to be removed
	// Usually it's something like: ])}while(1);</x>
	// Find the first occurrence of '{'
	jsonStart := 0
	for i, b := range body {
		if b == '{' {
			jsonStart = i
			break
		}
	}

	// Parse the JSON after removing the prefix
	var response MediumAPIResponse
	if err := json.Unmarshal(body[jsonStart:], &response); err != nil {
		return nil, fmt.Errorf("error parsing API response: %w", err)
	}

	// Save the raw JSON for debugging if needed
	rawJSON := string(body[jsonStart:])
	if len(rawJSON) > 1000 {
		rawJSON = rawJSON[:1000] + "..." // Trim for logging
	}
	fmt.Printf("Raw JSON sample: %s\n", rawJSON)

	// First try to process posts from the references field
	if response.Payload.Posts != nil && len(response.Payload.Posts) > 0 {
		fmt.Printf("Found %d posts in references field\n", len(response.Payload.Posts))

		// Process the posts from references
		for _, post := range response.Payload.Posts {
			// Convert Unix timestamp (in milliseconds) to time.Time
			publishedAt := time.Unix(post.PublishedAt/1000, 0).UTC()

			// Debug date conversion
			fmt.Printf("API date conversion: timestamp=%d -> date=%s\n",
				post.PublishedAt, publishedAt.Format(time.RFC3339))

			// Skip posts with invalid dates
			if publishedAt.Year() < 2000 {
				fmt.Printf("Skipping post with invalid date: %v\n", publishedAt)
				continue
			}

			// Create a Medium article from the API post
			article := MediumArticle{
				Title:       post.Title,
				PublishedAt: publishedAt,
				URL:         post.HomepageURL,
				Author:      post.Creator.Name,
				Content:     post.PreviewContent.SeoDescription,
			}

			fmt.Printf("Found article from references: %s (%s)\n", article.Title, publishedAt.Format(time.RFC3339))
			articles = append(articles, article)
		}
	} else if response.Payload.PostRefs != nil && len(response.Payload.PostRefs) > 0 {
		// Try alternative structure (posts field)
		fmt.Printf("Found %d posts in posts field\n", len(response.Payload.PostRefs))

		// Process the posts from posts field
		for _, post := range response.Payload.PostRefs {
			// Convert Unix timestamp (in milliseconds) to time.Time
			publishedAt := time.Unix(post.PublishedAt/1000, 0).UTC()

			// Debug date conversion
			fmt.Printf("API date conversion (alt): timestamp=%d -> date=%s\n",
				post.PublishedAt, publishedAt.Format(time.RFC3339))

			// Skip posts with invalid dates
			if publishedAt.Year() < 2000 {
				fmt.Printf("Skipping post with invalid date: %v\n", publishedAt)
				continue
			}

			// Create a Medium article from the API post
			article := MediumArticle{
				Title:       post.Title,
				PublishedAt: publishedAt,
				URL:         post.MediumURL,
				Author:      post.CreatorID, // This is not ideal, but we don't have the full name
				Content:     "Article from Medium API",
			}

			fmt.Printf("Found article from posts: %s (%s)\n", article.Title, publishedAt.Format(time.RFC3339))
			articles = append(articles, article)
		}
	} else if response.Payload.Value.Posts != nil && len(response.Payload.Value.Posts) > 0 {
		// Try alternative structure (value.posts IDs)
		fmt.Printf("Found %d post IDs in value.posts field\n", len(response.Payload.Value.Posts))

		// We need to find the actual post objects using the IDs
		for _, postID := range response.Payload.Value.Posts {
			fmt.Printf("Looking for post with ID: %s\n", postID)

			// Try to find the post in both possible locations
			if post, ok := response.Payload.Posts[postID]; ok {
				// Found in references
				publishedAt := time.Unix(post.PublishedAt/1000, 0).UTC()

				// Skip posts with invalid dates
				if publishedAt.Year() < 2000 {
					fmt.Printf("Skipping post with invalid date: %v\n", publishedAt)
					continue
				}

				// Create a Medium article from the API post
				article := MediumArticle{
					Title:       post.Title,
					PublishedAt: publishedAt,
					URL:         post.HomepageURL,
					Author:      post.Creator.Name,
					Content:     post.PreviewContent.SeoDescription,
				}

				fmt.Printf("Found article by ID in references: %s (%s)\n", article.Title, publishedAt.Format(time.RFC3339))
				articles = append(articles, article)

			} else if post, ok := response.Payload.PostRefs[postID]; ok {
				// Found in posts
				publishedAt := time.Unix(post.PublishedAt/1000, 0).UTC()

				// Skip posts with invalid dates
				if publishedAt.Year() < 2000 {
					fmt.Printf("Skipping post with invalid date: %v\n", publishedAt)
					continue
				}

				// Create a Medium article from the API post
				article := MediumArticle{
					Title:       post.Title,
					PublishedAt: publishedAt,
					URL:         post.MediumURL,
					Author:      post.CreatorID,
					Content:     "Article from Medium API",
				}

				fmt.Printf("Found article by ID in posts: %s (%s)\n", article.Title, publishedAt.Format(time.RFC3339))
				articles = append(articles, article)
			} else {
				fmt.Printf("Could not find post with ID: %s\n", postID)
			}
		}
	} else {
		fmt.Printf("No posts found in API response!\n")
	}

	return articles, nil
}

// MediumGraphQLRequest represents a GraphQL request to Medium's API
type MediumGraphQLRequest struct {
	Query     string                 `json:"query"`
	Variables map[string]interface{} `json:"variables"`
}

// MediumGraphQLResponse represents a response from Medium's GraphQL API
type MediumGraphQLResponse struct {
	Data struct {
		Search struct {
			Posts struct {
				Edges []struct {
					Node struct {
						ID               string `json:"id"`
						Title            string `json:"title"`
						FirstPublishedAt int64  `json:"firstPublishedAt"`
						Creator          struct {
							Name string `json:"name"`
						} `json:"creator"`
						MediumURL string `json:"mediumUrl"`
						Excerpt   string `json:"excerpt"`
					} `json:"node"`
				} `json:"edges"`
			} `json:"posts"`
		} `json:"search"`
	} `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

// fetchMediumFromGraphQL fetches articles from Medium's GraphQL API
func fetchMediumFromGraphQL(query string) ([]MediumArticle, error) {
	var articles []MediumArticle

	// GraphQL endpoint
	apiURL := "https://medium.com/_/graphql"

	// GraphQL query for post search
	graphqlQuery := `
	query SearchPosts($query: String!, $count: Int!, $page: Int!) {
		search(query: $query) {
			posts(filter: {}, page: $page, count: $count) {
				edges {
					node {
						id
						title
						firstPublishedAt
						creator {
							name
						}
						mediumUrl
						excerpt
					}
				}
			}
		}
	}
	`

	// Build request payload
	request := MediumGraphQLRequest{
		Query: graphqlQuery,
		Variables: map[string]interface{}{
			"query": query,
			"count": 25,
			"page":  0,
		},
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("error marshaling GraphQL request: %w", err)
	}

	// Set up HTTP client
	client := &http.Client{
		Timeout: 15 * time.Second,
	}

	req, err := http.NewRequest("POST", apiURL, strings.NewReader(string(requestBody)))
	if err != nil {
		return nil, fmt.Errorf("error creating GraphQL request: %w", err)
	}

	// Set headers
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	// Make the request
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error making GraphQL request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("received non-200 response from GraphQL API: %d", resp.StatusCode)
	}

	// Read and parse response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading GraphQL response: %w", err)
	}

	// Parse response
	var response MediumGraphQLResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("error parsing GraphQL response: %w", err)
	}

	// Check for API errors
	if response.Errors != nil && len(response.Errors) > 0 {
		return nil, fmt.Errorf("GraphQL API error: %s", response.Errors[0].Message)
	}

	// Process posts
	edges := response.Data.Search.Posts.Edges
	fmt.Printf("Found %d posts from GraphQL API\n", len(edges))

	for _, edge := range edges {
		node := edge.Node

		// Convert timestamp to time.Time (milliseconds)
		publishedAt := time.Unix(node.FirstPublishedAt/1000, 0).UTC()

		// Debug date conversion
		fmt.Printf("GraphQL date conversion: timestamp=%d -> date=%s\n",
			node.FirstPublishedAt, publishedAt.Format(time.RFC3339))

		// Skip posts with invalid dates
		if publishedAt.Year() < 2000 {
			fmt.Printf("Skipping GraphQL post with invalid date: %v\n", publishedAt)
			continue
		}

		// Create article
		article := MediumArticle{
			Title:       node.Title,
			PublishedAt: publishedAt,
			URL:         node.MediumURL,
			Author:      node.Creator.Name,
			Content:     node.Excerpt,
		}

		fmt.Printf("Found article from GraphQL: %s (%s)\n", article.Title, publishedAt.Format(time.RFC3339))
		articles = append(articles, article)
	}

	return articles, nil
}
