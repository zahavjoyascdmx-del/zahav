import { DIAMOND_POINTS, LETTER_LINES, LOGO_GOLD, LOGO_TAN, LOGO_VIEWBOX, Z_POINTS } from "@/lib/logo";

export function Logo({ width = 180, light = false }: { width?: number; light?: boolean }) {
  const gold = light ? "#D9C48F" : LOGO_GOLD;
  const tan = light ? "rgba(233,216,187,0.45)" : LOGO_TAN;
  return (
    <svg viewBox={LOGO_VIEWBOX} width={width} height={(width * 480) / 1020} role="img" aria-label="Zahav">
      <polygon points={DIAMOND_POINTS} fill="none" stroke={tan} strokeWidth={34} strokeLinejoin="miter" />
      <polyline points={Z_POINTS} fill="none" stroke={gold} strokeWidth={40} strokeLinejoin="miter" strokeLinecap="butt" />
      {LETTER_LINES.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={gold} strokeWidth={16} strokeLinecap="butt" />
      ))}
    </svg>
  );
}
