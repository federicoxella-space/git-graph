import type { Graph, Ref, Row } from '../types'
import { age, branchColor } from './git'

export const ROW = 40
export const HEADER = 56
export const FOOTER = 48
const LANE = 24
const LANE0 = 32
const CHAR = 7.8
const SMALL_CHAR = 6.7

/** What Claude Code paints under every component: the drawing has no
 * background of its own, and uses this only to knock lines out behind nodes. */
const HOST = '#212121'
const LINE = '#3A3532'
const MUTED = '#9A8F85'

/** Lane colors, warm only: [stroke, light text]. The first is the accent too. */
const PALETTE: [string, string][] = [
  ['#F59E0B', '#FCD34D'],
  ['#F43F5E', '#FDA4AF'],
  ['#F97316', '#FDBA74'],
  ['#EAB308', '#FDE047'],
  ['#EC4899', '#F9A8D4'],
  ['#D97757', '#F0B9A3'],
  ['#EF4444', '#FCA5A5'],
  ['#C2410C', '#FB923C'],
]
const TAG: [string, string] = ['#E7C9A0', '#F5E6D3']

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
    `.h{fill:#7A7069;font-size:12px}.m{fill:#E5DED6;font-size:13px}.d{fill:${MUTED};font-size:11px}` +
    `.b{font-size:11px;text-anchor:middle}.sep{stroke:#332E2B;stroke-dasharray:2 4}</style>` +
    // The glow's region is the whole drawing: sized to the element's box, a
    // group of vertical lines alone (one lane) has width 0 and draws nothing.
    `<defs><filter id="g" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur stdDeviation="2.2" result="b"/>` +
    `<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<polygon id="hx" points="0,-7 6.06,-3.5 6.06,3.5 0,7 -6.06,3.5 -6.06,-3.5"/>` +
    `<clipPath id="rows"><rect x="0" y="${HEADER}" width="${W}" height="${H - HEADER - FOOTER}"/></clipPath></defs>` +
    body +
    `<line x1="24" y1="${H - FOOTER + 0.5}" x2="${W - 24}" y2="${H - FOOTER + 0.5}" stroke="${LINE}"/>` +
    `</svg>`
  )
}

