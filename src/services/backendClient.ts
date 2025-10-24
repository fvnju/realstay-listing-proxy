import { LoginResponse, StoredAuthTokens } from '../types/auth';
import { fromBackendSchema } from '../utils/schemaTransform';
import { 
  BackendPaginatedResponse, 
  BackendListingResponse, 
  BackendPaginatedData,
  BackendSaveListingResponse,
  BackendUnsaveListingResponse
} from '../types/backend';

export class BackendClient {
  private baseUrl: string;
  private cache: KVNamespace;
  private authCacheKey = 'backend:auth:tokens';

  constructor(
    baseUrl: string,
    cache: KVNamespace
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.cache = cache;
  }

  /**
   * Authenticate with the main backend using email and password
   */
  async authenticate(email: string, password: string): Promise<StoredAuthTokens> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Authentication failed: ${error}`);
    }

    const data: LoginResponse = await response.json();

    if (!data.success || !data.data.access_token) {
      throw new Error('Authentication failed: Invalid response');
    }

    // JWT tokens typically expire in 15 minutes, store for 14 minutes
    const tokens: StoredAuthTokens = {
      accessToken: data.data.access_token,
      refreshToken: data.data.refresh_token,
      expiresAt: Date.now() + (14 * 60 * 1000), // 14 minutes
    };

    // Store tokens in KV cache
    await this.cache.put(this.authCacheKey, JSON.stringify(tokens), {
      expirationTtl: 14 * 60, // 14 minutes
    });

    return tokens;
  }

  /**
   * Get a valid access token (from cache or by re-authenticating)
   */
  async getAccessToken(email: string, password: string): Promise<string> {
    // Try to get from cache first
    const cached = await this.cache.get(this.authCacheKey);
    
    if (cached) {
      const tokens: StoredAuthTokens = JSON.parse(cached);
      
      // Check if token is still valid (with 1 minute buffer)
      if (tokens.expiresAt > Date.now() + (60 * 1000)) {
        return tokens.accessToken;
      }
    }

    // Re-authenticate if no valid token
    const tokens = await this.authenticate(email, password);
    return tokens.accessToken;
  }

  /**
   * Make an authenticated request to the main backend
   */
  async makeAuthenticatedRequest<T>(
    endpoint: string,
    options: RequestInit,
    email: string,
    password: string
  ): Promise<T> {
    const accessToken = await this.getAccessToken(email, password);

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Backend request failed: ${error}`);
    }

    return await response.json();
  }

  /**
   * Forward user request to main backend with user's token
   */
  async forwardUserRequest<T>(
    endpoint: string,
    options: RequestInit,
    userAccessToken: string
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${userAccessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Backend request failed: ${error}`);
    }

    return await response.json();
  }

  /**
   * Sync all listings from the main backend
   */
  async fetchAllListings(email: string, password: string): Promise<any[]> {
    const accessToken = await this.getAccessToken(email, password);
    
    let allListings: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `${this.baseUrl}/listing?page=${page}&page_size=100`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch listings: ${response.statusText}`);
      }

      const result: BackendPaginatedResponse<BackendListingResponse> = await response.json();
      
      if (!result.success) {
        throw new Error(`Failed to fetch listings: ${result.message || 'Unknown error'}`);
      }
      
      // Handle different response formats
      const listingsData = (result.data as BackendPaginatedData<BackendListingResponse>)?.listings || 
                           (result.data as BackendPaginatedData<BackendListingResponse>)?.data || 
                           [];
      
      if (Array.isArray(listingsData) && listingsData.length > 0) {
        // Transform backend listings to our schema
        const transformedListings = listingsData.map((listing: BackendListingResponse) => fromBackendSchema(listing));
        allListings = allListings.concat(transformedListings);
        page++;
        
        // Check if there are more pages
        const pagination = (result.data as BackendPaginatedData<BackendListingResponse>)?.pagination;
        const totalPages = pagination?.totalPages || pagination?.total_pages;
        hasMore = totalPages ? page <= totalPages : listingsData.length === 100;
      } else {
        hasMore = false;
      }
    }

    return allListings;
  }

  /**
   * Save a listing for a user (add to bookmarks)
   */
  async saveListing(listingId: string, userAccessToken: string): Promise<BackendSaveListingResponse> {
    const response = await fetch(
      `${this.baseUrl}/listing/save/${listingId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userAccessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to save listing: ${response.statusText}`);
    }

    const result: BackendSaveListingResponse = await response.json();
    
    if (!result.success) {
      throw new Error(`Failed to save listing: ${result.message || 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Unsave a listing for a user (remove from bookmarks)
   */
  async unsaveListing(listingId: string, userAccessToken: string): Promise<BackendUnsaveListingResponse> {
    const response = await fetch(
      `${this.baseUrl}/listing/unsave/${listingId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${userAccessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to unsave listing: ${response.statusText}`);
    }

    const result: BackendUnsaveListingResponse = await response.json();
    
    if (!result.success) {
      throw new Error(`Failed to unsave listing: ${result.message || 'Unknown error'}`);
    }

    return result;
  }
}
