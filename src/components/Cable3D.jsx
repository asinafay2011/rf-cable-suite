import React, { useMemo, useState } from 'react'
import { Cable, Download, Film, Radio } from 'lucide-react'

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

export default function Cable3D() {
  const [activeId, setActiveId] = useState('coax')
  const activeBuild = useMemo(
    () => BUILDS.find((build) => build.id === activeId) || BUILDS[0],
    [activeId],
  )
  const Icon = activeBuild.icon

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
