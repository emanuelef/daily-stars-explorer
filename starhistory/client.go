package starhistory

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"golang.org/x/sync/errgroup"
)

const (
	// DefaultBaseURL is the GitHub REST API root.
	DefaultBaseURL = "https://api.github.com"

	// APIVersion is the REST API version that introduced the star history
	// endpoint. Pinning it keeps the response shape stable.
	APIVersion = "2026-03-10"

	// WeeksPerPage is GitHub's page size for star history. The endpoint clamps
	// per_page to 30 — asking for 100 still returns 30 — so there is nothing to
	// gain by requesting more.
	WeeksPerPage = 30

	// MaxPages is GitHub's documented ceiling on the page parameter. At 30
	// weeks per page that covers ~57 years, far beyond any repository.
	MaxPages = 100

	// DefaultConcurrency is how many history pages are fetched at once. Kept
	// modest to stay clear of GitHub's secondary rate limits, which trigger on
	// burst concurrency rather than raw request count.
	DefaultConcurrency = 6

	// DefaultMaxRetries bounds retries for a single page on transient failures.
	DefaultMaxRetries = 3

	// rateLimitMessage marks a primary rate limit. It is compared by value
	// rather than matched as a substring, so it stays reliable regardless of
	// what a repository is called.
	rateLimitMessage = "API rate limit exceeded"
)

// Week is one weekly bucket from the star history endpoint.
//
// Week is the Unix timestamp of the week's first day (Sunday, UTC midnight),
// Total is the stars gained that week, and Days holds the seven per-day counts
// running Sunday through Saturday. GitHub guarantees Total == sum(Days).
type Week struct {
	Week  int64 `json:"week"`
	Total int   `json:"total"`
	Days  []int `json:"days"`
}

// RepoInfo is the slice of GET /repos/{owner}/{repo} that star history needs.
type RepoInfo struct {
	FullName        string    `json:"full_name"`
	CreatedAt       time.Time `json:"created_at"`
	StargazersCount int       `json:"stargazers_count"`
}

// APIError is a non-2xx response from GitHub. Use HTTPStatus to turn one into
// the status and message to return to the caller.
type APIError struct {
	StatusCode int
	Repo       string
	Message    string
	// RetryAfter carries GitHub's requested backoff when it sends one.
	RetryAfter time.Duration
}

func (e *APIError) Error() string {
	return fmt.Sprintf("github api: %s (repo %s, status %d)", e.Message, e.Repo, e.StatusCode)
}

// HTTPStatus maps a GitHub failure onto the status and message this API should
// return to the browser.
//
// Callers must prefer this over matching on Error(): the error string embeds
// the repository name, so substring matching misreads a 404 for a repo like
// "aws/aws-sdk-exceeded" as a rate limit.
func (e *APIError) HTTPStatus() (int, string) {
	switch {
	case e.StatusCode == http.StatusNotFound:
		return http.StatusNotFound, "Repository not found on GitHub"
	case e.StatusCode == http.StatusUnauthorized:
		return http.StatusUnauthorized, "GitHub API authorization error"
	case e.Message == rateLimitMessage:
		return http.StatusTooManyRequests, "GitHub API rate limit exceeded. Please try again later."
	case e.StatusCode == http.StatusForbidden:
		return http.StatusForbidden, "GitHub denied access to this repository"
	case e.StatusCode == http.StatusUnprocessableEntity:
		return http.StatusUnprocessableEntity, "Star history is not available for this repository"
	default:
		return http.StatusInternalServerError, "Internal server error while fetching GitHub data"
	}
}

// Client fetches star history over the GitHub REST API.
//
// The zero value is not usable; build one with New.
type Client struct {
	httpClient  *http.Client
	token       string
	baseURL     string
	concurrency int
	maxRetries  int
}

// Option customises a Client.
type Option func(*Client)

// WithBaseURL points the client at a different API root (used by tests).
func WithBaseURL(baseURL string) Option {
	return func(c *Client) { c.baseURL = strings.TrimSuffix(baseURL, "/") }
}

