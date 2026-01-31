package handlers

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/emanuelef/github-repo-activity-stats/repostats"
)

// ClientRateLimitInfo stores cached rate limit information for a client
type ClientRateLimitInfo struct {
	Remaining int
	Limit     int
	ResetAt   time.Time
	UpdatedAt time.Time
}

// ClientSelector manages PAT selection based on rate limits and availability
type ClientSelector struct {
	mu           sync.RWMutex
	rateLimits   map[string]*ClientRateLimitInfo
	busyClients  map[string]string // key -> repo being processed
	cacheTTL     time.Duration
	minRemaining int // minimum remaining before refreshing cache
}

// NewClientSelector creates a new ClientSelector
func NewClientSelector() *ClientSelector {
	return &ClientSelector{
		rateLimits:   make(map[string]*ClientRateLimitInfo),
		busyClients:  make(map[string]string),
		cacheTTL:     5 * time.Minute, // Cache rate limits for 5 minutes
		minRemaining: 100,             // Refresh if remaining < 100
	}
}

// Global client selector instance
var globalClientSelector = NewClientSelector()

// SelectBestClient chooses the best available client based on:
// 1. Not currently busy with a long-running operation
// 2. Most remaining API requests
// It uses cached rate limit info to avoid excessive API calls
func SelectBestClient(
	ctx context.Context,
	ghStatClients map[string]*repostats.ClientGQL,
	overrideKey string,
) (string, *repostats.ClientGQL) {
	// If a specific client is requested, use it
	if overrideKey != "" {
		if client, ok := ghStatClients[overrideKey]; ok {
			return overrideKey, client
		}
	}

	// If only one client, return it directly
	if len(ghStatClients) == 1 {
		for k, v := range ghStatClients {
			return k, v
		}
	}

	globalClientSelector.mu.RLock()
	bestIdleKey := ""
	bestIdleRemaining := -1
	bestBusyKey := ""
	bestBusyRemaining := -1
	needsRefresh := []string{}

	for key := range ghStatClients {
		info, exists := globalClientSelector.rateLimits[key]
		if !exists || time.Since(info.UpdatedAt) > globalClientSelector.cacheTTL {
			needsRefresh = append(needsRefresh, key)
			continue
		}

		// Check if rate limit has reset
		if time.Now().After(info.ResetAt) {
			needsRefresh = append(needsRefresh, key)
			continue
		}

		// Check if client is busy
		_, isBusy := globalClientSelector.busyClients[key]

		if isBusy {
			// Track best busy client as fallback
			if info.Remaining > bestBusyRemaining {
				bestBusyRemaining = info.Remaining
				bestBusyKey = key
			}
		} else {
			// Prefer idle clients
			if info.Remaining > bestIdleRemaining {
				bestIdleRemaining = info.Remaining
				bestIdleKey = key
			}
		}
	}
	globalClientSelector.mu.RUnlock()

	// Refresh stale entries (but limit to avoid too many API calls)
	if len(needsRefresh) > 0 {
		// Only refresh up to 2 clients at a time to avoid burst
		refreshCount := min(len(needsRefresh), 2)
		for i := 0; i < refreshCount; i++ {
			key := needsRefresh[i]
			if client, ok := ghStatClients[key]; ok {
				go globalClientSelector.RefreshRateLimit(ctx, key, client)
			}
		}
	}

	// Prefer idle client with enough remaining requests
	if bestIdleKey != "" && bestIdleRemaining > globalClientSelector.minRemaining {
		log.Printf("Selected idle client %s with %d remaining", bestIdleKey, bestIdleRemaining)
		return bestIdleKey, ghStatClients[bestIdleKey]
	}

	// Fall back to busy client if no idle ones available (with good remaining)
	if bestBusyKey != "" && bestBusyRemaining > globalClientSelector.minRemaining {
		log.Printf("Selected busy client %s with %d remaining (no idle clients)", bestBusyKey, bestBusyRemaining)
		return bestBusyKey, ghStatClients[bestBusyKey]
	}

	// If no cached info or all stale, pick first idle client and refresh
	globalClientSelector.mu.RLock()
	for key, client := range ghStatClients {
		if _, isBusy := globalClientSelector.busyClients[key]; !isBusy {
			globalClientSelector.mu.RUnlock()
			globalClientSelector.RefreshRateLimit(ctx, key, client)
			return key, client
		}
	}
	globalClientSelector.mu.RUnlock()

	// All clients are busy - use the busy one with most remaining requests
	if bestBusyKey != "" {
		log.Printf("WARNING: All clients busy, using %s with %d remaining", bestBusyKey, bestBusyRemaining)
		return bestBusyKey, ghStatClients[bestBusyKey]
	}

	// Absolute last resort: return any client (no cached info available)
	log.Printf("WARNING: No rate limit info cached, picking first available client")
	for k, v := range ghStatClients {
		return k, v
	}
	return "", nil
}

// MarkClientBusy marks a client as busy with a long-running operation
func MarkClientBusy(key string, repo string) {
	globalClientSelector.mu.Lock()
	defer globalClientSelector.mu.Unlock()
	globalClientSelector.busyClients[key] = repo
	log.Printf("Client %s marked busy (processing %s)", key, repo)
}

// MarkClientIdle marks a client as no longer busy
func MarkClientIdle(key string) {
	globalClientSelector.mu.Lock()
	defer globalClientSelector.mu.Unlock()
	delete(globalClientSelector.busyClients, key)
	log.Printf("Client %s marked idle", key)
}

// GetBusyClients returns a copy of the busy clients map (for monitoring)
func GetBusyClients() map[string]string {
	globalClientSelector.mu.RLock()
	defer globalClientSelector.mu.RUnlock()
	result := make(map[string]string)
	for k, v := range globalClientSelector.busyClients {
		result[k] = v
	}
	return result
}

// RefreshRateLimit updates the cached rate limit for a client
func (cs *ClientSelector) RefreshRateLimit(ctx context.Context, key string, client *repostats.ClientGQL) {
	result, err := client.GetCurrentLimits(ctx)
	if err != nil {
		log.Printf("Error getting rate limits for client %s: %v", key, err)
		return
	}

	cs.mu.Lock()
	cs.rateLimits[key] = &ClientRateLimitInfo{
		Remaining: result.Remaining,
		Limit:     result.Limit,
		ResetAt:   result.ResetAt,
		UpdatedAt: time.Now(),
	}
	cs.mu.Unlock()

	log.Printf("Client %s rate limit: %d/%d remaining, resets at %v", key, result.Remaining, result.Limit, result.ResetAt)
}

// UpdateAfterRequest updates the cached remaining count after a request
// This avoids needing to call the API to refresh
func (cs *ClientSelector) UpdateAfterRequest(key string, cost int) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	if info, exists := cs.rateLimits[key]; exists {
		info.Remaining -= cost
		if info.Remaining < 0 {
			info.Remaining = 0
		}
	}
}

// GetClientStats returns current cached stats for all clients (for debugging/monitoring)
func (cs *ClientSelector) GetClientStats() map[string]*ClientRateLimitInfo {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	result := make(map[string]*ClientRateLimitInfo)
	for k, v := range cs.rateLimits {
		result[k] = &ClientRateLimitInfo{
			Remaining: v.Remaining,
			Limit:     v.Limit,
			ResetAt:   v.ResetAt,
			UpdatedAt: v.UpdatedAt,
		}
	}
	return result
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
