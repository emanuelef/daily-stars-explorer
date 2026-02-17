package session

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"golang.org/x/exp/slices"
)

type Session struct {
	Repo         string
	StateChannel chan int
}

type SessionsLock struct {
	MU       sync.Mutex
	Sessions []*Session
}

func (sl *SessionsLock) AddSession(s *Session) {
	sl.MU.Lock()
	sl.Sessions = append(sl.Sessions, s)
	sl.MU.Unlock()
}

func (sl *SessionsLock) RemoveSession(s *Session) {
	sl.MU.Lock()
	idx := slices.Index(sl.Sessions, s)
	if idx != -1 {
		sl.Sessions[idx] = nil
		sl.Sessions = slices.Delete(sl.Sessions, idx, idx+1)
	}
	sl.MU.Unlock()
}

func Filter[T any](filter func(n T) bool) func(T []T) []T {
	return func(list []T) []T {
		r := make([]T, 0, len(list))
		for _, n := range list {
			if filter(n) {
				r = append(r, n)
			}
		}
		return r
	}
}

func FormatSSEMessage(eventType string, data any) (string, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)

	m := map[string]any{
		"data": data,
	}

	err := enc.Encode(m)
	if err != nil {
		return "", err
	}
	sb := strings.Builder{}

	if _, err := fmt.Fprintf(&sb, "event: %s\n", eventType); err != nil {
		return "", err
	}
	if _, err := fmt.Fprintf(&sb, "retry: %d\n", 15000); err != nil {
		return "", err
	}
	if _, err := fmt.Fprintf(&sb, "data: %v\n\n", buf.String()); err != nil {
		return "", err
	}

	return sb.String(), nil
}
