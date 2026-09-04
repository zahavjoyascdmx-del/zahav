/**
 * Logo ZAHAV en vectores (reconstruido del logotipo original).
 * Coordenadas en un lienzo de 1020 x 480.
 */
export const LOGO_VIEWBOX = "0 0 1020 480";
export const LOGO_GOLD = "#B5975A";
export const LOGO_TAN = "#E9D8BB";

/** Silueta del diamante (trazo claro). */
export const DIAMOND_POINTS = "120,20 515,20 660,165 435,400 10,130";
/** Trazo de la Z, cuya diagonal inferior cierra el diamante. */
export const Z_POINTS = "105,32 335,32 92,205 375,458 398,435";
/** Letras A H A V como líneas. */
export const LETTER_LINES: [number, number, number, number][] = [
  // A
  [250, 210, 330, 120], [330, 120, 410, 210], [285, 175, 375, 175],
  // H
  [455, 120, 455, 210], [610, 120, 610, 210], [455, 168, 610, 168],
  // A
  [655, 210, 735, 120], [735, 120, 815, 210], [690, 175, 780, 175],
  // V
  [825, 120, 915, 210], [915, 210, 1005, 120],
];
