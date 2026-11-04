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
  if (configured) {
    let parsed: URL;
    try {
      parsed = new URL(configured.trim());
    } catch {
      throw new HttpError(503, "PERKPILOT_ORIGIN must be a full address like https://your-app.vercel.app (include https://)");
    }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new HttpError(503, "PERKPILOT_ORIGIN must start with https://");
    origin = parsed.origin;
  } else {
    const url = new URL(req.url);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
    const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    origin = `${proto}://${host}`;
  }
  const u = new URL(origin);
  const rpID = process.env.PERKPILOT_RP_ID?.trim() || u.hostname;
  if (u.hostname !== rpID && !u.hostname.endsWith(`.${rpID}`))
    throw new HttpError(503, `PERKPILOT_RP_ID (${rpID}) must be your site's domain (${u.hostname}) or a parent of it — or leave it unset`);
  return { rpID, origin: u.origin, rpName: "PerkPilot", secure: u.protocol === "https:" };
}
