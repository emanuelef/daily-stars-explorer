package starhistory

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeGitHub serves the two endpoints the client uses, paginating a synthetic
// history the way the real API does: newest week first, pages walking backwards
// toward creation, Link carrying rel="last".
type fakeGitHub struct {
	createdAt time.Time
	stars     int
	weeks     []Week // oldest first; the handler reverses and paginates

	omitLinkHeader bool

	mu             sync.Mutex
	requestedPages []int
	statusOverride map[int]int // page -> status to return (once)
}

func (f *fakeGitHub) handler(t *testing.T) http.Handler {
	t.Helper()
	mux := http.NewServeMux()

	mux.HandleFunc("/repos/test/repo", func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "application/vnd.github+json", r.Header.Get("Accept"))
		require.Equal(t, APIVersion, r.Header.Get("X-GitHub-Api-Version"))

		_ = json.NewEncoder(w).Encode(map[string]any{
			"full_name":        "test/repo",
			"created_at":       f.createdAt.Format(time.RFC3339),
			"stargazers_count": f.stars,
		})
	})

	mux.HandleFunc("/repos/test/repo/stargazers/history", func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, strconv.Itoa(WeeksPerPage), r.URL.Query().Get("per_page"),
			"client must always request GitHub's maximum page size")

		page, _ := strconv.Atoi(r.URL.Query().Get("page"))

		f.mu.Lock()
		f.requestedPages = append(f.requestedPages, page)
		if status, ok := f.statusOverride[page]; ok {
			delete(f.statusOverride, page)
			f.mu.Unlock()
			w.WriteHeader(status)
			_, _ = w.Write([]byte(`{"message":"boom"}`))
			return
		}
		f.mu.Unlock()

		// Newest first.
		desc := make([]Week, len(f.weeks))
		for i, wk := range f.weeks {
			desc[len(f.weeks)-1-i] = wk
		}

		lastPage := (len(desc) + WeeksPerPage - 1) / WeeksPerPage
		start := (page - 1) * WeeksPerPage
		if start >= len(desc) {
			if !f.omitLinkHeader && lastPage > 0 {
				w.Header().Set("Link", fmt.Sprintf(`<http://x/repositories/1/stargazers/history?per_page=30&page=%d>; rel="last"`, lastPage))
			}
			_, _ = w.Write([]byte(`[]`))
			return
		}
		end := min(start+WeeksPerPage, len(desc))

		if !f.omitLinkHeader && page < lastPage {
			w.Header().Set("Link", fmt.Sprintf(
				`<http://x/repositories/1/stargazers/history?per_page=30&page=%d>; rel="next", <http://x/repositories/1/stargazers/history?per_page=30&page=%d>; rel="last"`,
				page+1, lastPage))
		}

		_ = json.NewEncoder(w).Encode(desc[start:end])
	})

	return mux
}

func (f *fakeGitHub) pages() []int {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := append([]int(nil), f.requestedPages...)
	sort.Ints(out)
	return out
}

// buildWeeks makes n consecutive weeks starting at the given Sunday, each with
// one star on its Sunday, so totals are trivially predictable.
func buildWeeks(firstSunday time.Time, n int) []Week {
	weeks := make([]Week, n)
	for i := range weeks {
		weeks[i] = Week{
			Week:  firstSunday.AddDate(0, 0, 7*i).Unix(),
			Total: 1,
			Days:  []int{1, 0, 0, 0, 0, 0, 0},
		}
	}
	return weeks
}

func newTestClient(t *testing.T, fake *fakeGitHub, opts ...Option) *Client {
	t.Helper()
	srv := httptest.NewServer(fake.handler(t))
	t.Cleanup(srv.Close)

	return New("test-token", append([]Option{
		WithBaseURL(srv.URL),
		WithHTTPClient(srv.Client()),
	}, opts...)...)
}

