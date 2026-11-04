import "server-only";

/** JSON response with any number of Set-Cookie headers. */
export function withCookies(body: unknown, cookies: string[], status = 200): Response {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
}
