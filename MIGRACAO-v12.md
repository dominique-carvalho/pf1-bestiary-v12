# pf1-bestiary — rebuild para Foundry VTT v12+

## Como instalar

Este módulo **não** está publicado em lugar nenhum — instale extraindo o zip.

1. **Feche o Foundry por completo** (encerre o aplicativo, não basta sair do
   mundo). Os packs são LevelDB e o Foundry mantém lock nos arquivos enquanto
   está rodando; copiar por cima com ele aberto falha pela metade.
2. Se já existir um `pf1-bestiary` instalado, **apague a pasta inteira** antes.
   Não misture: a versão antiga usa `.db` (NeDB) e esta usa diretórios, e os
   dois juntos confundem o carregador.
3. Extraia o zip dentro da pasta `Data/modules` do seu Foundry, de forma a
   ficar `Data/modules/pf1-bestiary/module.json`.
   - O caminho do `Data` aparece na tela de configuração do Foundry como
     *User Data Path*. No Windows costuma ser `%localappdata%\FoundryVTT\Data`.
4. Abra o Foundry, entre no mundo e habilite o módulo em *Manage Modules*.
5. Opcionalmente, rode a migração do pf1 — a partir da 0.4.0 ela **não é mais
   necessária** para o multiataque; veja "Depois de instalar".

Se for editar o `module.json` no Windows, cuidado: `Set-Content -Encoding utf8`
no PowerShell 5.1 grava **UTF-8 com BOM**, e o Foundry passa a ignorar o módulo
inteiro sem dar erro nenhum no log — ele simplesmente some da lista.


