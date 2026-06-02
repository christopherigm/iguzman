import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const res = await fetch(`${process.env.API_URL}/api/auth/profile/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(request: NextRequest) {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const body: unknown = await request.json();
  const res = await fetch(`${process.env.API_URL}/api/auth/profile/`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
