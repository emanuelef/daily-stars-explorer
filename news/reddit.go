package news

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// Replace with your own client ID and client secret
var (
	ClientID     = os.Getenv("REDDIT_CLIENT_ID")
	ClientSecret = os.Getenv("REDDIT_CLIENT_SECRET")
	Username     = os.Getenv("REDDIT_USERNAME")
	Password     = os.Getenv("REDDIT_PASSWORD")
	UserAgent    = os.Getenv("REDDIT_USER_AGENT")
)

type TokenResponse struct {
	AccessToken string `json:"access_token"`
}

type PostData struct {
	Title       string  `json:"title"`
	Created     float64 `json:"created"`
	Ups         int     `json:"ups"`
	NumComments int     `json:"num_comments"`
	Permalink   string  `json:"permalink"`
}

type ArticleData struct {
	Title       string `json:"title"`
	Created     string `json:"created"`
	Ups         int    `json:"ups"`
	NumComments int    `json:"num_comments"`
	Url         string `json:"url"`
}

type RedditResponse struct {
	Data struct {
		Children []struct {
			Data PostData `json:"data"`
		} `json:"children"`
	} `json:"data"`
}

func getRedditToken() (string, error) {
	client := &http.Client{}
	data := url.Values{}
	data.Set("grant_type", "password")
	data.Set("username", Username)
	data.Set("password", Password)

	req, err := http.NewRequest("POST", "https://www.reddit.com/api/v1/access_token", strings.NewReader(data.Encode()))
	if err != nil {
		return "", err
	}

	req.SetBasicAuth(ClientID, ClientSecret)
	req.Header.Set("User-Agent", UserAgent)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var tokenResponse TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResponse); err != nil {
		return "", err
	}

	return tokenResponse.AccessToken, nil
}

func FetchRedditPosts(query string, minUpvotes int) ([]ArticleData, error) {
	token, err := getRedditToken()
	if err != nil {
		return nil, err
	}

	client := &http.Client{}
	params := url.Values{}
	params.Set("q", query)
	params.Set("sort", "relevance")
	params.Set("limit", "100")

	req, err := http.NewRequest("GET", "https://oauth.reddit.com/search?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", UserAgent)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var redditResponse RedditResponse
	if err := json.NewDecoder(resp.Body).Decode(&redditResponse); err != nil {
		return nil, err
	}

	var articles []ArticleData

	for _, child := range redditResponse.Data.Children {
		if child.Data.Ups >= minUpvotes {
			createdAt := time.Unix(int64(child.Data.Created), 0).Format("2006-01-02 15:04:05")
			articles = append(articles, ArticleData{
				Title:       child.Data.Title,
				Created:     createdAt,
				Ups:         child.Data.Ups,
				NumComments: child.Data.NumComments,
				Url:         "https://www.reddit.com" + child.Data.Permalink,
			})
		}
	}

	return articles, nil
}