func TestWeeklyHistoryPaginates(t *testing.T) {
	// 95 weeks => 4 pages (30/30/30/5).
	firstSunday := utcDay("2024-01-07")
	fake := &fakeGitHub{
		createdAt: utcDay("2024-01-10"),
		stars:     95,
		weeks:     buildWeeks(firstSunday, 95),
	}
	client := newTestClient(t, fake)

	weeks, err := client.WeeklyHistory(context.Background(), "test/repo", nil)
	require.NoError(t, err)
	require.Len(t, weeks, 95)

	assert.Equal(t, []int{1, 2, 3, 4}, fake.pages(), "each page fetched exactly once")

	// Returned oldest first.
	for i := 1; i < len(weeks); i++ {
		assert.Less(t, weeks[i-1].Week, weeks[i].Week, "weeks must be ascending")
	}
	assert.Equal(t, firstSunday.Unix(), weeks[0].Week)
	assert.Equal(t, 95, weeklyTotal(weeks))
}

func TestWeeklyHistoryFallsBackWhenLinkHeaderMissing(t *testing.T) {
	fake := &fakeGitHub{
		createdAt:      utcDay("2024-01-10"),
		stars:          65,
		weeks:          buildWeeks(utcDay("2024-01-07"), 65),
		omitLinkHeader: true,
	}
	client := newTestClient(t, fake)

	weeks, err := client.WeeklyHistory(context.Background(), "test/repo", nil)
	require.NoError(t, err)

	require.Len(t, weeks, 65, "sequential walk must collect every page")
	assert.Equal(t, 65, weeklyTotal(weeks))
	// Walks 1,2,3 then a 4th empty page to learn it is done.
	assert.Equal(t, []int{1, 2, 3, 4}, fake.pages())
}

func TestWeeklyHistoryEmptyRepo(t *testing.T) {
	fake := &fakeGitHub{createdAt: utcDay("2026-08-01"), stars: 0, weeks: nil}
	client := newTestClient(t, fake)

	weeks, err := client.WeeklyHistory(context.Background(), "test/repo", nil)
	require.NoError(t, err)
	assert.Empty(t, weeks)
	assert.Equal(t, []int{1}, fake.pages(), "a starless repo costs a single request")
}

func TestDailyHistoryEmptyRepoStillSpansCreationToToday(t *testing.T) {
	created := time.Now().UTC().AddDate(0, 0, -10).Truncate(day)
	fake := &fakeGitHub{createdAt: created, stars: 0}
	client := newTestClient(t, fake)

	series, err := client.DailyHistory(context.Background(), "test/repo", nil)
	require.NoError(t, err)

	require.Len(t, series, 11, "creation day through today inclusive")
	assert.Equal(t, created, series[0].Day.Time())
	for _, s := range series {
		assert.Zero(t, s.Stars)
		assert.Zero(t, s.TotalStars)
	}
}

func TestDailyHistoryStartsBeforeCreationWhenGitHubBucketsEarlier(t *testing.T) {
	// Mirrors gofiber/fiber: created 2020-01-16 but a star bucketed 2020-01-15.
	created := utcDay("2020-01-16")
	fake := &fakeGitHub{
		createdAt: created,
		stars:     3,
		weeks: []Week{{
			Week:  utcDay("2020-01-12").Unix(),
			Total: 3,
			Days:  []int{0, 0, 0, 1, 1, 1, 0}, // Wed 15th, Thu 16th, Fri 17th
		}},
	}
	client := newTestClient(t, fake)

	series, err := client.DailyHistory(context.Background(), "test/repo", nil)
	require.NoError(t, err)
	require.NotEmpty(t, series)

	assert.Equal(t, utcDay("2020-01-15"), series[0].Day.Time(),
		"series must extend back to keep the pre-creation star")
	assert.Equal(t, 3, series[len(series)-1].TotalStars, "no star may be dropped")
}

