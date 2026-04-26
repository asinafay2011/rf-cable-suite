import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BookOpen, FileText, ExternalLink } from 'lucide-react'

const C = {
  bg: '#0a0d0f',
  bgCard: '#12171a',
  border: '#252e33',
  copper: '#c97b3f',
  teal: '#5eead4',
  amber: '#fbbf24',
  text: '#f0ebe2',
  textDim: '#a7b0b6',
  textMuted: '#6b7479',
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#0a0d0f] text-[#f0ebe2]" style={{ fontFamily: 'Manrope, system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=JetBrains+Mono:wght@400;500;600&family=Manrope:wght@300;400;500;600&display=swap');
        body { font-family: Manrope, system-ui, sans-serif; }
        .font-mono, code { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#0a0d0f]/85 border-b border-[#252e33]">
        <div className="max-w-4xl mx-auto px-6 md:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-[#6b7479] hover:text-[#fbbf24] transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <span className="font-mono text-[11px] text-[#c97b3f] tracking-[0.2em] uppercase">◆ About · Methodology</span>
          </div>
          <div className="flex gap-3 text-[11px] font-mono">
            <Link to="/" className="text-[#a7b0b6] hover:text-[#fbbf24]">RF</Link>
            <span className="text-[#384249]">·</span>
            <Link to="/highspeed" className="text-[#a7b0b6] hover:text-[#fbbf24]">CABLE.LAB</Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 md:px-12 py-12 space-y-12">
        <section>
          <h1
            className="text-4xl md:text-5xl font-light tracking-tight mb-4"
            style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}
          >
            Methodology &<br />
            <span className="italic text-[#c97b3f]">references</span>
          </h1>
          <p className="text-[15px] text-[#a7b0b6] leading-relaxed max-w-2xl">
            This suite combines two engineering apps — an RF cable workbench and a high-speed cable
            manufacturing curriculum — backed by an AI agent with calculation tools. Every calculation
            below is computed locally in your browser; nothing is sent to a server except text passed
            to the Anthropic API for the chat agent.
          </p>
        </section>

        <Section title="Coaxial impedance" icon={BookOpen}>
          <Formula label="Z₀ (coax)">
            Z₀ = (138 / √εᵣ) · log₁₀(D / d) &nbsp;&nbsp;Ω
          </Formula>
          <p>
            Standard textbook formula for the characteristic impedance of an air-filled or
            uniformly-dielectric coaxial line, where <code>D</code> is the dielectric outer
            diameter, <code>d</code> the inner conductor diameter, and <code>εᵣ</code> the relative
            permittivity of the dielectric.
          </p>
          <p>
            The inverse — given a target Z₀ and εᵣ, return the required D/d ratio — is exposed as
            the <code>geometry_for_z0</code> agent tool.
          </p>
          <Cite>Pozar, <i>Microwave Engineering</i>, 4th ed. §2.5</Cite>
        </Section>

        <Section title="Velocity factor & propagation delay" icon={BookOpen}>
          <Formula label="VF / delay">
            VF = 1 / √εᵣ &nbsp;·&nbsp; v_p = VF × c &nbsp;·&nbsp; τ_oneway = length / v_p
          </Formula>
          <p>
            VF expresses the propagation speed in the cable as a fraction of the speed of light.
            For solid PE εᵣ ≈ 2.30 → VF ≈ 0.66; foamed PE εᵣ ≈ 1.5 → VF ≈ 0.82; PTFE εᵣ ≈ 2.10 →
            VF ≈ 0.69.
          </p>
        </Section>

        <Section title="Braid optical coverage" icon={BookOpen}>
          <Formula label="K (coverage)">
            α = arctan(2π · R · PR / C){'\n'}
            F = (P · PR · d) / sin α{'\n'}
            K = (2F − F²) · 100 %
          </Formula>
          <p>
            Computes the optical coverage fraction of a single-layer braid. <code>N</code> total
            carriers split into <code>C = N/2</code> spirals per direction; <code>P</code> ends per
            carrier; <code>d</code> strand diameter; <code>R</code> radius under the braid;{' '}
            <code>PR</code> picks per inch (all in inches for the formula). Tightens with picks/inch
            and ends/carrier; relaxes with cable diameter.
          </p>
          <p>
            Bands: K &lt; 65 % insufficient · 65–85 % general purpose · 85–95 % high performance ·
            95 %+ EMI-critical.
          </p>
          <Cite>SCTE 51 — Coaxial cable braid coverage</Cite>
        </Section>

        <Section title="Return loss / VSWR" icon={BookOpen}>
          <Formula label="RL ↔ VSWR ↔ ρ">
            ρ = (Z_L − Z₀) / (Z_L + Z₀){'\n'}
            VSWR = (1 + |ρ|) / (1 − |ρ|){'\n'}
            RL_dB = −20 · log₁₀(|ρ|)
          </Formula>
          <p>
            All three quantities encode the same thing — the magnitude of the reflection at a
            mismatched interface. RL = 20 dB ⇔ VSWR ≈ 1.22 ⇔ |ρ| ≈ 0.10. The
            agent <code>vswr_to_rl</code> tool converts in either direction.
          </p>
        </Section>

        <Section title="TDR from S₁₁ (Touchstone)" icon={BookOpen}>
          <Formula label="TDR processing chain">
            S₁₁(f) → Hann window → conjugate-symmetric extension → IFFT → ρ(t){'\n'}
            distance = (t × c × VF) / 2 &nbsp;[round-trip ÷ 2]
          </Formula>
          <p>
            VNA Lab parses .s1p / .s2p files (Touchstone v1, IEEE 1989), computes a windowed inverse
            FFT of S₁₁ to get the time-domain impulse response, and converts time to physical
            distance using the user-supplied velocity factor. Defects within the gate
            (configurable, default <code>0.5–95 % × expected length</code>) are flagged.
          </p>
          <Cite>Touchstone File Format Specification, EIA/IBIS Open Forum, version 1.1</Cite>
        </Section>

        <Section title="Free-space path loss" icon={BookOpen}>
          <Formula label="FSPL">
            FSPL(dB) = 32.45 + 20 · log₁₀(f_MHz) + 20 · log₁₀(d_km)
          </Formula>
          <p>
            Derived from the Friis transmission equation with isotropic antennas. Used in the
            agent <code>link_budget</code> tool; antenna gains are added back as separate terms.
          </p>
          <Cite>Friis, <i>A Note on a Simple Transmission Formula</i>, Proc. IRE 1946</Cite>
        </Section>

        <Section title="Cascaded noise figure" icon={BookOpen}>
          <Formula label="Friis NF">
            NF_total = NF₁ + (NF₂ − 1) / G₁ + (NF₃ − 1) / (G₁ · G₂) + …{'\n'}
            (linear ratios; convert NF_dB and G_dB via 10^(x/10))
          </Formula>
          <p>
            First-stage NF dominates when its gain is high. To improve overall NF, lower the first
            stage's NF or raise its gain. Exposed as the <code>noise_figure_cascade</code> agent
            tool.
          </p>
        </Section>

        <Section title="Pair skew prediction" icon={BookOpen}>
          <Formula label="Intra-pair skew">
            VF_i = 2 · L / (τ_i · c)  &nbsp;[from TDR end peak]{'\n'}
            skew_per_m = (τ_A − τ_B) / 2 / L · 10¹² &nbsp;ps/m
          </Formula>
          <p>
            VNA Lab computes per-wire round-trip delay τ from the rightmost TDR peak (assumed
            cable end), derives VF using an assumed common physical length L, and reports the
            differential one-way skew rate. Pass/fail is graded against four standards: Cat 6A
            (≤45 ps/m), Cat 8 (≤25 ps/m), USB4 / 25G+ (≤5 ps/m), MIL-STD-1553B (≤50 ps/m).
          </p>
          <Cite>TIA-568.2-D · IEEE 802.3bq · USB4 spec rev 2 · MIL-STD-1553B</Cite>
        </Section>

        <Section title="AWG ↔ mm" icon={BookOpen}>
          <Formula label="AWG conversion">
            d(mm) = 0.127 · 92^((36 − AWG) / 39)
          </Formula>
          <p>
            Geometric series with 36 AWG fixed at 0.127 mm and a ratio of 92^(1/39) ≈ 1.123 between
            successive gauges. Lower AWG numbers are thicker; AWG 4-0 is the thickest standard size.
          </p>
        </Section>

        <Section title="What runs locally vs in the cloud" icon={FileText}>
          <ul className="space-y-2 text-[14px] text-[#a7b0b6] list-disc list-inside">
            <li>
              <span className="text-[#f0ebe2]">All calculations</span> (Z₀, braid coverage, TDR, IFFT,
              skew, link budgets, NF cascade, etc.) execute in your browser.
            </li>
            <li>
              <span className="text-[#f0ebe2]">VNA file parsing</span> (.s1p / .s2p) is local. Files
              are not uploaded anywhere.
            </li>
            <li>
              <span className="text-[#f0ebe2]">AI chat</span> messages are forwarded to{' '}
              <code>api.anthropic.com</code> via a thin serverless proxy. Your conversation is
              persisted only in <code>localStorage</code> on this device.
            </li>
            <li>
              <span className="text-[#f0ebe2]">No telemetry, analytics, or tracking</span> beyond the
              standard Vercel platform metrics.
            </li>
          </ul>
        </Section>

        <Section title="References" icon={ExternalLink}>
          <ul className="space-y-1.5 text-[13px] text-[#a7b0b6] list-disc list-inside">
            <li>D. M. Pozar, <i>Microwave Engineering</i>, 4th ed., Wiley 2011</li>
            <li>B. C. Wadell, <i>Transmission Line Design Handbook</i>, Artech House 1991</li>
            <li>SCTE 51 — Test Methods for Drop Cable Braid Coverage</li>
            <li>TIA-568.2-D — Balanced Twisted-Pair Telecommunications Cabling</li>
            <li>IEC 61156 — Multicore and symmetrical pair/quad cables for digital communications</li>
            <li>IEEE 802.3bq — 25 / 40 GBASE-T over Cat 6A / Cat 8</li>
            <li>ECSS-E-ST-50-12C — SpaceWire links, nodes, routers and networks</li>
            <li>MIL-STD-1553B — Aircraft internal time-division command/response multiplex data bus</li>
            <li>Friis, <i>A Note on a Simple Transmission Formula</i>, Proc. IRE 34(5), 1946</li>
            <li>Belden / Times Microwave / CommScope datasheets (used for built-in cable DB)</li>
            <li>Glenair Series 963 SpeedLine product line (referenced in CABLE.LAB curriculum)</li>
          </ul>
        </Section>

        <footer className="pt-8 border-t border-[#252e33] text-[12px] text-[#6b7479] font-mono space-y-1">
          <div>This is an engineering tool, not a certified test instrument. Computed values are
            first-order estimates suitable for design and education; production QA should use
            calibrated equipment and accredited test methods.</div>
          <div className="pt-2">
            ← <Link to="/" className="text-[#a7b0b6] hover:text-[#fbbf24]">RF Workbench</Link>{' '}
            ·{' '}
            <Link to="/highspeed" className="text-[#a7b0b6] hover:text-[#fbbf24]">CABLE.LAB</Link>
          </div>
        </footer>
      </main>
    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-[#252e33]">
        {Icon && <Icon size={14} style={{ color: C.copper }} />}
        <h2 className="font-mono text-[12px] uppercase tracking-[0.2em] text-[#c97b3f]">
          {title}
        </h2>
      </div>
      <div className="text-[14px] text-[#a7b0b6] leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  )
}

function Formula({ label, children }) {
  return (
    <div className="bg-[#12171a] border border-[#252e33] rounded p-3 my-2">
      {label && (
        <div className="text-[10px] uppercase tracking-wider text-[#6b7479] font-mono mb-1.5">{label}</div>
      )}
      <pre className="font-mono text-[13px] text-[#fbbf24] whitespace-pre-wrap m-0">{children}</pre>
    </div>
  )
}

function Cite({ children }) {
  return (
    <div className="text-[11px] text-[#6b7479] italic font-mono pt-1">
      ↳ {children}
    </div>
  )
}
