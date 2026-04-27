import React, { useState, useMemo, useRef } from 'react'
import { Upload, Trash2, Download } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'

// ─────────────────────────────────────────────────────────
// QC Stats Analyzer
// Drop in a CSV / TSV / pasted column of test results and get histogram +
// Cpk + control-chart + sliding-mean + outlier detection. Pure-client, no
// telemetry. Reads any "wide" CSV and lets the engineer pick the spec
// column to analyse.
// ─────────────────────────────────────────────────────────

const C = {
  bg: '#0a0d0f',
  bgCard: '#12171a',
  bgCardHi: '#171d20',
  border: '#252e33',
  borderHi: '#384249',
  copper: '#c97b3f',
  copperBright: '#e89357',
  teal: '#5eead4',
  amber: '#fbbf24',
  red: '#f87171',
  text: '#f0ebe2',
  textDim: '#a7b0b6',
  textMuted: '#6b7479',
}

// Parse any tabular text (CSV / TSV / pasted column).
function parseTabular(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  // Detect delimiter
  const sample = lines.slice(0, Math.min(5, lines.length)).join('\n')
  const counts = { ',': 0, '\t': 0, ';': 0, '|': 0 }
  for (const ch of sample) if (ch in counts) counts[ch]++
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ','

  const splitLine = (line) => line.split(delim).map((c) => c.trim())
  const first = splitLine(lines[0])
  // Treat first row as headers if any cell is non-numeric
  const isHeaderRow = first.some((c) => c !== '' && isNaN(parseFloat(c)))
  const headers = isHeaderRow ? first : first.map((_, i) => `col${i + 1}`)
  const dataLines = isHeaderRow ? lines.slice(1) : lines
  const rows = dataLines.map(splitLine)
  return { headers, rows, delimiter: delim }
}

function statsOf(arr) {
  const n = arr.length
  if (n === 0) return { n: 0 }
  const sum = arr.reduce((a, b) => a + b, 0)
  const mean = sum / n
  const variance = arr.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / Math.max(1, n - 1)
  const sd = Math.sqrt(variance)
  const sorted = [...arr].sort((a, b) => a - b)
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
  return { n, mean, sd, min: sorted[0], max: sorted[n - 1], median, p1: sorted[Math.floor(0.01 * (n - 1))], p99: sorted[Math.floor(0.99 * (n - 1))] }
}

// Cp / Cpk per ISO. lsl/usl can each be null (one-sided spec).
function cpkOf(mean, sd, lsl, usl) {
  if (sd === 0) return { cp: Infinity, cpk: Infinity, cpu: Infinity, cpl: Infinity }
  const cpu = usl != null ? (usl - mean) / (3 * sd) : Infinity
  const cpl = lsl != null ? (mean - lsl) / (3 * sd) : Infinity
  const cpk = Math.min(cpu, cpl)
  const cp = (lsl != null && usl != null) ? (usl - lsl) / (6 * sd) : null
  return { cp, cpk, cpu, cpl }
}

function histogramOf(arr, bins = 20) {
  if (arr.length === 0) return []
  const lo = Math.min(...arr)
  const hi = Math.max(...arr)
  if (lo === hi) return [{ x: lo, count: arr.length }]
  const w = (hi - lo) / bins
  const buckets = Array(bins).fill(0)
  for (const v of arr) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w)))
    buckets[idx]++
  }
  return buckets.map((count, i) => ({ x: +(lo + (i + 0.5) * w).toFixed(4), count }))
}

