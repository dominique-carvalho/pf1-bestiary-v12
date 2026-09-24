/** Verificacao final dos packs corrigidos. */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { ClassicLevel } from "classic-level";

const [SRC_PACKS, OUT_PACKS] = process.argv.slice(2);
const SUSPEITA = /[<>?]|&&|\|\|/;

async function srcStats(file) {
  const ids = new Set(); let itens = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const l of rl) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.$$deleted || d.$$indexCreated) continue;
    ids.add(d._id); itens += (d.items ?? []).length;
  }
  return { atores: ids.size, itens };
}

const T = { atores: 0, itens: 0, itensSrc: 0, atoresSrc: 0, changes: 0, suspeitas: 0, semBarra: 0,
  geradas: 0, gerCompendio: 0, gerGenerico: 0, gerSemId: 0, gerSemAcao: 0, gerSemDano: 0, gerNaoEquipada: 0, idsDuplicados: 0 };
const problemas = [];
const vistos = new Set();

for (const packName of fs.readdirSync(OUT_PACKS).sort()) {
  const dir = path.join(OUT_PACKS, packName);
  if (!fs.statSync(dir).isDirectory()) continue;
  const src = await srcStats(path.join(SRC_PACKS, `${packName}.db`));

  const db = new ClassicLevel(dir, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  let atores = 0, itens = 0, ger = 0;
  for await (const [key, v] of db.iterator()) {
    const ns = key.split("!")[1];
    if (ns === "actors") {
      atores++;
      if (v.prototypeToken?.bar1?.attribute !== "attributes.hp") { T.semBarra++; if (problemas.length < 10) problemas.push(`${packName}: ${v.name} sem barra`); }
    } else if (ns === "actors.items") {
      itens++;
      if (vistos.has(key)) T.idsDuplicados++; else vistos.add(key);
      for (const c of v.system?.changes ?? []) {
        T.changes++;
        if (SUSPEITA.test(String(c.formula ?? ""))) { T.suspeitas++; if (problemas.length < 10) problemas.push(`${packName}: formula "${c.formula}"`); }
      }
      const f = v.flags?.["pf1-bestiary"];
      if (f?.generated) {
        ger++;
        if (String(f.source).startsWith("compendium:")) T.gerCompendio++; else T.gerGenerico++;
        if (v.type !== "weapon") problemas.push(`${packName}: gerado com type=${v.type}`);
        if (!/^[A-Za-z0-9]{16}$/.test(v._id)) T.gerSemId++;
        const act = v.system?.actions?.[0];
        if (!act) T.gerSemAcao++;
        else if (!(act.damage?.parts?.length)) T.gerSemDano++;
        if (!v.system?.equipped) T.gerNaoEquipada++;
      }
    }
  }
  await db.close();

  T.atores += atores; T.itens += itens; T.geradas += ger;
  T.atoresSrc += src.atores; T.itensSrc += src.itens;
  const ok = atores === src.atores && itens === src.itens + ger;
  console.log(`${packName.padEnd(14)} atores=${atores}/${src.atores} itens=${itens} (origem ${src.itens} + ${ger} geradas) ${ok ? "OK" : "<<< DIVERGENTE"}`);
  if (!ok) problemas.push(`${packName}: contagem divergente`);
}

console.log("\n=== TOTAIS ===");
console.log(`  atores            ${T.atores} (origem ${T.atoresSrc})`);
console.log(`  itens             ${T.itens} (origem ${T.itensSrc} + ${T.geradas} geradas = ${T.itensSrc + T.geradas})`);
console.log(`  changes           ${T.changes}`);
console.log(`  formulas suspeitas ${T.suspeitas}`);
console.log(`  atores sem barra   ${T.semBarra}`);
console.log(`\n  armas geradas      ${T.geradas}  (compendio ${T.gerCompendio}, genericas ${T.gerGenerico})`);
console.log(`    id invalido      ${T.gerSemId}`);
console.log(`    sem action       ${T.gerSemAcao}`);
console.log(`    sem dano         ${T.gerSemDano}`);
console.log(`    nao equipada     ${T.gerNaoEquipada}`);
console.log(`  chaves duplicadas  ${T.idsDuplicados}`);
console.log(problemas.length ? `\nPROBLEMAS:\n  ${problemas.slice(0, 12).join("\n  ")}` : "\nNenhum problema.");
