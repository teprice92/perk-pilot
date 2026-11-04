import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Token & cookie-signing primitives. Dependency-free so the proxy can use
 * them without touching the database.
 */

export const SESSION_COOKIE = "pp_session";
export const CHALLENGE_COOKIE = "pp_chal";
export const SESSION_DAYS = 30;

export function authSecret(): string {
  const s = process.env.AUTH_SECRET ?? "";
  if (s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 random characters");
  return s;
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function mac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function sign(value: string, secret = authSecret()): string {
  return `${value}.${mac(value, secret)}`;
}

/** Returns the original value if the signature is valid, otherwise null. */
export function unsign(signed: string | undefined | null, secret = authSecret()): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  if (i <= 0) return null;
  const value = signed.slice(0, i);
  const a = Buffer.from(signed.slice(i + 1));
  const b = Buffer.from(mac(value, secret));
  return a.length === b.length && timingSafeEqual(a, b) ? value : null;
}

/** Constant-time comparison of two secrets of any length. */
export function safeEqual(a: string, b: string): boolean {
  const ha = Buffer.from(sha256(a));
  const hb = Buffer.from(sha256(b));
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function cookie(name: string, value: string, opts: { maxAge: number; secure: boolean }): string {
  return [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`, ...(opts.secure ? ["Secure"] : [])].join("; ");
}
