import { setRequestLocale } from "next-intl/server";
import { MusicPlayer } from "@/components/music-player";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MusicPlayer />;
}
