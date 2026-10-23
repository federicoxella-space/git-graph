import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Filters, Graph } from '../types'
import { LOG_FORMAT, age, layout, parseLog } from './git'
import { BAND_H, CELL_W, bandSvg, graphSvg, messageSvg, visibleRows } from './svg'

const PANE = 'git-graph'
const TITLE = 'Git graph'
const FIRST_LOAD = 100
const STEP = 50
const MAX_COMMITS = 2000
/** Loads the next STEP once the window comes this close to the end. */
const PREFETCH = 20
const POLL_MS = 4000
/** Pixels per row of the desktop's code font: the pane is measured in cells. */
const CELL_H = 19
/** Cells kept under the drawing for the refresh button. */
const CONTROLS = 2
/** Pixels kept beside the band for its close button, as the desktop draws it. */
const BAND_BUTTON_W = 32

const graph = atom({ plugin: 'git-graph', key: 'graph' } as const, { kind: 'idle' } as Graph)
const offset = atom({ plugin: 'git-graph', key: 'offset' } as const, 0)
const limit = atom({ plugin: 'git-graph', key: 'limit' } as const, FIRST_LOAD)
const filters = atom({ plugin: 'git-graph', key: 'filters' } as const, {
  branchOnly: false,
  firstParent: false,
  since: null,
} as Filters)
const isLoading = atom({ plugin: 'git-graph', key: 'isLoading' } as const, false)
const isBandHidden = atom({ plugin: 'git-graph', key: 'isBandHidden' } as const, false)

type $ = EngineInterface

/** Module state: a reload starts over, and the first poll rescans. */
let running: Promise<void> | null = null
let again = false
let signature = ''

function load($: $): Promise<void> {
  if (running !== null) {
    again = true

    return running
  }
  running = (async () => {
    do {
      again = false
      await update($, isLoading, () => true)
      try {
        const scanned = await scan($)
        await update($, graph, () => scanned)
      } catch (error) {
        await update($, graph, () => ({ kind: 'error', message: String(error) }) as Graph)
      }
    } while (again)
    await update($, isLoading, () => false)
  })().finally(() => {
    running = null
  })

  return running
}

async function scan($: $): Promise<Graph> {
  const cwd = await $.session.cwd()
  const git = (...args: string[]) => run($, cwd, args)

  const top = await git('rev-parse', '--show-toplevel')
  if (top.exitCode !== 0) return { kind: 'none', cwd }

  const f = await read($, filters)
  const n = await read($, limit)
  const logArgs = [
    'log',
    f.branchOnly ? 'HEAD' : '--all',
    '--topo-order',
    `-n${n + 1}`,
    `--format=${LOG_FORMAT}`,
    ...(f.firstParent ? ['--first-parent'] : []),
    ...(f.since !== null ? [`--since=${f.since}`] : []),
  ]

  const [branch, counts, remotes, refs, log, sig, status] = await Promise.all([
    git('rev-parse', '--abbrev-ref', 'HEAD'),
    git('rev-list', '--left-right', '--count', '@{u}...HEAD'),
    git('remote'),
    git('for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes', 'refs/tags'),
    git(...logArgs),
    git('show-ref', '--head'),
    git('status', '--porcelain'),
  ])
  signature = cwd + sig.stdout + status.stdout

  const remoteNames = remotes.stdout.split(/\r?\n/).filter(r => r.length > 0)
  const refNames = refs.stdout.split(/\r?\n/).filter(r => r.length > 0 && !r.endsWith('/HEAD'))
  const commits = log.exitCode === 0 ? parseLog(log.stdout) : []
  const { rows, lanes } = layout(commits.slice(0, n), remoteNames)
  const [behind, ahead] =
    counts.exitCode === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [undefined, undefined]
  const repo = top.stdout.trim().split(/[\\/]/).pop() ?? cwd

  if (rows.length === 0) {
    return { kind: 'error', message: `${repo}: nessun commit da mostrare` }
  }

  return {
    kind: 'ok',
    repo,
    branch: branch.stdout.trim() || 'HEAD',
    ahead: ahead ?? null,
    behind: behind ?? null,
    rows,
    lanes,
    hasMore: commits.length > n && n < MAX_COMMITS,
    branches: refNames.filter(r => r.startsWith('refs/heads/')).length,
    remotes: remoteNames.length,
    tags: refNames.filter(r => r.startsWith('refs/tags/')).length,
    dirty: status.stdout.split(/\r?\n/).filter(l => l.length > 0).length,
  }
}

