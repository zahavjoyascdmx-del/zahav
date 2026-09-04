const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const dec1Fmt = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

export const mxn = (n: number | string | null | undefined) => mxnFmt.format(Number(n ?? 0));
export const num = (n: number | string | null | undefined) => numFmt.format(Number(n ?? 0));
export const dec1 = (n: number | string | null | undefined) => dec1Fmt.format(Number(n ?? 0));
export const pct = (n: number) => `${dec1Fmt.format(n * 100)}%`;

/** Fecha de hoy (YYYY-MM-DD) en Ciudad de México (UTC-6, sin horario de verano). */
export function todayCdmx(): string {
  return new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
}
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" });
}
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City",
  });
}
