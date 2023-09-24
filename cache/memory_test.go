package cache

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestCache(t *testing.T) {
	cache := NewCache[int]()

	// Test Set and Get
	cache.Set("key1", 42, time.Now().Add(time.Minute))
	cache.Set("key2", 123, time.Now().Add(time.Minute))

	val, found := cache.Get("key1")
	assert.True(t, found)
	assert.Equal(t, 42, val)

	val, found = cache.Get("key2")
	assert.True(t, found)
	assert.Equal(t, 123, val)

	// Test Expired Item
	cache.Set("key3", 999, time.Now().Add(-time.Minute))
	val, found = cache.Get("key3")
	assert.False(t, found)
	assert.Zero(t, val)

	// Test Reset
	cache.Reset()
	val, found = cache.Get("key1")
	assert.False(t, found)
	assert.Zero(t, val)
}

func TestGetAllKeys(t *testing.T) {
	cache := NewCache[int]()

	cache.Set("key1", 42, time.Now().Add(time.Minute))
	cache.Set("key2", 123, time.Now().Add(time.Minute))

	keys := cache.GetAllKeys()
	assert.ElementsMatch(t, []string{"key1", "key2"}, keys)
}
