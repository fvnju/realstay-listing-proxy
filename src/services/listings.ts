import { DatabaseService } from './database';
import { CacheService } from './cache';
import { SearchParams, ListingResponse } from '../types/api';
import {
  listings,
  shortletAvailability,
} from '../schema';
import { 
  eq, 
  and, 
  or, 
  desc, 
  asc, 
  gte, 
  lte, 
  like, 
  inArray, 
  between,
  sql,
  count,
} from 'drizzle-orm';

export class ListingService {
  constructor(
    private db: DatabaseService,
    private cache: CacheService
  ) {}

  async getListingById(id: string) {
    const cacheKey = this.cache.listingKey(id);
    
    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const listing = await this.db.getListingById(id);
    
    if (listing) {
      // Cache for 1 hour
      await this.cache.set(cacheKey, listing, 3600);
    }

    return listing;
  }

  async searchListings(params: SearchParams): Promise<ListingResponse> {
    const cacheKey = this.cache.searchKey(params);
    
    // Check cache first
    const cached = await this.cache.get<ListingResponse>(cacheKey);
    if (cached) return cached;

    const { query: selectQuery, conditions } = this.buildSearchQuery(params);
    
    // Execute search with pagination
    const limit = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    const results = await this.db.getDb()
      .select()
      .from(listings)
      .where(and(...conditions))
      .orderBy(this.buildOrderByClause(params.sortBy))
      .limit(limit)
      .offset(offset);

    // Get total count
    const totalResult = await this.db.getDb()
      .select({ count: count() })
      .from(listings)
      .where(and(...conditions));

    const total = totalResult[0]?.count || 0;

    const response: ListingResponse = {
      listings: results,
      pagination: {
        page: params.page || 1,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      filters: this.extractAppliedFilters(params)
    };

    // Cache for 5 minutes
    await this.cache.set(cacheKey, response, 300);

    return response;
  }

  async searchShortlets(params: SearchParams): Promise<ListingResponse> {
    // Force type filter to shortlets
    const shortletParams: SearchParams = {
      ...params,
      type: 'shortlet' as const
    };

    const cacheKey = this.cache.searchKey({ ...shortletParams, endpoint: 'shortlets' });
    
    const cached = await this.cache.get<ListingResponse>(cacheKey);
    if (cached) return cached;

    const { query: selectQuery, conditions } = this.buildSearchQuery(shortletParams);
    
    // Add availability check if dates provided
    const finalConditions = [...conditions];
    if (params.checkIn && params.checkOut) {
      const checkInDate = new Date(params.checkIn);
      const checkOutDate = new Date(params.checkOut);
      const requiredDays = Math.floor((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));

      finalConditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${shortletAvailability} 
          WHERE ${shortletAvailability.listingId} = ${listings.id}
            AND ${shortletAvailability.date} >= ${checkInDate}
            AND ${shortletAvailability.date} < ${checkOutDate}
            AND ${shortletAvailability.isAvailable} = true
          GROUP BY ${shortletAvailability.listingId}
          HAVING COUNT(*) = ${requiredDays}
        )`
      );
    }

    const limit = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    const results = await this.db.getDb()
      .select()
      .from(listings)
      .where(and(...finalConditions))
      .orderBy(this.buildOrderByClause(params.sortBy))
      .limit(limit)
      .offset(offset);

    const totalResult = await this.db.getDb()
      .select({ count: count() })
      .from(listings)
      .where(and(...finalConditions));

    const total = totalResult[0]?.count || 0;

    const response: ListingResponse = {
      listings: results,
      pagination: {
        page: params.page || 1,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };

    await this.cache.set(cacheKey, response, 300);
    return response;
  }

  async getAvailabilityForListing(listingId: string, startDate?: Date, endDate?: Date) {
    const cacheKey = this.cache.availabilityKey(listingId);
    const availability = await this.db.getAvailabilityForListing(listingId);

    if (startDate && endDate) {
      // Filter by date range
      return availability.filter(a => {
        const date = new Date(a.date);
        return date >= startDate && date <= endDate;
      });
    }

    // Cache availability for 15 minutes
    await this.cache.set(cacheKey, availability, 900);
    return availability;
  }

  private buildSearchQuery(params: SearchParams) {
    const conditions: any[] = [];
    
    // Status filter (default to active only)
    if (params.isActive !== undefined) {
      conditions.push(eq(listings.isActive, params.isActive));
    } else {
      conditions.push(eq(listings.isActive, true));
    }
    
    // Text search using SQLite LIKE (more basic than FTS for now)
    if (params.query) {
      conditions.push(
        or(
          like(listings.title, `%${params.query}%`),
          like(listings.description, `%${params.query}%`),
          like(listings.area, `%${params.query}%`)
        )
      );
    }

    // Location filters with multi-value support
    if (params.state) {
      if (Array.isArray(params.state)) {
        conditions.push(inArray(listings.state, params.state));
      } else {
        conditions.push(eq(listings.state, params.state));
      }
    }
    
    if (params.lga) {
      if (Array.isArray(params.lga)) {
        conditions.push(inArray(listings.lga, params.lga));
      } else {
        conditions.push(eq(listings.lga, params.lga));
      }
    }
    
    if (params.area) {
      conditions.push(like(listings.area, `%${params.area}%`));
    }

    // Property type with multi-value support
    if (params.type) {
      if (Array.isArray(params.type)) {
        conditions.push(inArray(listings.type, params.type));
      } else {
        conditions.push(eq(listings.type, params.type));
      }
    }

    // Price filters
    if (params.minPrice !== undefined) {
      conditions.push(gte(listings.cost, params.minPrice));
    }
    
    if (params.maxPrice !== undefined) {
      conditions.push(lte(listings.cost, params.maxPrice));
    }
    
    if (params.costCycle) {
      if (Array.isArray(params.costCycle)) {
        conditions.push(inArray(listings.costCycle, params.costCycle));
      } else {
        conditions.push(eq(listings.costCycle, params.costCycle));
      }
    }

    // Property features with range support
    if (params.beds !== undefined) {
      conditions.push(eq(listings.noOfBeds, params.beds));
    } else {
      if (params.minBeds !== undefined) {
        conditions.push(gte(listings.noOfBeds, params.minBeds));
      }
      if (params.maxBeds !== undefined) {
        conditions.push(lte(listings.noOfBeds, params.maxBeds));
      }
    }
    
    if (params.bedrooms !== undefined) {
      conditions.push(eq(listings.noOfBedrooms, params.bedrooms));
    } else {
      if (params.minBedrooms !== undefined) {
        conditions.push(gte(listings.noOfBedrooms, params.minBedrooms));
      }
      if (params.maxBedrooms !== undefined) {
        conditions.push(lte(listings.noOfBedrooms, params.maxBedrooms));
      }
    }
    
    if (params.bathrooms !== undefined) {
      conditions.push(eq(listings.noOfBathrooms, params.bathrooms));
    } else {
      if (params.minBathrooms !== undefined) {
        conditions.push(gte(listings.noOfBathrooms, params.minBathrooms));
      }
      if (params.maxBathrooms !== undefined) {
        conditions.push(lte(listings.noOfBathrooms, params.maxBathrooms));
      }
    }

    // House rules
    if (params.petsAllowed !== undefined) {
      conditions.push(eq(listings.arePetsAllowed, params.petsAllowed));
    }
    
    if (params.partiesAllowed !== undefined) {
      conditions.push(eq(listings.arePartiesAllowed, params.partiesAllowed));
    }

    // Owner filters
    if (params.ownerId) {
      conditions.push(eq(listings.ownerId, params.ownerId));
    }
    
    if (params.ownerName) {
      conditions.push(
        or(
          like(listings.ownerFirstName, `%${params.ownerName}%`),
          like(listings.ownerLastName, `%${params.ownerName}%`)
        )
      );
    }

    // Rating filters
    if (params.minRating !== undefined) {
      conditions.push(gte(listings.averageRating, params.minRating));
    }
    
    if (params.maxRating !== undefined) {
      conditions.push(lte(listings.averageRating, params.maxRating));
    }
    
    if (params.minReviews !== undefined) {
      conditions.push(gte(listings.totalReviews, params.minReviews));
    }
    
    if (params.hasReviews === true) {
      conditions.push(gte(listings.totalReviews, 1));
    } else if (params.hasReviews === false) {
      conditions.push(eq(listings.totalReviews, 0));
    }

    // Date filters
    if (params.createdAfter) {
      conditions.push(gte(listings.createdAt, new Date(params.createdAfter)));
    }
    
    if (params.createdBefore) {
      conditions.push(lte(listings.createdAt, new Date(params.createdBefore)));
    }

    // Geo-location search
    if (params.lat && params.lng && params.radius) {
      // Haversine formula for distance calculation
      conditions.push(
        sql`(
          6371 * acos(
            cos(radians(${params.lat})) * cos(radians(${listings.lat})) * 
            cos(radians(${listings.lng}) - radians(${params.lng})) + 
            sin(radians(${params.lat})) * sin(radians(${listings.lat}))
          )
        ) <= ${params.radius}
        `
      );
    }
    
    // Bounding box search (more efficient for rectangular areas)
    if (params.boundingBox) {
      conditions.push(
        and(
          gte(listings.lat, params.boundingBox.southLat),
          lte(listings.lat, params.boundingBox.northLat),
          gte(listings.lng, params.boundingBox.westLng),
          lte(listings.lng, params.boundingBox.eastLng)
        )
      );
    }

    return { query: 'select', conditions };
  }

  private buildOrderByClause(sortBy?: string) {
    switch (sortBy) {
      case 'price_asc':
        return asc(listings.cost);
      case 'price_desc':
        return desc(listings.cost);
      case 'rating':
        return desc(listings.averageRating);
      case 'recent':
        return desc(listings.createdAt);
      case 'oldest':
        return asc(listings.createdAt);
      case 'beds':
        return desc(listings.noOfBeds);
      case 'bedrooms':
        return desc(listings.noOfBedrooms);
      default:
        return desc(listings.createdAt);
    }
  }

  private extractAppliedFilters(params: SearchParams) {
    const filters: any = {};
    
    // Only include non-undefined filters
    Object.keys(params).forEach(key => {
      const value = params[key as keyof SearchParams];
      if (value !== undefined) {
        filters[key] = value;
      }
    });
    
    return filters;
  }
}
