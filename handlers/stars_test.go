package handlers

import (
	"testing"
	"time"

	"github.com/emanuelef/gh-repo-stats-server/starhistory"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestGithubBucketDay pins the rule that decides whether GitHub has begun
// counting the current UTC day.
//
// GitHub buckets stars on a US Pacific day boundary, so for the 7-8 hours after
// UTC midnight its "today" is still the previous UTC date. During that window a
// zero count means "this day does not exist yet", not "no stars".
func TestGithubBucketDay(t *testing.T) {
	tests := []struct {
		name        string
		now         time.Time
		wantDay     string
		wantStarted bool
	}{
		{
			name:        "just after UTC midnight, Pacific is still yesterday",
			now:         time.Date(2026, 9, 7, 0, 30, 0, 0, time.UTC),
			wantDay:     "2026-09-06",
			wantStarted: false,
		},
		{
			name:        "the reported case: 06:23 UTC is 23:23 PDT the day before",
			now:         time.Date(2026, 9, 7, 6, 23, 0, 0, time.UTC),
			wantDay:     "2026-09-06",
			wantStarted: false,
		},
		{
			name:        "06:59 UTC, one minute before Pacific midnight in summer",
			now:         time.Date(2026, 9, 7, 6, 59, 0, 0, time.UTC),
			wantDay:     "2026-09-06",
			wantStarted: false,
		},
		{
			name:        "07:00 UTC in summer, Pacific rolls over and the day starts",
			now:         time.Date(2026, 9, 7, 7, 0, 0, 0, time.UTC),
			wantDay:     "2026-09-07",
			wantStarted: true,
		},
		{
			name:        "midday UTC is comfortably started",
			now:         time.Date(2026, 9, 7, 12, 0, 0, 0, time.UTC),
			wantDay:     "2026-09-07",
			wantStarted: true,
		},
		{
			name:        "winter: PST is UTC-8, so 07:30 UTC has NOT rolled over",
			now:         time.Date(2026, 1, 15, 7, 30, 0, 0, time.UTC),
			wantDay:     "2026-01-14",
			wantStarted: false,
		},
		{
			name:        "winter: 08:00 UTC rolls over",
			now:         time.Date(2026, 1, 15, 8, 0, 0, 0, time.UTC),
			wantDay:     "2026-01-15",
			wantStarted: true,
		},
		{
			name:        "just before UTC midnight is always started",
			now:         time.Date(2026, 9, 7, 23, 59, 0, 0, time.UTC),
			wantDay:     "2026-09-07",
			wantStarted: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := githubBucketDay(tc.now)
			assert.Equal(t, tc.wantDay, got.Format("2006-01-02"))

			utcToday := tc.now.UTC().Truncate(24 * time.Hour)
			started := !got.Before(utcToday)
			assert.Equal(t, tc.wantStarted, started,
				"at %s UTC, GitHub's day is %s", tc.now.Format("15:04"), got.Format("2006-01-02"))
		})
	}
}

// TestGithubBucketDayHasTimezoneData guards the alpine runtime image, which
// ships no tzdata — the package embeds it via a blank time/tzdata import.
func TestGithubBucketDayHasTimezoneData(t *testing.T) {
	_, err := time.LoadLocation(githubBucketZone)
	require.NoError(t, err, "tzdata must be embedded or the fallback silently takes over")

	// Summer and winter must differ, proving a real zone rather than a fixed offset.
	summer := githubBucketDay(time.Date(2026, 7, 1, 7, 30, 0, 0, time.UTC))
	winter := githubBucketDay(time.Date(2026, 1, 1, 7, 30, 0, 0, time.UTC))
	assert.Equal(t, "2026-07-01", summer.Format("2006-01-02"), "PDT is UTC-7")
	assert.Equal(t, "2025-12-31", winter.Format("2006-01-02"), "PST is UTC-8")
}

func TestMergeDailySeries(t *testing.T) {
	day := func(s string) time.Time {
		d, err := time.Parse("2006-01-02", s)
		require.NoError(t, err)
		return d.UTC()
	}
	entry := func(d string, stars int) starhistory.StarsPerDay {
		return starhistory.StarsPerDay{Day: starhistory.JSONDay(day(d)), Stars: stars}
	}

	t.Run("appends new days and recomputes cumulative totals", func(t *testing.T) {
		base := []starhistory.StarsPerDay{entry("2026-09-01", 5), entry("2026-09-02", 3)}
		updates := []starhistory.StarsPerDay{entry("2026-09-03", 7), entry("2026-09-04", 2)}

		got := mergeDailySeries(base, updates, day("2026-09-05"))
		require.Len(t, got, 4)
		assert.Equal(t, []int{5, 8, 15, 17}, []int{
			got[0].TotalStars, got[1].TotalStars, got[2].TotalStars, got[3].TotalStars,
		})
	})

	t.Run("drops days on or after the cutoff so a partial day is never cached", func(t *testing.T) {
		base := []starhistory.StarsPerDay{entry("2026-09-01", 5)}
		updates := []starhistory.StarsPerDay{entry("2026-09-02", 3), entry("2026-09-03", 99)}

		got := mergeDailySeries(base, updates, day("2026-09-03"))
		require.Len(t, got, 2, "the cutoff day must be excluded")
		assert.Equal(t, "02-09-2026", got[1].Day.Time().Format("02-01-2006"))
	})

	t.Run("an update corrects a day stored while it was still partial", func(t *testing.T) {
		base := []starhistory.StarsPerDay{entry("2026-09-01", 5), entry("2026-09-02", 1)}
		updates := []starhistory.StarsPerDay{entry("2026-09-02", 9)}

		got := mergeDailySeries(base, updates, day("2026-09-03"))
		require.Len(t, got, 2)
		assert.Equal(t, 9, got[1].Stars, "the fresher value must win")
		assert.Equal(t, 14, got[1].TotalStars)
	})

	t.Run("stays sorted regardless of input order", func(t *testing.T) {
		base := []starhistory.StarsPerDay{entry("2026-09-03", 1)}
		updates := []starhistory.StarsPerDay{entry("2026-09-01", 1), entry("2026-09-02", 1)}

		got := mergeDailySeries(base, updates, day("2026-09-10"))
		require.Len(t, got, 3)
		for i := 1; i < len(got); i++ {
			assert.True(t, got[i-1].Day.Time().Before(got[i].Day.Time()))
		}
	})

	t.Run("empty inputs", func(t *testing.T) {
		assert.Empty(t, mergeDailySeries(nil, nil, day("2026-09-01")))
	})
}
