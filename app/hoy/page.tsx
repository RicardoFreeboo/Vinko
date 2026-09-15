import { redirect } from "next/navigation";

// La pestaña "Hoy" desapareció: su contenido se repartió entre el FEED (pique
// del día) y VINKOS (racha semanal y regalo diario). Los enlaces viejos siguen
// funcionando.
export default function Hoy() {
  redirect("/feed");
}
