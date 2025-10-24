/**
 * Type definitions for the main backend API response format
 * Uses snake_case to match the backend's response structure
 */

export type DefaultAPIType = {
  data: Record<string, any> | string | Record<string, any>[] | string[] | null;
  success: boolean;
  message?: string;
};

export interface APITypeExtension<T> extends DefaultAPIType {
  data: T extends
    | Record<string, any>
    | string
    | Record<string, any>[]
    | string[]
    | null
    ? T
    : null;
}

export interface BackendListingResponse {
  place_holder_address: string;
  google_formatted_address?: string;
  state: string;
  lga: string;
  lat?: number;
  lng?: number;
  type: string; // e.g., "apartment", "house", "land", "commercial"
  no_of_beds?: number;
  are_pets_allowed: boolean;
  no_of_bedrooms: number;
  no_of_bathrooms: number;
  are_parties_allowed: boolean;
  extra_offerings: string[];
  title: string;
  description: string;
  cost: number;
  cost_cycle: "daily" | "weekly" | "monthly" | "yearly";
  photos: string[];
  
  // Optional fields that might be in response
  id?: string;
  _id?: string;
  owner_id?: string;
  ownerId?: string;
  owner_first_name?: string;
  ownerFirstName?: string;
  owner_last_name?: string;
  ownerLastName?: string;
  average_rating?: number;
  averageRating?: number;
  total_reviews?: number;
  totalReviews?: number;
  is_active?: boolean;
  
  // Shortlet-specific
  min_stay_days?: number;
  max_stay_days?: number;
  instant_booking?: boolean;
  
  // Rent-specific
  lease_duration_months?: number;
  security_deposit?: number;
  agency_fee?: number;
  legal_fee?: number;
  caution_fee?: number;
  
  // Sale-specific
  property_title?: string;
  total_area_sqm?: number;
  negotiable?: boolean;
}

export interface BackendPaginatedData<T> {
  listings?: T[];
  data?: T[];
  pagination?: {
    page: number;
    page_size?: number;
    limit?: number;
    total: number;
    totalPages?: number;
    total_pages?: number;
  };
}

export type BackendPaginatedResponse<T> = APITypeExtension<BackendPaginatedData<T>>;

export type BackendListingCreateResponse = APITypeExtension<BackendListingResponse>;

export type BackendListingDetailResponse = APITypeExtension<BackendListingResponse>;

export type BackendListingDeleteResponse = APITypeExtension<{ deleted: boolean } | string>;

// Saved listings response (NOT wrapped in DefaultAPIType)
export interface BackendSavedListingsPagination {
  total_items: number;
  total_pages: number;
  current_page: number;
  limit: number;
}

export interface BackendSavedListingsResponse {
  listings: BackendListingResponse[];
  pagination: BackendSavedListingsPagination;
}

// User saved listings document (returned from save/unsave operations)
export interface BackendUserSavedListings {
  _id: string;
  user_id: string;
  saved_listings: string[];
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export type BackendSaveListingResponse = APITypeExtension<BackendUserSavedListings>;
export type BackendUnsaveListingResponse = APITypeExtension<BackendUserSavedListings>;
