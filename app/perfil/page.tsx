import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// "Mi perfil" del nav: lleva a tu propio /u/[handle] sin que el nav tenga que
// conocer tu handle (es un componente cliente).
export const dynamic = "force-dynamic";

export default async function MiPerfil() {
  const session = await getSession();
  if (!session?.handle) redirect("/login?next=/perfil");
  redirect(`/u/${session.handle}`);
}
