"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ACCIONES = ["send_message", "open_dispute", "allow_return", "refund", "partial_refund", "return_review_ok", "return_review_fail"];

/** Sube los archivos del formulario al bucket "reclamos" y devuelve sus rutas. */
async function subir(supabase: Awaited<ReturnType<typeof createClient>>, claimId: number, fd: FormData): Promise<string[]> {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const paths: string[] = [];
  for (const f of files) {
    if (f.size > 5 * 1024 * 1024) throw new Error(`${f.name} pasa de 5 MB`);
    if (!/^(image\/(jpeg|png)|application\/pdf)$/.test(f.type)) throw new Error(`${f.name}: solo JPG, PNG o PDF`);
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `${claimId}/${Date.now()}_${safe}`;
    const { error } = await supabase.storage.from("reclamos").upload(path, f, { contentType: f.type });
    if (error) throw new Error(error.message);
    paths.push(path);
  }
  return paths;
}

export async function accionReclamo(fd: FormData) {
  const claimId = Number(fd.get("claim_id"));
  const action = String(fd.get("action") ?? "");
  if (!claimId || !ACCIONES.includes(action)) redirect(`/reclamos/${claimId}?error=accion`);
  const supabase = await createClient();
  const payload: Record<string, unknown> = {};
  if (action === "send_message") {
    payload.receiver_role = fd.get("receiver_role") === "mediator" ? "mediator" : "complainant";
    payload.message = String(fd.get("message") ?? "").trim();
    if (!payload.message) redirect(`/reclamos/${claimId}?error=mensaje`);
  }
  if (action === "partial_refund") payload.percentage = Number(fd.get("percentage"));
  if (action === "return_review_fail") {
    payload.reason = String(fd.get("reason") ?? "");
    payload.message = String(fd.get("message") ?? "");
  }
  if (action === "send_message" || action === "return_review_fail") payload.files = await subir(supabase, claimId, fd);
  // Las acciones de dinero piden confirmación explícita en el formulario.
  if (["refund", "partial_refund", "allow_return", "open_dispute"].includes(action) && fd.get("confirmo") !== "si") {
    redirect(`/reclamos/${claimId}?error=confirmar`);
  }
  const { error } = await supabase.rpc("claim_action", { p_claim_id: claimId, p_action: action, p_payload: payload });
  if (error) redirect(`/reclamos/${claimId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/reclamos/${claimId}`);
  redirect(`/reclamos/${claimId}?ok=${action}`);
}

export async function sincronizarReclamos() {
  const supabase = await createClient();
  await supabase.rpc("sync_claims");
  revalidatePath("/reclamos");
}
