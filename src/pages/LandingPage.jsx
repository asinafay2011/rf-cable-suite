import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Radio, Cable, FlaskConical, BookOpen, ArrowRight, Sparkles, Check, GitBranch } from 'lucide-react'

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
  text: '#f0ebe2',
  textDim: '#a7b0b6',
  textMuted: '#6b7479',
}

export default function LandingPage() {
  // Detect returning users (anyone with localStorage history from either app)
  const [lastApp, setLastApp] = useState(null)
  useEffect(() => {
    try {
      if (localStorage.getItem('cablelab-chat-history')) setLastApp('highspeed')
      else if (localStorage.getItem('rf-chat-history')) setLastApp('rf')
    } catch {}
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0d0f] text-[#f0ebe2] relative overflow-hidden" style={{ fontFamily: 'Manrope, system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=JetBrains+Mono:wght@400;500;600&family=Manrope:wght@300;400;500;600&display=swap');
        body { font-family: Manrope, system-ui, sans-serif; }
        .font-mono, code { font-family: 'JetBrains Mono', monospace; }
        @keyframes slowSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes glowPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        .cable-spin { animation: slowSpin 60s linear infinite; transform-origin: center; }
        .cable-glow { animation: glowPulse 4s ease-in-out infinite; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
        .fade-up { animation: fadeUp 0.8s ease-out backwards; }
      `}</style>

      {/* Decorative background */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="land-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#252e33" strokeWidth="0.5" />
            </pattern>
            <radialGradient id="bg-glow" cx="80%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#c97b3f" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0a0d0f" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#land-grid)" />
          <rect width="100%" height="100%" fill="url(#bg-glow)" />
        </svg>
      </div>

      {/* Top utility bar */}
      <header className="relative z-20">
        <div className="max-w-6xl mx-auto px-6 md:px-12 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#c97b3f] flex items-center justify-center">
              <span className="text-[#0a0d0f] font-bold text-sm">◆</span>
            </div>
            <span className="font-mono text-[11px] tracking-[0.25em] text-[#c97b3f] uppercase">RF + HIGH-SPEED CABLE ENGINEERING</span>
          </div>
          <nav className="hidden md:flex items-center gap-5 text-[12px] font-mono uppercase tracking-wider">
            <Link to="/rf" className="text-[#a7b0b6] hover:text-[#fbbf24] transition-colors">RF</Link>
            <Link to="/highspeed" className="text-[#a7b0b6] hover:text-[#fbbf24] transition-colors">CABLE.LAB</Link>
            <Link to="/builder" className="text-[#a7b0b6] hover:text-[#fbbf24] transition-colors">BUILDER</Link>
            <Link to="/about" className="text-[#a7b0b6] hover:text-[#fbbf24] transition-colors">Methodology</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 pt-12 pb-24">
        <div className="grid md:grid-cols-[1fr_auto] gap-8 md:gap-16 items-center">
          <div className="fade-up">
            <div className="font-mono text-[11px] tracking-[0.3em] text-[#c97b3f] uppercase mb-6">
              ◆ Engineering workbench · v1
            </div>
            <h1 className="text-5xl md:text-7xl font-light leading-[0.95] tracking-tight mb-6" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
              From a strand of copper<br />
              to a <span className="italic text-[#c97b3f]">controlled-impedance</span><br />
              cable
            </h1>
            <p className="text-lg text-[#a7b0b6] max-w-xl leading-relaxed mb-8">
              Two engineering apps + a tool-using AI agent — coaxial cable workbench, high-speed
              cable manufacturing curriculum, and a Touchstone-grade VNA Lab. Every calculation
              local. Every formula cited.
            </p>

            <div className="flex flex-wrap gap-3 mb-12">
              {lastApp ? (
                <Link
                  to={lastApp === 'highspeed' ? '/highspeed' : '/rf'}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[#c97b3f] hover:bg-[#e89357] text-[#0a0d0f] text-sm font-semibold uppercase tracking-wider transition-colors"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  Continue to {lastApp === 'highspeed' ? 'CABLE.LAB' : 'RF Workbench'} <ArrowRight size={14} />
                </Link>
              ) : (
                <Link
                  to="/highspeed"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[#c97b3f] hover:bg-[#e89357] text-[#0a0d0f] text-sm font-semibold uppercase tracking-wider transition-colors"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  Try VNA Lab demo <ArrowRight size={14} />
                </Link>
              )}
              <Link
                to="/rf"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-[#384249] hover:border-[#c97b3f] hover:bg-[#1f1610] text-[#f0ebe2] text-sm font-semibold uppercase tracking-wider transition-colors"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              >
                <Radio size={14} /> RF Workbench
              </Link>
              <Link
                to="/highspeed"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-[#384249] hover:border-[#c97b3f] hover:bg-[#1f1610] text-[#f0ebe2] text-sm font-semibold uppercase tracking-wider transition-colors"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              >
                <Cable size={14} /> CABLE.LAB
              </Link>
            </div>

            {/* Stats inline */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-2xl pt-6 border-t border-[#252e33]">
              <Stat n="18" label="AI tools" tone={C.teal} />
              <Stat n="20+" label="cable presets" tone={C.teal} />
              <Stat n=".s1p" label="Touchstone ready" tone={C.amber} />
              <Stat n="0" label="telemetry" tone={C.copper} />
            </div>
          </div>

          {/* Decorative cable cross-section */}
          <div className="hidden md:block fade-up" style={{ animationDelay: '0.2s' }}>
            <CableArt />
          </div>
        </div>
      </section>

      {/* Three product cards */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 pb-24">
        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#c97b3f] mb-6">
          ◆ Three apps, one suite
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <ProductCard
            to="/rf"
            icon={Radio}
            title="RF Workbench"
            tag="Coax · Connectors · Link Budget"
            bullets={[
              'Z₀, attenuation, Smith chart',
              '20+ cable + 29-connector database',
              'Friis NF cascade · VSWR / RL',
              'Path loss + link margin verdict',
            ]}
            accent={C.copper}
          />
          <ProductCard
            to="/highspeed"
            icon={Cable}
            title="CABLE.LAB"
            tag="High-speed cable manufacturing"
            bullets={[
              'Conductor → twisted pair → bundle',
              'Process Sim · auto-fix optimizer',
              'Braid · NEXT · skew · eye · 3D · QC',
              'Tape Suckout · 38 vendor presets',
            ]}
            accent={C.copper}
          />
          <ProductCard
            to="/builder"
            icon={GitBranch}
            title="Cable Builder"
            tag="Stage-by-stage interactive build"
            bullets={[
              'Pick wire → insulate → twist pair',
              'Add wrap · foil · bundle · braid · jacket',
              'Live 3D + live spec readouts',
              'Sandbox or Challenge vs target standard',
            ]}
            accent={C.teal}
            badge="New"
          />
        </div>
      </section>

      {/* Trust strip */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 pb-24">
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#c97b3f] mb-4">
              ◆ Built on the textbooks engineers already trust
            </div>
            <div className="space-y-3 text-[14px] text-[#a7b0b6] leading-relaxed">
              <Cite>Pozar — <i>Microwave Engineering</i> · 4th ed.</Cite>
              <Cite>Wadell — <i>Transmission Line Design Handbook</i></Cite>
              <Cite>SCTE 51 · TIA-568.2-D · IEC 61156 · IEEE 802.3bq</Cite>
              <Cite>ECSS-E-ST-50-12C · MIL-STD-1553B</Cite>
              <Cite>Friis — <i>A Note on a Simple Transmission Formula</i> (Proc. IRE 1946)</Cite>
            </div>
            <Link
              to="/about"
              className="inline-flex items-center gap-1.5 mt-6 text-[12px] font-mono uppercase tracking-wider text-[#c97b3f] hover:text-[#fbbf24]"
            >
              <BookOpen size={12} />
              Read the methodology page <ArrowRight size={12} />
            </Link>
          </div>

          <div className="bg-[#12171a] border border-[#252e33] rounded-md p-6">
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4] mb-3 flex items-center gap-2">
              <Sparkles size={12} /> Privacy & footprint
            </div>
            <ul className="space-y-2 text-[13px] text-[#a7b0b6]">
              <li className="flex items-start gap-2"><Check size={14} className="text-[#5eead4] mt-0.5 shrink-0" /> Every numeric calculation runs locally in your browser</li>
              <li className="flex items-start gap-2"><Check size={14} className="text-[#5eead4] mt-0.5 shrink-0" /> .s1p / .s2p VNA files are parsed in-browser — never uploaded</li>
              <li className="flex items-start gap-2"><Check size={14} className="text-[#5eead4] mt-0.5 shrink-0" /> AI chat → Anthropic API only (your key, your bill)</li>
              <li className="flex items-start gap-2"><Check size={14} className="text-[#5eead4] mt-0.5 shrink-0" /> No analytics, no tracking, no account required</li>
              <li className="flex items-start gap-2"><Check size={14} className="text-[#5eead4] mt-0.5 shrink-0" /> Open in any modern browser, no install</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 py-10 border-t border-[#252e33] text-[12px] text-[#6b7479] font-mono">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>◆ RF + High-Speed Cable Engineering Suite · v1</div>
          <div className="flex gap-4">
            <Link to="/rf" className="hover:text-[#fbbf24]">RF</Link>
            <Link to="/highspeed" className="hover:text-[#fbbf24]">CABLE.LAB</Link>
            <Link to="/builder" className="hover:text-[#fbbf24]">BUILDER</Link>
            <Link to="/about" className="hover:text-[#fbbf24]">Methodology</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Stat({ n, label, tone }) {
  return (
    <div>
      <div className="text-3xl font-light font-mono" style={{ color: tone, fontFamily: 'JetBrains Mono, monospace' }}>{n}</div>
      <div className="text-[10px] text-[#6b7479] mt-1 font-mono uppercase tracking-[0.15em]">{label}</div>
    </div>
  )
}

function ProductCard({ to, icon: Icon, title, tag, bullets, accent, badge }) {
  return (
    <Link
      to={to}
      className="group relative block p-6 rounded-md border bg-[#12171a] hover:bg-[#171d20] transition-all"
      style={{ borderColor: '#252e33' }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = accent)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#252e33')}
    >
      {badge && (
        <span
          className="absolute top-4 right-4 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ color: accent, borderColor: accent + '60', border: '1px solid', background: 'transparent' }}
        >
          {badge}
        </span>
      )}
      <div className="flex items-center gap-2 mb-2">
        <Icon size={20} style={{ color: accent }} />
        <h3 className="text-xl text-[#f0ebe2] font-light tracking-tight" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
          {title}
        </h3>
      </div>
      <div className="text-[11px] font-mono uppercase tracking-wider text-[#6b7479] mb-4">{tag}</div>
      <ul className="space-y-1.5 text-[13px] text-[#a7b0b6] mb-5">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-1.5">
            <span style={{ color: accent }}>·</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div
        className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider transition-transform group-hover:translate-x-1"
        style={{ color: accent }}
      >
        Open <ArrowRight size={12} />
      </div>
    </Link>
  )
}

function Cite({ children }) {
  return <div className="border-l border-[#252e33] pl-4">{children}</div>
}

function CableArt() {
  return (
    <svg width="320" height="320" viewBox="-160 -160 320 320">
      <defs>
        <radialGradient id="cu" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e89357" />
          <stop offset="100%" stopColor="#c97b3f" />
        </radialGradient>
        <pattern id="braid-pat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="3" x2="6" y2="3" stroke="#8b8478" strokeWidth="1.2" />
        </pattern>
      </defs>
      {/* Outer jacket */}
      <circle cx="0" cy="0" r="150" fill="none" stroke="#3a2e1f" strokeWidth="1.5" opacity="0.6" />
      {/* Braid */}
      <g className="cable-spin">
        <circle cx="0" cy="0" r="120" fill="url(#braid-pat)" stroke="#8b8478" strokeWidth="0.8" opacity="0.5" />
      </g>
      <circle cx="0" cy="0" r="115" fill="#0a0d0f" />
      {/* Foil shield */}
      <circle cx="0" cy="0" r="100" fill="none" stroke="#5eead4" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
      {/* Dielectric */}
      <circle cx="0" cy="0" r="80" fill="none" stroke="#fbbf24" strokeWidth="1.5" opacity="0.6" className="cable-glow" />
      <circle cx="0" cy="0" r="60" fill="none" stroke="#fbbf24" strokeWidth="0.8" opacity="0.4" />
      {/* Inner conductor */}
      <circle cx="0" cy="0" r="22" fill="url(#cu)" />
      {/* Labels */}
      <g fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#6b7479" letterSpacing="1">
        <text x="0" y="-130" textAnchor="middle">JACKET</text>
        <text x="0" y="-105" textAnchor="middle">BRAID</text>
        <text x="0" y="-85" textAnchor="middle" fill="#5eead4">FOIL</text>
        <text x="0" y="-65" textAnchor="middle" fill="#fbbf24">DIELECTRIC</text>
        <text x="0" y="3" textAnchor="middle" fill="#0a0d0f" fontSize="8">Cu</text>
      </g>
    </svg>
  )
}
