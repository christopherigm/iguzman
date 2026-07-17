import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

/**
 * An order is addressed by its public UUID, the same handle the history links
 * and the detail page use - never the sequential pk, which never leaves Django.
 *
 * Only orders that never completed payment are deletable; Django refuses a paid
 * or refunded one with 403 (see `orders/views.py`). The frontend hides the
 * trash affordance on those cards, but this pass-through does not re-check it -
 * the API is the authority.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const res = await apiFetch(`/api/orders/${encodeURIComponent(id)}/`, {
    method: "DELETE",
  });

  // Django answers 204 with no body; parsing it as JSON would throw.
  if (res.status === 204) return new NextResponse(null, { status: 204 });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
