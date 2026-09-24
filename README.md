# PF1 Bestiary — rebuild para Foundry VTT v12 e v13

Os 3.023 monstros dos Bestiários 1 a 6 de Pathfinder 1ª edição, funcionando no
Foundry VTT 12 e 13.

Este é um rebuild do módulo [pf1-bestiary](https://gitlab.com/foundryvtt_pathfinder1e/pf1-bestiary)
de **Noon**, que está arquivado e read-only desde julho de 2023, na versão 0.1.6,
feito para Foundry v10 e sistema pf1 9.0. Ele não carrega mais: o Foundry removeu
o suporte a NeDB no v12.

## Instalação

No Foundry: **Add-on Modules → Install Module**, e cole no campo *Manifest URL*:

```
https://github.com/dominique-carvalho/pf1-bestiary-v12/releases/latest/download/module.json
```

Depois habilite o módulo no seu mundo de Pathfinder 1e. Não precisa rodar migração.

Quem preferir instalar pelo arquivo pode baixar o zip em
[Releases](https://github.com/dominique-carvalho/pf1-bestiary-v12/releases) e
extrair em `Data/modules`. Há um guia passo a passo para quem não tem familiaridade
com o Foundry em [`GUIA-INSTALACAO.html`](GUIA-INSTALACAO.html).

## O que foi corrigido

Além da conversão de formato, o conteúdo tinha defeitos que obrigavam a arrumar
monstro a monstro na mão:

| | |
|---|---|
| **Packs NeDB → LevelDB** | os 8 `.db` viraram diretórios; sem isso nada carrega no v12+ |
| **1.060 fórmulas de change** | usavam ternário e comparação, que o parser atual rejeita; 582 monstros perdiam bônus silenciosamente (Alertness, construtos, Agile Maneuvers…) |
| **Armadura natural em 2.450 atores** | gravada como texto `"+3"`; virava `null` no primeiro save da ficha e a CA ficava errada |
| **Multiataque em 2.566 actions** | no campo antigo `attackParts`, descartado ao carregar: todo multiataque colapsava para um ataque só |
| **2.881 habilidades especiais** | eram placeholders vazios; reconstruídas com resistência, CD, dano e área a partir do statblock |
| **1.201 armas no inventário** | os NPCs não tinham o que soltar ao morrer, só o ataque rolável |
| **Barras de vida em 3.023 tokens** | `bar1` vinha `null` explícito, sem fallback |

Cada correção está detalhada, com números e método, em
[`MIGRACAO-v12.md`](MIGRACAO-v12.md).

## Conferindo o que foi gerado

O que foi reconstruído por leitura de texto carrega o rastro da origem:

- Toda action gerada traz, na descrição, **o trecho do statblock de onde os
  números saíram**.
- Todo item gerado leva `flags["pf1-bestiary"].generated` ou `.generatedAction`,
  então dá para localizar ou remover em massa.
- A planilha [`habilidades-geradas.csv`](https://github.com/dominique-carvalho/pf1-bestiary-v12/releases/latest)
  lista as 2.881 habilidades com resistência, CD, dano, área e texto de origem.
  A coluna `origem_do_save` diz se o tipo de resistência estava escrito no texto
  ou foi inferido pelo nome da habilidade.

São 2.881 leituras de texto livre em inglês, vindas de seis livros. Os casos
testados batem, mas vai haver leitura errada na cauda longa — daí o rastro.

## Como foi feito

Os scripts em [`tools/`](tools/) reproduzem o build inteiro a partir dos `.db`
originais. Em resumo: lê os NeDB, aplica as correções, grava LevelDB com
`compilePack()` do `@foundryvtt/foundryvtt-cli`, e confere registro a registro
contra a origem.

```
tools/fix2.mjs        pipeline principal, uma passada sobre os .db
tools/extrair.mjs     extrai save, dano, area e alcance do texto do statblock
tools/acoes.mjs       monta as actions das habilidades especiais
tools/multiataque.mjs attackParts -> extraAttacks
tools/classify.mjs    casa nomes de arma com o compendio do pf1
tools/verify3.mjs     verificacao de integridade
make-zip.ps1          empacota (nao use Compress-Archive, ver comentario no script)
```

## Licença e créditos

Módulo original de **Noon** (`@justnoon`), sob **GPLv3** — ver [`LICENSE.txt`](LICENSE.txt).
Este rebuild mantém a mesma licença e a autoria original, e documenta todas as
alterações conforme a GPLv3 exige.

Conteúdo de Pathfinder pertence à **Paizo Inc.**, usado sob a Open Game License —
ver [`OGL.txt`](OGL.txt). Este projeto não é afiliado nem endossado pela Paizo.

Não está listado no registro oficial de pacotes do Foundry: o id `pf1-bestiary`
é do projeto do Noon, e publicá-lo lá colidiria com o original.
