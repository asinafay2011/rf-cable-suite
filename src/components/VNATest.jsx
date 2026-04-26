import React, { useState, useMemo, useRef } from 'react'
import { Upload, X, FileText, AlertTriangle, CheckCircle2, Activity, Sparkles, GitCompare, HelpCircle, Printer } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import {
  parseTouchstone,
  returnLossDb,
  vswr,
  insertionLossDb,
  groupDelayNs,
  s11Summary,
} from './touchstone.js'
import { computeTDR, peakReflection } from './fft.js'

const C = {
  bgCard: '#12171a',
  bgCardHi: '#171d20',
  border: '#252e33',
  copper: '#c97b3f',
  copperBright: '#e89357',
  teal: '#5eead4',
  amber: '#fbbf24',
  red: '#f87171',
  text: '#f0ebe2',
  textDim: '#a7b0b6',
  textMuted: '#6b7479',
}

const DEFAULT_THRESHOLDS = {
  rl_pass_db: 15,
  rl_fail_db: 10,
  vswr_pass: 1.5,
  vswr_fail: 2.0,
  // For installed-cable QC, in-cable reflection thresholds are typically tighter than end-of-line
  reflection_pass: 0.05,
  reflection_fail: 0.10,
}

const PAIR_STANDARDS = [
  { id: 'cat6a',   label: 'Cat 6A',         maxSkew_ps_per_m: 45 },
  { id: 'cat8',    label: 'Cat 8',          maxSkew_ps_per_m: 25 },
  { id: 'usb4',    label: 'USB4 / 25G+',    maxSkew_ps_per_m: 5 },
  { id: 'mil1553', label: 'MIL-STD-1553B',  maxSkew_ps_per_m: 50 },
]

