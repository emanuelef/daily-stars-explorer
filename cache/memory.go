package cache

import (
	"sync"
	"time"
)

// Cache represents an in-memory cache.
type Cache[T any] struct {
	mu    sync.Mutex
	items map[string]CacheItem[T]
}

// CacheItem represents an item stored in the cache.
type CacheItem[T any] struct {
	Value      T
	Expiration time.Time
}

// NewCache creates a new instance of the cache.
func NewCache[T any]() *Cache[T] {
	return &Cache[T]{
		items: make(map[string]CacheItem[T]),
	}
}

// Set adds an item to the cache with a specified key and expiration time.
func (c *Cache[T]) Set(key string, value T, expiration time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.items[key] = CacheItem[T]{
		Value:      value,
		Expiration: expiration,
	}
}

// Get retrieves an item from the cache by its key.
func (c *Cache[T]) Get(key string) (T, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	item, found := c.items[key]
	if !found {
		var zero T
		return zero, false
	}

	if item.Expiration.Before(time.Now()) {
		// Item has expired, remove it from the cache
		delete(c.items, key)
		var zero T
		return zero, false
	}

	return item.Value, true
}

func (c *Cache[T]) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items = make(map[string]CacheItem[T])
}

func (c *Cache[T]) GetAllKeys() []string {
	c.mu.Lock()
	defer c.mu.Unlock()

	keys := make([]string, 0, len(c.items))
	for key := range c.items {
		keys = append(keys, key)
	}

	return keys
}
