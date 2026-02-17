package news

import (
	"context"
	"fmt"
	"log"
	"os"

	"google.golang.org/api/option"
	"google.golang.org/api/youtube/v3"
)

const MAX_RESULTS = 100

var YTApiKey = os.Getenv("YOUTUBE_API_KEY")

type YTVideoMetadata struct {
	VideoID     string `json:"video_id"`
	Title       string `json:"title"`
	ViewCount   uint64 `json:"view_count"`
	PublishedAt string `json:"published_at"`
	VideoURL    string `json:"video_url"`
}

func FetchYouTubeVideos(query string, limit int) ([]YTVideoMetadata, error) {
	ctx := context.Background()

	client, err := youtube.NewService(ctx, option.WithAPIKey(YTApiKey))
	if err != nil {
		log.Fatalf("Error creating YouTube service: %v", err)
	}

	call := client.Search.List([]string{"id"})
	call = call.Q(query)
	call = call.MaxResults(100)

	response, err := call.Do()
	if err != nil {
		log.Fatalf("Error making API call: %v", err)
	}

	responseItems := []YTVideoMetadata{}

	for _, item := range response.Items {
		if item.Id.Kind != "youtube#video" {
			continue // Skip non-video items
		}

		videoId := item.Id.VideoId

		// Create a new request to get detailed video info
		detailCall := client.Videos.List([]string{"statistics", "snippet"})
		detailCall = detailCall.Id(videoId)

		detailResponse, err := detailCall.Do()
		if err != nil {
			log.Printf("Error getting details for video %s: %v", videoId, err)
			continue // Skip to next video on error
		}

		if len(detailResponse.Items) > 0 {
			video := detailResponse.Items[0]
			viewCount := video.Statistics.ViewCount
			publishedAt := video.Snippet.PublishedAt
			videoURL := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoId)

			responseItems = append(responseItems, YTVideoMetadata{
				VideoID:     videoId,
				Title:       video.Snippet.Title,
				ViewCount:   viewCount,
				PublishedAt: publishedAt,
				VideoURL:    videoURL,
			})

		} else {
			fmt.Printf("No details found for video %s\n", videoId)
		}
	}

	return responseItems, nil
}
