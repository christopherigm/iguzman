import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const res = await fetch(
    `${process.env.API_URL}/api/auth/passkey/credentials/${id}/`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );

  return new NextResponse(null, { status: res.status });
}
