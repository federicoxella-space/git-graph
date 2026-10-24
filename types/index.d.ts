export type RefKind = 'head' | 'branch' | 'remote' | 'tag'

export type Ref = { name: string; kind: RefKind }

/** A drawn edge between a row and the next: [fromLane, toLane, color]. */
export type Seg = [number, number, number]

export type Row = {
  /** Short hash. */
  hash: string
  subject: string
  initials: string
  /** The palette index of the commit's author (authorColor), the same on every branch. */
  authorColor: number
  /** Author time, unix seconds. */
  time: number
  refs: Ref[]
  /** The lane the commit sits in. */
  lane: number
  /** The palette index of the branch the commit is on (branchColor). */
  color: number
  isMerge: boolean
  /** Edges toward the next row. */
  segs: Seg[]
}

export type Filters = {
  branchOnly: boolean
  firstParent: boolean
  since: string | null
}

export type Graph =
  | { kind: 'idle' }
  | { kind: 'none'; cwd: string }
  | { kind: 'error'; message: string }
  | {
      kind: 'ok'
      repo: string
      branch: string
      ahead: number | null
      behind: number | null
      rows: Row[]
      lanes: number
      hasMore: boolean
      branches: number
      remotes: number
      tags: number
      /** Files `git status --porcelain` lists: modified, staged or untracked. */
      dirty: number
    }

declare module 'claude-code' {
  interface PluginState {
    'git-graph': {
      graph: Graph
      limit: number
      filters: Filters
      isLoading: boolean
      isBandHidden: boolean
    }
  }
}
