import { expect, test } from 'claude-code/testing'

import { COLORS, authorColor, branchColor, layout, parseLog } from '../hooks/git'
import { bandSvg, graphSvg, lastVisibleRow } from '../hooks/svg'

const F = '\x1f'
const R = '\x1e'
const commit = (hash: string, parents: string, refs: string, subject: string) =>
  [hash.padEnd(40, '0'), parents.split(' ').filter(p => p).map(p => p.padEnd(40, '0')).join(' '), 'Federico Xella', '1700000000', refs, subject].join(F) + R

// The mockup's history: a feature branch forked at v0.3.0 and merged back.
const LOG =
  commit('a3f9c21', '7b2e104', 'HEAD -> main, origin/main', 'Fix calcolo tasse') +
  commit('7b2e104', '0d3b5e8 e91d0aa', '', "Merge branch 'feature/market'") +
  commit('e91d0aa', '4c77f12', 'feature/market', 'Aggiunto modello domanda') +
  commit('4c77f12', '92ac1f7', '', 'Refactor classe Market') +
  commit('0d3b5e8', '92ac1f7', '', 'Aggiornato README') +
  commit('92ac1f7', '1e6d4b9', 'tag: v0.3.0', 'Release 0.3.0') +
  commit('1e6d4b9', '', '', 'Setup iniziale simulazione')

const PANE = {
  plugin: 'git-graph',
  component: 'Pane',
  requestId: 'git-graph',
  props: {
    title: 'Git graph',
    isFocused: false,
    bodyColumns: 90,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the lanes match the mockup: one fork, one merge, two lanes', async () => {
  const { rows, lanes } = layout(parseLog(LOG), ['origin'])

  const feature = branchColor('feature/market')

  expect(lanes).toBe(2)
  expect(rows.map(r => r.lane)).toEqual([0, 0, 1, 1, 0, 0, 0])
  // The merge spawns lane 1 with a curve; the fork curves back into lane 0.
  // Each edge draws in its branch's color: main's, or the merged branch's.
  expect(rows[1]!.segs).toContainEqual([0, 1, feature])
  expect(rows[3]!.segs).toContainEqual([1, 1, feature])
  expect(rows[4]!.segs).toContainEqual([1, 0, feature])
  expect(rows[4]!.segs).toContainEqual([0, 0, 0])
  expect(rows.map(r => r.color)).toEqual([0, 0, feature, feature, 0, 0, 0])
  expect(rows[0]!.refs).toEqual([
    { name: 'main', kind: 'head' },
    { name: 'origin/main', kind: 'remote' },
  ])
  expect(rows[5]!.refs).toEqual([{ name: 'v0.3.0', kind: 'tag' }])
  expect(rows[0]!.initials).toBe('FX')
})

test('a branch keeps its color by name, whatever lane it takes', async () => {
  expect(branchColor('main')).toBe(0)
  expect(branchColor('master')).toBe(0)
  expect(branchColor('feature/x')).toBe(branchColor('feature/x'))
  for (const name of ['feature/x', 'fix/y', 'release/1.0', 'dev']) {
    expect(branchColor(name)).toBeGreaterThan(0)
    expect(branchColor(name)).toBeLessThan(COLORS)
  }

  // A newer side branch takes lane 0 from main: main still draws as main.
  const { rows } = layout(
    parseLog(
      commit('c3', 'c1', 'feature/x', 'Lavoro sul ramo') +
        commit('c2', 'c1', 'HEAD -> main, origin/main', 'Lavoro su main') +
        commit('c1', '', '', 'Primo'),
    ),
    ['origin'],
  )
  expect(rows[0]!.lane).toBe(0)
  expect(rows[0]!.color).toBe(branchColor('feature/x'))
  expect(rows[1]!.lane).toBe(1)
  expect(rows[1]!.color).toBe(0)
})

test("an author's color is the same on every branch", async () => {
  const { rows } = layout(parseLog(LOG), ['origin'])

  // One author across main and feature/market: one color, whatever the lane.
  expect(new Set(rows.map(r => r.authorColor)).size).toBe(1)
  expect(rows[0]!.authorColor).toBe(authorColor('Federico Xella'))
  expect(authorColor(' federico xella ')).toBe(authorColor('Federico Xella'))
  expect(authorColor('Federico Xella')).toBeLessThan(COLORS)
})

test('a merge from a remote names the branch without its remote', async () => {
  const { rows } = layout(
    parseLog(
      commit('m1', 'a1 b1', 'HEAD -> main', "Merge remote-tracking branch 'origin/fix/y'") +
        commit('b1', 'a1', '', 'Fix') +
        commit('a1', '', '', 'Primo'),
    ),
    ['origin'],
  )
  expect(rows[0]!.segs).toContainEqual([0, 1, branchColor('fix/y')])
  expect(rows[1]!.color).toBe(branchColor('fix/y'))
})

