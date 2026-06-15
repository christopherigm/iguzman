import { getTranslations, setRequestLocale } from "next-intl/server";
import { WorkExperiencePage } from "./work-experience-page";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = (await getTranslations({
    locale,
    namespace: "WorkExperiencePage",
  })) as (key: string) => string;
  return { title: t("title") };
}

export default async function WorkExperienceRoute({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <WorkExperiencePage />;
}
