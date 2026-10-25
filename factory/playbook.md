# Project playbook

## Conventions
- Hooks module in `hooks/register.tsx`; drawing in `hooks/svg.ts` (pure functions returning SVG strings); git parsing and lane layout in `hooks/git.ts`.
- Every `$.state` value is an `atom` declared in `types/index.d.ts` under `git-graph`; add or remove the contract entry together with the atom.
- Code comments in English, plain sentences, JSDoc on exported constants and functions; user-visible text in Italian.
- The desktop draws `Svg` elements; the terminal (`e.surface === 'terminal'` or no `Svg` in `ui`) falls back to `Text` rows: every Pane change keeps both.

## Patterns
- New Pane behaviour: follow the `ui.render` hook on `{ component: 'Pane', requestId: PANE }` in `hooks/register.tsx`.
- Engine events: check the event's input and result in the engine `claude-code.d.ts` before relying on a field.
- To pin a Pane's window on an element, read the offset the engine resolves for `$.ui.scroll({ to: { key } })` from the `ui.scroll` event with origin `plugin`, never a fixed row count: heights in pixels (`Svg`) have no row count known in advance.
- The test kit drops `key` on `Svg` leaves: in tests reach them as children of a keyed `Box` or by position, not with `find({ key })`; the Pane's first `find({ type: 'Svg' })` returns a margin, not the graph.

## Reusable code
- Colors: `branchColor` / `authorColor` in `hooks/git.ts`, `color()` and `PALETTE` in `hooks/svg.ts`.
- Text fitting: `cut()` and `esc()` in `hooks/svg.ts`.

## Don'ts
- An `Svg` `source` must stay under 131072 characters.
- Do not commit `node_modules/` or `.claude-plugin/types/`.

## Definition of Done
- [gate] Build, lint and tests are green.
- [code] Every acceptance criterion has an automated test or a precise manual step.
- [security] No secrets in code or committed configuration.
- [code] Behaviour that only the desktop app shows (scrolling, pixel layout) has a manual check step in the PR description.
- [code] `.claude-plugin/plugin.json` version is bumped when the change must reach installed users.
