package utils

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/emanuelef/github-repo-activity-stats/repostats"
	"github.com/emanuelef/github-repo-activity-stats/stats"
	"golang.org/x/oauth2"
)

func GetEnv(key, fallback string) string {
	value, exists := os.LookupEnv(key)
	if !exists {
		value = fallback
	}
	return value
}

func BToMb(b uint64) uint64 {
	return b / 1024 / 1024
}

func GenerateCSVData(repo string, data []stats.StarsPerDay) (string, error) {
	csvData := []string{"date,day-stars,total-stars"}

	for _, entry := range data {
		csvData = append(csvData, fmt.Sprintf("%s,%d,%d",
			time.Time(entry.Day).Format("02-01-2006"),
			entry.Stars,
			entry.TotalStars))
	}

	return strings.Join(csvData, "\n"), nil
}

func NewClientWithPAT(token string) *repostats.ClientGQL {
	tokenSource := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: token},
	)

	oauthClient := oauth2.NewClient(context.Background(), tokenSource)
	return repostats.NewClientGQL(oauthClient)
}
