import { redirect } from "next/navigation";

// La portada entra directa a la app (el pique del día). El único candado es el
// Gate del código diario (para enseñar a inversores), que envuelve todo desde
// el layout. /hoy ya muestra el CTA de entrar si no hay sesión.
export default function Home() {
  redirect("/hoy");
}
