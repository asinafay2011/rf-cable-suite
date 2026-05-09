import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Cable, Download, Film, Radio } from 'lucide-react'

const C = {
  bg: '#0a0d0f',
  bgCard: '#12171a',
  border: '#252e33',
  borderHi: '#384249',
  copper: '#c97b3f',
  copperBright: '#e89357',
  teal: '#5eead4',
  amber: '#fbbf24',
  text: '#f0ebe2',
  textDim: '#a7b0b6',
  textMuted: '#6b7479',
}

const BUILDS = [
  {
    id: 'coax',
    label: 'Coax shield stack',
    eyebrow: 'RF coax · cutaway shield build',
    icon: Radio,
    video: '/videos/rf-cable-layer-build.mp4',
    poster: '/cable-renders/rf-cable-layer-build-preview.png',
    glb: '/models/rf-cable-layer-build.glb',
    blend: '/models/rf-cable-layer-build.blend',
    accent: C.copperBright,
    stats: ['Concentric coax', 'Foil + braid', 'Cutaway view'],
    stages: [
      { label: 'Center conductor', color: '#c97b3f' },
      { label: 'Foamed dielectric', color: '#fbbf24' },
      { label: 'Foil shield', color: '#cbd5e1' },
      { label: 'Braid shield', color: '#e89357' },
      { label: 'Outer jacket', color: '#5eead4' },
    ],
  },
  {
    id: 'highspeed',
    label: 'High-speed bundle',
    eyebrow: 'High-speed · pair-to-bundle build',
    icon: Cable,
    video: '/videos/highspeed-cable-bundle-build.mp4',
    poster: '/cable-renders/highspeed-cable-bundle-build-preview.png',
    glb: '/models/highspeed-cable-bundle-build.glb',
    blend: '/models/highspeed-cable-bundle-build.blend',
    accent: C.teal,
    stats: ['Even pair twist', 'Compact 4-pair bundle', 'Non-round braid/jacket'],
    stages: [
      { label: 'Conductor', color: '#c97b3f' },
      { label: 'Insulation', color: '#7dd3fc' },
      { label: '2-wire twist', color: '#a78bfa' },
      { label: 'PTFE tape', color: '#f4e8b8' },
      { label: 'Foil shield', color: '#cbd5e1' },
      { label: '4-pair bundle', color: '#fbbf24' },
      { label: 'Braid', color: '#e89357' },
      { label: 'Jacket', color: '#1a2226' },
    ],
  },
]

const HIGHSPEED_DEFECT_HOTSPOTS = [
  {
    id: 'jacket-oval',
    marker: 'J',
    x: 64,
    y: 52,
    tone: 'red',
    label: 'Jacket ovality',
    stage: 'Outer jacket',
    defect: 'Final jacket follows a flattened shield stack instead of a round OD.',
    impact: 'Risk shows up as OD fit issues, skew spread, and inconsistent connector seating.',
    metric: 'OD / skew',
  },
  {
    id: 'braid-low-coverage',
    marker: 'B',
    x: 55,
    y: 44,
    tone: 'red',
    label: 'Braid low coverage',
    stage: 'Outer braid',
    defect: 'Braid carriers spread unevenly over the non-round bundle.',
    impact: 'Shield holes raise coupling and can weaken NEXT/alien crosstalk margin.',
    metric: 'Coverage %',
  },
  {
    id: 'foil-seam',
    marker: 'S',
    x: 50,
    y: 42,
    tone: 'amber',
    label: 'Foil overlap seam',
    stage: 'Foil shield',
    defect: 'Foil lap rides high or opens where the bundle shape changes.',
    impact: 'Transfer impedance rises at high frequency before the braid can help.',
    metric: 'EMI / RL',
  },
  {
    id: 'ptfe-gap',
    marker: 'G',
    x: 43,
    y: 49,
    tone: 'amber',
    label: 'PTFE tape gap',
    stage: 'Pair wrap',
    defect: 'Binder tape exposes a section of the twisted pair.',
    impact: 'Pair geometry can shift, creating local impedance ripple and skew drift.',
    metric: 'Z0 ripple',
  },
]

function hotspotToneColor(tone) {
  if (tone === 'red') return '#f87171'
  if (tone === 'teal') return '#5eead4'
  return '#fbbf24'
}