async function loadMore($: $): Promise<void> {
  const g = await read($, graph)
  if (g.kind !== 'ok' || !g.hasMore || running !== null) return
  await update($, limit, n => Math.min(MAX_COMMITS, n + STEP))
  await load($)
}

async function poll($: $): Promise<void> {
  if (running !== null) return
  const cwd = await $.session.cwd()
  const [sig, status] = await Promise.all([run($, cwd, ['show-ref', '--head']), run($, cwd, ['status', '--porcelain'])])
  if (cwd + sig.stdout + status.stdout !== signature) await load($)
}

function run($: $, cwd: string, args: string[]) {
  return $.process.run(['git', ...args], { cwd, timeoutMs: 20000 })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'gitgraph',
      description: 'Apre il grafico git della cartella corrente (--branch, --first-parent, --since 2w, --all)',
    })
    void $.ui.open({ id: PANE, title: TITLE })
    void load($)
    $.clock.every(POLL_MS, () => void poll($).catch(() => undefined))

    return started
  })

  on('command.run', { command: 'gitgraph' }, async ($, e) => {
    const f = parseArgs(e.args)
    await update($, filters, () => f)
    await update($, limit, () => FIRST_LOAD)
    await update($, offset, () => 0)
    await update($, isBandHidden, () => false)
    await $.ui.open({ id: PANE, title: TITLE })
    void load($)

    return { text: `Grafico git aperto${describe(f)}.` }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/\bgit\b/.test(e.command)) void load($)

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const g = await read($, graph)
    if (g.kind !== 'ok') return {}

    const visible = visibleFor(e.bodyRows)
    const step =
      Math.abs(e.by) <= 2 ? Math.sign(e.by) * 2 : Math.round((e.by * CELL_H) / 40)
    const max = Math.max(0, g.rows.length - visible)
    const current = Math.min(max, Math.max(0, (await read($, offset)) + step))
    await update($, offset, () => current)

    if (g.hasMore && current + visible >= g.rows.length - PREFETCH) void loadMore($)

    return {}
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const g = await read($, graph)
    if (g.kind !== 'ok' || e.props.hasSurvey || (await read($, isBandHidden))) return next(e)

    const nowSeconds = Math.floor((await $.clock.now()) / 1000)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // The icon is the Button's own label: a desktop draws every Button as its
    // native control, so the icon goes where that control is, not under it.
    const hide = (
      <Button key="band-hide" plain onPress={() => update($, isBandHidden, () => true)}>
        <Text dimColor>✕</Text>
      </Button>
    )

    if (e.surface === 'terminal' || !('Svg' in ui)) {
      return (
        <Box flexDirection="row">
          <Text>{bandText(g, nowSeconds)} </Text>
          {hide}
        </Box>
      )
    }

    const Svg = ui.Svg
    const width = Math.max(320, Math.floor(e.props.bodyColumns * CELL_W) - BAND_BUTTON_W)

    // The row takes the drawing's height; the Button's column stretches to it
    // and centers the Button, so it sits on the band's middle line.
    return (
      <Box flexDirection="row" alignItems="stretch">
        <Svg source={bandSvg(width, g, nowSeconds)} alt={bandText(g, nowSeconds)} width={width} height={BAND_H} />
        <Box flexDirection="column" justifyContent="center" alignItems="center" flexGrow={1}>
          {hide}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const g = await read($, graph)
    const loading = await read($, isLoading)
    const start = await read($, offset)
    const nowSeconds = Math.floor((await $.clock.now()) / 1000)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const refresh = (
      <Button key="refresh" plain onPress={() => load($)}>
        <Text dimColor>{loading ? 'Scansione…' : '↻ Aggiorna'}</Text>
      </Button>
    )

    if (e.surface === 'terminal' || !('Svg' in ui)) {
      return (
        <Box flexDirection="column">
          {textRows(g, start, Math.max(1, e.props.scroll.bodyRows - CONTROLS), nowSeconds).map(line => (
            <Text dimColor={line.dim}>{line.text}</Text>
          ))}
          {refresh}
        </Box>
      )
    }

    const Svg = ui.Svg
    const width = Math.max(320, Math.floor(e.props.bodyColumns * CELL_W))
    const height = Math.max(200, Math.floor((e.props.scroll.bodyRows - CONTROLS) * CELL_H))
    const frame = { width, height, nowSeconds, isLoading: loading }
    const max = g.kind === 'ok' ? Math.max(0, g.rows.length - visibleRows(height)) : 0
    const source =
      g.kind === 'ok'
        ? graphSvg(frame, g, Math.min(start, max))
        : g.kind === 'none'
          ? messageSvg(frame, g.cwd, 'Questa cartella non è un repository git')
          : g.kind === 'error'
            ? messageSvg(frame, 'errore', g.message)
            : messageSvg(frame, 'scansione', 'Lettura del repository…')

    return (
      <Box flexDirection="column">
        <Svg source={source} alt={altText(g)} width={width} height={height} />
        {refresh}
      </Box>
    )
  })
}

