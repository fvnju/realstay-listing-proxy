import { CreateListingData } from "../types/api";
import { toBackendSchema, fromBackendSchema } from "../utils/schemaTransform";
import { 
  BackendPaginatedResponse, 
  BackendListingResponse,
  BackendListingCreateResponse,
  BackendListingDetailResponse,
  BackendListingDeleteResponse,
  BackendPaginatedData,
  BackendSavedListingsResponse
} from "../types/backend";

export class BackendAPIClient {
  constructor(private baseUrl: string, private apiKey: string) {}

  async fetchListings(page = 1, page_size = 100, lastSyncDate?: Date) {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: page_size.toString(),
      ...(lastSyncDate && { updated_after: lastSyncDate.toISOString() }),
    });

    const response = await fetch(`${this.baseUrl}/listing?${params}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }

    const result: BackendPaginatedResponse<BackendListingResponse> = await response.json();
    
    if (!result.success) {
      throw new Error(`Backend API error: ${result.message || 'Unknown error'}`);
    }
    
    // Extract listings from data
    const listings = (result.data as BackendPaginatedData<BackendListingResponse>)?.listings || 
                     (result.data as BackendPaginatedData<BackendListingResponse>)?.data || 
                     [];
    
    // Transform backend response to our schema
    const transformedListings = listings.map((listing: BackendListingResponse) => fromBackendSchema(listing));
    
    return {
      success: result.success,
      message: result.message,
      data: {
        listings: transformedListings,
        pagination: (result.data as BackendPaginatedData<BackendListingResponse>)?.pagination
      }
    };
  }

  async createListing(listingData: CreateListingData) {
    const backendData = toBackendSchema(listingData);
    
    const response = await fetch(`${this.baseUrl}/listing/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(backendData),
    });

    if (!response.ok) {
      throw new Error(`Failed to create listing: ${response.status}`);
    }

    const result: BackendListingCreateResponse = await response.json();
    
    if (!result.success) {
      throw new Error(`Failed to create listing: ${result.message || 'Unknown error'}`);
    }
    
    return result.data ? fromBackendSchema(result.data as BackendListingResponse) : null;
  }

  async fetchListingDetails(listingId: string) {
    const response = await fetch(`${this.baseUrl}/listing/${listingId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch listing: ${response.status}`);
    }

    const result: BackendListingDetailResponse = await response.json();
    
    if (!result.success) {
      throw new Error(`Failed to fetch listing: ${result.message || 'Unknown error'}`);
    }
    
    return result.data ? fromBackendSchema(result.data as BackendListingResponse) : null;
  }

  async updateListing(listingId: string, data: Partial<CreateListingData>) {
    const backendData = toBackendSchema(data as CreateListingData);
    
    const response = await fetch(`${this.baseUrl}/listing/${listingId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(backendData),
    });

    if (!response.ok) {
      throw new Error(`Failed to update listing: ${response.status}`);
    }

    const result: BackendListingDetailResponse = await response.json();
    
    if (!result.success) {
      throw new Error(`Failed to update listing: ${result.message || 'Unknown error'}`);
    }
    
    return result.data ? fromBackendSchema(result.data as BackendListingResponse) : null;
  }

  async deleteListing(listingId: string) {
    const response = await fetch(`${this.baseUrl}/listing/${listingId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete listing: ${response.status}`);
    }

    const result: BackendListingDeleteResponse = await response.json();
    
    if (!result.success) {
      throw new Error(`Failed to delete listing: ${result.message || 'Unknown error'}`);
    }
    
    return result;
  }

  async fetchSavedListings(page = 1, page_size = 100) {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: page_size.toString(),
    });

    const response = await fetch(`${this.baseUrl}/listing/saved_listings?${params}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch saved listings: ${response.status}`);
    }

    // Note: Saved listings endpoint returns data directly, NOT wrapped in DefaultAPIType
    const result: BackendSavedListingsResponse = await response.json();
    
    // Transform backend response to our schema
    const transformedListings = result.listings.map((listing: BackendListingResponse) => fromBackendSchema(listing));
    
    return {
      listings: transformedListings,
      pagination: {
        page: result.pagination.current_page,
        limit: result.pagination.limit,
        total: result.pagination.total_items,
        totalPages: result.pagination.total_pages,
      }
    };
  }
}
