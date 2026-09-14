"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", key: "admin.nav.hub" },
  { href: "/admin/metricas", key: "admin.nav.metricas" },
  { href: "/admin/moderacion", key: "admin.nav.moderacion" },
  { href: "/admin/temas", key: "admin.nav.temas" },
  { href: "/admin/health", key: "admin.nav.health" },
  { href: "/admin/live", key: "admin.nav.live" },
];

export function AdminNav({ labels }: { labels: Record<string, string> }) {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-2">
      {ITEMS.map((it) => {
        const active = path === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`mono rounded-full border px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.08em] ${
              active
                ? "border-[var(--win)] bg-[var(--win)] text-[var(--ink)]"
                : "border-[var(--line)] text-[var(--muted)]"
            }`}
          >
            {labels[it.key]}
          </Link>
        );
      })}
    </nav>
  );
}
