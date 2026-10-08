// Helper for calling the Next.js web app's API routes (/api/cart/checkout,
// /api/delivery/*) from the mobile app, exactly like the web client does:
// Authorization: Bearer <supabase access token>, JSON body/response.
// Base URL comes from EXPO_PUBLIC_API_BASE_URL (mobile/.env.example).
import { supabase } from "./supabase";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error(
    "Missing EXPO_PUBLIC_API_BASE_URL. Copy mobile/.env.example to mobile/.env and fill in values."
  );
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Review photo URLs come back as app-relative paths (/api/reviews/<id>/photo); an <Image> needs the full address.
export function absoluteUrl(path: string): string {
  return path.startsWith("/") ? `${API_BASE_URL}${path}` : path;
}

// Returns null (never throws) when there is no active session — callers
// decide how to handle "not logged in" for their own screen.
async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiFetch<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {}
): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new ApiError("Not authenticated", 401);
  }
  // A FormData body goes as is: React Native sets the multipart boundary itself.
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: isForm
      ? { Authorization: `Bearer ${token}` }
      : { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON response body — fall through to status handling below.
  }
  if (!res.ok) {
    const message =
      json && typeof json === "object" && "error" in json && typeof (json as { error?: unknown }).error === "string"
        ? (json as { error: string }).error
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return json as T;
}

// For public endpoints that need no session (e.g. /api/auth/signup).
export async function apiPostPublic<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON response body — fall through to status handling below.
  }
  if (!res.ok) {
    const message =
      json && typeof json === "object" && "error" in json && typeof (json as { error?: unknown }).error === "string"
        ? (json as { error: string }).error
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return json as T;
}
