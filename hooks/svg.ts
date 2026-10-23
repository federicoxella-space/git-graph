import type { Graph, Ref, Row } from '../types'
import { age } from './git'

export const ROW = 40
export const HEADER = 56
export const FOOTER = 48
const LANE = 24
const LANE0 = 32
const CHAR = 7.8
const SMALL_CHAR = 6.7

const BG = '#12161F'
const LINE = '#252B38'
const MUTED = '#6B7487'

/** Lane colors: [stroke, light text]. */
const PALETTE: [string, string][] = [
  ['#22D3EE', '#A5F3FC'],
  ['#E879F9', '#F5D0FE'],
  ['#A3E635', '#D9F99D'],
  ['#FB923C', '#FED7AA'],
  ['#818CF8', '#C7D2FE'],
  ['#F472B6', '#FBCFE8'],
  ['#2DD4BF', '#99F6E4'],
  ['#60A5FA', '#BFDBFE'],
]
const TAG: [string, string] = ['#FBBF24', '#FDE68A']

const color = (lane: number): [string, string] => PALETTE[lane % PALETTE.length] ?? PALETTE[0]!

export function visibleRows(height: number): number {
  return Math.max(1, Math.floor((height - HEADER - FOOTER) / ROW))
}

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const cut = (text: string, chars: number): string =>
  chars <= 1 ? '' : text.length <= chars ? text : `${text.slice(0, Math.max(0, chars - 1))}…`

const n = (value: number): string => String(Math.round(value * 10) / 10)

type Frame = { width: number; height: number; nowSeconds: number; isLoading: boolean }