export default function Cable3D() {
  const [activeId, setActiveId] = useState('coax')
  const activeBuild = useMemo(
    () => BUILDS.find((build) => build.id === activeId) || BUILDS[0],
    [activeId],
  )
  const defectHotspots = activeBuild.id === 'highspeed' ? HIGHSPEED_DEFECT_HOTSPOTS : []
  const [activeHotspotId, setActiveHotspotId] = useState('')
  const activeHotspot = defectHotspots.find((hotspot) => hotspot.id === activeHotspotId) || defectHotspots[0] || null
  const Icon = activeBuild.icon

  useEffect(() => {
    setActiveHotspotId(defectHotspots[0]?.id || '')
  }, [activeBuild.id])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-[#0a0d0f] border border-[#252e33] rounded overflow-hidden">
          {BUILDS.map((build) => {
            const BuildIcon = build.icon
            const selected = build.id === activeId
            return (
              <button
                key={build.id}
                onClick={() => setActiveId(build.id)}
                className="inline-flex items-center gap-2 px-3 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors"
                style={{
                  background: selected ? `${build.accent}22` : 'transparent',
                  color: selected ? build.accent : C.textMuted,
                  borderRight: build.id === BUILDS[0].id ? `1px solid ${C.border}` : 'none',
                }}
              >
                <BuildIcon size={13} />
                {build.label}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {activeBuild.stats.map((stat) => (
            <span
              key={stat}
              className="px-2 py-1 rounded border font-mono text-[10px] uppercase tracking-wider"
              style={{ borderColor: C.borderHi, color: C.textDim }}
            >
              {stat}
            </span>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        <div className="relative bg-[#0a0d0f] border border-[#252e33] rounded overflow-hidden">
          <div className="aspect-video min-h-[280px]">
            <video
              key={activeBuild.id}
              className="w-full h-full object-cover"
              src={activeBuild.video}
              poster={activeBuild.poster}
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          </div>
          {!!defectHotspots.length && (
            <div className="absolute inset-0 pointer-events-none">
              {defectHotspots.map((hotspot) => {
                const selected = activeHotspot?.id === hotspot.id
                const color = hotspotToneColor(hotspot.tone)
                return (
                  <button
                    key={hotspot.id}
                    type="button"
                    data-testid={`cable3d-defect-hotspot-${hotspot.id}`}
                    aria-label={hotspot.label}
                    title={`${hotspot.label}: ${hotspot.defect}`}
                    onClick={() => setActiveHotspotId(hotspot.id)}
                    className="absolute pointer-events-auto h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border font-mono text-[10px] font-bold transition-transform hover:scale-110 focus:outline-none"
                    style={{
                      left: `${hotspot.x}%`,
                      top: `${hotspot.y}%`,
                      color,
                      borderColor: color,
                      background: selected ? '#0a0d0f' : '#0a0d0fcc',
                      boxShadow: selected ? `0 0 0 4px ${color}2a, 0 0 22px ${color}55` : `0 0 0 2px ${color}18`,
                    }}
                  >
                    {selected && (
                      <span className="absolute inset-[-6px] rounded-full border animate-ping" style={{ borderColor: color }} />
                    )}
                    <span className="relative">{hotspot.marker}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="absolute top-2 left-2 font-mono text-[10px] uppercase tracking-[0.2em] flex items-center gap-1.5" style={{ color: activeBuild.accent }}>
            <Film size={12} /> Blender · {activeBuild.eyebrow}
          </div>
        </div>

        <aside className="bg-[#12171a] border border-[#252e33] rounded p-3 space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] flex items-center gap-1.5" style={{ color: activeBuild.accent }}>
            <Icon size={12} /> Build stages
          </div>
          <div className="space-y-1.5">
            {activeBuild.stages.map((stage, index) => (
              <div key={stage.label} className="flex items-center gap-2 px-2 py-1.5 bg-[#0a0d0f] border border-[#252e33] rounded">
                <span className="font-mono text-[10px] w-5" style={{ color: C.textMuted }}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="w-3 h-3 rounded-sm border" style={{ background: stage.color, borderColor: stage.color }} />
                <span className="font-mono text-[11px] truncate" style={{ color: C.text }}>
                  {stage.label}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <AssetLink href={activeBuild.glb} label="GLB" />
            <AssetLink href={activeBuild.video} label="MP4" />
            <AssetLink href={activeBuild.blend} label="BLEND" />
          </div>

          {activeHotspot && (
            <div data-testid="cable3d-defect-detail" className="rounded border bg-[#0a0d0f] p-3" style={{ borderColor: C.borderHi }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: hotspotToneColor(activeHotspot.tone) }}>
                    Defect audit
                  </div>
                  <div className="font-mono text-[12px] mt-0.5" style={{ color: C.text }}>{activeHotspot.label}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>{activeHotspot.stage}</div>
                </div>
                <AlertTriangle size={15} style={{ color: hotspotToneColor(activeHotspot.tone) }} />
              </div>
              <div className="text-[11px] leading-relaxed mt-2" style={{ color: C.textDim }}>
                {activeHotspot.defect}
              </div>
              <div className="text-[10px] leading-relaxed mt-2" style={{ color: C.textDim }}>
                <span className="font-mono uppercase tracking-wider" style={{ color: C.textMuted }}>Impact </span>
                <span style={{ color: C.text }}>{activeHotspot.impact}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="px-1.5 py-0.5 rounded border font-mono text-[9px] uppercase tracking-wider" style={{ borderColor: `${hotspotToneColor(activeHotspot.tone)}55`, color: hotspotToneColor(activeHotspot.tone) }}>
                  {activeHotspot.metric}
                </span>
                <div className="flex gap-1">
                  {defectHotspots.map((hotspot) => {
                    const selected = hotspot.id === activeHotspotId
                    const color = hotspotToneColor(hotspot.tone)
                    return (
                      <button
                        key={hotspot.id}
                        type="button"
                        data-testid={`cable3d-defect-selector-${hotspot.id}`}
                        onClick={() => setActiveHotspotId(hotspot.id)}
                        className="h-6 w-6 rounded border font-mono text-[9px]"
                        style={{
                          borderColor: selected ? color : C.borderHi,
                          color: selected ? color : C.textMuted,
                          background: selected ? `${color}18` : 'transparent',
                        }}
                        title={hotspot.label}
                      >
                        {hotspot.marker}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

function AssetLink({ href, label }) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent"
      style={{ borderColor: C.borderHi, color: C.textDim }}
    >
      <Download size={11} /> {label}
    </a>
  )
}
