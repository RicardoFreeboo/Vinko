import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { MoneyDemo } from "@/components/demo/MoneyDemo";

// Demo de inversor de la capa de dinero (SIMULACIÓN). No indexable, con sesión,
// y excluida en robots.ts + next.config. Números falsos, sin base de datos, sin
// dinero real. Es la maqueta del modelo con partner licenciado (CLAUDE.md §8.1).
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Demo",
  robots: { index: false, follow: false },
};

export default async function DemoDineroPage() {
  const session = await getSession().catch(() => null);
  if (!session) redirect("/login?next=/demo/dinero");
  return (
    <main className="min-h-dvh w-full bg-[var(--ink)]">
      <MoneyDemo />
    </main>
  );
}
