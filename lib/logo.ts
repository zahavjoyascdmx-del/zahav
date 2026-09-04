/**
 * Logo ZAHAV en vectores (reconstruido del logotipo original).
 * Coordenadas en un lienzo de 1020 x 480.
 */
export const LOGO_VIEWBOX = "0 0 1020 480";
export const LOGO_GOLD = "#B5975A";
export const LOGO_TAN = "#E6D2AE";

/** Silueta del diamante (trazo claro). */
export const DIAMOND_POINTS = "120,22 515,22 660,165 435,402 10,132";
/** Trazo de la Z: barra superior, diagonal y trazo largo paralelo al diamante, con remate. */
export const Z_POINTS = "100,30 335,30 90,203 395,462 418,439";
/** Letras A H A V como líneas finas y anchas. */
export const LETTER_LINES: [number, number, number, number][] = [
  // A
  [285, 210, 365, 118], [365, 118, 445, 210], [318, 178, 412, 178],
  // H
  [488, 118, 488, 210], [640, 118, 640, 210], [488, 166, 640, 166],
  // A
  [682, 210, 762, 118], [762, 118, 842, 210], [715, 178, 809, 178],
  // V
  [850, 118, 930, 210], [930, 210, 1010, 118],
];
