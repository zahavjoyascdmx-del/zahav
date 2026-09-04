"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function runSync(formData: FormData) {
  const kind = String(formData.get("kind") ?? "incremental");
  const supabase = await createClient();
  await supabase.rpc("run_sync", { p_kind: kind });
  revalidatePath("/sync");
}

export async function remap() {
  const supabase = await createClient();
  await supabase.rpc("map_catalog_secure");
  revalidatePath("/sync");
}
