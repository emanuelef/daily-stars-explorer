package starhistory

import (
	"encoding/json"
	"testing"
	"time"

	libstats "github.com/emanuelef/github-repo-activity-stats/stats"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func utcDay(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t.UTC()
}

func weekAt(s string, days ...int) Week {
	total := 0
	for _, d := range days {
		total += d
	}
	return Week{Week: utcDay(s).Unix(), Total: total, Days: days}
}

func TestSplitRepo(t *testing.T) {
	tests := []struct {
		name      string
		repo      string
		wantOwner string
		wantName  string
		wantErr   bool
	}{
		{name: "valid", repo: "gofiber/fiber", wantOwner: "gofiber", wantName: "fiber"},
		{name: "surrounding space", repo: "  gofiber/fiber  ", wantOwner: "gofiber", wantName: "fiber"},
		{name: "no slash", repo: "fiber", wantErr: true},
		{name: "too many parts", repo: "a/b/c", wantErr: true},
		{name: "empty owner", repo: "/fiber", wantErr: true},
		{name: "empty name", repo: "gofiber/", wantErr: true},
		{name: "empty", repo: "", wantErr: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			owner, name, err := SplitRepo(tc.repo)
			if tc.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.wantOwner, owner)
			assert.Equal(t, tc.wantName, name)
		})
	}
}

func TestParseLastPage(t *testing.T) {
	tests := []struct {
		name string
		link string
		want int
	}{
		{
			name: "real github header rewritten to numeric repo path",
			link: `<https://api.github.com/repositories/234231371/stargazers/history?per_page=30&page=2>; rel="next", <https://api.github.com/repositories/234231371/stargazers/history?per_page=30&page=12>; rel="last"`,
			want: 12,
		},
		{
			name: "last page only",
			link: `<https://api.github.com/repositories/1/stargazers/history?per_page=30&page=21>; rel="last"`,
			want: 21,
		},
		{
			name: "on the final page there is no rel=last pointing forward",
			link: `<https://api.github.com/repositories/1/stargazers/history?per_page=30&page=11>; rel="prev", <https://api.github.com/repositories/1/stargazers/history?per_page=30&page=1>; rel="first"`,
			want: 0,
		},
		{name: "absent header", link: "", want: 0},
		{name: "malformed", link: "not a link header", want: 0},
		{name: "rel=last without quotes", link: `<https://x/y?page=4>; rel=last`, want: 4},
		{name: "page is last query param", link: `<https://x/y?page=7>; rel="last"`, want: 7},
		{name: "page followed by fragment", link: `<https://x/y?page=9#frag>; rel="last"`, want: 9},
		{name: "non numeric page", link: `<https://x/y?page=abc>; rel="last"`, want: 0},
		{name: "zero page ignored", link: `<https://x/y?page=0>; rel="last"`, want: 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, parseLastPage(tc.link))
		})
	}
}

