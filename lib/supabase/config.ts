/**
 * URL y clave publishable del proyecto de Supabase.
 * Ambas son públicas por diseño (viajan al navegador); la seguridad la dan las políticas RLS.
 * Se toman de las variables de entorno si existen y, si no, de estos valores por defecto.
 */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ugptqxitkpyfindugaig.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_BT56vGMBcUYZ3UBw6BQilw_mT4Z2wP1";
