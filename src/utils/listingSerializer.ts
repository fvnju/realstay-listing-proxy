/**
 * Serialization utilities for listing data
 * Converts JSON strings to objects/arrays for API responses
 */

import type { Listing } from '../schema';

/**
 * Fields that are stored as JSON strings in the database
 */
const JSON_FIELDS = [
  'extraOfferings',
  'photos',
  'availabilityCalendar',
] as const;

/**
 * Parse a JSON field, return default if parsing fails
 */
function parseJsonField(value: any, defaultValue: any = null): any {
  if (!value) return defaultValue;
  if (typeof value !== 'string') return value; // Already parsed
  
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error('Failed to parse JSON field:', error);
    return defaultValue;
  }
}

/**
 * Serialize a listing for API response
 * Converts JSON string fields to actual objects/arrays
 */
export function serializeListing(listing: any): any {
  if (!listing) return null;

  return {
    ...listing,
    // Parse JSON string fields
    extraOfferings: parseJsonField(listing.extraOfferings, []),
    photos: parseJsonField(listing.photos, []),
    availabilityCalendar: parseJsonField(listing.availabilityCalendar, []),
    
    // Ensure boolean fields are actual booleans (SQLite stores as 0/1)
    arePetsAllowed: Boolean(listing.arePetsAllowed),
    arePartiesAllowed: Boolean(listing.arePartiesAllowed),
    instantBooking: Boolean(listing.instantBooking),
    negotiable: Boolean(listing.negotiable),
    isActive: Boolean(listing.isActive),
    isFeatured: Boolean(listing.isFeatured),
    isVerified: Boolean(listing.isVerified),
    
    // Convert timestamps to ISO strings for easier frontend handling
    // Note: Drizzle with mode: "timestamp" returns Date objects or millisecond timestamps
    createdAt: listing.createdAt ? (listing.createdAt instanceof Date ? listing.createdAt : new Date(listing.createdAt)).toISOString() : null,
    updatedAt: listing.updatedAt ? (listing.updatedAt instanceof Date ? listing.updatedAt : new Date(listing.updatedAt)).toISOString() : null,
    syncedAt: listing.syncedAt ? (listing.syncedAt instanceof Date ? listing.syncedAt : new Date(listing.syncedAt)).toISOString() : null,
    availableFrom: listing.availableFrom ? (listing.availableFrom instanceof Date ? listing.availableFrom : new Date(listing.availableFrom)).toISOString() : null,
  };
}

/**
 * Serialize multiple listings
 */
export function serializeListings(listings: any[]): any[] {
  return listings.map(serializeListing);
}

/**
 * Prepare listing data for database insertion
 * Converts objects/arrays to JSON strings
 */
export function deserializeListing(data: any): any {
  return {
    ...data,
    // Stringify array/object fields for database storage
    extraOfferings: Array.isArray(data.extraOfferings) 
      ? JSON.stringify(data.extraOfferings)
      : data.extraOfferings,
    photos: Array.isArray(data.photos)
      ? JSON.stringify(data.photos)
      : data.photos,
    availabilityCalendar: data.availabilityCalendar
      ? JSON.stringify(data.availabilityCalendar)
      : data.availabilityCalendar,
      
    // Convert booleans to integers for SQLite
    arePetsAllowed: data.arePetsAllowed ? 1 : 0,
    arePartiesAllowed: data.arePartiesAllowed ? 1 : 0,
    instantBooking: data.instantBooking ? 1 : 0,
    negotiable: data.negotiable ? 1 : 0,
    isActive: data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1,
    isFeatured: data.isFeatured ? 1 : 0,
    isVerified: data.isVerified ? 1 : 0,
    
    // Convert Date objects to Unix timestamps
    createdAt: data.createdAt instanceof Date 
      ? Math.floor(data.createdAt.getTime() / 1000)
      : data.createdAt || Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  };
}
