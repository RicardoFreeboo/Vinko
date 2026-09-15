"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", key: "admin.nav.hub" },
  { href: "/admin/metricas", key: "admin.nav.metricas" },
  { href: "/admin/flujo", key: "admin.nav.flujo" },
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
            style={{ fontFamily: "var(--font-mono2), monospace" }}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.08em] transition-shadow ${
              active
                ? "border-[var(--win)] bg-[var(--win)] text-[#060b09]"
                : "border-[rgba(31,224,122,0.2)] text-[rgba(244,241,233,0.6)] hover:border-[var(--win)] hover:text-[var(--win)]"
            }`}
          >
            {labels[it.key]}
          </Link>
        );
      })}
    </nav>
  );
}
