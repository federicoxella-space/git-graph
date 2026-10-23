import { expect, test } from 'claude-code/testing'

import { COLORS, branchColor, layout, parseLog } from '../hooks/git'
import { bandSvg, graphSvg } from '../hooks/svg'

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
  const source = graphSvg({ width: 700, height: 400, nowSeconds: 1700000000, isLoading: false }, graph, 0)

  expect(rows[0]!.segs).toEqual([[0, 0, 0]])
  expect(source).toContain('<path d="M32 76V116"')
  expect(source).toContain('filterUnits="userSpaceOnUse"')
})

test('the pane draws the repository on every surface', async ($, on) => {
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
    if (args === 'rev-parse --show-toplevel') return out('/work/fantasy-socioeconomic-simulator-2.0\n')
    if (args === 'rev-parse --abbrev-ref HEAD') return out('main\n')
    if (args.startsWith('rev-list')) return out('0\t0\n')
    if (args === 'remote') return out('origin\n')
    if (args.startsWith('for-each-ref'))
      return out('refs/heads/main\nrefs/heads/feature/market\nrefs/remotes/origin/main\nrefs/tags/v0.3.0\n')
    if (args.startsWith('log')) return out(LOG)
    if (args === 'status --porcelain') return out(' M hooks/svg.ts\n?? notes.md\n')

    return out('', 1)
  })

  await $.session.start({ cwd: '/work/fantasy', surface: 'desktop', isInteractive: true })
  await $.command.run({
    command: 'gitgraph',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 200 },
  })

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await desktop.find({ type: 'Svg' })
  expect(svg?.props.alt).toBe('Grafico git di fantasy-socioeconomic-simulator-2.0, branch main, 7 commit caricati')
  const source = String(svg?.props.source)
  expect(source).toContain('a3f9c21')
  expect(source).toContain('v0.3.0')
  expect(source.length).toBeLessThan(131072)
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
