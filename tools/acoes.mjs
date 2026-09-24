/**
 * Monta actions para os itens "Special Attack: X" que vieram sem nenhuma,
 * a partir da mecanica extraida do statblock (ver extrair.mjs).
 *
 * A forma segue a action canonica do compendio monster-abilities do pf1:
 *   { actionType:"save", activation, area, damage, duration, measureTemplate, name, save }
 */
import { extrai, limpaHtml } from "./extrair.mjs";

const PLACEHOLDER = /sbc \| Placeholder/i;

// Veneno/doenca no PF1 causam dano de atributo ao longo do tempo, com regra
// propria. O dado solto no texto raramente e dano direto, entao so o save.
const SO_SAVE = /^(poison|disease|filth fever)/i;

// Rotulo legivel da area, no mesmo estilo do compendio do pf1 ("60-ft. cone").
const NOME_FORMA = { cone: "cone", circle: "radius", ray: "line", rect: "square" };

/**
 * O statblock escreve "electricity", mas o id registrado em pf1.registry.damageTypes
 * e "electric". Tipo nao registrado nao casa com resistencia a energia, entao o
 * que nao tem equivalente vira sem tipo em vez de virar um rotulo solto.
 */
const TIPO_PF1 = {
  acid: "acid", cold: "cold", fire: "fire", sonic: "sonic", force: "force",
  electricity: "electric", electric: "electric",
  negative: "negative", positive: "positive",
  bludgeoning: "bludgeoning", piercing: "piercing", slashing: "slashing",
  untyped: "untyped", precision: "precision", nonlethal: "nonlethal",
  // plasma / divine / holy / unholy nao existem no registro do pf1
};
const mapeiaTipos = (tipos) => (tipos ?? []).map((t) => TIPO_PF1[t]).filter(Boolean);

const CH = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const novoId = () => Array.from({ length: 16 }, () => CH[(Math.random() * CH.length) | 0]).join("");

/** Frase do texto de onde os numeros sairam, para o GM conferir de relance. */
function trechoOrigem(nomeItem, desc) {
  const paren = /\(([^)]*)\)\s*$/.exec(String(nomeItem || ""));
  if (paren) return paren[1];
  if (!desc) return "";
  const frases = desc.split(/(?<=[.;])\s+/);
  const boa = frases.find((f) => /\bDC\s*\d+/i.test(f) && /\d+d\d+/.test(f))
    ?? frases.find((f) => /\bDC\s*\d+/i.test(f))
    ?? frases.find((f) => /\d+d\d+/.test(f));
  return (boa ?? frases[0] ?? "").trim().slice(0, 300);
}

/**
 * @returns {null | {action, descricaoItem, linhaCsv}}
 */
export function montaAcao(ator, atk, featIrmao) {
  if (atk.type !== "attack") return null;
  if ((atk.system?.actions ?? []).length) return null;

  let descFeat = featIrmao ? limpaHtml(featIrmao.system?.description?.value) : "";
  if (PLACEHOLDER.test(descFeat)) descFeat = "";

  const r = extrai(atk.name, descFeat);
  if (!r.temAlgo) return null;

  const soSave = SO_SAVE.test(r.base);
  const danoHp = [], danoAtributo = [];
  if (!soSave) {
    for (const d of r.dano) (d.atributo ? danoAtributo : danoHp).push(d);
  }
  if (!r.save && !danoHp.length && !r.area) return null;

  const origem = trechoOrigem(atk.name, descFeat);

  const action = {
    _id: novoId(),
    name: "Usar",
    actionType: r.save ? "save" : "other",
    activation: { type: "standard", unchained: { cost: 2, type: "action" } },
    duration: { units: "inst" },
    damage: { parts: danoHp.map((d) => ({ formula: d.formula, types: mapeiaTipos(d.tipos) })) },
  };

  if (r.save) {
    action.save = {
      dc: String(r.save.dc),                 // valor literal do statblock
      type: r.save.tipo ?? "",               // vazio quando o texto nao diz qual
      description: r.save.description || "",
      harmless: false,
    };
  }
  if (r.area) {
    action.measureTemplate = { type: r.area.type, size: r.area.size };
    action.area = `${r.area.size}-ft. ${NOME_FORMA[r.area.type] ?? r.area.type}`;
  }
  if (r.alcance) action.range = r.alcance;

  const notas = [];
  if (danoAtributo.length)
    notas.push(danoAtributo.map((d) => `${d.formula} de dano em ${d.atributo}`).join("; "));
  if (r.save && !r.save.tipo)
    notas.push(`CD ${r.save.dc} — o statblock não diz o tipo de resistência; escolha na action.`);
  if (r.save?.inferido)
    notas.push(`Tipo de resistência (${r.save.description}) inferido pelo nome da habilidade, não estava escrito.`);
  if (soSave && r.dano.length)
    notas.push(`Dano não preenchido de propósito: veneno/doença no PF1 usa dano de atributo com regra própria. Texto original: "${origem}"`);
  if (notas.length) action.effectNotes = notas;

  action.description = origem
    ? `<p><em>Action gerada automaticamente a partir do statblock. Trecho de origem:</em></p><blockquote>${origem}</blockquote>`
    : "<p><em>Action gerada automaticamente a partir do statblock.</em></p>";

  // Descricao do item: troca o texto inutil do placeholder pela descricao real.
  let descricaoItem = null;
  const atual = limpaHtml(atk.system?.description?.value);
  if ((!atual || PLACEHOLDER.test(atual)) && descFeat) {
    descricaoItem = `<p>${descFeat}</p>`;
  }

  const csv = [
    ator.name, r.base,
    r.save?.tipo ?? "", r.save?.dc ?? "", r.save?.inferido ? "inferido" : (r.save ? "explicito" : ""),
    danoHp.map((d) => d.formula + (d.tipos[0] ? ` ${d.tipos[0]}` : "")).join(" + "),
    danoAtributo.map((d) => `${d.formula} ${d.atributo}`).join(" + "),
    r.area ? `${r.area.type} ${r.area.size}ft` : "",
    r.alcance ? `${r.alcance.value}ft` : "",
    origem,
  ];

  return { action, descricaoItem, linhaCsv: csv };
}

export const CSV_CABECALHO = [
  "monstro", "habilidade", "save", "cd", "origem_do_save",
  "dano", "dano_atributo", "area", "alcance", "texto_de_origem",
];

export const csvEscapa = (v) => {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
