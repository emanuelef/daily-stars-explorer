// Package starhistory retrieves GitHub star history from the REST endpoint
// GET /repos/{owner}/{repo}/stargazers/history.
//
// It replaces the GraphQL `Repository.stargazers` walk that GitHub restricted
// in mid-2026 (see daily-stars-explorer#363). That connection enumerated one
// edge per stargazer, so a full history cost ceil(stars/100) requests. The REST
// endpoint returns pre-aggregated weekly buckets carrying per-day counts, so
// the same history costs ceil(weeks/30) requests — roughly 20 instead of 1000
// for a 100k-star repository — and it works unauthenticated.
//
// Everything stars-related lives in this package: the HTTP client, the
// week-to-day expansion, and the derived statistics. Nothing here depends on
// github-repo-activity-stats, so further GraphQL restrictions cannot break
// star history again.
//
// The JSON produced by these types is byte-identical to the shapes the
// frontend already consumes; starhistory_wire_test.go pins that against the
// library types it replaced.
package starhistory

import (
	"encoding/json"
	"fmt"
	"sort"
	"time"
)

// JSONDay is a day that marshals as "DD-MM-YYYY".
type JSONDay time.Time

// MarshalJSON renders the day in the DD-MM-YYYY form the frontend parses.
func (d JSONDay) MarshalJSON() ([]byte, error) {
	return []byte(fmt.Sprintf("%q", time.Time(d).Format("02-01-2006"))), nil
}

// Time returns the underlying timestamp (always UTC midnight here).
func (d JSONDay) Time() time.Time { return time.Time(d) }

// StarsPerDay is one day of the history: the day itself, the stars gained that
// day, and the running cumulative total.
//
// It marshals as the 3-element array [day, stars, totalStars] — the frontend
// indexes these positionally (TimeSeriesChart.jsx reads entry[2] for the
// cumulative total), so the array form is load-bearing.
type StarsPerDay struct {
	Day        JSONDay
	Stars      int
	TotalStars int
}

// MarshalJSON emits the positional [day, stars, totalStars] array.
func (s StarsPerDay) MarshalJSON() ([]byte, error) {
	return json.Marshal([]any{s.Day, s.Stars, s.TotalStars})
}

// MaxPeriod is a window of consecutive days with the highest star total.
type MaxPeriod struct {
	StartDay   JSONDay
	EndDay     JSONDay
	TotalStars int
}

// PeakDay is a single day and its star count.
type PeakDay struct {
	Day   JSONDay
	Stars int
}

// FindMaxConsecutivePeriods returns every window of consecutiveDays days that
// ties for the highest star total, along with every day tying for the single
// highest count.
//
// Unlike the library function it replaces, it returns empty slices instead of
// panicking when the history is empty or shorter than the window.
func FindMaxConsecutivePeriods(history []StarsPerDay, consecutiveDays int) ([]MaxPeriod, []PeakDay, error) {
	if consecutiveDays <= 0 {
		return nil, nil, fmt.Errorf("consecutiveDays must be positive, got %d", consecutiveDays)
	}

	maxPeriods := []MaxPeriod{}
	peakDays := []PeakDay{}

	if len(history) == 0 {
		return maxPeriods, peakDays, nil
	}

	// Rolling window: the library recomputed the sum from scratch for every
	// offset, which is O(days * window). Sliding it keeps this O(days), which
	// matters because this runs on every /allStars response.
	if len(history) >= consecutiveDays {
		sum := 0
		for i := 0; i < consecutiveDays; i++ {
			sum += history[i].Stars
		}

		maxSum := sum
		maxPeriods = append(maxPeriods, MaxPeriod{
			StartDay:   history[0].Day,
			EndDay:     history[consecutiveDays-1].Day,
			TotalStars: sum,
		})

		for i := 1; i <= len(history)-consecutiveDays; i++ {
			sum += history[i+consecutiveDays-1].Stars - history[i-1].Stars

			switch {
			case sum > maxSum:
				maxSum = sum
				maxPeriods = []MaxPeriod{{
					StartDay:   history[i].Day,
					EndDay:     history[i+consecutiveDays-1].Day,
					TotalStars: sum,
				}}
			case sum == maxSum:
				maxPeriods = append(maxPeriods, MaxPeriod{
					StartDay:   history[i].Day,
					EndDay:     history[i+consecutiveDays-1].Day,
					TotalStars: sum,
				})
			}
		}
	}

	// A repository with no stars ties every window and every day at zero. The
	// library reported all of them, so a starless repo produced thousands of
	// meaningless periods and peaks; report none instead.
	if len(maxPeriods) > 0 && maxPeriods[0].TotalStars == 0 {
		maxPeriods = []MaxPeriod{}
	}

	maxStars := history[0].Stars
	for _, day := range history[1:] {
		if day.Stars > maxStars {
			maxStars = day.Stars
		}
	}
	if maxStars == 0 {
		return maxPeriods, peakDays, nil
	}
	for _, day := range history {
		if day.Stars == maxStars {
			peakDays = append(peakDays, PeakDay{Day: day.Day, Stars: day.Stars})
		}
	}

	// The library sorted peaks by star count; with all peaks tied at maxStars
	// that only ever reordered equal values, so sort by day for a stable,
	// chronological result instead.
	sort.Slice(peakDays, func(i, j int) bool {
		return peakDays[i].Day.Time().Before(peakDays[j].Day.Time())
	})

	return maxPeriods, peakDays, nil
}

// NewStarsLastDays sums the stars gained over the final days entries.
func NewStarsLastDays(history []StarsPerDay, days int) int {
	if days > len(history) {
		days = len(history)
	}
	if days <= 0 {
		return 0
	}

	sum := 0
	for _, day := range history[len(history)-days:] {
		sum += day.Stars
	}
	return sum
}
