import { IRateLimitStore } from './IRateLimitStore'

interface RateLimitEntry {
  timestamps: number[]
}

/**
 * In-memory rate limit store using sliding window algorithm.
 * Suitable for single-worker development or as a fallback when Redis is unavailable.
 *
 * WARNING: This implementation does NOT share state between workers.
 * For production with multiple workers, use RedisRateLimitStore.
 */
export class InMemoryRateLimitStore implements IRateLimitStore {
  private store: Map<string, RateLimitEntry>

  constructor() {
    this.store = new Map()
  }

  async tryConsume(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now()
    const windowStart = now - windowSeconds * 1000

    // Get or create entry
    let entry = this.store.get(key)
    if (!entry) {
      entry = { timestamps: [] }
      this.store.set(key, entry)
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart)

    // Check if under limit
    if (entry.timestamps.length >= limit) {
      return false
    }

    // Add current timestamp
    entry.timestamps.push(now)
    return true
  }

  async getCount(key: string): Promise<number> {
    const entry = this.store.get(key)
    return entry ? entry.timestamps.length : 0
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key)
  }

  async disconnect(): Promise<void> {
    // No-op for in-memory store
    this.store.clear()
  }
}
