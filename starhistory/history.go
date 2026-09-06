package starhistory

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"
)

const day = 24 * time.Hour

// SplitRepo splits an "owner/name" path into its two halves.
func SplitRepo(repo string) (owner, name string, err error) {
	parts := strings.Split(strings.TrimSpace(repo), "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("repo should be provided as owner/name, got %q", repo)
	}
	return parts[0], parts[1], nil
}

func sortWeeksAscending(weeks []Week) {
	sort.Slice(weeks, func(i, j int) bool { return weeks[i].Week < weeks[j].Week })
}

// BuildDailySeries expands weekly buckets into one entry per UTC calendar day
// across [from, to], zero-filling days without stars and accumulating the
// running total.
//
// The range drives the output, not the buckets: GitHub's oldest week starts on
// the Sunday *containing* the repository's creation, and its newest week runs
// to the coming Saturday, so both ends are trimmed here. Building by date also
// means a missing week (possible if pagination shifts mid-fetch) degrades to
// zeros for those days rather than shifting every later day.
func BuildDailySeries(weeks []Week, from, to time.Time) []StarsPerDay {
	from = from.UTC().Truncate(day)
	to = to.UTC().Truncate(day)

	if to.Before(from) {
		return []StarsPerDay{}
	}

	count := int(to.Sub(from)/day) + 1
	series := make([]StarsPerDay, count)
	for i := range series {
		series[i].Day = JSONDay(from.AddDate(0, 0, i))
	}

	for _, week := range weeks {
		start := time.Unix(week.Week, 0).UTC().Truncate(day)
		for offset, stars := range week.Days {
			if stars == 0 {
				continue
			}
			idx := int(start.AddDate(0, 0, offset).Sub(from) / day)
			if idx < 0 || idx >= count {
				continue
			}
			series[idx].Stars += stars
		}
	}

	running := 0
	for i := range series {
		running += series[i].Stars
		series[i].TotalStars = running
	}

	return series
}

// DailyHistory returns the repository's complete star history, one entry per
// UTC day from the day it was created through today, with running totals.
//
// This is the drop-in replacement for the GraphQL two-way stargazer walk. It
// keeps that function's channel contract: progress values are pushed to
// updateChannel, which DailyHistory closes before returning.
//
// Progress is rescaled to the number of GraphQL page fetches the old
// implementation would have made — floor(stars/100) — because the frontend
// computes that same figure independently and treats reaching it as "fetch
// complete" (TimeSeriesChart.jsx:1809). Reporting the ~20 real REST pages
// instead would leave that condition unreachable and hang the chart whenever a
// second viewer joins a fetch already in flight.
func (c *Client) DailyHistory(ctx context.Context, repo string, updateChannel chan<- int) ([]StarsPerDay, error) {
	if updateChannel != nil {
		defer close(updateChannel)
	}

	info, err := c.RepoInfo(ctx, repo)
	if err != nil {
		return nil, err
	}

	report := progressReporter(ctx, updateChannel, info.StargazersCount/100)

	weeks, err := c.WeeklyHistory(ctx, repo, report)
	if err != nil {
		return nil, err
	}

	// GitHub's day buckets are not UTC-aligned — the docs warn about this, and
	// it is observable: gofiber/fiber was created 2020-01-16T03:59:20Z but has
	// a star bucketed on 2020-01-15. Starting the series at the creation day
	// would silently drop those stars, so start at whichever is earlier.
	from := info.CreatedAt.UTC().Truncate(day)
	if first, ok := firstStarDay(weeks); ok && first.Before(from) {
		from = first
	}

	series := BuildDailySeries(weeks, from, time.Now().UTC())

	if len(series) > 0 {
		reconstructed := series[len(series)-1].TotalStars
		reported := weeklyTotal(weeks)

		// Losing stars against GitHub's own weekly totals means the day
		// expansion dropped something — a real bug, so make it loud.
		if reconstructed != reported {
			log.Printf("starhistory: %s expanded to %d stars but its weekly buckets sum to %d",
				repo, reconstructed, reported)
		}

		// GitHub's aggregate and stargazers_count can legitimately disagree by
		// a star or two (stars landing mid-fetch, excluded accounts); only a
		// wide gap is worth flagging.
		if diff := info.StargazersCount - reported; diff > 10 || diff < -10 {
			log.Printf("starhistory: %s weekly buckets sum to %d but GitHub reports %d stargazers (diff %d)",
				repo, reported, info.StargazersCount, diff)
		}
	}

	return series, nil
}

