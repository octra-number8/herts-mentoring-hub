import { createHash, randomBytes } from "node:crypto";

/**
 * Private calendar feed tokens. The token is shown to its owner once; only the
 * sha256 hash is stored, so a database leak does not expose working feed URLs.
 */
export const hashFeedToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function newFeedToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashFeedToken(token) };
}

/** Accepts "abc" or "abc.ics" from the URL; refuses anything that is not a token. */
export function tokenFromPath(segment: string): string | null {
  const t = decodeURIComponent(segment).replace(/\.ics$/i, "");
  return /^[A-Za-z0-9_-]{20,100}$/.test(t) ? t : null;
}