function shell(frame: Frame, body: string): string {
  const { width: W, height: H } = frame

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<style>text{font-family:ui-monospace,'JetBrains Mono','Cascadia Code',Consolas,monospace}` +
    `.h{fill:#5B6578;font-size:12px}.m{fill:#CBD5E1;font-size:13px}.d{fill:${MUTED};font-size:11px}` +
    `.b{font-size:11px;text-anchor:middle}.sep{stroke:#1E2430;stroke-dasharray:2 4}</style>` +
    `<defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/>` +
    `<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<polygon id="hx" points="0,-7 6.06,-3.5 6.06,3.5 0,7 -6.06,3.5 -6.06,-3.5"/>` +
    `<linearGradient id="sc" x1="0" x2="1"><stop offset="0" stop-color="#22D3EE" stop-opacity="0"/>` +
    `<stop offset="0.5" stop-color="#22D3EE" stop-opacity="0.9"/><stop offset="1" stop-color="#22D3EE" stop-opacity="0"/></linearGradient>` +
    `<clipPath id="rows"><rect x="0" y="${HEADER}" width="${W}" height="${H - HEADER - FOOTER}"/></clipPath></defs>` +
    `<rect width="${W}" height="${H}" rx="12" fill="${BG}"/>` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="none" stroke="${LINE}"/>` +
    body +
    `<line x1="24" y1="${H - FOOTER + 0.5}" x2="${W - 24}" y2="${H - FOOTER + 0.5}" stroke="${LINE}"/>` +
    `<rect x="24" y="${H - FOOTER - 1}" width="120" height="3" fill="url(#sc)">` +
    `<animate attributeName="x" values="24;${W - 144};24" dur="${frame.isLoading ? 1.2 : 4}s" repeatCount="indefinite"/></rect>` +
    `</svg>`
  )
}

function header(W: number, title: string, branch: string | null, sync: string): string {
  let out =
    `<text x="32" y="33" fill="#22D3EE" font-size="12" filter="url(#g)">◢</text>` +
    `<text x="50" y="33" fill="#64748B" font-size="12">git://</text>`
  let right = W - 24
  out += `<text x="${right}" y="34" fill="#34D399" font-size="11" text-anchor="end">${esc(sync)}</text>`
  right -= sync.length * SMALL_CHAR + 12

  if (branch !== null) {
    const label = cut(branch, 28)
    const bw = label.length * SMALL_CHAR + 16
    const bx = right - bw
    out +=
      `<rect x="${n(bx)}" y="21" width="${n(bw)}" height="18" rx="2" fill="#22D3EE" fill-opacity="0.12" stroke="#22D3EE" filter="url(#g)"/>` +
      `<text x="${n(bx + bw / 2)}" y="34" fill="#A5F3FC" class="b">${esc(label)}</text>` +
      `<text x="${n(bx - 8)}" y="33" fill="#64748B" font-size="11" text-anchor="end">BRANCH</text>`
    right = bx - 8 - 6 * SMALL_CHAR - 16
  }

  out +=
    `<text x="98" y="33" fill="#E2E8F0" font-size="13">${esc(cut(title, Math.floor((right - 98) / CHAR)))}</text>` +
    `<line x1="24" y1="55.5" x2="${W - 24}" y2="55.5" stroke="${LINE}"/>` +
    `<line x1="24" y1="55.5" x2="140" y2="55.5" stroke="#22D3EE" opacity="0.7"/>`

  return out
}

/** A centered message in place of the rows: no repo, an error, the first scan. */
export function messageSvg(frame: Frame, title: string, message: string): string {
  const mid = HEADER + (frame.height - HEADER - FOOTER) / 2

  return shell(
    frame,
    header(frame.width, title, null, '') +
      `<text x="${frame.width / 2}" y="${mid}" class="m" text-anchor="middle" fill-opacity="0.8">${esc(
        cut(message, Math.floor((frame.width - 48) / CHAR)),
      )}</text>`,
  )
}

type Ok = Extract<Graph, { kind: 'ok' }>

export function graphSvg(frame: Frame, graph: Ok, offset: number): string {
  const { width: W, height: H } = frame
  const visible = visibleRows(H)
  const rows = graph.rows
  const first = Math.max(0, offset - 1)
  const last = Math.min(rows.length - 1, offset + visible)
  const y = (i: number) => HEADER + (i - offset) * ROW + ROW / 2
  const x = (lane: number) => LANE0 + lane * LANE

  let widest = 0
  for (let i = first; i <= last; i++) {
    const row = rows[i]!
    widest = Math.max(widest, row.lane, ...row.segs.flatMap(([a, b]) => [a, b]))
  }
  const hashX = Math.max(84, x(widest) + 28)
  const msgX = hashX + 86
  const authorX = W - 104
  const timeX = W - 22

  let lines = ''
  let nodes = ''
  let text = ''
  let seps = ''

  for (let i = first; i <= last; i++) {
    const row = rows[i]!
    const y1 = y(i)
    const y2 = y1 + ROW

    for (const [from, to, lane] of row.segs) {
      const [stroke] = color(lane)
      const x1 = x(from)
      const x2 = x(to)
      const d =
        x1 === x2
          ? `M${x1} ${y1}V${y2}`
          : `M${x1} ${y1}C${x1} ${y1 + ROW / 2} ${x2} ${y1 + ROW / 2} ${x2} ${y2}`
      lines += `<path d="${d}" stroke="${stroke}"/>`
    }

    if (i < offset || i >= offset + visible) continue

    const [stroke, light] = color(row.lane)
    const isHead = row.refs.some(r => r.kind === 'head')
    nodes +=
      `<use href="#hx" x="${x(row.lane)}" y="${y1}" fill="${BG}"/>` +
      `<use href="#hx" x="${x(row.lane)}" y="${y1}" fill="${stroke}" fill-opacity="0.18" stroke="${stroke}" stroke-width="1.6"/>`
    if (isHead) {
      nodes +=
        `<circle cx="${x(row.lane)}" cy="${y1}" r="2.5" fill="${light}" filter="url(#g)"/>` +
        `<circle cx="${x(row.lane)}" cy="${y1}" r="11" fill="none" stroke="${stroke}" stroke-width="1">` +
        `<animate attributeName="r" values="9;14;9" dur="2.4s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0.7;0;0.7" dur="2.4s" repeatCount="indefinite"/></circle>`
    }

    const ty = y1 + 4
    text += `<text x="${hashX}" y="${ty}" class="h">${row.hash}</text>`

    let cx = msgX
    for (const ref of row.refs) {
      const badge = refBadge(ref, row, cx, y1, authorX - 12)
      if (badge === null) break
      text += badge.svg
      cx = badge.next
    }

    const room = Math.floor((authorX - 12 - cx) / CHAR)
    text += `<text x="${n(cx)}" y="${ty}" class="m"${row.isMerge ? ` fill="${MUTED}"` : ''}>${esc(cut(row.subject, room))}</text>`

    text +=
      `<rect x="${authorX}" y="${y1 - 10}" width="26" height="20" rx="2" fill="${stroke}" fill-opacity="0.14" stroke="${stroke}" stroke-opacity="0.6"/>` +
      `<text x="${authorX + 13}" y="${ty}" fill="${light}" class="b">${esc(row.initials)}</text>` +
      `<text x="${timeX}" y="${ty}" class="d" text-anchor="end">${age(row.time, frame.nowSeconds)}</text>`

    if (i < offset + visible - 1 && i < rows.length - 1) {
      seps += `<line x1="${hashX - 8}" y1="${y2 - ROW / 2}" x2="${W - 24}" y2="${y2 - ROW / 2}" class="sep"/>`
    }
  }

  const area = H - HEADER - FOOTER
  const total = rows.length + (graph.hasMore ? 50 : 0)
  let scrollbar = ''
  if (total > visible) {
    const track = area - 16
    const thumb = Math.max(18, (track * visible) / total)
    const top = HEADER + 8 + ((track - thumb) * offset) / Math.max(1, total - visible)
    scrollbar =
      `<rect x="${W - 9}" y="${HEADER + 8}" width="2" height="${track}" rx="1" fill="#1E2430"/>` +
      `<rect x="${W - 9.5}" y="${n(top)}" width="3" height="${n(thumb)}" rx="1.5" fill="#22D3EE" filter="url(#g)"/>`
  }

  const sync = frame.isLoading
    ? 'SYNC…'
    : graph.ahead === null || graph.behind === null
      ? '—'
      : `↑${graph.ahead} ↓${graph.behind}`
  const fy = H - FOOTER / 2 + 4
  const pad = (v: number) => String(v).padStart(2, '0')
  const footer =
    `<text x="${n(W * 0.2)}" y="${fy}" class="d" text-anchor="middle"><tspan fill="#22D3EE">${pad(graph.branches)}</tspan> BRANCH</text>` +
    `<text x="${n(W * 0.5)}" y="${fy}" class="d" text-anchor="middle"><tspan fill="#E879F9">${pad(graph.remotes)}</tspan> REMOTE</text>` +
    `<text x="${n(W * 0.8)}" y="${fy}" class="d" text-anchor="middle"><tspan fill="${TAG[0]}">${pad(graph.tags)}</tspan> TAG</text>`

  return shell(
    frame,
    header(W, graph.repo, graph.branch, sync) +
      `<g clip-path="url(#rows)">${seps}<g filter="url(#g)" fill="none" stroke-width="2">${lines}</g>${nodes}${text}</g>` +
      scrollbar +
      footer,
  )
}

function refBadge(
  ref: Ref,
  row: Row,
  at: number,
  y: number,
  limit: number,
): { svg: string; next: number } | null {
  const label = cut(ref.name, 24)
  const w = label.length * SMALL_CHAR + 16
  if (at + w > limit) return null

  const [stroke, light] =
    ref.kind === 'tag' ? TAG : ref.kind === 'remote' ? ['#3B4456', '#94A3B8'] : color(row.lane)
  const box =
    ref.kind === 'remote'
      ? `fill="none" stroke="${stroke}" stroke-dasharray="3 2"`
      : `fill="${stroke}" fill-opacity="0.12" stroke="${stroke}"${ref.kind === 'head' ? ' filter="url(#g)"' : ''}`

  return {
    svg:
      `<rect x="${n(at)}" y="${y - 9}" width="${n(w)}" height="18" rx="2" ${box}/>` +
      `<text x="${n(at + w / 2)}" y="${y + 4}" fill="${light}" class="b">${esc(label)}</text>`,
    next: at + w + 6,
  }
}