export default function VNATest() {
  const [wireA, setWireA] = useState(null) // { name, parsed }
  const [wireB, setWireB] = useState(null)
  const [vfPercent, setVfPercent] = useState(66)
  const [expectedLength, setExpectedLength] = useState(33)
  const [gateStart, setGateStart] = useState(0.5)
  const [gateEnd, setGateEnd] = useState(31)
  const [gateAuto, setGateAuto] = useState(true)
  const [units, setUnits] = useState('ft')
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS)
  const [view, setView] = useState('a') // a | b | compare | skew
  const [error, setError] = useState(null)

  const handleFile = async (file, slot) => {
    setError(null)
    if (!file) return
    try {
      const text = await file.text()
      const lower = file.name.toLowerCase()
      const portsHint = lower.endsWith('.s2p') ? 2 : lower.endsWith('.s1p') ? 1 : undefined
      const parsed = parseTouchstone(text, { ports: portsHint })
      const entry = { name: file.name, parsed }
      if (slot === 'a') {
        setWireA(entry)
        // Auto-detect cable length on Wire A load
        try {
          const tdr = computeTDR(parsed.s.map((b) => b.s11), parsed.freqs, vfPercent / 100, units === 'ft')
          const endPeak = peakReflection(tdr.distances, tdr.rho, units === 'ft' ? 1 : 0.3, Infinity)
          if (endPeak && endPeak.distance > 0) {
            const L = parseFloat(endPeak.distance.toFixed(1))
            setExpectedLength(L)
            if (gateAuto) setGateEnd(parseFloat((L * 0.95).toFixed(1)))
          }
        } catch {}
      } else {
        setWireB(entry)
      }
    } catch (err) {
      setError(`${file.name}: ${err.message}`)
    }
  }

  const DEMOS = [
    {
      id: 'good',
      label: 'Good pair',
      hint: 'matched VF, no defects → EXCELLENT',
      build: () => ({
        a: synthTouchstone({ name: 'demo_good_wireA.s1p', length_ft: 33, vf: 0.6650, defects: [] }),
        b: synthTouchstone({ name: 'demo_good_wireB.s1p', length_ft: 33, vf: 0.6648, defects: [] }),
      }),
    },
    {
      id: 'mixed',
      label: 'Mixed pair',
      hint: 'clean Wire A + defective Wire B, matched VF → skew passes but B fails QC',
      build: () => ({
        a: synthTouchstone({ name: 'demo_mixed_wireA_clean.s1p', length_ft: 33, vf: 0.6650, defects: [] }),
        b: synthTouchstone({ name: 'demo_mixed_wireB_defect.s1p', length_ft: 33, vf: 0.6648, defects: [{ at_ft: 12, rho: 0.35 }] }),
      }),
    },
    {
      id: 'bad',
      label: 'Bad pair',
      hint: 'kink @ 12 ft + 1.5 pp VF mismatch → POOR',
      build: () => ({
        a: synthTouchstone({ name: 'demo_bad_wireA_clean.s1p', length_ft: 33, vf: 0.665, defects: [] }),
        b: synthTouchstone({ name: 'demo_bad_wireB_defect.s1p', length_ft: 33, vf: 0.650, defects: [{ at_ft: 12, rho: 0.35 }] }),
      }),
    },
  ]

  const loadDemo = (id) => {
    const demo = DEMOS.find((d) => d.id === id)
    if (!demo) return
    const { a, b } = demo.build()
    setWireA(a)
    setWireB(b)
    setExpectedLength(33)
    if (gateAuto) setGateEnd(31)
    setError(null)
  }

  const clearAll = () => {
    setWireA(null); setWireB(null); setError(null)
  }

  const printReport = () => {
    const prevTitle = document.title
    document.title = `VNA-Lab-Report-${new Date().toISOString().slice(0, 10)}`
    document.body.setAttribute('data-vna-print', '1')
    const onAfter = () => {
      document.title = prevTitle
      document.body.removeAttribute('data-vna-print')
      window.removeEventListener('afterprint', onAfter)
    }
    window.addEventListener('afterprint', onAfter)
    setTimeout(() => window.print(), 100)
  }

  return (
    <div className="space-y-6 vna-print-root">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: white !important; color: #111 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* Hide everything outside the VNA Lab content when printing */
          body[data-vna-print="1"] *:not(.vna-print-root):not(.vna-print-root *) { display: none !important; }
          body[data-vna-print="1"] .vna-print-root { display: block !important; }
          /* Hide chrome that shouldn't appear in the PDF */
          body[data-vna-print="1"] .vna-print-hide,
          body[data-vna-print="1"] header.sticky,
          body[data-vna-print="1"] .fixed.bottom-4 { display: none !important; }
          /* Light theme overrides for readability on paper */
          body[data-vna-print="1"] .vna-print-root,
          body[data-vna-print="1"] .vna-print-root * {
            color: #111 !important;
            background: white !important;
            border-color: #ccc !important;
          }
          body[data-vna-print="1"] .vna-print-root .recharts-line path { stroke: #b45309 !important; }
          body[data-vna-print="1"] .vna-print-root .recharts-cartesian-axis-tick-value tspan { fill: #555 !important; }
          body[data-vna-print="1"] .vna-print-root .recharts-cartesian-grid line { stroke: #ddd !important; }
          /* Show a print-only header */
          .vna-print-only { display: none; }
          body[data-vna-print="1"] .vna-print-only { display: block !important; }
        }
      `}</style>

      <div className="vna-print-only" style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 2, color: '#b45309', textTransform: 'uppercase' }}>◆ VNA Lab · Single-wire QC + Pair Prediction Report</div>
        <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Generated {new Date().toLocaleString()} · brian-coax-lab.vercel.app</div>
        <hr style={{ marginTop: 8, border: 'none', borderTop: '1px solid #b45309' }} />
      </div>

      <header className="space-y-2">
        <div className="font-mono text-[11px] tracking-[0.2em] text-[#c97b3f] uppercase">◆ VNA Lab · Single-wire QC + Pair prediction</div>
        <h1 className="text-2xl text-[#f0ebe2] font-light tracking-tight" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>
          Touchstone analysis (.s1p / .s2p)
        </h1>
        <p className="text-[13px] text-[#a7b0b6] max-w-3xl leading-relaxed">
          Upload one wire to QC it (S11, VSWR, TDR with defect detection). Upload a second wire to also predict
          intra-pair skew when the two are twisted into a differential pair. Single tab covers the full workflow:
          measure → QC each → predict pair quality before twisting.
        </p>
        <div className="flex flex-wrap gap-2 pt-1 items-center vna-print-hide">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#6b7479] mr-1">Try a demo:</span>
          {DEMOS.map((d) => (
            <button
              key={d.id}
              onClick={() => loadDemo(d.id)}
              className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded border bg-transparent flex items-center gap-1.5 hover:bg-[#1f1610] transition-colors"
              style={{
                color: d.id === 'good' ? C.teal : d.id === 'mixed' ? '#fdba74' : C.amber,
                borderColor: (d.id === 'good' ? C.teal : d.id === 'mixed' ? '#fdba74' : C.amber) + '60',
              }}
              title={d.hint}
            >
              <Sparkles size={12} />
              {d.label}
              <span className="text-[#6b7479] normal-case tracking-normal">— {d.hint}</span>
            </button>
          ))}
          {(wireA || wireB) && (
            <button
              onClick={printReport}
              className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded border bg-transparent flex items-center gap-1.5 text-[#a7b0b6] hover:text-[#fbbf24] hover:bg-[#1f1610]"
              style={{ borderColor: C.border }}
              title="Print or save the current view as PDF (use 'Save as PDF' in the print dialog)"
            >
              <Printer size={12} />
              Print / PDF
            </button>
          )}
          {(wireA || wireB) && (
            <button
              onClick={clearAll}
              className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded border bg-transparent text-[#6b7479] hover:text-[#f87171] hover:border-[#7a2020]"
              style={{ borderColor: C.border }}
            >
              Clear
            </button>
          )}
        </div>
      </header>

      <div className="grid md:grid-cols-2 gap-3">
        <FileSlot label="Wire A" sub="(DUT — primary measurement)" accent={C.copper} entry={wireA}
          onFile={(f) => handleFile(f, 'a')} onClear={() => setWireA(null)} />
        <FileSlot label="Wire B" sub="(pair partner — for comparison + skew prediction)" accent={C.teal} entry={wireB}
          onFile={(f) => handleFile(f, 'b')} onClear={() => setWireB(null)} />
      </div>

      {error && (
        <div className="px-3 py-2 bg-[#2a1010] border border-[#7a2020] rounded text-[12px] text-[#f87171] flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {(wireA || wireB) && (
        <ControlBar
          vfPercent={vfPercent} setVfPercent={setVfPercent}
          expectedLength={expectedLength}
          setExpectedLength={(v) => { setExpectedLength(v); if (gateAuto) setGateEnd(parseFloat((v * 0.95).toFixed(1))) }}
          gateStart={gateStart} setGateStart={(v) => { setGateStart(v); setGateAuto(false) }}
          gateEnd={gateEnd} setGateEnd={(v) => { setGateEnd(v); setGateAuto(false) }}
          gateAuto={gateAuto} setGateAuto={setGateAuto}
          units={units} setUnits={setUnits}
          thresholds={thresholds} setThresholds={setThresholds}
        />
      )}

      {(wireA || wireB) && (
        <ViewTabs
          view={view} setView={setView}
          hasA={!!wireA} hasB={!!wireB}
        />
      )}

      {view === 'a' && wireA && (
        <SingleWireView wire={wireA} accent={C.copper}
          thresholds={thresholds} vfPercent={vfPercent} units={units}
          gateStart={gateStart} gateEnd={gateEnd} expectedLength={expectedLength} />
      )}
      {view === 'b' && wireB && (
        <SingleWireView wire={wireB} accent={C.teal}
          thresholds={thresholds} vfPercent={vfPercent} units={units}
          gateStart={gateStart} gateEnd={gateEnd} expectedLength={expectedLength} />
      )}
      {view === 'compare' && wireA && wireB && (
        <CompareView wireA={wireA} wireB={wireB}
          vfPercent={vfPercent} units={units} expectedLength={expectedLength}
          gateStart={gateStart} gateEnd={gateEnd} thresholds={thresholds} />
      )}
      {view === 'skew' && wireA && wireB && (
        <PairSkewView wireA={wireA} wireB={wireB} vfPercent={vfPercent} units={units} />
      )}

      {!wireA && !wireB && (
        <div className="px-4 py-12 text-center bg-[#12171a] border border-dashed border-[#252e33] rounded">
          <FileText size={28} className="mx-auto text-[#384249] mb-3" />
          <div className="text-[13px] text-[#6b7479]">
            Upload .s1p or .s2p files, or click <span className="text-[#fbbf24]">Load demo</span> above to see the full flow.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Synthesize a Touchstone for the demo button ─────────
function synthTouchstone({ name, length_ft, vf, defects = [] }) {
  const fStart = 1e6, fStop = 3e9, n = 1601, c = 299792458
  const tauEnd = (2 * (length_ft / 3.28084)) / (vf * c)
  const length_m = length_ft / 3.28084
  // Skin-effect loss: α ≈ α0·√(f / f0) Np/m. α0 ~0.05 Np/m at 1 GHz is typical of small RG-58-class cable.
  const alpha0 = 0.05
  const lines = [`! Demo synthetic — VF=${(vf * 100).toFixed(1)}%, length=${length_ft} ft`, '# MHz S MA R 50']
  const sBlocks = []
  const freqs = []
  for (let i = 0; i < n; i++) {
    const f = fStart + ((fStop - fStart) * i) / (n - 1)
    const w = 2 * Math.PI * f
    const alpha_f = alpha0 * Math.sqrt(f / 1e9) // Np/m
    const roundTripLoss = Math.exp(-2 * alpha_f * length_m)
    // Open termination ρ_end = 1.0 (full reflection) attenuated by round-trip loss
    let re = 1.0 * roundTripLoss * Math.cos(-w * tauEnd)
    let im = 1.0 * roundTripLoss * Math.sin(-w * tauEnd)
    for (const d of defects) {
      const dist_m = d.at_ft / 3.28084
      const dLoss = Math.exp(-2 * alpha_f * dist_m)
      const tau = (2 * dist_m) / (vf * c)
      re += d.rho * dLoss * Math.cos(-w * tau)
      im += d.rho * dLoss * Math.sin(-w * tau)
    }
    const mag = Math.sqrt(re * re + im * im)
    const ang = Math.atan2(im, re) * 180 / Math.PI
    lines.push(`${(f / 1e6).toFixed(6)}  ${mag.toFixed(6)}  ${ang.toFixed(4)}`)
    sBlocks.push({ s11: { re, im } })
    freqs.push(f)
  }
  return {
    name,
    parsed: { format: 'MA', freqs, refZ: 50, ports: 1, s: sBlocks },
  }
}

// ── File slot ───────────────────────────────────────────
function FileSlot({ label, sub, accent, entry, onFile, onClear }) {
  const ref = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className="rounded border bg-[#12171a] p-3 transition-colors"
      style={{ borderColor: dragOver ? accent : C.border }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono text-[10px] uppercase tracking-wider flex items-baseline gap-2" style={{ color: accent }}>
          <span>{label}</span>
          {sub && <span className="text-[#6b7479] normal-case tracking-normal text-[10px]">{sub}</span>}
        </div>
        {entry && (
          <button onClick={onClear} className="p-1 text-[#6b7479] hover:text-[#f87171] rounded" title="Remove">
            <X size={13} />
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept=".s1p,.s2p,.s3p,.s4p,.txt" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} className="hidden" />
      {entry ? (
        <div className="text-[12px] text-[#f0ebe2] space-y-1">
          <div className="font-mono truncate" title={entry.name}>{entry.name}</div>
          <div className="text-[11px] text-[#6b7479] flex items-center gap-3 flex-wrap">
            <span>{entry.parsed.ports}-port</span>
            <span>{entry.parsed.s.length} pts</span>
            <span>{(entry.parsed.freqs[0] / 1e6).toFixed(1)} – {(entry.parsed.freqs[entry.parsed.freqs.length - 1] / 1e9).toFixed(2)} GHz</span>
            <span>{entry.parsed.refZ}Ω ref</span>
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

// ── Control bar ────────────────────────────────────────
function ControlBar({ vfPercent, setVfPercent, expectedLength, setExpectedLength, gateStart, setGateStart, gateEnd, setGateEnd, gateAuto, setGateAuto, units, setUnits, thresholds, setThresholds }) {
  return (
    <div className="bg-[#12171a] border border-[#252e33] rounded p-3 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px]">
      <Field
        label="Velocity Factor (VF)"
        hint="Fraction of c at which signals propagate in the cable. VF = 1/√εᵣ. Solid PE ≈ 0.66, foamed PE ≈ 0.82–0.88, PTFE ≈ 0.69. Drives the time-to-distance conversion in TDR."
      >
        <div className="flex items-center gap-2">
          <input type="range" min="40" max="100" step="1" value={vfPercent} onChange={(e) => setVfPercent(parseInt(e.target.value, 10))} className="w-32" />
          <span className="font-mono text-[#fbbf24] w-12">{vfPercent}%</span>
        </div>
      </Field>
      <Field
        label={`Expected length (${units})`}
        hint="Physical length of the cable under test. Used to place the 'cable end' marker on the TDR plot and (when 'auto' gate is on) to set the upper search bound for in-cable defect detection."
      >
        <NumIn value={expectedLength} step="0.5" min={0} onChange={setExpectedLength} />
      </Field>
      <Field
        label={`Defect search gate (${units})`}
        hint="Distance window where the verdict looks for in-cable reflections. Excludes near-connector ringing (low side) and the open/short termination at the cable end (high side). Click 'auto' to tie the upper bound to 95 % of the expected length."
      >
        <div className="flex items-center gap-1">
          <NumIn value={gateStart} step="0.5" min={0} onChange={setGateStart} />
          <span className="text-[#6b7479]">–</span>
          <NumIn value={gateEnd} step="0.5" min={0} onChange={setGateEnd} />
          <button onClick={() => setGateAuto((v) => !v)} className={`ml-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider rounded font-mono ${gateAuto ? 'bg-[#2a1d14] text-[#fbbf24] border border-[#3d2a1c]' : 'text-[#6b7479] border border-[#252e33] hover:text-[#fbbf24]'}`} title="Gate auto-tracks expected length × 0.95">auto</button>
        </div>
      </Field>
      <Field label="Distance unit">
        <div className="flex gap-1">
          {['ft', 'm'].map((u) => (
            <button key={u} onClick={() => setUnits(u)} className={`px-2 py-1 rounded font-mono text-[11px] uppercase ${units === u ? 'bg-[#2a1d14] text-[#fbbf24] border border-[#3d2a1c]' : 'text-[#6b7479] hover:text-[#fbbf24]'}`}>{u}</button>
          ))}
        </div>
      </Field>
      <Field
        label="RL pass / fail (dB)"
        hint="Mean return loss thresholds. Higher = better match. Typical: 15 dB pass / 10 dB fail for installed cable; 20 dB / 15 dB for premium. Skipped automatically for open-ended measurements (peak |S11| > 0.7)."
      >
        <div className="flex items-center gap-1">
          <NumIn value={thresholds.rl_pass_db} min={0} max={60} onChange={(v) => setThresholds((t) => ({ ...t, rl_pass_db: v }))} />
          <span className="text-[#6b7479]">/</span>
          <NumIn value={thresholds.rl_fail_db} min={0} max={60} validate={(v) => v < thresholds.rl_pass_db} onChange={(v) => setThresholds((t) => ({ ...t, rl_fail_db: v }))} />
        </div>
      </Field>
      <Field
        label="VSWR pass / fail"
        hint="Maximum acceptable VSWR. 1.0 is perfect match. Typical: 1.5 pass / 2.0 fail for general-purpose. Skipped for open-ended measurements where VSWR → ∞ by design."
      >
        <div className="flex items-center gap-1">
          <NumIn value={thresholds.vswr_pass} step="0.1" min={1} max={20} onChange={(v) => setThresholds((t) => ({ ...t, vswr_pass: v }))} />
          <span className="text-[#6b7479]">/</span>
          <NumIn value={thresholds.vswr_fail} step="0.1" min={1} max={20} validate={(v) => v > thresholds.vswr_pass} onChange={(v) => setThresholds((t) => ({ ...t, vswr_fail: v }))} />
        </div>
      </Field>
      <Field
        label="Reflection peak pass / fail"
        hint="Largest |ρ| allowed within the gate (i.e., a defect inside the cable). 0 = perfect, 1 = open/short. Tighter for installation QC: 0.05 pass / 0.10 fail catches typical kinks/crushes."
      >
        <div className="flex items-center gap-1">
          <NumIn value={thresholds.reflection_pass} step="0.01" min={0} max={1} onChange={(v) => setThresholds((t) => ({ ...t, reflection_pass: v }))} />
          <span className="text-[#6b7479]">/</span>
          <NumIn value={thresholds.reflection_fail} step="0.01" min={0} max={1} validate={(v) => v > thresholds.reflection_pass} onChange={(v) => setThresholds((t) => ({ ...t, reflection_fail: v }))} />
        </div>
      </Field>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[#6b7479] flex items-center gap-1">
        {label}
        {hint && (
          <span className="relative group">
            <HelpCircle size={11} className="text-[#384249] hover:text-[#fbbf24] cursor-help" />
            <span className="invisible group-hover:visible absolute left-0 top-full mt-1 z-50 w-64 p-2 bg-[#0a0d0f] border border-[#384249] rounded text-[10px] normal-case tracking-normal text-[#a7b0b6] leading-relaxed font-sans shadow-xl">
              {hint}
            </span>
          </span>
        )}
      </span>
      {children}
    </div>
  )
}
function NumIn({ value, onChange, step = '1', placeholder, min, max, validate }) {
  const v = typeof value === 'number' ? value : parseFloat(value)
  const isInvalid = (typeof v === 'number' && !isNaN(v)) && (
    (min != null && v < min) ||
    (max != null && v > max) ||
    (validate && !validate(v))
  )
  return (
    <input
      type="number"
      step={step}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-16 bg-[#0a0d0f] border rounded px-1.5 py-0.5 text-[11px] font-mono text-[#fbbf24] focus:outline-none"
      style={{
        borderColor: isInvalid ? '#7a2020' : '#252e33',
        boxShadow: isInvalid ? '0 0 0 1px rgba(248, 113, 113, 0.4)' : undefined,
      }}
      onFocus={(e) => { if (!isInvalid) e.currentTarget.style.borderColor = '#c97b3f' }}
      onBlur={(e) => { e.currentTarget.style.borderColor = isInvalid ? '#7a2020' : '#252e33' }}
    />
  )
}

// ── View sub-tabs ───────────────────────────────────────
function ViewTabs({ view, setView, hasA, hasB }) {
  const tabs = [
    { id: 'a',       label: 'Wire A QC',     enabled: hasA, icon: Activity },
    { id: 'b',       label: 'Wire B QC',     enabled: hasB, icon: Activity },
    { id: 'compare', label: 'Pair Compare',  enabled: hasA && hasB, icon: GitCompare },
    { id: 'skew',    label: 'Pair Skew',     enabled: hasA && hasB, icon: GitCompare },
  ]
  return (
    <div className="flex flex-wrap gap-1 border-b border-[#252e33] pb-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          disabled={!t.enabled}
          onClick={() => setView(t.id)}
          className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-sm flex items-center gap-1.5 transition-colors ${
            !t.enabled ? 'text-[#384249] cursor-not-allowed'
            : view === t.id ? 'bg-[#2a1d14] text-[#fbbf24] border border-[#3d2a1c]'
            : 'text-[#a7b0b6] hover:text-[#fbbf24] hover:bg-[#1f1610] border border-transparent'
          }`}
        >
          <t.icon size={11} />
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Single-wire view (Verdict + plot tabs for one wire) ─
function SingleWireView({ wire, accent, thresholds, vfPercent, units, gateStart, gateEnd, expectedLength }) {
  const [plot, setPlot] = useState('s11')
  return (
    <>
      <Verdict wire={wire} thresholds={thresholds} vfPercent={vfPercent} units={units} gateStart={gateStart} gateEnd={gateEnd} accent={accent} />
      <PlotSelector ports={wire.parsed.ports} active={plot} setActive={setPlot} />
      <div className="bg-[#12171a] border border-[#252e33] rounded p-4">
        {plot === 's11' && <S11Plot wire={wire} thresholds={thresholds} accent={accent} />}
        {plot === 'vswr' && <VSWRPlot wire={wire} thresholds={thresholds} accent={accent} />}
        {plot === 'tdr' && <TDRPlot wire={wire} vfPercent={vfPercent} units={units} thresholds={thresholds} expectedLength={expectedLength} gateStart={gateStart} gateEnd={gateEnd} accent={accent} />}
        {plot === 's21' && wire.parsed.ports === 2 && <S21Plot wire={wire} accent={accent} />}
        {plot === 'gd' && wire.parsed.ports === 2 && <GroupDelayPlot wire={wire} accent={accent} />}
      </div>
    </>
  )
}

function Verdict({ wire, thresholds, vfPercent, units, gateStart, gateEnd, accent }) {
  const summary = useMemo(() => s11Summary(wire.parsed.s, wire.parsed.freqs), [wire])
  const tdr = useMemo(() => computeTDR(wire.parsed.s.map((b) => b.s11), wire.parsed.freqs, vfPercent / 100, units === 'ft'), [wire, vfPercent, units])
  const peak = useMemo(() => peakReflection(tdr.distances, tdr.rho, gateStart, gateEnd), [tdr, gateStart, gateEnd])
  const peakVSWR = useMemo(() => { let max = 0; for (const b of wire.parsed.s) max = Math.max(max, vswr(b.s11)); return max }, [wire])
  // Detect unterminated (open / short) measurement: if mean |S11| > 0.5, the cable is essentially
  // reflecting all the RF power back. RL / VSWR thresholds were designed for terminated cables —
  // applying them to an open-ended measurement always reads "FAIL". For QC of an open wire the only
  // meaningful pass-fail is the in-band TDR (defects ALONG the cable).
  const s11Stats = useMemo(() => {
    let sum = 0, peak = 0
    for (const b of wire.parsed.s) {
      const m = Math.sqrt(b.s11.re * b.s11.re + b.s11.im * b.s11.im)
      sum += m
      if (m > peak) peak = m
    }
    return { mean: sum / wire.parsed.s.length, peak }
  }, [wire])
  // Peak |S11| close to 1 = total reflection at some frequency = unterminated cable.
  // Terminated cable typically has peak |S11| < 0.3.
  const unterminated = s11Stats.peak > 0.7

  const checks = []
  if (unterminated) {
    // Skip RL/VSWR — they're meaningless for an open/short measurement.
    checks.push({ ok: 'info', msg: `Peak |S11| = ${s11Stats.peak.toFixed(2)} → open or shorted termination detected. RL / VSWR thresholds are skipped (they assume a 50 Ω-terminated cable). Pass/fail below is driven by the TDR.` })
  } else {
    if (summary.meanRL >= thresholds.rl_pass_db) checks.push({ ok: true, msg: `Mean RL ${summary.meanRL.toFixed(1)} dB ≥ ${thresholds.rl_pass_db} dB` })
    else if (summary.meanRL < thresholds.rl_fail_db) checks.push({ ok: false, msg: `Mean RL ${summary.meanRL.toFixed(1)} dB below fail threshold ${thresholds.rl_fail_db} dB` })
    else checks.push({ ok: 'warn', msg: `Mean RL ${summary.meanRL.toFixed(1)} dB — marginal` })
    if (peakVSWR <= thresholds.vswr_pass) checks.push({ ok: true, msg: `Peak VSWR ${peakVSWR.toFixed(2)} ≤ ${thresholds.vswr_pass}` })
    else if (peakVSWR > thresholds.vswr_fail) checks.push({ ok: false, msg: `Peak VSWR ${peakVSWR.toFixed(2)} above fail threshold ${thresholds.vswr_fail}` })
    else checks.push({ ok: 'warn', msg: `Peak VSWR ${peakVSWR.toFixed(2)} — marginal` })
  }
  if (peak) {
    const ar = Math.abs(peak.rho)
    if (ar <= thresholds.reflection_pass) checks.push({ ok: true, msg: `Largest in-cable reflection |ρ|=${ar.toFixed(3)} at ${peak.distance.toFixed(2)} ${units} (clean)` })
    else if (ar > thresholds.reflection_fail) checks.push({ ok: false, msg: `In-cable reflection |ρ|=${ar.toFixed(3)} at ${peak.distance.toFixed(2)} ${units} — likely defect (kink, crush, splice)` })
    else checks.push({ ok: 'warn', msg: `In-cable reflection |ρ|=${ar.toFixed(3)} at ${peak.distance.toFixed(2)} ${units} — marginal` })
  }
  const overall = checks.some((c) => c.ok === false) ? 'FAIL' : checks.some((c) => c.ok === 'warn') ? 'MARGINAL' : 'PASS'
  const overallColor = overall === 'FAIL' ? C.red : overall === 'MARGINAL' ? C.amber : C.teal

  return (
    <div className="bg-[#12171a] border rounded p-4" style={{ borderColor: overallColor + '60' }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: accent }}>{wire.name}</div>
          <div className="text-2xl font-light tracking-tight mt-0.5" style={{ color: overallColor, fontFamily: '"Bricolage Grotesque", sans-serif' }}>{overall}</div>
        </div>
        <div className="text-right text-[11px] font-mono text-[#a7b0b6] space-y-0.5">
          <div>Worst RL: <span className="text-[#fbbf24]">{summary.worstRLDb.toFixed(1)} dB</span> @ {(summary.worstFreq / 1e6).toFixed(0)} MHz</div>
          <div>Mean RL: <span className="text-[#fbbf24]">{summary.meanRL.toFixed(1)} dB</span></div>
          <div>Peak VSWR: <span className="text-[#fbbf24]">{peakVSWR.toFixed(2)}</span></div>
          {peak && <div>In-cable peak: <span className="text-[#fbbf24]">|ρ|={Math.abs(peak.rho).toFixed(3)}</span> @ {peak.distance.toFixed(2)} {units}</div>}
        </div>
      </div>
      <ul className="space-y-1 text-[12px]">
        {checks.map((c, i) => (
          <li key={i} className="flex items-start gap-2">
            {c.ok === true ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" style={{ color: C.teal }} />
              : c.ok === false ? <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: C.red }} />
              : c.ok === 'info' ? <Activity size={13} className="mt-0.5 shrink-0" style={{ color: C.copper }} />
              : <Activity size={13} className="mt-0.5 shrink-0" style={{ color: C.amber }} />}
            <span className="text-[#a7b0b6]">{c.msg}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PlotSelector({ ports, active, setActive }) {
  const tabs = [
    { id: 's11', label: 'S11 (RL)' },
    { id: 'vswr', label: 'VSWR' },
    { id: 'tdr', label: 'TDR' },
    ...(ports === 2 ? [{ id: 's21', label: 'S21 (IL)' }, { id: 'gd', label: 'Group Delay' }] : []),
  ]
  return (
    <div className="flex flex-wrap gap-1">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => setActive(t.id)}
          className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-sm transition-colors ${
            active === t.id ? 'bg-[#2a1d14] text-[#fbbf24] border border-[#3d2a1c]' : 'text-[#a7b0b6] hover:text-[#fbbf24] hover:bg-[#1f1610] border border-transparent'
          }`}>{t.label}</button>
      ))}
    </div>
  )
}

// ── Plots (single wire) ─────────────────────────────────
function S11Plot({ wire, thresholds, accent }) {
  const data = useMemo(() => wire.parsed.freqs.map((f, i) => ({ f_mhz: f / 1e6, rl: returnLossDb(wire.parsed.s[i].s11) })), [wire])
  return (
    <ChartShell title="Return Loss vs Frequency" yLabel="RL (dB)" data={data} xKey="f_mhz" xUnit="MHz">
      <ReferenceLine y={thresholds.rl_pass_db} stroke={C.teal} strokeDasharray="3 3" label={{ value: 'pass', fill: C.teal, fontSize: 10, position: 'right' }} />
      <ReferenceLine y={thresholds.rl_fail_db} stroke={C.red} strokeDasharray="3 3" label={{ value: 'fail', fill: C.red, fontSize: 10, position: 'right' }} />
      <Line type="monotone" dataKey="rl" stroke={accent} strokeWidth={2} dot={false} />
    </ChartShell>
  )
}
function VSWRPlot({ wire, thresholds, accent }) {
  const data = useMemo(() => wire.parsed.freqs.map((f, i) => ({ f_mhz: f / 1e6, vswr: vswr(wire.parsed.s[i].s11) })), [wire])
  return (
    <ChartShell title="VSWR vs Frequency" yLabel="VSWR" data={data} xKey="f_mhz" xUnit="MHz" yDomain={[1, 'auto']}>
      <ReferenceLine y={thresholds.vswr_pass} stroke={C.teal} strokeDasharray="3 3" label={{ value: 'pass', fill: C.teal, fontSize: 10, position: 'right' }} />
      <ReferenceLine y={thresholds.vswr_fail} stroke={C.red} strokeDasharray="3 3" label={{ value: 'fail', fill: C.red, fontSize: 10, position: 'right' }} />
      <Line type="monotone" dataKey="vswr" stroke={accent} strokeWidth={2} dot={false} />
    </ChartShell>
  )
}
function TDRPlot({ wire, vfPercent, units, thresholds, expectedLength, gateStart, gateEnd, accent }) {
  const tdr = useMemo(() => computeTDR(wire.parsed.s.map((b) => b.s11), wire.parsed.freqs, vfPercent / 100, units === 'ft'), [wire, vfPercent, units])
  const data = useMemo(() => {
    const maxDist = units === 'ft' ? Math.max(60, expectedLength * 1.5) : Math.max(18, expectedLength * 1.5)
    const out = []
    for (let i = 0; i < tdr.distances.length; i++) {
      if (tdr.distances[i] > maxDist) break
      out.push({ d: tdr.distances[i], rho: tdr.rho[i] })
    }
    return out
  }, [tdr, units, expectedLength])
  return (
    <ChartShell title={`TDR — Reflection Coefficient vs Distance (VF = ${vfPercent}%)`} yLabel="ρ" data={data} xKey="d" xUnit={units} yDomain={[-0.3, 0.3]}>
      <ReferenceLine y={thresholds.reflection_pass} stroke={C.teal} strokeDasharray="3 3" />
      <ReferenceLine y={-thresholds.reflection_pass} stroke={C.teal} strokeDasharray="3 3" />
      <ReferenceLine y={thresholds.reflection_fail} stroke={C.red} strokeDasharray="3 3" />
      <ReferenceLine y={-thresholds.reflection_fail} stroke={C.red} strokeDasharray="3 3" />
      {expectedLength > 0 && <ReferenceLine x={expectedLength} stroke={C.amber} strokeDasharray="2 2" label={{ value: 'cable end', fill: C.amber, fontSize: 10, position: 'top' }} />}
      <ReferenceLine x={gateStart} stroke={C.copper} strokeDasharray="4 2" strokeWidth={0.7} label={{ value: 'gate', fill: C.copper, fontSize: 9, position: 'top' }} />
      <ReferenceLine x={gateEnd} stroke={C.copper} strokeDasharray="4 2" strokeWidth={0.7} />
      <Line type="monotone" dataKey="rho" stroke={accent} strokeWidth={2} dot={false} />
    </ChartShell>
  )
}
function S21Plot({ wire, accent }) {
  const data = useMemo(() => wire.parsed.freqs.map((f, i) => ({ f_mhz: f / 1e6, s21: -insertionLossDb(wire.parsed.s[i].s21) })), [wire])
  return (
    <ChartShell title="S21 Insertion Loss vs Frequency" yLabel="S21 (dB)" data={data} xKey="f_mhz" xUnit="MHz">
      <Line type="monotone" dataKey="s21" stroke={accent} strokeWidth={2} dot={false} />
    </ChartShell>
  )
}
function GroupDelayPlot({ wire, accent }) {
  const gd = useMemo(() => groupDelayNs(wire.parsed.s, wire.parsed.freqs, 's21'), [wire])
  const data = useMemo(() => wire.parsed.freqs.map((f, i) => ({ f_mhz: f / 1e6, gd: gd[i] })), [wire, gd])
  return (
    <ChartShell title="Group Delay vs Frequency" yLabel="τg (ns)" data={data} xKey="f_mhz" xUnit="MHz">
      <Line type="monotone" dataKey="gd" stroke={accent} strokeWidth={2} dot={false} />
    </ChartShell>
  )
}

// ── Compare view ────────────────────────────────────────
function CompareView({ wireA, wireB, vfPercent, units, expectedLength, gateStart, gateEnd, thresholds }) {
  const tdrA = useMemo(() => computeTDR(wireA.parsed.s.map((b) => b.s11), wireA.parsed.freqs, vfPercent / 100, units === 'ft'), [wireA, vfPercent, units])
  const tdrB = useMemo(() => computeTDR(wireB.parsed.s.map((b) => b.s11), wireB.parsed.freqs, vfPercent / 100, units === 'ft'), [wireB, vfPercent, units])
  const tdrData = useMemo(() => {
    const maxDist = units === 'ft' ? Math.max(60, expectedLength * 1.5) : Math.max(18, expectedLength * 1.5)
    const len = Math.min(tdrA.distances.length, tdrB.distances.length)
    const out = []
    for (let i = 0; i < len; i++) {
      if (tdrA.distances[i] > maxDist) break
      out.push({ d: tdrA.distances[i], A: tdrA.rho[i], B: tdrB.rho[i] })
    }
    return out
  }, [tdrA, tdrB, units, expectedLength])
  const rlData = useMemo(() => {
    const out = []
    const len = Math.min(wireA.parsed.freqs.length, wireB.parsed.freqs.length)
    for (let i = 0; i < len; i++) {
      out.push({ f_mhz: wireA.parsed.freqs[i] / 1e6, A: returnLossDb(wireA.parsed.s[i].s11), B: returnLossDb(wireB.parsed.s[i].s11) })
    }
    return out
  }, [wireA, wireB])
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="bg-[#12171a] border border-[#252e33] rounded p-4">
        <ChartShell title="TDR Overlay (Wire A vs Wire B)" yLabel="ρ" data={tdrData} xKey="d" xUnit={units} yDomain={[-0.3, 0.3]}>
          <ReferenceLine x={gateStart} stroke={C.copper} strokeDasharray="4 2" strokeWidth={0.7} />
          <ReferenceLine x={gateEnd} stroke={C.copper} strokeDasharray="4 2" strokeWidth={0.7} />
          {expectedLength > 0 && <ReferenceLine x={expectedLength} stroke={C.amber} strokeDasharray="2 2" />}
          <Line type="monotone" dataKey="A" stroke={C.copper} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="B" stroke={C.teal} strokeWidth={2} dot={false} />
        </ChartShell>
      </div>
      <div className="bg-[#12171a] border border-[#252e33] rounded p-4">
        <ChartShell title="Return Loss Overlay" yLabel="RL (dB)" data={rlData} xKey="f_mhz" xUnit="MHz">
          <ReferenceLine y={thresholds.rl_pass_db} stroke={C.teal} strokeDasharray="3 3" />
          <ReferenceLine y={thresholds.rl_fail_db} stroke={C.red} strokeDasharray="3 3" />
          <Line type="monotone" dataKey="A" stroke={C.copper} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="B" stroke={C.teal} strokeWidth={2} dot={false} />
        </ChartShell>
      </div>
    </div>
  )
}

// ── Pair Skew view ──────────────────────────────────────
function PairSkewView({ wireA, wireB, vfPercent, units }) {
  const c = 299792458
  const skew = useMemo(() => {
    const tdrA = computeTDR(wireA.parsed.s.map((b) => b.s11), wireA.parsed.freqs, vfPercent / 100, units === 'ft')
    const tdrB = computeTDR(wireB.parsed.s.map((b) => b.s11), wireB.parsed.freqs, vfPercent / 100, units === 'ft')
    // Find the actual end (rightmost significant peak), not the largest peak — robust to in-cable defects
    // For typical cables the end peak is the LARGEST reflection — use peakReflection.
    const peakA = peakReflection(tdrA.distances, tdrA.rho, units === 'ft' ? 1 : 0.3, Infinity)
    const peakB = peakReflection(tdrB.distances, tdrB.rho, units === 'ft' ? 1 : 0.3, Infinity)
    if (!peakA || !peakB) return null
    const dA = units === 'ft' ? peakA.distance / 3.28084 : peakA.distance
    const dB = units === 'ft' ? peakB.distance / 3.28084 : peakB.distance
    const tauA = (2 * dA) / (vfPercent / 100 * c)
    const tauB = (2 * dB) / (vfPercent / 100 * c)
    const L_m = (dA + dB) / 2
    const delta_oneway = (tauA - tauB) / 2
    const skew_per_m = (delta_oneway / L_m) * 1e12
    return {
      L_m, L_ft: L_m * 3.28084,
      vf_A: (2 * L_m) / (tauA * c),
      vf_B: (2 * L_m) / (tauB * c),
      delta_oneway_ps: delta_oneway * 1e12,
      skew_per_m,
      skew_per_ft: skew_per_m / 3.28084,
    }
  }, [wireA, wireB, vfPercent, units])

  const gdData = useMemo(() => {
    const gA = groupDelayNs(wireA.parsed.s, wireA.parsed.freqs, 's11')
    const gB = groupDelayNs(wireB.parsed.s, wireB.parsed.freqs, 's11')
    const len = Math.min(gA.length, gB.length)
    const out = []
    for (let i = 0; i < len; i++) {
      out.push({ f_mhz: wireA.parsed.freqs[i] / 1e6, A: gA[i], B: gB[i], delta_ns: (gA[i] - gB[i]) / 2 })
    }
    return out
  }, [wireA, wireB])

  if (!skew) return <div className="text-[12px] text-[#6b7479]">Could not detect end-peak in one of the files — check VF or freq range.</div>

  const verdicts = PAIR_STANDARDS.map((s) => ({
    ...s,
    pass: Math.abs(skew.skew_per_m) <= s.maxSkew_ps_per_m,
    margin_ps: s.maxSkew_ps_per_m - Math.abs(skew.skew_per_m),
  }))
  const overall = verdicts.every((v) => v.pass) ? 'EXCELLENT' : verdicts[1]?.pass ? 'GOOD' : verdicts[0]?.pass ? 'FAIR' : 'POOR'
  const overallColor = overall === 'EXCELLENT' ? C.teal : overall === 'GOOD' ? C.amber : overall === 'FAIR' ? '#fdba74' : C.red

  const dist = units === 'ft' ? skew.L_ft.toFixed(1) : skew.L_m.toFixed(2)

  return (
    <div className="space-y-4">
      <div className="bg-[#12171a] border rounded p-4" style={{ borderColor: overallColor + '60' }}>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3 mb-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6b7479]">Pair quality</div>
            <div className="text-2xl font-light tracking-tight mt-0.5" style={{ color: overallColor, fontFamily: '"Bricolage Grotesque", sans-serif' }}>{overall}</div>
          </div>
          <Stat label="Skew rate" value={`${skew.skew_per_m.toFixed(1)} ps/m`} sub={`${skew.skew_per_ft.toFixed(2)} ps/ft`} accent={overallColor} />
          <Stat label={`Total skew over ${dist} ${units}`} value={`${Math.abs(skew.delta_oneway_ps).toFixed(1)} ps`} accent={C.amber} />
          <Stat label="VF (Wire A)" value={`${(skew.vf_A * 100).toFixed(2)}%`} accent={C.copper} />
          <Stat label="VF (Wire B)" value={`${(skew.vf_B * 100).toFixed(2)}%`} accent={C.teal} />
          <Stat label="ΔVF" value={`${((skew.vf_A - skew.vf_B) * 100).toFixed(3)} pp`} accent={C.amber} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {verdicts.map((v) => (
            <div key={v.id} className="p-2 rounded border bg-[#0d1416]" style={{ borderColor: v.pass ? C.teal + '60' : C.red + '60' }}>
              <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[#6b7479]">
                {v.pass ? <CheckCircle2 size={11} style={{ color: C.teal }} /> : <AlertTriangle size={11} style={{ color: C.red }} />}
                <span>{v.label}</span>
              </div>
              <div className="text-[11px] text-[#a7b0b6] mt-1">≤ {v.maxSkew_ps_per_m} ps/m</div>
              <div className="text-[11px] font-mono mt-0.5" style={{ color: v.pass ? C.teal : C.red }}>margin: {v.margin_ps.toFixed(1)} ps/m</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-[#12171a] border border-[#252e33] rounded p-4">
          <ChartShell title="S11 Group Delay (per-wire)" yLabel="τg (ns)" data={gdData} xKey="f_mhz" xUnit="MHz">
            <Line type="monotone" dataKey="A" stroke={C.copper} strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="B" stroke={C.teal} strokeWidth={1.5} dot={false} />
          </ChartShell>
        </div>
        <div className="bg-[#12171a] border border-[#252e33] rounded p-4">
          <ChartShell title="One-way Δτ (Wire A − Wire B) / 2" yLabel="Δτ (ns)" data={gdData} xKey="f_mhz" xUnit="MHz">
            <ReferenceLine y={0} stroke="#384249" />
            <Line type="monotone" dataKey="delta_ns" stroke={C.amber} strokeWidth={2} dot={false} />
          </ChartShell>
        </div>
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

// ── Shared chart wrapper ────────────────────────────────
function ChartShell({ title, yLabel, data, xKey, xUnit, yDomain, children }) {
  return (
    <div>
      {title && (
        <div className="flex items-center justify-between mb-2">
          <div className="font-mono text-[11px] uppercase tracking-wider text-[#c97b3f]">{title}</div>
          <div className="font-mono text-[10px] text-[#6b7479]">{data.length} pts</div>
        </div>
      )}
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2226" />
            <XAxis dataKey={xKey} stroke="#6b7479" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} label={{ value: xUnit, position: 'insideBottom', offset: -8, fill: '#6b7479', fontSize: 10 }} />
            <YAxis stroke="#6b7479" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#6b7479', fontSize: 10 }} domain={yDomain || ['auto', 'auto']} />
            <Tooltip contentStyle={{ background: '#0a0d0f', border: '1px solid #252e33', borderRadius: 4, fontSize: 11, fontFamily: 'JetBrains Mono' }} labelStyle={{ color: '#c97b3f' }} itemStyle={{ color: '#f0ebe2' }} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
            {children}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
