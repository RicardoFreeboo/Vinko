import { createBrowserClient } from "@supabase/ssr";

// Cliente Supabase de navegador. null si no hay variables → la UI lo maneja.
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createBrowserClient(url, anon);
}
