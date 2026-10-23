export type RefKind = 'head' | 'branch' | 'remote' | 'tag'

export type Ref = { name: string; kind: RefKind }

/** A drawn edge between a row and the next: [fromLane, toLane, colorLane]. */
export type Seg = [number, number, number]

export type Row = {
  /** Short hash. */
  hash: string
  subject: string
  initials: string
  /** Author time, unix seconds. */
  time: number
  refs: Ref[]
  /** The lane the commit sits in. */
  lane: number
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
    }

declare module 'claude-code' {
  interface PluginState {
    'git-graph': {
      graph: Graph
      offset: number
      limit: number
      filters: Filters
      isLoading: boolean
    }
  }
}
