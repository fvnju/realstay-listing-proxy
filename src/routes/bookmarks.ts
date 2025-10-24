import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { BackendClient } from "../services/backendClient";
import { CacheService } from "../services/cache";
import { DatabaseService } from "../services/database";
import { ListingService } from "../services/listings";
import { serializeListing } from "../utils/listingSerializer";

type Variables = {
  userAccessToken?: string;
  userId?: string;
};

const bookmarkRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: Variables;
}>();

// Apply auth middleware to all bookmark routes
bookmarkRoutes.use("*", requireAuth);

// Get user's bookmarked listings
bookmarkRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: "User ID not found" }, 401);
  }

  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = (page - 1) * limit;

  const db = new DatabaseService(c.env);
  const cache = new CacheService(c.env);
  const listingService = new ListingService(db, cache);

  try {
    // Get bookmarks from local database
    const bookmarks = await db.getUserBookmarks(userId, limit, offset);

    // Fetch full listing details for each bookmark
    const listings = await Promise.all(
      bookmarks.map(async (bookmark) => {
        const listing = await listingService.getListingById(bookmark.listingId);
        return listing ? { ...serializeListing(listing), savedAt: bookmark.savedAt, isBookmarked: true } : null;
      })
    );

    // Filter out null values (deleted listings)
    const validListings = listings.filter((l) => l !== null);

    return c.json({
      listings: validListings,
      pagination: {
        page,
        limit,
        total: validListings.length,
      },
    });
  } catch (error) {
    console.error("Failed to fetch bookmarks:", error);
    return c.json(
      {
        error: "Failed to fetch bookmarks",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Sync saved listings from backend
bookmarkRoutes.post("/sync", async (c) => {
  const userId = c.get("userId");
  const userAccessToken = c.get("userAccessToken");

  if (!userId || !userAccessToken) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = new DatabaseService(c.env);
  const cache = new CacheService(c.env);
  const backendClient = new BackendClient(c.env.MAIN_BACKEND_URL, c.env.CACHE);

  try {
    // Fetch saved listings from backend using user's token
    const response = await backendClient.forwardUserRequest<any>(
      "/listing/saved_listings?page=1&page_size=100",
      { method: "GET" },
      userAccessToken
    );

    // The response format: { listings: [], pagination: {} }
    const savedListings = response.data.listings || [];

    // Sync to local database
    let syncedCount = 0;
    for (const listing of savedListings) {
      try {
        // Check if bookmark already exists
        const exists = await db.isBookmarked(userId, listing._id || listing.id);
        if (!exists) {
          await db.addBookmark(userId, listing._id || listing.id);
          syncedCount++;
        }
      } catch (err) {
        console.error(
          `Failed to sync bookmark for listing ${listing._id}:`,
          err
        );
      }
    }

    return c.json({
      success: true,
      message: `Synced ${syncedCount} saved listings`,
      total: savedListings.length,
      synced: syncedCount,
    });
  } catch (error) {
    console.error("Failed to sync saved listings:", error);
    return c.json(
      {
        error: "Failed to sync saved listings",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Check if a listing is bookmarked
bookmarkRoutes.get("/check/:listingId", async (c) => {
  const userId = c.get("userId");
  const listingId = c.req.param("listingId");

  if (!userId) {
    return c.json({ error: "User ID not found" }, 401);
  }

  const db = new DatabaseService(c.env);

  try {
    const isBookmarked = await db.isBookmarked(userId, listingId);
    return c.json({ isBookmarked });
  } catch (error) {
    console.error("Failed to check bookmark:", error);
    return c.json(
      {
        error: "Failed to check bookmark",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Add a bookmark
const addBookmarkSchema = z.object({
  listingId: z.string().min(1),
});

bookmarkRoutes.post("/", zValidator("json", addBookmarkSchema), async (c) => {
  const userId = c.get("userId");
  const userAccessToken = c.get("userAccessToken");
  const { listingId } = c.req.valid("json");

  if (!userId || !userAccessToken) {
    return c.json({ error: "User ID or access token not found" }, 401);
  }

  const db = new DatabaseService(c.env);
  const cache = new CacheService(c.env);
  const backendClient = new BackendClient(c.env.MAIN_BACKEND_URL, c.env.CACHE);

  try {
    // Check if already bookmarked locally
    const exists = await db.isBookmarked(userId, listingId);
    if (exists) {
      return c.json({ message: "Already bookmarked" }, 200);
    }

    // Store locally first
    const bookmark = await db.addBookmark(userId, listingId);

    // Sync immediately to backend
    try {
      await backendClient.saveListing(listingId, userAccessToken);
    } catch (backendError) {
      console.error("Failed to sync bookmark to backend:", backendError);
      // Continue - local save succeeded, backend sync failed
      return c.json(
        {
          success: true,
          message: "Bookmark added locally, backend sync failed",
          bookmark,
          syncError:
            backendError instanceof Error
              ? backendError.message
              : String(backendError),
        },
        201
      );
    }

    return c.json(
      {
        success: true,
        message: "Bookmark added and synced",
        bookmark,
      },
      201
    );
  } catch (error) {
    console.error("Failed to add bookmark:", error);
    return c.json(
      {
        error: "Failed to add bookmark",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Remove a bookmark
bookmarkRoutes.delete("/:listingId", async (c) => {
  const userId = c.get("userId");
  const userAccessToken = c.get("userAccessToken");
  const listingId = c.req.param("listingId");

  if (!userId || !userAccessToken) {
    return c.json({ error: "User ID or access token not found" }, 401);
  }

  const db = new DatabaseService(c.env);
  const cache = new CacheService(c.env);
  const backendClient = new BackendClient(c.env.MAIN_BACKEND_URL, c.env.CACHE);

  try {
    // Remove locally first
    await db.removeBookmark(userId, listingId);

    // Sync immediately to backend
    try {
      await backendClient.unsaveListing(listingId, userAccessToken);
    } catch (backendError) {
      console.error(
        "Failed to sync bookmark removal to backend:",
        backendError
      );
      // Continue - local removal succeeded, backend sync failed
      return c.json({
        success: true,
        message: "Bookmark removed locally, backend sync failed",
        syncError:
          backendError instanceof Error
            ? backendError.message
            : String(backendError),
      });
    }

    return c.json({
      success: true,
      message: "Bookmark removed and synced",
    });
  } catch (error) {
    console.error("Failed to remove bookmark:", error);
    return c.json(
      {
        error: "Failed to remove bookmark",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

export default bookmarkRoutes;