func TestBuildDailySeries(t *testing.T) {
	t.Run("expands a week into seven days with running totals", func(t *testing.T) {
		// 2026-08-30 is a Sunday.
		weeks := []Week{weekAt("2026-08-30", 4, 9, 7, 6, 6, 3, 1)}

		series := BuildDailySeries(weeks, utcDay("2026-08-30"), utcDay("2026-09-05"))
		require.Len(t, series, 7)

		wantDaily := []int{4, 9, 7, 6, 6, 3, 1}
		wantTotal := []int{4, 13, 20, 26, 32, 35, 36}
		for i, s := range series {
			assert.Equal(t, wantDaily[i], s.Stars, "daily count at %d", i)
			assert.Equal(t, wantTotal[i], s.TotalStars, "cumulative at %d", i)
			assert.Equal(t, utcDay("2026-08-30").AddDate(0, 0, i), s.Day.Time())
		}
	})

	t.Run("zero fills gaps between weeks", func(t *testing.T) {
		weeks := []Week{
			weekAt("2026-08-16", 1, 0, 0, 0, 0, 0, 0),
			// 2026-08-23 deliberately missing
			weekAt("2026-08-30", 0, 0, 0, 0, 0, 0, 2),
		}

		series := BuildDailySeries(weeks, utcDay("2026-08-16"), utcDay("2026-09-05"))
		require.Len(t, series, 21)

		assert.Equal(t, 1, series[0].Stars)
		for i := 1; i < 20; i++ {
			assert.Zero(t, series[i].Stars, "day %d should be zero filled", i)
			assert.Equal(t, 1, series[i].TotalStars, "cumulative stays flat across the gap at %d", i)
		}
		assert.Equal(t, 2, series[20].Stars)
		assert.Equal(t, 3, series[20].TotalStars)
	})

	t.Run("drops days outside the requested range", func(t *testing.T) {
		// GitHub's oldest week starts before creation and its newest runs past
		// today; both ends must be trimmed.
		weeks := []Week{weekAt("2026-08-30", 5, 5, 5, 5, 5, 5, 5)}

		series := BuildDailySeries(weeks, utcDay("2026-09-01"), utcDay("2026-09-03"))
		require.Len(t, series, 3)
		assert.Equal(t, 5, series[0].Stars)
		assert.Equal(t, 15, series[2].TotalStars, "only the three in-range days are counted")
	})

	t.Run("single day range", func(t *testing.T) {
		weeks := []Week{weekAt("2026-08-30", 0, 0, 3, 0, 0, 0, 0)}
		series := BuildDailySeries(weeks, utcDay("2026-09-01"), utcDay("2026-09-01"))
		require.Len(t, series, 1)
		assert.Equal(t, 3, series[0].Stars)
	})

	t.Run("no weeks still yields a zero filled range", func(t *testing.T) {
		series := BuildDailySeries(nil, utcDay("2026-09-01"), utcDay("2026-09-05"))
		require.Len(t, series, 5)
		for _, s := range series {
			assert.Zero(t, s.Stars)
			assert.Zero(t, s.TotalStars)
		}
	})

	t.Run("inverted range yields nothing", func(t *testing.T) {
		series := BuildDailySeries([]Week{weekAt("2026-08-30", 1, 1, 1, 1, 1, 1, 1)},
			utcDay("2026-09-05"), utcDay("2026-09-01"))
		assert.Empty(t, series)
	})

	t.Run("overlapping weeks both contribute", func(t *testing.T) {
		// Defensive: normaliseWeeks dedupes by timestamp, but if two distinct
		// buckets ever covered the same day the counts must add, not replace.
		weeks := []Week{
			weekAt("2026-08-30", 1, 0, 0, 0, 0, 0, 0),
			{Week: utcDay("2026-08-30").Unix(), Total: 2, Days: []int{2, 0, 0, 0, 0, 0, 0}},
		}
		series := BuildDailySeries(weeks, utcDay("2026-08-30"), utcDay("2026-08-30"))
		require.Len(t, series, 1)
		assert.Equal(t, 3, series[0].Stars)
	})

	t.Run("tolerates a short days array", func(t *testing.T) {
		weeks := []Week{{Week: utcDay("2026-08-30").Unix(), Total: 2, Days: []int{2}}}
		series := BuildDailySeries(weeks, utcDay("2026-08-30"), utcDay("2026-09-05"))
		require.Len(t, series, 7)
		assert.Equal(t, 2, series[0].Stars)
		assert.Equal(t, 2, series[6].TotalStars)
	})
}

func TestFirstStarDay(t *testing.T) {
	t.Run("finds the earliest day carrying a star", func(t *testing.T) {
		weeks := []Week{
			weekAt("2020-01-12", 0, 0, 0, 1, 1, 1, 0),
			weekAt("2020-01-19", 5, 0, 0, 0, 0, 0, 0),
		}
		got, ok := firstStarDay(weeks)
		require.True(t, ok)
		assert.Equal(t, utcDay("2020-01-15"), got, "Wednesday of the first week")
	})

	t.Run("reports none when every bucket is empty", func(t *testing.T) {
		_, ok := firstStarDay([]Week{weekAt("2020-01-12", 0, 0, 0, 0, 0, 0, 0)})
		assert.False(t, ok)
	})

	t.Run("no weeks", func(t *testing.T) {
		_, ok := firstStarDay(nil)
		assert.False(t, ok)
	})
}

