/**
 * Classifica os nomes de ataque subType=weapon em:
 *   compendio - casa com weapons-and-ammo do pf1 (usa os stats reais)
 *   generica  - parece arma mas nao casa (item novo a partir de nome+dano)
 *   nao-arma  - ataque natural, toque, habilidade: nao gera item
 *
 * O casamento usa o sufixo mais longo do nome que exista no compendio, o que
 * derruba prefixos magicos sem precisar listar todos ("+1 Vicious Dire Flail"
 * -> "Dire Flail"; "+2 Seeking Composite Longbow" -> "Composite Longbow").
 */
import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";

const SP = process.argv[2];

// O Foundry mantem lock no pack enquanto um mundo pf1 esta aberto; PF1_WEAPONS
// permite apontar para uma copia.
const WEAPONS = process.env.PF1_WEAPONS || "C:/Users/Dominique/AppData/Local/FoundryVTT/Data/systems/pf1/packs/weapons-and-ammo";
const db = new ClassicLevel(WEAPONS, { keyEncoding: "utf8", valueEncoding: "json" });
await db.open();
const porNome = new Map(), porCompacto = new Map();
for await (const [k, v] of db.iterator()) {
  if (!k.startsWith("!items!")) continue;
  const n = v.name.toLowerCase();
  porNome.set(n, v);
  porCompacto.set(n.replace(/[\s-]/g, ""), v);
}
await db.close();
export const compendioSize = porNome.size;

const PARTES = "slam|bite|claw|gore|hoof|hooves|tail|tail slap|tentacle|tongue|sting|wing|spine|tendril|vine|pseudopod|talon|thorn|quill|bristle|frond|strand|arm|horn|fist|kick|stomp|lash|mandible|pincer|antler|beak|feeler|barb|hair|flipper|trunk|foot|head|jaws|tusk|proboscis|spike|stalk|crush|constrict|engulf|swallow|maw|tress|antenna|antennae|root|blade";
const HABILIDADES = "touch|touches|ray|rays|blast|spit|spray|breath|aura|gaze|web|acid|fire|cold|shock|sonic|psychic|light|beam|bolt|energy|telekinetic|incorporeal|swarm|troop|rock|unarmed strike|flurry of blows|improvised weapon|special|bleed|shadow|jet|stream|jolt|vortex|vortices|while|undefined";
const NAO_ARMA = new RegExp(`^(?:(?:\\+\\d+|mwk|masterwork)\\s+)*(?:\\w+\\s+)?(?:${PARTES}|${HABILIDADES})s?$`, "i");

const LIXO = /^(d|s|while|attack \d+|mwk mwk|\+\d+\s*\w{0,2})$/i;

const singular = (s) => (s.endsWith("s") && !s.endsWith("ss") ? s.slice(0, -1) : s);
const busca = (k) => porNome.get(k) ?? porNome.get(singular(k)) ??
  porCompacto.get(k.replace(/[\s-]/g, "")) ?? porCompacto.get(singular(k).replace(/[\s-]/g, ""));

/** Maior sufixo de palavras do nome que exista no compendio. */
function casaSufixo(nome) {
  const limpo = nome.replace(/\s*\(.*?\)\s*$/, "").replace(/[^\w\s+-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const pal = limpo.split(" ").filter(Boolean);
  for (let i = 0; i < pal.length; i++) {
    const cand = pal.slice(i).join(" ");
    if (/^[+]?\d+$/.test(cand)) continue;
    const hit = busca(cand);
    if (hit) return hit;
  }
  return null;
}

export function classifica(nome) {
  const n = (nome ?? "").trim();
  if (!n || n.length < 2 || LIXO.test(n)) return { tipo: "nao-arma", motivo: "lixo de parsing" };
  if (NAO_ARMA.test(n)) return { tipo: "nao-arma", motivo: "parte do corpo/habilidade" };
  const enhM = /(?:^|\s)\+(\d+)(?=\s)/.exec(n);
  const enh = enhM ? Number(enhM[1]) : null;
  const mwk = /(?:^|\s)(mwk|masterwork)(?=\s)/i.test(n);
  const fonte = casaSufixo(n);
  return fonte ? { tipo: "compendio", fonte, enh, mwk } : { tipo: "generica", enh, mwk };
}

if (process.argv[3] === "--dry") {
  const lista = JSON.parse(fs.readFileSync(path.join(SP, "weapon-names.json"), "utf8"));
  const buckets = { compendio: [], generica: [], "nao-arma": [] };
  let tot = 0;
  for (const [nome, qtd] of lista) { tot += qtd; const c = classifica(nome); buckets[c.tipo].push([nome, qtd, c.fonte?.name]); }
  const soma = (b) => b.reduce((t, x) => t + x[1], 0);
  console.log(`compendio pf1: ${compendioSize} armas\ntotal de ataques subType=weapon: ${tot}\n`);
  for (const k of ["compendio", "generica", "nao-arma"])
    console.log(`${k.padEnd(10)} ${String(soma(buckets[k])).padStart(5)} ocorrencias (${((soma(buckets[k]) / tot) * 100).toFixed(1)}%)  em ${buckets[k].length} nomes`);

  console.log(`\n--- amostra de casamentos por sufixo (nome != base) ---`);
  buckets.compendio.filter(([n, , b]) => n.toLowerCase() !== (b ?? "").toLowerCase())
    .sort((a, b) => b[1] - a[1]).slice(0, 22).forEach(([n, c, b]) => console.log(`  ${String(c).padStart(3)}x  ${n.padEnd(34)} -> ${b}`));

  console.log(`\n--- GENERICAS: ${buckets.generica.length} nomes, top 30 ---`);
  buckets.generica.sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([n, c]) => console.log(`  ${String(c).padStart(3)}x  ${n}`));

  console.log(`\n--- DESCARTADAS: ${buckets["nao-arma"].length} nomes, top 20 ---`);
  buckets["nao-arma"].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([n, c]) => console.log(`  ${String(c).padStart(3)}x  ${n}`));
}
