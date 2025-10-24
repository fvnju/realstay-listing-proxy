export class CacheService {
  private kv: KVNamespace;

  constructor(env: CloudflareBindings) {
    this.kv = env.CACHE;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.kv.get(key, "json");
      return value as T;
    } catch (error) {
      console.error("Cache get error:", error);
      return null;
    }
  }

  async set(key: string, value: any, ttl = 300): Promise<void> {
    try {
      await this.kv.put(key, JSON.stringify(value), {
        expirationTtl: ttl,
      });
    } catch (error) {
      console.error("Cache set error:", error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(key);
    } catch (error) {
      console.error("Cache delete error:", error);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const list = await this.kv.list({ prefix: pattern });
      const deletePromises = list.keys.map((key) => this.kv.delete(key.name));
      await Promise.all(deletePromises);
    } catch (error) {
      console.error("Cache invalidate pattern error:", error);
    }
  }

  async getWithFallback<T>(
    key: string,
    fallback: () => Promise<T>,
    ttl = 300
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await fallback();
    await this.set(key, value, ttl);
    return value;
  }

  // Helper methods for specific cache keys
  listingKey(id: string): string {
    return `listing:${id}`;
  }

  searchKey(params: any): string {
    return `search:${JSON.stringify(params)}`;
  }

  bookingKey(id: string): string {
    return `booking:${id}`;
  }

  userBookmarksKey(userId: string): string {
    return `user_bookmarks:${userId}`;
  }

  bookmarkIdsKey(userId: string): string {
    return `bookmark_ids:${userId}`;
  }

  availabilityKey(listingId: string): string {
    return `availability:${listingId}`;
  }
}
