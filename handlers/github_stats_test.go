package handlers

import (
	"errors"
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
