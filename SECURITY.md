# Security

## Reporting

Please report vulnerabilities privately to the repository owner rather than opening a public issue.

## Threat model and controls

PerkPilot stores household rewards data on the user's device (IndexedDB). The server is mostly stateless: it calls third-party APIs with server-side keys and runs the deterministic optimizer.

| Risk | Control |
|---|---|
| Leaked API keys | Keys are read only on the server (`process.env`, never `NEXT_PUBLIC_*`). Builds are checked so no provider code or env names ship in client bundles. `.env*` files are git-ignored. |
| Paying for someone else's AI usage | Per-IP rate limits on every API route, plus a per-instance daily ceiling on LLM-backed concierge calls (`CONCIERGE_DAILY_LIMIT`). Beyond it, the concierge answers deterministically at no cost. Tool results sent to the model are size-capped. |
| Rate-limit evasion with spoofed headers | The client IP is read `TRUSTED_PROXY_HOPS` entries from the right of `X-Forwarded-For`, so values a client pre-fills are ignored. Set this to match your proxy chain. |
| Cross-site use of the API | `POST`/`PUT` routes reject browser requests whose `Origin` or `Sec-Fetch-Site` isn't same-origin (extra origins: `ALLOWED_ORIGINS`). |
| Oversized or expensive requests | Bodies are capped while streaming (256 KB for optimize and concierge, 8 MB for sync, 16 KB for admin), including chunked uploads. Schemas bound every array, string and map; parties are capped at 9 travelers. The optimizer narrows its search on very large trips and skips flexible-date re-runs when a request is already slow. |
| Injection / XSS | React escaping everywhere. The only raw HTML is a static theme script. The concierge's Markdown renderer builds React nodes (no HTML). Every external link goes through `safeHref()` (http/https only), including URLs from providers, backups and synced data. A Content-Security-Policy limits scripts and connections to this origin. |
| Malicious backup or sync files | Imports and sync pulls are validated with Zod (`DataImportSchema`) and normalized before they reach app state. The server validates sync snapshots with the same schema. |
| Unauthorized admin or sync access | Bearer tokens (at least 32 characters) compared in constant time, rate limited, and active only when configured. Database errors are not echoed to clients. |
| Prompt injection via provider content | The concierge's tools are read-only calculations and lookups. The model cannot transfer points, book, or send data anywhere, and the system prompt forbids inventing prices or benefits. |
| Unauthorized use of the app | Opt-in passkey accounts (`PERKPILOT_AUTH=passkey`), invite-only by default. Sessions are random tokens in signed HttpOnly cookies; only their hashes are stored. Every API route validates the session against the database; the page proxy only checks the signature. Misconfiguration fails closed. |
| Paying for other people's AI | The owner enables AI per user. Enabled users have a daily allowance and an instance-wide ceiling on top. Everyone else gets the free deterministic planner. |
| Account takeover | No passwords to phish or stuff. Passkeys are origin-bound and stored as public keys. Single-use, 5-minute challenges. The setup code works only while no owner exists. Invite codes are single use, expiring and stored hashed. Auth endpoints are rate limited. |
| Credential collection | PerkPilot never asks for card numbers or passwords, and stores only the last 4 characters of loyalty member numbers. |
| Clickjacking / transport | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS in production, `nosniff`, a strict referrer policy and COOP. |

## Known limitations

- Rate limits and the daily LLM ceiling are **per instance** and in memory. On multi-instance or serverless deployments, use a shared store (Redis or Upstash) and set a spend limit in the Anthropic Console as a hard backstop.
- `script-src` allows `'unsafe-inline'` because of Next.js's inline bootstrap. Moving to nonce-based CSP requires dynamic rendering through `proxy.ts`.
- Without logins (`PERKPILOT_AUTH` unset), anyone with the URL can use the app. For legacy token sync, the token is kept in localStorage. Turn on passkey accounts for any deployment reachable from the internet.
- Household data is synced as one snapshot per household, last-writer-wins with conflict merging. Simultaneous edits to the same field on two devices keep the later save.
- Owner recovery after losing every passkey requires database access (see docs/DEPLOYMENT.md).
