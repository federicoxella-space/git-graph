# git-graph

Mod per Claude Code che mostra, in un pannello accanto alla chat, il grafico git del repository della cartella corrente.

- Stile futuristico: corsie al neon, nodi esagonali, sfondo antracite (`#12161F`).
- Geometria bilanciata: corsia ogni 24 px, riga ogni 40 px, curve identiche.
- Virtual scroll: disegna solo le righe visibili. Carica 100 commit, poi +50 automaticamente vicino alla fine (tetto 2.000).
- Aggiornamento automatico (polling ogni 4 s e dopo i comandi `git` eseguiti da Claude), più il pulsante "Aggiorna".
- Nel terminale CLI ricade su una versione testuale.

## Comando

```
/gitgraph [--branch] [--first-parent] [--since 2w]
```

## Sviluppo

```bash
claude plugin validate .
claude plugin test .
```