func TestErrorMapping(t *testing.T) {
	tests := []struct {
		name        string
		status      int
		headers     map[string]string
		wantStatus  int
		wantMessage string
	}{
		{name: "not found", status: 404, wantStatus: 404, wantMessage: "repository not found"},
		{name: "bad credentials", status: 401, wantStatus: 401, wantMessage: "bad credentials"},
		{
			name:        "primary rate limit",
			status:      403,
			headers:     map[string]string{"X-RateLimit-Remaining": "0"},
			wantStatus:  403,
			wantMessage: "API rate limit exceeded",
		},
		{
			name:        "forbidden without rate limit headers",
			status:      403,
			headers:     map[string]string{"X-RateLimit-Remaining": "4999"},
			wantStatus:  403,
			wantMessage: "access forbidden",
		},
		{name: "unprocessable", status: 422, wantStatus: 422, wantMessage: "star history unavailable for this repository"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				for k, v := range tc.headers {
					w.Header().Set(k, v)
				}
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(`{"message":"nope"}`))
			}))
			defer srv.Close()

			client := New("t", WithBaseURL(srv.URL), WithHTTPClient(srv.Client()), WithMaxRetries(0))
			_, err := client.RepoInfo(context.Background(), "test/repo")
			require.Error(t, err)

			apiErr, ok := err.(*APIError)
			require.True(t, ok, "expected *APIError, got %T", err)
			assert.Equal(t, tc.wantStatus, apiErr.StatusCode)
			assert.Equal(t, tc.wantMessage, apiErr.Message)
		})
	}
}

func TestRetriesTransientFailures(t *testing.T) {
	t.Run("retries 500 then succeeds", func(t *testing.T) {
		var calls int32
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if atomic.AddInt32(&calls, 1) == 1 {
				w.WriteHeader(500)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"full_name": "test/repo", "created_at": "2024-01-01T00:00:00Z", "stargazers_count": 5,
			})
		}))
		defer srv.Close()

		// maxRetries default backoff starts at 1s; keep the test quick.
		client := New("t", WithBaseURL(srv.URL), WithHTTPClient(srv.Client()), WithMaxRetries(2))
		info, err := client.RepoInfo(context.Background(), "test/repo")
		require.NoError(t, err)
		assert.Equal(t, 5, info.StargazersCount)
		assert.Equal(t, int32(2), atomic.LoadInt32(&calls))
	})

	t.Run("does not retry a primary rate limit", func(t *testing.T) {
		var calls int32
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&calls, 1)
			w.Header().Set("X-RateLimit-Remaining", "0")
			w.WriteHeader(403)
		}))
		defer srv.Close()

		client := New("t", WithBaseURL(srv.URL), WithHTTPClient(srv.Client()), WithMaxRetries(3))
		_, err := client.RepoInfo(context.Background(), "test/repo")
		require.Error(t, err)
		assert.Equal(t, int32(1), atomic.LoadInt32(&calls), "a primary rate limit resets in minutes; retrying is pointless")
	})

	t.Run("does not retry a 404", func(t *testing.T) {
		var calls int32
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&calls, 1)
			w.WriteHeader(404)
		}))
		defer srv.Close()

		client := New("t", WithBaseURL(srv.URL), WithHTTPClient(srv.Client()), WithMaxRetries(3))
		_, err := client.RepoInfo(context.Background(), "test/repo")
		require.Error(t, err)
		assert.Equal(t, int32(1), atomic.LoadInt32(&calls))
	})
}

