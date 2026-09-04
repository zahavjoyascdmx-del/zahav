import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function checkSupabase(): Promise<{ ok: boolean; message: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, message: "Variables de entorno de Supabase no configuradas." };
  }
  // A lightweight request against the REST endpoint; any HTTP answer means the
  // project is reachable with the configured keys.
  const { error } = await supabase.from("_zahav_healthcheck").select("*").limit(1);
  if (!error || error.code === "PGRST205" || error.code === "42P01") {
    return { ok: true, message: "Conexión con Supabase establecida." };
  }
  return { ok: false, message: `Error de Supabase: ${error.message}` };
}

export default async function Home() {
  const status = await checkSupabase();
  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Zahav</h1>
      <p>Aplicación desplegada en Vercel con Supabase como backend.</p>
      <ul>
        <li>Vercel: ✅ desplegado</li>
        <li>
          Supabase: {status.ok ? "✅" : "⚠️"} {status.message}
          {!isSupabaseConfigured && " Añade NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en Vercel."}
        </li>
      </ul>
    </main>
  );
}
