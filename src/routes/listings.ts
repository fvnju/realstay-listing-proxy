import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { NewListing } from "../schema";
import { CacheService } from "../services/cache";
import { DatabaseService } from "../services/database";
import { ListingService } from "../services/listings";
import { BackendClient } from "../services/backendClient";
import { CreateListingSchema, SearchParamsSchema } from "../types/api";
import { extractUserToken, requireAuth } from "../middleware/auth";
import { toBackendSchema, fromBackendSchema } from "../utils/schemaTransform";
import { serializeListing } from "../utils/listingSerializer";

type Variables = {
  userAccessToken?: string;
  userId?: string;
};

const listingRoutes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

// Get listing by ID
listingRoutes.get("/:id", extractUserToken, async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId"); // Optional - may be undefined

  const db = new DatabaseService(c.env);
  const cache = new CacheService(c.env);
  const listingService = new ListingService(db, cache);

  try {
    const listing = await listingService.getListingById(id);

    if (!listing) {
      return c.json({ error: "Listing not found" }, 404);
    }

    // Serialize listing (parse JSON fields)
    const serialized = serializeListing(listing);

    // Add bookmark status if user is authenticated
    let isBookmarked = false;
    if (userId) {
      isBookmarked = await db.isListingBookmarked(userId, id);
    }

    return c.json({
      ...serialized,
      isBookmarked,
    });
  } catch (error) {
    console.error("Failed to get listing:", error);
    return c.json(
      {
        error: "Failed to fetch listing",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Search listings
listingRoutes.get("/", extractUserToken, zValidator("query", SearchParamsSchema), async (c) => {
  const params = c.req.valid("query");
  const userId = c.get("userId"); // Optional - may be undefined

  const db = new DatabaseService(c.env);
  const cache = new CacheService(c.env);
  const listingService = new ListingService(db, cache);

  try {
    const results = await listingService.searchListings(params);

    // Add bookmark status if user is authenticated
    if (userId && results.listings.length > 0) {
      const listingIds = results.listings.map((l: any) => l.id);
      const bookmarkedIds = await db.getBookmarkedListingIds(userId, listingIds);

      // Serialize and add isBookmarked field to each listing
      results.listings = results.listings.map((listing: any) => ({
        ...serializeListing(listing),
        isBookmarked: bookmarkedIds.has(listing.id),
      })) as any;
    } else {
      // Serialize and add isBookmarked: false for unauthenticated users
      results.listings = results.listings.map((listing: any) => ({
        ...serializeListing(listing),
        isBookmarked: false,
      })) as any;
    }

    return c.json(results);
  } catch (error) {
    console.error("Failed to search listings:", error);
    return c.json(
      {
        error: "Failed to search listings",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Create new listing (requires user authentication)
listingRoutes.post(
  "/",
  extractUserToken,
  requireAuth,
  zValidator("json", CreateListingSchema),
  async (c) => {
    const data = c.req.valid("json");
    const userAccessToken = c.get('userAccessToken') as string; // Ensured by requireAuth middleware

    const db = new DatabaseService(c.env);
    const backendClient = new BackendClient(c.env.MAIN_BACKEND_URL, c.env.CACHE);

    try {
      // Transform our schema to backend schema
      const backendPayload = toBackendSchema(data);

      // Forward the listing creation to the main backend with user's token
      const backendResponse: any = await backendClient.forwardUserRequest<any>(
        '/listing/create',
        {
          method: 'POST',
          body: JSON.stringify(backendPayload),
        },
        userAccessToken
      );

      // Extract the created listing from backend response
      const backendListing = backendResponse?.data || backendResponse;
      const listingId = backendListing?.id || backendListing?._id || crypto.randomUUID();

      // Transform backend response to our schema and cache locally
      const listingData: NewListing = fromBackendSchema({
        ...backendListing,
        id: listingId,
      });

      // Cache the listing locally for faster reads
      const listing = await db.createListing(listingData);

      return c.json(
        {
          id: listingId,
          status: "created",
          message: "Listing created successfully and synced to main backend",
          data: listing,
        },
        201
      );
    } catch (error) {
      console.error("Failed to create listing:", error);
      return c.json(
        {
          error: "Failed to create listing",
          message: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  }
);

// Update listing
listingRoutes.put(
  "/:id",
  zValidator("json", CreateListingSchema.partial()),
  async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const db = new DatabaseService(c.env);

    try {
      // Check if listing exists
      const existingListing = await db.getListingById(id);
      if (!existingListing) {
        return c.json({ error: "Listing not found" }, 404);
      }

      // Transform data to match database schema
      const updateData: Partial<NewListing> = {};

      if (data.title) updateData.title = data.title;
      if (data.description) updateData.description = data.description;
      if (data.cost) updateData.cost = data.cost;
      if (data.costCycle) updateData.costCycle = data.costCycle;
      if (data.type) updateData.type = data.type;
      if (data.listingCategory)
        updateData.listingCategory = data.listingCategory;
      if (data.state) updateData.state = data.state;
      if (data.lga) updateData.lga = data.lga;
      if (data.area) updateData.area = data.area;
      if (data.googleFormattedAddress)
        updateData.googleFormattedAddress = data.googleFormattedAddress;
      if (data.lat !== undefined) updateData.lat = data.lat;
      if (data.lng !== undefined) updateData.lng = data.lng;
      if (data.noOfBeds !== undefined) updateData.noOfBeds = data.noOfBeds;
      if (data.noOfBedrooms !== undefined)
        updateData.noOfBedrooms = data.noOfBedrooms;
      if (data.noOfBathrooms !== undefined)
        updateData.noOfBathrooms = data.noOfBathrooms;
      if (data.arePetsAllowed !== undefined)
        updateData.arePetsAllowed = data.arePetsAllowed;
      if (data.arePartiesAllowed !== undefined)
        updateData.arePartiesAllowed = data.arePartiesAllowed;
      if (data.extraOfferings)
        updateData.extraOfferings = JSON.stringify(data.extraOfferings);
      if (data.photos) updateData.photos = JSON.stringify(data.photos);

      // Type-specific fields
      if (data.minStayDays !== undefined)
        updateData.minStayDays = data.minStayDays;
      if (data.maxStayDays !== undefined)
        updateData.maxStayDays = data.maxStayDays;
      if (data.instantBooking !== undefined)
        updateData.instantBooking = data.instantBooking;
      if (data.leaseDurationMonths !== undefined)
        updateData.leaseDurationMonths = data.leaseDurationMonths;
      if (data.securityDeposit !== undefined)
        updateData.securityDeposit = data.securityDeposit;
      if (data.agencyFee !== undefined) updateData.agencyFee = data.agencyFee;
      if (data.legalFee !== undefined) updateData.legalFee = data.legalFee;
      if (data.cautionFee !== undefined)
        updateData.cautionFee = data.cautionFee;
      if (data.propertyTitle !== undefined)
        updateData.propertyTitle = data.propertyTitle;
      if (data.totalAreaSqm !== undefined)
        updateData.totalAreaSqm = data.totalAreaSqm;
      if (data.negotiable !== undefined)
        updateData.negotiable = data.negotiable;

      const listing = await db.updateListing(id, updateData);

      // Background sync removed (queues not available on free plan)
      // TODO: Implement webhook or scheduled sync if needed

      return c.json({
        id,
        status: "updated",
        message: "Listing updated successfully",
        data: listing,
      });
    } catch (error) {
      console.error("Failed to update listing:", error);
      return c.json(
        {
          error: "Failed to update listing",
          message: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  }
);

// Delete listing
listingRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const db = new DatabaseService(c.env);

  try {
    // Check if listing exists
    const existingListing = await db.getListingById(id);
    if (!existingListing) {
      return c.json({ error: "Listing not found" }, 404);
    }

    await db.deleteListing(id);

    // Background sync removed (queues not available on free plan)
    // TODO: Implement webhook or scheduled sync if needed

    return c.json({
      id,
      status: "deleted",
      message: "Listing deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete listing:", error);
    return c.json(
      {
        error: "Failed to delete listing",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

export default listingRoutes;