func TestParseRetryAfter(t *testing.T) {
	assert.Equal(t, 5*time.Second, parseRetryAfter("5"))
	assert.Equal(t, 60*time.Second, parseRetryAfter("600"), "capped")
	assert.Equal(t, time.Duration(0), parseRetryAfter(""))
	assert.Equal(t, time.Duration(0), parseRetryAfter("0"))
	assert.Equal(t, time.Duration(0), parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT"), "http-date form unsupported")
}

// TestProgressReachesFrontendCompletionValue is the regression test for the
// hang described in DailyHistory's doc comment: the frontend derives
// floor(stars/100) itself and only treats the fetch as finished when a progress
// value equals it. If the final emitted value ever drifts from that, a viewer
// who joins an in-flight fetch waits forever.
func TestProgressReachesFrontendCompletionValue(t *testing.T) {
	const stars = 4321 // frontend computes floor(4321/100) == 43

	fake := &fakeGitHub{
		createdAt: utcDay("2024-01-10"),
		stars:     stars,
		weeks:     buildWeeks(utcDay("2024-01-07"), 95), // 4 pages
	}
	client := newTestClient(t, fake)

	updates := make(chan int)
	var got []int
	done := make(chan struct{})
	go func() {
		defer close(done)
		for v := range updates {
			got = append(got, v)
		}
	}()

	_, err := client.DailyHistory(context.Background(), "test/repo", updates)
	require.NoError(t, err)
	<-done

	require.NotEmpty(t, got, "progress must be reported")
	assert.Equal(t, stars/100, got[len(got)-1],
		"final progress must equal the frontend's callsNeeded or the chart hangs")

	for i := 1; i < len(got); i++ {
		assert.Greater(t, got[i], got[i-1], "progress must be strictly increasing at %d", i)
	}
}

func TestProgressChannelIsClosedOnError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	}))
	defer srv.Close()

	client := New("t", WithBaseURL(srv.URL), WithHTTPClient(srv.Client()), WithMaxRetries(0))

	updates := make(chan int)
	go func() {
		for range updates { //nolint:revive // draining
		}
	}()

	_, err := client.DailyHistory(context.Background(), "test/repo", updates)
	require.Error(t, err)

	// A second close would panic; this asserts DailyHistory is the sole owner.
	_, stillOpen := <-updates
	assert.False(t, stillOpen, "DailyHistory must close the channel exactly once")
}

func TestContextCancellationStopsFetch(t *testing.T) {
	fake := &fakeGitHub{
		createdAt: utcDay("2024-01-10"),
		stars:     95,
		weeks:     buildWeeks(utcDay("2024-01-07"), 95),
	}
	client := newTestClient(t, fake)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := client.WeeklyHistory(ctx, "test/repo", nil)
	require.Error(t, err)
}

func TestRecentDailyHistoryFetchesOnlyNeededPages(t *testing.T) {
	today := time.Now().UTC().Truncate(day)
	// Sunday on or before today, then 200 weeks back.
	sunday := today.AddDate(0, 0, -int(today.Weekday()))
	weeks := buildWeeks(sunday.AddDate(0, 0, -7*199), 200)

	fake := &fakeGitHub{createdAt: sunday.AddDate(0, 0, -7*199), stars: 200, weeks: weeks}
	client := newTestClient(t, fake)

	series, err := client.RecentDailyHistory(context.Background(), "test/repo", 30)
	require.NoError(t, err)

	assert.Equal(t, []int{1}, fake.pages(), "30 days needs only the newest page")
	require.Len(t, series, 30)
	assert.Equal(t, today, series[len(series)-1].Day.Time())

	// Each week contributes one star on its Sunday; a 30-day window covers 4-5.
	assert.GreaterOrEqual(t, series[len(series)-1].TotalStars, 4)
	assert.LessOrEqual(t, series[len(series)-1].TotalStars, 5)
}

func TestRecentDailyHistoryRejectsBadWindow(t *testing.T) {
	client := New("t")
	_, err := client.RecentDailyHistory(context.Background(), "test/repo", 0)
	require.Error(t, err)
}

// TestProgressCompletesOnTheSequentialFallback covers the rel="last"-missing
// path: the frontend still needs a final progress value equal to
// floor(stars/100), even though no intermediate progress can be computed.
func TestProgressCompletesOnTheSequentialFallback(t *testing.T) {
	const stars = 250 // floor(250/100) == 2

	fake := &fakeGitHub{
		createdAt:      utcDay("2024-01-10"),
		stars:          stars,
		weeks:          buildWeeks(utcDay("2024-01-07"), 20), // one page
		omitLinkHeader: true,
	}
	client := newTestClient(t, fake)

	updates := make(chan int)
	var got []int
	done := make(chan struct{})
	go func() {
		defer close(done)
		for v := range updates {
			got = append(got, v)
		}
	}()

	_, err := client.DailyHistory(context.Background(), "test/repo", updates)
	require.NoError(t, err)
	<-done

	require.NotEmpty(t, got)
	assert.Equal(t, stars/100, got[len(got)-1],
		"the fallback path must still reach the frontend's completion value")
	for i := 1; i < len(got); i++ {
		assert.Greater(t, got[i], got[i-1], "progress must never go backwards")
	}
}