// firstStarDay returns the earliest UTC day carrying at least one star.
func firstStarDay(weeks []Week) (time.Time, bool) {
	var earliest time.Time
	found := false

	for _, week := range weeks {
		start := time.Unix(week.Week, 0).UTC().Truncate(day)
		for offset, stars := range week.Days {
			if stars == 0 {
				continue
			}
			d := start.AddDate(0, 0, offset)
			if !found || d.Before(earliest) {
				earliest, found = d, true
			}
			break // days run in order, so the first non-zero is this week's earliest
		}
	}

	return earliest, found
}

// weeklyTotal sums the stars GitHub reported across all buckets.
func weeklyTotal(weeks []Week) int {
	total := 0
	for _, week := range weeks {
		total += week.Total
	}
	return total
}

// RecentDailyHistory returns daily star counts for roughly the last lastDays
// days, fetching only the pages that can contain them.
//
// Callers merge this into a longer cached series and recompute cumulative
// totals themselves, so TotalStars here is relative to the window.
func (c *Client) RecentDailyHistory(ctx context.Context, repo string, lastDays int) ([]StarsPerDay, error) {
	if lastDays <= 0 {
		return nil, fmt.Errorf("lastDays must be positive, got %d", lastDays)
	}

	owner, name, err := SplitRepo(repo)
	if err != nil {
		return nil, err
	}

	// Two weeks of slack covers the partial weeks at both ends of the window.
	weeksNeeded := lastDays/7 + 2
	pagesNeeded := (weeksNeeded + WeeksPerPage - 1) / WeeksPerPage
	if pagesNeeded > MaxPages {
		pagesNeeded = MaxPages
	}

	var weeks []Week
	for page := 1; page <= pagesNeeded; page++ {
		endpoint := fmt.Sprintf("%s/repos/%s/%s/stargazers/history?per_page=%d&page=%d",
			c.baseURL, owner, name, WeeksPerPage, page)

		var pageWeeks []Week
		if _, err := c.getJSON(ctx, endpoint, repo, &pageWeeks); err != nil {
			return nil, err
		}
		if len(pageWeeks) == 0 {
			break
		}
		weeks = append(weeks, pageWeeks...)
	}

	to := time.Now().UTC().Truncate(day)
	from := to.AddDate(0, 0, -(lastDays - 1))

	return BuildDailySeries(normaliseWeeks(weeks), from, to), nil
}

// progressReporter adapts page-completion callbacks to the integer progress
// channel, rescaling to endScale and dropping any value that would go
// backwards — pages complete concurrently, so callbacks arrive out of order.
//
// It returns nil when there is nothing to report, so WeeklyHistory can skip the
// callback entirely.
func progressReporter(ctx context.Context, updateChannel chan<- int, endScale int) func(done, total int) {
	if updateChannel == nil || endScale <= 0 {
		return nil
	}

	var (
		mu   sync.Mutex
		last = -1
	)

	return func(done, total int) {
		if total <= 0 {
			return
		}

		value := endScale * done / total

		mu.Lock()
		defer mu.Unlock()

		if value <= last {
			return
		}
		last = value

		// The reader is the request goroutine ranging over this channel until
		// DailyHistory closes it. Selecting on ctx keeps a cancelled request
		// from parking a fetch goroutine here forever.
		select {
		case updateChannel <- value:
		case <-ctx.Done():
		}
	}
}
