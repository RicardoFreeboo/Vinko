import { redirect } from "next/navigation";
import type { Metadata } from "next";

// /saldo se renombró a /cartera (diseño frontend §4.1). Redirección permanente
// para no romper enlaces antiguos ni la sesión que apunte aquí.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SaldoRedirect() {
  redirect("/cartera");
}
