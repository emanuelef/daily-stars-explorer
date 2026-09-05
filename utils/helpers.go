package utils

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/emanuelef/gh-repo-stats-server/starhistory"
	"github.com/emanuelef/github-repo-activity-stats/repostats"
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

func GenerateCSVData(repo string, data []starhistory.StarsPerDay) (string, error) {
	csvData := []string{"date,day-stars,total-stars"}

	for _, entry := range data {
		csvData = append(csvData, fmt.Sprintf("%s,%d,%d",
			entry.Day.Time().Format("02-01-2006"),
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
