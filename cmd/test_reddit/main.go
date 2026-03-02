package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"

	_ "github.com/joho/godotenv/autoload"
)

func main() {
	clientID := os.Getenv("REDDIT_CLIENT_ID")
	clientSecret := os.Getenv("REDDIT_CLIENT_SECRET")
	username := os.Getenv("REDDIT_USERNAME")
	password := os.Getenv("REDDIT_PASSWORD")
	userAgent := os.Getenv("REDDIT_USER_AGENT")

	if userAgent == "" {
		userAgent = "script:gh-stars-explorer:v1.0 (by /u/emanuelefumagalli)"
	}

	fmt.Printf("REDDIT_CLIENT_ID:     %s\n", maskSecret(clientID))
	fmt.Printf("REDDIT_CLIENT_SECRET: %s\n", maskSecret(clientSecret))
	fmt.Printf("REDDIT_USERNAME:      %s\n", username)
	fmt.Printf("REDDIT_PASSWORD:      %s\n", maskSecret(password))
	fmt.Printf("REDDIT_USER_AGENT:    %s\n", userAgent)
	fmt.Println()

	if clientID == "" || clientSecret == "" {
		fmt.Println("ERROR: REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET not set")
		os.Exit(1)
	}

	// Step 1: get token
	fmt.Println("=== Step 1: Get OAuth token ===")
	data := url.Values{}
	if username != "" && password != "" {
		data.Set("grant_type", "password")
		data.Set("username", username)
		data.Set("password", password)
		fmt.Println("Using grant_type=password")
	} else {
		data.Set("grant_type", "client_credentials")
		fmt.Println("Using grant_type=client_credentials")
	}

	req, _ := http.NewRequest("POST", "https://www.reddit.com/api/v1/access_token", strings.NewReader(data.Encode()))
	req.SetBasicAuth(clientID, clientSecret)
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Printf("ERROR: %v\n", err)
		os.Exit(1)
	}
	defer func() { _ = resp.Body.Close() }()

	fmt.Printf("Token endpoint status: %d\n", resp.StatusCode)
	fmt.Printf("Retry-After header:    %s\n", resp.Header.Get("Retry-After"))

	var tokenResp map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		fmt.Printf("ERROR decoding token response: %v\n", err)
		os.Exit(1)
	}

	if resp.StatusCode != 200 {
		fmt.Printf("Response: %v\n", tokenResp)
		os.Exit(1)
	}

	token, _ := tokenResp["access_token"].(string)
	fmt.Printf("Token obtained:        %s\n", maskSecret(token))
	fmt.Println()

	// Step 2: search
	fmt.Println("=== Step 2: Search for 'helm/helm' ===")
	params := url.Values{}
	params.Set("q", "github.com/helm/helm")
	params.Set("sort", "relevance")
	params.Set("limit", "5")

	searchReq, _ := http.NewRequest("GET", "https://oauth.reddit.com/search?"+params.Encode(), nil)
	searchReq.Header.Set("Authorization", "Bearer "+token)
	searchReq.Header.Set("User-Agent", userAgent)

	searchResp, err := http.DefaultClient.Do(searchReq)
	if err != nil {
		fmt.Printf("ERROR: %v\n", err)
		os.Exit(1)
	}
	defer func() { _ = searchResp.Body.Close() }()

	fmt.Printf("Search status: %d\n", searchResp.StatusCode)

	var searchResult map[string]any
	if err := json.NewDecoder(searchResp.Body).Decode(&searchResult); err != nil {
		fmt.Printf("ERROR decoding search response: %v\n", err)
		os.Exit(1)
	}

	if searchResp.StatusCode != 200 {
		fmt.Printf("Response: %v\n", searchResult)
		os.Exit(1)
	}

	data2, _ := searchResult["data"].(map[string]any)
	children, _ := data2["children"].([]any)
	fmt.Printf("Results found: %d\n", len(children))
	for i, c := range children {
		child := c.(map[string]any)["data"].(map[string]any)
		fmt.Printf("  [%d] %s\n", i+1, child["title"])
	}
}

func maskSecret(s string) string {
	if len(s) <= 6 {
		return strings.Repeat("*", len(s))
	}
	return s[:3] + strings.Repeat("*", len(s)-6) + s[len(s)-3:]
}
