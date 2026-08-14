import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

// The admin CMS talks to a wide surface of Django endpoints. Rather than a route
// handler per resource, this forwards the whole admin surface through apiFetch so
// the browser never holds a token. The allowlist keeps it from becoming an open
// proxy to *any* Django path (notably the rest of /api/auth/).
const ALLOWED_PREFIXES = [
  "system/",
  "catalog/",
  "brands/",
  "branches/",
  // Only the admin inbox is proxied - the public create endpoint
  // (`contact-messages/`) is not, so the CMS surface stays admin-only.
  "contact-messages/admin/",
  "success-stories/",
  "highlights/",
  "events/",
  "social-posts/",
  "check-slug/",
  "auth/admin/users/",
  "orders/admin/",
  // The CMS bookings screen. Only the admin sub-tree: the public availability
  // and booking-checkout endpoints are reached from the storefront through
  // their own handlers, not through this admin proxy.
  "bookings/admin/",
  // Only the admin sub-tree, like the bookings above: the public validate and
  // landing endpoints are reached from the storefront by their own handlers, and
  // proxying them here would put a customer-facing read behind an admin token.
  "coupons/admin/",
  // Listing, creating and deleting restore points only. Downloading an archive
  // and uploading one to restore are binary/multipart and cannot come through
  // here (this proxy re-encodes every body and response as JSON) - they have
  // dedicated handlers under /api/backups/.
  "backups/",
];

function isAllowed(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

async function forward(
  request: NextRequest,
  path: string[],
): Promise<NextResponse> {
  const joined = `${path.join("/")}/`;
  if (!isAllowed(joined))
    return NextResponse.json({ detail: "Not found" }, { status: 404 });

  const search = request.nextUrl.search;
  const hasBody = request.method !== "GET" && request.method !== "DELETE";

  const res = await apiFetch(`/api/${joined}${search}`, {
    method: request.method,
    ...(hasBody
      ? {
          headers: { "Content-Type": "application/json" },
          body: await request.text(),
        }
      : {}),
  });

  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
export async function POST(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
export async function PUT(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
export async function DELETE(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
