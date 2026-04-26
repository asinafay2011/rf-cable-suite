import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Upload, X, FileText, AlertTriangle, CheckCircle2, Activity, Layers, Wand2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import {
  parseTouchstone,
  cAbs,
  returnLossDb,
  vswr,
  insertionLossDb,
  groupDelayNs,
  s11Summary,
} from './touchstone.js'
import { computeTDR, peakReflection } from './fft.js'

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
  blue: '#7dd3fc',
  red: '#f87171',
  text: '#f0ebe2',
  textDim: '#a7b0b6',
  textMuted: '#6b7479',
}

// Generic pass/fail thresholds for installation QC of a single wire
const DEFAULT_THRESHOLDS = {
  rl_pass_db: 15,    // mean return loss should exceed (dB)
  rl_fail_db: 10,    // worst-case return loss must exceed (dB)
  vswr_pass: 1.5,    // peak VSWR
  vswr_fail: 2.0,
  reflection_pass: 0.10, // peak reflection coefficient amplitude (unitless)
  reflection_fail: 0.20,
}

export default function VNATest() {
  const [dut, setDut] = useState(null)        // { name, parsed }
  const [reference, setReference] = useState(null)
  const [vfPercent, setVfPercent] = useState(66) // velocity factor for TDR distance scaling
  const [expectedLength, setExpectedLength] = useState(33) // cable length in current units (excludes end reflection)
  const [gateStart, setGateStart] = useState(0.5) // distance — exclude near-connector reflection
  const [gateEnd, setGateEnd] = useState(31)      // distance — exclude end termination
  const [gateAuto, setGateAuto] = useState(true)  // when true, gate follows expectedLength
  const [error, setError] = useState(null)
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS)
  const [activePlot, setActivePlot] = useState('s11') // s11 | vswr | tdr | s21 | gd
  const [units, setUnits] = useState('ft')      // ft | m

  const handleFile = async (file, slot) => {
    setError(null)
    if (!file) return
    try {
      const text = await file.text()
      const portsHint = file.name.toLowerCase().endsWith('.s2p') ? 2 : (file.name.toLowerCase().endsWith('.s1p') ? 1 : undefined)
      const parsed = parseTouchstone(text, { ports: portsHint })
      const entry = { name: file.name, parsed }
      if (slot === 'dut') {
        setDut(entry)
        // Auto-detect cable length from end reflection (largest peak in TDR)
        try {
          const tdr = computeTDR(parsed.s.map((b) => b.s11), parsed.freqs, vfPercent / 100, units === 'ft')
          const endPeak = peakReflection(tdr.distances, tdr.rho, units === 'ft' ? 1 : 0.3, Infinity)
          if (endPeak && endPeak.distance > 0) {
            const L = parseFloat(endPeak.distance.toFixed(1))
            setExpectedLength(L)
            if (gateAuto) setGateEnd(parseFloat((L * 0.95).toFixed(1)))
          }
        } catch {}
      } else setReference(entry)
    } catch (err) {
      setError(`${file.name}: ${err.message}`)
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="font-mono text-[11px] tracking-[0.2em] text-[#c97b3f] uppercase">◆ VNA Test · Single-wire QC</div>
        <h1 className="text-2xl text-[#f0ebe2] font-light tracking-tight" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>
          Touchstone analysis (.s1p / .s2p)
        </h1>
        <p className="text-[13px] text-[#a7b0b6] max-w-2xl leading-relaxed">
          Upload a measurement from your VNA (Anritsu ShockLine / VectorStar export → Touchstone). The DUT is the
          wire under test; an optional reference (golden sample) lets you spot installation damage as a delta.
          Distance to defect is computed from S11 via inverse FFT — set the velocity factor to match your dielectric.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-3">
        <FileSlot
          label="DUT (Device Under Test)"
          accent={C.copper}
          entry={dut}
          onFile={(f) => handleFile(f, 'dut')}
          onClear={() => setDut(null)}
        />
        <FileSlot
          label="Reference (optional, golden sample)"
          accent={C.teal}
          entry={reference}
          onFile={(f) => handleFile(f, 'ref')}
          onClear={() => setReference(null)}
        />
      </div>

      {error && (
        <div className="px-3 py-2 bg-[#2a1010] border border-[#7a2020] rounded text-[12px] text-[#f87171] flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {dut && (
        <>
          <ControlBar
            vfPercent={vfPercent}
            setVfPercent={setVfPercent}
            expectedLength={expectedLength}
            setExpectedLength={(v) => {
              setExpectedLength(v)
              if (gateAuto) setGateEnd(parseFloat((v * 0.95).toFixed(1)))
            }}
            gateStart={gateStart}
            setGateStart={(v) => { setGateStart(v); setGateAuto(false) }}
            gateEnd={gateEnd}
            setGateEnd={(v) => { setGateEnd(v); setGateAuto(false) }}
            gateAuto={gateAuto}
            setGateAuto={setGateAuto}
            units={units}
            setUnits={setUnits}
            thresholds={thresholds}
            setThresholds={setThresholds}
            ports={dut.parsed.ports}
          />

          <Verdict dut={dut.parsed} thresholds={thresholds} vfPercent={vfPercent} units={units} gateStart={gateStart} gateEnd={gateEnd} />

          <PlotSelector
            ports={dut.parsed.ports}
            active={activePlot}
            setActive={setActivePlot}
          />

          <div className="bg-[#12171a] border border-[#252e33] rounded p-4">
            {activePlot === 's11' && <S11Plot dut={dut.parsed} reference={reference?.parsed} thresholds={thresholds} />}
            {activePlot === 'vswr' && <VSWRPlot dut={dut.parsed} reference={reference?.parsed} thresholds={thresholds} />}
            {activePlot === 'tdr' && <TDRPlot dut={dut.parsed} reference={reference?.parsed} vfPercent={vfPercent} units={units} thresholds={thresholds} expectedLength={expectedLength} gateStart={gateStart} gateEnd={gateEnd} />}
            {activePlot === 's21' && dut.parsed.ports === 2 && <S21Plot dut={dut.parsed} reference={reference?.parsed} />}
            {activePlot === 'gd' && dut.parsed.ports === 2 && <GroupDelayPlot dut={dut.parsed} reference={reference?.parsed} />}
          </div>
        </>
      )}

      {!dut && (
        <div className="px-4 py-12 text-center bg-[#12171a] border border-dashed border-[#252e33] rounded">
          <FileText size={28} className="mx-auto text-[#384249] mb-3" />
          <div className="text-[13px] text-[#6b7479]">
            Upload a Touchstone file to start. <span className="text-[#a7b0b6]">.s1p</span> for 1-port S11 measurement,{' '}
            <span className="text-[#a7b0b6]">.s2p</span> for 2-port (S11/S21/S12/S22).
          </div>
        </div>
      )}
    </div>
  )
}

