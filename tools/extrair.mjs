/**
 * Extrai mecanica (save, dano, area, alcance) das habilidades especiais do
 * bestiario, a partir de duas fontes:
 *   A) o parentese no nome do proprio item de ataque, que vem do statblock
 *      "Breath Weapon (20-ft. Cone, 1d10 Fire, Reflex DC 12 Half)"
 *   B) a descricao do feat irmao de mesmo nome
 *      "...deals 3d6 points of slashing damage ... (Reflex DC 19 for half)"
 *
 * Tudo com regex literais de proposito: montar regex com template literal
 * (`^\s*${x}\b`) faz o \s virar "s" e o \b virar backspace.
 */

export const limpaHtml = (s) =>
  String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/g, " ").replace(/[‘’']/g, "'").replace(/\s+/g, " ").trim();

const RE_TIPO_DANO = /^\s*(?:points?\s+of\s+)?(acid|cold|electricity|fire|sonic|force|negative|positive|bludgeoning|piercing|slashing|untyped|plasma|divine|unholy|holy)\b/i;
const RE_ATRIBUTO = /^\s*(?:points?\s+of\s+)?(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)\b/i;
const RE_NAO_DANO = /^\s*(rounds?|minutes?|hours?|days?|turns?|levels?|hp\b|hit points?|squares?|feet|ft\b|ranged|melee)/i;

const SAVE_MAP = { reflex: "ref", ref: "ref", fortitude: "fort", fort: "fort", will: "will" };

/** Save padrao por tipo de habilidade, quando o texto so traz "DC N". */
const SAVE_PADRAO = [
  [/breath weapon|breath$|spit|spray|cone|blast|explode|self-destruct|death throes|web|entangle|ensnare|trample|burst/i, "ref", "half"],
  [/poison|disease|distraction|nausea|sicken|stench|paralysis|petrif|fatigue|exhaust|bleed|blood drain|filth/i, "fort", "negates"],
  [/fear|frightful|gaze|charm|confus|hypnot|mind|despair|curse|insan|domina|suggestion|song|wail|moan|shriek/i, "will", "negates"],
];

/** "Reflex DC 19 for half" / "DC 24" / "Fort DC 13 negates" */
export function extraiSave(txt, nomeHabilidade = "") {
  if (!txt) return null;
  let tipo = null, dc = null;
  let m = /\b(Reflex|Fortitude|Fort|Will)\.?\s+(?:save\s+)?DC\s*(\d+)/i.exec(txt);
  if (m) { tipo = SAVE_MAP[m[1].toLowerCase()] ?? null; dc = Number(m[2]); }
  else {
    const d = /\bDC\s*(\d+)/i.exec(txt);
    if (!d) return null;
    dc = Number(d[1]);
    const t = /\b(Reflex|Fortitude|Fort|Will)\b/i.exec(txt);
    if (t) tipo = SAVE_MAP[t[1].toLowerCase()] ?? null;
  }

  let efeito = "";
  if (/\bhal(?:f|fs|ves)\b/i.test(txt)) efeito = "half";
  else if (/\bnegates?\b/i.test(txt)) efeito = "negates";
  else if (/\bpartial\b/i.test(txt)) efeito = "partial";

  let inferido = false;
  if (!tipo) {
    for (const [re, t, ef] of SAVE_PADRAO) {
      if (re.test(nomeHabilidade) || re.test(txt)) { tipo = t; if (!efeito) efeito = ef; inferido = true; break; }
    }
  }
  const rotulo = { ref: "Reflex", fort: "Fortitude", will: "Will" }[tipo] ?? "";
  return { tipo, dc, description: [rotulo, efeito].filter(Boolean).join(" "), inferido };
}

/**
 * Dados de dano. Descarta duracoes ("1d4+1 rounds") e contadores.
 * `soDados` = o texto todo e so uma expressao de dados, como em "Constrict (1d6)":
 * nesse caso aceita mesmo sem tipo nem a palavra "damage".
 */
export function extraiDano(txt) {
  if (!txt) return [];
  const partes = [];
  const soDados = /^\s*\d+d\d+(?:[+-]\d+)?\s*$/.test(txt);
  const re = /(\d+d\d+(?:[+-]\d+)?)/g;
  let m;
  while ((m = re.exec(txt))) {
    const formula = m[1];
    const depois = txt.slice(m.index + formula.length, m.index + formula.length + 40);
    if (RE_NAO_DANO.test(depois)) continue;

    const attr = RE_ATRIBUTO.exec(depois);
    if (attr) { partes.push({ formula, tipos: [], atributo: attr[1].toLowerCase() }); continue; }

    const tipo = RE_TIPO_DANO.exec(depois);
    const perto = txt.slice(Math.max(0, m.index - 30), m.index + 60);
    if (!tipo && !soDados && !/\bdamage\b/i.test(perto)) continue;
    partes.push({ formula, tipos: tipo ? [tipo[1].toLowerCase()] : [] });
  }
  const vistos = new Set();
  return partes.filter((p) => {
    const k = `${p.formula}|${p.tipos.join(",")}|${p.atributo ?? ""}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

const FORMA = { cone: "cone", line: "ray", burst: "circle", spread: "circle",
  radius: "circle", emanation: "circle", sphere: "circle", cylinder: "circle", square: "rect" };
const RE_AREA = /(\d+)\s*[-\s]?\s*(?:ft\.?|foot|feet)\s*[-\s]?\s*(cone|line|burst|spread|radius|emanation|sphere|cylinder|square)/i;
const RE_AREA_INV = /(cone|line|burst|spread|radius|emanation)\s+of\s+(\d+)\s*(?:ft\.?|foot|feet)/i;

export function extraiArea(txt) {
  if (!txt) return null;
  let m = RE_AREA.exec(txt);
  if (m) { const f = FORMA[m[2].toLowerCase()]; return f ? { type: f, size: String(Number(m[1])) } : null; }
  m = RE_AREA_INV.exec(txt);
  if (m) { const f = FORMA[m[1].toLowerCase()]; return f ? { type: f, size: String(Number(m[2])) } : null; }
  return null;
}

const RE_ALC = /\brange of (\d+)\s*(?:ft\.?|foot|feet)/i;
const RE_ALC2 = /(\d+)\s*[-\s]?(?:ft\.?|foot|feet)\s+range/i;

export function extraiAlcance(txt) {
  if (!txt) return null;
  const m = RE_ALC.exec(txt) ?? RE_ALC2.exec(txt);
  return m ? { units: "ft", value: String(Number(m[1])), maxIncrements: 1 } : null;
}

/** Junta as duas fontes. O parentese do nome vem do statblock, entao tem prioridade. */
export function extrai(nomeItem, descFeat) {
  const nome = String(nomeItem || "");
  const base = nome.replace(/^Special Attack:\s*/i, "").replace(/\s*\(.*\)\s*$/, "").trim();
  const paren = /\(([^)]*)\)\s*$/.exec(nome);
  const doNome = paren ? paren[1] : "";
  const doTexto = limpaHtml(descFeat);

  const save = extraiSave(doNome, base) ?? extraiSave(doTexto, base);
  const dNome = extraiDano(doNome);
  const dano = dNome.length ? dNome : extraiDano(doTexto);
  const area = extraiArea(doNome) ?? extraiArea(doTexto);
  const alcance = extraiAlcance(doNome) ?? extraiAlcance(doTexto);

  return { base, save, dano, area, alcance, temAlgo: !!(save || dano.length || area) };
}
