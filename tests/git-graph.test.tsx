import { expect, test } from 'claude-code/testing'

import { layout, parseLog } from '../hooks/git'

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

  expect(lanes).toBe(2)
  expect(rows.map(r => r.lane)).toEqual([0, 0, 1, 1, 0, 0, 0])
  // The merge spawns lane 1 with a curve; the fork curves back into lane 0.
  expect(rows[1]!.segs).toContainEqual([0, 1, 1])
  expect(rows[3]!.segs).toContainEqual([1, 1, 1])
  expect(rows[4]!.segs).toContainEqual([1, 0, 1])
  expect(rows[0]!.refs).toEqual([
    { name: 'main', kind: 'head' },
    { name: 'origin/main', kind: 'remote' },
  ])
  expect(rows[5]!.refs).toEqual([{ name: 'v0.3.0', kind: 'tag' }])
  expect(rows[0]!.initials).toBe('FX')
})

test('the pane draws the repository on every surface', async ($, on) => {
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

    return out('', 1)
  })

  await $.session.start({ cwd: '/work/fantasy', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'gitgraph', args: '' })

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await desktop.find({ type: 'Svg' })
  expect(svg?.props.alt).toBe('Grafico git di fantasy-socioeconomic-simulator-2.0, branch main, 7 commit caricati')
  const source = String(svg?.props.source)
  expect(source).toContain('a3f9c21')
  expect(source).toContain('v0.3.0')
  expect(source.length).toBeLessThan(131072)
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await terminal.find({ type: 'Text', text: /a3f9c21/ }))?.text).toContain('Fix calcolo tasse')
  await terminal.unmount()
})
