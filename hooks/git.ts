import type { Ref, Row, Seg } from '../types'

export const FIELD = '\x1f'
export const RECORD = '\x1e'

/** `git log --format` producing one record per commit, parsed by parseLog. */
export const LOG_FORMAT = ['%H', '%P', '%an', '%at', '%D', '%s'].join('%x1f') + '%x1e'

export type RawCommit = {
  hash: string
  parents: string[]
  author: string
  time: number
  decorations: string
  subject: string
}

export function parseLog(stdout: string): RawCommit[] {
  return stdout
    .split(RECORD)
    .map(record => record.replace(/^\s+/, ''))
    .filter(record => record.length > 0)
    .map(record => {
      const [hash = '', parents = '', author = '', time = '0', decorations = '', subject = ''] =
        record.split(FIELD)

      return {
        hash,
        parents: parents.split(' ').filter(p => p.length > 0),
        author,
        time: Number(time),
        decorations,
        subject,
      }
    })
}

export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s._-]+/)
    .filter(w => w.length > 0)
  const first = words[0]?.[0] ?? '?'
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : (words[0]?.[1] ?? '')

  return (first + second).toUpperCase()
}

/** Splits `%D` ("HEAD -> main, origin/main, tag: v1") into typed refs. */
export function parseRefs(decorations: string, remotes: readonly string[]): Ref[] {
  const refs: Ref[] = []

  for (const part of decorations.split(',').map(p => p.trim()).filter(p => p.length > 0)) {
    if (part.startsWith('HEAD -> ')) {
      refs.push({ name: part.slice(8), kind: 'head' })
    } else if (part === 'HEAD') {
      refs.push({ name: 'HEAD', kind: 'head' })
    } else if (part.startsWith('tag: ')) {
      refs.push({ name: part.slice(5), kind: 'tag' })
    } else if (remotes.some(r => part.startsWith(`${r}/`))) {
      if (!part.endsWith('/HEAD')) refs.push({ name: part, kind: 'remote' })
    } else {
      refs.push({ name: part, kind: 'branch' })
    }
  }

  return refs
}

/**
 * Assigns each commit a lane and the edges toward the next row. Lanes never
 * shift: a freed lane is reused, so the geometry stays still while scrolling.
 * Commits must come parents-after-children (`--topo-order`).
 */
export function layout(
  commits: readonly RawCommit[],
  remotes: readonly string[],
): { rows: Row[]; lanes: number } {
  const lanes: (string | null)[] = []
  let widest = 0

  const staged = commits.map(commit => {
    let lane = lanes.indexOf(commit.hash)
    if (lane < 0) lane = claim(lanes)

    for (let other = 0; other < lanes.length; other++) {
      if (other !== lane && lanes[other] === commit.hash) lanes[other] = null
    }

    lanes[lane] = commit.parents[0] ?? null

    const spawned: number[] = []
    const joins: number[] = []
    for (const parent of commit.parents.slice(1)) {
      const existing = lanes.indexOf(parent)
      if (existing >= 0) {
        joins.push(existing)
      } else {
        const free = claim(lanes)
        lanes[free] = parent
        spawned.push(free)
      }
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()
    widest = Math.max(widest, lanes.length, lane + 1)

    return { commit, lane, after: [...lanes], spawned, joins }
  })

  const rows = staged.map((row, i): Row => {
    const next = staged[i + 1]
    const target = (lane: number): number =>
      next !== undefined && row.after[lane] === next.commit.hash ? next.lane : lane
    const segs: Seg[] = []
    const seen = new Set<string>()
    const add = (seg: Seg) => {
      const key = seg.join(',')
      if (!seen.has(key)) {
        seen.add(key)
        segs.push(seg)
      }
    }

    row.after.forEach((hash, lane) => {
      if (hash === null) return
      add([row.spawned.includes(lane) ? row.lane : lane, target(lane), lane])
    })
    for (const lane of row.joins) add([row.lane, target(lane), lane])

    return {
      hash: row.commit.hash.slice(0, 7),
      subject: row.commit.subject,
      initials: initials(row.commit.author),
      time: row.commit.time,
      refs: parseRefs(row.commit.decorations, remotes),
      lane: row.lane,
      isMerge: row.commit.parents.length > 1,
      segs,
    }
  })

  return { rows, lanes: widest }
}

function claim(lanes: (string | null)[]): number {
  const free = lanes.indexOf(null)
  if (free >= 0) return free
  lanes.push(null)

  return lanes.length - 1
}

/** "2h", "05g": two digits, Italian units (m minuti, h ore, g giorni, s settimane, M mesi, a anni). */
export function age(seconds: number, nowSeconds: number): string {
  const d = Math.max(0, nowSeconds - seconds)
  const units: [number, string][] = [
    [31536000, 'a'],
    [2592000, 'M'],
    [604800, 's'],
    [86400, 'g'],
    [3600, 'h'],
    [60, 'm'],
  ]
  for (const [size, unit] of units) {
    if (d >= size) return `${String(Math.min(99, Math.floor(d / size))).padStart(2, '0')}${unit}`
  }

  return 'ora'
}
