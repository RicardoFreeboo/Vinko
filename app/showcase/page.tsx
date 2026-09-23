// TEMPORAL — escaparate para capturas. NO se commitea. Pinta los componentes
// nuevos con datos de ejemplo (sin sesión) para localizarlos en la web.
import { EuroWallet } from "@/components/EuroWallet";
import { SaferPlayClient } from "@/components/SaferPlayClient";
import { GroupMoney } from "@/components/GroupMoney";
import { MoneyRevenueAdmin } from "@/components/admin/MoneyRevenueAdmin";
import { AffiliateCta } from "@/components/AffiliateCta";
import { KycLevels } from "@/components/KycLevels";
import { EurAmount } from "@/components/money/EurAmount";
import { CoinAmount } from "@/components/money/CoinAmount";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vinko — recorrido de producto", robots: { index: false, follow: false } };

const mockWallet = {
  hasAccount: true, provider: "partner_luckia", currency: "EUR", kycLevel: 2,
  availableMinor: 4200, lockedMinor: 1500,
  movements: [
    { id: "1", kind: "payout", amountMinor: 735, currency: "EUR", status: "completed", porraRef: null, createdAt: "2026-09-23T10:00:00Z" },
    { id: "2", kind: "stake_hold", amountMinor: 500, currency: "EUR", status: "completed", porraRef: "mock:p1", createdAt: "2026-09-23T09:00:00Z" },
    { id: "3", kind: "deposit", amountMinor: 2000, currency: "EUR", status: "completed", porraRef: null, createdAt: "2026-09-22T18:00:00Z" },
    { id: "4", kind: "withdraw", amountMinor: 1000, currency: "EUR", status: "pending", porraRef: null, createdAt: "2026-09-22T12:00:00Z" },
  ],
};
const mockRev = {
  statements: [
    { id: 1, provider: "partner_luckia", period: "2026-10", gross_rake_minor: 120000, vinko_share_minor: 36000, currency: "EUR", paid_at: "2026-10-05T00:00:00Z", invoice_ref: "INV-241" },
    { id: 2, provider: "partner_luckia", period: "2026-09", gross_rake_minor: 90000, vinko_share_minor: 27000, currency: "EUR", paid_at: null, invoice_ref: null },
  ],
  settled_pools: 12, total_share_minor: 36000, pending_share_minor: 27000,
};

function Block({ title, url, children }: { title: string; url: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="border-l-2 border-[var(--win)] pl-3">
        <div className="text-[15px] font-black text-[var(--cream)]">{title}</div>
        <div className="mono text-[12px] text-[var(--gold)]">{url}</div>
      </div>
      {children}
    </section>
  );
}

export default function Showcase() {
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-8 px-5 py-8">
      <h1 className="text-2xl font-black text-[var(--cream)]">Escaparate — novedades</h1>

      <Block title="1 · Cartera (euros ENCENDIDO, como en preview con el mock)" url="/cartera">
        <EuroWallet wallet={mockWallet} eurosEnabled={true} />
      </Block>

      <Block title="2 · Cartera (euros APAGADO — así se ve hoy en producción)" url="/cartera">
        <EuroWallet wallet={{ ...mockWallet, availableMinor: 0, lockedMinor: 0, movements: [] }} eurosEnabled={false} />
      </Block>

      <Block title="3 · Cartera con AUTOEXCLUSIÓN activada" url="/cartera">
        <EuroWallet wallet={{ ...mockWallet, availableMinor: 0, lockedMinor: 0, movements: [] }} eurosEnabled={false} selfExcludedUntil="2026-12-23T00:00:00Z" />
      </Block>

      <Block title="4 · Juego más seguro (§5.11)" url="/juego-seguro">
        <SaferPlayClient initial={{ self_excluded_until: null, is_excluded: false, limits: { daily_minor: 5000 } }} />
      </Block>

      <Block title="5 · Porras con dinero P2P (dentro de un grupo)" url="/g/[id] · pestaña Grupos">
        <GroupMoney groupId="demo" myId="demo" myPayHandle="+34 600 111 222" />
      </Block>

      <Block title="6 · Boleto de dinero (§5.4) — entrar en una porra con euros" url="/p/[slug] · modalidad dinero">
        <div className="flex flex-col gap-2.5 rounded-[16px] border border-[var(--gold)] bg-[var(--ink2)] p-4">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--gold)]">Jugar con dinero</p>
          <p className="text-[15px] font-bold text-[var(--cream)]">¿Llegará el novio tarde al altar?</p>
          <div className="rounded-[14px] border-2 border-[var(--win)] bg-[rgba(31,224,122,0.08)] px-4 py-3 text-[15px] font-bold text-[var(--cream)]">SÍ</div>
          <div className="rounded-[14px] border border-[var(--line)] px-4 py-3 text-[15px] font-bold text-[var(--muted)]">NO</div>
          <div className="flex flex-col gap-1.5 rounded-[12px] border border-[var(--line)] bg-[var(--ink)] p-3 text-[13px]">
            <div className="flex justify-between text-[var(--muted)]"><span>Tu entrada</span><span className="mono font-black text-[var(--cream)]">5,00 €</span></div>
            <div className="flex justify-between text-[var(--muted)]"><span>Comisión Vinko (5%)</span><span className="mono">−0,25 €</span></div>
            <p className="text-[11px] leading-snug text-[var(--muted2)]">Si aciertas, cobras del reparto. El importe depende de cuántos acierten.</p>
            <div className="mt-1 flex justify-between text-[var(--muted)]"><span>Disponible: 42,00 €</span><span>quedará 37,00 €</span></div>
          </div>
          <div className="rounded-[14px] bg-[var(--win)] px-4 py-3.5 text-center text-[15px] font-black text-[var(--ink)]">Entrar con 5,00 €</div>
          <p className="text-[10px] text-[var(--muted2)]">+18 · Juega con responsabilidad · Lo custodia un proveedor con licencia.</p>
        </div>
      </Block>

      <Block title="7 · KYC por niveles (§5.7)" url="/verificar">
        <KycLevels current={1} />
      </Block>

      <Block title="8 · Afiliación a operador (así se vería el botón; hoy APAGADO)" url="/p/[slug] · solo +18">
        <AffiliateCta operator="Luckia" country="ES" porraId="demo" />
      </Block>

      <Block title="7 · Admin · Ingresos (rev-share / Parte B)" url="/admin/money/revenue">
        <MoneyRevenueAdmin initial={mockRev} />
      </Block>

      <Block title="8 · Euros vs Vinkos (nunca se confunden)" url="componentes EurAmount / CoinAmount">
        <div className="flex items-center gap-6 rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-4">
          <EurAmount cents={4250} size="lg" />
          <CoinAmount coins={1250} size="lg" />
        </div>
      </Block>
    </main>
  );
}