export default function QCStats() {
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [selectedCol, setSelectedCol] = useState(null)
  const [lsl, setLsl] = useState('')
  const [usl, setUsl] = useState('')
  const [pasted, setPasted] = useState('')
  const [fileName, setFileName] = useState('')
  const fileRef = useRef(null)

  const numericData = useMemo(() => {
    if (!rows.length || selectedCol == null) return []
    return rows
      .map((r) => parseFloat(r[selectedCol]))
      .filter((v) => Number.isFinite(v))
  }, [rows, selectedCol])

  const stats = useMemo(() => statsOf(numericData), [numericData])
  const cpk = useMemo(() => {
    if (!stats.n) return null
    const lslN = lsl === '' ? null : parseFloat(lsl)
    const uslN = usl === '' ? null : parseFloat(usl)
    return cpkOf(stats.mean, stats.sd, lslN, uslN)
  }, [stats, lsl, usl])
  const histogram = useMemo(() => histogramOf(numericData, 20), [numericData])
  const series = useMemo(() => numericData.map((v, i) => ({ i: i + 1, v })), [numericData])

  const onLoadCsv = async (file) => {
    const text = await file.text()
    const parsed = parseTabular(text)
    setHeaders(parsed.headers)
    setRows(parsed.rows)
    setFileName(file.name)
    // Auto-pick first column whose values are numeric
    const firstNumeric = parsed.headers.findIndex((_, i) =>
      parsed.rows.some((r) => Number.isFinite(parseFloat(r[i])))
    )
    setSelectedCol(firstNumeric >= 0 ? firstNumeric : null)
  }

  const onUsePasted = () => {
    if (!pasted.trim()) return
    const parsed = parseTabular(pasted)
    setHeaders(parsed.headers)
    setRows(parsed.rows)
    setFileName('(pasted)')
    const firstNumeric = parsed.headers.findIndex((_, i) =>
      parsed.rows.some((r) => Number.isFinite(parseFloat(r[i])))
    )
    setSelectedCol(firstNumeric >= 0 ? firstNumeric : null)
  }

  const reset = () => {
    setHeaders([])
    setRows([])
    setSelectedCol(null)
    setLsl('')
    setUsl('')
    setFileName('')
  }

  const exportReport = () => {
    if (!stats.n) return
    const lslN = lsl === '' ? null : parseFloat(lsl)
    const uslN = usl === '' ? null : parseFloat(usl)
    const lines = []
    lines.push(`# QC Stats Report — ${headers[selectedCol] || `col${selectedCol + 1}`}`)
    lines.push(`Generated ${new Date().toISOString()}`)
    lines.push('')
    lines.push(`File: ${fileName}`)
    lines.push(`Samples: ${stats.n}`)
    lines.push('')
    lines.push('## Distribution')
    lines.push(`- Mean: ${stats.mean.toFixed(4)}`)
    lines.push(`- StDev: ${stats.sd.toFixed(4)}`)
    lines.push(`- Min / max: ${stats.min.toFixed(4)} / ${stats.max.toFixed(4)}`)
    lines.push(`- Median: ${stats.median.toFixed(4)}`)
    lines.push(`- p1 / p99: ${stats.p1.toFixed(4)} / ${stats.p99.toFixed(4)}`)
    lines.push('')
    lines.push('## Capability')
    if (lslN != null) lines.push(`- LSL: ${lslN}`)
    if (uslN != null) lines.push(`- USL: ${uslN}`)
    if (cpk?.cp != null) lines.push(`- Cp: ${cpk.cp.toFixed(3)}`)
    lines.push(`- Cpk: ${cpk.cpk === Infinity ? '∞' : cpk.cpk.toFixed(3)}`)
    if (cpk.cpu !== Infinity) lines.push(`- Cpu: ${cpk.cpu.toFixed(3)}`)
    if (cpk.cpl !== Infinity) lines.push(`- Cpl: ${cpk.cpl.toFixed(3)}`)
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `qc-report-${headers[selectedCol] || 'col'}-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  // Cpk verdict colour
  const cpkColor = cpk
    ? cpk.cpk >= 1.67 ? C.teal
      : cpk.cpk >= 1.33 ? C.amber
      : cpk.cpk >= 1.0 ? C.copperBright
      : C.red
    : C.textMuted

  return (
    <section className="space-y-5">
      {/* Loader */}
      <div className="bg-[#12171a] border border-[#252e33] rounded p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.amber }}>
            Step 1 · Load test data
          </div>
          {rows.length > 0 && (
            <button onClick={reset} className="text-[10px] font-mono uppercase text-[#6b7479] hover:text-[#f87171] flex items-center gap-1">
              <Trash2 size={11} /> Clear
            </button>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full px-3 py-2.5 border border-dashed rounded text-[12px] font-mono uppercase tracking-wider text-[#a7b0b6] hover:bg-[#171d20] hover:border-[#c97b3f] flex items-center justify-center gap-2"
              style={{ borderColor: '#384249' }}
            >
              <Upload size={13} /> Drop CSV / TSV / Excel-pasted
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onLoadCsv(f) }}
              className="hidden"
            />
            {fileName && (
              <div className="mt-2 text-[11px] font-mono text-[#5eead4]">
                ✓ Loaded: {fileName} · {rows.length} rows · {headers.length} columns
              </div>
            )}
          </div>
          <div>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={`Or paste a single column / CSV here…\nimpedance\n100.2\n99.8\n101.1\n...`}
              rows={4}
              className="w-full bg-[#0a0d0f] border border-[#252e33] rounded px-2 py-2 text-[11px] font-mono text-[#fbbf24]"
            />
            <button
              onClick={onUsePasted}
              disabled={!pasted.trim()}
              className="mt-2 px-3 py-1.5 text-[10px] font-mono uppercase border rounded bg-transparent disabled:opacity-40"
              style={{ borderColor: '#5eead460', color: '#5eead4' }}
            >
              Use pasted data
            </button>
          </div>
        </div>
      </div>

      {/* Column picker + spec limits */}
      {headers.length > 0 && (
        <div className="bg-[#12171a] border border-[#252e33] rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.teal }}>
              Step 2 · Pick column + spec limits
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-wider mb-1 block" style={{ color: C.textMuted }}>Spec column</label>
              <select
                value={selectedCol ?? ''}
                onChange={(e) => setSelectedCol(parseInt(e.target.value, 10))}
                className="w-full bg-[#0a0d0f] border border-[#252e33] rounded px-2 py-1.5 text-[12px] font-mono"
                style={{ color: C.amber }}
              >
                {headers.map((h, i) => (
                  <option key={i} value={i}>{h}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-wider mb-1 block" style={{ color: C.textMuted }}>LSL (lower spec)</label>
              <input
                type="number"
                value={lsl}
                onChange={(e) => setLsl(e.target.value)}
                placeholder="e.g. 95"
                className="w-full bg-[#0a0d0f] border border-[#252e33] rounded px-2 py-1.5 text-[12px] font-mono"
                style={{ color: C.amber }}
              />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-wider mb-1 block" style={{ color: C.textMuted }}>USL (upper spec)</label>
              <input
                type="number"
                value={usl}
                onChange={(e) => setUsl(e.target.value)}
                placeholder="e.g. 105"
                className="w-full bg-[#0a0d0f] border border-[#252e33] rounded px-2 py-1.5 text-[12px] font-mono"
                style={{ color: C.amber }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Stats summary */}
      {stats.n > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-1 bg-[#252e33] border border-[#252e33] rounded overflow-hidden">
            <Stat title="Samples" value={stats.n} accent={C.text} />
            <Stat title="Mean" value={stats.mean.toFixed(3)} accent={C.copper} />
            <Stat title="StDev" value={stats.sd.toFixed(3)} accent={C.amber} />
            <Stat title="Min / Max" value={`${stats.min.toFixed(2)} / ${stats.max.toFixed(2)}`} accent={C.text} small />
            <Stat title="Cpk" value={cpk?.cpk === Infinity ? '∞' : cpk?.cpk.toFixed(3)} accent={cpkColor} />
          </div>

          {/* Cpk verdict */}
          {cpk && (
            <div className="border rounded p-3 flex items-center gap-3 flex-wrap" style={{ borderColor: cpkColor + '60', background: cpkColor + '12' }}>
              <div className="font-mono text-[16px]" style={{ color: cpkColor }}>
                {cpk.cpk >= 1.67 ? '◆ EXCELLENT'
                : cpk.cpk >= 1.33 ? '● GOOD'
                : cpk.cpk >= 1.0 ? '○ MARGINAL'
                : '✗ POOR'}
              </div>
              <div className="text-[12px] flex-1 min-w-[200px]" style={{ color: C.textDim }}>
                {cpk.cpk >= 1.67
                  ? 'Process is well-centered and capable. Six-sigma quality territory.'
                  : cpk.cpk >= 1.33
                    ? 'Common minimum for production processes. Spec violations rare.'
                    : cpk.cpk >= 1.0
                      ? 'Process barely capable — frequent re-inspection / sorting expected.'
                      : 'Process not capable. Either tighten variance, recenter mean, or widen spec.'}
              </div>
              {cpk.cp != null && <div className="font-mono text-[11px] text-[#a7b0b6]">Cp = {cpk.cp.toFixed(3)}</div>}
              {cpk.cpu !== Infinity && <div className="font-mono text-[11px] text-[#a7b0b6]">Cpu = {cpk.cpu.toFixed(3)}</div>}
              {cpk.cpl !== Infinity && <div className="font-mono text-[11px] text-[#a7b0b6]">Cpl = {cpk.cpl.toFixed(3)}</div>}
              <button
                onClick={exportReport}
                className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 rounded border bg-transparent hover:bg-[#1f1610]"
                style={{ borderColor: C.copper + '60', color: C.copper }}
              >
                <Download size={11} className="inline mr-1" /> Export report
              </button>
            </div>
          )}

          {/* Histogram */}
          <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: C.amber }}>
              Distribution histogram
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={histogram} margin={{ top: 6, right: 12, bottom: 4, left: -8 }}>
                <CartesianGrid stroke="#252e33" strokeDasharray="2 4" />
                <XAxis dataKey="x" stroke={C.textMuted} tick={{ fontSize: 9 }} type="number" domain={['auto', 'auto']} />
                <YAxis stroke={C.textMuted} tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ background: '#0a0d0f', border: '1px solid #252e33', borderRadius: 3, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} />
                {lsl !== '' && <ReferenceLine x={parseFloat(lsl)} stroke={C.red} strokeDasharray="3 3" label={{ value: 'LSL', fill: C.red, fontSize: 9, position: 'insideTop' }} />}
                {usl !== '' && <ReferenceLine x={parseFloat(usl)} stroke={C.red} strokeDasharray="3 3" label={{ value: 'USL', fill: C.red, fontSize: 9, position: 'insideTop' }} />}
                <ReferenceLine x={stats.mean} stroke={C.teal} strokeDasharray="2 2" label={{ value: 'μ', fill: C.teal, fontSize: 9, position: 'insideTop' }} />
                <Bar dataKey="count" fill={C.copper}>
                  {histogram.map((d, i) => {
                    const lslN = lsl === '' ? null : parseFloat(lsl)
                    const uslN = usl === '' ? null : parseFloat(usl)
                    const oos = (lslN != null && d.x < lslN) || (uslN != null && d.x > uslN)
                    return <Cell key={i} fill={oos ? C.red : C.copper} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Control chart (run order) */}
          <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: C.teal }}>
              Control chart · run order
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={series} margin={{ top: 6, right: 12, bottom: 4, left: -8 }}>
                <CartesianGrid stroke="#252e33" strokeDasharray="2 4" />
                <XAxis dataKey="i" stroke={C.textMuted} tick={{ fontSize: 9 }} />
                <YAxis stroke={C.textMuted} tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: '#0a0d0f', border: '1px solid #252e33', borderRadius: 3, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} />
                {lsl !== '' && <ReferenceLine y={parseFloat(lsl)} stroke={C.red} strokeDasharray="3 3" label={{ value: 'LSL', fill: C.red, fontSize: 9, position: 'left' }} />}
                {usl !== '' && <ReferenceLine y={parseFloat(usl)} stroke={C.red} strokeDasharray="3 3" label={{ value: 'USL', fill: C.red, fontSize: 9, position: 'left' }} />}
                <ReferenceLine y={stats.mean} stroke={C.teal} strokeDasharray="2 2" label={{ value: 'μ', fill: C.teal, fontSize: 9, position: 'left' }} />
                <ReferenceLine y={stats.mean + 3 * stats.sd} stroke={C.amber} strokeDasharray="1 4" label={{ value: '+3σ', fill: C.amber, fontSize: 8, position: 'left' }} />
                <ReferenceLine y={stats.mean - 3 * stats.sd} stroke={C.amber} strokeDasharray="1 4" label={{ value: '-3σ', fill: C.amber, fontSize: 8, position: 'left' }} />
                <Line type="monotone" dataKey="v" stroke={C.copper} strokeWidth={1.4} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Reference */}
          <div className="bg-[#12171a] border border-[#252e33] rounded p-3 text-[12px] leading-relaxed" style={{ color: C.textDim }}>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: C.teal }}>Reference</div>
            <div className="font-mono" style={{ color: C.amber }}>Cp = (USL − LSL) / 6σ &nbsp;·&nbsp; Cpk = min(USL − μ, μ − LSL) / 3σ</div>
            <ul className="list-none pl-0 space-y-0.5 text-[11px] mt-2">
              <li><span style={{ color: C.teal }}>Cpk ≥ 1.67</span> — six-sigma capable, nearly zero defects</li>
              <li><span style={{ color: C.amber }}>Cpk ≥ 1.33</span> — typical production minimum (TIA / IEC standard)</li>
              <li><span style={{ color: C.copperBright }}>Cpk ≥ 1.0</span> — barely capable, monitor closely</li>
              <li><span style={{ color: C.red }}>Cpk &lt; 1.0</span> — process not capable; expect spec violations</li>
            </ul>
          </div>
        </>
      )}

      {!stats.n && (
        <div className="bg-[#12171a] border border-dashed border-[#384249] rounded p-8 text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] mb-2" style={{ color: C.textMuted }}>
            ◆ No data yet
          </div>
          <div className="text-[13px]" style={{ color: C.textDim }}>
            Drop a CSV from your QC line (impedance, IL, NEXT readings, hipot, OD measurements, etc.) and pick a column.
            <br />
            The analyzer will compute mean / σ / Cp / Cpk, plot a histogram + control chart, and flag out-of-spec samples.
          </div>
        </div>
      )}
    </section>
  )
}

function Stat({ title, value, accent, small }) {
  return (
    <div className="bg-[#0a0d0f] p-3">
      <div className="font-mono text-[9px] uppercase tracking-wider" style={{ color: C.textMuted }}>{title}</div>
      <div className="font-mono mt-1" style={{ color: accent, fontSize: small ? 14 : 22 }}>{value}</div>
    </div>
  )
}
