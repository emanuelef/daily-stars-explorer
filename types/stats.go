package types

import (
	"sync"
	"time"
)

type RequestStats struct {
	mu           sync.RWMutex
	currentDate  string
	requestCount int
	uniqueIPs    map[string]bool
	uniqueRepos  map[string]bool
}

func (rs *RequestStats) RecordRequest(ip, repo string) {
	rs.mu.Lock()
	defer rs.mu.Unlock()

	today := time.Now().UTC().Format("2006-01-02")

	// Reset if it's a new day
	if rs.currentDate != today {
		rs.currentDate = today
		rs.requestCount = 0
		rs.uniqueIPs = make(map[string]bool)
		rs.uniqueRepos = make(map[string]bool)
	}

	rs.requestCount++
	rs.uniqueIPs[ip] = true
	rs.uniqueRepos[repo] = true
}

func (rs *RequestStats) GetStats() (date string, requestCount int, uniqueIPs int, uniqueRepos int) {
	rs.mu.RLock()
	defer rs.mu.RUnlock()

	return rs.currentDate, rs.requestCount, len(rs.uniqueIPs), len(rs.uniqueRepos)
}
