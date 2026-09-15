"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ensurePushSubscription } from "@/lib/push";
import { t } from "@/lib/i18n";

// Navegación inferior de la app logueada (nunca en /p — la landing pública va
// limpia). El badge numérico del buzón es mecánica de retorno (§5.1.4).
const TABS = [
  { href: "/hoy", key: "nav.hoy", icon: "◉" },
  { href: "/grupos", key: "nav.grupos", icon: "⌂" },
  { href: "/liga", key: "nav.liga", icon: "▲" },
  { href: "/saldo", key: "nav.saldo", icon: "🪙" },
  { href: "/buzon", key: "nav.buzon", icon: "▤" },
] as const;

export function AppNav() {
  const path = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    // Revalidar la suscripción push en CADA apertura (iOS la cancela solo, §5.1)
    void ensurePushSubscription();
    const sb = supabaseBrowser();
    if (!sb) return;
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { count } = await sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null);
      setUnread(count ?? 0);
    });
  }, [path]);

  return (
    <nav
      aria-label={t("nav.label")}
      className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[430px] items-stretch justify-around border-t border-[var(--line)] bg-[var(--ink)]/95 backdrop-blur"
    >
      {TABS.map((tab) => {
        const active = path === tab.href || path?.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-wide ${
              active ? "text-[var(--win)]" : "text-[var(--muted)]"
            }`}
          >
            <span aria-hidden className="text-base leading-none">{tab.icon}</span>
            {t(tab.key)}
            {tab.href === "/buzon" && unread > 0 && (
              <span className="absolute right-[22%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--red)] px-1 text-[9px] font-black text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
