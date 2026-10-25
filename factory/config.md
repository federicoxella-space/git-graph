---
base_branch: main
forge: github          # github | gitlab | azure | git
forge_host: ""         # self-hosted only, e.g. gitlab.company.com
azure_org: ""          # Azure DevOps Server only: collection URL
azure_project: ""      # Azure DevOps Server only: project name
build: ""
lint: claude plugin validate .
test: claude plugin test .
ui_review: static      # none | static | browser
dev_server: ""         # browser only, e.g. npm run dev
base_url: ""           # browser only, e.g. http://localhost:5173
max_rounds: 2          # rework rounds after the first review
release: auto          # auto | off — automatic tag + release on every merged PR (github, gitlab)
---
Notes for every agent:

- This repo is a Claude Code mod (plugin): `hooks/register.tsx` is the hooks module, `hooks/svg.ts`
  draws the SVGs, `hooks/git.ts` reads git, `types/index.d.ts` is the `$.state` contract.
- The engine API is typed in the `claude-code.d.ts` that the `plugin-authoring` skill writes when it
  loads; grep it for an event or element name instead of guessing its shape.
- There is no build step and no `tsconfig.json`: `claude plugin validate .` and `claude plugin test .`
  are the gate. The test kit cannot reproduce the desktop's real scrolling (`ui.scroll` with real
  geometry): scrolling behaviour needs a manual check in the desktop app.
- `node_modules/` and `.claude-plugin/types/` are not the project's: do not edit or commit them.
- Versions: the plugin's `version` in `.claude-plugin/plugin.json` is the one users install. The
  automatic release tags (`vX.Y.Z`) come from PR titles and do not change `plugin.json`: keep the
  two aligned by bumping `plugin.json` in the PR when the release should be installable.
- Code comments and identifiers are in English; user-visible text, commit messages and README are
  in Italian.

## Commit rules
Subject in Italian, imperative-free descriptive style as in the history (e.g. "Header e footer
fissi, scroll senza scatti"), no Conventional Commits prefix on commits. PR titles stay in
Conventional Commits format for the release.
