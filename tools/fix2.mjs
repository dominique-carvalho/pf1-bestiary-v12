/**
 * Passada unica sobre os .db originais, gravando packs LevelDB corrigidos:
 *   1) formulas de change com ternario/comparacao -> sintaxe do parser atual
 *   2) prototypeToken.bar1.attribute -> attributes.hp (barra de vida)
 *   3) gera itens `weapon` no inventario a partir dos ataques subType=weapon,
 *      para os NPCs terem o que soltar ao morrer
 *
 * Os ataques originais NAO sao alterados nem linkados as armas novas: assim o
 * ataque continua rolando igual e saquear a arma nao apaga o ataque.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { classifica } from "./classify.mjs";
import { montaAcao, CSV_CABECALHO, csvEscapa } from "./acoes.mjs";
import { migraAtaquesExtras } from "./multiataque.mjs";
import { ClassicLevel } from "classic-level";

const csvLinhas = [CSV_CABECALHO.map(csvEscapa).join(",")];

const [SRC_PACKS, OUT_PACKS, TMP] = process.argv.slice(2);

// --- template para armas genericas (um item valido do compendio) -------------
const WEAPONS = process.env.PF1_WEAPONS || "C:/Users/Dominique/AppData/Local/FoundryVTT/Data/systems/pf1/packs/weapons-and-ammo";
const wdb = new ClassicLevel(WEAPONS, { keyEncoding: "utf8", valueEncoding: "json" });
await wdb.open();
let TEMPLATE = null;
for await (const [k, v] of wdb.iterator()) if (k.startsWith("!items!") && v.name === "Club") TEMPLATE = v;
await wdb.close();
if (!TEMPLATE) throw new Error("template 'Club' nao encontrado no compendio do pf1");

// --- ids ---------------------------------------------------------------------
const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const novoId = () => Array.from({ length: 16 }, () => CHARS[(Math.random() * CHARS.length) | 0]).join("");

// --- 1. formulas -------------------------------------------------------------
const SKILL_RE = /^@skills\.([a-z]{3})\.ranks?\s*>=\s*10\s*\?\s*4\s*:\s*2$/;
const LITERAIS = new Map([
  ["@size < 4 ? 10 : @size < 5 ? 20 : @size < 6 ? 30 : @size < 7 ? 40 : @size < 8 ? 60 : 80",
   "lookup(@size + 1, 0, 10, 10, 10, 10, 20, 30, 40, 60, 80)"],
  ["@abilities.dex.mod > @abilities.str.mod ? (@abilities.dex.mod - @abilities.str.mod) : 0",
   "max(0, @abilities.dex.mod - @abilities.str.mod)"],
  ["@shield.type > 0 ? 1 : 0", "ifelse(gt(@shield.type, 0), 1, 0)"],
  ["(@armor.type < 2 && @attributes.encumbrance.level < 1) ? 5 : 0",
   "ifelse(lt(@armor.type, 2) * lt(@attributes.encumbrance.level, 1), 5, 0)"],
]);
const SUSPEITA = /[<>?]|&&|\|\|/;

const st = {
  atores: 0, changes: 0, formulasCorrigidas: 0, formulasNaoReconhecidas: 0, changesNaN: 0,
  barras: 0, nacCorrigido: 0, nacJaNumero: 0, nacEstranho: 0,
  actionsMigradas: 0, comAtaquesExtras: 0,
  placeholders: 0, placeholdersSemMecanica: 0, acoesGeradas: 0,
  acoesComSave: 0, acoesComDano: 0, acoesComArea: 0, descricoesTrocadas: 0,
  armasCompendio: 0, armasGenericas: 0, armasDescartadas: 0, armasDuplicadas: 0,
  atoresQueGanharamArma: 0, comQuantidade: 0,
};
const naoReconhecidas = {};

function corrigeFormula(f) {
  if (!SUSPEITA.test(f)) return null;
  const m = SKILL_RE.exec(f.trim());
  if (m) return `ifelse(gte(@skills.${m[1]}.rank, 10), 4, 2)`;
  const lit = LITERAIS.get(f.trim());
  if (lit) return lit;
  naoReconhecidas[f] = (naoReconhecidas[f] ?? 0) + 1;
  return null;
}

// --- 3. armas ----------------------------------------------------------------
function tiposDeDano(parts) {
  const out = [];
  for (const p of parts ?? []) {
    const t = p.type?.values ?? p.types ?? [];
    for (const x of t) if (!out.includes(x)) out.push(x);
  }
  return out.length ? out : ["bludgeoning"];
}

function quantidadeDaNota(act) {
  const nota = (act?.attackNotes ?? [])[0] ?? "";
  const m = /^\s*(\d+)\s+\S/.exec(nota);
  if (!m) return 1;
  const n = Number(m[1]);
  return n >= 2 && n <= 10 ? n : 1;
}

function criaArma(atk, cls) {
  const act = atk.system?.actions?.[0];
  const qtd = quantidadeDaNota(act);
  let item;

  if (cls.tipo === "compendio") {
    item = structuredClone(cls.fonte);
    st.armasCompendio++;
  } else {
    item = structuredClone(TEMPLATE);
    const parts = act?.damage?.parts ?? [];
    item.system.actions = [{
      ...structuredClone(TEMPLATE.system.actions[0]),
      _id: novoId().slice(0, 16).toLowerCase(),
      damage: { parts: parts.length
        ? parts.map((p) => ({ formula: String(p.formula ?? "1d4"), types: tiposDeDano([p]) }))
        : [{ formula: "1d4", types: ["bludgeoning"] }] },
      actionType: act?.actionType ?? "mwak",
    }];
    item.system.price = 0;
    item.system.weight = { value: 0 };
    item.system.baseTypes = [atk.name];
    item.system.weaponGroups = [];
    item.system.description = { value: "<p><em>Item gerado automaticamente a partir do ataque do statblock. Preço, peso e categoria não foram determinados.</em></p>" };
    if (atk.img) item.img = atk.img;
    st.armasGenericas++;
  }

  delete item._stats;
  delete item.folder;
  item._id = novoId();
  item.name = atk.name;
  item.system.quantity = qtd;
  item.system.equipped = true;
  item.system.carried = true;
  item.system.identified = true;
  if (cls.mwk) item.system.masterwork = true;
  if (cls.enh != null) item.system.enh = cls.enh;
  item.system.links = { children: [] };
  item.flags = { ...(item.flags ?? {}), "pf1-bestiary": {
    generated: true,
    source: cls.tipo === "compendio" ? `compendium:${cls.fonte.name}` : "generic",
    fromAttack: atk._id,
  } };
  if (qtd > 1) st.comQuantidade++;
  return item;
}

// --- leitura / escrita -------------------------------------------------------
async function readNedb(file) {
  const docs = new Map();
  const rl = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const d = JSON.parse(line);
    if (d.$$indexCreated || d.$$indexRemoved) continue;
    if (d.$$deleted) { docs.delete(d._id); continue; }
    docs.set(d._id, d);
  }
  return docs;
}

const HIERARCHY = { actors: { items: [], effects: [] }, items: { effects: [] }, effects: {} };
const keyJoin = (a, b) => (a ? `${a}.${b}` : b);
function assignKeys(doc, collection, sub = "", idp = "") {
  const s = keyJoin(sub, collection), id = keyJoin(idp, doc._id);
  doc._key = `!${s}!${id}`;
  for (const [emb, type] of Object.entries(HIERARCHY[collection] ?? {})) {
    const v = doc[emb];
    if (Array.isArray(type) && Array.isArray(v)) for (const c of v) assignKeys(c, emb, s, id);
  }
}
const safeName = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "doc";

// --- execucao ----------------------------------------------------------------
for (const file of fs.readdirSync(SRC_PACKS).filter((f) => f.endsWith(".db")).sort()) {
  const packName = path.basename(file, ".db");
  const tmpDir = path.join(TMP, packName), outDir = path.join(OUT_PACKS, packName);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const docs = await readNedb(path.join(SRC_PACKS, file));
  for (const a of docs.values()) {
    st.atores++;
    a.items ??= [];

    // 1) formulas
    for (const it of a.items) {
      const changes = it.system?.changes;
      if (!changes) continue;
      // Formula NaN nunca avalia: so gera erro no console. Ocorre em construtos
      // sem Con/Int, onde o sbc gravou NaN em vez de omitir o change.
      const limpos = changes.filter((c) => {
        if (String(c.formula ?? "").includes("NaN")) { st.changesNaN++; return false; }
        return true;
      });
      if (limpos.length !== changes.length) it.system.changes = limpos;

      for (const c of it.system.changes) {
        st.changes++;
        const novo = corrigeFormula(String(c.formula ?? ""));
        if (novo !== null) {
          c.formula = novo;
          if (typeof c.value === "number") delete c.value;
          st.formulasCorrigidas++;
        } else if (SUSPEITA.test(String(c.formula ?? ""))) st.formulasNaoReconhecidas++;
      }
    }

    // 2) barra de vida
    const pt = (a.prototypeToken ??= {});
    pt.bar1 ??= {};
    if (!pt.bar1.attribute) { pt.bar1.attribute = "attributes.hp"; st.barras++; }

    // 2b) armadura natural: o sbc gravou como texto ("+3"). Funciona enquanto o
    // ator fica no compendio, mas a ficha do pf1 mostra esse campo num input
    // numerico, que nao segura o "+". No primeiro save da ficha o valor vira
    // null e o bonus some silenciosamente (CA 17 em vez de 20 no Maftet).
    const nac = a.system?.attributes?.naturalAC;
    if (typeof nac === "string") {
      const n = Number.parseFloat(nac.trim());
      if (Number.isFinite(n)) { a.system.attributes.naturalAC = n; st.nacCorrigido++; }
      else { a.system.attributes.naturalAC = 0; st.nacEstranho++; }
    } else if (typeof nac === "number") st.nacJaNumero++;

    // 2d) multiataque: attackParts/formulaicAttacks -> extraAttacks. Sem isso o
    // data model descarta o campo antigo e todo multiataque vira um ataque so.
    for (const it of a.items) {
      for (const act of it.system?.actions ?? []) {
        const tinha = (act.attackParts?.length ?? 0) > 0;
        if (migraAtaquesExtras(act)) {
          st.actionsMigradas++;
          if (tinha) st.comAtaquesExtras++;
        }
      }
    }

    // 2c) actions para os "Special Attack: X" que vieram vazios. A mecanica sai
    // do parentese do nome (vem do statblock) e da descricao do feat irmao.
    const featsDoAtor = a.items.filter((i) => i.type === "feat");
    for (const atk of a.items) {
      if (atk.type !== "attack" || (atk.system?.actions ?? []).length) continue;
      st.placeholders++;
      const base = (atk.name ?? "").replace(/^Special Attack:\s*/i, "").replace(/\s*\(.*\)\s*$/, "").trim();
      const irmao = featsDoAtor.find((ft) => (ft.name ?? "").toLowerCase() === base.toLowerCase());
      const feito = montaAcao(a, atk, irmao);
      if (!feito) { st.placeholdersSemMecanica++; continue; }

      atk.system ??= {};
      atk.system.actions = [feito.action];
      if (feito.descricaoItem) { atk.system.description = { value: feito.descricaoItem }; st.descricoesTrocadas++; }
      atk.flags = { ...(atk.flags ?? {}), "pf1-bestiary": { ...(atk.flags?.["pf1-bestiary"] ?? {}), generatedAction: true } };

      st.acoesGeradas++;
      if (feito.action.save) st.acoesComSave++;
      if (feito.action.damage?.parts?.length) st.acoesComDano++;
      if (feito.action.measureTemplate) st.acoesComArea++;
      csvLinhas.push(feito.linhaCsv.map(csvEscapa).join(","));
    }

    // 3) armas
    const jaTem = new Set(a.items.filter((i) => i.type === "weapon").map((i) => (i.name ?? "").toLowerCase()));
    const novas = [];
    for (const atk of a.items.filter((i) => i.type === "attack" && i.system?.subType === "weapon")) {
      const nome = (atk.name ?? "").toLowerCase();
      if (jaTem.has(nome)) { st.armasDuplicadas++; continue; }
      const cls = classifica(atk.name);
      if (cls.tipo === "nao-arma") { st.armasDescartadas++; continue; }
      jaTem.add(nome);
      novas.push(criaArma(atk, cls));
    }
    if (novas.length) { a.items.push(...novas); st.atoresQueGanharamArma++; }

    assignKeys(a, "actors");
    fs.writeFileSync(path.join(tmpDir, `${a.name ? `${safeName(a.name)}_${a._id}` : a._id}.json`), JSON.stringify(a, null, 2), "utf8");
  }

  await compilePack(tmpDir, outDir, { log: false });
  console.log(`${packName.padEnd(14)} ${String(docs.size).padStart(4)} atores -> ok`);
}

const CSV_SAIDA = process.argv[5];
if (CSV_SAIDA) {
  fs.writeFileSync(CSV_SAIDA, "﻿" + csvLinhas.join("\r\n"), "utf8"); // BOM: Excel pt-BR
  console.log(`\nrelatorio: ${CSV_SAIDA} (${csvLinhas.length - 1} linhas)`);
}

console.log("\n=== RESUMO ===");
for (const [k, v] of Object.entries(st)) console.log(`  ${k.padEnd(26)} ${v}`);
if (Object.keys(naoReconhecidas).length) {
  console.log("\n!!! FORMULAS NAO RECONHECIDAS:");
  for (const [f, n] of Object.entries(naoReconhecidas)) console.log(`  ${n}x  ${f}`);
} else console.log("\nNenhuma formula suspeita ficou para tras.");
