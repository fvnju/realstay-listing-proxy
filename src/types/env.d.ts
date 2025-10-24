/**
 * Extended environment bindings that include secrets
 * These are not auto-generated and should be manually maintained
 * 
 * BACKEND_EMAIL and BACKEND_PASSWORD should be set as secrets:
 * - For local dev: add to .dev.vars file
 * - For production/staging: use `wrangler secret put BACKEND_EMAIL` and `wrangler secret put BACKEND_PASSWORD`
 */
declare global {
  interface CloudflareBindings {
    BACKEND_EMAIL?: string;
    BACKEND_PASSWORD?: string;
  }
}

export {};
