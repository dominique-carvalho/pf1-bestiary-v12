# Scripts de build

Requerem Node 20+ e `@foundryvtt/foundryvtt-cli`:

    npm install @foundryvtt/foundryvtt-cli

`fix2.mjs` e o pipeline principal. Ele le os `.db` NeDB originais (do clone do
projeto arquivado no GitLab) e grava os packs LevelDB corrigidos:

    node fix2.mjs <packs-origem> <packs-saida> <dir-temp> [relatorio.csv]

Duas variaveis de ambiente opcionais apontam para copias dos compendios do pf1,
usadas para casar nomes de arma e servir de molde:

    PF1_WEAPONS=/caminho/para/systems/pf1/packs/weapons-and-ammo

Copie os compendios em vez de ler direto da instalacao: o Foundry mantem lock
nos arquivos LevelDB enquanto esta rodando.

`verify3.mjs` compara o resultado com a origem, registro a registro.
