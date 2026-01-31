package handlers

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestNewClientSelector(t *testing.T) {
	cs := NewClientSelector()
	assert.NotNil(t, cs)
	assert.NotNil(t, cs.rateLimits)
	assert.NotNil(t, cs.busyClients)
	assert.Equal(t, 5*time.Minute, cs.cacheTTL)
	assert.Equal(t, 100, cs.minRemaining)
}

func TestMarkClientBusyAndIdle(t *testing.T) {
	// Reset global state for test
	globalClientSelector = NewClientSelector()

	// Initially no busy clients
	busy := GetBusyClients()
	assert.Empty(t, busy)

	// Mark client as busy
	MarkClientBusy("PAT", "owner/repo")
	busy = GetBusyClients()
	assert.Len(t, busy, 1)
	assert.Equal(t, "owner/repo", busy["PAT"])

	// Mark another client as busy
	MarkClientBusy("PAT2", "other/repo")
	busy = GetBusyClients()
	assert.Len(t, busy, 2)
	assert.Equal(t, "other/repo", busy["PAT2"])

	// Mark first client as idle
	MarkClientIdle("PAT")
	busy = GetBusyClients()
	assert.Len(t, busy, 1)
	assert.Empty(t, busy["PAT"])
	assert.Equal(t, "other/repo", busy["PAT2"])

	// Mark second client as idle
	MarkClientIdle("PAT2")
	busy = GetBusyClients()
	assert.Empty(t, busy)
}

func TestGetBusyClientsReturnsCopy(t *testing.T) {
	// Reset global state for test
	globalClientSelector = NewClientSelector()

	MarkClientBusy("PAT", "owner/repo")

	// Get busy clients and modify the returned map
	busy := GetBusyClients()
	busy["PAT"] = "modified"
	busy["NEW"] = "new_repo"

	// Original should be unchanged
	busyAgain := GetBusyClients()
	assert.Equal(t, "owner/repo", busyAgain["PAT"])
	assert.Empty(t, busyAgain["NEW"])
}

func TestClientSelectorCacheRateLimits(t *testing.T) {
	cs := NewClientSelector()

	// Manually set rate limit info
	cs.mu.Lock()
	cs.rateLimits["PAT"] = &ClientRateLimitInfo{
		Remaining: 5000,
		Limit:     5000,
		ResetAt:   time.Now().Add(time.Hour),
		UpdatedAt: time.Now(),
	}
	cs.rateLimits["PAT2"] = &ClientRateLimitInfo{
		Remaining: 3000,
		Limit:     5000,
		ResetAt:   time.Now().Add(time.Hour),
		UpdatedAt: time.Now(),
	}
	cs.mu.Unlock()

	// Get stats
	stats := cs.GetClientStats()
	assert.Len(t, stats, 2)
	assert.Equal(t, 5000, stats["PAT"].Remaining)
	assert.Equal(t, 3000, stats["PAT2"].Remaining)
}

func TestUpdateAfterRequest(t *testing.T) {
	cs := NewClientSelector()

	// Set initial rate limit
	cs.mu.Lock()
	cs.rateLimits["PAT"] = &ClientRateLimitInfo{
		Remaining: 5000,
		Limit:     5000,
		ResetAt:   time.Now().Add(time.Hour),
		UpdatedAt: time.Now(),
	}
	cs.mu.Unlock()

	// Update after request with cost
	cs.UpdateAfterRequest("PAT", 100)

	stats := cs.GetClientStats()
	assert.Equal(t, 4900, stats["PAT"].Remaining)

	// Update with cost that would go negative
	cs.UpdateAfterRequest("PAT", 10000)
	stats = cs.GetClientStats()
	assert.Equal(t, 0, stats["PAT"].Remaining)
}

func TestUpdateAfterRequestNonExistentClient(t *testing.T) {
	cs := NewClientSelector()

	// Should not panic when updating non-existent client
	cs.UpdateAfterRequest("NONEXISTENT", 100)

	stats := cs.GetClientStats()
	assert.Empty(t, stats)
}

func TestMinFunction(t *testing.T) {
	assert.Equal(t, 1, min(1, 2))
	assert.Equal(t, 1, min(2, 1))
	assert.Equal(t, 5, min(5, 5))
	assert.Equal(t, -1, min(-1, 0))
	assert.Equal(t, -2, min(-1, -2))
}

func TestConcurrentBusyClientAccess(t *testing.T) {
	// Reset global state for test
	globalClientSelector = NewClientSelector()

	// Run concurrent operations
	done := make(chan bool)

	for i := 0; i < 10; i++ {
		go func(id int) {
			key := "PAT"
			if id%2 == 0 {
				key = "PAT2"
			}
			MarkClientBusy(key, "repo")
			GetBusyClients()
			MarkClientIdle(key)
			done <- true
		}(i)
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}

	// Should complete without data races
	busy := GetBusyClients()
	assert.Empty(t, busy)
}
