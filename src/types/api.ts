import { z } from "zod";

// Common listing types
export const ListingTypeSchema = z.enum(["shortlet", "rent", "sale"]);
export const ListingCategorySchema = z.enum([
  "residential",
  "commercial",
  "land",
]);
export const CostCycleSchema = z.enum(["daily", "weekly", "monthly", "yearly"]);

export type ListingType = z.infer<typeof ListingTypeSchema>;
export type ListingCategory = z.infer<typeof ListingCategorySchema>;
export type CostCycle = z.infer<typeof CostCycleSchema>;

// Search parameters schema
export const SearchParamsSchema = z.object({
  // Text search
  query: z.string().optional(),

  // Location filters
  state: z.union([z.string(), z.array(z.string())]).optional(),
  lga: z.union([z.string(), z.array(z.string())]).optional(),
  area: z.string().optional(),

  // Listing type (CRITICAL for performance)
  type: z.union([ListingTypeSchema, z.array(ListingTypeSchema)]).optional(),
  listingCategory: z
    .union([ListingCategorySchema, z.array(ListingCategorySchema)])
    .optional(),

  // Pricing filters
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  costCycle: z.union([CostCycleSchema, z.array(CostCycleSchema)]).optional(),

  // Shortlet-specific filters
  checkIn: z.coerce.date().optional(), // ISO date string → Date
  checkOut: z.coerce.date().optional(), // ISO date string → Date
  instantBooking: z.coerce.boolean().optional(),
  minStayDays: z.coerce.number().positive().optional(),
  maxStayDays: z.coerce.number().positive().optional(),

  // Rent-specific filters
  leaseDuration: z.coerce.number().positive().optional(),
  includesUtilities: z.coerce.boolean().optional(),
  maxSecurityDeposit: z.coerce.number().positive().optional(),

  // Sale-specific filters
  propertyTitle: z.union([z.string(), z.array(z.string())]).optional(),
  minAreaSqm: z.coerce.number().positive().optional(),
  maxAreaSqm: z.coerce.number().positive().optional(),
  negotiable: z.coerce.boolean().optional(),
  pricePerSqm: z.coerce.number().positive().optional(),

  // Property features
  beds: z.coerce.number().min(0).optional(),
  minBeds: z.coerce.number().min(0).optional(),
  maxBeds: z.coerce.number().min(0).optional(),
  bedrooms: z.coerce.number().min(0).optional(),
  minBedrooms: z.coerce.number().min(0).optional(),
  maxBedrooms: z.coerce.number().min(0).optional(),
  bathrooms: z.coerce.number().min(0).optional(),
  minBathrooms: z.coerce.number().min(0).optional(),
  maxBathrooms: z.coerce.number().min(0).optional(),

  // House rules
  petsAllowed: z.coerce.boolean().optional(),
  partiesAllowed: z.coerce.boolean().optional(),

  // Amenities (array field filtering)
  amenities: z.array(z.string()).optional(),
  amenitiesMatch: z.enum(["all", "any"]).optional(), // Match all or any of the amenities

  // Owner filters
  ownerId: z.string().optional(),
  ownerName: z.string().optional(),

  // Rating filters
  minRating: z.coerce.number().min(0).max(5).optional(),
  maxRating: z.coerce.number().min(0).max(5).optional(),
  minReviews: z.coerce.number().min(0).optional(),
  hasReviews: z.coerce.boolean().optional(),

  // Geo-location search
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().positive().optional(), // in kilometers
  boundingBox: z
    .object({
      northLat: z.coerce.number().min(-90).max(90),
      southLat: z.coerce.number().min(-90).max(90),
      eastLng: z.coerce.number().min(-180).max(180),
      westLng: z.coerce.number().min(-180).max(180),
    })
    .optional(),

  // Photo filters
  hasPhotos: z.coerce.boolean().optional(),
  minPhotos: z.coerce.number().min(0).optional(),

  // Status
  isActive: z.coerce.boolean().optional(),

  // Date filters
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
  updatedAfter: z.coerce.date().optional(),
  updatedBefore: z.coerce.date().optional(),

  // Sorting & Pagination
  sortBy: z
    .enum([
      "price_asc",
      "price_desc",
      "rating_asc",
      "rating_desc",
      "reviews",
      "distance",
      "recent",
      "oldest",
      "beds",
      "bedrooms",
    ])
    .optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(), // For cursor pagination
});

export type SearchParams = z.infer<typeof SearchParamsSchema>;

// Create listing schema with refined validation
export const CreateListingSchema = z
  .object({
    // Common fields
    title: z.string().min(10).max(200),
    description: z.string().min(50).max(5000),
    cost: z.number().positive(),
    costCycle: CostCycleSchema.optional(), // Optional - required only for shortlet/rent
    type: ListingTypeSchema, // Listing purpose: shortlet, rent, sale
    propertyType: z.string().min(1), // Property type: apartment, house, condo, villa, land, etc.
    listingCategory: ListingCategorySchema.optional(),

  // Location
  state: z.string().min(1),
  lga: z.string().min(1),
  area: z.string().optional(),
  googleFormattedAddress: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),

  // Property details
  noOfBeds: z.number().min(0).optional(),
  noOfBedrooms: z.number().min(0),
  noOfBathrooms: z.number().min(0),
  arePetsAllowed: z.boolean().default(false),
  arePartiesAllowed: z.boolean().default(false),
  extraOfferings: z.array(z.string()).default([]),
  photos: z.array(z.url()).min(1).max(20),

  // Type-specific fields
  // Shortlet
  minStayDays: z.number().positive().optional(),
  maxStayDays: z.number().positive().optional(),
  instantBooking: z.boolean().optional(),

  // Rent
  leaseDurationMonths: z.number().positive().optional(),
  securityDeposit: z.number().positive().optional(),
  agencyFee: z.number().positive().optional(),
  legalFee: z.number().positive().optional(),
  cautionFee: z.number().positive().optional(),

  // Sale
  propertyTitle: z.string().optional(),
  totalAreaSqm: z.number().positive().optional(),
  negotiable: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // costCycle is required for shortlet and rent
      if ((data.type === "shortlet" || data.type === "rent") && !data.costCycle) {
        return false;
      }
      return true;
    },
    {
      message: "costCycle is required for shortlet and rent listings",
      path: ["costCycle"],
    }
  );

export type CreateListingData = z.infer<typeof CreateListingSchema>;

// API response schemas
export const PaginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export const ListingResponseSchema = z.object({
  listings: z.array(z.unknown()), // Will be typed with the actual listing type
  pagination: PaginationSchema,
  filters: z.record(z.string(), z.unknown()).optional(),
});

export type ListingResponse = z.infer<typeof ListingResponseSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
