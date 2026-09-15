import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("login.title2"), robots: { index: false, follow: false } };

// Login real (email + Google). `next` = a dónde volver tras entrar (p. ej. la
// misma porra desde la que se pulsó "Únete").
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={next ?? "/feed"} />;
}
