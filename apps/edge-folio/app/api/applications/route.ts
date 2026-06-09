import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const res = await fetch(`${process.env.API_URL}/api/applications/`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(request: NextRequest) {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;
  const { company_image_url, ...rest } = body as { company_image_url?: string | null } & Record<string, unknown>;

  if (company_image_url) {
    let imageBlob: Blob | null = null;
    let imageName = 'company_image.jpg';
    try {
      const imgRes = await fetch(company_image_url);
      if (imgRes.ok) {
        imageBlob = await imgRes.blob();
        const pathname = new URL(company_image_url).pathname;
        const basename = pathname.split('/').pop();
        if (basename) imageName = basename;
      }
    } catch {
      // Image download failed — continue without it
    }

    if (imageBlob) {
      const formData = new FormData();
      for (const [key, val] of Object.entries(rest)) {
        if (val != null) formData.append(key, String(val));
      }
      formData.append('company_image', imageBlob, imageName);

      const res = await fetch(`${process.env.API_URL}/api/applications/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      return NextResponse.json(await res.json(), { status: res.status });
    }
  }

  const res = await fetch(`${process.env.API_URL}/api/applications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(rest),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