function header(W: number, title: string, branch: string | null, sync: string): string {
  let out = `<text x="32" y="33" fill="#F59E0B" font-size="12" filter="url(#g)">◢</text>`
  let right = W - 24
  out += `<text x="${right}" y="34" fill="#C9B79C" font-size="11" text-anchor="end">${esc(sync)}</text>`
  right -= sync.length * SMALL_CHAR + 12

  if (branch !== null) {
    const label = cut(branch, 28)
    const bw = label.length * SMALL_CHAR + 16
    const bx = right - bw
    const [stroke, light] = color(branchColor(branch))
    out +=
      `<rect x="${n(bx)}" y="21" width="${n(bw)}" height="18" rx="2" fill="${stroke}" fill-opacity="0.12" stroke="${stroke}" filter="url(#g)"/>` +
      `<text x="${n(bx + bw / 2)}" y="34" fill="${light}" class="b">${esc(label)}</text>` +
      `<text x="${n(bx - 8)}" y="33" fill="#9A8F85" font-size="11" text-anchor="end">BRANCH</text>`
    right = bx - 8 - 6 * SMALL_CHAR - 16
  }

  out +=
    `<text x="50" y="33" fill="#EDE6DE" font-size="13">${esc(cut(title, Math.floor((right - 50) / CHAR)))}</text>` +
    `<line x1="24" y1="55.5" x2="${W - 24}" y2="55.5" stroke="${LINE}"/>`

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

    for (const [from, to, tone] of row.segs) {
      const [stroke] = color(tone)
      const x1 = x(from)
      const x2 = x(to)
      const d =
        x1 === x2
          ? `M${x1} ${y1}V${y2}`
          : `M${x1} ${y1}C${x1} ${y1 + ROW / 2} ${x2} ${y1 + ROW / 2} ${x2} ${y2}`
      lines += `<path d="${d}" stroke="${stroke}"/>`
    }

    if (i < offset || i >= offset + visible) continue

    const [stroke, light] = color(row.color)
    const isHead = row.refs.some(r => r.kind === 'head')
    nodes +=
      `<use href="#hx" x="${x(row.lane)}" y="${y1}" fill="${HOST}"/>` +
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
      const badge = refBadge(ref, cx, y1, authorX - 12)
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
      `<rect x="${W - 9}" y="${HEADER + 8}" width="2" height="${track}" rx="1" fill="#332E2B"/>` +
      `<rect x="${W - 9.5}" y="${n(top)}" width="3" height="${n(thumb)}" rx="1.5" fill="#F59E0B" filter="url(#g)"/>`
  }

  const sync = frame.isLoading
    ? 'SYNC…'
    : graph.ahead === null || graph.behind === null
      ? '—'
      : `↑${graph.ahead} ↓${graph.behind}`
  const fy = H - FOOTER / 2 + 4
  const pad = (v: number) => String(v).padStart(2, '0')
  const footer =
    `<text x="${n(W * 0.2)}" y="${fy}" class="d" text-anchor="middle"><tspan fill="#F59E0B">${pad(graph.branches)}</tspan> BRANCH</text>` +
    `<text x="${n(W * 0.5)}" y="${fy}" class="d" text-anchor="middle"><tspan fill="#F43F5E">${pad(graph.remotes)}</tspan> REMOTE</text>` +
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
  at: number,
  y: number,
  limit: number,
): { svg: string; next: number } | null {
  const label = cut(ref.name, 24)
  const w = label.length * SMALL_CHAR + 16
  if (at + w > limit) return null

  const [stroke, light] =
    ref.kind === 'tag' ? TAG : ref.kind === 'remote' ? ['#524A44', '#B3A89E'] : color(branchColor(ref.name))
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

export const BAND_H = 40
/** Pixels per cell of the desktop's code font: panes and bands are measured in cells. */
export const CELL_W = 7.8

/** The one-row band above the prompt: branch, sync, HEAD's commit, dirty files. */
export function bandSvg(width: number, graph: Ok, nowSeconds: number): string {
  const W = width
  const H = BAND_H
  const mid = 24
  const head = graph.rows.find(r => r.refs.some(ref => ref.kind === 'head')) ?? graph.rows[0]!
  const [stroke, light] = color(head.color)

  let x = 16
  const branch = cut(graph.branch, 24)
  const bw = branch.length * SMALL_CHAR + 16

  let out =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<style>text{font-family:ui-monospace,'JetBrains Mono','Cascadia Code',Consolas,monospace}</style>` +
    `<defs><filter id="g" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">` +
    `<feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<polygon id="hx" points="0,-6 5.2,-3 5.2,3 0,6 -5.2,3 -5.2,-3"/></defs>` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="none" stroke="${LINE}"/>` +
    `<rect x="${n(x)}" y="11" width="${n(bw)}" height="18" rx="2" fill="${stroke}" fill-opacity="0.12" stroke="${stroke}" filter="url(#g)"/>` +
    `<text x="${n(x + bw / 2)}" y="${mid}" fill="${light}" font-size="11" text-anchor="middle">${esc(branch)}</text>`
  x += bw + 12

  const ahead = graph.ahead ?? 0
  const behind = graph.behind ?? 0
  const sync =
    graph.ahead === null || graph.behind === null
      ? `<tspan fill="${MUTED}">—</tspan>`
      : `<tspan fill="${ahead > 0 ? '#F59E0B' : behind > 0 ? MUTED : '#C9B79C'}">↑${ahead}</tspan>` +
        `<tspan fill="${behind > 0 ? '#EF4444' : ahead > 0 ? MUTED : '#C9B79C'}"> ↓${behind}</tspan>`
  out += `<text x="${n(x)}" y="${mid}" font-size="11">${sync}</text>`
  x += 6 * SMALL_CHAR + 12

  const right = W - 16
  const dirtyX = right - 6 * SMALL_CHAR - 12
  out +=
    `<text x="${right}" y="${mid}" fill="${MUTED}" font-size="11" text-anchor="end">` +
    `<tspan fill="${graph.dirty > 0 ? '#F97316' : '#C9B79C'}">●</tspan> ${graph.dirty}Δ</text>` +
    `<line x1="${n(dirtyX)}" y1="12" x2="${n(dirtyX)}" y2="28" stroke="${LINE}"/>` +
    `<line x1="${n(x)}" y1="12" x2="${n(x)}" y2="28" stroke="${LINE}"/>`
  x += 18

  if (behind > 0) {
    const room = Math.floor((dirtyX - 12 - x) / CHAR)
    out += `<text x="${n(x)}" y="${mid}" fill="#EF4444" font-size="12">${esc(cut(`${behind} commit da scaricare`, room))}</text>`
  } else {
    const ageX = dirtyX - 12
    out +=
      `<use href="#hx" x="${n(x)}" y="20" fill="${HOST}"/>` +
      `<use href="#hx" x="${n(x)}" y="20" fill="${stroke}" fill-opacity="0.18" stroke="${stroke}" stroke-width="1.5"/>` +
      `<circle cx="${n(x)}" cy="20" r="2" fill="${light}" filter="url(#g)"/>` +
      `<text x="${n(x + 16)}" y="${mid}" fill="#7A7069" font-size="12">${head.hash}</text>` +
      `<text x="${n(ageX)}" y="${mid}" fill="${MUTED}" font-size="11" text-anchor="end">${age(head.time, nowSeconds)}</text>`
    const subjectX = x + 16 + 8 * CHAR
    const room = Math.floor((ageX - 3 * SMALL_CHAR - 12 - subjectX) / CHAR)
    out += `<text x="${n(subjectX)}" y="${mid}" fill="#E5DED6" font-size="12">${esc(cut(head.subject, room))}</text>`
  }

  return `${out}</svg>`
}
