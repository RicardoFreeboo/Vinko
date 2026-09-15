"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { capture } from "@/lib/analytics";
import { t } from "@/lib/i18n";

type Item = {
  id: string;
  class: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

export function BuzonClient({ items }: { items: Item[] }) {
  const [list, setList] = useState(items);

  // abrir el buzón marca todo como leído (el badge baja a 0)
  useEffect(() => {
    capture("inbox_opened", { is_seed: false });
    const unread = items.filter((i) => !i.read_at).map((i) => i.id);
    if (unread.length === 0) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    sb.from("notifications").update({ read_at: new Date().toISOString() }).in("id", unread)
      .then(() => setList((l) => l.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() }))));
  }, [items]);

  if (list.length === 0) {
    return <p className="text-sm text-[var(--muted)]">{t("buzon.none")}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {list.map((i) => {
        const inner = (
          <div className="rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3">
            <div className="font-bold text-[var(--cream)]">{i.title}</div>
            {i.body && <div className="mt-0.5 text-xs text-[var(--muted)]">{i.body}</div>}
          </div>
        );
        return (
          <li key={i.id}>
            {i.url ? (
              <Link href={i.url} onClick={() => capture("inbox_item_clicked", { is_seed: false, class: i.class })}>
                {inner}
              </Link>
            ) : inner}
          </li>
        );
      })}
    </ul>
  );
}
