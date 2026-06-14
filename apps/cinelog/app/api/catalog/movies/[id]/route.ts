import { type NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/api/catalog/movies/${id}/`, { cache: 'no-store' });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/api/catalog/movies/${id}/`, { method: 'DELETE' });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