O projeto original (https://gitlab.com/foundryvtt_pathfinder1e/pf1-bestiary) está
**arquivado e read-only** desde julho de 2023, na versão 0.1.6, e não tem forks.
Ele foi feito para Foundry v10 / sistema pf1 9.0.

Este rebuild (0.4.0) converte o formato dos packs, corrige o manifest, conserta
quatro defeitos de conteúdo (fórmulas, armadura natural, barras de vida, armas)
e reconstrói as habilidades especiais com save, dano e área.
O multiataque, que antes exigia rodar a migração do pf1, agora já vem convertido —
veja "Depois de instalar".

## O que mudou

**Packs NeDB → LevelDB.** O Foundry removeu o suporte a NeDB no v12; os oito
`packs/bestiary-XX.db` viraram diretórios LevelDB `packs/bestiary-XX/`.
Conversão feita com `compilePack()` do `@foundryvtt/foundryvtt-cli`.

> Nota: o `extractPack()` do CLI não foi usado. Na versão 2.0.x ele chama
> `extractClassicLevel()` mesmo com `nedb: true` (falta um `else` em
> `lib/package.mjs`), o que quebra em arquivos `.db`. A leitura do NeDB e a
> atribuição recursiva de `_key` foram reimplementadas com a mesma semântica.

**Manifest.**

| Campo | Antes (0.1.6) | Agora (0.2.0) |
|---|---|---|
| `compatibility` | `minimum: "10", verified: "10"` | `minimum: "12", verified: "13"` |
| `packs[].path` | `packs/bestiary-00.db` | `packs/bestiary-00` |
| `packs[].private` | `false` | removido → `ownership` |
| `relationships.systems[].compatibility` | `{}` | `{ minimum: "10.0" }` |
| `manifest` / `download` | apontavam para o GitLab arquivado | removidos (sem update check) |
| `packFolders` | — | os 8 packs agrupados em "PF1 Bestiary" |

## Correções de conteúdo

**1.060 fórmulas de `change` reescritas.** O parser de rolagem atual não aceita
ternário (`?:`), comparação (`>`, `<`, `>=`) nem `&&`. Eram 24 fórmulas distintas
em 29 itens, afetando **582 monstros (19,3%)**, que falhavam silenciosamente com
`Failed to apply ItemChange`. Isso é regressão do próprio sistema pf1 (o parser
antigo aceitava ternário), não da conversão de formato.

| Antes | Depois | Ocorrências |
|---|---|---|
| `@skills.XXX.rank>=10?4:2` | `ifelse(gte(@skills.XXX.rank, 10), 4, 2)` | 806 |
| `@size < 4 ? 10 : @size < 5 ? 20 : …` | `lookup(@size + 1, 0, 10,10,10,10,20,30,40,60,80)` | 191 |
| `@abilities.dex.mod > @abilities.str.mod ? (…) : 0` | `max(0, @abilities.dex.mod - @abilities.str.mod)` | 58 |
| `@shield.type > 0 ? 1 : 0` | `ifelse(gt(@shield.type, 0), 1, 0)` | 3 |
| `(@armor.type < 2 && @…level < 1) ? 5 : 0` | `ifelse(lt(@armor.type, 2) * lt(@…level, 1), 5, 0)` | 2 |

Itens afetados: Alertness (470), Construct por tamanho (191, valia **10 a 80 PV**),
Deceitful, Stealthy, Persuasive, Agile Maneuvers, Self-Sufficient, Acrobatic,
Deft Hands, Animal Affinity, Athletic, Shield Focus, Fleet, Magical Aptitude.

Aproveitando, 32 fórmulas usavam `@skills.hea.ranks` / `@skills.sur.ranks` (plural).
O campo correto é `.rank` — do jeito antigo resolvia para 0 e dava sempre +2.
E 2 changes do Equine Bone Golem tinham `formula: NaN` nos atributos Con e Int
(golem não tem esses atributos, o sbc gravou NaN em vez de omitir): removidos,
já que uma fórmula NaN nunca avalia, só polui o console.

**Armadura natural aplicada (2.450 atores).** O sbc gravou
`system.attributes.naturalAC` como **texto** (`"+3"`) em vez de número. Isso
funciona enquanto o ator fica no compêndio, mas a ficha do pf1 mostra esse campo
num input numérico, que não segura o `+`: no primeiro save da ficha o valor vira
`null` e o bônus **some silenciosamente**.

Efeito prático, medido no Maftet:

| Situação | `naturalAC` | CA |
|---|---|---|
| No compêndio | `"+3"` | 20 ✓ |
| Recém-importado para o mundo | `"+3"` | 20 ✓ |
| Depois que a ficha salva | `null` | **17** ✗ |

Ou seja: quebrava exatamente quando o monstro passava a ser usado de verdade.
Convertido para número nos 3.023 atores (2.450 tinham bônus, de +1 a +20; os
outros 573 já eram `0`). Conferido contra o SRD: Maftet 20/13/17,
Ogre 17/8/17, Bugbear 17/11/16, Iron Golem 28/8/28, Adult Red Dragon 29/8/29,
Ghoul 14/12/12, Gnoll 16/10/16 — todos exatos.

Nenhuma migração do pf1 corrige isso: `naturalAC` aparece uma única vez em todo
o `pf1.js`, no trecho que lê o campo. Tinha que ser corrigido no dado.

**Multiataque convertido (2.566 actions).** Os ataques múltiplos e iterativos
estavam no campo antigo `attackParts`, que o data model atual **descarta ao
carregar**, deixando `extraAttacks` vazio. Resultado: todo multiataque colapsava
para um ataque só.

| Monstro | Deveria | Carregava |
|---|---|---|
| Adult Red Dragon — Claws | 2 garras | 1 |
| Marilith — +1 Longswords | 5 | 1 |
| Marilith — +1 Longsword | +24/+19/+14/+9 | 1 |
| Hill Giant — Greatclub | +14/+5 | 1 |
| Ettin — Flails | 2 maguais +12/+5 | 1 |

A migração oficial do pf1 resolve isso, mas exigia rodar o Troubleshooter após
cada instalação ou atualização — o passo mais fácil de esquecer. A conversão foi
aplicada direto no dado, reimplementando fielmente `_migrateActionExtraAttacks`
do `pf1.js`:

```
attackParts: [[-5,"Iterative Attack with -5"], ["0","Claws: 1"]]
  ->  extraAttacks: { type:"custom", manual: [
        { formula:"-5", name:"Iterative Attack with -5" },
        { formula:"0",  name:"Claws: 1" } ] }
```

É transformação pura de dado, sem implicação de schema de core: vale igual no
v12 e no v13. Das 29.341 actions do bestiário, 2.566 tinham ataques extras.
Nenhum `attackParts` sobrou.

**2.881 habilidades especiais reconstruídas.** Os itens "Special Attack: X" vinham
sem nenhuma action — só um texto genérico do sbc dizendo que eram placeholder. Na
prática, toda arma de sopro, baforada e efeito de área precisava ser montada à mão
com save, dano e template.

A mecânica estava no ator, em dois lugares:

1. o parêntese do próprio nome, que vem direto do statblock —
   `Breath Weapon (20-ft. Cone, 1d10 Fire, Reflex DC 12 Half)`;
2. a descrição do **feat irmão** de mesmo nome, que traz o texto completo da
   habilidade.

Exemplo, o Desert Drake:

| | |
|---|---|
| Antes | `Special Attack: Sandstorm Breath` — sem action, descrição de placeholder |
| Depois | tipo *save*, Reflexos CD 19 (metade), 3d6 cortante + 4d8 eletricidade, esfera de 15 pés, alcance 60 pés |

Cobertura: dos 5.590 placeholders, **2.881 viraram action** — 2.241 com save,
1.267 com dano, 601 com área. Em 1.663 casos a descrição inútil do placeholder
foi trocada pelo texto real da habilidade. Os ~2.700 restantes não têm mecânica
extraível e em boa parte nem precisam (Rend, Pounce, Rage, Sneak Attack,
Favored Enemy, Grab — passivas ou modificadores de outro ataque).

Decisões que valem saber:

- A CD é o **valor literal do statblock** (`"19"`), não a fórmula derivada
  `10 + HD/2 + mod` que o pf1 usa nos exemplos dele. Assim bate sempre com o
  livro; quem quiser escalonamento troca na action.
- Quando o texto traz só "DC 13" sem dizer o tipo, o tipo é **inferido pelo nome**
  (Web e Explode → Reflexos, Paralysis e Distraction → Fortitude, Curse e Fear →
  Vontade). Foram 516 casos, e a action avisa disso nas notas. Outros 434 ficaram
  com o tipo **em branco** de propósito, para você escolher, em vez de eu chutar.
- **Veneno e doença ficam só com o save**, sem dano: no PF1 é dano de atributo ao
  longo do tempo, com regra própria, e o dado solto no texto costuma ser outra coisa.
- Dano de atributo ("1d2 Constitution") vai para as *notas de efeito*, não para o
  dano, para não ser aplicado como dano em pontos de vida por engano.
- Os tipos de dano são mapeados para os ids registrados em
  `pf1.registry.damageTypes` — o statblock escreve "electricity", mas o id é
  `electric`. Tipo não registrado (plasma, holy) vira sem tipo em vez de virar
  rótulo solto que não casa com resistência a energia.

**Cada action gerada carrega, na descrição, o trecho exato do texto de onde os
números saíram**, e o item leva `flags["pf1-bestiary"].generatedAction = true`.
Um erro de leitura fica visível de imediato em vez de silencioso, e dá para
localizar ou remover tudo em massa. O arquivo `habilidades-geradas.csv` lista as
2.881 com origem, save, CD, dano e área.

**1.201 armas geradas no inventário.** Os NPCs não soltavam arma ao morrer porque
as armas não existiam: o sbc criou só o item `attack` (o ataque rolável), nunca o
item `weapon`. De 1.401 atores com ataque de subtipo `weapon`, apenas 240 tinham
algum item de arma, e nenhum dos 2.161 ataques tinha link para inventário.

Os 2.161 ataques foram classificados assim:

| Classe | Ocorrências | O que virou |
|---|---|---|
| Casa com `weapons-and-ammo` do pf1 | 1.249 (57,8%) | cópia do item real — preço, peso, categoria, grupo, material |
| Parece arma mas não casa | 285 (13,2%) | item genérico com o nome e o dano do próprio ataque |
| Não é arma | 627 (29,0%) | descartado (Rock, Swarm, Hooves, Tongue, Touch, `undefined`…) |

O casamento usa o **sufixo mais longo** do nome que exista no compêndio, o que
derruba prefixos mágicos sem precisar listar todos: `+1 Vicious Dire Flail` →
`Dire Flail`, `+2 Seeking Composite Longbow` → `Composite Longbow`,
`Short Sword` → `Shortsword`, `Mwk Underwater Heavy Crossbow` → `Heavy Crossbow`.
O nome original é preservado no item; `+N` vira `system.enh` e `Mwk` vira
`system.masterwork`. A quantidade sai da nota do statblock quando ela começa com
um número ("2 javelins" → quantidade 2), em 58 casos.

Resultado: **1.201 itens** (928 do compêndio, 273 genéricos) em **930 atores**.
333 foram pulados por duplicidade de nome no mesmo ator.

Os ataques originais **não** foram alterados nem linkados às armas novas — assim
o ataque continua rolando igual e saquear a arma não apaga o ataque. Todo item
gerado leva `flags["pf1-bestiary"].generated = true`, então dá para localizá-los
ou removê-los em massa depois.

Itens sem dano entre os gerados são corretos: `Net` e `Lasso` são exóticas que
enredam em vez de causar dano, e `Crossbow Bolt` é `loot`/`ammo` no pf1.

**Barras de vida nos tokens.** Os 3.023 `prototypeToken` tinham
`bar1.attribute: null` *explícito*. O fallback do sistema (`attributes.hp`) só vale
quando o campo está ausente — ver `common/documents/token.mjs:90` —, então nenhum
token mostrava HP. Agora todos apontam para `attributes.hp`.

## Integridade verificada

Comparação registro a registro entre os `.db` de origem e os LevelDB gerados:

- **3.023 atores**, **77.387 itens embutidos**, **72 active effects** — 0 divergências
- 0 referências embutidas penduradas, 0 registros perdidos, 0 linhas inválidas
- Os 411 caminhos de arte distintos resolvem: 398 em `systems/pf1/...` (ainda
  existem no pf1 11.11) e 13 em `icons/...` do core
- Carregados no Foundry 13.351 com pf1 11.11: os 8 packs registram, **0 atores
  inválidos e 0 itens inválidos**, fichas renderizam, e o Goblin bate com o
  statblock oficial (AC 16/13/14, hp 6, Fort +3 / Ref +2 / Von −1, Init +6, CMD 12)
- Com as correções aplicadas, um pack inteiro (468 atores) carrega com
  **0 erros no console** — nenhum `Failed to apply ItemChange`, nenhum
  `Unresolved StringTerm`. Valores conferidos na preparação do ator:
  Alertness com 8 graduações → +2 e com 15 → +4; construto Grande →
  +30 PV; Agile Maneuvers com Des +7 / For +0 → +7 no CMB.
  O idiom `lookup(@size + 1, …)` é o mesmo que o próprio pf1 usa nos seus
  modificadores de tamanho para Furtividade e Voo.

## Depois de instalar

Os documentos ainda estão no schema antigo (`_stats`: `coreVersion 10.303`,
`systemVersion 9.0`). **A migração deve ser feita na versão do Foundry em que os
packs vão ser usados** — o Foundry não suporta downgrade de dados, então migrar no
v13 e depois abrir no v12 pode quebrar. O v12 também guarda mais shims de
compatibilidade com dados v10 do que o v13.

No Foundry de destino, com o módulo habilitado no mundo:

1. Configurações → Sistema Pathfinder 1e → **Troubleshooter**
2. **Migrate Module Packs** (com a opção de unlock ligada)

Equivalente pelo console:

```js
await pf1.migrations.migrateModules({ unlock: true, server: true, fast: false });
```

Faça backup da pasta `modules/pf1-bestiary` antes — a migração reescreve os packs
no lugar.

### Sobre o multiataque (já resolvido nesta versão)

Nas versões anteriores era preciso rodar a migração para o multiataque funcionar.
**A partir da 0.4.0 não é mais**: a conversão de `attackParts` para `extraAttacks`
já foi aplicada no dado (ver seção acima). O Dragão Vermelho já rola 2 garras e a
Marilith 5 longswords sem nenhum passo extra.

A migração do pf1 resolve. Verificado chamando
`pf1.migrations.migrateItemActionData()` sobre o formato cru:

```
attackParts: [[-5,"Iterative Attack with -5"], ["0","Claws: 1"]]
  ->  extraAttacks: { type: "custom", manual: [
        { formula: "-5", name: "Iterative Attack with -5" },
        { formula: "0",  name: "Claws: 1" } ] }
```

Por isso a conversão de `attackParts` **não** foi feita neste rebuild: a migração
oficial faz isso e mais uma dezena de normalizações que não valeria reimplementar.

## Pendências conhecidas

**Sentidos.** Em 100% dos atores os sentidos estão só em texto livre
(`traits.senses.custom`), com os campos nativos zerados, `sight.range` 0 e
`detectionModes` vazio — nenhum token enxerga no escuro. 96% do texto é parseável
(darkvision 2.132, low-light 1.441, faro 539, tremorsense 219, blindsight 181…).

**Tamanho de token.** Essencialmente correto: Grande ou maior, 1.303/1.329 (98%).
Das 108 divergências, 69 são swarms (2x2 é o certo) e a maioria do resto são
"Troop" (4x4, também correto). Sobram ~10 erros reais.
