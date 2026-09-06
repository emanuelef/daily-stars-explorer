package starhistory

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestLiveStarHistory exercises the real GitHub endpoint. It is skipped unless
// a PAT is present, so `go test ./...` stays hermetic in CI.
//
// Run with: PAT=<token> go test ./starhistory/ -run TestLive -v
func TestLiveStarHistory(t *testing.T) {
	token := os.Getenv("PAT")
	if token == "" {
		t.Skip("PAT not set; skipping live GitHub API test")
	}
	if testing.Short() {
		t.Skip("live test skipped in short mode")
	}

	client := New(token)

	for _, repo := range []string{
		"gofiber/fiber",
		"emanuelef/daily-stars-explorer",
		"kubernetes/kubernetes",
	} {
		t.Run(repo, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()

			info, err := client.RepoInfo(ctx, repo)
			require.NoError(t, err)

			weeks, err := client.WeeklyHistory(ctx, repo, nil)
			require.NoError(t, err)
			require.NotEmpty(t, weeks)

			start := time.Now()
			series, err := client.DailyHistory(ctx, repo, nil)
			require.NoError(t, err)
			elapsed := time.Since(start)

			require.NotEmpty(t, series)

			firstDay := series[0].Day.Time()
			lastDay := series[len(series)-1].Day.Time()

			// The series normally starts on the creation day, but GitHub's day
			// buckets are not UTC-aligned, so it may start slightly earlier to
			// keep stars bucketed just before creation.
			creationDay := info.CreatedAt.UTC().Truncate(24 * time.Hour)
			assert.False(t, firstDay.After(creationDay), "series must not start after the creation day")
			assert.True(t, creationDay.Sub(firstDay) <= 7*24*time.Hour, "series must not start more than a week early")
			assert.Equal(t, time.Now().UTC().Truncate(24*time.Hour), lastDay, "series must end today")
			assert.Equal(t, int(lastDay.Sub(firstDay)/(24*time.Hour))+1, len(series),
				"series must have exactly one entry per day")

			for i := 1; i < len(series); i++ {
				assert.Equal(t, 24*time.Hour, series[i].Day.Time().Sub(series[i-1].Day.Time()),
					"consecutive entries must be one day apart at index %d", i)
			}

			// The expansion must not lose a single star from GitHub's own
			// weekly buckets — that part is entirely under our control.
			total := series[len(series)-1].TotalStars
			assert.Equal(t, weeklyTotal(weeks), total,
				"daily expansion must preserve every star in the weekly buckets")

			// GitHub's aggregate and stargazers_count can drift by a star or
			// two, so compare those loosely.
			assert.InDelta(t, info.StargazersCount, total, 25,
				"reconstructed total %d should track stargazers_count %d", total, info.StargazersCount)

			t.Logf("%s: %d days, %d stars reconstructed (weekly buckets %d, GitHub reports %d) in %s",
				repo, len(series), total, weeklyTotal(weeks), info.StargazersCount, elapsed)
		})
	}
}

func TestLiveRepoNotFound(t *testing.T) {
	token := os.Getenv("PAT")
	if token == "" {
		t.Skip("PAT not set; skipping live GitHub API test")
	}

	_, err := New(token).DailyHistory(context.Background(), "emanuelef/definitely-not-a-real-repo-xyz", nil)
	require.Error(t, err)

	apiErr, ok := err.(*APIError)
	require.True(t, ok, "expected *APIError, got %T", err)
	assert.Equal(t, 404, apiErr.StatusCode)
	assert.Contains(t, err.Error(), "not found", "message must route through classifyGitHubError")
}
