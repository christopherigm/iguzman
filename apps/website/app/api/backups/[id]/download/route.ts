import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

/**
 * GET /api/backups/<id>/download/ - stream one backup archive to its owner.
 *
 * Deliberately NOT routed through `/api/admin/[...path]`: that proxy parses
 * every response as JSON, which would corrupt a zip. This is a byte-for-byte
 * passthrough of Django's `FileResponse`.
 *
 * The response is streamed (`res.body`) rather than buffered - a full-catalog
 * archive can be hundreds of megabytes, and holding one in the Node process per
 * concurrent download is how a small container runs out of memory.
 *
 * Authorisation is Django's: the endpoint matches the row against the caller's
 * own System, so a guessed id returns 404 rather than another tenant's data.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }

  const res = await apiFetch(`/api/backups/${id}/download/`, {
    cache: "no-store",
  });

  if (!res.ok || !res.body) {
    const data: unknown = await res.json().catch(() => ({
      detail: "Download failed",
    }));
    return NextResponse.json(data, { status: res.status });
  }

  const headers = new Headers({
    "Content-Type": "application/zip",
    "Content-Disposition":
      res.headers.get("content-disposition") ??
      'attachment; filename="backup.zip"',
    // A backup is per-tenant and single-use; never let a proxy or the browser
    // keep a copy that a later visitor could be served.
    "Cache-Control": "no-store, private",
  });
  const length = res.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new NextResponse(res.body, { status: 200, headers });
}
