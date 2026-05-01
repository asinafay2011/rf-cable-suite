import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import CableBuilder from '../components/CableBuilder.jsx'
import FloatingAgent from '../components/FloatingAgent.jsx'
import { CABLE_TOOLS, dispatchCableTool } from '../components/cableTools.js'

const BUILDER_SYSTEM_PROMPT = `You are a senior cable manufacturing engineer guiding the user through a hands-on cable build in the CABLE BUILDER tab. The user is walking through 10 stages: conductor → stranding → insulation → pair → pair_wrap → pair_foil → bundle → outer_foil → shield → jacket. They click through each stage, see the 3D cable update, and watch live spec readouts.

Style:
- VERY CONCISE responses (under 80 words by default). The user is hands-on.
- When asked "what should I do for stage X?", give a 2-3 line recommendation with the WHY (e.g., "Pick FEP foamed for εᵣ ≈ 1.85 — cuts loss vs solid PE while still hitting Cat 6A 100 Ω with a 0.24 mm wall").
- When the user asks about trade-offs, lay out 2-3 options ranked by their use case.

Stage-aware help:
- Conductor: AWG vs DCR vs cost trade-off; SPC for HF.
- Stranding: only enable for high-flex (drag-chain, robotics); solid is finer for fixed installs.
- Insulation: pick εᵣ to hit target Z₀ given the chosen wall.
- Pair: lay 11-17 mm Cat 6A, 6-9 mm Cat 8, 6 mm USB4. Direction S/Z arbitrary unless decorrelating with bundle.
- Pair wrap: PTFE for high-temp; polyester for S/FTP underlayer.
- Pair foil: foil-side-IN, drain wire mandatory for pigtail termination.
- Bundle: lay diversity ON (different lays per pair) to decorrelate NEXT.
- Outer foil: F/UTP only. Skip for U/UTP.
- Outer braid: 24 carriers × 14 picks/inch = ~85% K coverage typical.
- Jacket: LSZH for safety, FEP for plenum, TPU for drag-chain.

Tools available: \`calc_z0_coax\` (verify impedance), \`calc_braid_coverage\` (compute K), \`pair_lay_skew\` (predict skew), \`propose_*_preset\` family (one-click apply suggestions).

Cite physics: [WADELL] for Z₀ formula, [SCTE51] for braid K, [TIA568] for Cat-class limits.`

const BUILDER_STARTERS = [
  'What should I pick for the conductor stage?',
  'Help me hit 100 Ω for Cat 6A',
  'Why do we add a binder wrap before the foil?',
  'What pair lay gives ≤ 25 ps/m skew?',
]

export default function BuilderApp() {
  const [section, setSection] = useState('builder')

  return (
    <div style={{ minHeight: '100vh', background: '#0a0d0f', color: '#f0ebe2' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=JetBrains+Mono:wght@400;500;600&display=swap');
        body { background: #0a0d0f; }
      `}</style>

      {/* Top utility bar */}
      <header className="border-b border-[#252e33]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-2 flex-wrap">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-md bg-[#c97b3f] flex items-center justify-center group-hover:bg-[#e89357] transition-colors">
              <span className="text-[#0a0d0f] font-bold text-sm">◆</span>
            </div>
            <span className="font-mono text-[11px] tracking-[0.25em] text-[#c97b3f] uppercase hidden md:inline">
              Cable Builder
            </span>
            <span className="font-mono text-[11px] tracking-[0.25em] text-[#c97b3f] uppercase md:hidden">
              Builder
            </span>
          </Link>
          <div className="font-mono text-[10px] tracking-wider text-[#6b7479] uppercase hidden md:block">
            Stage-by-stage interactive cable assembly
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 pb-24">
        <CableBuilder />
      </main>

      <FloatingAgent
        accent="#c97b3f"
        accentBright="#e89357"
        label="◆ BUILDER"
        systemPrompt={BUILDER_SYSTEM_PROMPT}
        starters={BUILDER_STARTERS}
        roleDescription="Cable manufacturing guide."
        topics={['stage choices', 'material trade-offs', 'spec compliance', 'process settings']}
        placeholder="Ask about the current build stage…"
        storageKey="builder-chat-history"
        tools={CABLE_TOOLS}
        onToolUse={dispatchCableTool}
        context={{ section, sectionLabel: 'Cable Builder' }}
        onJumpToSection={setSection}
        attachAccept="image/*,application/pdf,.pdf"
      />
    </div>
  )
}