function FileSlot({ label, accent, entry, onFile, onClear }) {
  const ref = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className="rounded border bg-[#12171a] p-3 transition-colors"
      style={{ borderColor: dragOver ? accent : C.border }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: accent }}>
          {label}
        </div>
        {entry && (
          <button onClick={onClear} className="p-1 text-[#6b7479] hover:text-[#f87171] rounded" title="Remove">
            <X size={13} />
          </button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept=".s1p,.s2p,.s3p,.s4p,.txt"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }}
        className="hidden"
      />
      {entry ? (
        <div className="text-[12px] text-[#f0ebe2] space-y-1">
          <div className="font-mono truncate" title={entry.name}>{entry.name}</div>
          <div className="text-[11px] text-[#6b7479] flex items-center gap-3">
            <span>{entry.parsed.ports}-port</span>
            <span>{entry.parsed.s.length} pts</span>
            <span>{(entry.parsed.freqs[0] / 1e6).toFixed(1)} – {(entry.parsed.freqs[entry.parsed.freqs.length - 1] / 1e9).toFixed(2)} GHz</span>
            <span>{entry.parsed.refZ}Ω ref</span>
          </div>
        </div>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          className="w-full py-4 flex flex-col items-center justify-center gap-1 text-[12px] text-[#6b7479] hover:text-[#fbbf24] hover:bg-[#171d20] rounded border border-dashed border-[#252e33]"
        >
          <Upload size={18} />
          <span>Click or drop file</span>
        </button>
      )}
    </div>
  )
}

