"use client";
// Confeti al crear una porra (sin librería). Se monta, cae, y desaparece.
const COLORS = ["#1fe07a", "#ffc23d", "#f4f1e9", "#1fe07a", "#ffc23d"];
export function Confetti() {
  const pieces = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden" aria-hidden>
      <style>{`
        @keyframes vkfall { 0%{transform:translateY(-10vh) rotate(0);opacity:1} 100%{transform:translateY(110vh) rotate(720deg);opacity:0} }
      `}</style>
      {pieces.map((i) => {
        const left = (i * 37) % 100;
        const delay = (i % 10) * 0.08;
        const dur = 1.8 + ((i * 13) % 12) / 10;
        const size = 6 + ((i * 7) % 8);
        const c = COLORS[i % COLORS.length];
        return (
          <span key={i}
            style={{
              position: "absolute", left: `${left}%`, top: "-5vh",
              width: size, height: size * 1.6, background: c, borderRadius: 2,
              animation: `vkfall ${dur}s ${delay}s cubic-bezier(.3,.7,.5,1) forwards`,
            }} />
        );
      })}
    </div>
  );
}
