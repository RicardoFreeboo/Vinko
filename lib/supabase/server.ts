import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente Supabase de servidor (sesión por cookies). Devuelve null si aún no
// hay variables de entorno → la app no se rompe; el login se enciende al
// pegar el anon key en Vercel.
export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const store = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* Server Component: las cookies las refresca el middleware */
        }
      },
    },
  });
}
