import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";

// Verificación SIMULADA (M0). Solo fuera de producción y con el secreto del
// proveedor de pruebas. Marca el KYC como verificado a través del webhook.
export const dynamic = "force-dynamic";

type SP = Promise<{ user?: string; country?: string; return?: string }>;

async function guard() {
  if (!process.env.MONEY_WEBHOOK_SECRET_MOCK || process.env.VERCEL_ENV === "production") notFound();
  const sb = await supabaseServer();
  if (!sb) notFound();
  const { data } = await sb.from("remote_config").select("value").eq("key", "misc").maybeSingle();
  const env = (data?.value as { env?: string } | null)?.env ?? "production";
  if (env === "production") notFound();
}

export default async function MockKyc({ searchParams }: { searchParams: SP }) {
  await guard();
  const sp = await searchParams;
  const ret = sp.return && sp.return.startsWith("/") && !sp.return.startsWith("//") ? sp.return : "/feed";
  const hidden = { user: sp.user ?? "", country: sp.country ?? "", return: ret };

  return (
    <main className="mx-auto max-w-[430px] px-4 py-10">
      <h1 className="text-[22px] font-black text-[var(--cream)]">{t("moneyMock.kyc.title")}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{t("moneyMock.kyc.intro")}</p>
      <form action="/api/money/mock/kyc" method="post" className="mt-6">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <button type="submit" className="w-full rounded-full bg-[var(--win)] px-5 py-3 text-[14px] font-black text-[var(--ink)]">
          {t("moneyMock.kyc.confirm")}
        </button>
      </form>
    </main>
  );
}
