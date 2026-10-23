# git-graph

Mod per Claude Code che mostra, in un pannello accanto alla chat, il grafico git del repository della cartella corrente.

- Stile futuristico: corsie al neon, nodi esagonali, sfondo antracite (`#12161F`).
- Geometria bilanciata: corsia ogni 24 px, riga ogni 40 px, curve identiche.
- Virtual scroll: disegna solo le righe visibili. Carica 100 commit, poi +50 automaticamente vicino alla fine (tetto 2.000).
- Aggiornamento automatico (polling ogni 4 s e dopo i comandi `git` eseguiti da Claude), più il pulsante "Aggiorna".
- Nel terminale CLI ricade su una versione testuale.

## Banda sopra il prompt

Una riga compatta, sempre visibile anche quando il pannello è in un altro tab:

| Voce | Significato |
|---|---|
| Badge del branch | branch corrente, nel colore della sua corsia |
| `↑n ↓n` | commit da pushare / da scaricare rispetto all'upstream; `—` se non c'è upstream |
| ⬡ hash, messaggio, età | il commit di HEAD; se sei indietro, al loro posto "N commit da scaricare" |
| `● nΔ` | file in `git status`: verde se pulito, ambra se ci sono modifiche |
| ✕ | nasconde la banda; `/gitgraph` la fa ricomparire |

## Installazione

Dal prompt di una sessione Claude Code nel terminale:

```
/plugin install git-graph --marketplace federicoxella-space/git-graph
```

Da shell:

```bash
claude plugin install git-graph --marketplace federicoxella-space/git-graph
```

Nell'app desktop: + accanto al prompt → Plugins → Add marketplace con `federicoxella-space/git-graph`, poi Add plugin.

## Comando

```
/gitgraph [--branch] [--first-parent] [--since 2w]
```

## Sviluppo

```bash
claude plugin validate .
claude plugin test .
```
