/**
 * Interface for rate limit storage implementations.
 * Supports both distributed (Redis) and in-memory storage.
 */
export interface IRateLimitStore {
    /**
     * Attempts to consume a token from the rate limit bucket.
     * 
     * @param key - Unique identifier for the rate limit (e.g., "provider:orion:2024-11-26:14")
     * @param limit - Maximum number of requests allowed in the window
     * @param windowSeconds - Time window in seconds
     * @returns true if request is allowed, false if rate limit exceeded
     */
    tryConsume(key: string, limit: number, windowSeconds: number): Promise<boolean>;

    /**
     * Gets the current count for a rate limit key.
     * 
     * @param key - Unique identifier for the rate limit
     * @returns Current number of requests in the window
     */
    getCount(key: string): Promise<number>;

    /**
     * Resets the counter for a specific key.
     * Useful for testing or manual rate limit resets.
     * 
     * @param key - Unique identifier for the rate limit
     */
    reset(key: string): Promise<void>;

    /**
     * Closes any open connections (e.g., Redis connection).
     * Should be called on application shutdown.
     */
    disconnect(): Promise<void>;
}