func TestNormaliseWeeks(t *testing.T) {
	t.Run("sorts ascending and drops duplicates", func(t *testing.T) {
		weeks := []Week{
			weekAt("2026-08-30", 1, 0, 0, 0, 0, 0, 0),
			weekAt("2026-08-16", 2, 0, 0, 0, 0, 0, 0),
			weekAt("2026-08-30", 9, 0, 0, 0, 0, 0, 0), // duplicate from a page overlap
			weekAt("2026-08-23", 3, 0, 0, 0, 0, 0, 0),
		}

		got := normaliseWeeks(weeks)
		require.Len(t, got, 3)
		assert.Equal(t, utcDay("2026-08-16").Unix(), got[0].Week)
		assert.Equal(t, utcDay("2026-08-23").Unix(), got[1].Week)
		assert.Equal(t, utcDay("2026-08-30").Unix(), got[2].Week)
		assert.Equal(t, 1, got[2].Total, "first occurrence wins")
	})

	t.Run("empty", func(t *testing.T) {
		assert.Empty(t, normaliseWeeks(nil))
	})
}

func TestFindMaxConsecutivePeriods(t *testing.T) {
	build := func(counts ...int) []StarsPerDay {
		weeks := []Week{}
		series := make([]StarsPerDay, len(counts))
		for i, c := range counts {
			series[i] = StarsPerDay{Day: JSONDay(utcDay("2026-01-01").AddDate(0, 0, i)), Stars: c}
		}
		_ = weeks
		return series
	}

	t.Run("finds the best window", func(t *testing.T) {
		periods, peaks, err := FindMaxConsecutivePeriods(build(1, 2, 10, 1, 1), 2)
		require.NoError(t, err)
		require.Len(t, periods, 1)
		assert.Equal(t, 12, periods[0].TotalStars)
		assert.Equal(t, utcDay("2026-01-02"), periods[0].StartDay.Time())
		assert.Equal(t, utcDay("2026-01-03"), periods[0].EndDay.Time())

		require.Len(t, peaks, 1)
		assert.Equal(t, 10, peaks[0].Stars)
	})

	t.Run("returns every tied window and peak", func(t *testing.T) {
		periods, peaks, err := FindMaxConsecutivePeriods(build(5, 0, 5, 0, 5), 1)
		require.NoError(t, err)
		assert.Len(t, periods, 3)
		assert.Len(t, peaks, 3)
		// Peaks come back chronologically.
		assert.Equal(t, utcDay("2026-01-01"), peaks[0].Day.Time())
		assert.Equal(t, utcDay("2026-01-05"), peaks[2].Day.Time())
	})

	t.Run("empty history does not panic", func(t *testing.T) {
		// The library version indexed sortedDays[0] unconditionally and
		// panicked here; /allStars for a starless repo hit exactly this.
		periods, peaks, err := FindMaxConsecutivePeriods(nil, 10)
		require.NoError(t, err)
		assert.Empty(t, periods)
		assert.Empty(t, peaks)
	})

	t.Run("history shorter than the window yields no periods but still peaks", func(t *testing.T) {
		periods, peaks, err := FindMaxConsecutivePeriods(build(3, 4), 10)
		require.NoError(t, err)
		assert.Empty(t, periods)
		require.Len(t, peaks, 1)
		assert.Equal(t, 4, peaks[0].Stars)
	})

	t.Run("a starless history reports no periods or peaks", func(t *testing.T) {
		// Every window and every day ties at zero. The library reported all of
		// them, bloating the response with thousands of meaningless entries.
		periods, peaks, err := FindMaxConsecutivePeriods(build(0, 0, 0), 2)
		require.NoError(t, err)
		assert.Empty(t, periods)
		assert.Empty(t, peaks)
	})

	t.Run("rejects a non positive window", func(t *testing.T) {
		_, _, err := FindMaxConsecutivePeriods(build(1, 2), 0)
		require.Error(t, err)
	})

	t.Run("matches the library on random histories", func(t *testing.T) {
		// The rolling-window rewrite must agree with the original O(n*k) scan.
		counts := []int{3, 0, 7, 7, 1, 0, 0, 9, 2, 2, 5, 5, 5, 0, 1}
		mine := build(counts...)

		lib := make([]libstats.StarsPerDay, len(counts))
		for i, c := range counts {
			lib[i] = libstats.StarsPerDay{
				Day:   libstats.JSONDay(utcDay("2026-01-01").AddDate(0, 0, i)),
				Stars: c,
			}
		}

		for _, window := range []int{1, 2, 3, 5, 10} {
			gotPeriods, _, err := FindMaxConsecutivePeriods(mine, window)
			require.NoError(t, err)

			best := 0
			for i := 0; i+window <= len(counts); i++ {
				sum := 0
				for j := i; j < i+window; j++ {
					sum += counts[j]
				}
				if sum > best {
					best = sum
				}
			}

			require.NotEmpty(t, gotPeriods, "window %d", window)
			assert.Equal(t, best, gotPeriods[0].TotalStars, "window %d", window)
		}
	})
}

