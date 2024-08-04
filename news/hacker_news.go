package news

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
)

type HNResponse struct {
	Hits    []HNHit `json:"hits"`
	NBPages int     `json:"nbPages"`
}

type HNHit struct {
	Title       string `json:"title"`
	CreatedAt   string `json:"created_at"`
	Points      int    `json:"points"`
	NumComments int    `json:"num_comments"`
	URL         string `json:"url"`
	StoryURL    string `json:"story_url"`
	ObjectID    string `json:"objectID"`
}

type Article struct {
	Title       string
	CreatedAt   string
	Points      int
	NumComments int
	URL         string
	HNURL       string
}

func FetchHackerNewsArticles(query string, minPoints int) ([]Article, error) {
	var articles []Article
	page := 0
	hitsPerPage := 1000

	for {
		hnURL := "http://hn.algolia.com/api/v1/search"
		params := url.Values{}
		params.Add("query", query)
		params.Add("numericFilters", fmt.Sprintf("points>%d", minPoints))
		params.Add("attributesToRetrieve", "title,created_at,points,num_comments,url,story_url,objectID")
		params.Add("hitsPerPage", strconv.Itoa(hitsPerPage))
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

			articles = append(articles, Article{
				Title:       hit.Title,
				CreatedAt:   hit.CreatedAt,
				Points:      hit.Points,
				NumComments: hit.NumComments,
				URL:         articleURL,
				HNURL:       hnURL,
			})
		}

		if page >= data.NBPages-1 {
			// fmt.Println("No more pages left.")
			break
		}

		page++
	}

	return articles, nil
}