// WithHTTPClient supplies the underlying HTTP client.
func WithHTTPClient(hc *http.Client) Option {
	return func(c *Client) { c.httpClient = hc }
}

// WithConcurrency caps how many pages are fetched in parallel.
func WithConcurrency(n int) Option {
	return func(c *Client) {
		if n > 0 {
			c.concurrency = n
		}
	}
}

// WithMaxRetries caps retries per page on transient failures.
func WithMaxRetries(n int) Option {
	return func(c *Client) {
		if n >= 0 {
			c.maxRetries = n
		}
	}
}

// New builds a Client. An empty token still works — the endpoint serves public
// repositories unauthenticated at 60 requests/hour — but a token raises that to
// 5000/hour on the REST core bucket, which is separate from the GraphQL bucket
// the rest of the app spends.
func New(token string, opts ...Option) *Client {
	c := &Client{
		httpClient: &http.Client{
			Timeout:   30 * time.Second,
			Transport: otelhttp.NewTransport(http.DefaultTransport),
		},
		token:       token,
		baseURL:     DefaultBaseURL,
		concurrency: DefaultConcurrency,
		maxRetries:  DefaultMaxRetries,
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// RepoInfo fetches the repository's creation date and current star count.
//
// The creation date anchors the history to the same first day the GraphQL path
// used, and the star count is used to scale progress updates. GitHub answers
// renamed repositories with a 301, which the HTTP client follows on GET.
func (c *Client) RepoInfo(ctx context.Context, repo string) (RepoInfo, error) {
	owner, name, err := SplitRepo(repo)
	if err != nil {
		return RepoInfo{}, err
	}

	var info RepoInfo
	endpoint := fmt.Sprintf("%s/repos/%s/%s", c.baseURL, owner, name)
	if _, err := c.getJSON(ctx, endpoint, repo, &info); err != nil {
		return RepoInfo{}, err
	}
	return info, nil
}

// WeeklyHistory fetches every weekly bucket for a repository, newest week
// first on the wire but returned sorted oldest to newest.
//
// Page 1 is fetched first because its Link header carries rel="last", which
// turns the remaining pages into a set of independent, addressable requests
// that are fetched concurrently. If GitHub omits rel="last", it falls back to
// walking pages sequentially until one comes back empty.
//
// onPage, when non-nil, is called after each page completes with the number of
// pages done and the total expected.
func (c *Client) WeeklyHistory(ctx context.Context, repo string, onPage func(done, total int)) ([]Week, error) {
	owner, name, err := SplitRepo(repo)
	if err != nil {
		return nil, err
	}

	pageURL := func(page int) string {
		return fmt.Sprintf("%s/repos/%s/%s/stargazers/history?per_page=%d&page=%d",
			c.baseURL, owner, name, WeeksPerPage, page)
	}

	var first []Week
	header, err := c.getJSON(ctx, pageURL(1), repo, &first)
	if err != nil {
		return nil, err
	}

	// A repository with no stars at all returns an empty first page.
	if len(first) == 0 {
		if onPage != nil {
			onPage(1, 1)
		}
		return []Week{}, nil
	}

	lastPage := parseLastPage(header.Get("Link"))
	if lastPage > MaxPages {
		log.Printf("starhistory: %s reports %d pages, clamping to GitHub's max of %d", repo, lastPage, MaxPages)
		lastPage = MaxPages
	}

	if lastPage <= 1 {
		// Either the history fits on one page, or the Link header was missing
		// or unparseable. Both are handled by walking forward until empty.
		return c.walkRemaining(ctx, repo, pageURL, first, onPage)
	}

	var (
		mu    sync.Mutex
		done  = 1
		pages = make([][]Week, lastPage+1)
	)
	pages[1] = first
	if onPage != nil {
		onPage(done, lastPage)
	}

	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(c.concurrency)

	for page := 2; page <= lastPage; page++ {
		eg.Go(func() error {
			var weeks []Week
			if _, err := c.getJSON(egCtx, pageURL(page), repo, &weeks); err != nil {
				return err
			}

			mu.Lock()
			pages[page] = weeks
			done++
			progress := done
			mu.Unlock()

			if onPage != nil {
				onPage(progress, lastPage)
			}
			return nil
		})
	}

	if err := eg.Wait(); err != nil {
		return nil, err
	}

	all := make([]Week, 0, lastPage*WeeksPerPage)
	for _, weeks := range pages {
		all = append(all, weeks...)
	}
	return normaliseWeeks(all), nil
}

// walkRemaining pages forward one at a time until a page comes back empty.
// Used when rel="last" is unavailable, so the page count is unknown.
func (c *Client) walkRemaining(
	ctx context.Context,
	repo string,
	pageURL func(int) string,
	first []Week,
	onPage func(done, total int),
) ([]Week, error) {
	all := append([]Week(nil), first...)

	for page := 2; page <= MaxPages; page++ {
		var weeks []Week
		if _, err := c.getJSON(ctx, pageURL(page), repo, &weeks); err != nil {
			return nil, err
		}
		if len(weeks) == 0 {
			break
		}
		all = append(all, weeks...)
	}

	// No progress is reported mid-walk: the page count is unknown, so any
	// fraction would have to use the current page as its own denominator and
	// would report 100% on the very first page. This path is only taken when
	// GitHub omits rel="last", which it does when the whole history fits on one
	// page, so there is nothing meaningful to report anyway. Report completion.
	if onPage != nil {
		onPage(1, 1)
	}
	return normaliseWeeks(all), nil
}

// normaliseWeeks sorts buckets oldest-first and drops duplicates.
//
// Pages are fetched concurrently, so if the current week rolls over to a new
// Sunday mid-fetch, GitHub's pagination shifts by one week and adjacent pages
// can overlap. Keying by week timestamp makes that harmless. A shift can also
// leave a week missing; expandWeeks zero-fills by date, so a gap costs those
// days' counts rather than corrupting the series.
func normaliseWeeks(weeks []Week) []Week {
	seen := make(map[int64]struct{}, len(weeks))
	out := make([]Week, 0, len(weeks))

	for _, w := range weeks {
		if _, dup := seen[w.Week]; dup {
			continue
		}
		seen[w.Week] = struct{}{}
		out = append(out, w)
	}

	sortWeeksAscending(out)
	return out
}

// getJSON performs a GET, decodes the JSON body into out, and returns the
// response headers. Transient failures are retried with backoff.
func (c *Client) getJSON(ctx context.Context, endpoint, repo string, out any) (http.Header, error) {
	for attempt := 0; ; attempt++ {
		header, body, err := c.do(ctx, endpoint, repo)
		if err == nil {
			if decErr := json.Unmarshal(body, out); decErr != nil {
				return nil, fmt.Errorf("decoding GitHub response for %s: %w", repo, decErr)
			}
			return header, nil
		}

		if attempt >= c.maxRetries || !retryable(err) {
			return nil, err
		}

		delay := retryDelay(err, attempt)
		log.Printf("starhistory: %s transient failure (%v), retry %d/%d in %s", repo, err, attempt+1, c.maxRetries, delay)

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(delay):
		}
	}
}

// do issues a single request and classifies the response.
func (c *Client) do(ctx context.Context, endpoint, repo string) (http.Header, []byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, nil, err
	}

	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", APIVersion)
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, err
	}

	if resp.StatusCode == http.StatusOK {
		return resp.Header, body, nil
	}
	return resp.Header, nil, classifyResponse(resp, body, repo)
}

