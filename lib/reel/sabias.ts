/** Banco de datos curiosos ("¿Sabías que?") verificables sobre joyería, para los Reels. */

export type Sabias = { id: string; texto: string; temas: string[] };

export const SABIAS: Sabias[] = [
  { id: "10k-pureza", temas: ["10k"], texto: "El oro de 10 kilates tiene 41.7% de oro puro. El resto es una aleación que lo hace más duro: por eso es el más resistente para usarlo todos los días." },
  { id: "10k-rayones", temas: ["10k", "argolla", "churumbela"], texto: "Cuantos más kilates, más suave es el oro. El de 10k resiste mejor los rayones y los golpes del día a día que el de 14k o 18k." },
  { id: "14k-pureza", temas: ["14k"], texto: "El oro de 14 kilates tiene 58.5% de oro puro. Es el equilibrio clásico entre color, brillo y resistencia." },
  { id: "18k-pureza", temas: ["18k"], texto: "El oro de 18 kilates tiene 75% de oro puro: su color es más intenso, pero es más blando que el de 14k o 10k." },
  { id: "24-partes", temas: ["general"], texto: "\"Kilates\" en el oro no mide peso, mide pureza: son las partes de oro puro en 24. Oro de 24k es oro puro." },
  { id: "no-oxida", temas: ["general", "argolla", "churumbela"], texto: "El oro no se oxida ni se opaca: es uno de los pocos metales que conserva su brillo por siglos. Una pieza bien cuidada dura generaciones." },
  { id: "eternidad", temas: ["churumbela"], texto: "La churumbela lleva piedras alrededor de todo el aro. En joyería se le llama \"anillo de eternidad\": un círculo sin principio ni fin." },
  { id: "churumbela-uso", temas: ["churumbela"], texto: "La churumbela se regala en aniversarios y nacimientos, y hoy también se usa sola o apilada con la argolla de matrimonio." },
  { id: "argolla-dedo", temas: ["argolla"], texto: "La argolla se usa en el cuarto dedo de la mano izquierda por una creencia antigua: que de ahí sale una vena directa al corazón, la \"vena amoris\"." },
  { id: "argolla-circulo", temas: ["argolla"], texto: "La argolla es un círculo perfecto porque no tiene principio ni fin: desde el antiguo Egipto simboliza un compromiso que no se acaba." },
  { id: "oro-maleable", temas: ["general"], texto: "El oro es tan maleable que con un solo gramo se puede hacer un hilo de más de dos kilómetros de largo." },
  { id: "oro-color", temas: ["general"], texto: "El oro blanco y el oro rosa son oro amarillo mezclado con otros metales: paladio o níquel para el blanco, cobre para el rosa." },
  { id: "diamante-dureza", temas: ["diamante"], texto: "El diamante es el material natural más duro que existe: solo otro diamante puede rayarlo." },
  { id: "diamante-4c", temas: ["diamante"], texto: "El valor de un diamante se mide con las \"4 C\": color, claridad, corte y quilates (peso). El corte es lo que más define su brillo." },
  { id: "zirconia", temas: ["zirconia"], texto: "La zirconia cúbica es una piedra creada en laboratorio con un brillo muy parecido al del diamante, a una fracción de su precio." },
  { id: "talla", temas: ["argolla", "churumbela", "anillo"], texto: "Los dedos cambian de tamaño durante el día: mide tu talla por la tarde, cuando la mano está a su temperatura normal." },
  { id: "limpieza", temas: ["general"], texto: "Para que tu oro brille como nuevo basta agua tibia, unas gotas de jabón neutro y un cepillo suave. Nada de cloro ni abrasivos." },
];

/** Sugiere datos curiosos según el nombre del producto y sus kilates (los más específicos primero). */
export function sugerirSabias(nombre: string, kilates?: string | null): Sabias[] {
  const n = nombre.toLowerCase();
  const temas = new Set<string>(["general"]);
  if (kilates) temas.add(kilates.toLowerCase());
  if (n.includes("churumbela")) temas.add("churumbela");
  if (n.includes("argolla")) temas.add("argolla");
  if (n.includes("anillo")) temas.add("anillo");
  if (n.includes("diamante") || n.includes("ct")) temas.add("diamante");
  if (n.includes("zirconia")) temas.add("zirconia");
  const peso = (s: Sabias) => Math.min(...s.temas.map((t) => (t === "general" ? 3 : temas.has(t) ? 0 : 9)));
  return SABIAS.filter((s) => s.temas.some((t) => temas.has(t))).sort((a, b) => peso(a) - peso(b));
}
