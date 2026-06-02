import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const res = await fetch(`${process.env.API_URL}/api/auth/passkey/register/options/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