// classifyResponse turns a non-200 into an APIError whose message routes
// correctly through handlers.classifyGitHubError.
func classifyResponse(resp *http.Response, body []byte, repo string) error {
	apiErr := &APIError{
		StatusCode: resp.StatusCode,
		Repo:       repo,
		RetryAfter: parseRetryAfter(resp.Header.Get("Retry-After")),
	}

	switch resp.StatusCode {
	case http.StatusNotFound:
		apiErr.Message = "repository not found"
	case http.StatusUnauthorized:
		apiErr.Message = "bad credentials"
	case http.StatusForbidden, http.StatusTooManyRequests:
		// 403 covers both "rate limit exceeded" and a genuine permission
		// denial; the remaining-quota header separates them.
		if resp.Header.Get("X-RateLimit-Remaining") == "0" || strings.Contains(strings.ToLower(string(body)), "rate limit") {
			apiErr.Message = rateLimitMessage
		} else {
			apiErr.Message = "access forbidden"
		}
	case http.StatusUnprocessableEntity:
		apiErr.Message = "star history unavailable for this repository"
	default:
		apiErr.Message = fmt.Sprintf("unexpected response: %s", strings.TrimSpace(firstLine(string(body))))
	}

	return apiErr
}

func firstLine(s string) string {
	if s == "" {
		return "(empty body)"
	}
	if idx := strings.IndexByte(s, '\n'); idx >= 0 {
		s = s[:idx]
	}
	if len(s) > 200 {
		s = s[:200]
	}
	return s
}

