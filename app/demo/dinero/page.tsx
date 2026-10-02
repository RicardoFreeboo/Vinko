import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { moneyUiEnabled } from "@/lib/flags";
import { redirect } from "next/navigation";
import { getMemberSession } from "@/lib/session";
import { MoneyDemo } from "@/components/demo/MoneyDemo";

// Demo de inversor de la capa de dinero (SIMULACIÓN). No indexable, con sesión,
// y excluida en robots.ts + next.config. Números falsos, sin base de datos, sin
// dinero real. Es la maqueta del modelo con partner licenciado (CLAUDE.md §8.1).
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Demo",
  robots: { index: false, follow: false },
};


// MON-01: material de inversores. Solo existe con el flag de dinero encendido Y
// para un admin con sesión; para cualquier otro, 404.
async function guardMoneyAdmin(): Promise<void> {
  const sb = await supabaseServer();
  if (!(await moneyUiEnabled(sb))) notFound();
  const { data: adm } = sb ? await sb.rpc("is_admin") : { data: false };
  if (adm !== true) notFound();
}

export default async function DemoDineroPage() {
  await guardMoneyAdmin();
  const session = await getMemberSession().catch(() => null);
  if (!session) redirect("/login?next=/demo/dinero");
  return (
    <main className="min-h-dvh w-full bg-[var(--ink)]">
      <MoneyDemo />
    </main>
  );
}
