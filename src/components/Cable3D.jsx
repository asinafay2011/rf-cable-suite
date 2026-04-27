import React, { useState, useRef, useEffect, useMemo } from 'react'
import { RotateCcw, Eye, EyeOff, Layers as LayersIcon } from 'lucide-react'

// ─────────────────────────────────────────────────────────
// 3D Cable Visualizer (pure CSS / SVG, no external 3D dep)
// Uses CSS perspective + transform-style:preserve-3d to fake a 3D cable
// rendered as a stack of concentric tubular layers viewed at an angle.
// User can drag-rotate, zoom, toggle layer visibility, and load presets.
// ─────────────────────────────────────────────────────────

const C = {
  bg: '#0a0d0f',
  bgCard: '#12171a',
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

// Visual presets — each layer has color, label, and inner/outer radius (relative)
const PRESETS = {
  cat6a_uutp: {
    label: 'Cat 6A U/UTP',
    z0: '100 Ω diff',
    layers: [
      { name: 'Conductor (×8)', color: '#c97b3f', from: 0, to: 0.18, kind: 'core', count: 4 },
      { name: 'Insulation', color: '#fbbf24', from: 0.18, to: 0.32, kind: 'ring' },
      { name: 'Cross-spline', color: '#5eead4', from: 0.32, to: 0.5, kind: 'spline' },
      { name: 'Jacket', color: '#1a2226', from: 0.85, to: 1.0, kind: 'ring' },
    ],
  },
  cat6a_sftp: {
    label: 'Cat 6A S/FTP (full)',
    z0: '100 Ω diff',
    layers: [
      { name: 'Conductor (×8)', color: '#c97b3f', from: 0, to: 0.15, kind: 'core', count: 4 },
      { name: 'Insulation', color: '#fbbf24', from: 0.15, to: 0.28, kind: 'ring' },
      { name: 'Pair wrap', color: '#a78bfa', from: 0.28, to: 0.32, kind: 'ring' },
      { name: 'Per-pair foil', color: '#a7b0b6', from: 0.32, to: 0.36, kind: 'ring' },
      { name: 'Bundle / spline', color: '#5eead4', from: 0.36, to: 0.62, kind: 'spline' },
      { name: 'Outer foil', color: '#cbd5e1', from: 0.62, to: 0.68, kind: 'ring' },
      { name: 'Outer braid', color: '#c97b3f', from: 0.68, to: 0.82, kind: 'braid' },
      { name: 'Jacket', color: '#1a2226', from: 0.82, to: 1.0, kind: 'ring' },
    ],
  },
  rg58: {
    label: 'RG-58 (50 Ω coax)',
    z0: '50 Ω',
    layers: [
      { name: 'Conductor', color: '#c97b3f', from: 0, to: 0.18, kind: 'core', count: 1 },
      { name: 'Dielectric (PE)', color: '#fbbf24', from: 0.18, to: 0.55, kind: 'ring' },
      { name: 'Braid (TC)', color: '#e89357', from: 0.55, to: 0.78, kind: 'braid' },
      { name: 'Jacket (PVC)', color: '#1a2226', from: 0.78, to: 1.0, kind: 'ring' },
    ],
  },
  semirigid: {
    label: 'UT-141 Semi-Rigid + spiral',
    z0: '50 Ω',
    layers: [
      { name: 'Conductor', color: '#c97b3f', from: 0, to: 0.20, kind: 'core', count: 1 },
      { name: 'PTFE tape (10 layers)', color: '#fbbf24', from: 0.20, to: 0.55, kind: 'ring-striped' },
      { name: 'Spiral SPC (8 bobbin)', color: '#cbd5e1', from: 0.55, to: 0.66, kind: 'spiral' },
      { name: 'Outer braid', color: '#c97b3f', from: 0.66, to: 0.85, kind: 'braid' },
      { name: 'FEP jacket', color: '#1a2226', from: 0.85, to: 1.0, kind: 'ring' },
    ],
  },
  usb4: {
    label: 'USB4 / TB4 passive',
    z0: '90 Ω diff (× 2)',
    layers: [
      { name: 'Conductor (×4)', color: '#c97b3f', from: 0, to: 0.12, kind: 'core', count: 2 },
      { name: 'Insulation', color: '#fbbf24', from: 0.12, to: 0.28, kind: 'ring' },
      { name: 'Per-pair foil', color: '#a7b0b6', from: 0.28, to: 0.40, kind: 'ring' },
      { name: 'Bundle filler', color: '#5eead4', from: 0.40, to: 0.62, kind: 'spline' },
      { name: 'Outer foil', color: '#cbd5e1', from: 0.62, to: 0.72, kind: 'ring' },
      { name: 'Outer braid', color: '#c97b3f', from: 0.72, to: 0.88, kind: 'braid' },
      { name: 'TPU jacket', color: '#7dd3fc', from: 0.88, to: 1.0, kind: 'ring' },
    ],
  },
  qsfp_dac: {
    label: 'QSFP28 100G DAC',
    z0: '100 Ω twinax × 4',
    layers: [
      { name: 'Conductor (×8)', color: '#c97b3f', from: 0, to: 0.14, kind: 'core', count: 4 },
      { name: 'Foamed dielectric', color: '#fbbf24', from: 0.14, to: 0.30, kind: 'ring' },
      { name: 'Per-pair foil', color: '#a7b0b6', from: 0.30, to: 0.42, kind: 'ring' },
      { name: 'Bundle', color: '#5eead4', from: 0.42, to: 0.65, kind: 'spline' },
      { name: 'Outer braid', color: '#c97b3f', from: 0.65, to: 0.85, kind: 'braid' },
      { name: 'Jacket', color: '#1a2226', from: 0.85, to: 1.0, kind: 'ring' },
    ],
  },
}

export default function Cable3D() {
  const [presetId, setPresetId] = useState('cat6a_sftp')
  const preset = PRESETS[presetId]
  const [hidden, setHidden] = useState({})
  const [rotX, setRotX] = useState(-22)  // pitch
  const [rotY, setRotY] = useState(0)    // yaw — animated
  const [rotZ, setRotZ] = useState(0)    // ignored, length-axis rotation
  const [zoom, setZoom] = useState(1)
  const [autoSpin, setAutoSpin] = useState(true)
  const [exploded, setExploded] = useState(false)

  // Auto-spin
  useEffect(() => {
    if (!autoSpin) return
    let raf
    let last = performance.now()
    const tick = (now) => {
      const dt = (now - last) / 1000
      last = now
      setRotY((r) => r + dt * 18)  // 18 deg / sec
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [autoSpin])

  // Drag to rotate
  const dragStartRef = useRef(null)
  const onPointerDown = (e) => {
    setAutoSpin(false)
    dragStartRef.current = { x: e.clientX, y: e.clientY, rx: rotX, ry: rotY }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!dragStartRef.current) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setRotY(dragStartRef.current.ry + dx * 0.4)
    setRotX(Math.max(-80, Math.min(20, dragStartRef.current.rx - dy * 0.3)))
  }
  const onPointerUp = (e) => {
    dragStartRef.current = null
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch {}
  }

  const reset = () => {
    setRotX(-22); setRotY(0); setZoom(1); setHidden({}); setAutoSpin(true); setExploded(false)
  }

  return (
    <section className="space-y-4">
      <style>{`
        @keyframes c3dShine { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.9; } }
      `}</style>

      <div className="grid md:grid-cols-[1fr_280px] gap-4">
        {/* Stage */}
        <div
          className="relative bg-[#0a0d0f] border border-[#252e33] rounded overflow-hidden"
          style={{ minHeight: 420, perspective: '1200px', cursor: dragStartRef.current ? 'grabbing' : 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Subtle grid backdrop */}
          <svg className="absolute inset-0 w-full h-full opacity-15 pointer-events-none">
            <defs>
              <pattern id="c3d-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke={C.border} strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#c3d-grid)" />
          </svg>

          {/* The cable — preserve3d stack */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{
              transformStyle: 'preserve-3d',
              transform: `rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${zoom})`,
              transition: dragStartRef.current ? 'none' : 'transform 0.18s ease-out',
            }}
          >
            <CableTube preset={preset} hidden={hidden} exploded={exploded} />
          </div>

          {/* Overlay info */}
          <div className="absolute top-2 left-2 font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.copperBright }}>
            ◆ 3D · {preset.label}
          </div>
          <div className="absolute top-2 right-2 font-mono text-[10px]" style={{ color: C.textMuted }}>
            {preset.z0} · drag to rotate
          </div>
          <div className="absolute bottom-2 left-2 font-mono text-[9px]" style={{ color: C.textMuted }}>
            yaw {rotY.toFixed(0)}° · pitch {rotX.toFixed(0)}° · zoom {zoom.toFixed(1)}×
          </div>
        </div>

        {/* Controls */}
        <div className="bg-[#12171a] border border-[#252e33] rounded p-3 space-y-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: C.amber }}>Cable preset</div>
            <select
              value={presetId}
              onChange={(e) => { setPresetId(e.target.value); setHidden({}) }}
              className="w-full bg-[#0a0d0f] border border-[#252e33] rounded px-2 py-1.5 text-[12px] font-mono"
              style={{ color: C.amber }}
            >
              {Object.entries(PRESETS).map(([id, p]) => (
                <option key={id} value={id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.teal }}>Layers</div>
            {preset.layers.map((l, i) => (
              <button
                key={i}
                onClick={() => setHidden((h) => ({ ...h, [i]: !h[i] }))}
                className="w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] font-mono hover:bg-[#171d20] text-left"
                style={{ color: hidden[i] ? C.textMuted : C.text, opacity: hidden[i] ? 0.5 : 1 }}
              >
                <span className="w-3 h-3 rounded-sm border" style={{ background: hidden[i] ? 'transparent' : l.color, borderColor: l.color }} />
                <span className="flex-1 truncate">{l.name}</span>
                {hidden[i] ? <EyeOff size={11} /> : <Eye size={11} />}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.copperBright }}>View</div>
            <SlideRow label="Zoom" value={zoom} onChange={setZoom} min={0.5} max={2.5} step={0.05} />
            <SlideRow label="Pitch" value={rotX} onChange={(v) => { setAutoSpin(false); setRotX(v) }} min={-80} max={20} step={1} unit="°" />
            <SlideRow label="Yaw" value={rotY} onChange={(v) => { setAutoSpin(false); setRotY(v) }} min={-360} max={360} step={1} unit="°" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAutoSpin((v) => !v)}
              className="px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent"
              style={{ borderColor: autoSpin ? C.teal + '60' : C.borderHi, color: autoSpin ? C.teal : C.textDim }}
            >
              {autoSpin ? '⏸ Pause spin' : '▶ Auto-spin'}
            </button>
            <button
              onClick={() => setExploded((v) => !v)}
              className="px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent"
              style={{ borderColor: exploded ? C.amber + '60' : C.borderHi, color: exploded ? C.amber : C.textDim }}
            >
              <LayersIcon size={11} className="inline mr-1" /> {exploded ? 'Collapse' : 'Explode'}
            </button>
            <button
              onClick={reset}
              className="col-span-2 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent"
              style={{ borderColor: C.borderHi, color: C.textDim }}
            >
              <RotateCcw size={11} className="inline mr-1" /> Reset view
            </button>
          </div>
        </div>
      </div>

      {/* Legend / engineering note */}
      <div className="bg-[#12171a] border border-[#252e33] rounded p-3 text-[12px] leading-relaxed" style={{ color: C.textDim }}>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: C.teal }}>How to use</div>
        Drag the stage to rotate freely. Auto-spin slowly orbits the cable for hands-off review. Toggle layers off to peek inside, or click <span className="text-[#fbbf24]">Explode</span> to space the layers apart and reveal what each contributes. Useful for explaining cable construction in design reviews and customer presentations — no manufacturing realism, just the topological structure.
      </div>
    </section>
  )
}

function SlideRow({ label, value, onChange, min, max, step, unit = '' }) {
  return (
    <div className="flex items-center gap-2">
      <label className="font-mono text-[10px] uppercase tracking-wider w-12 shrink-0" style={{ color: C.textMuted }}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1"
        style={{ accentColor: C.copper }}
      />
      <span className="font-mono text-[10px] w-12 text-right" style={{ color: C.amber }}>
        {Number(value).toFixed(step < 1 ? 2 : 0)}{unit}
      </span>
    </div>
  )
}

// The actual cable model — concentric tubes rendered as <CableLayer> stacked
function CableTube({ preset, hidden, exploded }) {
  const baseR = 100   // px outer radius
  const length = 360  // px cable length

  return (
    <div
      style={{
        transformStyle: 'preserve-3d',
        position: 'relative',
        width: 1,
        height: 1,
      }}
    >
      {preset.layers.map((layer, i) => {
        if (hidden[i]) return null
        const innerR = baseR * layer.from
        const outerR = baseR * layer.to
        // Exploded mode pushes outer layers outward along radial axis
        const offset = exploded ? i * 32 : 0
        return (
          <CableLayer
            key={i}
            layer={layer}
            inner={innerR}
            outer={outerR}
            length={length}
            offset={offset}
          />
        )
      })}
    </div>
  )
}

// One concentric tube at radius `outer` (and visible inner cut on the cross-section ends).
// We approximate the tube using N angular slices — each a thin oriented "wall" panel.
function CableLayer({ layer, inner, outer, length, offset }) {
  const N = 18  // angular slices
  const slices = []
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * 360
    slices.push(a0)
  }

  // Slight darken/lighten by angle for shading
  const shade = (deg, base) => {
    const lightAngle = 60  // light from top-right-ish
    const ang = ((deg - lightAngle + 540) % 360) - 180  // -180..180
    const t = Math.cos((ang * Math.PI) / 180) * 0.5 + 0.5  // 0..1
    return mixHex(base, '#000', 0.45 - t * 0.35)
  }

  const hatchBackground = (kind, baseColor) => {
    if (kind === 'braid') {
      return `repeating-linear-gradient(45deg, ${baseColor} 0 3px, ${mixHex(baseColor, '#000', 0.3)} 3px 6px)`
    }
    if (kind === 'spiral') {
      return `repeating-linear-gradient(70deg, ${baseColor} 0 2px, ${mixHex(baseColor, '#fff', 0.2)} 2px 4px)`
    }
    if (kind === 'ring-striped') {
      return `repeating-linear-gradient(90deg, ${baseColor} 0 6px, ${mixHex(baseColor, '#000', 0.2)} 6px 8px)`
    }
    return baseColor
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: -outer,
        top: -outer,
        width: outer * 2,
        height: outer * 2,
        transformStyle: 'preserve-3d',
        transform: `translateZ(${offset}px)`,
        transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0.0, 1)',
      }}
    >
      {/* Outer cylinder surface */}
      {slices.map((deg) => (
        <div
          key={`o${deg}`}
          style={{
            position: 'absolute',
            left: outer,
            top: -length / 2,
            width: 1,
            height: length,
            background: hatchBackground(layer.kind, shade(deg, layer.color)),
            transform: `rotateY(${deg}deg) translateX(-${outer}px) rotateY(0deg) translateZ(${outer}px)`,
            transformOrigin: 'left center',
            backfaceVisibility: 'hidden',
            border: 'none',
            boxShadow: deg < 180 ? 'none' : 'inset 0 0 4px rgba(0,0,0,0.3)',
          }}
        />
      ))}
      {/* Render as wedge slats — actual tube approximation */}
      {Array.from({ length: N }).map((_, i) => {
        const a0 = (i / N) * 2 * Math.PI
        const a1 = ((i + 1) / N) * 2 * Math.PI
        const midAng = ((a0 + a1) / 2) * 180 / Math.PI
        const slatWidth = 2 * Math.PI * outer / N
        return (
          <div
            key={`s${i}`}
            style={{
              position: 'absolute',
              left: outer - slatWidth / 2,
              top: -length / 2,
              width: slatWidth + 0.4,
              height: length,
              background: hatchBackground(layer.kind, shade(midAng, layer.color)),
              transform: `rotateY(${(midAng + 90)}deg) translateZ(${outer}px) rotateY(-90deg)`,
              transformOrigin: `${slatWidth / 2}px center`,
              backfaceVisibility: 'hidden',
            }}
          />
        )
      })}
      {/* End cap (cross-section ring, front) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: outer * 2,
          height: outer * 2,
          borderRadius: '50%',
          background: layer.color,
          opacity: 0.9,
          transform: `translateZ(${length / 2}px)`,
          backfaceVisibility: 'hidden',
          border: '1px solid #0a0d0f',
        }}
      />
      {/* Inner cutout on front end-cap if not solid core */}
      {layer.kind !== 'core' && inner > 0 && (
        <div
          style={{
            position: 'absolute',
            left: outer - inner,
            top: outer - inner,
            width: inner * 2,
            height: inner * 2,
            borderRadius: '50%',
            background: '#0a0d0f',
            transform: `translateZ(${length / 2 + 0.5}px)`,
            backfaceVisibility: 'hidden',
          }}
        />
      )}
      {/* Back end-cap (mirror) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: outer * 2,
          height: outer * 2,
          borderRadius: '50%',
          background: mixHex(layer.color, '#000', 0.4),
          opacity: 0.85,
          transform: `translateZ(-${length / 2}px) rotateY(180deg)`,
          backfaceVisibility: 'hidden',
          border: '1px solid #0a0d0f',
        }}
      />
    </div>
  )
}

// ── Helpers ──
function mixHex(a, b, t) {
  const pa = parseHex(a)
  const pb = parseHex(b)
  const r = Math.round(pa.r * (1 - t) + pb.r * t)
  const g = Math.round(pa.g * (1 - t) + pb.g * t)
  const bl = Math.round(pa.b * (1 - t) + pb.b * t)
  return `rgb(${r}, ${g}, ${bl})`
}
function parseHex(s) {
  if (s.startsWith('rgb')) {
    const m = s.match(/\d+/g)
    return { r: +m[0], g: +m[1], b: +m[2] }
  }
  const h = s.replace('#', '')
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  }
}