// retryable reports whether an error is worth another attempt. A primary rate
// limit is not — its reset is minutes away, so failing fast is better than
// holding the request open.
func retryable(err error) bool {
	apiErr, ok := err.(*APIError)
	if !ok {
		// Network/transport error.
		return true
	}

	switch {
	case apiErr.Message == rateLimitMessage:
		return false
	case apiErr.StatusCode == http.StatusForbidden:
		// Secondary rate limit: GitHub asks callers to back off and retry.
		return true
	case apiErr.StatusCode >= 500:
		return true
	default:
		return false
	}
}

// parseRetryAfter reads the delay-seconds form of the Retry-After header,
// which is what GitHub sends on secondary rate limits. Capped so a hostile or
// mistaken value cannot park a request for minutes.
func parseRetryAfter(value string) time.Duration {
	if value == "" {
		return 0
	}
	seconds, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || seconds <= 0 {
		return 0
	}
	if seconds > 60 {
		seconds = 60
	}
	return time.Duration(seconds) * time.Second
}

// retryDelay honours Retry-After when GitHub sends one, else backs off
// exponentially: 1s, 2s, 4s.
func retryDelay(err error, attempt int) time.Duration {
	if apiErr, ok := err.(*APIError); ok && apiErr.RetryAfter > 0 {
		return apiErr.RetryAfter
	}
	return time.Duration(1<<attempt) * time.Second
}

// parseLastPage extracts the page number of the rel="last" link.
//
// GitHub's Link header rewrites the path to the numeric /repositories/{id}/
// form, so only the page query parameter is trustworthy. Returns 0 when the
// header is absent or carries no rel="last".
func parseLastPage(link string) int {
	if link == "" {
		return 0
	}

	for _, segment := range strings.Split(link, ",") {
		parts := strings.Split(strings.TrimSpace(segment), ";")
		if len(parts) < 2 {
			continue
		}

		isLast := false
		for _, param := range parts[1:] {
			p := strings.TrimSpace(param)
			if p == `rel="last"` || p == "rel=last" {
				isLast = true
				break
			}
		}
		if !isLast {
			continue
		}

		raw := strings.TrimSpace(parts[0])
		raw = strings.TrimPrefix(raw, "<")
		raw = strings.TrimSuffix(raw, ">")

		// Parse the query properly rather than searching for "page=" — the URL
		// also carries "per_page=30", whose tail matches that prefix.
		parsed, err := url.Parse(raw)
		if err != nil {
			continue
		}
		if page, err := strconv.Atoi(parsed.Query().Get("page")); err == nil && page > 0 {
			return page
		}
	}

	return 0
}
