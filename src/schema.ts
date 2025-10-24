import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// Main listings table
export const listings = sqliteTable(
  "listings",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    cost: real("cost").notNull(),
    costCycle: text("cost_cycle"), // 'daily', 'weekly', 'monthly', 'yearly' - nullable for 'sale' type
    type: text("type").notNull(), // 'shortlet', 'rent', 'sale' - LISTING PURPOSE
    propertyType: text("property_type"), // 'apartment', 'house', 'condo', 'villa', 'land', etc. - PROPERTY TYPE
    listingCategory: text("listing_category"), // 'residential', 'commercial', 'land'

    // Shortlet specific fields
    minStayDays: integer("min_stay_days"),
    maxStayDays: integer("max_stay_days"),
    instantBooking: integer("instant_booking", { mode: "boolean" }).default(
      false
    ),
    availabilityCalendar: text("availability_calendar"), // JSON array

    // Rent specific fields
    leaseDurationMonths: integer("lease_duration_months"),
    securityDeposit: real("security_deposit"),
    agencyFee: real("agency_fee"),
    legalFee: real("legal_fee"),
    cautionFee: real("caution_fee"),

    // Sale specific fields
    propertyTitle: text("property_title"), // 'C of O', 'Governor Consent', 'Survey Plan', etc.
    totalAreaSqm: real("total_area_sqm"),
    pricePerSqm: real("price_per_sqm"),
    negotiable: integer("negotiable", { mode: "boolean" }).default(false),

    // Common location fields
    state: text("state").notNull(),
    lga: text("lga").notNull(),
    area: text("area"),
    googleFormattedAddress: text("google_formatted_address"),
    lat: real("lat"),
    lng: real("lng"),

    // Property details
    noOfBeds: integer("no_of_beds"),
    noOfBedrooms: integer("no_of_bedrooms"),
    noOfBathrooms: integer("no_of_bathrooms"),
    arePetsAllowed: integer("are_pets_allowed", { mode: "boolean" }).default(
      false
    ),
    arePartiesAllowed: integer("are_parties_allowed", {
      mode: "boolean",
    }).default(false),
    extraOfferings: text("extra_offerings"), // JSON array
    photos: text("photos"), // JSON array

    // Owner information
    ownerId: text("owner_id").notNull(),
    ownerFirstName: text("owner_first_name"),
    ownerLastName: text("owner_last_name"),
    ownerImageUrl: text("owner_image_url"),

    // Metrics
    averageRating: real("average_rating"),
    totalReviews: integer("total_reviews").default(0),
    totalViews: integer("total_views").default(0),
    totalBookings: integer("total_bookings").default(0), // For shortlets

    // Status
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    isFeatured: integer("is_featured", { mode: "boolean" }).default(false),
    isVerified: integer("is_verified", { mode: "boolean" }).default(false),

    // Timestamps
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date()
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
      () => new Date()
    ),
    syncedAt: integer("synced_at", { mode: "timestamp" }),
    availableFrom: integer("available_from", { mode: "timestamp" }), // When the property becomes available
  },
  (table) => [
    index("idx_type").on(table.type),
    index("idx_state").on(table.state),
    index("idx_lga").on(table.lga),
    index("idx_type_state").on(table.type, table.state),
    index("idx_type_cost").on(table.type, table.cost),
    index("idx_cost_cycle").on(table.costCycle),
    index("idx_owner").on(table.ownerId),
    index("idx_active").on(table.isActive),
    index("idx_featured").on(table.isFeatured),
    index("idx_location").on(table.lat, table.lng),
  ]
);

// Shortlet availability table
export const shortletAvailability = sqliteTable(
  "shortlet_availability",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    date: integer("date", { mode: "timestamp" }).notNull(),
    isAvailable: integer("is_available", { mode: "boolean" }).default(true),
    priceOverride: real("price_override"), // Special pricing for specific dates
    minNights: integer("min_nights"),
  },
  (table) => [
    index("idx_date").on(table.date),
    index("idx_listing").on(table.listingId),
  ]
);

// Pricing variations table for dynamic pricing
export const pricingVariations = sqliteTable(
  "pricing_variations",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // 'weekend', 'seasonal', 'holiday'
    startDate: integer("start_date", { mode: "timestamp" }),
    endDate: integer("end_date", { mode: "timestamp" }),
    priceAdjustment: real("price_adjustment"), // Percentage or fixed amount
    adjustmentType: text("adjustment_type"), // 'percentage', 'fixed'
  },
  (table) => [
    index("idx_pricing_listing").on(table.listingId),
    index("idx_pricing_dates").on(table.startDate, table.endDate),
  ]
);

// Bookmarks/saved listings table
export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    savedAt: integer("saved_at", { mode: "timestamp" }).$defaultFn(
      () => new Date()
    ),
    syncedToBackend: integer("synced_to_backend", { mode: "boolean" }).default(
      false
    ),
  },
  (table) => [
    index("idx_user").on(table.userId),
    index("idx_bookmark_listing").on(table.listingId),
    index("idx_saved_at").on(table.savedAt),
  ]
);

// User preferences table for personalization
export const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id").primaryKey(),
  preferredStates: text("preferred_states"), // JSON array
  preferredTypes: text("preferred_types"), // JSON array
  priceRangeMin: real("price_range_min"),
  priceRangeMax: real("price_range_max"),
  notificationsEnabled: integer("notifications_enabled", {
    mode: "boolean",
  }).default(true),
  lastSearchParams: text("last_search_params"), // JSON
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});

// Sync tracking table
export const syncStatus = sqliteTable("sync_status", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  syncType: text("sync_type").notNull(), // 'full' or 'incremental'
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  recordsSynced: integer("records_synced").default(0),
  status: text("status").default("in_progress"), // 'in_progress', 'completed', 'failed'
  errorMessage: text("error_message"),
  lastSyncedId: text("last_synced_id"),
});

// Pending listings queue table
export const pendingListings = sqliteTable("pending_listings", {
  id: text("id").primaryKey(),
  listingData: text("listing_data").notNull(), // JSON
  status: text("status").default("pending"), // 'pending', 'processing', 'synced', 'failed'
  retryCount: integer("retry_count").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
  processedAt: integer("processed_at", { mode: "timestamp" }),
  errorMessage: text("error_message"),
});

// Types for TypeScript
export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type ShortletAvailability = typeof shortletAvailability.$inferSelect;
export type NewShortletAvailability = typeof shortletAvailability.$inferInsert;
export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
export type SyncStatus = typeof syncStatus.$inferSelect;
export type NewSyncStatus = typeof syncStatus.$inferInsert;
export type PendingListing = typeof pendingListings.$inferSelect;
export type NewPendingListing = typeof pendingListings.$inferInsert;
