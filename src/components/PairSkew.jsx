import React, { useState, useMemo, useRef } from 'react'
import { Upload, X, FileText, AlertTriangle, CheckCircle2, GitCompare } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { parseTouchstone, groupDelayNs } from './touchstone.js'
import { computeTDR, peakReflection } from './fft.js'

const C = {
  bgCard: '#12171a',
  border: '#252e33',
  copper: '#c97b3f',
  teal: '#5eead4',
  amber: '#fbbf24',
  red: '#f87171',
  text: '#f0ebe2',
  textDim: '#a7b0b6',
  textMuted: '#6b7479',
}

// Standards (one-way intra-pair skew limits — typical published values)
const STANDARDS = [
  { id: 'cat6a',  label: 'Cat 6A',          maxSkew_ps_per_m: 45 },
  { id: 'cat8',   label: 'Cat 8',           maxSkew_ps_per_m: 25 },
  { id: 'usb4',   label: 'USB4 / 25G+',     maxSkew_ps_per_m: 5 },
  { id: 'mil1553',label: 'MIL-STD-1553B',   maxSkew_ps_per_m: 50 },
]

export default function PairSkew() {
  const [wireA, setWireA] = useState(null)
  const [wireB, setWireB] = useState(null)
  const [vfPercent, setVfPercent] = useState(66)
  const [units, setUnits] = useState('ft') // ft | m
  const [physicalLengthOverride, setPhysicalLengthOverride] = useState(null)
  const [error, setError] = useState(null)

  const handleFile = async (file, slot) => {
    setError(null)
    if (!file) return
    try {
      const text = await file.text()
      const portsHint = file.name.toLowerCase().endsWith('.s2p') ? 2 : 1
      const parsed = parseTouchstone(text, { ports: portsHint })
      if (slot === 'a') setWireA({ name: file.name, parsed })
      else setWireB({ name: file.name, parsed })
    } catch (err) {
      setError(`${file.name}: ${err.message}`)
    }
  }

  // Per-wire derived metrics (TDR end peak, electrical length, VF)
  const metrics = useMemo(() => {
    const calc = (entry) => {
      if (!entry) return null
      const tdr = computeTDR(entry.parsed.s.map((b) => b.s11), entry.parsed.freqs, vfPercent / 100, units === 'ft')
      const endPeak = peakReflection(tdr.distances, tdr.rho, units === 'ft' ? 1 : 0.3, Infinity)
      if (!endPeak) return { tdr, endPeak: null }
      // Round-trip time at end peak: τ = 2·d / (vf·c) — but we used the user's vf to make distance,
      // so τ_round_trip = 2·d / (vf·c). However, this is interdependent. The actual measured electrical length
      // is reflected in the TDR — different wires with same physical length but different VF show different distances.
      const c = 299792458
      const dMeters = units === 'ft' ? endPeak.distance / 3.28084 : endPeak.distance
      const tau_round = (2 * dMeters) / (vfPercent / 100 * c) // seconds, round trip
      return { tdr, endPeak, dMeters, tau_round }
    }
    return { a: calc(wireA), b: calc(wireB) }
  }, [wireA, wireB, vfPercent, units])

  // Skew calculation
  const skew = useMemo(() => {
    if (!metrics.a?.endPeak || !metrics.b?.endPeak) return null
    // If user overrides physical length, use it; else assume both wires have same physical length L
    // (cut from same reel) and use the average TDR distance as L.
    const c = 299792458
    const L_m = physicalLengthOverride
      ? (units === 'ft' ? physicalLengthOverride / 3.28084 : physicalLengthOverride)
      : (metrics.a.dMeters + metrics.b.dMeters) / 2
    // One-way prop delay for each wire
    const tA = metrics.a.tau_round / 2
    const tB = metrics.b.tau_round / 2
    const delta_oneway = tA - tB // seconds (signed)
    // Per-meter skew rate (using L_m as the assumed common physical length)
    const skew_per_m = (delta_oneway / L_m) * 1e12 // ps/m
    return {
      L_m,
      L_ft: L_m * 3.28084,
      tau_round_A: metrics.a.tau_round,
      tau_round_B: metrics.b.tau_round,
      delta_oneway_ps: delta_oneway * 1e12,
      skew_per_m,
      skew_per_ft: skew_per_m / 3.28084,
      skew_total_ps: delta_oneway * 1e12,
      vf_A: (2 * L_m) / metrics.a.tau_round / c,
      vf_B: (2 * L_m) / metrics.b.tau_round / c,
    }
  }, [metrics, physicalLengthOverride, units])

  // Group delay overlay (S11 phase vs frequency)
  const gdData = useMemo(() => {
    if (!wireA || !wireB) return []
    // Resample to wireA freq grid (assume close); compute GD on each
    const gdA = groupDelayNs(wireA.parsed.s, wireA.parsed.freqs, 's11')
    const gdB = groupDelayNs(wireB.parsed.s, wireB.parsed.freqs, 's11')
    return wireA.parsed.freqs.map((f, i) => ({
      f_mhz: f / 1e6,
      A: gdA[i],
      B: gdB[i] != null ? gdB[i] : null,
      delta_ns: gdA[i] != null && gdB[i] != null ? (gdA[i] - gdB[i]) / 2 : null, // one-way
    }))
  }, [wireA, wireB])

  const tdrOverlay = useMemo(() => {
    if (!metrics.a || !metrics.b) return []
    const tA = metrics.a.tdr
    const tB = metrics.b.tdr
    const maxLen = Math.min(tA.distances.length, tB.distances.length)
    const maxDisplay = units === 'ft' ? 60 : 18
    const out = []
    for (let i = 0; i < maxLen; i++) {
      if (tA.distances[i] > maxDisplay) break
      out.push({ d: tA.distances[i], A: tA.rho[i], B: tB.rho[i] })
    }
    return out
  }, [metrics, units])

  // Pass/fail vs each standard
  const verdicts = skew ? STANDARDS.map((s) => ({
    ...s,
    pass: Math.abs(skew.skew_per_m) <= s.maxSkew_ps_per_m,
    margin_ps: s.maxSkew_ps_per_m - Math.abs(skew.skew_per_m),
  })) : []

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="font-mono text-[11px] tracking-[0.2em] text-[#c97b3f] uppercase">◆ Pair Skew Predictor</div>
        <h1 className="text-2xl text-[#f0ebe2] font-light tracking-tight" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>
          Predict intra-pair skew before twisting
        </h1>
        <p className="text-[13px] text-[#a7b0b6] max-w-2xl leading-relaxed">
          Load two single-wire S11 measurements (Wire A, Wire B) of the same nominal length. The tool compares
          electrical length / velocity factor and projects the resulting <span className="text-[#fbbf24]">intra-pair skew (ps/m)</span> when
          these two wires are twisted into a differential pair. Lower mismatch → tighter pair, higher data-rate ceiling.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-3">
        <FileSlot label="Wire A" accent={C.copper} entry={wireA} onFile={(f) => handleFile(f, 'a')} onClear={() => setWireA(null)} />
        <FileSlot label="Wire B" accent={C.teal} entry={wireB} onFile={(f) => handleFile(f, 'b')} onClear={() => setWireB(null)} />
      </div>

      {error && (
        <div className="px-3 py-2 bg-[#2a1010] border border-[#7a2020] rounded text-[12px] text-[#f87171] flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {wireA && wireB && (
        <>
          <div className="bg-[#12171a] border border-[#252e33] rounded p-3 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px]">
            <Field label="Velocity Factor (VF)">
              <div className="flex items-center gap-2">
                <input type="range" min="40" max="100" step="1" value={vfPercent} onChange={(e) => setVfPercent(parseInt(e.target.value, 10))} className="w-32" />
                <span className="font-mono text-[#fbbf24] w-12">{vfPercent}%</span>
              </div>
            </Field>
            <Field label="Distance unit">
              <div className="flex gap-1">
                {['ft', 'm'].map((u) => (
                  <button key={u} onClick={() => setUnits(u)} className={`px-2 py-1 rounded font-mono text-[11px] uppercase ${units === u ? 'bg-[#2a1d14] text-[#fbbf24] border border-[#3d2a1c]' : 'text-[#6b7479] hover:text-[#fbbf24]'}`}>{u}</button>
                ))}
              </div>
            </Field>
            <Field label={`Physical length override (${units})`}>
              <NumIn
                value={physicalLengthOverride ?? ''}
                placeholder="auto"
                onChange={(v) => setPhysicalLengthOverride(isNaN(v) ? null : v)}
              />
            </Field>
          </div>

          {skew && <SkewPanel skew={skew} verdicts={verdicts} units={units} />}

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-[#12171a] border border-[#252e33] rounded p-4">
              <div className="font-mono text-[11px] uppercase tracking-wider text-[#c97b3f] mb-2">TDR Overlay</div>
              <ChartShell data={tdrOverlay} xKey="d" xUnit={units} yLabel="ρ" yDomain={[-0.3, 0.3]}>
                <Line type="monotone" dataKey="A" stroke={C.copper} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="B" stroke={C.teal} strokeWidth={2} dot={false} />
              </ChartShell>
            </div>
            <div className="bg-[#12171a] border border-[#252e33] rounded p-4">
              <div className="font-mono text-[11px] uppercase tracking-wider text-[#c97b3f] mb-2">S11 Group Delay (per-wire)</div>
              <ChartShell data={gdData} xKey="f_mhz" xUnit="MHz" yLabel="τg (ns)">
                <Line type="monotone" dataKey="A" stroke={C.copper} strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="B" stroke={C.teal} strokeWidth={1.5} dot={false} />
              </ChartShell>
            </div>
            <div className="bg-[#12171a] border border-[#252e33] rounded p-4 lg:col-span-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-[#c97b3f] mb-2">One-way Δτ (Wire A − Wire B) / 2</div>
              <ChartShell data={gdData} xKey="f_mhz" xUnit="MHz" yLabel="Δτ (ns)">
                <ReferenceLine y={0} stroke="#384249" />
                <Line type="monotone" dataKey="delta_ns" stroke={C.amber} strokeWidth={2} dot={false} />
              </ChartShell>
            </div>
          </div>
        </>
      )}

      {(!wireA || !wireB) && (
        <div className="px-4 py-12 text-center bg-[#12171a] border border-dashed border-[#252e33] rounded">
          <GitCompare size={28} className="mx-auto text-[#384249] mb-3" />
          <div className="text-[13px] text-[#6b7479]">
            Load Wire A and Wire B (.s1p each) to predict skew. Both wires should be the same nominal length —
            ideally cut from the same reel.
          </div>
        </div>
      )}
    </div>
  )
}

