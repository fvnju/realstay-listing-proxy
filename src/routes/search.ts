import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { and, count, eq, like, or, sql } from "drizzle-orm";
import { listings } from "../schema";
import { CacheService } from "../services/cache";
import { DatabaseService } from "../services/database";
import { ListingService } from "../services/listings";
import { SearchParamsSchema } from "../types/api";
import { extractUserToken } from "../middleware/auth";
import { serializeListing } from "../utils/listingSerializer";

type Variables = {
  userId?: string;
};

const searchRoutes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

// Unified search endpoint
searchRoutes.get("/", extractUserToken, zValidator("query", SearchParamsSchema), async (c) => {
  const params = c.req.valid("query");
  const userId = c.get("userId");

  const db = new DatabaseService(c.env);
  const cache = new CacheService(c.env);
  const listingService = new ListingService(db, cache);

  try {
    const results = await listingService.searchListings(params);

    // Add bookmark status if user is authenticated
    if (userId && results.listings.length > 0) {
      const listingIds = results.listings.map((l: any) => l.id);
      const bookmarkedIds = await db.getBookmarkedListingIds(userId, listingIds);

      results.listings = results.listings.map((listing: any) => ({
        ...serializeListing(listing),
        isBookmarked: bookmarkedIds.has(listing.id),
      })) as any;
    } else {
      results.listings = results.listings.map((listing: any) => ({
        ...serializeListing(listing),
        isBookmarked: false,
      })) as any;
    }

    return c.json(results);
  } catch (error) {
    console.error("Failed to search:", error);
    return c.json(
      {
        error: "Failed to search listings",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Shortlets specific search
searchRoutes.get(
  "/shortlets",
  extractUserToken,
  zValidator("query", SearchParamsSchema),
  async (c) => {
    const params = c.req.valid("query");
    const userId = c.get("userId");

    const db = new DatabaseService(c.env);
    const cache = new CacheService(c.env);
    const listingService = new ListingService(db, cache);

    try {
      const results = await listingService.searchShortlets(params);

      // Add bookmark status if user is authenticated
      if (userId && results.listings.length > 0) {
        const listingIds = results.listings.map((l: any) => l.id);
        const bookmarkedIds = await db.getBookmarkedListingIds(userId, listingIds);

        results.listings = results.listings.map((listing: any) => ({
          ...serializeListing(listing),
          isBookmarked: bookmarkedIds.has(listing.id),
        })) as any;
      } else {
        results.listings = results.listings.map((listing: any) => ({
          ...serializeListing(listing),
          isBookmarked: false,
        })) as any;
      }

      return c.json(results);
    } catch (error) {
      console.error("Failed to search shortlets:", error);
      return c.json(
        {
          error: "Failed to search shortlets",
          message: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  }
);

// Search suggestions
searchRoutes.get("/suggestions", async (c) => {
  const query = c.req.query("q");
  if (!query || query.length < 2) {
    return c.json({ suggestions: [] });
  }

  const db = new DatabaseService(c.env);
  const cache = new CacheService(c.env);

  const cacheKey = `search_suggestions:${query}`;
  const cached = await cache.get(cacheKey);

  if (cached) return c.json(cached);

  try {
    // Search in title, area, state, and lga fields
    const searchPattern = `%${query.toLowerCase()}%`;
    
    const areaSuggestions = await db
      .getDb()
      .selectDistinct({
        area: listings.area,
        state: listings.state,
        lga: listings.lga,
      })
      .from(listings)
      .where(
        and(
          eq(listings.isActive, true),
          or(
            like(sql`LOWER(${listings.area})`, searchPattern),
            like(sql`LOWER(${listings.state})`, searchPattern),
            like(sql`LOWER(${listings.lga})`, searchPattern)
          )
        )
      )
      .limit(10);

    const result = {
      suggestions: areaSuggestions
        .filter((s) => s.area)
        .map((s) => ({
          type: "area",
          value: `${s.area}, ${s.state}`,
          display: `${s.area}, ${s.lga}, ${s.state}`,
        })),
    };

    await cache.set(cacheKey, result, 1800); // 30 minutes
    return c.json(result);
  } catch (error) {
    console.error("Failed to get suggestions:", error);
    return c.json({ suggestions: [] });
  }
});

// Search facets/aggregations
searchRoutes.get("/facets", async (c) => {
  const state = c.req.query("state");
  const type = c.req.query("type");

  const cache = new CacheService(c.env);
  const db = new DatabaseService(c.env);

  const cacheKey = `search_facets:${state || "all"}:${type || "all"}`;
  const cached = await cache.get(cacheKey);

  if (cached) return c.json(cached);

  try {
    const { getDb } = db;

    // Get unique states with counts
    const states = await getDb()
      .select({ value: listings.state, count: count() })
      .from(listings)
      .where(eq(listings.isActive, true))
      .groupBy(listings.state);

    // Get unique LGAs for selected state
    let lgas: any[] = [];
    if (state) {
      lgas = await getDb()
        .select({ value: listings.lga, count: count() })
        .from(listings)
        .where(and(eq(listings.isActive, true), eq(listings.state, state)))
        .groupBy(listings.lga);
    }

    // Get unique areas for selected state
    let areas: any[] = [];
    if (state) {
      const whereConditions = [eq(listings.isActive, true), eq(listings.state, state)];
      
      areas = await getDb()
        .select({ value: listings.area, count: count() })
        .from(listings)
        .where(and(...whereConditions))
        .groupBy(listings.area);
    }

    // Get price ranges
    const whereConditions = [eq(listings.isActive, true)];
    if (type) {
      whereConditions.push(eq(listings.type, type));
    }
    
    const priceRanges = await getDb()
      .select({
        min: sql<number>`MIN(${listings.cost})`,
        max: sql<number>`MAX(${listings.cost})`,
        avg: sql<number>`AVG(${listings.cost})`,
      })
      .from(listings)
      .where(and(...whereConditions));

    // Get count by type
    const typeCounts = await getDb()
      .select({ value: listings.type, count: count() })
      .from(listings)
      .where(eq(listings.isActive, true))
      .groupBy(listings.type);

    const result = {
      states: states.map((s) => ({ ...s, label: s.value })),
      lgas: lgas.map((l) => ({ ...l, label: l.value })),
      areas: areas.map((a) => ({ ...a, label: a.value })),
      priceRanges: priceRanges[0],
      typeCounts: typeCounts.map((t) => ({
        ...t,
        label: t.value,
        count: Number(t.count),
      })),
    };

    await cache.set(cacheKey, result, 3600); // 1 hour
    return c.json(result);
  } catch (error) {
    console.error("Failed to get facets:", error);
    return c.json({
      states: [],
      lgas: [],
      areas: [],
      priceRanges: {},
      typeCounts: [],
    });
  }
});

export default searchRoutes;
