import "server-only";
import { HttpError } from "@/lib/server/request";

/**
 * Passkey authentication is enabled with PERKPILOT_AUTH=passkey. It then
 * FAILS CLOSED: if the database or AUTH_SECRET is missing, every protected
 * route returns 503 rather than silently running without logins.
 */
export function authEnabled(): boolean {
  return process.env.PERKPILOT_AUTH === "passkey";
}

export function assertAuthConfigured(): void {
  if (!process.env.DATABASE_URL) throw new HttpError(503, "Logins are enabled but DATABASE_URL is not set");
  if ((process.env.AUTH_SECRET ?? "").length < 32) throw new HttpError(503, "Logins are enabled but AUTH_SECRET is missing or too short");
}

export type SignupMode = "invite" | "open";
export function signupMode(): SignupMode {
  return process.env.PERKPILOT_SIGNUP === "open" ? "open" : "invite";
}

export function setupCode(): string | null {
  const c = process.env.PERKPILOT_SETUP_CODE ?? "";
  return c.length >= 16 ? c : null;
}

/**
 * WebAuthn relying party. Prefer explicit PERKPILOT_ORIGIN in production —
 * passkeys are bound to the domain, so changing it later means re-registering.
 */
export function relyingParty(req: Request): { rpID: string; origin: string; rpName: string; secure: boolean } {
  const configured = process.env.PERKPILOT_ORIGIN;
  let origin: string;
  if (configured) origin = new URL(configured).origin;
  else {
    const url = new URL(req.url);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
    const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    origin = `${proto}://${host}`;
  }
  const u = new URL(origin);
  return { rpID: process.env.PERKPILOT_RP_ID ?? u.hostname, origin: u.origin, rpName: "PerkPilot", secure: u.protocol === "https:" };
}
