package news

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
)

const HITS_PER_PAGE = 100
const MAX_PAGES = 2

type HNResponse struct {
	Hits    []HNHit `json:"hits"`
	NBPages int     `json:"nbPages"`
}

type HighlightResult struct {
	Title struct {
		Value string `json:"value"`
	} `json:"title"`
}

type HNHit struct {
	Title           string          `json:"title"`
	CreatedAt       string          `json:"created_at"`
	Points          int             `json:"points"`
	NumComments     int             `json:"num_comments"`
	URL             string          `json:"url"`
	StoryURL        string          `json:"story_url"`
	ObjectID        string          `json:"objectID"`
	HighlightResult HighlightResult `json:"highlightResult"`
}

type Article struct {
	Title        string
	CreatedAt    string
	Points       int
	NumComments  int
	URL          string
	HNURL        string
	MatchedWords []string
}

func FetchHackerNewsArticles(query string, minPoints int) ([]Article, error) {
	var articles []Article
	page := 0

	for {
		hnURL := "http://hn.algolia.com/api/v1/search"
		params := url.Values{}
		params.Add("query", query)
		params.Add("numericFilters", fmt.Sprintf("points>%d", minPoints))
		params.Add("attributesToRetrieve", "title,created_at,points,num_comments,url,story_url,objectID,highlightResult")
		params.Add("hitsPerPage", strconv.Itoa(HITS_PER_PAGE))
		params.Add("page", strconv.Itoa(page))

		resp, err := http.Get(fmt.Sprintf("%s?%s", hnURL, params.Encode()))
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			log.Fatalf("Error: %v", resp.Status)
		}

		var data HNResponse
		if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
			return nil, err
		}

		if len(data.Hits) == 0 {
			fmt.Println("No more hits found.")
			break
		}

		for _, hit := range data.Hits {
			hnURL := fmt.Sprintf("https://news.ycombinator.com/item?id=%s", hit.ObjectID)
			articleURL := hit.URL
			if articleURL == "" {
				articleURL = hit.StoryURL
			}

			// Extract matched words from the highlight result
			matchedWords := extractMatchedWords(hit.HighlightResult.Title.Value)

			articles = append(articles, Article{
				Title:        hit.Title,
				CreatedAt:    hit.CreatedAt,
				Points:       hit.Points,
				NumComments:  hit.NumComments,
				URL:          articleURL,
				HNURL:        hnURL,
				MatchedWords: matchedWords,
			})
		}

		if page >= data.NBPages-1 || page >= MAX_PAGES {
			// fmt.Println("No more pages left.")
			break
		}

		page++
	}

	return articles, nil
}

// Helper function to extract matched words from the highlight result
func extractMatchedWords(highlight string) []string {
	var matchedWords []string
	var word string
	var inTag bool

	for _, char := range highlight {
		switch char {
		case '<':
			inTag = true
			if word != "" {
				matchedWords = append(matchedWords, word)
				word = ""
			}
		case '>':
			inTag = false
		default:
			if !inTag {
				word += string(char)
			}
		}
	}
	if word != "" {
		matchedWords = append(matchedWords, word)
	}

	return matchedWords
}
