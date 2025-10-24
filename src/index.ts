import { Hono } from "hono";
import { logger } from "hono/logger";

import listingRoutes from "./routes/listings";
import searchRoutes from "./routes/search";
import syncRoutes from "./routes/sync";
import bookmarkRoutes from "./routes/bookmarks";

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Custom error handler
app.onError((err, c) => {
  console.error("Application error:", err);
  return c.json(
    {
      error: "Internal server error",
      message: err.message,
      timestamp: new Date().toISOString(),
    },
    500
  );
});

// Middleware
// app.use('*', cors({
//   origin: ['http://localhost:3000', 'https://yourapp.com'],
//   allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowHeaders: ['Content-Type', 'Authorization'],
//   credentials: true,
// }));
app.use("*", logger());

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || "unknown",
  });
});

// API routes
app.route("/api/listings", listingRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/sync", syncRoutes);
app.route("/api/bookmarks", bookmarkRoutes);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: "Not found",
      message: `Route ${c.req.method} ${c.req.path} not found`,
      timestamp: new Date().toISOString(),
    },
    404
  );
});

export default app;
