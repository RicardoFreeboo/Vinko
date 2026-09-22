import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";

// Cajero SIMULADO (M0). Solo existe fuera de producción y con el secreto del
// proveedor de pruebas. En producción → 404. No mueve dinero: dispara el aviso
// del proveedor simulado (confirmado / fallido) hacia el webhook.
export const dynamic = "force-dynamic";

type SP = Promise<{ pool?: string; ref?: string; opt?: string; return?: string }>;

async function guard() {
  if (!process.env.MONEY_WEBHOOK_SECRET_MOCK || process.env.VERCEL_ENV === "production") notFound();
  const sb = await supabaseServer();
  if (!sb) notFound();
  const { data } = await sb.from("remote_config").select("value").eq("key", "misc").maybeSingle();
  const env = (data?.value as { env?: string } | null)?.env ?? "production";
  if (env === "production") notFound();
}

export default async function MockCashier({ searchParams }: { searchParams: SP }) {
  await guard();
  const sp = await searchParams;
  const ret = sp.return && sp.return.startsWith("/") && !sp.return.startsWith("//") ? sp.return : "/feed";
  const hidden = { pool: sp.pool ?? "", ref: sp.ref ?? "", opt: sp.opt ?? "", return: ret };

  return (
    <main className="mx-auto max-w-[430px] px-4 py-10">
      <h1 className="text-[22px] font-black text-[var(--cream)]">{t("moneyMock.cashier.title")}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{t("moneyMock.cashier.intro")}</p>
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-[var(--muted)]">{t("moneyMock.cashier.pool")}</dt><dd className="font-mono text-[var(--cream)]">{sp.pool}</dd>
        <dt className="text-[var(--muted)]">{t("moneyMock.cashier.option")}</dt><dd className="font-mono text-[var(--cream)]">{sp.opt}</dd>
      </dl>
      <div className="mt-6 flex flex-col gap-3">
        <form action="/api/money/mock/confirm" method="post">
          {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <button type="submit" className="w-full rounded-full bg-[var(--win)] px-5 py-3 text-[14px] font-black text-[var(--ink)]">
            {t("moneyMock.cashier.confirm")}
          </button>
        </form>
        <form action="/api/money/mock/fail" method="post">
          {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <button type="submit" className="w-full rounded-full border border-[var(--line)] px-5 py-3 text-[14px] font-bold text-[var(--muted)]">
            {t("moneyMock.cashier.fail")}
          </button>
        </form>
      </div>
    </main>
  );
}
