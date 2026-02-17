package news

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseRepoQuery(t *testing.T) {
	testCases := []struct {
		name  string
		input string
		owner string
		repo  string
	}{
		{
			name:  "owner slash repo",
			input: "Acme/Work",
			owner: "acme",
			repo:  "work",
		},
		{
			name:  "full github url",
			input: "https://github.com/Acme/Work/issues/123",
			owner: "acme",
			repo:  "work",
		},
		{
			name:  "bare repo",
			input: "work",
			owner: "",
			repo:  "work",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			owner, repo := parseRepoQuery(tc.input)
			assert.Equal(t, tc.owner, owner)
			assert.Equal(t, tc.repo, repo)
		})
	}
}

func TestMatchesRepoQueryOwnerRepo(t *testing.T) {
	owner, repo := parseRepoQuery("acme/work")

	t.Run("reject unrelated common-word post", func(t *testing.T) {
		post := PostData{
			Title:    "How to improve work life balance",
			SelfText: "No repo mention here",
		}

		assert.False(t, matchesRepoQuery(post, owner, repo, true))
	})

	t.Run("accept exact github url", func(t *testing.T) {
		post := PostData{
			Title: "v2 release",
			URL:   "https://github.com/acme/work",
		}

		assert.True(t, matchesRepoQuery(post, owner, repo, true))
	})

	t.Run("accept owner repo mention in title", func(t *testing.T) {
		post := PostData{
			Title: "acme/work got a major update",
		}

		assert.True(t, matchesRepoQuery(post, owner, repo, true))
	})

	t.Run("reject same repo different owner", func(t *testing.T) {
		post := PostData{
			Title: "github.com/other/work just released",
		}

		assert.False(t, matchesRepoQuery(post, owner, repo, true))
	})
}

func TestMatchesRepoQueryRepoOnly(t *testing.T) {
	t.Run("reject common word without github context", func(t *testing.T) {
		post := PostData{
			Title:    "work organization tips",
			SelfText: "better workflows",
		}

		assert.False(t, matchesRepoQuery(post, "", "work", true))
	})

	t.Run("accept github url with repo", func(t *testing.T) {
		post := PostData{
			Title: "project update",
			URL:   "https://github.com/acme/work",
		}

		assert.True(t, matchesRepoQuery(post, "", "work", true))
	})

	t.Run("accept token plus github context", func(t *testing.T) {
		post := PostData{
			Title:    "work package is now on GitHub",
			SelfText: "github discussion thread",
		}

		assert.True(t, matchesRepoQuery(post, "", "work", true))
	})
}

func TestMatchesRepoQueryNonStrict(t *testing.T) {
	post := PostData{
		Title:    "How to improve work life balance",
		SelfText: "No GitHub mention",
	}

	assert.True(t, matchesRepoQuery(post, "", "work", false))
}

func TestContainsRepoToken(t *testing.T) {
	assert.True(t, containsRepoToken("new work release", "work"))
	assert.False(t, containsRepoToken("network release", "work"))
}
