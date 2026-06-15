import { readFileSync } from "fs";
import { join } from "path";
import type { Cookie } from "playwright";

const COOKIES_PATH =
  process.env["COOKIES_PATH"] ?? join(__dirname, "..", "netscape-cookies.txt");

/**
 * Parses a Netscape-format cookies file (e.g. exported by yt-dlp or browser extensions)
 * and returns a Playwright-compatible Cookie array.
 *
 * Netscape format columns (tab-separated):
 *   domain  includeSubdomains  path  secure  expires  name  value
 */
export function loadNetscapeCookies(): Cookie[] {
  let raw: string;
  try {
    raw = readFileSync(COOKIES_PATH, "utf-8");
  } catch {
    return [];
  }

  const cookies: Cookie[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const parts = trimmed.split("\t");
    if (parts.length < 7) continue;

    const [domain, , path, secure, expiresStr, name, ...valueParts] = parts;
    const value = valueParts.join("\t");
    const expires = parseInt(expiresStr ?? "0", 10);

    cookies.push({
      name: name ?? "",
      value,
      domain: domain ?? "",
      path: path ?? "/",
      // -1 tells Playwright this is a session cookie (expires when browser closes)
      expires: expires > 0 ? expires : -1,
      httpOnly: false,
      secure: secure === "TRUE",
      sameSite: "None",
    });
  }

  return cookies;
}
