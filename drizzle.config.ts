import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./migrations",

  // For local development with wrangler's local D1
  dbCredentials: {
    url: ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/79cb49e3ba7688436339b6147042e06aa8ae8258aefd96bc58cb33e8bf86b835.sqlite",
  },
});
