import { drizzle } from "drizzle-orm/d1";
import { eq, desc, and, inArray, asc, gte, lte } from "drizzle-orm";
import {
  bookmarks,
  listings,
  pendingListings,
  shortletAvailability,
  syncStatus,
  type Bookmark,
  type Listing,
  type NewListing,
  type NewSyncStatus,
  type PendingListing,
  type ShortletAvailability,
  type SyncStatus,
} from "../schema";

export class DatabaseService {
  private db: ReturnType<typeof drizzle>;

  constructor(env: CloudflareBindings) {
    this.db = drizzle(env.DB);
  }

  // Listing operations
  async getListingById(id: string): Promise<Listing | undefined> {
    const result = await this.db
      .select()
      .from(listings)
      .where(eq(listings.id, id))
      .limit(1);
    return result[0];
  }

  /**
   * Check if listings are bookmarked by user
   * Returns a Set of bookmarked listing IDs for efficient lookup
   */
  async getBookmarkedListingIds(userId: string, listingIds: string[]): Promise<Set<string>> {
    if (!userId || listingIds.length === 0) {
      return new Set();
    }

    const bookmarked = await this.db
      .select({ listingId: bookmarks.listingId })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, userId),
          inArray(bookmarks.listingId, listingIds)
        )
      );

    return new Set(bookmarked.map(b => b.listingId));
  }

  /**
   * Check if a single listing is bookmarked by user
   */
  async isListingBookmarked(userId: string, listingId: string): Promise<boolean> {
    if (!userId) return false;

    const bookmark = await this.db
      .select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, userId),
          eq(bookmarks.listingId, listingId)
        )
      )
      .limit(1);

    return bookmark.length > 0;
  }

  async getListingsByOwnerId(ownerId: string): Promise<Listing[]> {
    return await this.db
      .select()
      .from(listings)
      .where(eq(listings.ownerId, ownerId))
      .orderBy(desc(listings.createdAt));
  }

  async getActiveListings(limit = 20, offset = 0): Promise<Listing[]> {
    return await this.db
      .select()
      .from(listings)
      .where(eq(listings.isActive, true))
      .orderBy(desc(listings.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async createListing(data: NewListing): Promise<Listing> {
    const result = await this.db.insert(listings).values(data).returning();
    return result[0];
  }

  async updateListing(
    id: string,
    data: Partial<NewListing>
  ): Promise<Listing | undefined> {
    const result = await this.db
      .update(listings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(listings.id, id))
      .returning();
    return result[0];
  }

  async deleteListing(id: string): Promise<void> {
    await this.db.delete(listings).where(eq(listings.id, id));
  }

  // Shortlet availability operations
  async getAvailabilityForListing(
    listingId: string
  ): Promise<ShortletAvailability[]> {
    return await this.db
      .select()
      .from(shortletAvailability)
      .where(eq(shortletAvailability.listingId, listingId))
      .orderBy(asc(shortletAvailability.date));
  }

  async checkAvailability(
    listingId: string,
    checkIn: Date,
    checkOut: Date
  ): Promise<boolean> {
    const availability = await this.db
      .select()
      .from(shortletAvailability)
      .where(
        and(
          eq(shortletAvailability.listingId, listingId),
          gte(shortletAvailability.date, checkIn),
          lte(shortletAvailability.date, checkOut),
          eq(shortletAvailability.isAvailable, true)
        )
      );

    const requiredDays = Math.floor(
      (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
    );
    return availability.length === requiredDays;
  }

  async setAvailability(
    listingId: string,
    date: Date,
    isAvailable: boolean,
    priceOverride?: number,
    minNights?: number
  ): Promise<void> {
    await this.db
      .insert(shortletAvailability)
      .values({
        listingId,
        date,
        isAvailable,
        priceOverride,
        minNights,
      })
      .onConflictDoUpdate({
        target: [shortletAvailability.listingId, shortletAvailability.date],
        set: { isAvailable, priceOverride, minNights },
      });
  }

  // Bookmark operations
  async getUserBookmarks(
    userId: string,
    limit = 20,
    offset = 0
  ): Promise<Bookmark[]> {
    return await this.db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId))
      .orderBy(desc(bookmarks.savedAt))
      .limit(limit)
      .offset(offset);
  }

  async isBookmarked(userId: string, listingId: string): Promise<boolean> {
    const bookmark = await this.db
      .select()
      .from(bookmarks)
      .where(
        and(eq(bookmarks.userId, userId), eq(bookmarks.listingId, listingId))
      )
      .limit(1);
    return bookmark.length > 0;
  }

  async addBookmark(userId: string, listingId: string): Promise<Bookmark> {
    const result = await this.db
      .insert(bookmarks)
      .values({ userId, listingId })
      .onConflictDoNothing()
      .returning();
    return result[0];
  }

  async removeBookmark(userId: string, listingId: string): Promise<void> {
    await this.db
      .delete(bookmarks)
      .where(
        and(eq(bookmarks.userId, userId), eq(bookmarks.listingId, listingId))
      );
  }

  // Sync status operations
  async createSyncStatus(type: string): Promise<SyncStatus> {
    const result = await this.db
      .insert(syncStatus)
      .values({
        syncType: type,
        startedAt: new Date(),
        status: "in_progress",
      })
      .returning();
    return result[0];
  }

  async updateSyncStatus(
    id: number,
    updates: Partial<NewSyncStatus>
  ): Promise<void> {
    await this.db.update(syncStatus).set(updates).where(eq(syncStatus.id, id));
  }

  async getLastSuccessfulSync(): Promise<SyncStatus | undefined> {
    const result = await this.db
      .select()
      .from(syncStatus)
      .where(eq(syncStatus.status, "completed"))
      .orderBy(desc(syncStatus.completedAt))
      .limit(1);
    return result[0];
  }

  // Pending listings operations
  async addPendingListing(id: string, data: any): Promise<PendingListing> {
    const result = await this.db
      .insert(pendingListings)
      .values({
        id,
        listingData: JSON.stringify(data),
        status: "pending",
      })
      .returning();
    return result[0];
  }

  async getPendingListings(limit = 50): Promise<PendingListing[]> {
    return await this.db
      .select()
      .from(pendingListings)
      .where(eq(pendingListings.status, "pending"))
      .orderBy(asc(pendingListings.createdAt))
      .limit(limit);
  }

  async updatePendingListingStatus(
    id: string,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    await this.db
      .update(pendingListings)
      .set({
        status,
        errorMessage,
        processedAt: new Date(),
      })
      .where(eq(pendingListings.id, id));
  }

  // Get the database instance for complex queries
  getDb() {
    return this.db;
  }
}
