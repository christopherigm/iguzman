import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ count: 0, credentials: [] });

  const res = await fetch(`${process.env.API_URL}/api/auth/passkey/credentials/`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return NextResponse.json({ count: 0, credentials: [] });
  const data: unknown = await res.json();
  return NextResponse.json(data);
}
