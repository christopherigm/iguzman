import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const res = await fetch(`${process.env.API_URL}/api/auth/resume/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData as BodyInit,
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
