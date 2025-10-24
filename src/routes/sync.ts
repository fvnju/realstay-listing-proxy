import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { listings, NewListing } from "../schema";
import { BackendClient } from "../services/backendClient";
import { DatabaseService } from "../services/database";
import { autoDetectTypeFromCostCycle, getSuggestedType } from "../utils/listingTypeHelper";

const syncRoutes = new Hono<{
  Bindings: CloudflareBindings & {
    BACKEND_EMAIL: string;
    BACKEND_PASSWORD: string;
  };
}>();

/**
 * Sync all listings from main backend
 * This endpoint should be protected or called via a scheduled worker
 */
syncRoutes.post("/sync-listings", async (c) => {
  const db = new DatabaseService(c.env);
  const backendClient = new BackendClient(c.env.MAIN_BACKEND_URL, c.env.CACHE);

  // Get credentials from secrets
  const email = c.env.BACKEND_EMAIL;
  const password = c.env.BACKEND_PASSWORD;

  if (!email || !password) {
    return c.json(
      {
        error: "Configuration error",
        message: "BACKEND_EMAIL and BACKEND_PASSWORD must be set",
      },
      500
    );
  }

  try {
    console.log("Starting sync from main backend...");

    // Fetch all listings from main backend
    const backendListings = await backendClient.fetchAllListings(
      email,
      password
    );

    console.log(`Fetched ${backendListings.length} listings from main backend`);

    let synced = 0;
    let failed = 0;

    // Sync each listing to local database
    for (const backendListing of backendListings) {
      try {
        // Check if listing already exists
        const existing = await db.getListingById(backendListing.id);

        // Data is already transformed by fromBackendSchema in fetchAllListings
        // Just prepare it as NewListing with proper types
        const listingData: NewListing = {
          id: backendListing.id,
          title: backendListing.title,
          description: backendListing.description,
          cost: backendListing.cost,
          costCycle: backendListing.costCycle,
          type: backendListing.type,
          listingCategory: backendListing.listingCategory,
          state: backendListing.state,
          lga: backendListing.lga,
          area: backendListing.area,
          googleFormattedAddress: backendListing.googleFormattedAddress,
          lat: backendListing.lat,
          lng: backendListing.lng,
          noOfBeds: backendListing.noOfBeds || 0,
          noOfBedrooms: backendListing.noOfBedrooms,
          noOfBathrooms: backendListing.noOfBathrooms,
          arePetsAllowed: backendListing.arePetsAllowed,
          arePartiesAllowed: backendListing.arePartiesAllowed,
          extraOfferings: backendListing.extraOfferings, // Already stringified
          photos: backendListing.photos, // Already stringified
          minStayDays: backendListing.minStayDays,
          maxStayDays: backendListing.maxStayDays,
          instantBooking: backendListing.instantBooking,
          leaseDurationMonths: backendListing.leaseDurationMonths,
          securityDeposit: backendListing.securityDeposit,
          agencyFee: backendListing.agencyFee,
          legalFee: backendListing.legalFee,
          cautionFee: backendListing.cautionFee,
          propertyTitle: backendListing.propertyTitle,
          totalAreaSqm: backendListing.totalAreaSqm,
          negotiable: backendListing.negotiable,
          ownerId: backendListing.ownerId,
          ownerFirstName: backendListing.ownerFirstName,
          ownerLastName: backendListing.ownerLastName,
          averageRating: backendListing.averageRating,
          totalReviews: backendListing.totalReviews,
          isActive: backendListing.isActive,
        };

        if (existing) {
          // Update existing listing
          await db.updateListing(backendListing.id, listingData);
        } else {
          // Create new listing
          await db.createListing(listingData);
        }

        synced++;
      } catch (error) {
        console.error(`Failed to sync listing ${backendListing.id}:`, error);
        failed++;
      }
    }

    return c.json({
      success: true,
      message: "Sync completed",
      stats: {
        total: backendListings.length,
        synced,
        failed,
      },
    });
  } catch (error) {
    console.error("Sync failed:", error);
    return c.json(
      {
        error: "Sync failed",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

/**
 * Auto-categorize listings based on cost_cycle
 * Only updates listings where type can be determined with certainty (daily/weekly/yearly)
 */
syncRoutes.post("/auto-categorize", async (c) => {
  const db = new DatabaseService(c.env);

  try {
    console.log("Starting auto-categorization...");

    // Get all listings
    const allListings = await db.getDb().select().from(listings);

    let categorized = 0;
    let ambiguous = 0;
    let skipped = 0;

    const ambiguousListings = [];

    for (const listing of allListings) {
      const detectedType = autoDetectTypeFromCostCycle(listing.costCycle);

      if (detectedType !== null) {
        // Clear case - daily/weekly → shortlet, yearly → rent
        if (listing.type !== detectedType) {
          await db.updateListing(listing.id, { type: detectedType });
          categorized++;
          console.log(`Updated listing ${listing.id}: ${listing.costCycle} → ${detectedType}`);
        } else {
          skipped++;
        }
      } else {
        // Ambiguous case (monthly or unknown)
        ambiguous++;
        const suggestion = getSuggestedType(listing.costCycle);
        
        ambiguousListings.push({
          id: listing.id,
          title: listing.title,
          costCycle: listing.costCycle,
          currentType: listing.type,
          ...suggestion
        });

        // If listing has no type or already rent, apply suggestion
        if (!listing.type || listing.type === "rent") {
          await db.updateListing(listing.id, { type: suggestion.type });
          console.log(`Applied suggested type for ${listing.id}: ${listing.costCycle} → ${suggestion.type} (${suggestion.confidence} confidence)`);
        }
      }
    }

    return c.json({
      success: true,
      message: "Auto-categorization completed",
      stats: {
        total: allListings.length,
        categorized,
        ambiguous,
        skipped,
      },
      ambiguousListings: ambiguousListings.length > 0 ? {
        count: ambiguousListings.length,
        message: "These listings have ambiguous cost_cycle (monthly) - manual review recommended",
        listings: ambiguousListings.slice(0, 10), // Show first 10
      } : undefined,
    });
  } catch (error) {
    console.error("Auto-categorization failed:", error);
    return c.json(
      {
        error: "Auto-categorization failed",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

export default syncRoutes;
