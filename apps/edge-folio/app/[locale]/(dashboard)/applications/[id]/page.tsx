import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { JobApplication } from "@/lib/applications";
import type { UserProfile } from "@/lib/auth";
import { ApplicationDetailPage } from "./application-detail-page";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale, id } = await params;
  const t = (await getTranslations({
    locale,
    namespace: "ApplicationDetailPage",
  })) as (key: string) => string;
  return { title: `${t("metaTitle")} #${id}` };
}

export default async function ApplicationDetailRoute({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) redirect(`/${locale}/auth`);

  const [appRes, profileRes] = await Promise.all([
    fetch(`${process.env.API_URL}/api/applications/${id}/`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }),
    fetch(`${process.env.API_URL}/api/auth/profile/`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }),
  ]);

  if (appRes.status === 401) redirect(`/${locale}/auth`);

  if (!appRes.ok) notFound();

  const application = (await appRes.json()) as JobApplication;
  const profile = profileRes.ok
    ? ((await profileRes.json()) as UserProfile)
    : null;

  let profilePictureBase64: string | undefined;
  if (profile?.profile_picture) {
    try {
      const picRes = await fetch(profile.profile_picture);
      if (picRes.ok) {
        const picBuffer = await picRes.arrayBuffer();
        const mimeType = picRes.headers.get("content-type") || "image/jpeg";
        profilePictureBase64 = `data:${mimeType};base64,${Buffer.from(picBuffer).toString("base64")}`;
      }
    } catch {
      // no photo available - proceed without it
    }
  }

  return (
    <ApplicationDetailPage
      application={application}
      profile={profile}
      profilePictureBase64={profilePictureBase64}
    />
  );
}