func TestNewStarsLastDays(t *testing.T) {
	series := []StarsPerDay{
		{Stars: 1}, {Stars: 2}, {Stars: 3}, {Stars: 4},
	}

	assert.Equal(t, 7, NewStarsLastDays(series, 2))
	assert.Equal(t, 10, NewStarsLastDays(series, 4))
	assert.Equal(t, 10, NewStarsLastDays(series, 99), "clamps to the history length")
	assert.Equal(t, 0, NewStarsLastDays(series, 0))
	assert.Equal(t, 0, NewStarsLastDays(series, -1))
	assert.Equal(t, 0, NewStarsLastDays(nil, 10))
}

// TestWireCompatibility pins the JSON these types produce against the library
// types they replaced. The frontend reads star entries positionally
// (TimeSeriesChart.jsx: entry[2] is the cumulative total) and peaks by field
// name (MobileStarsView.jsx: p.Stars), so any drift here breaks the charts
// silently rather than loudly.
func TestWireCompatibility(t *testing.T) {
	day := utcDay("2026-01-16")

	t.Run("StarsPerDay", func(t *testing.T) {
		mine, err := json.Marshal(StarsPerDay{Day: JSONDay(day), Stars: 12, TotalStars: 345})
		require.NoError(t, err)

		lib, err := json.Marshal(libstats.StarsPerDay{Day: libstats.JSONDay(day), Stars: 12, TotalStars: 345})
		require.NoError(t, err)

		assert.JSONEq(t, string(lib), string(mine))
		assert.Equal(t, `["16-01-2026",12,345]`, string(mine))
	})

	t.Run("JSONDay", func(t *testing.T) {
		mine, err := json.Marshal(JSONDay(day))
		require.NoError(t, err)
		assert.Equal(t, `"16-01-2026"`, string(mine))
	})

	t.Run("MaxPeriod and PeakDay field names", func(t *testing.T) {
		periods, err := json.Marshal([]MaxPeriod{{
			StartDay:   JSONDay(day),
			EndDay:     JSONDay(day.AddDate(0, 0, 9)),
			TotalStars: 500,
		}})
		require.NoError(t, err)
		assert.JSONEq(t, `[{"StartDay":"16-01-2026","EndDay":"25-01-2026","TotalStars":500}]`, string(periods))

		peaks, err := json.Marshal([]PeakDay{{Day: JSONDay(day), Stars: 99}})
		require.NoError(t, err)
		assert.JSONEq(t, `[{"Day":"16-01-2026","Stars":99}]`, string(peaks))
	})

	t.Run("full series marshals as an array of triples", func(t *testing.T) {
		series := BuildDailySeries(
			[]Week{weekAt("2026-08-30", 1, 2, 0, 0, 0, 0, 0)},
			utcDay("2026-08-30"), utcDay("2026-09-01"),
		)
		out, err := json.Marshal(series)
		require.NoError(t, err)
		assert.JSONEq(t, `[["30-08-2026",1,1],["31-08-2026",2,3],["01-09-2026",0,3]]`, string(out))
	})
}
