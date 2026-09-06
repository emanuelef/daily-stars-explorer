package handlers

import (
	"errors"
	"github.com/emanuelef/gh-repo-stats-server/starhistory"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestClassifyGitHubError_RateLimit(t *testing.T) {
	testCases := []struct {
		name string
		err  error
	}{
		{"rate limit", errors.New("API rate limit exceeded")},
		{"ratelimit", errors.New("ratelimit error occurred")},
		{"api rate", errors.New("GitHub api rate limit hit")},
		{"secondary rate", errors.New("secondary rate limit triggered")},
		{"exceeded", errors.New("Request limit exceeded")},
		{"mixed case", errors.New("Rate Limit EXCEEDED")},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			status, msg := classifyGitHubError(tc.err)
			assert.Equal(t, 429, status)
			assert.Contains(t, msg, "rate limit")
		})
	}
}

func TestClassifyGitHubError_NotFound(t *testing.T) {
	testCases := []struct {
		name string
		err  error
	}{
		{"not found", errors.New("repository not found")},
		{"could not resolve", errors.New("Could not resolve to a Repository")},
		{"does not exist", errors.New("Repository does not exist")},
		{"mixed case", errors.New("NOT FOUND on GitHub")},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			status, msg := classifyGitHubError(tc.err)
			assert.Equal(t, 404, status)
			assert.Contains(t, msg, "not found")
		})
	}
}

func TestClassifyGitHubError_InternalError(t *testing.T) {
	testCases := []struct {
		name string
		err  error
	}{
		{"generic error", errors.New("something went wrong")},
		{"network error", errors.New("connection refused")},
		{"timeout", errors.New("context deadline hit")},
		{"unknown", errors.New("unknown error occurred")},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			status, msg := classifyGitHubError(tc.err)
			assert.Equal(t, 500, status)
			assert.Contains(t, msg, "Internal server error")
		})
	}
}

func TestClassifyGitHubError_RateLimitTakesPrecedence(t *testing.T) {
	// If an error contains both "not found" and "rate limit", rate limit should win
	err := errors.New("rate limit exceeded while searching for not found repo")
	status, _ := classifyGitHubError(err)
	assert.Equal(t, 429, status)
}

// TestClassifyGitHubErrorUsesStructuredStatus pins the fix for a real
// misclassification: classifyGitHubError substring-matches the error text, and
// a starhistory.APIError embeds the repository name in that text. A 404 for a
// repo called "aws/aws-sdk-exceeded" therefore matched the "exceeded"
// rate-limit rule and was reported to the browser as 429.
func TestClassifyGitHubErrorUsesStructuredStatus(t *testing.T) {
	tests := []struct {
		name        string
		err         *starhistory.APIError
		wantStatus  int
		wantMessage string
	}{
		{
			name:        "not found",
			err:         &starhistory.APIError{StatusCode: 404, Repo: "gofiber/fiber", Message: "repository not found"},
			wantStatus:  404,
			wantMessage: "Repository not found on GitHub",
		},
		{
			name:        "repo name containing a rate-limit keyword stays a 404",
			err:         &starhistory.APIError{StatusCode: 404, Repo: "aws/aws-sdk-exceeded", Message: "repository not found"},
			wantStatus:  404,
			wantMessage: "Repository not found on GitHub",
		},
		{
			name:        "repo name containing 'rate limit' stays a 404",
			err:         &starhistory.APIError{StatusCode: 404, Repo: "someone/rate-limit-proxy", Message: "repository not found"},
			wantStatus:  404,
			wantMessage: "Repository not found on GitHub",
		},
		{
			name:       "primary rate limit becomes 429",
			err:        &starhistory.APIError{StatusCode: 403, Repo: "a/b", Message: "API rate limit exceeded"},
			wantStatus: 429,
		},
		{
			name:       "plain forbidden stays 403 rather than collapsing to 500",
			err:        &starhistory.APIError{StatusCode: 403, Repo: "a/b", Message: "access forbidden"},
			wantStatus: 403,
		},
		{
			name:       "unprocessable stays 422 rather than collapsing to 500",
			err:        &starhistory.APIError{StatusCode: 422, Repo: "a/b", Message: "star history unavailable for this repository"},
			wantStatus: 422,
		},
		{
			name:       "bad credentials",
			err:        &starhistory.APIError{StatusCode: 401, Repo: "a/b", Message: "bad credentials"},
			wantStatus: 401,
		},
		{
			name:       "upstream 5xx",
			err:        &starhistory.APIError{StatusCode: 502, Repo: "foo/not-found-tool", Message: "unexpected response: bad gateway"},
			wantStatus: 500,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			status, msg := classifyGitHubError(tc.err)
			assert.Equal(t, tc.wantStatus, status)
			if tc.wantMessage != "" {
				assert.Equal(t, tc.wantMessage, msg)
			}
		})
	}
}