function visibleFor(bodyRows: number): number {
  return visibleRows(Math.max(200, Math.floor((bodyRows - CONTROLS) * CELL_H)))
}

function parseArgs(args: string): Filters {
  const words = args.trim().split(/\s+/).filter(w => w.length > 0)
  const f: Filters = { branchOnly: false, firstParent: false, since: null }
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (word === '--branch') f.branchOnly = true
    else if (word === '--first-parent') f.firstParent = true
    else if (word === '--since') f.since = sinceArg(words[++i] ?? '')
    else if (word?.startsWith('--since=')) f.since = sinceArg(word.slice(8))
  }

  return f
}

/** "2w" → "2.weeks", anything else passed to git as written. */
function sinceArg(value: string): string | null {
  if (value.length === 0) return null
  const short = /^(\d+)([dwmy])$/.exec(value)
  if (short === null) return value
  const unit = { d: 'days', w: 'weeks', m: 'months', y: 'years' }[short[2] as 'd' | 'w' | 'm' | 'y']

  return `${short[1]}.${unit}`
}

function describe(f: Filters): string {
  const parts = [
    f.branchOnly ? 'solo branch corrente' : null,
    f.firstParent ? 'first-parent' : null,
    f.since !== null ? `da ${f.since}` : null,
  ].filter(p => p !== null)

  return parts.length > 0 ? ` (${parts.join(', ')})` : ''
}

function bandText(g: Extract<Graph, { kind: 'ok' }>, nowSeconds: number): string {
  const head = g.rows.find(r => r.refs.some(ref => ref.kind === 'head')) ?? g.rows[0]!
  const sync = g.ahead === null || g.behind === null ? '—' : `↑${g.ahead} ↓${g.behind}`
  const last =
    (g.behind ?? 0) > 0 ? `${g.behind} commit da scaricare` : `${head.hash} ${head.subject} ${age(head.time, nowSeconds)}`

  return `[${g.branch}] ${sync} · ${last} · ${g.dirty}Δ`
}

function altText(g: Graph): string {
  if (g.kind === 'ok') return `Grafico git di ${g.repo}, branch ${g.branch}, ${g.rows.length} commit caricati`
  if (g.kind === 'none') return 'Questa cartella non è un repository git'
  if (g.kind === 'error') return g.message

  return 'Lettura del repository'
}

function textRows(
  g: Graph,
  start: number,
  room: number,
  nowSeconds: number,
): { text: string; dim: boolean }[] {
  if (g.kind === 'none') return [{ text: 'Questa cartella non è un repository git', dim: true }]
  if (g.kind === 'error') return [{ text: g.message, dim: true }]
  if (g.kind === 'idle') return [{ text: 'Lettura del repository…', dim: true }]

  const lines = [{ text: `git://${g.repo}  [${g.branch}]`, dim: false }]
  const first = Math.min(start, Math.max(0, g.rows.length - (room - 1)))
  for (let i = first; i < Math.min(g.rows.length, first + room - 1); i++) {
    const row = g.rows[i]!
    const prev = g.rows[i - 1]
    const active = new Set<number>([
      ...(prev?.segs.map(([, to]) => to) ?? []),
      ...row.segs.map(([from]) => from),
    ])
    let lanes = ''
    for (let lane = 0; lane < g.lanes; lane++) {
      lanes += lane === row.lane ? (row.refs.some(r => r.kind === 'head') ? '◉ ' : '● ') : active.has(lane) ? '│ ' : '  '
    }
    const refs = row.refs.length > 0 ? `(${row.refs.map(r => r.name).join(', ')}) ` : ''
    lines.push({
      text: `${lanes.trimEnd().padEnd(g.lanes * 2)} ${row.hash} ${refs}${row.subject}  ${row.initials} ${age(row.time, nowSeconds)}`,
      dim: row.isMerge,
    })
  }

  return lines
}
