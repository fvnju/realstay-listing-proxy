import { z } from "zod";

// Login request schema
export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

// Login response schema
export const LoginResponseSchema = z.object({
  data: z.object({
    user: z.object({
      id: z.string(),
      email: z.email(),
    }),
    access_token: z.string(),
    refresh_token: z.string(),
  }),
  success: z.boolean(),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// Auth tokens stored in KV
export interface StoredAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
