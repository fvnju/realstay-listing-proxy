import { Context, Next } from "hono";

/**
 * Decode JWT payload without verification
 * Note: This doesn't verify the signature. The backend will verify when forwarding requests.
 */
function decodeJWT(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    // Decode the payload (second part)
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch (error) {
    console.error("Failed to decode JWT:", error);
    return null;
  }
}

/**
 * Middleware to extract and validate user bearer token from Authorization header
 */
export async function extractUserToken(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    c.set("userAccessToken", token);

    // Try to extract userId from token (prioritize 'id' field)
    const payload = decodeJWT(token);
    if (payload && payload.id) {
      c.set("userId", payload.id);
    }
  }

  // Fallback: check userId query parameter
  const userIdParam = c.req.query("userId");
  if (userIdParam && !c.get("userId")) {
    c.set("userId", userIdParam);
  }

  await next();
}

/**
 * Middleware to require user authentication
 */
export async function requireAuth(c: Context, next: Next) {
  // First extract the token
  await extractUserToken(c, async () => {});

  const token = c.get("userAccessToken");

  if (!token) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Bearer token required in Authorization header",
      },
      401
    );
  }

  await next();
}