test('a single lane still draws its line: the glow does not hide it', async () => {
  const { rows, lanes } = layout(
    parseLog(commit('2a51748', '26f45fa', 'HEAD -> main', 'Secondo') + commit('26f45fa', '', '', 'Primo')),
    [],
  )
  const graph = {
    kind: 'ok', repo: 'git-graph', branch: 'main', ahead: 0, behind: 0,
    rows, lanes, hasMore: false, branches: 1, remotes: 0, tags: 0, dirty: 0,
  } as const
  const source = graphSvg(700, graph, 0, 2, 1700000000)

  expect(rows[0]!.segs).toEqual([[0, 0, 0]])
  expect(source).toContain('<path d="M32 20V60"')
  expect(source).toContain('filterUnits="userSpaceOnUse"')
})

type On = Parameters<Parameters<typeof test>[1]>[1]

/** Stands for the engine and git: `log` is what `git log` prints, `isRepo` false answers "not a repository". */
function mockRepo(on: On, log: string | string[], isRepo = true) {
  // Hidden, the band hands the site back: this hook stands for the engine.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('command.register', () => ({ value: { command: 'gitgraph' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1700100000000 }))
  on('session.cwd', () => ({ value: '/work/fantasy' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => {
    const args = e.argv.slice(1).join(' ')
    const out = (stdout: string, exitCode = 0) => ({
      value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })
    if (args === 'rev-parse --show-toplevel')
      return isRepo ? out('/work/fantasy-socioeconomic-simulator-2.0\n') : out('', 128)
    if (args === 'rev-parse --abbrev-ref HEAD') return out('main\n')
    if (args.startsWith('rev-list')) return out('0\t0\n')
    if (args === 'remote') return out('origin\n')
    if (args.startsWith('for-each-ref'))
      return out('refs/heads/main\nrefs/heads/feature/market\nrefs/remotes/origin/main\nrefs/tags/v0.3.0\n')
    if (args.startsWith('log')) {
      // A list of commits honours `-n`, as git does.
      const n = Number(/-n(\d+)/.exec(args)?.[1] ?? log.length)

      return out(typeof log === 'string' ? log : log.slice(0, n).join(''))
    }
    if (args === 'status --porcelain') return out(' M hooks/svg.ts\n?? notes.md\n')

    return out('', 1)
  })
}

test('the pane draws the repository on every surface', async ($, on) => {
  mockRepo(on, LOG)

  await $.session.start({ cwd: '/work/fantasy', surface: 'desktop', isInteractive: true })
  await $.command.run({
    command: 'gitgraph',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 200 },
  })

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const root = await desktop.find({ type: 'Box' })
  const top = await desktop.find({ key: 'top' })
  const drawing = await desktop.find({ key: 'drawing' })
  expect(root?.children[0]?.props.key).toBe('top')
  expect(root?.children[1]?.props.key).toBe('drawing')
  const header = top?.children[0] as { props: Record<string, unknown> } | undefined
  expect(String(header?.props.source)).toContain('fantasy-socioeconomic-simulator-2.0')
  expect(String(header?.props.source)).toContain('main')
  expect((await desktop.find({ key: 'refresh' }))?.text).toBe('↻')
  // One block for 7 commits: 7 rows of 40 px, every hash in it.
  expect(drawing?.children.length).toBe(1)
  const svg = drawing?.children[0] as { props: Record<string, unknown> } | undefined
  expect(svg?.props.alt).toBe('Grafico git di fantasy-socioeconomic-simulator-2.0, branch main, 7 commit caricati')
  expect(svg?.props.height).toBe(280)
  const source = String(svg?.props.source)
  for (const hash of ['a3f9c21', '7b2e104', 'e91d0aa', '4c77f12', '0d3b5e8', '92ac1f7', '1e6d4b9']) {
    expect(source).toContain(hash)
  }
  expect(source).toContain('v0.3.0')
  expect(source.length).toBeLessThan(131072)
  // The pane scrolls natively: no amber bar, no footer, no margins, no fixed height.
  const all = [header, ...(drawing?.children ?? [])].map(c => String(c?.props.source)).join('')
  expect(all).not.toContain('rx="1.5" fill="#F59E0B"')
  expect(all).not.toContain(' REMOTE</text>')
  expect(all).not.toContain(' TAG</text>')
  expect(await desktop.find({ key: 'margin-top' })).toBeUndefined()
  expect(await desktop.find({ key: 'margin-bottom' })).toBeUndefined()
  expect(drawing?.props.height).toBeUndefined()
  await desktop.unmount()

  const BAND = {
    plugin: 'git-graph',
    component: 'AbovePrompt',
    requestId: 'band',
    props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 120, scroll: { offset: 0, bodyRows: 8 }, view: {} },
  } as const
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const bandSource = String((await band.find({ type: 'Svg' }))?.props.source)
  expect(bandSource).toContain('a3f9c21')
  expect(bandSource).toContain('2Δ')
  expect(await band.find({ key: 'band-pane' })).toBeUndefined()
  expect((await band.find({ key: 'band-hide' }))?.text).toBe('✕')
  await band.press({ key: 'band-hide' })
  expect(await band.find({ type: 'Svg' })).toBeUndefined()
  await band.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await terminal.find({ type: 'Text', text: /a3f9c21/ }))?.text).toContain('Fix calcolo tasse')
  expect((await terminal.find({ type: 'Box' }))?.children[0]).not.toMatchObject({ type: 'Svg' })
  expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
  await terminal.unmount()
})

