"use client";
import { useEffect, useState } from "react";
import { dailyCode, madridClock } from "@/lib/gate";

// Código del día + cuenta atrás en vivo hasta la rotación (medianoche Madrid).
export function SecretCode({ codeLabel, expiresLabel }: { codeLabel: string; expiresLabel: string }) {
  const [code, setCode] = useState("······");
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const tick = () => {
      const { day, secsToMidnight } = madridClock();
      setCode(dailyCode(day));
      setLeft(secsToMidnight);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const h = String(Math.floor(left / 3600)).padStart(2, "0");
  const m = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
  const s = String(left % 60).padStart(2, "0");

  return (
    <div className="flex w-full flex-col items-center gap-4 rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] px-6 py-8">
      <span className="eyebrow text-[11px]">{codeLabel}</span>
      <div className="mono text-5xl font-black tracking-[0.15em] text-[var(--win)]">{code}</div>
      <div className="flex flex-col items-center gap-1">
        <span className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted2)]">{expiresLabel}</span>
        <span className="mono text-2xl font-bold text-[var(--gold)]" suppressHydrationWarning>
          {h}:{m}:{s}
        </span>
      </div>
    </div>
  );
}
