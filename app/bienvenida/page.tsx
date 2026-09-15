import type { Metadata } from "next";
import { AgeForm } from "@/components/auth/AgeForm";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("age.title"), robots: { index: false, follow: false } };

export default async function Bienvenida({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AgeForm next={next ?? "/feed"} />;
}
