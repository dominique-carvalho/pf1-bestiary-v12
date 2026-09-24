/**
 * Converte o formato antigo de ataques extras (attackParts / formulaicAttacks)
 * para extraAttacks, que e o que o pf1 11.x le.
 *
 * Sem isso o data model descarta attackParts ao carregar e deixa extraAttacks
 * vazio: todo multiataque colapsa para um unico ataque (o Dragao Vermelho rola
 * 1 garra em vez de 2, a Marilith 1 longsword em vez de 5).
 *
 * Reimplementacao fiel de _migrateActionExtraAttacks do pf1 11.11 (pf1.js).
 * Transformacao pura de dado: nao mexe em schema de core, vale igual no v12 e v13.
 */

const COUNT_PADRAO = "min(3, ceil(@attributes.bab.total / 5) - 1)";
const BONUS_PADRAO = "@formulaicAttack * -5";

const vazio = (o) => !o || Object.keys(o).length === 0;

/** Muta a action no lugar. @returns true se mudou algo. */
export function migraAtaquesExtras(act) {
  const tinhaAp = act.attackParts !== undefined;
  const tinhaFa = act.formulaicAttacks !== undefined;
  if (!tinhaAp && !tinhaFa) return false;

  if (act.attackParts?.length) {
    const t = act.attackParts;
    if (t.some((x) => Array.isArray(x)))
      act.attackParts = t.map((x) => (Array.isArray(x) ? { formula: x[0], name: x[1] } : x));
    for (const p of act.attackParts) p.formula = String(p.formula);
  }

  act.extraAttacks ??= {};

  if (act.attackParts !== undefined) {
    act.extraAttacks.manual = act.attackParts ?? [];
    delete act.attackParts;
  }
  if (act.formulaicAttacks !== undefined) {
    act.extraAttacks.formula ??= {};
    act.extraAttacks.formula.count = act.formulaicAttacks?.count?.formula || "";
    act.extraAttacks.formula.bonus = act.formulaicAttacks?.bonus?.formula || "";
    act.extraAttacks.formula.label = act.formulaicAttacks?.label || "";
    delete act.formulaicAttacks;
  }

  if (!act.extraAttacks.type) {
    if (act.extraAttacks.formula?.count === COUNT_PADRAO && act.extraAttacks.formula?.bonus === BONUS_PADRAO) {
      act.extraAttacks.type = "standard";
      delete act.extraAttacks.formula.count;
      delete act.extraAttacks.formula.bonus;
      delete act.extraAttacks.formula.label;
      if (act.extraAttacks.manual?.length) act.extraAttacks.type = "advanced";
      else delete act.extraAttacks.manual;
    } else if (act.extraAttacks.formula?.count?.length || act.extraAttacks.manual?.length) {
      act.extraAttacks.type = "custom";
    }
  }

  if (!act.extraAttacks.formula?.count) delete act.extraAttacks.formula?.count;
  if (!act.extraAttacks.formula?.bonus) delete act.extraAttacks.formula?.bonus;
  if (!act.extraAttacks.formula?.label) delete act.extraAttacks.formula?.label;
  if (!(act.extraAttacks.manual?.length > 0)) delete act.extraAttacks.manual;
  if (vazio(act.extraAttacks.formula)) delete act.extraAttacks.formula;

  return true;
}
