# Listing Microservice Setup Guide

Complete setup and configuration guide for the Cloudflare Workers-based listing microservice with caching, search optimization, and backend synchronization.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Installation](#installation)
- [Configuration](#configuration)
- [Backend Integration](#backend-integration)
- [API Endpoints](#api-endpoints)
- [Database Setup](#database-setup)
- [Deployment](#deployment)
- [Development Workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)
- [Security](#security)

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your credentials

# Run database migrations
pnpm db:migrate

# Generate TypeScript types
pnpm cf-typegen

# Start local development server
pnpm dev
```

The API will be available at `http://localhost:8787`

---

## Architecture Overview

This microservice acts as an intelligent caching and optimization layer between mobile clients and the main backend API.

### Key Features

- **Data Caching**: Stores listings in Cloudflare D1 (SQLite) for fast reads
- **Search Optimization**: Implements efficient search with indexes and filters
- **Backend Synchronization**: Automatic data sync with main backend
- **Schema Transformation**: Converts between camelCase (TS) and snake_case (backend)
- **User Bookmarks**: Local bookmark storage with backend sync
- **Token Management**: JWT token caching and forwarding

### Technology Stack

- **Runtime**: Cloudflare Workers (V8 Isolates)
- **Framework**: Hono (lightweight web framework)
- **Database**: Cloudflare D1 (SQLite-based)
- **Cache**: Cloudflare KV (key-value storage)
- **Queue**: Cloudflare Queues (for async operations)
- **ORM**: Drizzle ORM
- **Validation**: Zod

### Architecture Diagram

```
┌─────────────┐
│ Mobile App  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│   Cloudflare Workers (Hono)             │
│   ┌─────────────────────────────────┐   │
│   │  Routes                         │   │
│   │  /api/listings                  │   │
│   │  /api/search                    │   │
│   │  /api/bookmarks                 │   │
│   │  /api/sync                      │   │
│   └─────────────────────────────────┘   │
│   ┌─────────────────────────────────┐   │
│   │  Services                       │   │
│   │  - Backend Client               │   │
│   │  - Database Service             │   │
│   │  - Cache Service                │   │
│   │  - Listing Service              │   │
│   └─────────────────────────────────┘   │
│   ┌─────────────────────────────────┐   │
│   │  Storage                        │   │
│   │  - D1 Database (listings)       │   │
│   │  - KV Cache (tokens, search)    │   │
│   │  - Queue (sync jobs)            │   │
│   └─────────────────────────────────┘   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   Main Backend API                      │
│   /auth/login                           │
│   /listing                              │
│   /listing/create                       │
│   /listing/save/:id                     │
│   /listing/unsave/:id                   │
│   /listing/saved_listings               │
└─────────────────────────────────────────┘
```

---

## Installation

### Prerequisites

- Node.js 18+ and pnpm
- Cloudflare Workers account
- Wrangler CLI (`pnpx wrangler`)

### Install Dependencies

```bash
pnpm install
```

### Installed Packages

```json
{
  "dependencies": {
    "@hono/zod-validator": "^0.7.4",
    "dayjs": "^1.11.18",
    "drizzle-orm": "^0.44.6",
    "hono": "^4.10.2",
    "zod": "^4.1.12"
  },
  "devDependencies": {
    "@types/node": "^24.9.1",
    "drizzle-kit": "^0.31.5",
    "wrangler": "^4.4.0"
  }
}
```

---

## Configuration

### Environment Variables

Configure in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "ENVIRONMENT": "development",
    "MAIN_BACKEND_URL": "https://real-stay-api.onrender.com"
  }
}
```

#### For Local Development

Create `.dev.vars` file (gitignored):

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:

```ini
BACKEND_EMAIL=your-backend-email@example.com
BACKEND_PASSWORD=your-secure-password
```

#### For Production/Staging

Set secrets using Wrangler CLI:

```bash
# Production
wrangler secret put BACKEND_EMAIL --env production
wrangler secret put BACKEND_PASSWORD --env production

# Staging
wrangler secret put BACKEND_EMAIL --env staging
wrangler secret put BACKEND_PASSWORD --env staging
```

**Required Secrets:**

| Secret             | Description                      | Used For                                      |
| ------------------ | -------------------------------- | --------------------------------------------- |
| `BACKEND_EMAIL`    | Backend service account email    | Authenticating microservice with main backend |
| `BACKEND_PASSWORD` | Backend service account password | Authenticating microservice with main backend |

---

## Backend Integration

### API Conventions

The main backend uses **snake_case** for field names, while the microservice uses **camelCase** internally. All transformations are handled automatically.

### Response Format

All backend responses follow this structure:

```typescript
{
  "success": boolean,
  "message"?: string,
  "data": T | null
}
```

**Exception**: `/listing/saved_listings` returns data directly without the wrapper.

### Supported Endpoints

#### Authentication

- **POST** `/auth/login`
  - Request: `{ email: string, password: string }`
  - Response: `{ success: true, data: { access_token, refresh_token } }`

#### Listings

- **GET** `/listing?page={page}&page_size={size}`

  - Query params: `page` (int), `page_size` (int)
  - Response: Paginated listings

- **POST** `/listing/create`

  - Headers: `Authorization: Bearer {token}`
  - Body: Listing data (snake_case)
  - Response: Created listing

- **GET** `/listing/{id}`

  - Response: Single listing

- **PUT** `/listing/{id}`

  - Headers: `Authorization: Bearer {token}`
  - Body: Updated listing data
  - Response: Updated listing

- **DELETE** `/listing/{id}`
  - Headers: `Authorization: Bearer {token}`
  - Response: Deletion confirmation

#### Bookmarks

- **POST** `/listing/save/{id}`

  - Headers: `Authorization: Bearer {token}`
  - Response: User's saved listings document

- **PATCH** `/listing/unsave/{id}`

  - Headers: `Authorization: Bearer {token}`
  - Response: Updated saved listings document

- **GET** `/listing/saved_listings?page={page}&page_size={size}`
  - Headers: `Authorization: Bearer {token}`
  - Response: `{ listings: [], pagination: {} }` (no wrapper)

### Authentication Flow

```
┌─────────────┐
│  Mobile App │
└──────┬──────┘
       │ 1. User login
       ▼
┌─────────────────┐
│  Main Backend   │
│  /auth/login    │
└──────┬──────────┘
       │ 2. Return JWT
       ▼
┌─────────────┐
│  Mobile App │
└──────┬──────┘
       │ 3. Request with JWT
       ▼
┌───────────────────────────┐
│  Microservice             │
│  - Decode JWT for userId  │
│  - Forward to backend     │
└───────────────────────────┘
```

### Token Caching

- Microservice tokens cached for **14 minutes** (JWT typically expires in 15 minutes)
- User tokens are **forwarded**, not cached
- Automatic token refresh on expiration

---

## API Endpoints

### Health Check

```bash
GET /health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2025-03-24T10:30:00.000Z",
  "environment": "production"
}
```

### Listings

#### Get All Listings (with filters)

```bash
GET /api/listings?page=1&limit=20&state=Lagos&type=rent
```

Query Parameters:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `state`: Filter by state
- `lga`: Filter by LGA
- `type`: Filter by type (`shortlet`, `rent`, `sale`)
- `minPrice`, `maxPrice`: Price range
- `beds`, `bedrooms`, `bathrooms`: Property features
- See `SearchParamsSchema` in `src/types/api.ts` for all filters

#### Get Single Listing

```bash
GET /api/listings/{id}
```

#### Create Listing

```bash
POST /api/listings/create
Authorization: Bearer {user_jwt_token}
Content-Type: application/json

{
  "title": "Spacious 2-Bedroom Apartment",
  "description": "Beautiful apartment...",
  "cost": 500000,
  "costCycle": "monthly",
  "type": "rent",
  "state": "Lagos",
  "lga": "Ikeja",
  "noOfBedrooms": 2,
  "noOfBathrooms": 1,
  "photos": ["url1", "url2"]
}
```

### Search

#### Search Listings

```bash
GET /api/search?query=ikeja&state=Lagos&minPrice=100000
```

#### Search Shortlets

```bash
GET /api/search/shortlets?checkIn=2025-06-01&checkOut=2025-06-05
```

#### Get Search Suggestions

```bash
GET /api/search/suggestions?q=ike
```

Response:

```json
{
  "suggestions": [
    {
      "type": "area",
      "value": "Ikeja, Lagos",
      "display": "Ikeja, Ikeja, Lagos"
    }
  ]
}
```

#### Get Search Facets

```bash
GET /api/search/facets?state=Lagos&type=rent
```

Response:

```json
{
  "states": [{ "value": "Lagos", "count": 150, "label": "Lagos" }],
  "lgas": [{ "value": "Ikeja", "count": 50, "label": "Ikeja" }],
  "areas": [...],
  "priceRanges": { "min": 50000, "max": 5000000, "avg": 250000 },
  "typeCounts": [{ "value": "rent", "count": 100, "label": "rent" }]
}
```

### Bookmarks

#### Get User's Bookmarks

```bash
GET /api/bookmarks?page=1&limit=20
Authorization: Bearer {user_jwt_token}
```

Or with `userId` query param:

```bash
GET /api/bookmarks?userId={user_id}&page=1&limit=20
Authorization: Bearer {user_jwt_token}
```

#### Add Bookmark

```bash
POST /api/bookmarks
Authorization: Bearer {user_jwt_token}
Content-Type: application/json

{
  "listingId": "67e13fe619ffe98a950ba314"
}
```

Response:

```json
{
  "success": true,
  "message": "Bookmark added and synced",
  "bookmark": { "id": 1, "userId": "...", "listingId": "..." }
}
```

#### Remove Bookmark

```bash
DELETE /api/bookmarks/{listingId}
Authorization: Bearer {user_jwt_token}
```

#### Check if Bookmarked

```bash
GET /api/bookmarks/check/{listingId}
Authorization: Bearer {user_jwt_token}
```

Response:

```json
{
  "isBookmarked": true
}
```

#### Sync Bookmarks from Backend

```bash
POST /api/bookmarks/sync
Authorization: Bearer {user_jwt_token}
```

### Sync

#### Sync All Listings from Backend

```bash
POST /api/sync/sync-listings
```

Response:

```json
{
  "success": true,
  "message": "Sync completed",
  "stats": {
    "total": 150,
    "synced": 148,
    "failed": 2
  }
}
```

**Note**: This endpoint requires `BACKEND_EMAIL` and `BACKEND_PASSWORD` to be set.

---

## Database Setup

### Create Database

```bash
# Development
wrangler d1 create listings_db

# Production
wrangler d1 create listings_db_production

# Staging
wrangler d1 create listings_db_staging
```

Update `wrangler.jsonc` with the database IDs returned.

### Run Migrations

```bash
# Development
pnpm db:migrate

# Staging
pnpm db:migrate:staging

# Production
pnpm db:migrate:production
```

### Database Schema

The database includes these tables:

- **listings**: Main listing data with full-text search indexes
- **bookmarks**: User saved listings
- **shortlet_availability**: Calendar availability for shortlets
- **pricing_variations**: Dynamic pricing rules
- **user_preferences**: User search preferences
- **sync_status**: Sync operation tracking
- **pending_listings**: Queue for failed sync operations

See `src/schema.ts` for complete schema definition.

### Generate New Migrations

```bash
# Make changes to schema in src/schema.ts
pnpm db:generate
```

---

## Deployment

### Deploy to Cloudflare

```bash
# Deploy to production
pnpm deploy

# Deploy to staging
pnpm deploy:staging
```

### Post-Deployment Checklist

1. **Set Secrets**

   ```bash
   wrangler secret put BACKEND_EMAIL --env production
   wrangler secret put BACKEND_PASSWORD --env production
   ```

2. **Run Migrations**

   ```bash
   pnpm db:migrate:production
   ```

3. **Initial Data Sync**

   ```bash
   curl -X POST https://your-worker.workers.dev/api/sync/sync-listings
   ```

4. **Verify Health**

   ```bash
   curl https://your-worker.workers.dev/health
   ```

5. **Test API**
   ```bash
   curl "https://your-worker.workers.dev/api/listings?limit=5"
   ```

---

## Development Workflow

### Generate TypeScript Types

```bash
pnpm cf-typegen
```

This generates `worker-configuration.d.ts` with Cloudflare binding types.

### Development Server

```bash
pnpm dev
```

Access at `http://localhost:8787`

### Database Studio

```bash
pnpm db:studio
```

Opens Drizzle Studio for database inspection.

### View Logs

```bash
# Tail live logs
wrangler tail

# Tail logs for specific environment
wrangler tail --env production
```

---

## Troubleshooting

### Common Errors

#### "BACKEND_EMAIL and BACKEND_PASSWORD must be set"

**Cause**: Secrets not configured

**Solution**:

```bash
# For local dev
echo "BACKEND_EMAIL=your-email@example.com" >> .dev.vars
echo "BACKEND_PASSWORD=your-password" >> .dev.vars

# For production
wrangler secret put BACKEND_EMAIL --env production
wrangler secret put BACKEND_PASSWORD --env production
```

#### "Authentication failed: Invalid response"

**Cause**: Invalid backend credentials or backend API down

**Solution**:

1. Verify credentials are correct
2. Check backend API status
3. Verify `MAIN_BACKEND_URL` in `wrangler.jsonc`
4. Test backend login manually:
   ```bash
   curl -X POST https://api.example.com/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password"}'
   ```

#### "Failed to fetch listings: 401 Unauthorized"

**Cause**: Token expired or invalid

**Solution**: Token cache will auto-refresh. If persists, check backend authentication.

#### Database errors

**Cause**: Migrations not run or schema mismatch

**Solution**:

```bash
# Check migration status
wrangler d1 info listings_db

# Run migrations
pnpm db:migrate
```

### Debug Mode

Enable verbose logging in development:

```typescript
// src/index.ts
app.use("*", logger()); // Already enabled
```

---

## Security

### Best Practices

1. **Never Commit Secrets**

   - Add `.dev.vars` to `.gitignore` (already done)
   - Use `wrangler secret` for production

2. **Rotate Secrets Regularly**

   - Change backend credentials periodically
   - Update secrets in all environments

3. **JWT Token Security**

   - Tokens are decoded but not verified (backend verifies)
   - User ID extracted from `payload.id` field
   - Fallback to `userId` query parameter

4. **Protect Admin Endpoints**

   - Add authentication to `/api/sync/*` endpoints in production
   - Use Cloudflare Access or API key middleware

5. **Rate Limiting**

   - Implement rate limiting for public endpoints
   - Use Cloudflare's built-in rate limiting

6. **CORS Configuration**
   - Configure CORS in `src/index.ts`
   - Restrict origins in production

### Security Checklist

- [ ] Secrets set via `wrangler secret` (not in code)
- [ ] Different credentials for each environment
- [ ] Sync endpoints protected
- [ ] CORS configured for production domains
- [ ] Rate limiting enabled
- [ ] JWT tokens validated before forwarding
- [ ] Database access restricted
- [ ] Logs don't contain sensitive data

---

## Additional Resources

### Documentation

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare KV](https://developers.cloudflare.com/kv/)
- [Hono Framework](https://hono.dev/)
- [Drizzle ORM](https://orm.drizzle.team/)

### Project Files

- `AGENTS.md` - Coding guidelines for AI agents
- `IMPLEMENTATION_SUMMARY.md` - Implementation details and decisions
- `architecture-plan.md` - Detailed architecture documentation

---

## Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
3. Check project documentation in repository