test('the band warns when the branch is behind its upstream', async () => {
  const { rows, lanes } = layout(parseLog(LOG), ['origin'])
  const source = bandSvg(
    700,
    { kind: 'ok', repo: 'r', branch: 'main', ahead: 0, behind: 4, rows, lanes, hasMore: false, branches: 1, remotes: 1, tags: 0, dirty: 0 },
    1700000000,
  )

  expect(source).toContain('4 commit da scaricare')
  expect(source).not.toContain('a3f9c21')
})

test('the drawing splits in blocks of 50 commits with continuous lanes', async ($, on) => {
  // 120 commits in a line; the mock honours `-n`, so the first load gives 100 and the
  // desktop scroll near the end loads the other 20.
  const all = Array.from({ length: 120 }, (_, i) =>
    commit(`c${String(i).padStart(3, '0')}`, i < 119 ? `c${String(i + 1).padStart(3, '0')}` : '', i === 0 ? 'HEAD -> main' : '', `Commit ${i}`),
  )
  mockRepo(on, all, true)
  // The engine's answer to the wheel: the window lands where the event asked.
  on('ui.scroll', (_, e) => ({ offset: e.offset }))

  await $.session.start({ cwd: '/work/fantasy', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'gitgraph', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const heights = async () =>
    (((await desktop.find({ key: 'drawing' }))?.children ?? []) as { props: Record<string, unknown> }[]).map(b => b.props.height)
  expect(await heights()).toEqual([2000, 2000])

  await $.ui.scroll({
    component: 'Pane', requestId: 'git-graph', offset: 150, by: 10, bodyRows: 30, origin: { kind: 'person' },
  } as never)
  // loadMore runs in the background: wait for the rescan.
  for (let i = 0; i < 50 && (await heights()).length < 3; i++) await new Promise(r => setTimeout(r, 20))
  expect(await heights()).toEqual([2000, 2000, 800])
  const blocks = ((await desktop.find({ key: 'drawing' }))?.children ?? []) as { props: Record<string, unknown> }[]
  expect(String(blocks[1]!.props.source)).toContain('<path d="M32 -20V20"')
  await desktop.unmount()
})

test('a full block stays under the Svg source limit', async () => {
  const log = Array.from({ length: 50 }, (_, i) =>
    commit(`d${String(i).padStart(3, '0')}`, `d${String(i + 1).padStart(3, '0')}`, 'HEAD -> feature/una-ramo-molto-lungo, origin/feature/una-ramo-molto-lungo, tag: v1.0.0, release/lunga', 'Un oggetto molto lungo '.repeat(20)),
  ).join('')
  const { rows } = layout(parseLog(log), ['origin'])
  // Eight lanes everywhere: the widest case for the paths.
  const wide = rows.map(r => ({ ...r, lane: 7, segs: Array.from({ length: 8 }, (_, l) => [l, 7 - l, l] as [number, number, number]) }))
  const graph = {
    kind: 'ok', repo: 'r', branch: 'main', ahead: 0, behind: 0,
    rows: wide, lanes: 8, hasMore: false, branches: 1, remotes: 1, tags: 1, dirty: 0,
  } as const
  expect(graphSvg(1200, graph, 0, 50, 1700000000).length).toBeLessThan(131072)
})

test('lastVisibleRow maps the native window to a commit', async () => {
  expect(lastVisibleRow(0, 30)).toBe(12)
  expect(lastVisibleRow(200, 30)).toBe(107)
})

test('outside a repository the pane says so under the header', async ($, on) => {
  mockRepo(on, '', false)

  await $.session.start({ cwd: '/work/fantasy', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'gitgraph', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const header = (await desktop.find({ key: 'top' }))?.children[0] as { props: Record<string, unknown> } | undefined
  const message = (await desktop.find({ key: 'drawing' }))?.children[0] as { props: Record<string, unknown> } | undefined
  expect(String(header?.props.source)).toContain('/work/fantasy')
  expect(String(message?.props.source)).toContain('Questa cartella non è un repository git')
  expect((await desktop.find({ key: 'refresh' }))?.text).toBe('↻')
  await desktop.unmount()
})
