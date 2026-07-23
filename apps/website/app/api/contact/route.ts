import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";
import { getTenantHost } from "@/lib/resolve-site";

/**
 * Forward a customer's contact-form submission to Django.
 *
 * Uses `apiFetch` with `allowAnonymous` so it works both ways: a signed-in sender
 * gets their bearer token attached (Django links the account and uses its
 * name/email), while a guest falls through anonymously and is scoped by
 * `X-Website-Host` - which tenant a message belongs to is not the browser's to
 * choose, so it comes from `getTenantHost()`, never the body. The header is
 * forwarded on both paths (apiFetch merges these headers into the request).
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const host = await getTenantHost();

  const res = await apiFetch("/api/contact-messages/", {
    method: "POST",
    allowAnonymous: true,
    headers: { "Content-Type": "application/json", "X-Website-Host": host },
    body,
  });

  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