function SkewPanel({ skew, verdicts, units }) {
  const overall = verdicts.length === 0 ? '—'
    : verdicts.every((v) => v.pass) ? 'EXCELLENT'
    : verdicts[1]?.pass ? 'GOOD' // Cat 8 OK
    : verdicts[0]?.pass ? 'FAIR' // Cat 6A only
    : 'POOR'
  const overallColor = overall === 'EXCELLENT' ? C.teal : overall === 'GOOD' ? C.amber : overall === 'FAIR' ? '#fdba74' : C.red

  const dist = units === 'ft' ? skew.L_ft.toFixed(1) : skew.L_m.toFixed(2)
  const skewVal = units === 'ft' ? skew.skew_per_ft : skew.skew_per_m
  const totalSkew = skew.skew_total_ps

  return (
    <div className="bg-[#12171a] border rounded p-4" style={{ borderColor: overallColor + '60' }}>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 mb-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#6b7479]">Pair quality</div>
          <div className="text-2xl font-light tracking-tight mt-0.5" style={{ color: overallColor, fontFamily: '"Bricolage Grotesque", sans-serif' }}>
            {overall}
          </div>
        </div>
        <Stat label="Skew rate" value={`${skew.skew_per_m.toFixed(1)} ps/m`} sub={`${skew.skew_per_ft.toFixed(2)} ps/ft`} accent={overallColor} />
        <Stat label={`Total skew over ${dist} ${units}`} value={`${Math.abs(totalSkew).toFixed(1)} ps`} accent={C.amber} />
        <Stat label="VF (Wire A)" value={`${(skew.vf_A * 100).toFixed(2)}%`} accent={C.copper} />
        <Stat label="VF (Wire B)" value={`${(skew.vf_B * 100).toFixed(2)}%`} accent={C.teal} />
        <Stat label="ΔVF" value={`${((skew.vf_A - skew.vf_B) * 100).toFixed(3)} pp`} accent={C.amber} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {verdicts.map((v) => (
          <div
            key={v.id}
            className="p-2 rounded border bg-[#0d1416]"
            style={{ borderColor: v.pass ? C.teal + '60' : C.red + '60' }}
          >
            <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[#6b7479]">
              {v.pass ? <CheckCircle2 size={11} style={{ color: C.teal }} /> : <AlertTriangle size={11} style={{ color: C.red }} />}
              <span>{v.label}</span>
            </div>
            <div className="text-[11px] text-[#a7b0b6] mt-1">≤ {v.maxSkew_ps_per_m} ps/m</div>
            <div className="text-[11px] font-mono mt-0.5" style={{ color: v.pass ? C.teal : C.red }}>
              margin: {v.margin_ps.toFixed(1)} ps/m
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, accent }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6b7479]">{label}</div>
      <div className="text-lg font-mono mt-0.5" style={{ color: accent }}>{value}</div>
      {sub && <div className="text-[10px] text-[#6b7479] font-mono">{sub}</div>}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[#6b7479]">{label}</span>
      {children}
    </div>
  )
}

function NumIn({ value, onChange, step = '1', placeholder }) {
  return (
    <input
      type="number"
      step={step}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-20 bg-[#0a0d0f] border border-[#252e33] rounded px-1.5 py-0.5 text-[11px] font-mono text-[#fbbf24] focus:outline-none focus:border-[#c97b3f]"
    />
  )
}

function FileSlot({ label, accent, entry, onFile, onClear }) {
  const ref = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className="rounded border bg-[#12171a] p-3"
      style={{ borderColor: dragOver ? accent : C.border }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: accent }}>{label}</div>
        {entry && (
          <button onClick={onClear} className="p-1 text-[#6b7479] hover:text-[#f87171] rounded">
            <X size={13} />
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept=".s1p,.s2p,.txt" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} className="hidden" />
      {entry ? (
        <div className="text-[12px] text-[#f0ebe2]">
          <div className="font-mono truncate">{entry.name}</div>
          <div className="text-[11px] text-[#6b7479] flex items-center gap-3 mt-1">
            <span>{entry.parsed.ports}-port</span>
            <span>{entry.parsed.s.length} pts</span>
            <span>{(entry.parsed.freqs[entry.parsed.freqs.length - 1] / 1e9).toFixed(2)} GHz</span>
          </div>
        </div>
      ) : (
        <button onClick={() => ref.current?.click()} className="w-full py-4 flex flex-col items-center justify-center gap-1 text-[12px] text-[#6b7479] hover:text-[#fbbf24] hover:bg-[#171d20] rounded border border-dashed border-[#252e33]">
          <Upload size={18} />
          <span>Click or drop file</span>
        </button>
      )}
    </div>
  )
}

function ChartShell({ data, xKey, xUnit, yLabel, yDomain, children }) {
  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a2226" />
          <XAxis
            dataKey={xKey}
            stroke="#6b7479"
            tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
            label={{ value: xUnit, position: 'insideBottom', offset: -8, fill: '#6b7479', fontSize: 10 }}
          />
          <YAxis
            stroke="#6b7479"
            tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#6b7479', fontSize: 10 }}
            domain={yDomain || ['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{ background: '#0a0d0f', border: '1px solid #252e33', borderRadius: 4, fontSize: 11, fontFamily: 'JetBrains Mono' }}
            labelStyle={{ color: '#c97b3f' }}
            itemStyle={{ color: '#f0ebe2' }}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
          {children}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
