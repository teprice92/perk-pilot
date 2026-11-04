import "server-only";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { getDb } from "@/lib/server/db";
import { HttpError } from "@/lib/server/request";
import { relyingParty } from "./config";

/** Friendly default name for a new passkey from the browser's user agent. */
export function deviceLabel(ua: string | null): string {
  const u = ua ?? "";
  const os = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Mac OS X/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : /Linux/.test(u) ? "Linux" : "Device";
  const browser = /Edg\//.test(u) ? "Edge" : /Chrome\//.test(u) ? "Chrome" : /Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "";
  return browser ? `${os} · ${browser}` : os;
}

export async function registrationOptions(req: Request, user: { id: string; name: string; email?: string | null }, exclude: Array<{ id: string; transports: string[] }> = []) {
  const rp = relyingParty(req);
  return generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: user.email || user.name,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: exclude.map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
}

export async function verifyRegistration(req: Request, response: RegistrationResponseJSON, expectedChallenge: string) {
  const rp = relyingParty(req);
  const v = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID }).catch(() => null);
  if (!v?.verified) throw new HttpError(400, "Passkey could not be verified");
  const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
  if (await getDb()!.passkey.findUnique({ where: { id: credential.id } })) throw new HttpError(409, "This passkey is already registered");
  return {
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? response.response.transports ?? [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    name: deviceLabel(req.headers.get("user-agent")),
  };
}

export async function authenticationOptions(req: Request) {
  // Discoverable credentials: the browser offers the user's passkeys, no username needed.
  return generateAuthenticationOptions({ rpID: relyingParty(req).rpID, userVerification: "preferred" });
}

export async function verifyAuthentication(req: Request, response: AuthenticationResponseJSON, expectedChallenge: string) {
  const db = getDb()!;
  const pk = await db.passkey.findUnique({ where: { id: response.id }, include: { user: true } });
  if (!pk || pk.user.disabled) throw new HttpError(401, "This passkey isn't recognized");
  const rp = relyingParty(req);
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    credential: { id: pk.id, publicKey: new Uint8Array(pk.publicKey), counter: pk.counter, transports: pk.transports },
  }).catch(() => null);
  if (!v?.verified) throw new HttpError(401, "Passkey sign-in failed");
  await db.passkey.update({ where: { id: pk.id }, data: { counter: v.authenticationInfo.newCounter, lastUsedAt: new Date() } });
  return pk.user;
}

/** Pending account data carried by a registration challenge. */
export interface RegisterData {
  userId: string;
  name: string;
  email: string | null;
  kind: "setup" | "invite" | "open";
  inviteId?: string;
}