function ControlBar({ vfPercent, setVfPercent, expectedLength, setExpectedLength, gateStart, setGateStart, gateEnd, setGateEnd, gateAuto, setGateAuto, units, setUnits, thresholds, setThresholds, ports }) {
  return (
    <div className="bg-[#12171a] border border-[#252e33] rounded p-3 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px]">
      <Field label="Velocity Factor (VF)">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="40" max="100" step="1"
            value={vfPercent}
            onChange={(e) => setVfPercent(parseInt(e.target.value, 10))}
            className="w-32"
          />
          <span className="font-mono text-[#fbbf24] w-12">{vfPercent}%</span>
        </div>
      </Field>
      <Field label={`Expected length (${units})`}>
        <NumIn value={expectedLength} step="0.5" onChange={setExpectedLength} />
      </Field>
      <Field label={`Defect search gate (${units})`}>
        <div className="flex items-center gap-1">
          <NumIn value={gateStart} step="0.5" onChange={setGateStart} />
          <span className="text-[#6b7479]">–</span>
          <NumIn value={gateEnd} step="0.5" onChange={setGateEnd} />
          <button
            onClick={() => setGateAuto((v) => !v)}
            className={`ml-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider rounded font-mono ${
              gateAuto ? 'bg-[#2a1d14] text-[#fbbf24] border border-[#3d2a1c]' : 'text-[#6b7479] border border-[#252e33] hover:text-[#fbbf24]'
            }`}
            title="Gate auto-tracks expected length × 0.95"
          >
            auto
          </button>
        </div>
      </Field>
      <Field label="Distance unit">
        <div className="flex gap-1">
          {['ft', 'm'].map((u) => (
            <button
              key={u}
              onClick={() => setUnits(u)}
              className={`px-2 py-1 rounded font-mono text-[11px] uppercase ${
                units === u ? 'bg-[#2a1d14] text-[#fbbf24] border border-[#3d2a1c]' : 'text-[#6b7479] hover:text-[#fbbf24]'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </Field>
      <Field label="RL pass / fail (dB)">
        <div className="flex items-center gap-1">
          <NumIn value={thresholds.rl_pass_db} onChange={(v) => setThresholds((t) => ({ ...t, rl_pass_db: v }))} />
          <span className="text-[#6b7479]">/</span>
          <NumIn value={thresholds.rl_fail_db} onChange={(v) => setThresholds((t) => ({ ...t, rl_fail_db: v }))} />
        </div>
      </Field>
      <Field label="VSWR pass / fail">
        <div className="flex items-center gap-1">
          <NumIn value={thresholds.vswr_pass} step="0.1" onChange={(v) => setThresholds((t) => ({ ...t, vswr_pass: v }))} />
          <span className="text-[#6b7479]">/</span>
          <NumIn value={thresholds.vswr_fail} step="0.1" onChange={(v) => setThresholds((t) => ({ ...t, vswr_fail: v }))} />
        </div>
      </Field>
      <Field label="Reflection peak pass / fail">
        <div className="flex items-center gap-1">
          <NumIn value={thresholds.reflection_pass} step="0.01" onChange={(v) => setThresholds((t) => ({ ...t, reflection_pass: v }))} />
          <span className="text-[#6b7479]">/</span>
          <NumIn value={thresholds.reflection_fail} step="0.01" onChange={(v) => setThresholds((t) => ({ ...t, reflection_fail: v }))} />
        </div>
      </Field>
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

function NumIn({ value, onChange, step = '1' }) {
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-16 bg-[#0a0d0f] border border-[#252e33] rounded px-1.5 py-0.5 text-[11px] font-mono text-[#fbbf24] focus:outline-none focus:border-[#c97b3f]"
    />
  )
}

function Verdict({ dut, thresholds, vfPercent, units, gateStart, gateEnd }) {
  const summary = useMemo(() => s11Summary(dut.s, dut.freqs), [dut])
  const tdr = useMemo(
    () => computeTDR(dut.s.map((b) => b.s11), dut.freqs, vfPercent / 100, units === 'ft'),
    [dut, vfPercent, units],
  )
  // Use the time gate for peak detection
  const peak = useMemo(
    () => peakReflection(tdr.distances, tdr.rho, gateStart, gateEnd),
    [tdr, gateStart, gateEnd],
  )
  const peakVSWR = useMemo(() => {
    let max = 0
    for (const b of dut.s) max = Math.max(max, vswr(b.s11))
    return max
  }, [dut])

  // Pass/fail logic
  const checks = []
  // Mean RL
  if (summary.meanRL >= thresholds.rl_pass_db) {
    checks.push({ ok: true, msg: `Mean RL ${summary.meanRL.toFixed(1)} dB ≥ ${thresholds.rl_pass_db} dB` })
  } else if (summary.meanRL < thresholds.rl_fail_db) {
    checks.push({ ok: false, msg: `Mean RL ${summary.meanRL.toFixed(1)} dB below fail threshold ${thresholds.rl_fail_db} dB` })
  } else {
    checks.push({ ok: 'warn', msg: `Mean RL ${summary.meanRL.toFixed(1)} dB — marginal (between ${thresholds.rl_fail_db} and ${thresholds.rl_pass_db} dB)` })
  }
  // VSWR
  if (peakVSWR <= thresholds.vswr_pass) {
    checks.push({ ok: true, msg: `Peak VSWR ${peakVSWR.toFixed(2)} ≤ ${thresholds.vswr_pass}` })
  } else if (peakVSWR > thresholds.vswr_fail) {
    checks.push({ ok: false, msg: `Peak VSWR ${peakVSWR.toFixed(2)} above fail threshold ${thresholds.vswr_fail}` })
  } else {
    checks.push({ ok: 'warn', msg: `Peak VSWR ${peakVSWR.toFixed(2)} — marginal` })
  }
  // Peak reflection
  if (peak) {
    const ar = Math.abs(peak.rho)
    if (ar <= thresholds.reflection_pass) {
      checks.push({ ok: true, msg: `Largest TDR reflection |ρ|=${ar.toFixed(3)} at ${peak.distance.toFixed(2)} ${units} (clean)` })
    } else if (ar > thresholds.reflection_fail) {
      checks.push({ ok: false, msg: `TDR reflection |ρ|=${ar.toFixed(3)} at ${peak.distance.toFixed(2)} ${units} — likely defect (kink, crush, splice)` })
    } else {
      checks.push({ ok: 'warn', msg: `TDR reflection |ρ|=${ar.toFixed(3)} at ${peak.distance.toFixed(2)} ${units} — marginal` })
    }
  }

  const overall = checks.some((c) => c.ok === false) ? 'FAIL' : checks.some((c) => c.ok === 'warn') ? 'MARGINAL' : 'PASS'
  const overallColor = overall === 'FAIL' ? C.red : overall === 'MARGINAL' ? C.amber : C.teal

  return (
    <div className="bg-[#12171a] border rounded p-4" style={{ borderColor: overallColor + '60' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#6b7479]">Verdict</div>
          <div className="text-2xl font-light tracking-tight mt-0.5" style={{ color: overallColor, fontFamily: '"Bricolage Grotesque", sans-serif' }}>
            {overall}
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-[#a7b0b6] space-y-0.5">
          <div>Worst RL: <span className="text-[#fbbf24]">{summary.worstRLDb.toFixed(1)} dB</span> @ {(summary.worstFreq / 1e6).toFixed(0)} MHz</div>
          <div>Mean RL: <span className="text-[#fbbf24]">{summary.meanRL.toFixed(1)} dB</span></div>
          <div>Peak VSWR: <span className="text-[#fbbf24]">{peakVSWR.toFixed(2)}</span></div>
          {peak && <div>TDR peak: <span className="text-[#fbbf24]">|ρ|={Math.abs(peak.rho).toFixed(3)}</span> @ {peak.distance.toFixed(2)} {units}</div>}
        </div>
      </div>
      <ul className="space-y-1 text-[12px]">
        {checks.map((c, i) => (
          <li key={i} className="flex items-start gap-2">
            {c.ok === true ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" style={{ color: C.teal }} />
              : c.ok === false ? <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: C.red }} />
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
    { id: 's11', label: 'S11 (Return Loss)' },
    { id: 'vswr', label: 'VSWR' },
    { id: 'tdr', label: 'TDR' },
    ...(ports === 2 ? [
      { id: 's21', label: 'S21 (IL)' },
      { id: 'gd', label: 'Group Delay' },
    ] : []),
  ]
  return (
    <div className="flex flex-wrap gap-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setActive(t.id)}
          className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-sm transition-colors ${
            active === t.id
              ? 'bg-[#2a1d14] text-[#fbbf24] border border-[#3d2a1c]'
              : 'text-[#a7b0b6] hover:text-[#fbbf24] hover:bg-[#1f1610] border border-transparent'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Plots ───────────────────────────────────────────────

function freqAxisData(parsed, mapper) {
  return parsed.freqs.map((f, i) => ({ f_mhz: f / 1e6, ...mapper(parsed.s[i], i) }))
}

function S11Plot({ dut, reference, thresholds }) {
  const data = useMemo(() => {
    const dutData = freqAxisData(dut, (b) => ({ dut: returnLossDb(b.s11) }))
    if (!reference) return dutData
    const refData = freqAxisData(reference, (b) => ({ reference: returnLossDb(b.s11) }))
    // Merge by frequency (assume same axis)
    return dutData.map((d, i) => ({ ...d, reference: refData[i]?.reference }))
  }, [dut, reference])

  return (
    <ChartShell title="Return Loss vs Frequency" yLabel="RL (dB)" data={data} xKey="f_mhz" xUnit="MHz">
      <ReferenceLine y={thresholds.rl_pass_db} stroke={C.teal} strokeDasharray="3 3" label={{ value: 'pass', fill: C.teal, fontSize: 10, position: 'right' }} />
      <ReferenceLine y={thresholds.rl_fail_db} stroke={C.red} strokeDasharray="3 3" label={{ value: 'fail', fill: C.red, fontSize: 10, position: 'right' }} />
      {reference && <Line type="monotone" dataKey="reference" stroke={C.teal} strokeWidth={1.5} dot={false} />}
      <Line type="monotone" dataKey="dut" stroke={C.copper} strokeWidth={2} dot={false} />
    </ChartShell>
  )
}

function VSWRPlot({ dut, reference, thresholds }) {
  const data = useMemo(() => {
    const dutData = freqAxisData(dut, (b) => ({ dut: vswr(b.s11) }))
    if (!reference) return dutData
    const refData = freqAxisData(reference, (b) => ({ reference: vswr(b.s11) }))
    return dutData.map((d, i) => ({ ...d, reference: refData[i]?.reference }))
  }, [dut, reference])

  return (
    <ChartShell title="VSWR vs Frequency" yLabel="VSWR" data={data} xKey="f_mhz" xUnit="MHz" yDomain={[1, 'auto']}>
      <ReferenceLine y={thresholds.vswr_pass} stroke={C.teal} strokeDasharray="3 3" label={{ value: 'pass', fill: C.teal, fontSize: 10, position: 'right' }} />
      <ReferenceLine y={thresholds.vswr_fail} stroke={C.red} strokeDasharray="3 3" label={{ value: 'fail', fill: C.red, fontSize: 10, position: 'right' }} />
      {reference && <Line type="monotone" dataKey="reference" stroke={C.teal} strokeWidth={1.5} dot={false} />}
      <Line type="monotone" dataKey="dut" stroke={C.copper} strokeWidth={2} dot={false} />
    </ChartShell>
  )
}

function TDRPlot({ dut, reference, vfPercent, units, thresholds, expectedLength, gateStart, gateEnd }) {
  const dutTDR = useMemo(
    () => computeTDR(dut.s.map((b) => b.s11), dut.freqs, vfPercent / 100, units === 'ft'),
    [dut, vfPercent, units],
  )
  const refTDR = useMemo(
    () => reference ? computeTDR(reference.s.map((b) => b.s11), reference.freqs, vfPercent / 100, units === 'ft') : null,
    [reference, vfPercent, units],
  )
  const data = useMemo(() => {
    // Trim to first ~150 ft (or 50 m) for display
    const maxDist = units === 'ft' ? 150 : 45
    const out = []
    for (let i = 0; i < dutTDR.distances.length; i++) {
      if (dutTDR.distances[i] > maxDist) break
      const row = { d: dutTDR.distances[i], dut: dutTDR.rho[i] }
      if (refTDR && refTDR.rho[i] != null) row.reference = refTDR.rho[i]
      out.push(row)
    }
    return out
  }, [dutTDR, refTDR, units])

  return (
    <ChartShell title={`TDR — Reflection Coefficient vs Distance (VF = ${vfPercent}%)`} yLabel="ρ" data={data} xKey="d" xUnit={units} yDomain={[-0.3, 0.3]}>
      <ReferenceLine y={thresholds.reflection_pass} stroke={C.teal} strokeDasharray="3 3" />
      <ReferenceLine y={-thresholds.reflection_pass} stroke={C.teal} strokeDasharray="3 3" />
      <ReferenceLine y={thresholds.reflection_fail} stroke={C.red} strokeDasharray="3 3" />
      <ReferenceLine y={-thresholds.reflection_fail} stroke={C.red} strokeDasharray="3 3" />
      {expectedLength > 0 && (
        <ReferenceLine x={expectedLength} stroke={C.amber} strokeDasharray="2 2" label={{ value: 'cable end', fill: C.amber, fontSize: 10, position: 'top' }} />
      )}
      {gateStart != null && (
        <ReferenceLine x={gateStart} stroke={C.copper} strokeDasharray="4 2" strokeWidth={0.7} label={{ value: 'gate', fill: C.copper, fontSize: 9, position: 'top' }} />
      )}
      {gateEnd != null && (
        <ReferenceLine x={gateEnd} stroke={C.copper} strokeDasharray="4 2" strokeWidth={0.7} />
      )}
      {reference && <Line type="monotone" dataKey="reference" stroke={C.teal} strokeWidth={1.5} dot={false} />}
      <Line type="monotone" dataKey="dut" stroke={C.copper} strokeWidth={2} dot={false} />
    </ChartShell>
  )
}

function S21Plot({ dut, reference }) {
  const data = useMemo(() => {
    const dutData = freqAxisData(dut, (b) => ({ dut: -insertionLossDb(b.s21) })) // negative for "loss" displayed
    if (!reference || reference.ports !== 2) return dutData
    const refData = freqAxisData(reference, (b) => ({ reference: -insertionLossDb(b.s21) }))
    return dutData.map((d, i) => ({ ...d, reference: refData[i]?.reference }))
  }, [dut, reference])

  return (
    <ChartShell title="S21 Insertion Loss vs Frequency" yLabel="S21 (dB)" data={data} xKey="f_mhz" xUnit="MHz">
      {reference && <Line type="monotone" dataKey="reference" stroke={C.teal} strokeWidth={1.5} dot={false} />}
      <Line type="monotone" dataKey="dut" stroke={C.copper} strokeWidth={2} dot={false} />
    </ChartShell>
  )
}

function GroupDelayPlot({ dut, reference }) {
  const data = useMemo(() => {
    const dutGD = groupDelayNs(dut.s, dut.freqs, 's21')
    const out = dut.freqs.map((f, i) => ({ f_mhz: f / 1e6, dut: dutGD[i] }))
    if (reference && reference.ports === 2) {
      const refGD = groupDelayNs(reference.s, reference.freqs, 's21')
      out.forEach((d, i) => { d.reference = refGD[i] })
    }
    return out
  }, [dut, reference])

  return (
    <ChartShell title="Group Delay vs Frequency" yLabel="τg (ns)" data={data} xKey="f_mhz" xUnit="MHz">
      {reference && <Line type="monotone" dataKey="reference" stroke={C.teal} strokeWidth={1.5} dot={false} />}
      <Line type="monotone" dataKey="dut" stroke={C.copper} strokeWidth={2} dot={false} />
    </ChartShell>
  )
}

function ChartShell({ title, yLabel, data, xKey, xUnit, yDomain, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono text-[11px] uppercase tracking-wider text-[#c97b3f]">{title}</div>
        <div className="font-mono text-[10px] text-[#6b7479]">{data.length} pts</div>
      </div>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 30, bottom: 24, left: 8 }}>
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
    </div>
  )
}
