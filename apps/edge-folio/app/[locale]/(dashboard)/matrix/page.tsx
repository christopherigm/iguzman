import { getTranslations, setRequestLocale } from "next-intl/server";
import { MatrixBoard } from "./matrix-board";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: "MatrixPage" })) as (
    key: string,
  ) => string;
  return { title: t("title") };
}

export default async function MatrixPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MatrixBoard />;
}
