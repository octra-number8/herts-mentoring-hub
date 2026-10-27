const BASE = "https://hub.invalid";

/**
 * A same-site path to send the user to after sign-in, or null. Browsers treat
 * "\" as "/" and drop tabs and newlines, so "/\evil.example" would pass a
 * simple startsWith("/") check yet leave the site. Resolve the value as a URL
 * and keep it only if it stays on this origin.
 */
export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, BASE);
    // "/..//evil.example" normalises to the path "//evil.example", which is protocol-relative.
    if (url.origin !== BASE || url.pathname.startsWith("//")) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
