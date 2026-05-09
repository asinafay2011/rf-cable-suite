import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Cable, Calculator, Layers, Shield, Box, FlaskConical, BookOpen,
  ChevronRight, ChevronDown, Activity, Ruler, Zap, Atom, Wrench, Library,
  ArrowRight, Plus, Minus, Info, Eye, Radio, Coins, Boxes, Search, X, Settings,
  GitBranch, Sparkles, Home,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import FloatingAgent from '../components/FloatingAgent.jsx';
import { CABLE_TOOLS, dispatchCableTool } from '../components/cableTools.js';
import VNATest from '../components/VNATest.jsx';
import CustomCablesPanel from '../components/CustomCablesPanel.jsx';
import CompanyDefaultsPanel from '../components/CompanyDefaultsPanel.jsx';
import ProcessSim from '../components/ProcessSim.jsx';
import SuckoutSim from '../components/SuckoutSim.jsx';
import QCStats from '../components/QCStats.jsx';
import Cable3D from '../components/Cable3D.jsx';
import { useIsMobile } from '../components/useIsMobile.js';
import { Menu, X as XIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { parseTouchstone, returnLossDb, vswr, s11Summary } from '../components/touchstone.js';
import { computeTDR, peakReflection } from '../components/fft.js';

async function summarizeTouchstoneFile(file) {
  const name = file.name || 'measurement'
  const ext = name.toLowerCase().split('.').pop()
  if (ext !== 's1p' && ext !== 's2p' && ext !== 's3p' && ext !== 's4p') {
    return null // not a touchstone file — fall through
  }
  const text = await file.text()
  const portsHint = ext === 's2p' ? 2 : ext === 's1p' ? 1 : undefined
  const parsed = parseTouchstone(text, { ports: portsHint })
  const sum = s11Summary(parsed.s, parsed.freqs)
  let peakVSWR = 0
  for (const b of parsed.s) peakVSWR = Math.max(peakVSWR, vswr(b.s11))
  // TDR end-peak (assumes vf=66% — agent can clarify)
  let tdrSummary = ''
  try {
    const tdr = computeTDR(parsed.s.map((b) => b.s11), parsed.freqs, 0.66, true)
    const endPeak = peakReflection(tdr.distances, tdr.rho, 1, Infinity)
    if (endPeak) tdrSummary = `\n- TDR end-peak (assuming VF=66%): |ρ|=${Math.abs(endPeak.rho).toFixed(3)} @ ${endPeak.distance.toFixed(2)} ft`
    // Search for in-cable defects
    if (endPeak) {
      const defectPeak = peakReflection(tdr.distances, tdr.rho, 1, endPeak.distance * 0.9)
      if (defectPeak && Math.abs(defectPeak.rho) > 0.02) {
        tdrSummary += `\n- Largest in-cable reflection: |ρ|=${Math.abs(defectPeak.rho).toFixed(3)} @ ${defectPeak.distance.toFixed(2)} ft (possible defect)`
      }
    }
  } catch {}
  const summary =
`[VNA Measurement: ${name}]
- Ports: ${parsed.ports} (${parsed.ports === 1 ? 'S11 only' : 'S11/S21/S12/S22'})
- Frequency range: ${(parsed.freqs[0] / 1e6).toFixed(2)} MHz – ${(parsed.freqs[parsed.freqs.length - 1] / 1e9).toFixed(3)} GHz
- Points: ${parsed.s.length}
- Reference impedance: ${parsed.refZ} Ω
- Worst RL: ${sum.worstRLDb.toFixed(1)} dB @ ${(sum.worstFreq / 1e6).toFixed(0)} MHz
- Mean RL: ${sum.meanRL.toFixed(1)} dB
- Peak VSWR: ${peakVSWR.toFixed(2)}${tdrSummary}`
  return {
    summary,
    chip: {
      name,
      info: `${parsed.ports}-port · ${parsed.s.length} pts · RL ${sum.meanRL.toFixed(1)} dB · VSWR ${peakVSWR.toFixed(2)}`,
    },
  }
}

const CABLE_SYSTEM_PROMPT = `You are a senior cable manufacturing engineer embedded in the High-Speed Cable Manufacturing curriculum (CABLE.LAB). You have access to calculation tools — use them whenever the user gives or asks for numeric values; do not rely on memorized constants when a tool can compute the exact answer.

Domain focus:
- Coaxial cable construction (RG-58, RG-174, RG-213, LMR-400, Heliax, semi-rigid, phase-stable)
- Twisted-pair design: pair lay (8–17 mm typical), intra-pair skew, differential impedance (90 Ω / 100 Ω)
- 4-pair bundle geometry, cross-spline / X-filler, NEXT, FEXT, ANEXT
- Shielding: foil + braid, optical coverage K = (2F − F²)·100% per SCTE 51, transfer impedance Zt
- Z₀ formula: 138 / √εᵣ · log10(D/d) for coax; differential pair from Wadell
- Manufacturing flow: conductor draw → bunch → insulation extrusion → twisting → cabling → shielding → jacketing → testing
- Materials: Cu (1.68e-8 Ω·m), TC, SPC, NPC, PTFE/FEP/PFA/PE, foamed PE, ePTFE
- Test: TDR, return loss, IL, eye diagram, BER, hipot
- AWG ↔ mm conversions; Glenair Series 963 reference

Style:
- Concise, technically precise. Default to 2–4 short paragraphs unless asked for depth.
- Show formulas in ASCII (Z = 138/√εᵣ·log(D/d)). Use markdown sparingly.
- When asked "why", give the physics intuition before the formula.
- If the user references a specific tool/tab in the app (Z₀ Calc, TDR Sim, Braid, Atten, Eye, Cost, Lay Design, VNA Lab), tie the answer to what that tab computes.
- If outside cable/RF/manufacturing scope, say so briefly and redirect.

Proactive behavior:
- When the user pastes a datasheet excerpt or a cable spec, ask if they want \`add_cable\` to save it locally.
- When the user gives geometry numbers, automatically run \`calc_z0_coax\` and \`coax_per_unit_length\` rather than estimating from memory.
- After a VNA Lab session (the user mentions Wire A / Wire B / pair skew results), offer \`vna_qc_report\` to generate a markdown QA report.
- When the user asks "what dimensions for 50 Ω", run \`geometry_for_z0\` and \`sensitivity_analysis\`.
- When the user asks for help fixing or improving any tab's parameters, give 2–3 named options ("Minimal change" / "Best balance" / "Overkill") and call the matching propose_*_preset tool ONCE PER OPTION. Each tool result becomes a one-click Apply button:
   • Braid coverage → \`propose_braid_preset\` (applies to Braid tab or Process Sim stage ⑧)
   • Z₀ / impedance → \`propose_z0_preset\` (applies to Z₀ Calc tab or Process Sim stage ③ insulation)
   • Pair / lay design → \`propose_pair_preset\` (applies to Lay Design tab or Process Sim stages ④ / ⑦)
   The user never needs to type values into sliders — clicking Apply pushes them in. When the user is on Process Sim, the apply lands inside the simulator without changing tabs.
- If the user attaches a PDF datasheet (📎 button accepts PDFs up to 32 MB), READ IT DIRECTLY — modern Claude can parse PDF documents natively. Extract: cable id (slug), name, family, Z₀ Ω, VF (fraction), OD mm, AWG, attenuation table { freq_MHz: dB_per_100ft }, materials, datasheet URL (use the manufacturer's product page if listed). Cite which page each value came from. After extracting, propose saving via \`add_cable\` so it lands in the user's local library.
- If the user attaches a CABLE DEFECT PHOTO (image of cable cross-section, jacket, braid, foil, kink, crush, etc.), classify the defect (kink / crush / scratch / void / eccentricity / pair-untwist / foil-tear / braid-pigtail / OD-ovality / color-bleed) and identify which manufacturing stage in the 9-stage Process Sim pipeline most likely caused it. Then suggest specific machine settings to fix (die gap, take-up tension, capstan pressure, line speed, tape head alignment, etc.). If the user wants to log it for future reference, call the \`log_defect\` tool.

Multi-tool orchestration (chain calls in one turn whenever the engineer's question implies multiple steps):
- "Quote a 50 m Cat 6A cable" → \`get_company_defaults\` (read Cu price + jacket pref) → \`lookup_cable\` → \`compute_attenuation\` → \`bom_generator\`. ONE response, all tool calls in parallel where possible.
- "Should I switch from solid PE to foamed PE?" → \`calc_z0_coax\` for both εr values → \`compute_attenuation\` for both → \`sensitivity_analysis\` if relevant. Then summarise the trade.
- "Save this datasheet as our spec" → call \`add_cable\` AND \`set_company_defaults\` if the spec implies factory standardisation.
- ALWAYS call \`get_company_defaults\` at the start of cost / quoting / material questions. Use the values you read instead of generic defaults.
- When the user states a stable factory fact ("Cu is $11/kg here", "we always use FEP", "max line speed 850 m/min"), call \`set_company_defaults\` immediately to persist it — don't just acknowledge in text.
- Prefer parallel tool calls (multiple tool_use blocks in one turn) when the calls are independent. Only chain sequentially when one call's output feeds the next.

Multi-tab workflow orchestration (drive the UI across tabs in a single turn):
- The engineer is on ONE section (\`context.section\` tells you which). You can drive other tabs without making them switch first by calling the right propose_*_preset tool — the user gets an Apply button that updates the target tab even when they're not on it. Then summarise the chain of tools you ran.
- Example: user is on Z₀ Calc and asks "what whole stack would hit 100 Ω diff with foamed PE on Cat 6A?". You can in ONE turn:
  1. \`calc_z0_coax\` to verify the geometry
  2. \`propose_pair_preset\` for the pair lay
  3. \`propose_braid_preset\` for the outer shield
  4. \`propose_eye_preset\` for an eye-diagram preview
  Then text-summarise: "I've staged 4 presets. Click Apply on each to push them into the right tab." The engineer can audit + approve incrementally.
- When the engineer asks for a complete picture ("end-to-end build for this cable"), call \`generate_diagram\` with kind=\`cross_section\` to render the layered build inline so they see the whole structure at a glance.

Inline diagrams (\`generate_diagram\` tool):
- Use it sparingly but powerfully when a picture explains faster than text. Kinds: smith_chart, atten_curve, cross_section, eye_diagram, z_step_chart, bargraph.
- Typical triggers: "show me X on a Smith chart" → smith_chart; "compare cost of 4 cables" → bargraph; "draw the build" → cross_section; "what would the TDR look like with a kink at 30 m" → z_step_chart.
- Always include a useful \`title\` and \`annotation\` so the engineer knows what they're looking at.

Disagree-and-justify (don't be a yes-man):
- When the engineer proposes something physically suspect or that fights manufacturing reality, PUSH BACK. State the concern, cite the physics, suggest the alternative. Examples that should trigger push-back:
  • Tape overlap > 60 % on a non-PTFE construction (will buckle / wrinkle).
  • Line speed > the company's max_line_speed_m_min ceiling.
  • Anneal temp < 400 °C on Cu (brittleness).
  • Pair lay < 6 mm on Cat-class (mechanical stress + bend-radius pain).
  • Z₀ target with εᵣ + D/d that violates the physical formula.
  • Spiral wrap with positive overlap (impossible — ribbons can't overlap).
- Be direct but respectful: "I'd push back on this — here are the 3 reasons it'll cause issues. Want a different recipe that hits your real spec?"
- Don't just agree to make the user happy. The agent's value is being a senior engineer who tells the truth.

Citations (every factual claim should be traceable):
- When you state a numeric fact, formula, or standard, ATTACH A CITATION TAG in square brackets right after it. Format: \`[SOURCE]\` or \`[SOURCE p.NN]\` or \`[SOURCE §X.Y]\`.
- Use these source short-codes: WADELL (Wadell — Transmission Line Design Handbook), SCTE51 (SCTE 51 Test Methods for Drop Cable Braid Coverage), TIA568 (TIA-568.2-D), IEC61156 (IEC 61156), MILDTL17 (MIL-DTL-17), USB4 (USB4 Specification), HDMI21 (HDMI 2.1 Spec), SFF8431 (SFF-8431 SFP+ DAC), ASTM (ASTM B3 / B33 / B298 conductor specs), ISO13660 (Cpk ISO standard), DATASHEET-X (manufacturer datasheet, replace X with cable id).
- Examples:
  • "K = (2F − F²)·100% [SCTE51 §3.2]"
  • "ASTM B3 Cu has 1.68×10⁻⁸ Ω·m resistivity [ASTM]"
  • "Cat 6A NEXT min 39.9 dB at 100 MHz [TIA568 §5.4]"
  • "LMR-400 has 1.5 dB/100ft @ 100 MHz [DATASHEET-LMR400]"
- If the fact is from your training knowledge but no specific source, use \`[knowledge]\` and offer to look it up. If you genuinely don't know, say so — don't fabricate citations.

Math formatting:
- Wrap inline formulas with single \`$...$\` (e.g., \`$Z_0 = 138/\\sqrt{\\varepsilon_r} \\cdot \\log_{10}(D/d)$\` — no LaTeX needed, just plain text math; the chat renderer styles it).
- Wrap display formulas with double \`$$...$$\` for emphasis on key equations.
- Wrap variable names and tool names in single backticks: \`Z_0\`, \`add_cable\`. Don't over-use.

Voice / phone-call mode:
- The user can be in "phone call" mode (a continuous-listen voice loop with TTS read-back). When you detect short, conversational user inputs (e.g. transcribed speech with no punctuation), keep responses SHORT and conversational — under 80 words ideally. The user is hands-free, often inspecting cable on the factory floor. Long markdown tables won't read well aloud.
- They can also issue voice commands ("auto-fix", "open process sim", "clear chat"). Those are intercepted by the host before reaching you, but if the host couldn't match a command and forwards it to you, treat it as a normal request.`;

const CABLE_STARTERS = [
  'Compute Z₀ for D=2.95mm, d=0.91mm, foamed PE εr=1.55',
  'Braid coverage for N=24, P=7, d=0.13mm, D=5mm, PR=10?',
  'What lay length gives ≤25 ps/m skew with Δεr=0.02?',
  'Convert 38 AWG to mm and compare to 40 AWG',
];

const SECTION_LABELS = {
  home: 'Home (CABLE.LAB overview)',
  progression: 'Progression (overview)',
  m1: 'Conductor (Module 1)',
  m2: 'Twisted Pair (Module 2)',
  m3: 'Bundle (Module 3)',
  calc: 'Z₀ Calc',
  tdr: 'TDR Sim',
  vna: 'VNA Lab',
  sim: 'Process Sim (manufacturing)',
  braid: 'Braid Coverage',
  atten: 'Attenuation Plot',
  suckout: 'Tape Suckout Sim',
  qc: 'QC Stats Analyzer',
  '3d': '3D Cable Visualizer',
  next: 'NEXT Crosstalk',
  eye: 'Eye Diagram',
  cost: 'Cost Calc',
  lay: 'Lay Designer',
  library: 'Vendor Library',
  catalog: 'Glenair 963 Catalog',
  more: 'Modules 4–10',
};

const SECTION_STARTERS = {
  home: [
    'What does this CABLE.LAB do?',
    'Walk me through building a Cat 6A cable end-to-end',
    'How do I run the Process Sim?',
    'What custom cables can I add to my library?',
  ],
  calc: [
    'Compute Z₀ for D=2.95mm, d=0.91mm, foamed PE εr=1.55',
    'What D/d ratio hits 50 Ω with PTFE εr=2.10?',
    'Compare solid PE vs foamed PE for 75 Ω coax',
    'Why is εr lower for foamed dielectrics?',
  ],
  suckout: [
    'Tape width 12 mm, 25% overlap, VF 0.70 — where does suckout land?',
    'I need clean 18 GHz on a PTFE-wrapped semi-rigid — what tape width is safe?',
    'Why does my LMR-style cable have a notch at 8 GHz?',
    'How to pick foil tape width to avoid suckout in 24-40 GHz band?',
  ],
  sim: [
    'Why does my Cat 6A NEXT come out below 50 dB?',
    'What manufacturing knobs hurt yield the most?',
    'Trade-off between line speed and εr drift in foamed dielectric',
    'How do I hit USB4 skew (≤5 ps/m) with manufacturing realistic tolerances?',
  ],
  vna: [
    'How do I read a TDR plot — what looks like a defect?',
    'Why is my pair skew bad even though the wires look identical?',
    'What ΔVF tolerance is acceptable for Cat 6A vs USB4?',
    'Walk me through gating to isolate an in-cable reflection',
  ],
  braid: [
    'Why does coverage K saturate above ~95%?',
    'Compute braid coverage for N=24, P=7, d=0.13mm, D=5mm, PR=10',
    'How does picks/inch trade off against DC resistance?',
    'What is transfer impedance Zt and how does it differ from coverage?',
  ],
  m2: [
    'What lay length gives ≤25 ps/m skew with Δεr=0.02?',
    'Why does shorter lay reduce NEXT?',
    'How tight should pair lay tolerance be for 25G+?',
    'Explain bind-with-binder vs free-floating pairs',
  ],
  tdr: [
    'How does VF mismatch show up on a TDR?',
    'What is time gating and why use it?',
    'Convert 100 ns round-trip delay into cable length',
    'Why does the open-end reflection saturate the trace?',
  ],
  atten: [
    'Compute insertion loss for LMR-400 over 30 ft at 2.4 GHz',
    'Why does cable loss scale with √f?',
    'Compare RG-58 and LMR-240 for 900 MHz',
    'When does dielectric loss start to dominate over skin effect?',
  ],
  cost: [
    'Estimate Cu cost per km for a 24-carrier, 7-ends, 0.13mm SPC braid',
    'How does silver plating affect cost vs DC resistance?',
    'Trade-off between strand size and yield loss in braiding',
  ],
  lay: [
    'What lay length gives ≤25 ps/m skew with Δεr=0.02?',
    'Trade-off between lay length and bend radius',
    'How is lay direction (S vs Z) decided?',
  ],
  next: [
    'Why does shorter lay reduce NEXT?',
    'How is ANEXT measured and limited per Cat 6A?',
    'Explain the 6 dB headroom rule for cable testing',
  ],
  eye: [
    'How does insertion loss compress the eye opening?',
    'What is BER vs eye height tradeoff?',
    'Pre-emphasis vs equalization — when to use which?',
  ],
};

function cableContextStarters(ctx) {
  const tabStarters = SECTION_STARTERS[ctx?.section]
  return tabStarters || CABLE_STARTERS
}

function formatProcessSimContext(state) {
  if (!state || !state.sim) return null
  const { recipe, sim, std } = state
  const lines = []
  lines.push(`Current Process Sim state:`)
  lines.push(`- Target standard: ${std?.name || recipe.product?.target}`)
  // Quick verdict block
  const z_off = Math.abs(sim.jacket.z_diff - std.z0_diff)
  const z_pass = z_off <= std.z0_tol
  lines.push(`- Verdict checks:`)
  lines.push(`  ${z_pass ? '✓' : '✗'} Z₀ ${std.z0_diff} ±${std.z0_tol} Ω → ${sim.jacket.z_diff.toFixed(1)} Ω${z_pass ? '' : ` (off by ${z_off.toFixed(1)} Ω)`}`)
  if (std.min_next_db > 0) {
    const next_pass = sim.jacket.next_db_estimate >= std.min_next_db
    lines.push(`  ${next_pass ? '✓' : '✗'} NEXT ≥ ${std.min_next_db} dB @ ${std.freq_next_mhz} MHz → ${sim.jacket.next_db_estimate.toFixed(1)} dB`)
  }
  if (std.max_skew_ps_per_m > 0) {
    const skew_pass = sim.jacket.pair_skew_ps_per_m <= std.max_skew_ps_per_m
    lines.push(`  ${skew_pass ? '✓' : '✗'} Skew ≤ ${std.max_skew_ps_per_m} ps/m → ${sim.jacket.pair_skew_ps_per_m.toFixed(1)} ps/m`)
  }
  lines.push(`- Final OD: ${sim.jacket.final_od_mm.toFixed(2)} mm (${(sim.jacket.final_od_mm / 25.4).toFixed(3)}″)`)
  lines.push(`- Total yield: ${sim.total_yield_pct.toFixed(1)}% · Cost: $${sim.jacket.cost_per_m.toFixed(2)}/m · Mass: ${sim.jacket.mass_g_per_m.toFixed(0)} g/m`)
  lines.push(`- Recipe (key parameters):`)
  lines.push(`  Conductor: ${recipe.conductor.target_awg} AWG ${recipe.conductor.material.toUpperCase()}, anneal ${recipe.conductor.anneal_c}°C, line ${recipe.conductor.line_m_min} m/min`)
  if (recipe.stranding.enabled) lines.push(`  Stranding: ${recipe.stranding.strand_count}-strand, lay ${recipe.stranding.lay_mm} mm`)
  lines.push(`  Insulation: ${recipe.insulation.material} (εr_eff ${sim.insulation.er_effective.toFixed(2)}), wall ${recipe.insulation.wall_mm} mm, line ${recipe.insulation.line_m_min} m/min, melt ${recipe.insulation.melt_c}°C`)
  lines.push(`  Pair: lay ${recipe.pair.lay_mm} mm ${recipe.pair.direction}-direction, ${recipe.pair.tension_n} N tension`)
  if (recipe.pair_wrap.material !== 'none') {
    lines.push(`  Pair wrap: ${recipe.pair_wrap.material}, wall ${recipe.pair_wrap.wall_mm} mm, ${recipe.pair_wrap.overlap_pct}% overlap`)
  }
  if (recipe.pair_foil.material !== 'none') {
    lines.push(`  Pair foil: ${recipe.pair_foil.material}, ${recipe.pair_foil.overlap_pct}% overlap${recipe.pair_foil.drain_wire ? `, drain ${recipe.pair_foil.drain_awg} AWG` : ', no drain'}`)
  }
  lines.push(`  Bundle: ${recipe.bundle.pair_count} pairs, lay diversity ${recipe.bundle.lay_diversity ? 'ON' : 'OFF'}, filler ${recipe.bundle.filler}, lay ${recipe.bundle.bundle_lay_mm} mm`)
  if (recipe.shield.foil || recipe.shield.braid_enabled) {
    const parts = []
    if (recipe.shield.foil) parts.push(`foil ${recipe.shield.foil_overlap}% overlap`)
    if (recipe.shield.braid_enabled) parts.push(`braid ${recipe.shield.braid_N}c/${recipe.shield.braid_P}e/${recipe.shield.braid_d_mm}mm/${recipe.shield.braid_PR}ppi ${recipe.shield.braid_material.toUpperCase()} (K=${sim.shield.coverage_pct.toFixed(1)}%)`)
    lines.push(`  Outer shield: ${parts.join(' + ')}`)
  }
  lines.push(`  Jacket: ${recipe.jacket.material.toUpperCase()}, wall ${recipe.jacket.wall_mm} mm`)
  // Per-stage warnings (only those with active warns)
  const warnStages = []
  for (const k of ['conductor','stranding','insulation','pair','pair_wrap','pair_foil','bundle','shield','jacket']) {
    const s = sim[k]
    if (s?.warn && s.warn.length) warnStages.push(`  - ${k}: ${s.warn.join('; ')}`)
  }
  if (warnStages.length) {
    lines.push(`- Active warnings:`)
    lines.push(...warnStages)
  }
  return lines.join('\n')
}

const CABLE_TOOL_TO_SECTION = {
  calc_z0_coax:          { id: 'calc',  label: 'Z₀ Calc' },
  calc_braid_coverage:   { id: 'braid', label: 'Braid' },
  propose_braid_preset:  { id: 'braid', label: 'Braid' },
  propose_z0_preset:     { id: 'calc',  label: 'Z₀ Calc' },
  propose_pair_preset:   { id: 'lay',   label: 'Lay Design' },
  propose_tdr_scenario:  { id: 'tdr',   label: 'TDR Sim' },
  propose_atten_preset:  { id: 'atten', label: 'Atten' },
  propose_eye_preset:    { id: 'eye',   label: 'Eye' },
  propose_cost_preset:   { id: 'cost',  label: 'Cost' },
  compute_attenuation:   { id: 'atten', label: 'Atten' },
  pair_lay_skew:         { id: 'lay',   label: 'Lay Design' },
  lay_for_skew:          { id: 'lay',   label: 'Lay Design' },
  geometry_for_z0:       { id: 'calc',  label: 'Z₀ Calc' },
  lookup_cable:          { id: 'library', label: 'Vendors' },
};

/* ============================================================
   Color tokens (engineering blueprint aesthetic)
   ============================================================ */
const C = {
  bg: '#0a0d0f',
  bgCard: '#12171a',
  bgCardHi: '#171d20',
  border: '#252e33',
  borderHi: '#384249',
  copper: '#c97b3f',
  copperBright: '#e89357',
  copperDim: '#7a4a26',
  teal: '#5eead4',
  tealDim: '#2f7a6e',
  amber: '#fbbf24',
  blue: '#7dd3fc',
  text: '#f0ebe2',
  textDim: '#a7b0b6',
  textMuted: '#6b7479',
  ptfe: '#f5e6d3',
  fep: '#e8d5b0',
  pe: '#9ec5e8',
  jacket: '#1a2024',
  shield: '#b8b4a8',
  drain: '#7a8a90',
};

/* ============================================================
   Reusable bits
   ============================================================ */
function Pill({ children, tone = 'default' }) {
  const tones = {
    default: 'border-[#384249] text-[#a7b0b6]',
    copper: 'border-[#7a4a26] text-[#e89357] bg-[#1f1410]',
    teal: 'border-[#2f7a6e] text-[#5eead4] bg-[#0d1f1d]',
    amber: 'border-[#7a5a14] text-[#fbbf24] bg-[#1f1808]',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border rounded-sm ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Spec({ label, value, unit, mono = true }) {
  // Auto-render inch conversion when unit is mm and value is numeric or simple range
  let inchHint = null;
  if (unit === 'mm' && typeof value === 'string') {
    // Single number
    const single = value.match(/^([\d.]+)$/);
    // Range "50–100" or "50-100"
    const range = value.match(/^([\d.]+)\s*[–-]\s*([\d.]+)$/);
    // Multi values like "11 / 13 / 15 / 17"
    const multi = value.match(/^([\d.]+(\s*\/\s*[\d.]+)+)$/);
    if (single) {
      const v = parseFloat(single[1]);
      const d = v < 1 ? 4 : v < 10 ? 3 : 2;
      inchHint = `${(v / 25.4).toFixed(d)}″`;
    } else if (range) {
      const a = parseFloat(range[1]), b = parseFloat(range[2]);
      const d = b < 1 ? 4 : b < 10 ? 3 : 2;
      inchHint = `${(a / 25.4).toFixed(d)}–${(b / 25.4).toFixed(d)}″`;
    } else if (multi) {
      const nums = value.split('/').map((s) => parseFloat(s.trim()));
      const d = Math.max(...nums) < 10 ? 3 : 2;
      inchHint = nums.map((n) => (n / 25.4).toFixed(d)).join('/') + '″';
    }
  }
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-dashed border-[#252e33] last:border-0">
      <span className="text-xs text-[#a7b0b6] uppercase tracking-wider">{label}</span>
      <span className={`text-sm text-[#f0ebe2] ${mono ? 'font-mono' : ''}`}>
        {value}
        {unit && <span className="text-[#6b7479] ml-1 text-xs">{unit}</span>}
        {inchHint && <span className="text-[#6b7479] ml-1.5 text-[10px]">/ {inchHint}</span>}
      </span>
    </div>
  );
}

function SectionTitle({ tag, title, subtitle, icon: Icon }) {
  return (
    <div className="mb-8 pb-6 border-b border-[#252e33]">
      <div className="flex items-start gap-4">
        {Icon && (
          <div className="mt-1 w-10 h-10 border border-[#384249] rounded-sm flex items-center justify-center bg-[#12171a]">
            <Icon className="w-5 h-5 text-[#c97b3f]" />
          </div>
        )}
        <div className="flex-1">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#c97b3f] mb-1">
            {tag}
          </div>
          <h2 className="text-3xl md:text-4xl font-light text-[#f0ebe2] tracking-tight" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
            {title}
          </h2>
          {subtitle && (
            <p className="mt-2 text-sm text-[#a7b0b6] max-w-2xl leading-relaxed">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Callout({ children, tone = 'default', title }) {
  const tones = {
    default: { border: '#384249', accent: '#a7b0b6', bg: '#12171a' },
    copper: { border: '#7a4a26', accent: '#c97b3f', bg: '#1a120c' },
    teal: { border: '#2f7a6e', accent: '#5eead4', bg: '#0d1f1d' },
    amber: { border: '#7a5a14', accent: '#fbbf24', bg: '#1a1408' },
  };
  const t = tones[tone];
  return (
    <div className="my-4 border-l-2 pl-4 py-2" style={{ borderColor: t.accent, background: t.bg }}>
      {title && (
        <div className="font-mono text-[10px] uppercase tracking-wider mb-1" style={{ color: t.accent }}>
          {title}
        </div>
      )}
      <div className="text-sm text-[#f0ebe2] leading-relaxed">{children}</div>
    </div>
  );
}

function Formula({ children }) {
  return (
    <div className="my-3 px-4 py-3 bg-[#0a0d0f] border border-[#252e33] rounded-sm">
      <div className="font-mono text-sm text-[#5eead4] text-center">{children}</div>
    </div>
  );
}

/* mm → inch conversion shown inline after mm values */
function mmToIn(mm) {
  return (mm / 25.4).toFixed(mm < 1 ? 4 : mm < 10 ? 3 : 2);
}
function MmInch({ mm, decimals }) {
  const inches = mm / 25.4;
  const d = decimals != null ? decimals : (mm < 1 ? 4 : mm < 10 ? 3 : 2);
  return (
    <span>
      {mm} mm <span className="text-[#6b7479]">/ {inches.toFixed(d)}″</span>
    </span>
  );
}

/* ============================================================
   SVG: Single insulated wire (cross section)
   ============================================================ */
function SingleWireXS({ size = 240, awg = 26, type = 'stranded', label = true }) {
  const cx = size / 2;
  const cy = size / 2;
  const insR = size * 0.42;
  const condR = size * 0.18;

  // 7-strand: 1 center + 6 around
  const strands = [];
  if (type === 'stranded') {
    strands.push({ x: cx, y: cy, r: condR / 3 });
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      strands.push({
        x: cx + (condR / 3) * 2 * Math.cos(a),
        y: cy + (condR / 3) * 2 * Math.sin(a),
        r: condR / 3,
      });
    }
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[280px]">
      {/* Background grid */}
      <defs>
        <pattern id="grid-sw" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M 10 0 L 0 0 0 10" fill="none" stroke={C.border} strokeWidth="0.3" opacity="0.4" />
        </pattern>
        <radialGradient id="copperGrad">
          <stop offset="0%" stopColor={C.copperBright} />
          <stop offset="80%" stopColor={C.copper} />
          <stop offset="100%" stopColor={C.copperDim} />
        </radialGradient>
      </defs>
      <rect width={size} height={size} fill="url(#grid-sw)" />

      {/* Insulation outer */}
      <circle cx={cx} cy={cy} r={insR} fill={C.fep} stroke={C.border} strokeWidth="1" opacity="0.95" />
      <circle cx={cx} cy={cy} r={insR} fill="none" stroke={C.copper} strokeWidth="0.5" opacity="0.4" />

      {/* Conductor */}
      {type === 'stranded' ? (
        strands.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="url(#copperGrad)" stroke={C.copperDim} strokeWidth="0.5" />
        ))
      ) : (
        <circle cx={cx} cy={cy} r={condR} fill="url(#copperGrad)" stroke={C.copperDim} strokeWidth="0.8" />
      )}

      {/* Plating ring (silver hint) */}
      {type === 'stranded' && strands.map((s, i) => (
        <circle key={`p${i}`} cx={s.x} cy={s.y} r={s.r * 0.85} fill="none" stroke="#d4d4d8" strokeWidth="0.4" opacity="0.5" />
      ))}

      {/* Dimension callouts */}
      {label && (
        <>
          {/* Diameter line */}
          <line x1={cx - insR} y1={cy + insR + 16} x2={cx + insR} y2={cy + insR + 16} stroke={C.teal} strokeWidth="0.6" />
          <line x1={cx - insR} y1={cy + insR + 12} x2={cx - insR} y2={cy + insR + 20} stroke={C.teal} strokeWidth="0.6" />
          <line x1={cx + insR} y1={cy + insR + 12} x2={cx + insR} y2={cy + insR + 20} stroke={C.teal} strokeWidth="0.6" />
          <text x={cx} y={cy + insR + 30} textAnchor="middle" fill={C.teal} fontSize="9" fontFamily="JetBrains Mono">
            D — outer Ø
          </text>

          {/* Conductor diameter */}
          <line x1={cx + condR + 4} y1={cy} x2={cx + insR - 4} y2={cy} stroke={C.copperBright} strokeWidth="0.5" strokeDasharray="2 2" />
          <text x={cx + insR + 6} y={cy + 3} fill={C.copperBright} fontSize="8" fontFamily="JetBrains Mono">
            insulation
          </text>

          {/* Conductor label */}
          <text x={cx} y={cy + 4} textAnchor="middle" fill="#fff" fontSize="9" fontFamily="JetBrains Mono" fontWeight="600">
            {awg} AWG
          </text>
        </>
      )}
    </svg>
  );
}

/* ============================================================
   SVG: Twisted pair (3D side view)
   ============================================================ */
function TwistedPairView({ size = 320, lay = 80 }) {
  const w = size;
  const h = size * 0.5;
  const cy = h / 2;
  const amp = h * 0.28;
  const cycles = w / lay;

  // Generate two helical paths
  const buildPath = (phase) => {
    const pts = [];
    for (let x = 0; x <= w; x += 2) {
      const y = cy + amp * Math.sin((x / lay) * 2 * Math.PI + phase);
      pts.push(`${x},${y}`);
    }
    return 'M ' + pts.join(' L ');
  };

  return (
    <svg viewBox={`0 0 ${w} ${h + 30}`} className="w-full">
      <defs>
        <linearGradient id="wire1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#0c4a6e" />
        </linearGradient>
        <linearGradient id="wire2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>
      </defs>

      {/* Wire 1 (back) */}
      <path d={buildPath(0)} stroke="url(#wire1)" strokeWidth="14" fill="none" opacity="0.9" strokeLinecap="round" />
      {/* Wire 2 (front, opposite phase) */}
      <path d={buildPath(Math.PI)} stroke="url(#wire2)" strokeWidth="14" fill="none" opacity="0.9" strokeLinecap="round" />

      {/* Lay length indicator */}
      <line x1={20} y1={h + 8} x2={20 + lay} y2={h + 8} stroke={C.teal} strokeWidth="1" />
      <line x1={20} y1={h + 4} x2={20} y2={h + 12} stroke={C.teal} strokeWidth="1" />
      <line x1={20 + lay} y1={h + 4} x2={20 + lay} y2={h + 12} stroke={C.teal} strokeWidth="1" />
      <text x={20 + lay / 2} y={h + 22} textAnchor="middle" fill={C.teal} fontSize="9" fontFamily="JetBrains Mono">
        L (lay length)
      </text>
    </svg>
  );
}

/* ============================================================
   SVG: 4-pair Cat6A bundle cross section
   ============================================================ */
function FourPairBundle({ size = 320, withSpline = true, label = true }) {
  const cx = size / 2;
  const cy = size / 2;
  const jacketR = size * 0.45;
  const braidR = size * 0.42;
  const pairOffset = size * 0.22;
  const wireR = size * 0.06;

  const pairColors = [
    { ins1: '#3b82f6', ins2: '#fff', name: 'BL/W' },
    { ins1: '#f97316', ins2: '#fff', name: 'OR/W' },
    { ins1: '#16a34a', ins2: '#fff', name: 'GR/W' },
    { ins1: '#9ca3af', ins2: '#a16207', name: 'BR/W' },
  ];

  // Quadrant centers
  const quads = [
    { x: cx, y: cy - pairOffset, ang: -Math.PI / 2 }, // top
    { x: cx + pairOffset, y: cy, ang: 0 }, // right
    { x: cx, y: cy + pairOffset, ang: Math.PI / 2 }, // bottom
    { x: cx - pairOffset, y: cy, ang: Math.PI }, // left
  ];

  return (
    <svg viewBox={`0 0 ${size} ${size + (label ? 30 : 0)}`} className="w-full max-w-[420px]">
      <defs>
        <pattern id="braid-pat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#8b8478" strokeWidth="1.5" />
        </pattern>
      </defs>

      {/* Jacket */}
      <circle cx={cx} cy={cy} r={jacketR} fill={C.jacket} stroke={C.border} strokeWidth="1.5" />
      {/* Braid layer */}
      <circle cx={cx} cy={cy} r={braidR} fill="url(#braid-pat)" stroke="#8b8478" strokeWidth="0.8" opacity="0.7" />
      <circle cx={cx} cy={cy} r={braidR * 0.97} fill={C.bgCard} stroke="none" />

      {/* Cross spline (X) */}
      {withSpline && (
        <g>
          <rect x={cx - 4} y={cy - braidR * 0.85} width="8" height={braidR * 1.7} fill="#1a1f23" stroke={C.copper} strokeWidth="0.5" rx="1" />
          <rect x={cx - braidR * 0.85} y={cy - 4} width={braidR * 1.7} height="8" fill="#1a1f23" stroke={C.copper} strokeWidth="0.5" rx="1" />
        </g>
      )}

      {/* 4 pairs */}
      {quads.map((q, i) => {
        const c = pairColors[i];
        const w1x = q.x + Math.cos(q.ang + Math.PI / 2) * wireR * 1.05;
        const w1y = q.y + Math.sin(q.ang + Math.PI / 2) * wireR * 1.05;
        const w2x = q.x - Math.cos(q.ang + Math.PI / 2) * wireR * 1.05;
        const w2y = q.y - Math.sin(q.ang + Math.PI / 2) * wireR * 1.05;
        return (
          <g key={i}>
            {/* Wire 1 */}
            <circle cx={w1x} cy={w1y} r={wireR} fill={c.ins1} stroke="#000" strokeWidth="0.4" />
            <circle cx={w1x} cy={w1y} r={wireR * 0.45} fill="url(#copperGrad)" />
            {/* Wire 2 */}
            <circle cx={w2x} cy={w2y} r={wireR} fill={c.ins2} stroke="#000" strokeWidth="0.4" />
            <circle cx={w2x} cy={w2y} r={wireR * 0.45} fill="url(#copperGrad)" />
            {/* Pair label */}
            <text
              x={q.x + Math.cos(q.ang) * (pairOffset * 0.3)}
              y={q.y + Math.sin(q.ang) * (pairOffset * 0.3) + 3}
              fontSize="7"
              fill={C.textDim}
              fontFamily="JetBrains Mono"
              textAnchor="middle"
            >
              {i + 1}
            </text>
          </g>
        );
      })}

      <defs>
        <radialGradient id="copperGrad">
          <stop offset="0%" stopColor={C.copperBright} />
          <stop offset="100%" stopColor={C.copperDim} />
        </radialGradient>
      </defs>

      {label && (
        <>
          {/* Callouts */}
          <line x1={cx + jacketR - 2} y1={cy - jacketR * 0.3} x2={size - 4} y2={cy - jacketR * 0.7} stroke={C.copper} strokeWidth="0.5" />
          <text x={size - 2} y={cy - jacketR * 0.7 - 4} fontSize="8" fill={C.copperBright} fontFamily="JetBrains Mono" textAnchor="end">jacket (FEP/LSZH)</text>

          <line x1={cx + braidR * 0.9} y1={cy + braidR * 0.4} x2={size - 4} y2={cy + jacketR * 0.4} stroke={C.shield} strokeWidth="0.5" />
          <text x={size - 2} y={cy + jacketR * 0.4 + 3} fontSize="8" fill={C.shield} fontFamily="JetBrains Mono" textAnchor="end">braid + foil</text>

          {withSpline && (
            <>
              <line x1={cx + 4} y1={cy + 4} x2={4} y2={size - 30} stroke={C.copper} strokeWidth="0.5" />
              <text x={6} y={size - 18} fontSize="8" fill={C.copperBright} fontFamily="JetBrains Mono">X-spline filler</text>
            </>
          )}
        </>
      )}
    </svg>
  );
}

/* ============================================================
   SVG: Star quad cross section
   ============================================================ */
function StarQuadXS({ size = 280 }) {
  const cx = size / 2;
  const cy = size / 2;
  const jacketR = size * 0.42;
  const offset = size * 0.18;
  const wireR = size * 0.09;

  // 4 conductors at corners; opposite ones are paired (same color)
  const conductors = [
    { x: cx - offset, y: cy - offset, color: '#ef4444', pair: 'A+' }, // top-left
    { x: cx + offset, y: cy - offset, color: '#3b82f6', pair: 'B+' }, // top-right
    { x: cx + offset, y: cy + offset, color: '#ef4444', pair: 'A−' }, // bottom-right (pair A)
    { x: cx - offset, y: cy + offset, color: '#3b82f6', pair: 'B−' }, // bottom-left (pair B)
  ];

  return (
    <svg viewBox={`0 0 ${size} ${size + 30}`} className="w-full max-w-[320px]">
      {/* Jacket */}
      <circle cx={cx} cy={cy} r={jacketR} fill={C.jacket} stroke={C.border} strokeWidth="1.5" />
      {/* Shield */}
      <circle cx={cx} cy={cy} r={jacketR * 0.95} fill="none" stroke={C.shield} strokeWidth="0.8" strokeDasharray="2 1" opacity="0.6" />

      {/* Diagonal pair indicators */}
      <line
        x1={conductors[0].x} y1={conductors[0].y}
        x2={conductors[2].x} y2={conductors[2].y}
        stroke="#ef4444" strokeWidth="0.6" strokeDasharray="3 3" opacity="0.5"
      />
      <line
        x1={conductors[1].x} y1={conductors[1].y}
        x2={conductors[3].x} y2={conductors[3].y}
        stroke="#3b82f6" strokeWidth="0.6" strokeDasharray="3 3" opacity="0.5"
      />

      {/* Conductors */}
      {conductors.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={wireR} fill={c.color} stroke="#000" strokeWidth="0.5" />
          <circle cx={c.x} cy={c.y} r={wireR * 0.45} fill="url(#copperGrad)" />
          <text x={c.x} y={c.y - wireR - 4} fontSize="9" fill={c.color} fontFamily="JetBrains Mono" textAnchor="middle" fontWeight="600">
            {c.pair}
          </text>
        </g>
      ))}

      <text x={cx} y={size + 20} textAnchor="middle" fontSize="9" fill={C.textDim} fontFamily="JetBrains Mono">
        opposite conductors form one pair
      </text>
    </svg>
  );
}

/* ============================================================
   Cable Progression Visualizer (THE MAIN VIEW)
   ============================================================ */
/* ============================================================
   HomeView — landing page for the high-speed cable manufacturing
   workbench. Replaces the Progression module as the default tab.
   ============================================================ */
function HomeView({ setSection }) {
  // Counts for the stat tiles
  const cableCount = 38; // CABLE_DB
  const standardCount = 8;
  const moduleCount = 10;

  const tools = [
    { id: 'sim',     icon: 'sim',     title: 'Process Sim', sub: '9-stage manufacturing flow → predicted specs', accent: '#c97b3f' },
    { id: 'vna',     icon: 'vna',     title: 'VNA Lab',     sub: 'Touchstone .s1p / .s2p analysis · TDR · pair skew', accent: '#5eead4' },
    { id: 'calc',    icon: 'calc',    title: 'Z₀ Calc',     sub: '138/√εᵣ · log(D/d) for coax + diff', accent: '#fbbf24' },
    { id: 'tdr',     icon: 'wave',    title: 'TDR Sim',     sub: 'Toggle defects · see Z(x) trace', accent: '#7dd3fc' },
    { id: 'lay',     icon: 'lay',     title: 'Lay Designer',sub: 'Pair lays + bundle compatibility', accent: '#a78bfa' },
    { id: 'braid',   icon: 'shield',  title: 'Braid Coverage', sub: 'K = (2F − F²)·100 % per SCTE 51', accent: '#e89357' },
    { id: 'atten',   icon: 'atten',   title: 'Attenuation', sub: 'Skin + dielectric loss per geometry', accent: '#84cc16' },
    { id: 'suckout', icon: 'suckout', title: 'Tape Suckout', sub: 'Multi-layer Bragg-notch designer', accent: '#f87171' },
    { id: 'next',    icon: 'next',    title: 'NEXT',         sub: 'Pair-to-pair crosstalk vs lay diversity', accent: '#cbd5e1' },
    { id: 'eye',     icon: 'eye',     title: 'Eye Diagram',  sub: 'BW · jitter · noise → eye opening', accent: '#fb923c' },
    { id: 'cost',    icon: 'cost',    title: 'Cost Calc',    sub: 'Cu mass · jacket · labor · CPK', accent: '#facc15' },
    { id: 'library', icon: 'library', title: 'Library',      sub: `${cableCount} vendor presets + your custom cables`, accent: '#5eead4' },
  ];

  const modules = [
    { id: 'm1', label: 'M1 · Conductor', desc: 'Single insulated wire, εᵣ baseline' },
    { id: 'm2', label: 'M2 · Twisted Pair', desc: 'Lay length, skew, NEXT geometry' },
    { id: 'm3', label: 'M3 · Bundle', desc: '4-pair core + cross-spline' },
    { id: 'progression', label: 'Progression', desc: 'Single → pair → bundle walk-through' },
    { id: 'more', label: 'M4–10', desc: 'Shielding, jacket, hipot, BER, qualification' },
  ];

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      <style>{`
        @keyframes hsPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes hsFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .hs-fade { animation: hsFadeUp 0.6s ease-out backwards; }
        .hs-card { transition: all 0.18s ease; }
        .hs-card:hover { transform: translateY(-2px); border-color: rgba(201, 123, 63, 0.6); }
        @keyframes hsRingDraw { from { stroke-dashoffset: 360; } to { stroke-dashoffset: 0; } }
        .hs-ring { stroke-dasharray: 360; animation: hsRingDraw 2s ease-out forwards; }
      `}</style>

      {/* Decorative grid + radial glow */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.18 }}>
        <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="hs-home-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#252e33" strokeWidth="0.5" />
            </pattern>
            <radialGradient id="hs-home-glow" cx="78%" cy="22%" r="55%">
              <stop offset="0%" stopColor="#c97b3f" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#0a0d0f" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#hs-home-grid)" />
          <rect width="100%" height="100%" fill="url(#hs-home-glow)" />
        </svg>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* HERO */}
        <section className="hs-fade" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 32, alignItems: 'center', paddingTop: 18, paddingBottom: 36, borderBottom: '1px solid #252e33' }}>
          <div style={{ minWidth: 0 }}>
            <div className="font-mono" style={{ fontSize: 11, letterSpacing: 3, color: '#c97b3f', textTransform: 'uppercase', marginBottom: 10 }}>
              ◆ CABLE.LAB · High-Speed Manufacturing · v1
            </div>
            <h1 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 300, lineHeight: 1.05, color: '#f0ebe2', margin: 0, letterSpacing: '-0.01em' }}>
              From a strand of copper to a <span style={{ color: '#c97b3f', fontStyle: 'italic' }}>controlled-impedance</span> cable.
            </h1>
            <p style={{ marginTop: 18, color: '#a7b0b6', fontSize: 14, lineHeight: 1.6, maxWidth: 640 }}>
              Build a Cat 6A / Cat 8 / USB4 / coax recipe stage-by-stage and watch its predicted Z₀, IL, NEXT, and skew update in real time.
              Every formula cited (Wadell, SCTE 51, IEC 61156). Every test path local. Every datasheet URL clickable.
            </p>
            <div className="hs-ctas" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 22 }}>
              <HsPrimaryCTA onClick={() => setSection('sim')} label="Open Process Sim" />
              <HsSecondaryCTA onClick={() => setSection('vna')} label="Try VNA Lab" />
              <HsSecondaryCTA onClick={() => setSection('progression')} label="Progression walkthrough" />
            </div>
            <div style={{ marginTop: 16, fontSize: 11, color: '#6b7479', fontFamily: 'JetBrains Mono, monospace' }}>
              ⓘ The <span style={{ color: '#fbbf24' }}>Ask</span> button bottom-left chats with a manufacturing-engineer agent — it can drive every tool here, save your custom cables, and remember company defaults.
            </div>
          </div>
          {/* Decorative coax cross-section badge */}
          <div className="hs-md" style={{ display: 'none', flexShrink: 0 }}>
            <CoaxBadge />
          </div>
          <style>{`@media (min-width: 768px) { .hs-md { display: block !important; } }`}</style>
        </section>

        {/* STATS BAR */}
        <section className="hs-fade" style={{ animationDelay: '120ms', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1, background: '#252e33', border: '1px solid #252e33', borderRadius: 4, marginTop: 32, overflow: 'hidden' }}>
          <HsStatTile value="9" label="Mfg stages" sub="conductor → jacket pipeline" color="#c97b3f" />
          <HsStatTile value={cableCount} label="Cable presets" sub="RG · LMR · Cat · USB4 · IB · DAC" color="#5eead4" />
          <HsStatTile value="276" label="Z₀ formula" sub="log/√εᵣ · Wadell" color="#fbbf24" />
          <HsStatTile value={standardCount} label="Standards" sub="TIA · IEC · IEEE · SCTE · MIL" color="#a78bfa" />
        </section>

        {/* TOOL CARDS */}
        <section style={{ marginTop: 36 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 22, fontWeight: 300, color: '#f0ebe2', margin: 0 }}>The toolkit</h2>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#6b7479', letterSpacing: 2, textTransform: 'uppercase' }}>
              ◆ click to open · {tools.length} tools
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {tools.map((t, i) => (
              <button
                key={t.id}
                className="hs-card hs-fade"
                onClick={() => setSection(t.id)}
                style={{
                  animationDelay: `${160 + i * 35}ms`,
                  background: '#12171a',
                  border: '1px solid #252e33',
                  borderRadius: 4,
                  padding: 16,
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: '#f0ebe2',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 4, background: t.accent, opacity: 0.5 }} />
                <HsToolGlyph kind={t.icon} color={t.accent} />
                <div style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 17, fontWeight: 500, color: t.accent, marginTop: 8 }}>{t.title}</div>
                <div style={{ fontSize: 12, color: '#a7b0b6', lineHeight: 1.45 }}>{t.sub}</div>
                <div style={{ marginTop: 10, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#6b7479', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                  Open →
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* MODULES STRIP */}
        <section style={{ marginTop: 40 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 22, fontWeight: 300, color: '#f0ebe2', margin: 0 }}>Curriculum modules</h2>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#6b7479', letterSpacing: 2, textTransform: 'uppercase' }}>
              {moduleCount} modules · single → pair → bundle
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            {modules.map((m) => (
              <button
                key={m.id}
                onClick={() => setSection(m.id)}
                className="hs-card"
                style={{
                  background: '#0d1416',
                  border: '1px solid #252e33',
                  borderRadius: 4,
                  padding: 12,
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: '#f0ebe2',
                }}
              >
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 1.5 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: '#a7b0b6', marginTop: 6, lineHeight: 1.45 }}>{m.desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* RECIPE TEMPLATES PROMO */}
        <section style={{ marginTop: 40, padding: 18, background: '#12171a', border: '1px solid #252e33', borderRadius: 4 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 3, color: '#5eead4', textTransform: 'uppercase' }}>◆ Quick start</div>
              <div style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 20, fontWeight: 400, color: '#f0ebe2', marginTop: 4 }}>Recipe templates for typical cables</div>
            </div>
            <button onClick={() => setSection('sim')} style={{ background: 'transparent', border: '1px solid #5eead4', color: '#5eead4', padding: '6px 14px', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer' }}>
              → Open Process Sim
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 8 }}>
            {[
              { name: 'Cat 6A S/FTP', spec: '100 Ω · 23 AWG · 500 MHz' },
              { name: 'Cat 8',        spec: '100 Ω · 22 AWG · 2 GHz' },
              { name: 'USB4 / TB4',   spec: '90 Ω diff · 30 AWG · 20 GHz' },
              { name: 'RG-58',        spec: '50 Ω · 20 AWG · 1 GHz' },
              { name: 'RG-6',         spec: '75 Ω · 18 AWG · 3 GHz' },
              { name: 'LMR-400',      spec: '50 Ω · 10 AWG · 5.8 GHz' },
            ].map((t, i) => (
              <div key={i} style={{ background: '#0a0d0f', border: '1px solid #252e33', borderRadius: 3, padding: 10 }}>
                <div style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 14, fontWeight: 500, color: '#fbbf24' }}>{t.name}</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#6b7479', marginTop: 4 }}>{t.spec}</div>
              </div>
            ))}
          </div>
        </section>

        {/* WHAT'S NEW */}
        <section style={{ marginTop: 32, padding: 18, background: '#12171a', border: '1px solid #252e33', borderRadius: 4 }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 3, color: '#c97b3f', textTransform: 'uppercase', marginBottom: 10 }}>◆ Recently added</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8, fontSize: 13, color: '#a7b0b6' }}>
            <HsNewItem accent="#e89357">
              <strong style={{ color: '#fbbf24' }}>Tape Suckout Sim</strong> — multi-layer Bragg-notch designer with mm/inch toggle, cable cross-section visualization, spiral SPC flatwire shield (8 bobbins, gap-only).
            </HsNewItem>
            <HsNewItem accent="#5eead4">
              <strong style={{ color: '#fbbf24' }}>Build recipe upgrade</strong> — pair binder wrap + per-pair foil + outer foil/braid steps on every Vendor recipe; horizontal cross-section build flow with proportional ϕ chips.
            </HsNewItem>
            <HsNewItem accent="#a78bfa">
              <strong style={{ color: '#fbbf24' }}>Process Sim auto-fix</strong> — hill-climbing optimizer mutates wall, lay, AWG, materials, braid until verdict = PASS.
            </HsNewItem>
            <HsNewItem accent="#84cc16">
              <strong style={{ color: '#fbbf24' }}>Library expansion</strong> — 38 cable presets including QSFP28/QSFP-DD DAC, InfiniBand HDR/NDR, PCIe Gen5 SlimSAS, USB4 passive, with linked datasheets.
            </HsNewItem>
          </ul>
        </section>

        <div style={{ marginTop: 36, paddingTop: 20, borderTop: '1px solid #252e33', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#6b7479', textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center' }}>
          v1 prototype · every formula local · no telemetry · click any panel to dive in
        </div>
      </div>
    </div>
  );
}

function HsPrimaryCTA({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: '#c97b3f',
        color: '#0a0d0f',
        border: 'none',
        padding: '10px 18px',
        borderRadius: 3,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label} →
    </button>
  );
}
function HsSecondaryCTA({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        color: '#a7b0b6',
        border: '1px solid #384249',
        padding: '10px 18px',
        borderRadius: 3,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
function HsStatTile({ value, label, sub, color }) {
  return (
    <div style={{ background: '#0a0d0f', padding: 14 }}>
      <div style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 28, fontWeight: 500, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#a7b0b6', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 6 }}>{label}</div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#6b7479', marginTop: 2 }}>{sub}</div>
    </div>
  );
}
function HsToolGlyph({ kind, color }) {
  const size = 22;
  if (kind === 'sim') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 7h4l2 4 2-8 2 12 2-6h6" />
    </svg>
  );
  if (kind === 'vna') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3v18" opacity="0.4" />
      <path d="M5 14c2-2 4-2 6 0s4 2 6 0 2 0 2 0" />
    </svg>
  );
  if (kind === 'calc') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0M8 19h2M12 19h6" />
    </svg>
  );
  if (kind === 'wave') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 12c2-4 3-4 5 0s3 4 5 0 3-4 5 0 3 4 5 0" />
    </svg>
  );
  if (kind === 'lay') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 6c4 0 4 12 8 12s4-12 8-12" />
      <path d="M4 12c4 0 4 12 8 12s4-12 8-12" opacity="0.5" />
    </svg>
  );
  if (kind === 'shield') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round">
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" opacity="0.6" />
    </svg>
  );
  if (kind === 'atten') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 21l4-4 4 2 4-6 6 3" />
      <path d="M3 21h18M3 3v18" opacity="0.4" />
    </svg>
  );
  if (kind === 'suckout') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 12h4l1.5-3 1 6 1-9 1 6 1.5-3h11" />
    </svg>
  );
  if (kind === 'next') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 12c0 0 3-6 9-6s9 6 9 6-3 6-9 6-9-6-9-6z" />
      <path d="M9 12l3-3M9 12l3 3M15 12l-3-3M15 12l-3 3" opacity="0.6" />
    </svg>
  );
  if (kind === 'eye') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round">
      <path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
  if (kind === 'cost') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9 9h5a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h6" />
    </svg>
  );
  if (kind === 'library') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round">
      <rect x="3" y="3" width="6" height="18" />
      <rect x="11" y="6" width="5" height="15" />
      <path d="M19 4l3 14-4 1-3-14z" />
    </svg>
  );
  return null;
}
function HsNewItem({ accent, children }) {
  return (
    <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ color: accent, marginTop: 4, fontSize: 8 }}>●</span>
      <span style={{ flex: 1, lineHeight: 1.55 }}>{children}</span>
    </li>
  );
}

// Decorative coax cross-section badge for the hero
function CoaxBadge() {
  return (
    <svg width="200" height="200" viewBox="0 0 200 200" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="hs-coax-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c97b3f" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#5eead4" stopOpacity="0.08" />
        </linearGradient>
        <pattern id="hs-coax-braid" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#c97b3f" strokeWidth="1.2" strokeOpacity="0.7" />
          <line x1="3" y1="0" x2="3" y2="6" stroke="#e89357" strokeWidth="0.8" strokeOpacity="0.7" />
        </pattern>
      </defs>
      <circle cx="100" cy="100" r="92" fill="url(#hs-coax-grad)" stroke="#c97b3f" strokeOpacity="0.5" strokeWidth="1" />
      {/* Jacket */}
      <circle cx="100" cy="100" r="80" fill="#1a2226" stroke="#384249" strokeWidth="1" />
      {/* Braid */}
      <circle cx="100" cy="100" r="68" fill="url(#hs-coax-braid)" stroke="#c97b3f" strokeOpacity="0.4" strokeWidth="0.8" />
      {/* Foil */}
      <circle cx="100" cy="100" r="60" fill="#a7b0b6" fillOpacity="0.65" stroke="#a7b0b6" strokeWidth="0.5" />
      {/* Dielectric */}
      <circle cx="100" cy="100" r="52" fill="#0a0d0f" stroke="#384249" strokeWidth="0.5" />
      {/* Conductor */}
      <circle cx="100" cy="100" r="22" fill="#c97b3f" stroke="#e89357" strokeWidth="1" />
      {/* Highlight on conductor */}
      <circle cx="92" cy="92" r="6" fill="#fbbf24" fillOpacity="0.6" />
      {/* Pulse dot at center */}
      <circle cx="100" cy="100" r="3" fill="#fbbf24" style={{ animation: 'hsPulse 2s ease-in-out infinite' }} />
      {/* Annotation tick */}
      <path d="M100 8 L100 18 M120 18 L100 18" stroke="#5eead4" strokeWidth="0.6" />
      <text x="124" y="22" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#5eead4">JACKET</text>
      <path d="M100 192 L100 182 M80 182 L100 182" stroke="#fbbf24" strokeWidth="0.6" />
      <text x="76" y="178" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#fbbf24" textAnchor="end">CONDUCTOR</text>
    </svg>
  );
}

/* ============================================================
   TabIntro — compact contextual banner for each section.
   Replaces the global marketing Hero on all tabs except home / recipe
   (which have their own intros), and skipped on tabs whose internal
   component already renders a polished header (sim, suckout, vna).
   ============================================================ */
const TAB_INTROS = {
  progression: {
    eyebrow: 'Manufacturing flow · M1 → M2 → M3',
    title: 'Watch a cable build itself, layer by layer',
    desc: 'Step through every manufacturing stage — single insulated wire → twisted pair → 4-pair bundle. Each layer adds structure that controls Z₀, εᵣ, NEXT, and skew.',
    accent: '#c97b3f',
    icon: GitBranch,
  },
  m1: {
    eyebrow: 'Module 1 · Conductor',
    title: 'The single insulated wire',
    desc: 'Cu / SPC strand + dielectric extruded coaxially. εᵣ sets v_p and Z₀ baseline; concentricity drives Z₀ tolerance.',
    accent: '#c97b3f',
    icon: Atom,
  },
  m2: {
    eyebrow: 'Module 2 · Twisted Pair',
    title: 'How twist controls Z, NEXT, and skew',
    desc: 'Two insulated wires twisted at lay length L: differential mode propagates, common mode is rejected. Skew comes from εᵣ asymmetry between the two wires.',
    accent: '#c97b3f',
    icon: Layers,
  },
  m3: {
    eyebrow: 'Module 3 · 4-pair Bundle',
    title: 'Assemble the bundle around an X-spline',
    desc: '4 pairs in quadrants with cross-spline filler. Lay diversity (typ. 11 / 13 / 15 / 17 mm) decorrelates pair-to-pair NEXT.',
    accent: '#c97b3f',
    icon: Box,
  },
  calc: {
    eyebrow: 'Z₀ Calc · Coax + diff impedance',
    title: 'Live impedance from geometry + εᵣ',
    desc: 'Coax: Z₀ = 138/√εᵣ · log₁₀(D/d). Differential pair: Wadell formulas. Solve forward (geometry → Z₀) or inverse (Z₀ + εᵣ → D/d).',
    formula: 'Z₀ = 138/√εᵣ · log₁₀(D/d)',
    accent: '#fbbf24',
    icon: Calculator,
  },
  tdr: {
    eyebrow: 'TDR Sim · Time-domain reflectometry',
    title: 'Toggle defects, see them on a Z(x) trace',
    desc: 'TDR injects a step pulse and watches the reflection. Kinks (L↑), crushes (C↑), connectors, and splices each have a characteristic Z signature.',
    accent: '#7dd3fc',
    icon: Activity,
  },
  vna: {
    eyebrow: 'VNA Lab · Touchstone analysis',
    title: 'Drop in a .s1p / .s2p for full S-parameter analysis',
    desc: 'Compute return loss, VSWR, group delay, and TDR via inverse FFT. Compare two wires for pair skew. Three demo files included.',
    accent: '#5eead4',
    icon: FlaskConical,
  },
  braid: {
    eyebrow: 'Braid Coverage · SCTE 51',
    title: 'Optical coverage K from N, P, d, D, PR',
    desc: 'K = (2F − F²) · 100 % where F = (P · PR · d) / sin α. Target ≥ 85 % general, ≥ 95 % EMI-critical. Apply agent presets in one click.',
    formula: 'K = (2F − F²) · 100 %',
    accent: '#a78bfa',
    icon: Shield,
  },
  atten: {
    eyebrow: 'Attenuation Plot · skin + dielectric loss',
    title: 'See how attenuation grows with frequency',
    desc: 'Skin-effect loss ∝ √f. Dielectric loss ∝ f · tan δ. Plot both contributions across 1 MHz – 10 GHz for any geometry / material combination.',
    accent: '#84cc16',
    icon: Zap,
  },
  next: {
    eyebrow: 'NEXT · Pair-to-pair crosstalk',
    title: 'Why lay diversity decorrelates pairs',
    desc: 'Different pair lays prevent in-phase addition of capacitive / inductive coupling. Power-sum NEXT (PSANEXT) aggregates the worst three aggressors.',
    accent: '#cbd5e1',
    icon: Radio,
  },
  eye: {
    eyebrow: 'Eye Diagram · BER prediction',
    title: 'Bit rate, BW, jitter, and noise → eye opening',
    desc: 'Overlay many bit transitions to visualise timing margin and amplitude noise. Closed eye = bit errors. Drag sliders to see what kills the link.',
    accent: '#fb923c',
    icon: Eye,
  },
  cost: {
    eyebrow: 'Cost Calc · 1 km bill of materials',
    title: 'Cu mass, jacket, shield, labor — total $',
    desc: 'Cost roll-up with copper price, line speed, and CPK target. Compare construction trade-offs and see what really moves the unit cost.',
    accent: '#facc15',
    icon: Coins,
  },
  qc: {
    eyebrow: 'QC Stats · Cpk + histogram + control chart',
    title: 'Drop in QC test data, get capability + drift insight',
    desc: 'Paste a single column or upload a CSV from your QC line (impedance, IL, NEXT, hipot, OD readings). Pick the spec column + LSL / USL → instant Cp / Cpk / σ + distribution histogram + run-order control chart. Out-of-spec samples flagged red.',
    formula: 'Cpk = min(USL−μ, μ−LSL) / 3σ',
    accent: '#5eead4',
    icon: Activity,
  },
  '3d': {
    eyebrow: '3D View · Blender cable builds',
    title: 'Watch cable layers build from the inside out',
    desc: 'Switch between an RF coax shield stack and a high-speed 4-pair bundle build, with Blender source, GLB, and MP4 assets kept beside the viewer.',
    accent: '#a78bfa',
    icon: Box,
  },
  lay: {
    eyebrow: 'Lay Designer · 4-pair compatibility',
    title: 'Pick lay lengths that pass NEXT and bend radius',
    desc: 'Validate a 4-pair lay set against intra-pair skew, NEXT decorrelation, and bend-radius constraints. Apply agent presets in one click.',
    accent: '#a78bfa',
    icon: Settings,
  },
  library: {
    eyebrow: 'Vendor Library · 38 presets',
    title: 'RG, LMR, Heliax, Cat, USB4, DAC, semi-rigid',
    desc: 'Browse vendor cables with linked datasheets. Add your own custom cables and company defaults — they persist on this device, no telemetry.',
    accent: '#5eead4',
    icon: Boxes,
  },
  catalog: {
    eyebrow: 'Glenair Series 963 · Reference catalog',
    title: 'High-speed mil-spec database',
    desc: 'Build recipes for the Glenair Series 963 SpeedLine cable family — used in aerospace, mil-spec, and avionics.',
    accent: '#fbbf24',
    icon: Library,
  },
  more: {
    eyebrow: 'Modules 4-10 · Advanced topics',
    title: 'Shielding, jacket, hipot, BER, qualification',
    desc: 'Deep dives into shielded constructions, jacket selection, dielectric withstand, and end-of-line qualification testing.',
    accent: '#a7b0b6',
    icon: BookOpen,
  },
};

// Tabs whose internal component already renders a polished header — skip
// the contextual banner for these to avoid double-headers.
const SKIP_TAB_INTRO = new Set(['sim', 'suckout', 'vna']);

function TabIntro({ section }) {
  const data = TAB_INTROS[section];
  if (!data || SKIP_TAB_INTRO.has(section)) return null;
  const Icon = data.icon;

  return (
    <section
      style={{
        position: 'relative',
        padding: '24px 0',
        marginBottom: 28,
        borderBottom: '1px solid #252e33',
        animation: 'tabIntroFade 0.4s ease-out',
      }}
    >
      <style>{`
        @keyframes tabIntroFade {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: none; }
        }
      `}</style>

      {/* Subtle accent glow on the left edge */}
      <div
        style={{
          position: 'absolute',
          left: -12,
          top: 24,
          bottom: 24,
          width: 3,
          background: data.accent,
          borderRadius: 2,
          opacity: 0.7,
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        {/* Icon tile */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 6,
            background: data.accent + '14',
            border: `1px solid ${data.accent}55`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <Icon size={26} style={{ color: data.accent }} />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 6,
              border: `1px solid ${data.accent}30`,
              animation: 'tabIntroFade 1.2s ease-out',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Title block */}
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div
            className="font-mono"
            style={{
              fontSize: 10,
              letterSpacing: 2.5,
              color: data.accent,
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            ◆ {data.eyebrow}
          </div>
          <h2
            style={{
              fontFamily: 'Bricolage Grotesque, sans-serif',
              fontSize: 'clamp(20px, 3vw, 26px)',
              fontWeight: 400,
              color: '#f0ebe2',
              margin: 0,
              lineHeight: 1.15,
              letterSpacing: '-0.005em',
            }}
          >
            {data.title}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: '#a7b0b6',
              marginTop: 6,
              marginBottom: 0,
              lineHeight: 1.55,
              maxWidth: 760,
            }}
          >
            {data.desc}
          </p>
        </div>

        {/* Optional formula chip */}
        {data.formula && (
          <div
            style={{
              padding: '10px 14px',
              background: '#0a0d0f',
              border: `1px solid ${data.accent}40`,
              borderRadius: 4,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              color: data.accent,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {data.formula}
          </div>
        )}
      </div>
    </section>
  );
}

function ProgressionView() {
  const [stage, setStage] = useState(2);

  const stages = [
    {
      n: '01',
      title: 'Single insulated wire',
      desc: 'Conductor (Cu/SPC) + dielectric extruded coaxially. Determines v_p, attenuation, and Z₀ baseline through εᵣ.',
      key: 'εᵣ, eccentricity, OD ±0.3%',
    },
    {
      n: '02',
      title: 'Twisted pair',
      desc: 'Two wires twisted together with lay length L. Creates differential impedance (100Ω / 120Ω) and cancels external EMI.',
      key: 'lay = 5–25 mm, Z_diff ±10%',
    },
    {
      n: '03',
      title: '4-pair bundle',
      desc: '4 pairs with different lays, cross-filler holds position, wrapped with shield + jacket. This is the standard Cat 6A / Cat 8 / SpaceWire construction.',
      key: 'NEXT 26 dB, ANEXT 60 dB',
    },
  ];

  const Stage = ({ idx }) => {
    if (idx === 0) return <SingleWireXS size={260} awg={26} />;
    if (idx === 1) return (
      <div className="space-y-3 w-full">
        <TwistedPairView size={320} lay={70} />
        <div className="flex justify-center gap-2">
          <SingleWireXS size={120} awg={26} label={false} />
          <SingleWireXS size={120} awg={26} label={false} />
        </div>
      </div>
    );
    if (idx === 2) return <FourPairBundle size={340} />;
  };

  return (
    <section className="mb-20">
      <SectionTitle
        tag="THE PROGRESSION"
        title="Single wire → Twisted pair → 4-pair bundle"
        subtitle="Each stage adds a layer of structure to control impedance and reject noise. Click to see details."
        icon={Cable}
      />

      {/* Stage selector */}
      <div className="grid grid-cols-3 gap-2 mb-8">
        {stages.map((s, i) => (
          <button
            key={i}
            onClick={() => setStage(i)}
            className={`tappable text-left p-4 border rounded-sm ${
              stage === i
                ? 'border-[#c97b3f] bg-[#3d2a1c]'
                : 'border-[#384249] bg-[#1d2329]'
            }`}
          >
            <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: stage === i ? C.copperBright : C.textMuted }}>
              STAGE {s.n}
            </div>
            <div className="text-base text-[#f0ebe2] font-light mb-0.5" style={{ fontFamily: 'Bricolage Grotesque' }}>
              {s.title}
            </div>
          </button>
        ))}
      </div>

      {/* Stage detail */}
      <div className="grid md:grid-cols-2 gap-8 items-center min-h-[380px] p-6 md:p-10 border border-[#252e33] bg-gradient-to-br from-[#0e1316] to-[#0a0d0f] rounded-sm">
        <div className="flex justify-center items-center">
          <Stage idx={stage} />
        </div>
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-[#c97b3f] mb-2">
            {stages[stage].n} — Stage detail
          </div>
          <h3 className="text-2xl font-light text-[#f0ebe2] mb-3" style={{ fontFamily: 'Bricolage Grotesque' }}>
            {stages[stage].title}
          </h3>
          <p className="text-[#f0ebe2] leading-relaxed text-sm mb-6">
            {stages[stage].desc}
          </p>
          <div className="font-mono text-xs text-[#5eead4] bg-[#0a0d0f] border border-[#2f7a6e] px-3 py-2 inline-block">
            ★ {stages[stage].key}
          </div>

          <div className="mt-6 flex gap-2">
            <button
              onClick={() => setStage((s) => Math.max(0, s - 1))}
              disabled={stage === 0}
              className="tappable flex items-center gap-1 px-3 py-1.5 text-xs border border-[#384249] disabled:opacity-30 text-[#a7b0b6] hover:text-[#c97b3f] font-mono uppercase tracking-wider"
            >
              ← Prev
            </button>
            <button
              onClick={() => setStage((s) => Math.min(2, s + 1))}
              disabled={stage === 2}
              className="tappable flex items-center gap-1 px-3 py-1.5 text-xs border border-[#384249] disabled:opacity-30 text-[#a7b0b6] hover:text-[#c97b3f] font-mono uppercase tracking-wider"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Module 1 — Conductor & Dielectric
   ============================================================ */
function ModuleConductor() {
  const dielectrics = [
    { name: 'Solid PE', dk: '2.25–2.35', tan: '0.0002', vp: '66%', use: 'Cat 6, baseline' },
    { name: 'Foamed PE (65%)', dk: '1.50–1.80', tan: '0.0003', vp: '78–82%', use: 'Cat 6A, low-loss coax' },
    { name: 'FEP (solid)', dk: '2.05', tan: '<0.0007', vp: '70%', use: 'Plenum CMP, 200°C' },
    { name: 'PTFE (solid)', dk: '2.05–2.10', tan: '0.0002', vp: '69%', use: 'MIL/aerospace' },
    { name: 'ePTFE (expanded)', dk: '1.40–1.75', tan: '<0.0003', vp: '76–85%', use: 'Phase-stable HF' },
    { name: 'PFA', dk: '2.10', tan: '0.0007', vp: '69%', use: '1553B, 260°C' },
  ];

  const awgRows = [
    { n: '24', d: '0.511', r: '26.2', ohm: '0.084', use: 'Cat 5e, MIL-DTL-22759' },
    { n: '26', d: '0.405', r: '41.6', ohm: '0.134', use: 'Cat 6/6A patch, USB 3.x, SpaceWire' },
    { n: '28', d: '0.321', r: '66.2', ohm: '0.213', use: 'USB internal, HDMI, SATA' },
    { n: '30', d: '0.255', r: '105', ohm: '0.339', use: 'Thin twinax, ribbon' },
  ];

  return (
    <section className="mb-20">
      <SectionTitle
        tag="MODULE 01 — CONDUCTOR PREP"
        title="Starting from a strand of copper"
        subtitle="The conductor surface (not bulk) determines RF performance. Skin depth at 1 GHz ≈ 2.1 µm; at 10 GHz only 0.66 µm."
        icon={Atom}
      />

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-1 p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-3">Skin depth</div>
          <Formula>δ = √(ρ / πfμ)</Formula>
          <div className="space-y-1 text-xs text-[#a7b0b6] mt-3">
            <div>1 MHz → 65 µm</div>
            <div>100 MHz → 6.6 µm</div>
            <div>1 GHz → 2.1 µm</div>
            <div>10 GHz → 0.66 µm</div>
          </div>
          <div className="mt-3 pt-3 border-t border-dashed border-[#252e33] text-xs text-[#fbbf24]">
            <strong>Rule:</strong> plating ≥ 3·δ at f_min so 95% of AC current flows in the plating layer
          </div>
        </div>

        <div className="md:col-span-2 p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-3">Conductor materials</div>
          <div className="space-y-2 text-sm">
            <div className="flex gap-3">
              <span className="font-mono text-[#5eead4] w-32 shrink-0">Bare Cu (ETP)</span>
              <span className="text-[#f0ebe2]">100% IACS, 105°C max — Cat 6/6A solid 23 AWG</span>
            </div>
            <div className="flex gap-3">
              <span className="font-mono text-[#5eead4] w-32 shrink-0">Tinned Cu</span>
              <span className="text-[#f0ebe2]">40–60 µin Sn, 105°C — patch cord, RoHS solder</span>
            </div>
            <div className="flex gap-3">
              <span className="font-mono text-[#5eead4] w-32 shrink-0">SPC (silver)</span>
              <span className="text-[#f0ebe2]">ASTM B298, 50–100 µin — SpaceWire, MIL, &gt;1 GHz</span>
            </div>
            <div className="flex gap-3">
              <span className="font-mono text-[#5eead4] w-32 shrink-0">NPC (nickel)</span>
              <span className="text-[#f0ebe2]">260°C continuous, ferromagnetic → loss &gt;100 MHz</span>
            </div>
            <div className="flex gap-3">
              <span className="font-mono text-[#5eead4] w-32 shrink-0">CCS / CCA</span>
              <span className="text-[#f0ebe2]">40% IACS, RF only — <span className="text-[#f87171]">CCA banned for PoE!</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* AWG table */}
      <div className="mb-8">
        <h3 className="text-sm font-mono uppercase tracking-wider text-[#c97b3f] mb-3">AWG quick reference</h3>
        <div className="border border-[#252e33] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#0a0d0f]">
              <tr className="text-[#a7b0b6] font-mono text-xs uppercase">
                <th className="px-4 py-2 text-left">AWG</th>
                <th className="px-4 py-2 text-right">Ø (mm)</th>
                <th className="px-4 py-2 text-right">R (Ω/km)</th>
                <th className="px-4 py-2 text-right">R (Ω/ft)</th>
                <th className="px-4 py-2 text-left">Application</th>
              </tr>
            </thead>
            <tbody>
              {awgRows.map((r, i) => (
                <tr key={i} className="border-t border-[#252e33] hover:bg-[#171d20]">
                  <td className="px-4 py-2 font-mono text-[#fbbf24]">#{r.n}</td>
                  <td className="px-4 py-2 font-mono text-right text-[#f0ebe2]">{r.d}</td>
                  <td className="px-4 py-2 font-mono text-right text-[#f0ebe2]">{r.r}</td>
                  <td className="px-4 py-2 font-mono text-right text-[#a7b0b6]">{r.ohm}</td>
                  <td className="px-4 py-2 text-[#a7b0b6] text-xs">{r.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-xs font-mono text-[#6b7479]">
          d(in) = 0.005 · 92<sup>(36−n)/39</sup> &nbsp;·&nbsp; R ≈ 10<sup>n/10</sup> Ω/10 000 ft
        </div>
      </div>

      {/* Dielectrics table */}
      <div>
        <h3 className="text-sm font-mono uppercase tracking-wider text-[#c97b3f] mb-3">Dielectric materials — determine Z₀ and loss</h3>
        <div className="border border-[#252e33] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#0a0d0f]">
              <tr className="text-[#a7b0b6] font-mono text-xs uppercase">
                <th className="px-4 py-2 text-left">Material</th>
                <th className="px-4 py-2 text-right">εᵣ (Dk)</th>
                <th className="px-4 py-2 text-right">tan δ</th>
                <th className="px-4 py-2 text-right">v_p</th>
                <th className="px-4 py-2 text-left">Use</th>
              </tr>
            </thead>
            <tbody>
              {dielectrics.map((d, i) => (
                <tr key={i} className="border-t border-[#252e33] hover:bg-[#171d20]">
                  <td className="px-4 py-2 text-[#f0ebe2]">{d.name}</td>
                  <td className="px-4 py-2 font-mono text-right text-[#5eead4]">{d.dk}</td>
                  <td className="px-4 py-2 font-mono text-right text-[#a7b0b6]">{d.tan}</td>
                  <td className="px-4 py-2 font-mono text-right text-[#fbbf24]">{d.vp}</td>
                  <td className="px-4 py-2 text-[#a7b0b6] text-xs">{d.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Callout tone="copper" title="Module 1 determines final Z₀">
        Tolerance stack-up: <span className="font-mono">ΔZ₀/Z₀ = (1/ln(D/d))·(ΔD/D − Δd/d) − ½·(Δεᵣ/εᵣ)</span>.
        To hit 75 Ω broadcast ±0.5 Ω requires conductor &lt;±0.5%, dielectric OD ±0.3%, foam density &lt;±1%.
      </Callout>
    </section>
  );
}

/* ============================================================
   Module 2 — Twisted pair
   ============================================================ */
function ModuleTwistedPair() {
  const [lay, setLay] = useState(13);
  const [diam, setDiam] = useState(0.405);

  // Approx Z calc using parallel wire formula
  const er = 1.6; // FEP-twisted approx eff
  const D = diam * 2.05; // assume insulation ratio
  const Z = useMemo(() => Math.round((276 / Math.sqrt(er)) * Math.log10(2 * D / diam)), [diam]);

  return (
    <section className="mb-20">
      <SectionTitle
        tag="MODULE 02 — TWISTED PAIR"
        title="Twist to create differential impedance"
        subtitle="Lay length L is the axial distance for one full 360° twist. Each pair in a bundle uses a different L to cancel crosstalk."
        icon={Layers}
      />

      <div className="grid md:grid-cols-2 gap-8 mb-8">
        {/* Left: visualizer */}
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">Lay length explorer</div>
          <TwistedPairView size={320} lay={Math.max(20, 100 - lay * 4)} />

          <div className="mt-4">
            <div className="flex justify-between items-baseline mb-2">
              <label className="text-xs text-[#a7b0b6] font-mono uppercase tracking-wider">Lay (mm)</label>
              <span className="font-mono text-[#fbbf24]">{lay} <span className="text-[10px] text-[#6b7479]">/ {(lay/25.4).toFixed(3)}″</span></span>
            </div>
            <input
              type="range"
              min="5"
              max="25"
              value={lay}
              onChange={(e) => setLay(Number(e.target.value))}
              className="w-full accent-[#c97b3f]"
            />
            <div className="flex justify-between text-[10px] font-mono text-[#6b7479] mt-1">
              <span>5 (Cat 8)</span>
              <span>13 (Cat 6A)</span>
              <span>25 (Cat 5e)</span>
            </div>
          </div>

          <Callout tone="teal" title="Symmetry rule">
            Cat 6A 4-pair uses L: 11 / 13 / 15 / 17 mm — pairs are never "in phase", reducing NEXT significantly.
          </Callout>
        </div>

        {/* Right: physics */}
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">Differential impedance</div>

          <Formula>Z_diff ≈ (276/√εᵣ_eff) · log₁₀(2D/d)</Formula>

          <div className="mt-4 space-y-2">
            <div className="flex justify-between items-baseline">
              <label className="text-xs text-[#a7b0b6] font-mono uppercase">d — conductor Ø</label>
              <span className="font-mono text-[#fbbf24]">{diam.toFixed(2)} mm <span className="text-[10px] text-[#6b7479]">/ {(diam/25.4).toFixed(4)}″</span></span>
            </div>
            <input
              type="range"
              min="0.25"
              max="0.65"
              step="0.05"
              value={diam}
              onChange={(e) => setDiam(Number(e.target.value))}
              className="w-full accent-[#c97b3f]"
            />
          </div>

          <div className="mt-6 p-4 bg-[#0a0d0f] border border-[#2f7a6e]">
            <div className="text-xs font-mono uppercase tracking-wider text-[#5eead4] mb-1">Calculated Z_diff</div>
            <div className="text-4xl font-light text-[#5eead4] font-mono" style={{ fontFamily: 'JetBrains Mono' }}>
              {Z} <span className="text-lg text-[#a7b0b6]">Ω</span>
            </div>
            <div className="text-xs text-[#6b7479] mt-2">
              εᵣ_eff = {er} (FEP twisted approx) · D/d = 2.05
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="border border-[#252e33] py-2 px-1">
              <div className="text-xs font-mono text-[#a7b0b6]">USB SS</div>
              <div className="font-mono text-[#5eead4]">90 Ω ±7</div>
            </div>
            <div className="border border-[#252e33] py-2 px-1">
              <div className="text-xs font-mono text-[#a7b0b6]">Ethernet</div>
              <div className="font-mono text-[#5eead4]">100 Ω ±10%</div>
            </div>
            <div className="border border-[#252e33] py-2 px-1">
              <div className="text-xs font-mono text-[#a7b0b6]">CAN</div>
              <div className="font-mono text-[#5eead4]">120 Ω ±10%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Twinning machinery note */}
      <div className="p-6 border border-[#252e33] bg-[#12171a]">
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-2">Single-twist buncher</div>
            <p className="text-sm text-[#a7b0b6] leading-relaxed">200–800 rpm, 1 twist/rev. Specialty pairs, low volume.</p>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-2">Double-twist twinner</div>
            <p className="text-sm text-[#a7b0b6] leading-relaxed">Up to 4500 rpm, 2 twists/rev. Workhorse for Cat 5e/6/6A/8 (Bartell, Niehoff, Sampsistemi).</p>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-2">Backtwist control</div>
            <p className="text-sm text-[#a7b0b6] leading-relaxed">Servo payoff at 80–105% bow speed cancels residual torsion. Without it pairs "spring back" pigtail off-spool.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Module 3 — Bundle / Star Quad
   ============================================================ */
function ModuleBundle() {
  return (
    <section className="mb-20">
      <SectionTitle
        tag="MODULE 03 — BUNDLE GEOMETRY"
        title="4 pairs into one core"
        subtitle="The cabling step lays multiple pairs into the final core. Geometry choice determines crosstalk: cross spline for U/UTP, star quad for noise immunity."
        icon={Box}
      />

      <div className="grid md:grid-cols-2 gap-8 mb-8">
        {/* Cat 6A bundle */}
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f]">Cat 6A / Cat 8 geometry</div>
              <div className="text-lg text-[#f0ebe2] font-light" style={{ fontFamily: 'Bricolage Grotesque' }}>4-pair + X-spline</div>
            </div>
            <Pill tone="copper">U/UTP — F/UTP</Pill>
          </div>
          <div className="flex justify-center my-4">
            <FourPairBundle size={300} withSpline={true} />
          </div>
          <div className="space-y-1 text-sm mt-4">
            <Spec label="Pair lay set" value="11 / 13 / 15 / 17" unit="mm" />
            <Spec label="Bundle lay" value="50–100" unit="mm" />
            <Spec label="X-spline" value="0.5–0.8 × 2.5–3.5" unit="mm" />
            <Spec label="NEXT @ 500 MHz" value="≥ 26.1" unit="dB" />
            <Spec label="PSANEXT @ 100 MHz" value="≥ 60" unit="dB" />
          </div>
        </div>

        {/* Star quad */}
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f]">Star Quad / Quadrax</div>
              <div className="text-lg text-[#f0ebe2] font-light" style={{ fontFamily: 'Bricolage Grotesque' }}>Diagonal pairing</div>
            </div>
            <Pill tone="teal">MIL · Audio · Avionics</Pill>
          </div>
          <div className="flex justify-center my-4">
            <StarQuadXS size={260} />
          </div>
          <Formula>Z_diff ≈ (60/√εᵣ_eff) · ln(2s/(d·√2))</Formula>
          <div className="space-y-1 text-sm mt-4">
            <Spec label="Hum rejection vs UTP" value="20–25" unit="dB" />
            <Spec label="MIL-STD-1553B Z" value="78 ± 2" unit="Ω" />
            <Spec label="Glenair 963-079" value="100 Ω quadrax" />
            <Spec label="Application" value="787 fly-by-wire, AFDX" mono={false} />
          </div>
        </div>
      </div>

      {/* Crosstalk types */}
      <div className="p-6 border border-[#252e33] bg-[#12171a]">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">Crosstalk taxonomy</div>
        <div className="grid md:grid-cols-4 gap-4">
          {[
            { k: 'NEXT', t: 'Near-end same cable', v: 'Measured at source end. Cancellable via DSP (10GBASE-T)' },
            { k: 'FEXT', t: 'Far-end same cable', v: 'Measured at remote end. ELFEXT removes length effect.' },
            { k: 'PSNEXT', t: 'Power-sum NEXT', v: 'RSS contribution from all 3 disturbing pairs.' },
            { k: 'ANEXT/PSANEXT', t: 'Alien crosstalk', v: 'Cable-to-cable. Not cancellable. Dominant impairment for Cat 6A.' },
          ].map((c, i) => (
            <div key={i} className="border border-[#252e33] p-3 bg-[#0a0d0f]">
              <div className="font-mono text-sm text-[#fbbf24] mb-1">{c.k}</div>
              <div className="text-xs text-[#5eead4] mb-2 italic">{c.t}</div>
              <div className="text-xs text-[#a7b0b6] leading-relaxed">{c.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Impedance Calculator
   ============================================================ */
function ImpedanceCalc() {
  const [mode, setMode] = useState('twisted'); // coax | twisted | starquad
  const [d, setD] = useState(0.405); // conductor mm
  const [D, setD_outer] = useState(0.95); // outer / spacing
  const [er, setEr] = useState(2.05); // dielectric

  // Listen for agent-applied Z₀ presets when on this tab
  useEffect(() => {
    const onApply = (e) => {
      if (e.detail?.section !== 'calc') return;
      const p = e.detail.params || {};
      if (p.mode) setMode(p.mode);
      if (p.D != null) setD_outer(p.D);
      if (p.d != null) setD(p.d);
      if (p.er != null) setEr(p.er);
    };
    window.addEventListener('cable-suite:apply-preset', onApply);
    return () => window.removeEventListener('cable-suite:apply-preset', onApply);
  }, []);

  const z = useMemo(() => {
    if (mode === 'coax') return Math.round((138 / Math.sqrt(er)) * Math.log10(D / d));
    if (mode === 'twisted') {
      // Effective εr roughly 0.7·εr for parallel pair (air contribution)
      const erEff = 0.4 + 0.55 * er;
      return Math.round((276 / Math.sqrt(erEff)) * Math.log10(2 * D / d));
    }
    if (mode === 'starquad') {
      const erEff = 0.4 + 0.55 * er;
      return Math.round((60 / Math.sqrt(erEff)) * Math.log(2 * D / (d * Math.sqrt(2))));
    }
    return 0;
  }, [mode, d, D, er]);

  // Chart data: Z vs D/d
  const chartData = useMemo(() => {
    const arr = [];
    for (let r = 1.5; r <= 6; r += 0.1) {
      let zVal;
      if (mode === 'coax') zVal = (138 / Math.sqrt(er)) * Math.log10(r);
      else if (mode === 'twisted') {
        const erEff = 0.4 + 0.55 * er;
        zVal = (276 / Math.sqrt(erEff)) * Math.log10(2 * r);
      } else {
        const erEff = 0.4 + 0.55 * er;
        zVal = (60 / Math.sqrt(erEff)) * Math.log(2 * r / Math.sqrt(2));
      }
      arr.push({ ratio: r.toFixed(1), Z: Math.round(zVal * 10) / 10 });
    }
    return arr;
  }, [mode, er]);

  const targets = { coax: 50, twisted: 100, starquad: 100 };

  return (
    <section className="mb-20">
      <SectionTitle
        tag="INTERACTIVE CALCULATOR"
        title="Z₀ Calculator"
        subtitle="Calculate characteristic impedance for coax, twisted pair, and star quad. Live formula evaluation."
        icon={Calculator}
      />

      {/* Mode selector */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {[
          { id: 'coax', label: 'Coaxial', formula: '(138/√εᵣ)·log(D/d)' },
          { id: 'twisted', label: 'Twisted Pair', formula: '(276/√εᵣ)·log(2D/d)' },
          { id: 'starquad', label: 'Star Quad', formula: '(60/√εᵣ)·ln(2s/(d√2))' },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`tappable p-3 border rounded-sm text-left ${
              mode === m.id
                ? 'border-[#5eead4] bg-[#0d1f1d]'
                : 'border-[#384249] bg-[#1d2329]'
            }`}
          >
            <div className={`font-light text-base ${mode === m.id ? 'text-[#5eead4]' : 'text-[#f0ebe2]'}`} style={{ fontFamily: 'Bricolage Grotesque' }}>
              {m.label}
            </div>
            <div className="font-mono text-[10px] text-[#6b7479] mt-1">{m.formula}</div>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">Parameters</div>

          <div className="space-y-5">
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase tracking-wider">d — conductor Ø (mm)</label>
                <span className="font-mono text-[#fbbf24]">{d.toFixed(3)} <span className="text-[10px] text-[#6b7479]">/ {(d/25.4).toFixed(4)}″</span></span>
              </div>
              <input type="range" min="0.15" max="1.0" step="0.005" value={d} onChange={(e) => setD(Number(e.target.value))} className="w-full accent-[#c97b3f]" />
            </div>

            <div>
              <div className="flex justify-between items-baseline mb-2">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase tracking-wider">
                  {mode === 'coax' ? 'D — dielectric Ø' : 'D — center-to-center'} (mm)
                </label>
                <span className="font-mono text-[#fbbf24]">{D.toFixed(3)} <span className="text-[10px] text-[#6b7479]">/ {(D/25.4).toFixed(4)}″</span></span>
              </div>
              <input type="range" min={d * 1.2} max={d * 6} step="0.01" value={D} onChange={(e) => setD_outer(Number(e.target.value))} className="w-full accent-[#c97b3f]" />
              <div className="font-mono text-[10px] text-[#6b7479] mt-1">D/d = {(D / d).toFixed(2)}</div>
            </div>

            <div>
              <div className="flex justify-between items-baseline mb-2">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase tracking-wider">εᵣ — dielectric</label>
                <span className="font-mono text-[#fbbf24]">{er.toFixed(2)}</span>
              </div>
              <input type="range" min="1.4" max="2.5" step="0.05" value={er} onChange={(e) => setEr(Number(e.target.value))} className="w-full accent-[#c97b3f]" />
              <div className="grid grid-cols-3 gap-1 mt-2">
                <button onClick={() => setEr(1.50)} className="text-[10px] font-mono text-[#5eead4] border border-[#252e33] hover:border-[#5eead4] py-1">Foam PE 1.50</button>
                <button onClick={() => setEr(2.05)} className="text-[10px] font-mono text-[#5eead4] border border-[#252e33] hover:border-[#5eead4] py-1">FEP 2.05</button>
                <button onClick={() => setEr(2.30)} className="text-[10px] font-mono text-[#5eead4] border border-[#252e33] hover:border-[#5eead4] py-1">Solid PE 2.30</button>
              </div>
            </div>
          </div>
        </div>

        {/* Output + chart */}
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">Characteristic impedance</div>

          <div className="text-center py-4 mb-4 border-y border-dashed border-[#252e33]">
            <div className="text-6xl font-light text-[#5eead4] font-mono" style={{ fontFamily: 'JetBrains Mono' }}>
              {z}
            </div>
            <div className="font-mono text-sm text-[#a7b0b6] mt-1">ohms</div>
            <div className="mt-2 text-xs">
              {Math.abs(z - targets[mode]) < targets[mode] * 0.1 ? (
                <span className="text-[#5eead4] font-mono">✓ within ±10% of {targets[mode]} Ω target</span>
              ) : (
                <span className="text-[#fbbf24] font-mono">! deviation from {targets[mode]} Ω target</span>
              )}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="2 2" stroke={C.border} />
              <XAxis dataKey="ratio" stroke={C.textMuted} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} label={{ value: 'D/d', position: 'insideBottom', offset: -2, fill: C.textMuted, fontSize: 10 }} />
              <YAxis stroke={C.textMuted} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <Tooltip
                contentStyle={{ background: C.bg, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'JetBrains Mono' }}
                labelStyle={{ color: C.copperBright }}
                itemStyle={{ color: C.teal }}
              />
              <ReferenceLine y={targets[mode]} stroke={C.copper} strokeDasharray="4 4" label={{ value: `${targets[mode]}Ω`, fill: C.copper, fontSize: 10, position: 'right' }} />
              <Line type="monotone" dataKey="Z" stroke={C.teal} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <Callout tone="amber" title="Note">
        This is the exact closed-form formula for infinite-length parallel/coaxial structures. Real twisted pair is also affected by
        lay length, conductor proximity, and air gap → typically requires TDR/VNA verification. Star quad assumes diagonal pairing with perfectly balanced launch.
      </Callout>
    </section>
  );
}

/* ============================================================
   Series 963 Catalog
   ============================================================ */
function Catalog({ onOpenRecipe }) {
  const products = [
    {
      pn: '963-066-26',
      title: 'Cat 6A / Cat 8 Ethernet',
      vi: 'Cáp Ethernet 4-pair',
      awg: '24/26/28',
      z: '100 Ω',
      app: '10/40GBASE-T',
      bw: '2 GHz',
      icon: 'bundle',
      type: '4pair',
      hl: 'Cat 6A/Cat 8 4-pair, FEP insulation, Al/polyimide pair shield, 40 AWG SPC outer braid 90% cov',
      std: 'TIA Cat 6A / Cat 8',
      vendor: 'Glenair',
      cat: 'aerospace',
      name: 'Cat 6A/Cat 8 Ethernet (SpeedMaster)',
    },
    {
      pn: '963-077-26',
      title: 'USB 3.2 Gen 1×1',
      vi: 'Cáp USB 5 Gbps',
      awg: '26',
      z: '90 Ω',
      app: 'SuperSpeed USB',
      bw: '7.5 GHz',
      icon: 'bundle',
      type: '4pair',
      hl: 'SS pairs 90Ω + D+/D− 90Ω TP + VBUS/GND 24 AWG, ePTFE-over-FEP, Al/polyimide shield, 38 AWG SPC braid',
      std: 'USB-IF 3.2 Gen 1',
      vendor: 'Glenair',
      cat: 'aerospace',
      name: 'USB 3.2 Gen 1x1 (El Ochito Blue)',
    },
    {
      pn: '963-080-24',
      title: 'SpaceWire',
      vi: 'Cáp SpaceWire ECSS',
      awg: '24/26',
      z: '100 ±6 Ω',
      app: 'ECSS-E-ST-50-12C',
      bw: '8 GHz',
      icon: 'bundle',
      type: '4pair',
      hl: '4× data pairs 100Ω STP, FEP insulation, Al/polyimide pair shield, SPC outer braid 90%',
      std: 'ECSS-E-ST-50-12C',
      vendor: 'Glenair',
      cat: 'space',
      name: 'SpaceWire-type (El Ochito Red)',
    },
    {
      pn: '963-079-24',
      title: 'Star Quad / Quadrax',
      vi: 'Cáp Quadrax',
      awg: '24',
      z: '100 Ω',
      app: 'AFDX 100BASE-T',
      bw: '—',
      icon: 'starquad',
      type: 'starquad',
      hl: 'Star quad 4× 24 AWG fluoropolymer high-temp, ARINC 600 / Series 23/28 compatible',
      std: 'AS39029 quadrax',
      vendor: 'Glenair',
      cat: 'aerospace',
      name: '100Ω Star Quad Quadrax',
    },
    {
      pn: '963-072-24',
      title: 'SATA / eSATA',
      vi: 'Cáp SATA',
      awg: '24',
      z: '100 Ω',
      app: 'SATA 6 Gbps',
      bw: '6 GHz',
      icon: 'pair',
      type: 'twinax',
      hl: '24 AWG shielded parallel pair with foil shield + drain wire',
      std: 'SATA-IO Rev 3',
      vendor: 'Glenair',
      cat: 'datacom',
      name: 'SATA / eSATA (El Ochito Red)',
    },
    {
      pn: '963-127',
      title: 'HDMI 2.0 / DP 1.4',
      vi: 'Cáp video',
      awg: '26',
      z: '100 Ω',
      app: 'HDMI 18 Gbps',
      bw: '5 GHz',
      icon: 'bundle',
      type: '4pair',
      hl: '4× data pairs 100Ω STP 26 AWG SPC, PFA insulation, Al/polyimide pair shield (foil-out), 40 AWG SPC braid 90%',
      std: 'HDMI 2.0 / DP 1.4',
      vendor: 'Glenair',
      cat: 'broadcast',
      name: 'HDMI 2.0 / DP 1.4 (El Ochito Red)',
    },
    {
      pn: '963-073-26',
      title: '100 Ω STP — generic',
      vi: 'Cáp STP đa dụng',
      awg: '24/26/28/30',
      z: '100 Ω',
      app: 'High-bandwidth',
      bw: '10 GHz',
      icon: 'pair',
      type: 'twinax',
      hl: '26 AWG SPC, FEP/ePTFE wrap, SPC braid >90%, FEP white jacket',
      std: 'TIA-568-C.2',
      vendor: 'Glenair',
      cat: 'aerospace',
      name: '100Ω STP general-purpose',
    },
    {
      pn: '963-164-24',
      title: '120 Ω TP — CAN',
      vi: 'Cáp CAN bus',
      awg: '24/26',
      z: '120 Ω',
      app: 'CAN / RS-485',
      bw: '1 GHz',
      icon: 'pair',
      type: 'twinax',
      hl: '24 AWG SPC, FEP white/blue insulation, ePTFE binder, SPC braid >95%',
      std: 'ISO 11898-2 CAN',
      vendor: 'Glenair',
      cat: 'industrial',
      name: '120Ω twisted pair CAN',
    },
    {
      pn: '963-068-26',
      title: '100 Ω Twinax — VersaLink',
      vi: 'Cáp twinax',
      awg: '26',
      z: '100 Ω',
      app: '28 Gbps/pair',
      bw: '18 GHz',
      icon: 'pair',
      type: 'twinax',
      hl: '26 AWG SPC alloy, FEP/PFA insulation, Al/polyimide pair shield, SPC braid',
      std: 'TIA',
      vendor: 'Glenair',
      cat: 'aerospace',
      name: '100Ω STP VersaLink',
    },
    {
      pn: '963-069-26',
      title: 'Parallel pair — flat',
      vi: 'Cặp song song dẹt',
      awg: '26',
      z: '100 Ω',
      app: 'USB4, DP 2.0',
      bw: '18 GHz',
      icon: 'pair',
      type: 'twinax',
      hl: 'Flat-parallel HS Cu-alloy, FEP, aluminized Kapton + 44 AWG SPC dual shields',
      std: 'USB-IF / VESA DP',
      vendor: 'Glenair',
      cat: 'datacom',
      name: '100Ω Flat parallel pair (VersaLink)',
    },
    {
      pn: '963-057-28',
      title: 'STP w/ drain — Micro-D',
      vi: 'STP có drain wire',
      awg: '28',
      z: '100 ±6 Ω',
      app: 'Micro-D HS',
      bw: '10 GHz',
      icon: 'pair',
      type: 'twinax',
      hl: '28 AWG SPC alloy, FEP primary, ePTFE wrap, drain wire, aluminized Kapton tape shield',
      std: 'TIA-568',
      vendor: 'Glenair',
      cat: 'aerospace',
      name: '100Ω STP w/ drain (Micro-D)',
    },
  ];

  const renderIcon = (type) => {
    if (type === 'bundle') return <FourPairBundle size={120} withSpline={false} label={false} />;
    if (type === 'starquad') return <StarQuadXS size={110} />;
    return (
      <div className="flex gap-1.5 items-center">
        <SingleWireXS size={70} label={false} />
        <SingleWireXS size={70} label={false} />
      </div>
    );
  };

  return (
    <section className="mb-20">
      <SectionTitle
        tag="REFERENCE CATALOG"
        title="Glenair Series 963 SpeedLine"
        subtitle="11 family members from the Glenair catalog — real case studies for each cable type. Click a part number to view the build recipe."
        icon={Library}
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((p, i) => (
          <button
            key={i}
            onClick={() => onOpenRecipe(p)}
            className="click-card group p-5 border border-[#2a343b] text-left"
          >
            <div className="click-pulse-dot" />
            <div className="absolute top-2 right-6 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-[#c97b3f] bg-[#0a0d0f] border border-[#c97b3f] px-1.5 py-0.5 z-10">
              <Wrench className="w-2.5 h-2.5" />
              Build recipe
            </div>

            <div className="flex items-start justify-between mb-4 gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-base text-[#c97b3f] tracking-tight truncate">{p.pn}</div>
                <div className="text-sm text-[#f0ebe2] mt-1 font-light" style={{ fontFamily: 'Bricolage Grotesque' }}>
                  {p.title}
                </div>
                <div className="text-xs text-[#a7b0b6] italic mt-0.5">{p.vi}</div>
              </div>
              <Pill tone="teal">{p.z}</Pill>
            </div>

            <div className="flex justify-center my-3 min-h-[120px] items-center">
              {renderIcon(p.icon)}
            </div>

            <div className="space-y-1 pt-3 border-t border-dashed border-[#252e33]">
              <div className="flex justify-between text-xs">
                <span className="text-[#6b7479] font-mono uppercase">AWG</span>
                <span className="font-mono text-[#fbbf24]">#{p.awg}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#6b7479] font-mono uppercase">App</span>
                <span className="text-[#a7b0b6]">{p.app}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#6b7479] font-mono uppercase">BW</span>
                <span className="font-mono text-[#5eead4]">{p.bw}</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-dashed border-[#252e33] flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-[#6b7479] group-hover:text-[#c97b3f] transition-colors">
              <span>View build recipe</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   Lab 01 — TDR Simulator
   ============================================================ */
const TDR_SEGMENTS = 8;

const TDR_DEFECT_CASES = [
  {
    id: 'kink',
    title: 'Kink / bend stress',
    tag: 'L up',
    image: '/cable-renders/tdr-defect-kink.png',
    defects: ['ideal', 'ideal', 'ideal', 'kink', 'ideal', 'ideal', 'ideal', 'ideal'],
    stage: 'Take-up, reel handling, bend radius',
    trace: 'Positive Z bump where local inductance rises.',
  },
  {
    id: 'crush',
    title: 'Crushed jacket',
    tag: 'C up',
    image: '/cable-renders/tdr-defect-crush.png',
    defects: ['ideal', 'ideal', 'ideal', 'ideal', 'crush', 'ideal', 'ideal', 'ideal'],
    stage: 'Capstan pressure, clamp, pinch roller',
    trace: 'Negative Z dip where conductors are squeezed closer.',
  },
  {
    id: 'foil',
    title: 'Foil gap / tape tear',
    tag: 'shield gap',
    image: '/cable-renders/tdr-defect-foil-gap.png',
    defects: ['ideal', 'ideal', 'foil', 'foil', 'ideal', 'ideal', 'ideal', 'ideal'],
    stage: 'Tape head alignment, overlap, tension',
    trace: 'Small positive reflection plus EMI risk at the gap.',
  },
  {
    id: 'eccentric',
    title: 'Off-center dielectric',
    tag: 'eccentric',
    image: '/cable-renders/tdr-defect-eccentric.png',
    defects: ['ideal', 'eccentric', 'eccentric', 'ideal', 'ideal', 'ideal', 'ideal', 'ideal'],
    stage: 'Extrusion die centering, melt pressure',
    trace: 'Broad negative Z sag from uneven dielectric spacing.',
  },
];

function TDRSim() {
  const SEGMENTS = TDR_SEGMENTS;
  const [activeCaseId, setActiveCaseId] = useState(TDR_DEFECT_CASES[0].id);
  const [defects, setDefects] = useState(TDR_DEFECT_CASES[0].defects);

  // Listen for agent-applied presets from FloatingAgent's "Apply" buttons.
  // params = { defects: ['kink', 'ideal', ...] } or { index, type } for a single segment.
  useEffect(() => {
    const onApply = (e) => {
      const { section, params } = e.detail || {};
      if (section !== 'tdr' || !params) return;
      if (Array.isArray(params.defects)) {
        const arr = params.defects.slice(0, SEGMENTS);
        while (arr.length < SEGMENTS) arr.push('ideal');
        setDefects(arr);
      } else if (Number.isInteger(params.index) && params.type) {
        setDefects((prev) => {
          const next = [...prev];
          if (params.index >= 0 && params.index < SEGMENTS) next[params.index] = params.type;
          return next;
        });
      }
    };
    window.addEventListener('cable-suite:apply-preset', onApply);
    return () => window.removeEventListener('cable-suite:apply-preset', onApply);
  }, []);

  const types = {
    ideal: { label: 'Clean', delta: 0, color: '#171d20', desc: 'Nominal Z₀ — no discontinuity' },
    kink: { label: 'Kink (L↑)', delta: +12, color: '#fbbf24', desc: 'Inductive bump — small bend increases L, raising Z' },
    crush: { label: 'Crush (C↑)', delta: -10, color: '#f87171', desc: 'Capacitive dip — clamp pressure raises C, lowering Z' },
    foil: { label: 'Foil gap', delta: +6, color: '#cbd5e1', desc: 'Shield/tape break — small local discontinuity plus EMI ingress risk' },
    eccentric: { label: 'Ecc.', delta: -7, color: '#5eead4', desc: 'Off-center dielectric — broad impedance sag and skew risk' },
    conn: { label: 'Connector', delta: -4, color: '#7dd3fc', desc: 'Connector launch — typical −3 đến −5 Ω' },
    splice: { label: 'Splice', delta: +5, color: '#a78bfa', desc: 'Bobbin-change splice — slight Z bump' },
  };

  const cycle = (i) => {
    const order = ['ideal', 'kink', 'crush', 'foil', 'eccentric', 'conn', 'splice'];
    setDefects((prev) => {
      const cur = order.indexOf(prev[i]);
      const next = [...prev];
      next[i] = order[(cur + 1) % order.length];
      return next;
    });
  };

  const reset = () => setDefects(Array(SEGMENTS).fill('ideal'));
  const activeCase = TDR_DEFECT_CASES.find((item) => item.id === activeCaseId) || TDR_DEFECT_CASES[0];
  const applyDefectCase = (item) => {
    setActiveCaseId(item.id);
    setDefects(item.defects);
  };

  // Build TDR trace with smooth gaussian-shaped defects
  const trace = useMemo(() => {
    const Z0 = 100;
    const points = [];
    const steps = 120;
    for (let i = 0; i < steps; i++) {
      let z = Z0;
      defects.forEach((d, di) => {
        const center = (di + 0.5) / SEGMENTS;
        const dist = Math.abs(i / steps - center);
        const sigma = 0.45 / SEGMENTS;
        const w = Math.exp(-(dist * dist) / (2 * sigma * sigma));
        z += types[d].delta * w;
      });
      points.push({ x: Math.round((i / steps) * 100), Z: Math.round(z * 10) / 10 });
    }
    return points;
  }, [defects]);

  const violations = trace.filter((p) => p.Z > 105 || p.Z < 95).length;

  return (
    <section className="mb-20">
      <SectionTitle
        tag="LAB 01 — TDR SIMULATOR"
        title="Time Domain Reflectometry"
        subtitle="Click segments or choose a Blender defect preview to connect the physical damage with the Z(x) signature."
        icon={Activity}
      />

      <div className="p-6 border border-[#252e33] bg-[#12171a] mb-6">
        <div className="flex justify-between items-center mb-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f]">
            Cable — click segments to cycle defect type
          </div>
          <button
            onClick={reset}
            className="tappable text-[10px] font-mono uppercase tracking-wider text-[#a7b0b6] hover:text-[#c97b3f] border border-[#384249] px-2 py-1"
          >
            Reset
          </button>
        </div>

        {/* Cable segments */}
        <div className="flex gap-1 mb-2">
          {defects.map((d, i) => {
            const isIdeal = d === 'ideal';
            return (
              <button
                key={i}
                onClick={() => cycle(i)}
                className={`interactive-zone flex-1 h-14 rounded-sm border transition-all relative ${
                  isIdeal
                    ? 'border-[#384249] hover:border-[#c97b3f] bg-[#171d20]'
                    : 'border-transparent'
                }`}
                style={!isIdeal ? { background: types[d].color } : undefined}
              >
                <span
                  className={`absolute inset-0 flex items-center justify-center text-[9px] font-mono font-semibold ${
                    isIdeal ? 'text-[#6b7479]' : 'text-[#0a0d0f]'
                  }`}
                >
                  {types[d].label}
                </span>
                {!isIdeal && (
                  <span className="absolute top-1 right-1.5 text-[8px] font-mono text-[#0a0d0f] opacity-70">
                    {types[d].delta > 0 ? '+' : ''}
                    {types[d].delta}Ω
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] font-mono text-[#6b7479] mt-1">
          <span>0 m</span>
          <span>50 m</span>
          <span>100 m</span>
        </div>
      </div>

      <TDRDefectVisualizer
        cases={TDR_DEFECT_CASES}
        activeCase={activeCase}
        activeCaseId={activeCaseId}
        onSelect={applyDefectCase}
      />

      {/* TDR trace */}
      <div className="p-6 border border-[#252e33] bg-[#12171a] mb-6">
        <div className="flex justify-between items-baseline mb-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f]">TDR trace — Z(x)</div>
          <div className="font-mono text-xs">
            <span className="text-[#6b7479]">target </span>
            <span className="text-[#5eead4]">100 Ω ±5</span>
            <span className="text-[#6b7479]"> · </span>
            <span className={violations > 0 ? 'text-[#f87171]' : 'text-[#5eead4]'}>
              {violations > 0 ? `${violations} pts out-of-spec` : '✓ pass'}
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={trace} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="2 2" stroke={C.border} />
            <XAxis
              dataKey="x"
              stroke={C.textMuted}
              tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
              label={{ value: 'distance (m)', position: 'insideBottom', offset: -2, fill: C.textMuted, fontSize: 10 }}
            />
            <YAxis
              domain={[80, 120]}
              stroke={C.textMuted}
              tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
              label={{ value: 'Z (Ω)', angle: -90, position: 'insideLeft', fill: C.textMuted, fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{ background: C.bg, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'JetBrains Mono' }}
              labelStyle={{ color: C.copperBright }}
              itemStyle={{ color: C.teal }}
            />
            <ReferenceLine y={100} stroke={C.copper} strokeDasharray="4 4" label={{ value: 'Z₀=100', fill: C.copper, fontSize: 10, position: 'right' }} />
            <ReferenceLine y={105} stroke={C.amber} strokeDasharray="2 2" opacity={0.4} />
            <ReferenceLine y={95} stroke={C.amber} strokeDasharray="2 2" opacity={0.4} />
            <Line type="monotone" dataKey="Z" stroke={C.teal} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Defect legend */}
      <div className="grid md:grid-cols-5 gap-3">
        {Object.entries(types).map(([k, v]) => (
          <div key={k} className="border border-[#252e33] p-3 bg-[#12171a]">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-3 h-3 rounded-sm border border-[#384249]" style={{ background: v.color }} />
              <span className="font-mono text-xs text-[#fbbf24]">{v.label}</span>
            </div>
            <div className="text-[10px] text-[#a7b0b6] leading-relaxed">{v.desc}</div>
            {v.delta !== 0 && (
              <div className="font-mono text-[10px] text-[#5eead4] mt-1.5 pt-1.5 border-t border-dashed border-[#252e33]">
                ΔZ = {v.delta > 0 ? '+' : ''}
                {v.delta} Ω
              </div>
            )}
          </div>
        ))}
      </div>

      <Callout tone="teal" title="Spatial resolution">
        Δx = ½·v_p·t_r,sys · BW = 0.35/t_r. Với v_p = 0.66c và t_r = 35 ps → Δx ≈ 4.6 mm.
        Higher resolution requires a short-rise instrument (Tek 80E04 ~18 ps, Keysight N1055A ~9 ps, Teledyne WavePulser 7 ps).
      </Callout>
    </section>
  );
}

function TDRDefectVisualizer({ cases, activeCase, activeCaseId, onSelect }) {
  return (
    <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4 mb-6">
      <div className="relative border border-[#252e33] bg-[#0a0d0f] rounded overflow-hidden">
        <div className="aspect-video min-h-[260px]">
          <img
            src={activeCase.image}
            alt={activeCase.title}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute top-2 left-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#5eead4]">
          Blender defect preview
        </div>
        <div className="absolute bottom-2 left-2 right-2 grid sm:grid-cols-3 gap-2">
          <div className="bg-[#0a0d0f]/85 border border-[#252e33] rounded p-2">
            <div className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479]">Defect</div>
            <div className="font-mono text-[11px] text-[#f0ebe2]">{activeCase.title}</div>
          </div>
          <div className="bg-[#0a0d0f]/85 border border-[#252e33] rounded p-2">
            <div className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479]">Stage</div>
            <div className="text-[11px] text-[#a7b0b6]">{activeCase.stage}</div>
          </div>
          <div className="bg-[#0a0d0f]/85 border border-[#252e33] rounded p-2">
            <div className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479]">TDR</div>
            <div className="text-[11px] text-[#a7b0b6]">{activeCase.trace}</div>
          </div>
        </div>
      </div>

      <div className="border border-[#252e33] bg-[#12171a] rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c97b3f]">Blender fault library</div>
            <div className="text-xs text-[#a7b0b6] mt-1">Click a defect to load the matching TDR pattern.</div>
          </div>
          <Box size={18} className="text-[#5eead4]" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
          {cases.map((item) => {
            const active = item.id === activeCaseId;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                className={`text-left rounded border p-3 transition-colors ${
                  active ? 'border-[#5eead4] bg-[#0f2a28]' : 'border-[#252e33] bg-[#0a0d0f] hover:border-[#384249]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-[11px] text-[#f0ebe2]">{item.title}</span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[#fbbf24]">{item.tag}</span>
                </div>
                <div className="text-[10px] leading-relaxed text-[#a7b0b6]">{item.trace}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Lab 02 — Braid Coverage Calculator
   ============================================================ */
const BRAID_COVERAGE_VISUALS = [
  {
    id: 'open',
    min: 0,
    max: 65,
    label: 'Open',
    range: '<65%',
    image: '/cable-renders/braid-coverage-open.png',
    tone: '#f87171',
    note: 'Large optical apertures; use foil or raise PR/P before calling this a shield.',
  },
  {
    id: 'general',
    min: 65,
    max: 85,
    label: 'General',
    range: '65-85%',
    image: '/cable-renders/braid-coverage-general.png',
    tone: '#fbbf24',
    note: 'Basic shield coverage with visible diamond windows.',
  },
  {
    id: 'high',
    min: 85,
    max: 95,
    label: 'High perf',
    range: '85-95%',
    image: '/cable-renders/braid-coverage-high.png',
    tone: '#5eead4',
    note: 'Good production braid for Cat 6A, broadcast, and instrumentation.',
  },
  {
    id: 'dense',
    min: 95,
    max: 101,
    label: 'EMI critical',
    range: '>=95%',
    image: '/cable-renders/braid-coverage-dense.png',
    tone: '#7dd3fc',
    note: 'Very tight optical coverage; better shielding but higher stiffness and cost.',
  },
];

function braidCoverageVisualFor(K) {
  return BRAID_COVERAGE_VISUALS.find((item) => K >= item.min && K < item.max) || BRAID_COVERAGE_VISUALS[BRAID_COVERAGE_VISUALS.length - 1];
}

/* Realistic basket-weave with under/over crossing pattern */
function WeaveVis({ alpha, K, picksPerInch, carriers, animated = false }) {
  const w = 320;
  const h = 200;
  const a = Math.max(15, Math.min(75, alpha));
  const angRad = (a * Math.PI) / 180;
  // Strand spacing scales with pick density
  const baseSpacing = Math.max(8, 28 - picksPerInch * 0.8);
  const opacity = Math.min(1, 0.3 + (K / 100) * 0.7);
  const strandWidth = Math.max(2.5, 5 - (40 - picksPerInch) * 0.05);

  // Generate diagonal strand groups
  const strandsForward = []; // top-left to bottom-right (S direction)
  const strandsBackward = []; // top-right to bottom-left (Z direction)

  const dx = h / Math.tan(angRad);
  const cnt = Math.ceil((w + dx + 50) / baseSpacing);

  for (let i = -5; i < cnt; i++) {
    const x0 = i * baseSpacing;
    strandsForward.push({
      x1: x0, y1: 0, x2: x0 + dx, y2: h,
      key: `f${i}`,
    });
    strandsBackward.push({
      x1: x0, y1: h, x2: x0 + dx, y2: 0,
      key: `b${i}`,
    });
  }

  // Compute intersection points for over/under pattern
  const intersections = [];
  for (let f = 0; f < strandsForward.length; f++) {
    for (let b = 0; b < strandsBackward.length; b++) {
      const sf = strandsForward[f];
      const sb = strandsBackward[b];
      // Line intersection
      const denom = (sf.x1 - sf.x2) * (sb.y1 - sb.y2) - (sf.y1 - sf.y2) * (sb.x1 - sb.x2);
      if (Math.abs(denom) < 1e-6) continue;
      const t = ((sf.x1 - sb.x1) * (sb.y1 - sb.y2) - (sf.y1 - sb.y1) * (sb.x1 - sb.x2)) / denom;
      if (t < 0 || t > 1) continue;
      const ix = sf.x1 + t * (sf.x2 - sf.x1);
      const iy = sf.y1 + t * (sf.y2 - sf.y1);
      if (ix < -10 || ix > w + 10 || iy < -10 || iy > h + 10) continue;
      // Checkerboard pattern: f over b vs b over f
      const fOver = ((f + b) % 2 === 0);
      intersections.push({ ix, iy, fOver, fIdx: f, bIdx: b });
    }
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 200 }}>
      <defs>
        <linearGradient id="strandFwd" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e89357" />
          <stop offset="50%" stopColor="#c97b3f" />
          <stop offset="100%" stopColor="#7a4a26" />
        </linearGradient>
        <linearGradient id="strandBwd" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4d4d8" />
          <stop offset="50%" stopColor="#a8a29e" />
          <stop offset="100%" stopColor="#57534e" />
        </linearGradient>
        <radialGradient id="apertureGrad">
          <stop offset="0%" stopColor="#f87171" stopOpacity="0.4" />
          <stop offset="80%" stopColor="#7f1d1d" stopOpacity="0.05" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <clipPath id="clipWeave">
          <rect x="0" y="0" width={w} height={h} />
        </clipPath>
        <filter id="strandShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
      </defs>

      {/* Background — dark */}
      <rect width={w} height={h} fill="#06090b" />

      {/* Aperture indicators — small red glows where the weave is open */}
      {K < 90 && (
        <g clipPath="url(#clipWeave)">
          {intersections.filter((_, i) => i % 4 === 0).map((p, i) => {
            const apertureSize = Math.max(0, (100 - K) / 100) * 14;
            return (
              <circle
                key={`ap${i}`}
                cx={p.ix + (p.fOver ? baseSpacing / 2 : -baseSpacing / 2)}
                cy={p.iy}
                r={apertureSize}
                fill="url(#apertureGrad)"
                className="aperture-pulse"
                style={{ animationDelay: `${(i % 5) * 0.3}s` }}
              />
            );
          })}
        </g>
      )}

      <g clipPath="url(#clipWeave)">
        {/* Render strands segment-by-segment with proper over/under */}
        {strandsForward.map((s) => {
          // Find intersections sorted by position along this strand
          const points = intersections
            .filter((p) => p.fIdx === strandsForward.indexOf(s))
            .sort((a, b) => a.iy - b.iy);
          // Render the strand, but break at intersections where it goes "under"
          const segments = [];
          let lastX = s.x1, lastY = s.y1;
          points.forEach((p) => {
            const gap = strandWidth * 0.9;
            const dirX = (s.x2 - s.x1) / Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
            const dirY = (s.y2 - s.y1) / Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
            const beforeX = p.ix - dirX * gap;
            const beforeY = p.iy - dirY * gap;
            const afterX = p.ix + dirX * gap;
            const afterY = p.iy + dirY * gap;
            if (p.fOver) {
              // forward goes OVER — render continuous
              segments.push({ x1: lastX, y1: lastY, x2: p.ix, y2: p.iy, over: true });
              lastX = p.ix; lastY = p.iy;
            } else {
              // forward goes UNDER — break the line
              segments.push({ x1: lastX, y1: lastY, x2: beforeX, y2: beforeY, over: false });
              lastX = afterX; lastY = afterY;
            }
          });
          segments.push({ x1: lastX, y1: lastY, x2: s.x2, y2: s.y2, over: true });
          return (
            <g key={s.key}>
              {segments.map((seg, si) => (
                <line
                  key={si}
                  x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                  stroke="url(#strandFwd)"
                  strokeWidth={strandWidth}
                  strokeLinecap="round"
                  opacity={opacity}
                  filter="url(#strandShadow)"
                  strokeDasharray={animated ? "8 4" : undefined}
                  className={animated ? "strand-flow-fwd" : ""}
                />
              ))}
            </g>
          );
        })}

        {strandsBackward.map((s) => {
          const points = intersections
            .filter((p) => p.bIdx === strandsBackward.indexOf(s))
            .sort((a, b) => a.iy - b.iy);
          const segments = [];
          let lastX = s.x1, lastY = s.y1;
          points.forEach((p) => {
            const gap = strandWidth * 0.9;
            const dirX = (s.x2 - s.x1) / Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
            const dirY = (s.y2 - s.y1) / Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
            const beforeX = p.ix - dirX * gap;
            const beforeY = p.iy - dirY * gap;
            const afterX = p.ix + dirX * gap;
            const afterY = p.iy + dirY * gap;
            if (!p.fOver) {
              // backward goes OVER (forward goes under) — render continuous
              segments.push({ x1: lastX, y1: lastY, x2: p.ix, y2: p.iy, over: true });
              lastX = p.ix; lastY = p.iy;
            } else {
              // backward goes UNDER — break
              segments.push({ x1: lastX, y1: lastY, x2: beforeX, y2: beforeY, over: false });
              lastX = afterX; lastY = afterY;
            }
          });
          segments.push({ x1: lastX, y1: lastY, x2: s.x2, y2: s.y2, over: true });
          return (
            <g key={s.key}>
              {segments.map((seg, si) => (
                <line
                  key={si}
                  x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                  stroke="url(#strandBwd)"
                  strokeWidth={strandWidth}
                  strokeLinecap="round"
                  opacity={opacity}
                  filter="url(#strandShadow)"
                  strokeDasharray={animated ? "8 4" : undefined}
                  className={animated ? "strand-flow-bwd" : ""}
                />
              ))}
            </g>
          );
        })}
      </g>

      {/* Annotations */}
      <text x={8} y={14} fontSize="9" fill="#c97b3f" fontFamily="JetBrains Mono" opacity="0.8">α = {alpha.toFixed(1)}°</text>
      <text x={8} y={h - 8} fontSize="9" fill="#5eead4" fontFamily="JetBrains Mono" opacity="0.8">{carriers} carriers · {picksPerInch} ppi</text>
      <text x={w - 8} y={14} fontSize="9" fill={K < 65 ? '#f87171' : K < 85 ? '#fbbf24' : '#5eead4'} fontFamily="JetBrains Mono" textAnchor="end" opacity="0.9">K = {K.toFixed(1)}%</text>
    </svg>
  );
}

/* Tubular cable view — shield wrapping a cable, isometric perspective */
function TubeVis({ alpha, K, picksPerInch }) {
  const w = 320, h = 130;
  const cy = h / 2;
  const tubeR = 38;
  const tubeLen = w - 60;
  const tubeStart = 30;
  const a = Math.max(15, Math.min(75, alpha));
  const opacity = Math.min(1, 0.3 + (K / 100) * 0.65);

  // Generate helical strands wrapping the cylinder
  const strands = [];
  const carrierCount = Math.max(8, Math.floor(picksPerInch * 1.5));
  const turnsAcross = (tubeLen * picksPerInch) / 25.4 / Math.cos(a * Math.PI / 180) * 0.15;

  for (let s = 0; s < carrierCount; s++) {
    const phaseOffset = (s / carrierCount) * 2 * Math.PI;
    // S-direction strand
    const ptsS = [];
    const ptsZ = [];
    for (let t = 0; t <= 1; t += 0.025) {
      const x = tubeStart + t * tubeLen;
      const angleS = phaseOffset + t * turnsAcross * 2 * Math.PI;
      const angleZ = phaseOffset - t * turnsAcross * 2 * Math.PI;
      // Project 3D helix to 2D - sin component for vertical, dim for behind
      const yS = cy + tubeR * 0.85 * Math.sin(angleS);
      const yZ = cy + tubeR * 0.85 * Math.sin(angleZ);
      const visibleS = Math.cos(angleS) > 0; // front-facing
      const visibleZ = Math.cos(angleZ) > 0;
      ptsS.push({ x, y: yS, visible: visibleS, depth: Math.cos(angleS) });
      ptsZ.push({ x, y: yZ, visible: visibleZ, depth: Math.cos(angleZ) });
    }
    strands.push({ pts: ptsS, dir: 'S', phase: phaseOffset });
    strands.push({ pts: ptsZ, dir: 'Z', phase: phaseOffset });
  }

  // Build path strings — only render visible segments with depth-based opacity
  const buildPath = (pts, frontOnly) => {
    let path = '';
    let inSegment = false;
    pts.forEach((p, i) => {
      if (frontOnly ? p.visible : !p.visible) {
        if (!inSegment) {
          path += `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
          inSegment = true;
        } else {
          path += `L ${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
        }
      } else {
        inSegment = false;
      }
    });
    return path;
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }}>
      <defs>
        <linearGradient id="tubeStrandFwd" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e89357" />
          <stop offset="50%" stopColor="#c97b3f" />
          <stop offset="100%" stopColor="#7a4a26" />
        </linearGradient>
        <linearGradient id="tubeStrandBwd" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4d4d8" />
          <stop offset="50%" stopColor="#a8a29e" />
          <stop offset="100%" stopColor="#57534e" />
        </linearGradient>
        <linearGradient id="tubeBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f2937" />
          <stop offset="50%" stopColor="#0f1416" />
          <stop offset="100%" stopColor="#1f2937" />
        </linearGradient>
        <linearGradient id="tubeCap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#374151" />
          <stop offset="100%" stopColor="#0f1416" />
        </linearGradient>
        <radialGradient id="dielGlow" cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.35" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect width={w} height={h} fill="#06090b" />

      {/* Inner dielectric glow leaking through apertures (when coverage low) */}
      {K < 90 && (
        <ellipse cx={w/2} cy={cy} rx={tubeLen/2 * 0.95} ry={tubeR * 0.6}
          fill="url(#dielGlow)" opacity={(100 - K) / 100} />
      )}

      {/* Cable cylinder body */}
      <rect x={tubeStart} y={cy - tubeR * 0.85} width={tubeLen} height={tubeR * 1.7}
            fill="url(#tubeBody)" stroke="#252e33" strokeWidth="0.5" />

      {/* End caps (ellipses for cylinder ends) */}
      <ellipse cx={tubeStart} cy={cy} rx={6} ry={tubeR * 0.85}
        fill="url(#tubeCap)" stroke="#252e33" strokeWidth="0.5" />
      <ellipse cx={tubeStart + tubeLen} cy={cy} rx={6} ry={tubeR * 0.85}
        fill="url(#tubeCap)" stroke="#252e33" strokeWidth="0.5" />

      {/* Back-facing strands (behind cable, dimmer) */}
      {strands.map((s, i) => (
        <path
          key={`back${i}`}
          d={buildPath(s.pts, false)}
          stroke={s.dir === 'S' ? '#7a4a26' : '#57534e'}
          strokeWidth="1.5"
          fill="none"
          opacity={opacity * 0.35}
          strokeLinecap="round"
        />
      ))}

      {/* Front-facing strands */}
      {strands.map((s, i) => (
        <path
          key={`front${i}`}
          d={buildPath(s.pts, true)}
          stroke={s.dir === 'S' ? 'url(#tubeStrandFwd)' : 'url(#tubeStrandBwd)'}
          strokeWidth="2"
          fill="none"
          opacity={opacity}
          strokeLinecap="round"
        />
      ))}

      {/* Front cap */}
      <ellipse cx={tubeStart + tubeLen} cy={cy} rx={6} ry={tubeR * 0.85}
        fill="none" stroke="#384249" strokeWidth="0.7" />

      {/* Labels */}
      <text x={tubeStart} y={cy + tubeR * 0.85 + 16} fontSize="9" fill="#5eead4" fontFamily="JetBrains Mono">Cable axis →</text>
      <text x={w - 8} y={h - 8} fontSize="9" fill="#6b7479" fontFamily="JetBrains Mono" textAnchor="end">isometric view</text>
    </svg>
  );
}

function BraidBlenderPreview({ visual, K, alpha, picksPerInch, carriers, apertureMm }) {
  return (
    <div className="border border-[#252e33] bg-[#0a0d0f] overflow-hidden rounded-sm">
      <div className="relative aspect-video min-h-[260px]">
        <img
          data-testid="braid-blender-preview"
          src={visual.image}
          alt={`${visual.label} braid coverage Blender preview`}
          className="w-full h-full object-cover"
        />
        <div className="absolute top-2 left-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#5eead4] bg-[#0a0d0f]/70 border border-[#252e33] px-2 py-1">
          Blender braid preview
        </div>
        <div className="absolute top-2 right-2 font-mono text-[10px] uppercase tracking-wider px-2 py-1 border bg-[#0a0d0f]/75" style={{ color: visual.tone, borderColor: visual.tone + '66' }}>
          {visual.range}
        </div>
        <div className="absolute bottom-2 left-2 right-2 grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            ['K', `${K.toFixed(1)}%`],
            ['alpha', `${alpha.toFixed(1)}°`],
            ['PR', `${picksPerInch} ppi`],
            ['aperture', `${apertureMm.toFixed(2)} mm`],
          ].map(([label, value]) => (
            <div key={label} className="bg-[#0a0d0f]/85 border border-[#252e33] rounded-sm p-2">
              <div className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479]">{label}</div>
              <div className="font-mono text-[11px]" style={{ color: label === 'K' ? visual.tone : '#fbbf24' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="p-3 border-t border-[#252e33]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {BRAID_COVERAGE_VISUALS.map((item) => {
            const selected = item.id === visual.id;
            return (
              <div
                key={item.id}
                data-testid={`braid-visual-band-${item.id}`}
                className={`rounded-sm border px-2 py-1.5 ${selected ? 'bg-[#10201f]' : 'bg-[#12171a]'}`}
                style={{ borderColor: selected ? item.tone : '#252e33' }}
              >
                <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: selected ? item.tone : '#a7b0b6' }}>
                  {item.label}
                </div>
                <div className="font-mono text-[9px] text-[#6b7479]">{item.range}</div>
              </div>
            );
          })}
        </div>
        <div className="text-[11px] leading-relaxed text-[#a7b0b6]">
          {visual.note} Current braid uses <span className="font-mono text-[#fbbf24]">{carriers}</span> total carriers.
        </div>
      </div>
    </div>
  );
}

function BraidDiamondMap({ alpha, K, picksPerInch, carriers, strandMm, apertureMm, animated = false }) {
  const w = 420;
  const h = 260;
  const safeAlpha = Math.max(18, Math.min(68, alpha));
  const alphaRad = (safeAlpha * Math.PI) / 180;
  const pitchMm = 25.4 / picksPerInch;
  const cellW = Math.max(28, Math.min(74, pitchMm * 13));
  const cellH = Math.max(30, Math.min(94, cellW * Math.tan(alphaRad) * 0.72));
  const strandPx = Math.max(2.4, Math.min(9, strandMm * 42));
  const dx = h / Math.tan(alphaRad);
  const lineCount = Math.ceil((w + dx + cellW * 4) / cellW);
  const openFactor = Math.max(0.08, Math.min(1, (100 - K) / 34));
  const apertureColor = K < 65 ? '#f87171' : K < 85 ? '#fbbf24' : K < 95 ? '#5eead4' : '#7dd3fc';
  const lines = [];
  const diamonds = [];

  for (let i = -4; i < lineCount; i++) {
    const x = i * cellW - dx;
    lines.push({ key: `s${i}`, x1: x, y1: 0, x2: x + dx, y2: h, dir: 's' });
    lines.push({ key: `z${i}`, x1: x, y1: h, x2: x + dx, y2: 0, dir: 'z' });
  }

  for (let row = 0; row < Math.ceil(h / cellH) + 2; row++) {
    for (let col = -1; col < Math.ceil(w / cellW) + 2; col++) {
      const cx = col * cellW + (row % 2 ? cellW / 2 : 0);
      const cy = row * cellH * 0.82;
      const rx = cellW * 0.22 * openFactor;
      const ry = cellH * 0.22 * openFactor;
      diamonds.push({ key: `${row}-${col}`, cx, cy, rx, ry });
    }
  }

  return (
    <div className="border border-[#252e33] bg-[#0a0d0f] rounded-sm overflow-hidden">
      <div className="flex justify-between items-baseline px-4 pt-4 pb-2">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f]">
          Unwrapped diamond map
        </div>
        <div className="font-mono text-[10px] text-[#6b7479]">
          1 in pitch basis
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 260 }}>
        <defs>
          <clipPath id="braidDiamondClip">
            <rect x="0" y="32" width={w} height={h - 58} />
          </clipPath>
          <linearGradient id="diamondCopper" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="52%" stopColor="#c97b3f" />
            <stop offset="100%" stopColor="#7a4a26" />
          </linearGradient>
          <linearGradient id="diamondTin" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f3f4f6" />
            <stop offset="52%" stopColor="#a8a29e" />
            <stop offset="100%" stopColor="#57534e" />
          </linearGradient>
        </defs>
        <rect width={w} height={h} fill="#06090b" />
        <g clipPath="url(#braidDiamondClip)">
          {diamonds.map((dmd, index) => (
            <polygon
              key={dmd.key}
              points={`${dmd.cx},${dmd.cy - dmd.ry} ${dmd.cx + dmd.rx},${dmd.cy} ${dmd.cx},${dmd.cy + dmd.ry} ${dmd.cx - dmd.rx},${dmd.cy}`}
              fill={apertureColor}
              opacity={K < 95 ? Math.max(0.08, (100 - K) / 90) : 0.04}
              stroke={index % 3 === 0 ? apertureColor : 'none'}
              strokeOpacity="0.18"
            />
          ))}
          {lines.map((line) => (
            <line
              key={line.key}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={line.dir === 's' ? 'url(#diamondCopper)' : 'url(#diamondTin)'}
              strokeWidth={strandPx}
              strokeLinecap="round"
              opacity={Math.min(0.96, 0.34 + K / 135)}
              strokeDasharray={animated ? '10 6' : undefined}
              className={animated ? (line.dir === 's' ? 'strand-flow-fwd' : 'strand-flow-bwd') : undefined}
            />
          ))}
        </g>
        <rect x="0" y="0" width={w} height="32" fill="#06090b" opacity="0.92" />
        <rect x="0" y={h - 26} width={w} height="26" fill="#06090b" opacity="0.92" />
        <text x={12} y={18} fontSize="9" fill="#fbbf24" fontFamily="JetBrains Mono">pitch = {pitchMm.toFixed(2)} mm</text>
        <text x={12} y={h - 12} fontSize="9" fill="#5eead4" fontFamily="JetBrains Mono">{carriers} carriers · d {strandMm.toFixed(3)} mm</text>
        <text x={w - 12} y={18} fontSize="9" fill={apertureColor} fontFamily="JetBrains Mono" textAnchor="end">aperture ~ {apertureMm.toFixed(2)} mm</text>
      </svg>
      <div className="grid grid-cols-3 gap-2 p-3 border-t border-[#252e33]">
        {[
          ['diamond height', `${cellH.toFixed(0)} px`],
          ['strand width', `${strandPx.toFixed(1)} px`],
          ['open factor', `${(openFactor * 100).toFixed(0)}%`],
        ].map(([label, value]) => (
          <div key={label} className="border border-[#252e33] bg-[#12171a] rounded-sm p-2">
            <div className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479]">{label}</div>
            <div className="font-mono text-[11px] text-[#fbbf24]">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Coverage gauge — circular dial with zones */
function CoverageGauge({ K }) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const r = 70;
  const startAngle = -210; // degrees
  const endAngle = 30;
  const totalSweep = endAngle - startAngle;

  const polarToCart = (angDeg, radius) => {
    const a = (angDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };

  // Zone arcs
  const zones = [
    { from: 0, to: 65, color: '#7f1d1d', glow: '#f87171' },
    { from: 65, to: 85, color: '#78350f', glow: '#fbbf24' },
    { from: 85, to: 95, color: '#0d3a3a', glow: '#5eead4' },
    { from: 95, to: 100, color: '#0c4a6e', glow: '#7dd3fc' },
  ];

  const arcPath = (fromPct, toPct, radius) => {
    const a1 = startAngle + (fromPct / 100) * totalSweep;
    const a2 = startAngle + (toPct / 100) * totalSweep;
    const p1 = polarToCart(a1, radius);
    const p2 = polarToCart(a2, radius);
    const largeArc = a2 - a1 > 180 ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${largeArc} 1 ${p2.x} ${p2.y}`;
  };

  const needleAngle = startAngle + (Math.max(0, Math.min(100, K)) / 100) * totalSweep;
  const needleEnd = polarToCart(needleAngle, r - 5);

  const activeZone = zones.find((z) => K >= z.from && K <= z.to) || zones[zones.length - 1];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[220px]">
      <defs>
        <filter id="needleGlow">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      {/* Background arc */}
      <path d={arcPath(0, 100, r)} stroke="#171d20" strokeWidth="22" fill="none" strokeLinecap="round" />

      {/* Zone arcs */}
      {zones.map((z, i) => (
        <g key={i}>
          <path d={arcPath(z.from, z.to, r)} stroke={z.color} strokeWidth="22" fill="none" />
        </g>
      ))}

      {/* Tick marks at zone boundaries */}
      {[65, 85, 95].map((pct) => {
        const a = startAngle + (pct / 100) * totalSweep;
        const p1 = polarToCart(a, r - 14);
        const p2 = polarToCart(a, r + 14);
        return (
          <g key={pct}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#384249" strokeWidth="1" />
            <text
              x={polarToCart(a, r + 24).x}
              y={polarToCart(a, r + 24).y + 3}
              fontSize="9"
              fill="#6b7479"
              fontFamily="JetBrains Mono"
              textAnchor="middle"
            >
              {pct}
            </text>
          </g>
        );
      })}

      {/* Active arc highlight */}
      <path
        d={arcPath(0, K, r)}
        stroke={activeZone.glow}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.9"
      />

      {/* Needle glow */}
      <line x1={cx} y1={cy} x2={needleEnd.x} y2={needleEnd.y}
            stroke={activeZone.glow} strokeWidth="6" strokeLinecap="round" filter="url(#needleGlow)" opacity="0.7" />
      {/* Needle */}
      <line x1={cx} y1={cy} x2={needleEnd.x} y2={needleEnd.y}
            stroke={activeZone.glow} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={6} fill="#0a0d0f" stroke={activeZone.glow} strokeWidth="2" />

      {/* Center value */}
      <text x={cx} y={cy + 36} textAnchor="middle" fontSize="28" fill={activeZone.glow} fontFamily="JetBrains Mono" fontWeight="300">
        {K.toFixed(1)}
      </text>
      <text x={cx} y={cy + 50} textAnchor="middle" fontSize="9" fill="#6b7479" fontFamily="JetBrains Mono">
        % COVERAGE
      </text>
    </svg>
  );
}

function BraidCoverage() {
  const [N, setN] = useState(24);
  const [P, setP] = useState(7);
  const [d, setStrand] = useState(0.13);
  const [D, setCableD] = useState(5.0);
  const [PR, setPR] = useState(10);
  const [material, setMaterial] = useState('TC');
  const [showDouble, setShowDouble] = useState(false);
  const [animated, setAnimated] = useState(false);
  const [saved, setSaved] = useState([]);
  const [showExport, setShowExport] = useState(false);
  // Core geometry — what the braid wraps around
  const [coreType, setCoreType] = useState('coax'); // coax | pair | quad | bundle
  const [wireOD, setWireOD] = useState(1.05); // for pair/quad — single insulated wire OD

  // Material properties (resistivity Ω·m, density g/cm³)
  const materials = {
    TC: { name: 'Tinned Cu', rho: 1.72e-8, density: 8.93 },
    BC: { name: 'Bare Cu', rho: 1.68e-8, density: 8.96 },
    SPC: { name: 'Silver-plated Cu', rho: 1.59e-8, density: 8.96 },
    NPC: { name: 'Nickel-plated Cu', rho: 1.75e-8, density: 8.95 },
  };

  const presets = {
    rg58: { N: 16, P: 5, d: 0.16, D: 2.95, PR: 12, name: 'RG-58 mil' },
    cat6aSftp: { N: 24, P: 7, d: 0.13, D: 5.0, PR: 10, name: 'Cat 6A S/FTP' },
    spaceWire: { N: 36, P: 6, d: 0.10, D: 4.5, PR: 16, name: 'SpaceWire' },
    lmr400: { N: 32, P: 8, d: 0.18, D: 7.2, PR: 14, name: 'LMR-400' },
    mil1553: { N: 36, P: 8, d: 0.10, D: 4.0, PR: 18, name: 'MIL-1553B' },
  };
  const [preset, setPreset] = useState('cat6aSftp');
  const usePreset = (k) => {
    setPreset(k);
    const p = presets[k];
    if (p) {
      setN(p.N); setP(p.P); setStrand(p.d); setCableD(p.D); setPR(p.PR);
    }
  };

  // Listen for agent-applied presets (cable-suite:apply-preset event with section='braid')
  useEffect(() => {
    const onApply = (e) => {
      if (e.detail?.section !== 'braid') return;
      const p = e.detail.params || {};
      if (p.N != null) setN(p.N);
      if (p.P != null) setP(p.P);
      if (p.d != null) setStrand(p.d);
      if (p.D != null) setCableD(p.D);
      if (p.PR != null) setPR(p.PR);
      if (p.material) setMaterial(p.material);
    };
    window.addEventListener('cable-suite:apply-preset', onApply);
    return () => window.removeEventListener('cable-suite:apply-preset', onApply);
  }, []);

  // Effective braiding diameter — what the braid actually wraps
  // For non-circular cores, the strand path circumference ≠ π·D_physical
  const Deff = useMemo(() => {
    if (coreType === 'coax') {
      // Round cable — D = D_eff
      return { value: D, factor: 1.0, perim: Math.PI * D };
    }
    if (coreType === 'pair') {
      // Twisted pair — 2 wires forming dumbbell/oval cross-section
      // Bounding ellipse: major axis = 2·wireOD, minor axis = wireOD
      // Perimeter ≈ π·(a+b)/2 · (1 + 3h²/(10+√(4-3h²))) where h = (a-b)/(a+b)
      // For 2:1 ellipse h=1/3 → perimeter ≈ π·(3·wireOD/2)·1.0498
      const a = wireOD; // semi-major
      const b = wireOD / 2; // semi-minor
      const h = Math.pow((a - b) / (a + b), 2);
      const perim = Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
      // Equivalent circular diameter giving same circumference for braid path
      const Deq = perim / Math.PI;
      return { value: Deq, factor: Deq / (2 * wireOD), perim };
    }
    if (coreType === 'quad') {
      // Star quad — 4 wires in square pattern, bounding circle Ø ≈ wireOD·(1+√2) ≈ 2.41·wireOD
      const Deq = wireOD * (1 + Math.SQRT2);
      const perim = Math.PI * Deq;
      return { value: Deq, factor: Deq / (2 * wireOD), perim };
    }
    // bundle — 4 pairs in cross-spline, use measured D directly
    return { value: D, factor: 1.0, perim: Math.PI * D };
  }, [coreType, D, wireOD]);

  // Standard braid coverage formula (Belden / SCTE 51) — using D_eff instead of D_physical
  const result = useMemo(() => {
    const Cdir = N / 2;
    const D_use = Deff.value;
    const R_in = (D_use + 2 * d) / 2 / 25.4;
    const d_in = d / 25.4;
    const alphaRad = Math.atan((2 * Math.PI * R_in * PR) / Cdir);
    const F = (P * PR * d_in) / Math.sin(alphaRad);
    const Fc = Math.max(0, Math.min(1, F));
    const K = (2 * Fc - Fc * Fc) * 100;

    // For comparison — what naive (physical D) calc would give
    const R_naive = (D + 2 * d) / 2 / 25.4;
    const alphaNaive = Math.atan((2 * Math.PI * R_naive * PR) / Cdir);
    const F_naive = (P * PR * d_in) / Math.sin(alphaNaive);
    const Fc_naive = Math.max(0, Math.min(1, F_naive));
    const K_naive = (2 * Fc_naive - Fc_naive * Fc_naive) * 100;

    // DC resistance per meter
    const strandArea_m2 = Math.PI * Math.pow(d * 1e-3 / 2, 2);
    const totalArea_m2 = N * P * strandArea_m2;
    const helixFactor = 1 / Math.cos(alphaRad);
    const mat = materials[material];
    const Rdc = (mat.rho * helixFactor) / totalArea_m2;

    const volume_cm3_per_m = N * P * Math.PI * Math.pow(d / 2, 2) * 1000 * helixFactor / 1000;
    const mass_g_per_m = volume_cm3_per_m * mat.density;

    const Lt_nH_per_m = 1.0 + 4.0 * Math.pow(1 - Fc, 2);
    const Lt = Lt_nH_per_m * 1e-9;

    return {
      alpha: (alphaRad * 180) / Math.PI,
      alphaNaive: (alphaNaive * 180) / Math.PI,
      F, Fc, K,
      K_naive, F_naive,
      delta_K: K_naive - K,
      Rdc, Rdc_mOhm: Rdc * 1000,
      mass_g_per_m,
      Lt_nH_per_m, Lt,
      D_eff: D_use,
    };
  }, [N, P, d, D, PR, material, Deff]);

  // Zt(f) data — log scale 1 kHz to 1 GHz
  const ztData = useMemo(() => {
    const arr = [];
    for (let logF = 3; logF <= 9; logF += 0.1) {
      const f = Math.pow(10, logF);
      const omega = 2 * Math.PI * f;
      // |Zt| = sqrt(Rdc² + (ω·Lt)²)
      const Zt = Math.sqrt(Math.pow(result.Rdc, 2) + Math.pow(omega * result.Lt, 2));
      // Double shield estimate: foil+braid drops Zt 2-3 orders in 20kHz-20MHz, ~30dB at HF
      // Empirical model: Zt_double = Zt_single / (1 + (f/30kHz)^0.7) capped at HF
      const f_kHz = f / 1000;
      const dblFactor = Math.max(20, 1 + Math.pow(f_kHz / 30, 0.7));
      const Zt_double = Zt / dblFactor;
      arr.push({
        f: f / 1e6, // MHz
        Zt_mOhm: Zt * 1000,
        Zt_double_mOhm: Zt_double * 1000,
      });
    }
    return arr;
  }, [result]);

  const ztAt1MHz = ztData.find((p) => Math.abs(p.f - 1) < 0.15);
  const ztAt30MHz = ztData.find((p) => Math.abs(p.f - 30) < 4);
  const ztAt100MHz = ztData.find((p) => Math.abs(p.f - 100) < 12);

  // Aperture size estimate
  const aperture_mm = useMemo(() => {
    const pitch_mm = 25.4 / PR;
    const opening = pitch_mm * (1 - result.Fc);
    return Math.max(0, opening);
  }, [PR, result.Fc]);

  // SE estimate at 100 MHz, 1 GHz from proper Zt model
  // Kr (dB) ≈ -20·log10(1 + 6·f_MHz/Zt_Ω)
  const seEst = useMemo(() => {
    const calcSE = (f_MHz) => {
      const omega = 2 * Math.PI * f_MHz * 1e6;
      const Zt = Math.sqrt(Math.pow(result.Rdc, 2) + Math.pow(omega * result.Lt, 2));
      const Kr = -20 * Math.log10(1 + (6 * f_MHz) / (Zt * 1000));
      return Math.max(0, -Kr);
    };
    return { se100: calcSE(100), se1G: calcSE(1000) };
  }, [result]);

  const status = (k) => {
    if (k < 65) return { color: '#f87171', label: 'INSUFFICIENT', sub: 'Under-spec for most data cable', tone: 'amber' };
    if (k < 85) return { color: '#fbbf24', label: 'GENERAL PURPOSE', sub: 'Acceptable for low-EMI installations', tone: 'amber' };
    if (k < 95) return { color: '#5eead4', label: 'HIGH PERFORMANCE', sub: 'Good for Cat 6A, instrumentation', tone: 'teal' };
    return { color: '#7dd3fc', label: 'EMI CRITICAL', sub: 'Aerospace, MIL, SpaceWire grade', tone: 'teal' };
  };
  const s = status(result.K);
  const braidVisual = braidCoverageVisualFor(result.K);

  // Cu price + material premium for cost calc
  const [cuPriceUSD, setCuPriceUSD] = useState(9.5);
  const matPremium = { TC: 1.05, BC: 1.0, SPC: 1.85, NPC: 1.45 };
  const costPerKm = useMemo(() => {
    const massKg = (result.mass_g_per_m * 1000) / 1000; // g/m → kg/km
    const matCost = massKg * cuPriceUSD * matPremium[material];
    const labor = 25; // braiding labor per km
    return { material: matCost, labor, total: matCost + labor, mass: massKg };
  }, [result.mass_g_per_m, cuPriceUSD, material]);

  // PR sweep — vary picks/inch from 4 to 30, see K + Rdc + cost trade-off
  const prSweep = useMemo(() => {
    const arr = [];
    for (let pr = 4; pr <= 30; pr++) {
      const Cdir = N / 2;
      const R_in = (D + 2 * d) / 2 / 25.4;
      const d_in = d / 25.4;
      const alphaRad = Math.atan((2 * Math.PI * R_in * pr) / Cdir);
      const F = (P * pr * d_in) / Math.sin(alphaRad);
      const Fc = Math.max(0, Math.min(1, F));
      const K = (2 * Fc - Fc * Fc) * 100;
      const helixFactor = 1 / Math.cos(alphaRad);
      const strandArea_m2 = Math.PI * Math.pow(d * 1e-3 / 2, 2);
      const totalArea_m2 = N * P * strandArea_m2;
      const Rdc = (materials[material].rho * helixFactor) / totalArea_m2 * 1000; // mΩ/m
      const volume_cm3_per_m = N * P * Math.PI * Math.pow(d / 2, 2) * helixFactor;
      const mass = volume_cm3_per_m * materials[material].density; // g/m
      const costKm = mass * cuPriceUSD * matPremium[material] + 25;
      arr.push({ PR: pr, K, Rdc, mass, cost: costKm, alpha: (alphaRad * 180) / Math.PI });
    }
    return arr;
  }, [N, P, d, D, material, cuPriceUSD]);

  // Find optimal PR — minimum cost that achieves >= 90% K
  const optimalPR = useMemo(() => {
    const candidates = prSweep.filter((p) => p.K >= 90);
    if (candidates.length === 0) return null;
    return candidates.reduce((best, p) => (p.cost < best.cost ? p : best), candidates[0]);
  }, [prSweep]);

  const sliders = [
    { label: 'N — total carriers', val: N, set: setN, min: 8, max: 48, step: 2, hint: '16 / 24 / 36 / 48 standard', fmt: (v) => v },
    { label: 'P — ends per carrier', val: P, set: setP, min: 1, max: 15, step: 1, hint: '5–8 typical, up to 12 premium', fmt: (v) => v },
    { label: 'd — strand Ø (mm)', val: d, set: setStrand, min: 0.025, max: 0.255, step: 0.005, hint: '30–50 AWG SPC/TC', fmt: (v) => `${v.toFixed(3)} / ${(v/25.4).toFixed(4)}″` },
    { label: 'D — cable Ø (mm)', val: D, set: setCableD, min: 1.0, max: 15.0, step: 0.1, hint: 'OD under braid', fmt: (v) => `${v.toFixed(1)} / ${(v/25.4).toFixed(3)}″` },
    { label: 'PR — picks/inch', val: PR, set: setPR, min: 4, max: 30, step: 1, hint: '8–25 typical', fmt: (v) => v },
  ];

  return (
    <section className="mb-20">
      <SectionTitle
        tag="LAB 02 — BRAID COVERAGE"
        title="Shield coverage analyzer"
        subtitle="Calculate optical coverage K, weave angle, aperture size, and shielding effectiveness. Live 3D weave + tubular cable visualization."
        icon={Shield}
      />

      {/* Preset row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
        {Object.entries(presets).map(([k, p]) => (
          <button
            key={k}
            onClick={() => usePreset(k)}
            className={`tappable p-2 border rounded-sm text-left ${
              preset === k ? 'border-[#c97b3f] bg-[#3d2a1c]' : 'border-[#384249] bg-[#1d2329]'
            }`}
          >
            <div className={`text-[11px] font-mono ${preset === k ? 'text-[#fbbf24]' : 'text-[#a7b0b6]'}`}>
              {p.name}
            </div>
            <div className="text-[9px] font-mono text-[#6b7479] mt-0.5">
              N{p.N} · P{p.P} · {p.PR}ppi
            </div>
          </button>
        ))}
      </div>

      {/* CORE TYPE SELECTOR — what does the braid wrap around? */}
      <div className="mb-6 p-5 border-2 border-[#c97b3f] bg-[#1a120c]">
        <div className="flex items-baseline justify-between mb-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f]">
            ⚠ Core geometry — what's under the braid?
          </div>
          <div className="font-mono text-[10px] text-[#a7b0b6]">
            D_eff ≠ D_physical for non-circular cores
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {[
            { id: 'coax', label: 'Coax / round', sub: 'Single round cable, foil-wrapped pair', factor: '1.00×' },
            { id: 'pair', label: 'Twisted pair', sub: '2 wires forming oval/dumbbell', factor: '1.18×' },
            { id: 'quad', label: 'Star quad', sub: '4 wires in square pattern', factor: '1.21×' },
            { id: 'bundle', label: '4-pair bundle', sub: 'Use measured core OD', factor: '1.00×' },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setCoreType(opt.id)}
              className={`tappable p-3 border rounded-sm text-left ${
                coreType === opt.id ? 'border-[#c97b3f] bg-[#0a0d0f]' : 'border-[#384249] bg-[#1d2329]'
              }`}
            >
              <div className={`text-xs font-mono uppercase ${coreType === opt.id ? 'text-[#fbbf24]' : 'text-[#a7b0b6]'}`}>
                {opt.label}
              </div>
              <div className="text-[10px] text-[#a7b0b6] mt-1 leading-tight">{opt.sub}</div>
              <div className="font-mono text-[10px] text-[#5eead4] mt-1">perim factor: {opt.factor}</div>
            </button>
          ))}
        </div>

        {/* Per-core inputs */}
        {(coreType === 'pair' || coreType === 'quad') ? (
          <div className="grid md:grid-cols-2 gap-4 mt-3 pt-3 border-t border-dashed border-[#252e33]">
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase">Single insulated wire OD</label>
                <span className="font-mono text-[#fbbf24]">{wireOD.toFixed(2)} mm <span className="text-[10px] text-[#6b7479]">/ {(wireOD/25.4).toFixed(3)}″</span></span>
              </div>
              <input
                type="range"
                min="0.4"
                max="2.5"
                step="0.05"
                value={wireOD}
                onChange={(e) => setWireOD(Number(e.target.value))}
                className="w-full accent-[#c97b3f]"
              />
              <div className="text-[10px] font-mono text-[#6b7479] mt-1">
                Cat 6A 23 AWG ≈ 0.95–1.05 mm · MIL 26 AWG FEP ≈ 0.65 mm
              </div>
            </div>
            <div className="bg-[#0a0d0f] p-3 border border-[#252e33] rounded-sm">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#5eead4] mb-2">
                Computed effective diameter
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-[#6b7479] font-mono text-[10px]">Bounding perimeter</div>
                  <div className="font-mono text-[#fbbf24]">{Deff.perim.toFixed(2)} mm</div>
                </div>
                <div>
                  <div className="text-[#6b7479] font-mono text-[10px]">D_eff (used in calc)</div>
                  <div className="font-mono text-[#5eead4] text-base">{Deff.value.toFixed(2)} mm</div>
                </div>
              </div>
              <div className="mt-2 text-[10px] font-mono text-[#a7b0b6] leading-relaxed">
                {coreType === 'pair'
                  ? `Pair forms 2:1 oval → braid path is ${((Deff.factor - 1) * 100).toFixed(0)}% longer than 2·d_wire would suggest.`
                  : `Star quad bounding circle Ø = (1+√2)·wireOD = 2.414·wireOD`}
              </div>
            </div>
          </div>
        ) : coreType === 'bundle' ? (
          <div className="mt-3 pt-3 border-t border-dashed border-[#252e33] text-xs text-[#a7b0b6] leading-relaxed">
            For 4-pair bundles with cross-spline, measure the actual core OD under the binder tape (D slider above).
            Cat 6A bundle ≈ 5.5 mm. Cross-spline already makes core fairly round so D_physical ≈ D_eff.
          </div>
        ) : (
          <div className="mt-3 pt-3 border-t border-dashed border-[#252e33] text-xs text-[#a7b0b6] leading-relaxed">
            Round cable (coax, foil-shielded pair) → physical diameter D = D_eff. Use the D slider in the parameters section.
          </div>
        )}

        {/* Naive vs corrected comparison */}
        {(coreType === 'pair' || coreType === 'quad') && (
          <div className="mt-3 pt-3 border-t border-dashed border-[#252e33]">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#fbbf24] mb-2">
              ⚠ Naive (D_physical) vs corrected (D_eff)
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-2 bg-[#0a0d0f] border border-[#252e33]">
                <div className="text-[#6b7479] font-mono text-[10px]">If you use D=2·wireOD</div>
                <div className="font-mono text-[#f87171] text-base">{result.K_naive.toFixed(1)}%</div>
                <div className="font-mono text-[9px] text-[#6b7479]">α = {result.alphaNaive.toFixed(1)}°</div>
              </div>
              <div className="p-2 bg-[#0a0d0f] border-2 border-[#5eead4]">
                <div className="text-[#5eead4] font-mono text-[10px]">Correct (D_eff)</div>
                <div className="font-mono text-[#5eead4] text-base">{result.K.toFixed(1)}%</div>
                <div className="font-mono text-[9px] text-[#6b7479]">α = {result.alpha.toFixed(1)}°</div>
              </div>
              <div className="p-2 bg-[#0a0d0f] border border-[#252e33]">
                <div className="text-[#6b7479] font-mono text-[10px]">Over-estimate by</div>
                <div className="font-mono text-base" style={{ color: Math.abs(result.delta_K) > 5 ? '#f87171' : '#fbbf24' }}>
                  {result.delta_K > 0 ? '+' : ''}{result.delta_K.toFixed(1)}%
                </div>
                <div className="font-mono text-[9px] text-[#6b7479]">
                  {Math.abs(result.delta_K) > 5 ? 'significant' : 'minor'} error
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* HERO ROW — Gauge + Status */}
      <div className="grid md:grid-cols-3 gap-6 mb-6">
        <div className="md:col-span-2 p-6 border border-[#252e33] bg-gradient-to-br from-[#0e1316] to-[#0a0d0f] flex flex-col md:flex-row items-center gap-6">
          <div className="shrink-0">
            <CoverageGauge K={result.K} />
          </div>
          <div className="flex-1 min-w-0 w-full">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: s.color }}>
              Verdict
            </div>
            <div className="text-2xl md:text-3xl font-light mb-1" style={{ color: s.color, fontFamily: 'Bricolage Grotesque' }}>
              {s.label}
            </div>
            <div className="text-xs text-[#a7b0b6] mb-4">{s.sub}</div>

            {/* Mini stats grid */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="border border-[#252e33] bg-[#0a0d0f] p-3">
                <div className="text-[10px] font-mono uppercase text-[#6b7479]">Helix angle α</div>
                <div className="font-mono text-lg text-[#fbbf24] mt-1">{result.alpha.toFixed(1)}°</div>
                <div className="text-[9px] font-mono mt-0.5" style={{
                  color: result.alpha >= 30 && result.alpha <= 45 ? '#5eead4' : '#fbbf24',
                }}>
                  {result.alpha < 25 ? '⚠ too shallow — Lt high' :
                   result.alpha > 50 ? '⚠ too steep — flex breaks' :
                   result.alpha >= 30 && result.alpha <= 45 ? '✓ optimum 30–45°' : '~ acceptable'}
                </div>
              </div>
              <div className="border border-[#252e33] bg-[#0a0d0f] p-3">
                <div className="text-[10px] font-mono uppercase text-[#6b7479]">Fill factor F</div>
                <div className="font-mono text-lg text-[#5eead4] mt-1">{result.F.toFixed(3)}</div>
              </div>
              <div className="border border-[#252e33] bg-[#0a0d0f] p-3">
                <div className="text-[10px] font-mono uppercase text-[#6b7479]">Aperture size</div>
                <div className="font-mono text-lg" style={{ color: aperture_mm < 0.3 ? '#5eead4' : aperture_mm < 1 ? '#fbbf24' : '#f87171' }}>
                  {aperture_mm.toFixed(2)}<span className="text-xs text-[#6b7479] ml-1">mm</span>
                </div>
              </div>
              <div className="border border-[#252e33] bg-[#0a0d0f] p-3">
                <div className="text-[10px] font-mono uppercase text-[#6b7479]">Zt @ 100 MHz</div>
                <div className="font-mono text-sm text-[#7dd3fc] mt-1">
                  {ztAt100MHz ? `${ztAt100MHz.Zt_mOhm.toFixed(1)} mΩ/m` : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SE estimate panel */}
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-3">Shielding effectiveness</div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-mono uppercase text-[#a7b0b6]">@ 100 MHz</span>
                <span className="font-mono text-lg text-[#5eead4]">{seEst.se100.toFixed(0)}<span className="text-[10px] text-[#6b7479] ml-1">dB</span></span>
              </div>
              <div className="h-2 bg-[#0a0d0f] border border-[#252e33] overflow-hidden rounded-sm">
                <div className="h-full transition-all" style={{ width: `${Math.min(100, (seEst.se100 / 80) * 100)}%`, background: 'linear-gradient(to right, #5eead4, #7dd3fc)' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-mono uppercase text-[#a7b0b6]">@ 1 GHz</span>
                <span className="font-mono text-lg text-[#fbbf24]">{seEst.se1G.toFixed(0)}<span className="text-[10px] text-[#6b7479] ml-1">dB</span></span>
              </div>
              <div className="h-2 bg-[#0a0d0f] border border-[#252e33] overflow-hidden rounded-sm">
                <div className="h-full transition-all" style={{ width: `${Math.min(100, (seEst.se1G / 80) * 100)}%`, background: 'linear-gradient(to right, #fbbf24, #f97316)' }} />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-dashed border-[#252e33]">
            <Formula>α = arctan(2π·R·PR / (N/2))</Formula>
            <Formula>K = (2F − F²) × 100%</Formula>
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 border border-[#252e33] bg-[#12171a]">
        <button
          onClick={() => setAnimated(!animated)}
          className={`tappable flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border rounded-sm ${
            animated
              ? 'border-[#5eead4] text-[#5eead4] bg-[#0d1f1d]'
              : 'border-[#384249] text-[#a7b0b6]'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${animated ? 'bg-[#5eead4]' : 'bg-[#384249]'}`} style={animated ? { boxShadow: '0 0 6px #5eead4' } : {}} />
          {animated ? 'Animation ON' : 'Animation OFF'}
        </button>

        <button
          onClick={() => {
            const newSave = {
              id: Date.now(),
              name: `Design ${saved.length + 1}`,
              N, P, d, D, PR, material,
              K: result.K,
              alpha: result.alpha,
              Rdc: result.Rdc_mOhm,
              mass: result.mass_g_per_m,
              Lt: result.Lt_nH_per_m,
            };
            setSaved([...saved, newSave].slice(-5));
          }}
          className="tappable flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-[#384249] text-[#a7b0b6]"
        >
          <Plus className="w-3 h-3" />
          Save design ({saved.length}/5)
        </button>

        <button
          onClick={() => setShowExport(!showExport)}
          className={`tappable flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border ${
            showExport ? 'border-[#fbbf24] text-[#fbbf24]' : 'border-[#384249] text-[#a7b0b6]'
          }`}
        >
          <BookOpen className="w-3 h-3" />
          {showExport ? 'Hide JSON' : 'Export JSON'}
        </button>

        {saved.length > 0 && (
          <button
            onClick={() => setSaved([])}
            className="tappable flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-[#384249] text-[#a7b0b6] ml-auto"
          >
            <X className="w-3 h-3" />
            Clear saved
          </button>
        )}
      </div>

      {/* EXPORT JSON SPEC CARD */}
      {showExport && (
        <div className="mb-6 p-4 border-2 border-[#fbbf24] bg-[#1a1408]">
          <div className="flex justify-between items-center mb-2">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#fbbf24]">Design specification · JSON</div>
            <button
              onClick={() => {
                const spec = JSON.stringify({
                  shield: {
                    type: 'single_braid',
                    carriers_N: N,
                    ends_per_carrier_P: P,
                    strand_diameter_mm: d,
                    strand_diameter_in: parseFloat((d/25.4).toFixed(4)),
                    cable_OD_mm: D,
                    cable_OD_in: parseFloat((D/25.4).toFixed(3)),
                    picks_per_inch_PR: PR,
                    pitch_mm: parseFloat((25.4/PR).toFixed(2)),
                    material: materials[material].name,
                    helix_angle_deg: parseFloat(result.alpha.toFixed(2)),
                  },
                  performance: {
                    optical_coverage_pct: parseFloat(result.K.toFixed(2)),
                    fill_factor_F: parseFloat(result.F.toFixed(3)),
                    DC_resistance_mOhm_per_m: parseFloat(result.Rdc_mOhm.toFixed(2)),
                    leakage_inductance_nH_per_m: parseFloat(result.Lt_nH_per_m.toFixed(2)),
                    mass_g_per_m: parseFloat(result.mass_g_per_m.toFixed(2)),
                    SE_at_100MHz_dB: parseFloat(seEst.se100.toFixed(1)),
                    SE_at_1GHz_dB: parseFloat(seEst.se1G.toFixed(1)),
                    Zt_at_1MHz_mOhm_per_m: ztAt1MHz ? parseFloat(ztAt1MHz.Zt_mOhm.toFixed(2)) : null,
                    Zt_at_30MHz_mOhm_per_m: ztAt30MHz ? parseFloat(ztAt30MHz.Zt_mOhm.toFixed(2)) : null,
                    Zt_at_100MHz_mOhm_per_m: ztAt100MHz ? parseFloat(ztAt100MHz.Zt_mOhm.toFixed(2)) : null,
                  },
                }, null, 2);
                navigator.clipboard?.writeText(spec).catch(() => {});
              }}
              className="tappable text-[10px] font-mono uppercase tracking-wider px-2 py-1 border border-[#fbbf24] text-[#fbbf24] hover:bg-[#fbbf24] hover:text-[#0a0d0f]"
            >
              Copy
            </button>
          </div>
          <pre className="text-[10px] font-mono text-[#fbbf24] bg-[#0a0d0f] p-3 border border-[#252e33] overflow-x-auto leading-relaxed">
{JSON.stringify({
  shield: {
    type: 'single_braid',
    carriers_N: N, ends_per_carrier_P: P,
    strand_diameter_mm: d,
    cable_OD_mm: D,
    picks_per_inch_PR: PR,
    material: materials[material].name,
    helix_angle_deg: parseFloat(result.alpha.toFixed(2)),
  },
  performance: {
    optical_coverage_pct: parseFloat(result.K.toFixed(2)),
    DC_resistance_mOhm_per_m: parseFloat(result.Rdc_mOhm.toFixed(2)),
    leakage_inductance_nH_per_m: parseFloat(result.Lt_nH_per_m.toFixed(2)),
    mass_g_per_m: parseFloat(result.mass_g_per_m.toFixed(2)),
    SE_at_100MHz_dB: parseFloat(seEst.se100.toFixed(1)),
    SE_at_1GHz_dB: parseFloat(seEst.se1G.toFixed(1)),
  },
}, null, 2)}
          </pre>
        </div>
      )}

      {/* SAVED DESIGNS COMPARISON */}
      {saved.length > 0 && (
        <div className="mb-6 p-4 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-3">
            Saved designs · {saved.length} stored
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-[#6b7479] uppercase text-[9px]">
                  <th className="px-2 py-2 text-left">Name</th>
                  <th className="px-2 py-2 text-right">N</th>
                  <th className="px-2 py-2 text-right">P</th>
                  <th className="px-2 py-2 text-right">d (mm)</th>
                  <th className="px-2 py-2 text-right">PR</th>
                  <th className="px-2 py-2 text-right">α (°)</th>
                  <th className="px-2 py-2 text-right">K (%)</th>
                  <th className="px-2 py-2 text-right">Rdc (mΩ/m)</th>
                  <th className="px-2 py-2 text-right">Lt (nH/m)</th>
                  <th className="px-2 py-2 text-right">Mass (g/m)</th>
                  <th className="px-2 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {saved.map((s) => {
                  const kColor = s.K < 65 ? '#f87171' : s.K < 85 ? '#fbbf24' : s.K < 95 ? '#5eead4' : '#7dd3fc';
                  return (
                    <tr key={s.id} className="border-t border-[#252e33] hover:bg-[#171d20]">
                      <td className="px-2 py-2 text-[#f0ebe2]">{s.name}</td>
                      <td className="px-2 py-2 text-right text-[#a7b0b6]">{s.N}</td>
                      <td className="px-2 py-2 text-right text-[#a7b0b6]">{s.P}</td>
                      <td className="px-2 py-2 text-right text-[#a7b0b6]">{s.d.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right text-[#a7b0b6]">{s.PR}</td>
                      <td className="px-2 py-2 text-right text-[#fbbf24]">{s.alpha.toFixed(1)}</td>
                      <td className="px-2 py-2 text-right" style={{ color: kColor }}>{s.K.toFixed(1)}</td>
                      <td className="px-2 py-2 text-right text-[#7dd3fc]">{s.Rdc.toFixed(1)}</td>
                      <td className="px-2 py-2 text-right text-[#5eead4]">{s.Lt.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right text-[#a7b0b6]">{s.mass.toFixed(1)}</td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => setSaved(saved.filter((x) => x.id !== s.id))}
                          className="text-[#6b7479] hover:text-[#f87171]"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {/* Current design row */}
                <tr className="border-t-2 border-[#c97b3f] bg-[#1a120c]">
                  <td className="px-2 py-2 text-[#c97b3f] font-semibold">◆ CURRENT</td>
                  <td className="px-2 py-2 text-right text-[#c97b3f]">{N}</td>
                  <td className="px-2 py-2 text-right text-[#c97b3f]">{P}</td>
                  <td className="px-2 py-2 text-right text-[#c97b3f]">{d.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right text-[#c97b3f]">{PR}</td>
                  <td className="px-2 py-2 text-right text-[#c97b3f]">{result.alpha.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right text-[#c97b3f]">{result.K.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right text-[#c97b3f]">{result.Rdc_mOhm.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right text-[#c97b3f]">{result.Lt_nH_per_m.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right text-[#c97b3f]">{result.mass_g_per_m.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right text-[#6b7479]">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BLENDER + LIVE GEOMETRY VISUALIZATION */}
      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6 mb-6">
        <BraidBlenderPreview
          visual={braidVisual}
          K={result.K}
          alpha={result.alpha}
          picksPerInch={PR}
          carriers={N}
          apertureMm={aperture_mm}
        />
        <BraidDiamondMap
          alpha={result.alpha}
          K={result.K}
          picksPerInch={PR}
          carriers={N}
          strandMm={d}
          apertureMm={aperture_mm}
          animated={animated}
        />
      </div>

      {/* CONTROLS ROW */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">Braid parameters</div>

          {sliders.map((p, i) => (
            <div key={i} className="mb-4">
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase tracking-wider">{p.label}</label>
                <span className="font-mono text-[#fbbf24]">{p.fmt(p.val)}</span>
              </div>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={p.val}
                onChange={(e) => { p.set(Number(e.target.value)); setPreset('custom'); }}
                className="w-full accent-[#c97b3f]"
              />
              <div className="text-[10px] font-mono text-[#6b7479] mt-1">{p.hint}</div>
            </div>
          ))}

          {/* Material selector */}
          <div className="mt-2 pt-3 border-t border-dashed border-[#252e33]">
            <label className="text-xs text-[#a7b0b6] font-mono uppercase tracking-wider mb-2 block">Strand material</label>
            <div className="grid grid-cols-4 gap-1">
              {Object.entries(materials).map(([k, m]) => (
                <button
                  key={k}
                  onClick={() => setMaterial(k)}
                  className={`text-[10px] font-mono uppercase tracking-wider py-1.5 border ${
                    material === k
                      ? 'border-[#c97b3f] text-[#fbbf24] bg-[#2a1d14]'
                      : 'border-[#252e33] text-[#a7b0b6] hover:border-[#384249]'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="text-[10px] font-mono text-[#6b7479] mt-1.5">
              {materials[material].name} · ρ {(materials[material].rho * 1e9).toFixed(2)} nΩ·m · ρ_d {materials[material].density} g/cm³
            </div>
          </div>
        </div>

        {/* Coverage zones legend with active highlight */}
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">Coverage zones</div>
          <div className="space-y-2">
            {[
              { l: '< 65%', c: '#f87171', txt: 'Insufficient', detail: 'Mechanical only, RFI shield needed elsewhere', range: [0, 65] },
              { l: '65–85%', c: '#fbbf24', txt: 'General purpose', detail: 'Cat 5e shield, basic instrumentation', range: [65, 85] },
              { l: '85–95%', c: '#5eead4', txt: 'High-performance', detail: 'Cat 6A S/FTP, broadcast video, audio', range: [85, 95] },
              { l: '≥ 95%', c: '#7dd3fc', txt: 'EMI critical', detail: 'Aerospace, MIL-DTL-17, SpaceWire, 1553B', range: [95, 101] },
            ].map((t, i) => {
              const isActive = result.K >= t.range[0] && result.K < t.range[1];
              return (
                <div key={i} className={`p-3 border rounded-sm transition-all ${
                  isActive ? 'border-[#c97b3f] bg-[#3d2a1c]' : 'border-[#252e33] bg-[#0a0d0f]'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: t.c, boxShadow: isActive ? `0 0 8px ${t.c}` : 'none' }} />
                      <span className="font-mono text-xs" style={{ color: t.c }}>{t.l}</span>
                      <span className="text-xs text-[#f0ebe2]">{t.txt}</span>
                    </div>
                    {isActive && <span className="font-mono text-[9px] text-[#c97b3f] uppercase">◆ active</span>}
                  </div>
                  <div className="text-[10px] text-[#a7b0b6] pl-5">{t.detail}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-dashed border-[#252e33] grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="font-mono text-[10px] uppercase text-[#6b7479]">Pitch length</div>
              <div className="font-mono text-[#5eead4] mt-0.5">{(25.4 / PR).toFixed(2)} mm <span className="text-[9px] text-[#6b7479]">/ {(1/PR).toFixed(3)}″</span></div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase text-[#6b7479]">Strand turns</div>
              <div className="font-mono text-[#5eead4] mt-0.5">{(PR * 12).toFixed(0)}/ft</div>
            </div>
          </div>
        </div>
      </div>

      {/* Electrical + mechanical metrics */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-5 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-2">DC shield resistance</div>
          <div className="font-mono text-3xl text-[#5eead4]">
            {result.Rdc_mOhm < 1 ? (result.Rdc_mOhm * 1000).toFixed(1) : result.Rdc_mOhm.toFixed(1)}
            <span className="text-base ml-1">{result.Rdc_mOhm < 1 ? 'µΩ' : 'mΩ'}</span>
            <span className="text-xs text-[#6b7479] ml-1">/ m</span>
          </div>
          <div className="text-xs text-[#a7b0b6] mt-2">
            {(result.Rdc * 304.8).toFixed(2)} mΩ / 1000 ft
          </div>
          <div className="text-[10px] font-mono text-[#6b7479] mt-2 pt-2 border-t border-dashed border-[#252e33]">
            Sets LF Zt floor + grounding loop drop. Material: {materials[material].name}
          </div>
        </div>

        <div className="p-5 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-2">Shield mass</div>
          <div className="font-mono text-3xl text-[#fbbf24]">
            {result.mass_g_per_m.toFixed(1)}<span className="text-base"> g/m</span>
          </div>
          <div className="text-xs text-[#a7b0b6] mt-2">
            {(result.mass_g_per_m * 0.305).toFixed(1)} g / ft · {(result.mass_g_per_m).toFixed(1)} kg / km
          </div>
          <div className="text-[10px] font-mono text-[#6b7479] mt-2 pt-2 border-t border-dashed border-[#252e33]">
            Critical for aerospace SWaP (Size, Weight, Power) budget.
          </div>
        </div>

        <div className="p-5 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-2">Leakage inductance Lt</div>
          <div className="font-mono text-3xl text-[#a78bfa]">
            {result.Lt_nH_per_m.toFixed(2)}<span className="text-base"> nH/m</span>
          </div>
          <div className="text-xs text-[#a7b0b6] mt-2">
            HF Zt slope = ω·Lt
          </div>
          <div className="text-[10px] font-mono text-[#6b7479] mt-2 pt-2 border-t border-dashed border-[#252e33]">
            Good braid 1–2 nH/m · poor 4–5. Reducing K from 95% → 70% triples Lt.
          </div>
        </div>

        <div className="p-5 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-2">Material cost</div>
          {(() => {
            // Material price $/kg (Cu spot ~$9.5, Sn-plated +5%, SPC +25% for Ag, Ni-plated +12%)
            const priceMultiplier = { TC: 1.05, BC: 1.0, SPC: 1.30, NPC: 1.12 };
            const pricePerKg = 9.5 * priceMultiplier[material];
            const costPerM = (result.mass_g_per_m / 1000) * pricePerKg;
            const costPerKm = costPerM * 1000;
            return (
              <>
                <div className="font-mono text-3xl text-[#7dd3fc]">
                  ${costPerM.toFixed(3)}<span className="text-base"> /m</span>
                </div>
                <div className="text-xs text-[#a7b0b6] mt-2">
                  ${costPerKm.toFixed(0)} / km · ${(costPerM * 304.8 / 1000).toFixed(2)} / 1000 ft
                </div>
                <div className="text-[10px] font-mono text-[#6b7479] mt-2 pt-2 border-t border-dashed border-[#252e33]">
                  At ${pricePerKg.toFixed(2)}/kg ({materials[material].name}). Cu spot price assumption.
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Transfer impedance Zt(f) plot */}
      <div className="p-6 border border-[#252e33] bg-[#12171a] mb-6">
        <div className="flex justify-between items-baseline mb-3 gap-2 flex-wrap">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f]">
            Transfer impedance Zt(f) · log–log
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowDouble(!showDouble)}
              className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 border transition-all ${
                showDouble
                  ? 'border-[#a78bfa] text-[#a78bfa] bg-[#1a1228]'
                  : 'border-[#384249] text-[#a7b0b6] hover:border-[#a78bfa]'
              }`}
            >
              {showDouble ? '✓' : '+'} foil + braid overlay
            </button>
            <div className="text-[10px] font-mono text-[#6b7479]">lower = better</div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={ztData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="2 2" stroke={C.border} />
            <XAxis
              dataKey="f"
              scale="log"
              type="number"
              domain={[0.001, 1000]}
              stroke={C.textMuted}
              tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
              ticks={[0.001, 0.01, 0.1, 1, 10, 100, 1000]}
              tickFormatter={(v) => v >= 1000 ? `${v / 1000}G` : v >= 1 ? `${v}M` : `${(v * 1000).toFixed(0)}k`}
              label={{ value: 'frequency (Hz)', position: 'insideBottom', offset: -2, fill: C.textMuted, fontSize: 10 }}
            />
            <YAxis
              scale="log"
              domain={[0.01, 10000]}
              stroke={C.textMuted}
              tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
              ticks={[0.01, 0.1, 1, 10, 100, 1000, 10000]}
              tickFormatter={(v) => v.toString()}
              label={{ value: 'Zt (mΩ/m)', angle: -90, position: 'insideLeft', fill: C.textMuted, fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{ background: C.bg, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'JetBrains Mono' }}
              labelStyle={{ color: C.copperBright }}
              labelFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(2)} GHz` : v >= 1 ? `${v.toFixed(2)} MHz` : `${(v * 1000).toFixed(0)} kHz`}
              formatter={(val) => [`${val.toFixed(2)} mΩ/m`, 'Zt']}
            />
            <Line type="monotone" dataKey="Zt_mOhm" stroke={C.teal} strokeWidth={2.5} dot={false} name="single braid" />
            {showDouble && (
              <Line type="monotone" dataKey="Zt_double_mOhm" stroke="#a78bfa" strokeWidth={2.5} strokeDasharray="6 3" dot={false} name="foil + braid" />
            )}
            <ReferenceLine y={10} stroke={C.amber} strokeDasharray="3 3" opacity={0.5} label={{ value: 'good limit', fill: C.amber, fontSize: 9, position: 'right' }} />
            <ReferenceLine y={100} stroke={'#f87171'} strokeDasharray="3 3" opacity={0.5} label={{ value: 'poor limit', fill: '#f87171', fontSize: 9, position: 'right' }} />
          </LineChart>
        </ResponsiveContainer>

        {showDouble && (
          <div className="flex gap-4 justify-center mt-2 text-[10px] font-mono">
            <span className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-[#5eead4]"></div>
              <span className="text-[#a7b0b6]">single braid (configured)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-[#a78bfa]" style={{ backgroundImage: 'repeating-linear-gradient(to right, #a78bfa 0 4px, transparent 4px 7px)' }}></div>
              <span className="text-[#a7b0b6]">foil + braid (S/FTP equivalent)</span>
            </span>
          </div>
        )}

        {/* Spot Zt values */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-dashed border-[#252e33]">
          {[
            { f: '1 MHz', v: ztAt1MHz, note: 'AM band' },
            { f: '30 MHz', v: ztAt30MHz, note: 'CISPR / FM' },
            { f: '100 MHz', v: ztAt100MHz, note: 'VHF / WLAN' },
          ].map((spot, i) => (
            <div key={i} className="text-center border border-[#252e33] py-3 bg-[#0a0d0f]">
              <div className="text-[10px] font-mono text-[#6b7479]">{spot.f}</div>
              <div className="font-mono text-base text-[#5eead4] mt-1">
                {spot.v ? `${spot.v.Zt_mOhm.toFixed(1)} mΩ/m` : '—'}
              </div>
              <div className="text-[9px] font-mono text-[#6b7479] mt-1">{spot.note}</div>
            </div>
          ))}
        </div>
      </div>

      {/* OPTIMIZATION SWEEP — varies PR to find best K vs cost */}
      <div className="mb-6 p-6 border border-[#252e33] bg-[#12171a]">
        <div className="flex justify-between items-baseline mb-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f]">
            Optimization sweep · PR (picks/inch)
          </div>
          {optimalPR && (
            <div className="font-mono text-[10px] text-[#5eead4]">
              Optimal: PR={optimalPR.PR} → K={optimalPR.K.toFixed(1)}% @ ${optimalPR.cost.toFixed(0)}/km
            </div>
          )}
        </div>
        <p className="text-xs text-[#a7b0b6] mb-4 leading-relaxed">
          Sweeps PR from 4 to 30 keeping N, P, d, D, material constant. Shows how coverage and cost scale with picks/inch — find the cheapest design that meets your coverage target.
        </p>

        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={prSweep} margin={{ top: 5, right: 50, left: 0, bottom: 5 }}>
              <CartesianGrid stroke="#252e33" strokeDasharray="2 4" />
              <XAxis
                dataKey="PR"
                stroke="#6b7479"
                tick={{ fill: '#6b7479', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                label={{ value: 'picks/inch', fill: '#6b7479', fontSize: 10, position: 'insideBottom', offset: -2, fontFamily: 'JetBrains Mono' }}
              />
              <YAxis
                yAxisId="K"
                stroke="#5eead4"
                domain={[0, 100]}
                tick={{ fill: '#5eead4', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                label={{ value: 'K (%)', fill: '#5eead4', fontSize: 10, angle: -90, position: 'insideLeft', fontFamily: 'JetBrains Mono' }}
              />
              <YAxis
                yAxisId="cost"
                orientation="right"
                stroke="#fbbf24"
                tick={{ fill: '#fbbf24', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                label={{ value: '$/km', fill: '#fbbf24', fontSize: 10, angle: 90, position: 'insideRight', fontFamily: 'JetBrains Mono' }}
              />
              <ReferenceLine yAxisId="K" y={90} stroke="#5eead4" strokeDasharray="4 4" strokeOpacity={0.4}
                label={{ value: 'Target 90%', fill: '#5eead4', fontSize: 9, position: 'insideTopLeft' }} />
              <ReferenceLine yAxisId="K" x={PR} stroke="#c97b3f" strokeDasharray="4 4" strokeOpacity={0.6}
                label={{ value: `Current PR=${PR}`, fill: '#c97b3f', fontSize: 9, position: 'top' }} />
              <Tooltip
                contentStyle={{ background: '#0a0d0f', border: '1px solid #252e33', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                labelStyle={{ color: '#a7b0b6' }}
                formatter={(val, name) => {
                  if (name === 'K') return [`${val.toFixed(1)}%`, 'Coverage'];
                  if (name === 'cost') return [`$${val.toFixed(2)}`, 'Cost/km'];
                  return [val, name];
                }}
              />
              <Line yAxisId="K" type="monotone" dataKey="K" stroke="#5eead4" strokeWidth={2.5} dot={false} name="K" />
              <Line yAxisId="cost" type="monotone" dataKey="cost" stroke="#fbbf24" strokeWidth={2} dot={false} strokeDasharray="6 3" name="cost" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono">
          {[8, 14, 20, 26].map((pr) => {
            const pt = prSweep.find((p) => p.PR === pr);
            if (!pt) return null;
            const isCurrent = pr === PR;
            return (
              <div
                key={pr}
                className={`p-2 border ${isCurrent ? 'border-[#c97b3f] bg-[#3d2a1c]' : 'border-[#252e33] bg-[#0a0d0f]'}`}
              >
                <div className="text-[#6b7479]">PR = {pr}</div>
                <div className="flex justify-between mt-1">
                  <span className="text-[#5eead4]">K {pt.K.toFixed(0)}%</span>
                  <span className="text-[#fbbf24]">${pt.cost.toFixed(0)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* COST PANEL */}
      <div className="mb-6 grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">Material cost · 1 km</div>

          <div className="mb-4">
            <div className="flex justify-between items-baseline mb-1">
              <label className="text-xs text-[#a7b0b6] font-mono uppercase">Cu spot price</label>
              <span className="font-mono text-[#fbbf24]">${cuPriceUSD.toFixed(2)} / kg</span>
            </div>
            <input
              type="range"
              min="6"
              max="15"
              step="0.1"
              value={cuPriceUSD}
              onChange={(e) => setCuPriceUSD(Number(e.target.value))}
              className="w-full accent-[#c97b3f]"
            />
            <div className="text-[10px] font-mono text-[#6b7479] mt-1">
              Historic range: $6–14 (LME spot · 2020–2024)
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="p-3 border border-[#252e33] bg-[#0a0d0f]">
              <div className="text-[10px] font-mono uppercase text-[#6b7479]">Cu mass</div>
              <div className="font-mono text-lg text-[#e89357] mt-1">
                {costPerKm.mass.toFixed(2)}<span className="text-[10px] text-[#6b7479] ml-1">kg</span>
              </div>
            </div>
            <div className="p-3 border border-[#252e33] bg-[#0a0d0f]">
              <div className="text-[10px] font-mono uppercase text-[#6b7479]">{materials[material].name}</div>
              <div className="font-mono text-lg text-[#fbbf24] mt-1">
                {matPremium[material].toFixed(2)}×
              </div>
            </div>
            <div className="p-3 border border-[#252e33] bg-[#0a0d0f]">
              <div className="text-[10px] font-mono uppercase text-[#6b7479]">Material</div>
              <div className="font-mono text-lg text-[#c97b3f] mt-1">
                ${costPerKm.material.toFixed(2)}
              </div>
            </div>
            <div className="p-3 border border-[#252e33] bg-[#0a0d0f]">
              <div className="text-[10px] font-mono uppercase text-[#6b7479]">+ labor</div>
              <div className="font-mono text-lg text-[#7dd3fc] mt-1">
                ${costPerKm.labor.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-dashed border-[#252e33] flex justify-between items-baseline">
            <span className="font-mono text-[10px] uppercase text-[#6b7479]">Total braid cost</span>
            <span className="font-mono text-3xl text-[#c97b3f]">
              ${costPerKm.total.toFixed(2)}<span className="text-xs text-[#6b7479] ml-1">/km</span>
            </span>
          </div>
        </div>

        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-3">Cost saving tips</div>
          <div className="space-y-3 text-xs">
            {result.K > 95 && (
              <div className="p-2 bg-[#0a0d0f] border-l-2 border-[#fbbf24]">
                <div className="font-mono text-[10px] text-[#fbbf24] mb-1">⚠ Over-engineered</div>
                <div className="text-[#a7b0b6] leading-relaxed">
                  K = {result.K.toFixed(1)}% — can reduce PR or P to save material while keeping ≥90%.
                </div>
              </div>
            )}
            {material === 'SPC' && result.K < 95 && (
              <div className="p-2 bg-[#0a0d0f] border-l-2 border-[#5eead4]">
                <div className="font-mono text-[10px] text-[#5eead4] mb-1">💡 SPC overkill?</div>
                <div className="text-[#a7b0b6] leading-relaxed">
                  SPC is 1.85× cost. If frequency &lt; 1 GHz, plain Cu (BC) often works at half the price.
                </div>
              </div>
            )}
            {result.K < 65 && (
              <div className="p-2 bg-[#0a0d0f] border-l-2 border-[#f87171]">
                <div className="font-mono text-[10px] text-[#f87171] mb-1">✗ Below spec</div>
                <div className="text-[#a7b0b6] leading-relaxed">
                  K too low — increase PR or P first (cheaper than wider strand or more carriers).
                </div>
              </div>
            )}
            {optimalPR && optimalPR.PR !== PR && (
              <div className="p-2 bg-[#0a0d0f] border-l-2 border-[#c97b3f]">
                <div className="font-mono text-[10px] text-[#c97b3f] mb-1">★ Suggested PR</div>
                <div className="text-[#a7b0b6] leading-relaxed">
                  PR={optimalPR.PR} hits 90%+ at ${optimalPR.cost.toFixed(0)}/km
                  {optimalPR.cost < costPerKm.total && (
                    <span className="text-[#5eead4]"> · saves ${(costPerKm.total - optimalPR.cost).toFixed(0)}/km</span>
                  )}
                </div>
              </div>
            )}
            <div className="p-2 bg-[#0a0d0f] border-l-2 border-[#384249]">
              <div className="font-mono text-[10px] text-[#a7b0b6] mb-1">📈 5,000 km production</div>
              <div className="font-mono text-base text-[#fbbf24]">
                ${(costPerKm.total * 5).toFixed(0)}k <span className="text-[10px] text-[#6b7479]">braid cost</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Callout tone="amber" title="Why D_eff matters for twisted pair">
        Standard braid coverage formulas <strong>K = (2F − F²)·100%</strong> assume strands wrap a perfect cylinder. When braiding directly over a twisted pair (no foil/jacket between), the strand path follows the dumbbell-shaped boundary — actual circumference is <strong>~18% longer</strong> than π·(2·wireOD).
        Result: real braid angle α is steeper than calculated, fill factor F is lower, and K is overestimated by 5–12% if you naively plug D = 2·wireOD into the formula.
        Production fix: either braid over a foil tape first (turns the pair round → D_physical works), or use D_eff = perimeter/π in calculations as this calculator does.
      </Callout>

      <Callout tone="copper" title="Pigtail vs 360° termination">
        Coverage is only part — termination matters more at HF. A 25 mm pigtail is ≈16 Ω inductive at 100 MHz, raising Zt by orders of magnitude
        and rendering the shield nearly useless for Cat 8 / USB 3.2 / SpaceWire / 1553B. Must use EMC backshell, conductive gland, or compression ferrule.
      </Callout>

      <Callout tone="teal" title="Reading the Zt plot">
        Zt has 3 regions: <strong>LF flat</strong> (DC resistance dominates, &lt; ~100 kHz) → <strong>Zt min</strong> (skin effect reduces apparent R, ~1–5 MHz) → <strong>HF rising</strong> (leakage inductance ω·Lt dominates, &gt; 10 MHz).
        Lower DC resistance helps LF; smaller Lt (= higher coverage K, smaller braid holes) helps HF. Double-shielded cables (foil + braid) drop Zt by 2–3 orders of magnitude in the 20 kHz–20 MHz range.
      </Callout>
    </section>
  );
}

/* ============================================================
   Lab 03 — Attenuation Plotter
   ============================================================ */
function AttenPlot() {
  const presets = {
    cat6a: { name: 'Cat 6A — 23 AWG', d: 0.574, er: 1.55, tand: 0.00035 },
    cat8: { name: 'Cat 8 — 22 AWG', d: 0.643, er: 2.05, tand: 0.0007 },
    rg6: { name: 'RG6 — Foam PE', d: 1.024, er: 1.45, tand: 0.0002 },
    spw: { name: 'SpaceWire 26 AWG', d: 0.405, er: 2.05, tand: 0.0007 },
    custom: { name: 'Custom' },
  };
  const [preset, setPreset] = useState('cat6a');
  const [d, setD] = useState(0.574);
  const [er, setEr] = useState(1.55);
  const [tand, setTand] = useState(0.00035);

  const usePreset = (k) => {
    setPreset(k);
    if (k !== 'custom' && presets[k]) {
      setD(presets[k].d);
      setEr(presets[k].er);
      setTand(presets[k].tand);
    }
  };

  // Agent presets (section='atten'): { d, er, tand } for the conductor + dielectric.
  useEffect(() => {
    const onApply = (e) => {
      const { section, params } = e.detail || {};
      if (section !== 'atten' || !params) return;
      if (params.d != null) setD(parseFloat(params.d));
      if (params.er != null) setEr(parseFloat(params.er));
      if (params.tand != null) setTand(parseFloat(params.tand));
      setPreset('custom');
    };
    window.addEventListener('cable-suite:apply-preset', onApply);
    return () => window.removeEventListener('cable-suite:apply-preset', onApply);
  }, []);

  const handleParam = (setter) => (val) => {
    setter(val);
    setPreset('custom');
  };

  // Generate log-spaced data 1 MHz → 10 GHz
  const data = useMemo(() => {
    const arr = [];
    for (let logF = 0; logF <= 4; logF += 0.04) {
      const f_MHz = Math.pow(10, logF);
      const f_Hz = f_MHz * 1e6;

      // Skin depth in copper at f_MHz: δ (mm) = 0.066 / √f_MHz
      const delta_m = (0.066 / Math.sqrt(f_MHz)) * 1e-3;
      const sigma = 5.8e7; // copper conductivity S/m
      const d_m = d * 1e-3;
      // Series resistance per meter for 2 conductors (twisted pair / coax inner+outer simplified)
      const R = 2 / (sigma * delta_m * Math.PI * d_m);

      const Z0 = 100;
      // Skin / conductor attenuation in dB/m: α_c = R/(2·Z₀) · 8.686
      const alpha_c = (R / (2 * Z0)) * 8.686;

      // Dielectric attenuation: α_d (dB/m) = 27.3 · √εᵣ · tanδ · f / c
      const c_ = 3e8;
      const alpha_d = (27.3 * Math.sqrt(er) * tand * f_Hz) / c_;

      const total = alpha_c + alpha_d;
      arr.push({
        f: f_MHz,
        skin: parseFloat((alpha_c * 100).toFixed(3)),
        diel: parseFloat((alpha_d * 100).toFixed(3)),
        total: parseFloat((total * 100).toFixed(3)),
      });
    }
    return arr;
  }, [d, er, tand]);

  // Find crossover frequency (where skin ≈ dielectric)
  const crossover = useMemo(() => {
    for (let i = 0; i < data.length - 1; i++) {
      if (data[i].skin < data[i].diel && data[i + 1].skin >= data[i + 1].diel) {
        return data[i].f;
      }
      if (data[i].skin > data[i].diel && data[i + 1].skin <= data[i + 1].diel) {
        return data[i].f;
      }
    }
    return null;
  }, [data]);

  const at500 = data.find((p) => Math.abs(p.f - 500) < 30);
  const at1G = data.find((p) => Math.abs(p.f - 1000) < 50);
  const at2G = data.find((p) => Math.abs(p.f - 2000) < 100);

  return (
    <section className="mb-20">
      <SectionTitle
        tag="LAB 03 — ATTENUATION"
        title="Frequency-dependent loss plotter"
        subtitle="Skin loss (∝ √f) + Dielectric loss (∝ f) = total attenuation. Log-log scale — 1 MHz đến 10 GHz."
        icon={Zap}
      />

      {/* Preset selector */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
        {Object.entries(presets).map(([k, p]) => (
          <button
            key={k}
            onClick={() => usePreset(k)}
            className={`tappable p-3 border rounded-sm text-left ${
              preset === k
                ? 'border-[#5eead4] bg-[#0d1f1d]'
                : 'border-[#384249] bg-[#1d2329]'
            }`}
          >
            <div className={`text-xs font-mono ${preset === k ? 'text-[#5eead4]' : 'text-[#a7b0b6]'}`}>
              {p.name}
            </div>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-6">
        {/* Inputs */}
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">Cable parameters</div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase tracking-wider">Conductor Ø (mm)</label>
                <span className="font-mono text-[#fbbf24]">{d.toFixed(3)}</span>
              </div>
              <input
                type="range"
                min="0.15"
                max="2.0"
                step="0.005"
                value={d}
                onChange={(e) => handleParam(setD)(Number(e.target.value))}
                className="w-full accent-[#c97b3f]"
              />
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase tracking-wider">εᵣ — dielectric</label>
                <span className="font-mono text-[#fbbf24]">{er.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="1.40"
                max="2.50"
                step="0.01"
                value={er}
                onChange={(e) => handleParam(setEr)(Number(e.target.value))}
                className="w-full accent-[#c97b3f]"
              />
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase tracking-wider">tan δ × 10⁴</label>
                <span className="font-mono text-[#fbbf24]">{(tand * 10000).toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                step="0.5"
                value={tand * 10000}
                onChange={(e) => handleParam(setTand)(Number(e.target.value) / 10000)}
                className="w-full accent-[#c97b3f]"
              />
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-dashed border-[#252e33]">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-2">Loss components</div>
            <Formula>α_c = R/(2Z₀) · 8.686  ∝ √f / d</Formula>
            <Formula>α_d = 27.3·√εᵣ·tanδ·f/c</Formula>
          </div>

          {crossover && (
            <div className="mt-4 p-3 bg-[#0a0d0f] border border-[#fbbf24]">
              <div className="text-[10px] font-mono uppercase text-[#fbbf24]">Crossover</div>
              <div className="font-mono text-lg text-[#fbbf24] mt-1">
                {crossover < 1000 ? `${Math.round(crossover)} MHz` : `${(crossover / 1000).toFixed(2)} GHz`}
              </div>
              <div className="text-[10px] text-[#a7b0b6] mt-1">α_c = α_d</div>
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="md:col-span-2 p-6 border border-[#252e33] bg-[#12171a]">
          <div className="flex justify-between items-baseline mb-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f]">α(f) — dB / 100 m</div>
            <div className="text-[10px] font-mono text-[#6b7479]">log–log scale</div>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="2 2" stroke={C.border} />
              <XAxis
                dataKey="f"
                scale="log"
                domain={[1, 10000]}
                stroke={C.textMuted}
                tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                ticks={[1, 10, 100, 1000, 10000]}
                tickFormatter={(v) => (v >= 1000 ? `${v / 1000}G` : `${v}M`)}
                label={{ value: 'frequency', position: 'insideBottom', offset: -2, fill: C.textMuted, fontSize: 10 }}
              />
              <YAxis
                scale="log"
                domain={[0.1, 1000]}
                stroke={C.textMuted}
                tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickFormatter={(v) => v.toString()}
                ticks={[0.1, 1, 10, 100, 1000]}
                label={{ value: 'dB/100m', angle: -90, position: 'insideLeft', fill: C.textMuted, fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{ background: C.bg, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'JetBrains Mono' }}
                labelStyle={{ color: C.copperBright }}
                labelFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} GHz` : `${v.toFixed(1)} MHz`)}
                formatter={(v, n) => [`${v} dB/100m`, n]}
              />
              <Line type="monotone" dataKey="skin" stroke={C.copperBright} strokeWidth={1.5} dot={false} name="skin α_c" />
              <Line type="monotone" dataKey="diel" stroke={C.amber} strokeWidth={1.5} dot={false} name="dielectric α_d" />
              <Line type="monotone" dataKey="total" stroke={C.teal} strokeWidth={2.5} dot={false} name="total α" />
            </LineChart>
          </ResponsiveContainer>

          <div className="flex gap-4 justify-center mt-2 text-[10px] font-mono">
            <span className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-[#e89357]"></div>
              <span className="text-[#a7b0b6]">skin (∝√f)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-[#fbbf24]"></div>
              <span className="text-[#a7b0b6]">dielectric (∝f)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-[#5eead4]"></div>
              <span className="text-[#a7b0b6]">total</span>
            </span>
          </div>

          {/* Spot values */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-dashed border-[#252e33]">
            {[
              { f: '500 MHz', v: at500 },
              { f: '1 GHz', v: at1G },
              { f: '2 GHz', v: at2G },
            ].map((s, i) => (
              <div key={i} className="text-center border border-[#252e33] py-2">
                <div className="text-[10px] font-mono text-[#6b7479]">{s.f}</div>
                <div className="font-mono text-sm text-[#5eead4] mt-1">
                  {s.v ? `${s.v.total.toFixed(1)} dB/100m` : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Callout tone="amber" title="Crossover insight">
        Skin loss dominates at LF (the first few hundred MHz), dielectric loss dominates at HF. Crossover is at ~100 MHz – 1 GHz depending on cable.
        Cat 8 pushes to 2 GHz so dielectric loss is critical → must use FEP with tan δ &lt; 0.0007. Cat 6A at 500 MHz can use cheaper foam PE.
      </Callout>
    </section>
  );
}

/* ============================================================
   Lab 04 — NEXT Visualizer
   ============================================================ */
function NEXTBundleVis({ activePair, onSelect, couplings, lays }) {
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const jacketR = size * 0.43;
  const pairOffset = size * 0.22;
  const wireR = size * 0.05;

  const quads = [
    { x: cx, y: cy - pairOffset },
    { x: cx + pairOffset, y: cy },
    { x: cx, y: cy + pairOffset },
    { x: cx - pairOffset, y: cy },
  ];

  const couplingColor = (n) => {
    if (n < 28) return '#f87171';
    if (n < 38) return '#fbbf24';
    if (n < 48) return '#5eead4';
    return '#7dd3fc';
  };
  const couplingWidth = (n) => Math.max(0.5, 6 - (n - 22) / 7);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[400px]">
      <circle cx={cx} cy={cy} r={jacketR} fill={C.jacket} stroke={C.border} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={jacketR * 0.97} fill={C.bgCard} stroke="none" />

      {/* Coupling lines */}
      {quads.map((q, i) => {
        if (i === activePair) return null;
        const next = couplings[i];
        if (next == null) return null;
        const a = quads[activePair];
        return (
          <line
            key={`cpl-${i}`}
            x1={a.x} y1={a.y} x2={q.x} y2={q.y}
            stroke={couplingColor(next)}
            strokeWidth={couplingWidth(next)}
            strokeDasharray="4 3"
            opacity="0.7"
          />
        );
      })}

      {/* Active pair pulse */}
      <circle cx={quads[activePair].x} cy={quads[activePair].y} r={wireR * 2.5} fill="none" stroke={C.copperBright} strokeWidth="1.5">
        <animate attributeName="r" values={`${wireR * 1.8};${wireR * 4};${wireR * 1.8}`} dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0.05;0.7" dur="1.6s" repeatCount="indefinite" />
      </circle>

      {/* Pairs (clickable) */}
      {quads.map((q, i) => {
        const isActive = i === activePair;
        const w1x = q.x - wireR * 0.95;
        const w2x = q.x + wireR * 0.95;
        const fill = isActive ? C.copperBright : '#5a6166';
        return (
          <g key={i} onClick={() => onSelect(i)} className="interactive-zone" style={{ cursor: 'pointer' }}>
            <circle cx={q.x} cy={q.y} r={wireR * 2.4} fill="transparent" />
            <circle cx={w1x} cy={q.y} r={wireR} fill={fill} stroke={isActive ? C.copperDim : '#000'} strokeWidth="0.6" />
            <circle cx={w2x} cy={q.y} r={wireR} fill={fill} stroke={isActive ? C.copperDim : '#000'} strokeWidth="0.6" />
            <text
              x={q.x}
              y={q.y - wireR * 2 - 6}
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill={isActive ? C.copperBright : C.textDim}
              fontFamily="JetBrains Mono"
            >
              P{i + 1}
            </text>
            <text
              x={q.x}
              y={q.y + wireR * 2 + 12}
              textAnchor="middle"
              fontSize="8"
              fill={C.textMuted}
              fontFamily="JetBrains Mono"
            >
              L={lays[i]}mm
            </text>
            {!isActive && couplings[i] != null && (
              <text
                x={q.x + (cx - q.x) * 0.42}
                y={q.y + (cy - q.y) * 0.42 - 3}
                textAnchor="middle"
                fontSize="9"
                fill={couplingColor(couplings[i])}
                fontFamily="JetBrains Mono"
                fontWeight="600"
              >
                {couplings[i].toFixed(0)}dB
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const NEXT_LAY_VISUALS = {
  identical: {
    id: 'identical',
    label: 'Identical lay risk',
    image: '/cable-renders/lay-next-identical.png',
    tone: '#f87171',
    note: 'All pairs repeat in phase, so coupled energy accumulates instead of averaging out.',
  },
  slight: {
    id: 'slight',
    label: 'Slight variation',
    image: '/cable-renders/lay-next-slight.png',
    tone: '#fbbf24',
    note: 'Small lay offsets help, but close pitches still line up often enough to leave NEXT margin thin.',
  },
  varied: {
    id: 'varied',
    label: 'Staggered Cat 6A lay',
    image: '/cable-renders/lay-next-varied.png',
    tone: '#5eead4',
    note: 'Different lay lengths decorrelate the pair fields, raising worst-pair NEXT and PSNEXT.',
  },
  tight: {
    id: 'tight',
    label: 'Tight bundle / crush',
    image: '/cable-renders/lay-next-tight-bundle.png',
    tone: '#f87171',
    note: 'Bundle lay is too short or core is too compact, so pair spacing collapses and coupling rises.',
  },
};

function nextVisualForMode(mode) {
  if (mode === 'identical') return NEXT_LAY_VISUALS.identical;
  if (mode === 'slight') return NEXT_LAY_VISUALS.slight;
  return NEXT_LAY_VISUALS.varied;
}

function nextVisualForDesign(pairLays, bundleRatio, cov) {
  const minDelta = Math.min(...pairLays.flatMap((a, i) => pairLays.slice(i + 1).map((b) => Math.abs(a - b))));
  if (bundleRatio < 3.2) return NEXT_LAY_VISUALS.tight;
  if (minDelta === 0) return NEXT_LAY_VISUALS.identical;
  if (cov < 8 || minDelta <= 1) return NEXT_LAY_VISUALS.slight;
  return NEXT_LAY_VISUALS.varied;
}

function psnextFromCouplings(couplings) {
  const vals = couplings.filter((v) => typeof v === 'number');
  if (!vals.length) return null;
  return -10 * Math.log10(vals.reduce((a, b) => a + Math.pow(10, -b / 10), 0));
}

function LayNextBlenderPanel({ visual, lays, activePair = 0, couplings = [], contextLabel = 'NEXT lay visual' }) {
  const numericCouplings = couplings.filter((v) => typeof v === 'number');
  const worst = numericCouplings.length ? Math.min(...numericCouplings) : null;
  const psn = psnextFromCouplings(couplings);
  const deltas = lays.flatMap((a, i) => lays.slice(i + 1).map((b) => Math.abs(a - b)));
  const minDelta = deltas.length ? Math.min(...deltas) : 0;

  return (
    <div className="grid lg:grid-cols-[1.08fr_0.92fr] gap-6 mb-6">
      <div className="bg-[#12171a] border border-[#252e33] rounded overflow-hidden">
        <div className="relative aspect-video min-h-[280px] bg-[#0a0d0f]">
          <img
            data-testid="lay-next-blender-preview"
            src={visual.image}
            alt={`${visual.label} Blender NEXT preview`}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2 left-2 font-mono text-[10px] uppercase tracking-[0.2em] bg-[#0a0d0f]/75 border border-[#252e33] px-2 py-1" style={{ color: visual.tone }}>
            Blender lay / NEXT visual
          </div>
          <div className="absolute top-2 right-2 font-mono text-[10px] uppercase tracking-wider bg-[#0a0d0f]/75 border px-2 py-1" style={{ color: visual.tone, borderColor: visual.tone + '66' }}>
            {visual.label}
          </div>
          <div className="absolute bottom-2 left-2 right-2 grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              ['lay set', lays.join('/') + ' mm'],
              ['min dL', `${minDelta} mm`],
              ['worst NEXT', worst == null ? '—' : `${worst.toFixed(1)} dB`],
              ['PSNEXT', psn == null ? '—' : `${psn.toFixed(1)} dB`],
            ].map(([label, value]) => (
              <div key={label} className="bg-[#0a0d0f]/85 border border-[#252e33] rounded p-2">
                <div className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479]">{label}</div>
                <div className="font-mono text-[11px]" style={{ color: label === 'worst NEXT' && worst != null && worst < 38 ? '#fbbf24' : '#5eead4' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-3 border-t border-[#252e33]">
          <div className="grid sm:grid-cols-4 gap-2 mb-3">
            {Object.values(NEXT_LAY_VISUALS).map((item) => {
              const selected = item.id === visual.id;
              return (
                <div
                  key={item.id}
                  data-testid={`lay-next-visual-band-${item.id}`}
                  className={`border rounded px-2 py-1.5 ${selected ? 'bg-[#10201f]' : 'bg-[#0a0d0f]'}`}
                  style={{ borderColor: selected ? item.tone : C.border }}
                >
                  <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: selected ? item.tone : C.textDim }}>
                    {item.label}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: C.textDim }}>
            {visual.note} <span className="font-mono" style={{ color: C.amber }}>{contextLabel}</span>.
          </p>
        </div>
      </div>
      <LayPhaseMap lays={lays} activePair={activePair} couplings={couplings} />
    </div>
  );
}

function LayPhaseMap({ lays, activePair = 0, couplings = [] }) {
  const w = 420;
  const h = 220;
  const x0 = 68;
  const x1 = w - 26;
  const span = x1 - x0;
  const maxLay = Math.max(...lays, 1);
  const mmWindow = Math.max(56, maxLay * 4.4);
  const colorForPair = ['#3b82f6', '#f97316', '#16a34a', '#a16207'];

  return (
    <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: '#a78bfa' }}>
          Lay phase map
        </div>
        <div className="font-mono text-[10px]" style={{ color: C.textMuted }}>
          same vertical ticks = in phase
        </div>
      </div>
      <svg data-testid="lay-phase-map" viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }}>
        <rect width={w} height={h} fill="#06090b" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const x = x0 + span * t;
          return (
            <g key={t}>
              <line x1={x} y1="22" x2={x} y2={h - 18} stroke={C.border} strokeDasharray="2 4" />
              <text x={x} y="15" textAnchor="middle" fontSize="8" fill={C.textMuted} fontFamily="JetBrains Mono">{(mmWindow * t).toFixed(0)}mm</text>
            </g>
          );
        })}
        {lays.map((lay, i) => {
          const y = 44 + i * 38;
          const tickCount = Math.floor(mmWindow / lay) + 1;
          const isActive = i === activePair;
          const coupling = couplings[i];
          const color = isActive ? C.copperBright : colorForPair[i];
          return (
            <g key={i}>
              <text x="10" y={y + 4} fontSize="9" fill={isActive ? C.copperBright : C.textDim} fontFamily="JetBrains Mono">P{i + 1}</text>
              <line x1={x0} y1={y} x2={x1} y2={y} stroke={color} strokeOpacity="0.24" strokeWidth="8" strokeLinecap="round" />
              {Array.from({ length: tickCount }).map((_, tick) => {
                const x = x0 + (tick * lay / mmWindow) * span;
                return (
                  <line
                    key={tick}
                    x1={x}
                    y1={y - 11}
                    x2={x}
                    y2={y + 11}
                    stroke={color}
                    strokeWidth={isActive ? 2 : 1.2}
                    strokeOpacity={isActive ? 0.95 : 0.68}
                  />
                );
              })}
              <text x={x1} y={y + 4} textAnchor="end" fontSize="9" fill={typeof coupling === 'number' ? (coupling < 38 ? '#fbbf24' : '#5eead4') : C.textMuted} fontFamily="JetBrains Mono">
                {typeof coupling === 'number' ? `${coupling.toFixed(0)}dB` : `${lay}mm`}
              </text>
            </g>
          );
        })}
        <text x={x0} y={h - 6} fontSize="9" fill={C.textMuted} fontFamily="JetBrains Mono">window = {mmWindow.toFixed(0)} mm</text>
        <text x={x1} y={h - 6} textAnchor="end" fontSize="9" fill={C.textMuted} fontFamily="JetBrains Mono">active P{activePair + 1}</text>
      </svg>
      <div className="mt-2 text-[11px] leading-relaxed" style={{ color: C.textDim }}>
        Matching tick columns mean two pairs repeat their twist phase together. More stagger means fewer aligned columns, so pair-to-pair NEXT rises.
      </div>
    </div>
  );
}

function NEXTViz() {
  const [activePair, setActivePair] = useState(0);
  const [layMode, setLayMode] = useState('varied');

  // Agent presets (section='next'): { layMode: 'identical' | 'slight' | 'varied', activePair: 0..3 }.
  useEffect(() => {
    const onApply = (e) => {
      const { section, params } = e.detail || {};
      if (section !== 'next' || !params) return;
      if (params.layMode) setLayMode(params.layMode);
      if (Number.isInteger(params.activePair)) setActivePair(params.activePair);
    };
    window.addEventListener('cable-suite:apply-preset', onApply);
    return () => window.removeEventListener('cable-suite:apply-preset', onApply);
  }, []);

  const layTables = {
    identical: { name: 'Identical (worst case)', vals: [13, 13, 13, 13] },
    slight: { name: 'Slight variation', vals: [12, 13, 14, 15] },
    varied: { name: 'Cat 6A optimized', vals: [11, 13, 15, 17] },
  };
  const lays = layTables[layMode].vals;

  const computeNEXT = (victim, f_MHz) => {
    if (victim === activePair) return null;
    const dL = Math.abs(lays[victim] - lays[activePair]);
    const baseAt100 = 30 + dL * 4;
    const next = baseAt100 - 15 * Math.log10(f_MHz / 100);
    return Math.max(15, next);
  };

  const couplingsAt100 = [0, 1, 2, 3].map((i) => computeNEXT(i, 100));

  const sweep = useMemo(() => {
    const arr = [];
    for (let logF = 0; logF <= 3.3; logF += 0.04) {
      const f = Math.pow(10, logF);
      const others = [0, 1, 2, 3].filter((i) => i !== activePair).map((i) => computeNEXT(i, f));
      const psn = -10 * Math.log10(others.reduce((a, b) => a + Math.pow(10, -b / 10), 0));
      const worst = Math.min(...others);
      const cat5e = Math.max(0, 35.3 - 15 * Math.log10(f / 100));
      const cat6a = Math.max(0, 39.9 - 15 * Math.log10(f / 100));
      arr.push({ f: parseFloat(f.toFixed(2)), worst, psn, cat5e, cat6a });
    }
    return arr;
  }, [activePair, layMode]);

  const at100 = sweep.find((p) => Math.abs(p.f - 100) < 8);
  const at500 = sweep.find((p) => Math.abs(p.f - 500) < 25);
  const nextVisual = nextVisualForMode(layMode);

  return (
    <section className="mb-20">
      <SectionTitle
        tag="LAB 04 — NEXT VISUALIZER"
        title="Near-end crosstalk between pairs"
        subtitle="NEXT is coupling from a pair near the source onto other pairs. Click another pair to inject signal, change the lay set to see the impact."
        icon={Radio}
      />

      <div className="grid grid-cols-3 gap-2 mb-6">
        {Object.entries(layTables).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setLayMode(k)}
            className={`tappable p-3 border rounded-sm text-left ${
              layMode === k ? 'border-[#5eead4] bg-[#0d1f1d]' : 'border-[#384249] bg-[#1d2329]'
            }`}
          >
            <div className={`text-xs font-mono ${layMode === k ? 'text-[#5eead4]' : 'text-[#a7b0b6]'}`}>
              {v.name}
            </div>
            <div className="text-[10px] text-[#6b7479] mt-1 font-mono">{v.vals.join(' / ')} mm</div>
          </button>
        ))}
      </div>

      <LayNextBlenderPanel
        visual={nextVisual}
        lays={lays}
        activePair={activePair}
        couplings={couplingsAt100}
        contextLabel={layTables[layMode].name}
      />

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-3">
            Click any pair to inject signal
          </div>
          <div className="flex justify-center">
            <NEXTBundleVis
              activePair={activePair}
              onSelect={setActivePair}
              couplings={couplingsAt100}
              lays={lays}
            />
          </div>
          <div className="text-[10px] font-mono text-[#6b7479] text-center mt-2">
            P{activePair + 1} disturbing → others victim · @ 100 MHz
          </div>
        </div>

        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">
            Pair-to-pair NEXT @ 100 MHz
          </div>
          {couplingsAt100.map((c, i) =>
            i === activePair ? null : (
              <div key={i} className="flex justify-between items-baseline py-2 border-b border-dashed border-[#252e33]">
                <div>
                  <div className="text-sm text-[#f0ebe2]">P{activePair + 1} → P{i + 1}</div>
                  <div className="text-[10px] font-mono text-[#6b7479]">
                    ΔL = {Math.abs(lays[i] - lays[activePair])} mm
                  </div>
                </div>
                <div
                  className="font-mono text-lg"
                  style={{ color: c < 28 ? '#f87171' : c < 38 ? '#fbbf24' : c < 48 ? '#5eead4' : '#7dd3fc' }}
                >
                  {c.toFixed(1)} dB
                </div>
              </div>
            )
          )}

          <div className="mt-4 pt-4 border-t border-dashed border-[#252e33] space-y-1">
            <Spec label="PSNEXT @ 100 MHz" value={at100 ? at100.psn.toFixed(1) : '—'} unit="dB" />
            <Spec label="Worst NEXT @ 500 MHz" value={at500 ? at500.worst.toFixed(1) : '—'} unit="dB" />
            <Spec label="TIA Cat 6A @ 100 MHz" value="≥ 39.9" unit="dB" />
            <Spec label="TIA Cat 6A @ 500 MHz" value="≥ 26.1" unit="dB" />
          </div>
        </div>
      </div>

      <div className="p-6 border border-[#252e33] bg-[#12171a]">
        <div className="flex justify-between items-baseline mb-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f]">
            NEXT vs frequency · log scale
          </div>
          <div className="text-[10px] font-mono text-[#6b7479]">higher dB = better isolation</div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={sweep} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="2 2" stroke={C.border} />
            <XAxis
              dataKey="f"
              scale="log"
              type="number"
              domain={[1, 2000]}
              stroke={C.textMuted}
              tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
              ticks={[1, 10, 100, 1000]}
              tickFormatter={(v) => (v >= 1000 ? `${v / 1000}G` : `${v}M`)}
              label={{ value: 'frequency', position: 'insideBottom', offset: -2, fill: C.textMuted, fontSize: 10 }}
            />
            <YAxis
              domain={[0, 70]}
              stroke={C.textMuted}
              tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
              label={{ value: 'NEXT (dB)', angle: -90, position: 'insideLeft', fill: C.textMuted, fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{ background: C.bg, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'JetBrains Mono' }}
              labelStyle={{ color: C.copperBright }}
              labelFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} GHz` : `${v.toFixed(1)} MHz`)}
              formatter={(v, n) => [`${typeof v === 'number' ? v.toFixed(1) : v} dB`, n]}
            />
            <Line type="monotone" dataKey="worst" stroke={C.teal} strokeWidth={2.5} dot={false} name="Worst NEXT" />
            <Line type="monotone" dataKey="psn" stroke={C.copperBright} strokeWidth={1.5} dot={false} name="PSNEXT" />
            <Line type="monotone" dataKey="cat5e" stroke={C.amber} strokeWidth={1} strokeDasharray="4 4" dot={false} name="Cat 5e limit" />
            <Line type="monotone" dataKey="cat6a" stroke="#a78bfa" strokeWidth={1} strokeDasharray="4 4" dot={false} name="Cat 6A limit" />
          </LineChart>
        </ResponsiveContainer>

        <div className="flex flex-wrap gap-4 justify-center mt-3 text-[10px] font-mono">
          <span className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#5eead4]"></div><span className="text-[#a7b0b6]">Worst</span></span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#e89357]"></div><span className="text-[#a7b0b6]">PSNEXT</span></span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#fbbf24] opacity-70"></div><span className="text-[#a7b0b6]">Cat 5e</span></span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#a78bfa] opacity-70"></div><span className="text-[#a7b0b6]">Cat 6A</span></span>
        </div>
      </div>

      <Callout tone="copper" title="Why varied lays?">
        When 2 pairs share the same lay length, their twists are in phase → coupling accumulates instead of cancelling. Cat 6A uses lay set 11/13/15/17 mm
        so no two pairs are synchronous. This is the main reason Cat 6A NEXT is much better than Cat 5e even though conductor and dielectric are nearly identical.
      </Callout>
    </section>
  );
}

/* ============================================================
   Lab 05 — Eye Diagram Simulator
   ============================================================ */
function EyeDiagram() {
  const [bitRate, setBitRate] = useState(5);
  const [cableBW, setCableBW] = useState(3);
  const [jitter, setJitter] = useState(15);
  const [noise, setNoise] = useState(20);

  // Agent presets (section='eye'): { bitRate, cableBW, jitter, noise } in their respective units.
  useEffect(() => {
    const onApply = (e) => {
      const { section, params } = e.detail || {};
      if (section !== 'eye' || !params) return;
      if (params.bitRate != null) setBitRate(parseFloat(params.bitRate));
      if (params.cableBW != null) setCableBW(parseFloat(params.cableBW));
      if (params.jitter != null) setJitter(parseFloat(params.jitter));
      if (params.noise != null) setNoise(parseFloat(params.noise));
    };
    window.addEventListener('cable-suite:apply-preset', onApply);
    return () => window.removeEventListener('cable-suite:apply-preset', onApply);
  }, []);

  const T_bit = 1000 / bitRate; // ps
  const tau = 1000 / (2 * Math.PI * cableBW); // ps
  const tMax = 2 * T_bit;

  // Generate eye traces (random bit patterns through low-pass channel)
  const traces = useMemo(() => {
    const TRACES = 60;
    const POINTS = 80;
    const all = [];
    for (let t = 0; t < TRACES; t++) {
      const bits = Array(5).fill(0).map(() => (Math.random() > 0.5 ? 1 : 0));
      const points = [];
      let v = bits[0];
      for (let i = 0; i < bits.length * POINTS; i++) {
        const dt = T_bit / POINTS;
        const target = bits[Math.floor(i / POINTS)];
        v = v + (target - v) * (1 - Math.exp(-dt / tau));
        points.push(v + (Math.random() - 0.5) * 2 * (noise / 1000));
      }
      const jitterShift = (Math.random() - 0.5) * 2 * jitter;
      const visible = [];
      for (let i = 1.5 * POINTS; i < 3.5 * POINTS; i++) {
        const x = (i - 1.5 * POINTS) * (T_bit / POINTS) + jitterShift;
        visible.push({ x, y: points[i] || 0 });
      }
      all.push(visible);
    }
    return all;
  }, [bitRate, cableBW, jitter, noise]);

  const W = 480;
  const H = 220;
  const yMax = 1.25;
  const yMin = -0.25;

  const tracePaths = traces.map((tr) =>
    'M ' + tr.map((p) => {
      const px = (p.x / tMax) * W;
      const py = H - ((p.y - yMin) / (yMax - yMin)) * H;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    }).join(' L ')
  );

  // Analytical eye metrics
  const eyeHeight_mV = useMemo(() => {
    const swing = 1000;
    const isi = Math.max(0, 1 - 2 * Math.exp(-T_bit / tau));
    return Math.max(0, swing * isi - 2 * noise);
  }, [T_bit, tau, noise]);
  const eyeWidth_ps = Math.max(0, T_bit - 6 * jitter);
  const passing = eyeHeight_mV > 200 && eyeWidth_ps > T_bit * 0.4;

  const sliders = [
    { label: 'Bit rate (Gbps)', val: bitRate, set: setBitRate, min: 1, max: 25, step: 0.5, fmt: (v) => v.toFixed(1) },
    { label: 'Cable BW (GHz)', val: cableBW, set: setCableBW, min: 0.5, max: 15, step: 0.5, fmt: (v) => v.toFixed(1) },
    { label: 'Jitter RMS (ps)', val: jitter, set: setJitter, min: 1, max: 60, step: 1, fmt: (v) => v.toFixed(0) },
    { label: 'Noise RMS (mV)', val: noise, set: setNoise, min: 0, max: 100, step: 2, fmt: (v) => v.toFixed(0) },
  ];

  return (
    <section className="mb-20">
      <SectionTitle
        tag="LAB 05 — EYE DIAGRAM"
        title="Eye diagram simulator"
        subtitle="60 random bit patterns run through a channel with ISI + jitter + noise. Closed eye = data error."
        icon={Eye}
      />

      <div className="grid md:grid-cols-3 gap-6 mb-6">
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">Channel parameters</div>

          {sliders.map((s, i) => (
            <div key={i} className="mb-4">
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase tracking-wider">{s.label}</label>
                <span className="font-mono text-[#fbbf24]">{s.fmt(s.val)}</span>
              </div>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={s.val}
                onChange={(e) => s.set(Number(e.target.value))}
                className="w-full accent-[#c97b3f]"
              />
            </div>
          ))}

          <div className="mt-4 pt-4 border-t border-dashed border-[#252e33] space-y-1">
            <Spec label="T_bit (UI)" value={T_bit.toFixed(1)} unit="ps" />
            <Spec label="τ (RC time)" value={tau.toFixed(1)} unit="ps" />
            <Spec label="T_bit / τ" value={(T_bit / tau).toFixed(2)} />
          </div>

          <div className="mt-4 pt-4 border-t border-dashed border-[#252e33]">
            <button
              onClick={() => { setBitRate(bitRate); setNoise(noise); }}
              className="tappable w-full text-xs font-mono uppercase tracking-wider text-[#a7b0b6] hover:text-[#c97b3f] border border-[#384249] py-2"
            >
              ↻ Reroll bit pattern
            </button>
          </div>
        </div>

        <div className="md:col-span-2 p-6 border border-[#252e33] bg-[#12171a]">
          <div className="flex justify-between items-baseline mb-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f]">
              Eye diagram · 2 unit intervals
            </div>
            <div className={`font-mono text-xs ${passing ? 'text-[#5eead4]' : 'text-[#f87171]'}`}>
              {passing ? '✓ open eye' : '✗ closed eye'}
            </div>
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-[#0a0d0f] border border-[#252e33]">
            <defs>
              <pattern id="eye-grid" width="40" height="20" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 20" fill="none" stroke={C.border} strokeWidth="0.4" opacity="0.4" />
              </pattern>
              <clipPath id="eye-clip">
                <rect width={W} height={H} />
              </clipPath>
            </defs>
            <rect width={W} height={H} fill="url(#eye-grid)" />

            {/* UI markers */}
            <line x1={0} y1={H * 0.5} x2={W} y2={H * 0.5} stroke={C.copperDim} strokeDasharray="3 5" opacity="0.6" />
            <line x1={W * 0.5} y1={0} x2={W * 0.5} y2={H} stroke={C.borderHi} strokeDasharray="2 4" opacity="0.5" />
            <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="9" fill={C.copperBright} fontFamily="JetBrains Mono">eye center</text>

            {/* Traces (clipped) */}
            <g clipPath="url(#eye-clip)">
              {tracePaths.map((d, i) => (
                <path key={i} d={d} stroke={passing ? C.teal : C.amber} strokeWidth="0.7" fill="none" opacity="0.28" />
              ))}
            </g>

            <text x={5} y={12} fontSize="9" fill={C.textMuted} fontFamily="JetBrains Mono">1.0 V</text>
            <text x={5} y={H * 0.5 - 4} fontSize="9" fill={C.textMuted} fontFamily="JetBrains Mono">0.5 V</text>
            <text x={5} y={H - 4} fontSize="9" fill={C.textMuted} fontFamily="JetBrains Mono">0.0 V</text>
          </svg>

          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="border border-[#252e33] p-3 text-center bg-[#0a0d0f]">
              <div className="text-[10px] font-mono uppercase text-[#6b7479]">Eye height</div>
              <div className="font-mono text-2xl mt-1" style={{ color: eyeHeight_mV > 200 ? C.teal : '#f87171' }}>
                {eyeHeight_mV.toFixed(0)}<span className="text-xs"> mV</span>
              </div>
              <div className="text-[10px] font-mono text-[#6b7479] mt-0.5">target ≥ 200 mV</div>
            </div>
            <div className="border border-[#252e33] p-3 text-center bg-[#0a0d0f]">
              <div className="text-[10px] font-mono uppercase text-[#6b7479]">Eye width</div>
              <div className="font-mono text-2xl mt-1" style={{ color: eyeWidth_ps > T_bit * 0.4 ? C.teal : '#f87171' }}>
                {eyeWidth_ps.toFixed(0)}<span className="text-xs"> ps</span>
              </div>
              <div className="text-[10px] font-mono text-[#6b7479] mt-0.5">target ≥ {(T_bit * 0.4).toFixed(0)} ps</div>
            </div>
            <div className="border border-[#252e33] p-3 text-center bg-[#0a0d0f]">
              <div className="text-[10px] font-mono uppercase text-[#6b7479]">UI margin</div>
              <div className="font-mono text-2xl mt-1" style={{ color: eyeWidth_ps / T_bit > 0.4 ? C.teal : '#f87171' }}>
                {((eyeWidth_ps / T_bit) * 100).toFixed(0)}<span className="text-xs"> %</span>
              </div>
              <div className="text-[10px] font-mono text-[#6b7479] mt-0.5">target ≥ 40%</div>
            </div>
          </div>
        </div>
      </div>

      <Callout tone="amber" title="ISI · jitter · noise — 3 killers">
        The eye closes from 3 causes: <strong>ISI</strong> (low T_bit/τ → bit hasn't settled before the next arrives) closes vertically.
        <strong> Jitter</strong> closes horizontally. <strong>Noise</strong> subtracts directly from eye height.
        Equalization (FFE/DFE) fights ISI, CDR + clock cleanup handles most jitter, but the noise floor is physics — you can't recover from it.
      </Callout>
    </section>
  );
}

/* ============================================================
   Lab 06 — Cost & Yield Calculator
   ============================================================ */
function CostCalc() {
  const cableTypes = {
    cat6a: { name: 'Cat 6A 4-pair', awg: 23, conductors: 8, dielMaterial: 'Foam PE', dielMassPerM: 12, jacketMass: 28, shieldMass: 4 },
    cat8: { name: 'Cat 8 S/FTP', awg: 22, conductors: 8, dielMaterial: 'FEP', dielMassPerM: 18, jacketMass: 32, shieldMass: 14 },
    usb32: { name: 'USB 3.2 Gen 2x2', awg: 28, conductors: 6, dielMaterial: 'Foam FEP', dielMassPerM: 5, jacketMass: 14, shieldMass: 6 },
    spw: { name: 'SpaceWire MIL', awg: 26, conductors: 8, dielMaterial: 'PFA', dielMassPerM: 9, jacketMass: 22, shieldMass: 18 },
    starquad: { name: 'Star Quad 24', awg: 24, conductors: 4, dielMaterial: 'FEP', dielMassPerM: 7, jacketMass: 18, shieldMass: 9 },
  };

  const [cable, setCable] = useState('cat6a');
  const [length, setLength] = useState(1000);
  const [cuPrice, setCuPrice] = useState(9.5);
  const [cpk, setCpk] = useState(1.33);
  const [lineSpeed, setLineSpeed] = useState(120);

  // Agent presets (section='cost'): { cable, length_m, cu_price_usd_kg, cpk, line_speed_m_min }.
  useEffect(() => {
    const onApply = (e) => {
      const { section, params } = e.detail || {};
      if (section !== 'cost' || !params) return;
      if (params.cable && cableTypes[params.cable]) setCable(params.cable);
      if (params.length_m != null) setLength(parseFloat(params.length_m));
      if (params.cu_price_usd_kg != null) setCuPrice(parseFloat(params.cu_price_usd_kg));
      if (params.cpk != null) setCpk(parseFloat(params.cpk));
      if (params.line_speed_m_min != null) setLineSpeed(parseFloat(params.line_speed_m_min));
    };
    window.addEventListener('cable-suite:apply-preset', onApply);
    return () => window.removeEventListener('cable-suite:apply-preset', onApply);
  }, []);

  const awgToMM = (awg) => 0.005 * Math.pow(92, (36 - awg) / 39) * 25.4;
  const cuMassPerMeter = (awg, n) => {
    const d_mm = awgToMM(awg);
    const area_mm2 = Math.PI * (d_mm / 2) ** 2;
    const volume_cm3_per_m = (area_mm2 * 1000) / 1000;
    const mass_g_per_m = volume_cm3_per_m * 8.96;
    return (mass_g_per_m * n) / 1000;
  };

  // erf approximation (Abramowitz-Stegun)
  const erf = (x) => {
    const sign = Math.sign(x);
    const ax = Math.abs(x);
    const a = 0.3275911;
    const t = 1 / (1 + a * ax);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
    return sign * y;
  };
  const normalCDF = (z) => 0.5 * (1 + erf(z / Math.sqrt(2)));
  const cpkToYield = (k) => 1 - 2 * (1 - normalCDF(3 * k));

  const result = useMemo(() => {
    const c = cableTypes[cable];

    const cuMass = cuMassPerMeter(c.awg, c.conductors) * length;
    const cuCost = cuMass * cuPrice;

    const dielPrice = c.dielMaterial.includes('FEP') || c.dielMaterial.includes('PFA') ? 45 : 4;
    const dielMass = (c.dielMassPerM * length) / 1000;
    const dielCost = dielMass * dielPrice;

    const shieldMass = (c.shieldMass * length) / 1000;
    const shieldCost = shieldMass * 12;

    const jacketMass = (c.jacketMass * length) / 1000;
    const jacketPrice = c.dielMaterial.includes('PFA') ? 50 : 6;
    const jacketCost = jacketMass * jacketPrice;

    const productionHours = length / lineSpeed / 60;
    const laborCost = productionHours * 50;

    const subTotal = cuCost + dielCost + shieldCost + jacketCost + laborCost;
    const overhead = subTotal * 0.25;
    const totalCost = subTotal + overhead;
    const costPerM = totalCost / length;

    const yieldRate = cpkToYield(cpk);
    const goodMeters = length * yieldRate;
    const costPerGoodM = totalCost / goodMeters;
    const ppmDefect = (1 - yieldRate) * 1e6;

    const annualLength_km = (5000 * lineSpeed * 60) / 1000;

    const items = [
      { name: 'Copper conductor', cost: cuCost, color: C.copperBright },
      { name: c.dielMaterial + ' dielectric', cost: dielCost, color: '#fbbf24' },
      { name: 'Shield (foil + braid)', cost: shieldCost, color: C.shield },
      { name: 'Jacket', cost: jacketCost, color: '#a78bfa' },
      { name: 'Labor', cost: laborCost, color: '#7dd3fc' },
      { name: 'Overhead (25%)', cost: overhead, color: '#6b7479' },
    ];

    return {
      items, totalCost, costPerM, yieldRate, goodMeters, costPerGoodM, ppmDefect,
      annualLength_km, productionHours, cuMass,
    };
  }, [cable, length, cuPrice, cpk, lineSpeed]);

  return (
    <section className="mb-20">
      <SectionTitle
        tag="LAB 06 — COST & YIELD"
        title="Manufacturing economics"
        subtitle="Cost-per-meter và yield-adjusted cost từ cable type, Cu price, Cpk, và line speed. Cu thường chiếm 30–60% material cost."
        icon={Coins}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
        {Object.entries(cableTypes).map(([k, c]) => (
          <button
            key={k}
            onClick={() => setCable(k)}
            className={`tappable p-3 border rounded-sm text-left ${
              cable === k ? 'border-[#c97b3f] bg-[#3d2a1c]' : 'border-[#384249] bg-[#1d2329]'
            }`}
          >
            <div className={`text-xs font-mono ${cable === k ? 'text-[#fbbf24]' : 'text-[#a7b0b6]'}`}>
              {c.name}
            </div>
            <div className="text-[10px] font-mono text-[#6b7479] mt-1">
              {c.awg} AWG · {c.conductors} cond
            </div>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-6">
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">Production parameters</div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase">Length (m)</label>
                <span className="font-mono text-[#fbbf24]">{length.toLocaleString()}</span>
              </div>
              <input type="range" min="100" max="50000" step="100" value={length} onChange={(e) => setLength(Number(e.target.value))} className="w-full accent-[#c97b3f]" />
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase">Cu price ($/kg)</label>
                <span className="font-mono text-[#fbbf24]">${cuPrice.toFixed(2)}</span>
              </div>
              <input type="range" min="6" max="15" step="0.1" value={cuPrice} onChange={(e) => setCuPrice(Number(e.target.value))} className="w-full accent-[#c97b3f]" />
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase">Cpk target</label>
                <span className="font-mono text-[#fbbf24]">{cpk.toFixed(2)}</span>
              </div>
              <input type="range" min="0.67" max="2.0" step="0.01" value={cpk} onChange={(e) => setCpk(Number(e.target.value))} className="w-full accent-[#c97b3f]" />
              <div className="grid grid-cols-3 gap-1 mt-2 text-[10px]">
                <button onClick={() => setCpk(1.0)} className="tappable font-mono text-[#5eead4] border border-[#252e33] py-1">1.00 (3σ)</button>
                <button onClick={() => setCpk(1.33)} className="tappable font-mono text-[#5eead4] border border-[#252e33] py-1">1.33</button>
                <button onClick={() => setCpk(1.67)} className="tappable font-mono text-[#5eead4] border border-[#252e33] py-1">1.67 (5σ)</button>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase">Line speed (m/min)</label>
                <span className="font-mono text-[#fbbf24]">{lineSpeed}</span>
              </div>
              <input type="range" min="20" max="500" step="10" value={lineSpeed} onChange={(e) => setLineSpeed(Number(e.target.value))} className="w-full accent-[#c97b3f]" />
            </div>
          </div>
        </div>

        <div className="md:col-span-2 p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">Cost breakdown</div>

          <div className="space-y-3">
            {result.items.map((item, i) => {
              const pct = (item.cost / result.totalCost) * 100;
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#a7b0b6]">{item.name}</span>
                    <span className="font-mono">
                      <span className="text-[#f0ebe2]">${item.cost.toFixed(2)}</span>
                      <span className="text-[#6b7479] ml-2">({pct.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="h-2.5 bg-[#0a0d0f] border border-[#252e33] overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: item.color, opacity: 0.85 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-dashed border-[#252e33]">
            <div className="text-center p-4 bg-[#0a0d0f] border border-[#252e33]">
              <div className="text-[10px] font-mono uppercase text-[#6b7479]">Total cost</div>
              <div className="font-mono text-3xl text-[#f0ebe2] mt-1">${result.totalCost.toFixed(0)}</div>
              <div className="text-[10px] font-mono text-[#6b7479] mt-1">{length.toLocaleString()} m order</div>
            </div>
            <div className="text-center p-4 bg-[#0a0d0f] border border-[#5eead4]">
              <div className="text-[10px] font-mono uppercase text-[#5eead4]">Cost / good meter</div>
              <div className="font-mono text-3xl text-[#5eead4] mt-1">${result.costPerGoodM.toFixed(3)}</div>
              <div className="text-[10px] font-mono text-[#6b7479] mt-1">yield-adjusted</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="p-5 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-3">Process yield</div>
          <div className="font-mono text-3xl text-[#5eead4]">
            {(result.yieldRate * 100).toFixed(result.yieldRate > 0.999 ? 4 : 2)}<span className="text-base">%</span>
          </div>
          <div className="text-xs text-[#a7b0b6] mt-2">
            <span className="font-mono text-[#fbbf24]">{result.ppmDefect.toFixed(result.ppmDefect < 10 ? 2 : 0)}</span> ppm defective
          </div>
          <div className="text-[10px] font-mono text-[#6b7479] mt-1">
            Cpk = {cpk.toFixed(2)} → {(3 * cpk).toFixed(1)}σ process
          </div>
          <div className="mt-3 pt-3 border-t border-dashed border-[#252e33] text-[10px] font-mono text-[#a7b0b6] space-y-0.5">
            <div className="flex justify-between"><span>Cpk 1.00</span><span>2700 ppm</span></div>
            <div className="flex justify-between"><span>Cpk 1.33</span><span>63 ppm</span></div>
            <div className="flex justify-between"><span>Cpk 1.67</span><span>0.6 ppm</span></div>
            <div className="flex justify-between"><span>Cpk 2.00</span><span>2 ppb</span></div>
          </div>
        </div>

        <div className="p-5 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-3">Production time</div>
          <div className="font-mono text-3xl text-[#fbbf24]">
            {result.productionHours.toFixed(2)}<span className="text-base"> hr</span>
          </div>
          <div className="text-xs text-[#a7b0b6] mt-2">
            for {length.toLocaleString()} m at {lineSpeed} m/min
          </div>
          <div className="mt-3 pt-3 border-t border-dashed border-[#252e33]">
            <Spec label="Cu mass" value={result.cuMass.toFixed(2)} unit="kg" />
            <Spec label="Cu cost" value={`$${(result.cuMass * cuPrice).toFixed(2)}`} mono={true} />
            <Spec label="Good output" value={result.goodMeters.toFixed(0)} unit="m" />
          </div>
        </div>

        <div className="p-5 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-3">Annual capacity</div>
          <div className="font-mono text-3xl text-[#7dd3fc]">
            {result.annualLength_km.toFixed(0)}<span className="text-base"> km/yr</span>
          </div>
          <div className="text-xs text-[#a7b0b6] mt-2">
            5000 hr/yr · 2-shift operation
          </div>
          <div className="mt-3 pt-3 border-t border-dashed border-[#252e33]">
            <Spec label="Cost / m (raw)" value={`$${result.costPerM.toFixed(3)}`} mono={true} />
            <Spec label="Cost / good m" value={`$${result.costPerGoodM.toFixed(3)}`} mono={true} />
          </div>
        </div>
      </div>

      <Callout tone="copper" title="Cu price sensitivity">
        Copper typically accounts for 30–60% of material cost in data cable. A Cu price jump from $9 → $13/kg pushes total cost up 15–25%.
        Premium cable (Cat 8, MIL) is less sensitive because FEP/PFA dielectric takes a larger share. Hedging Cu futures is common practice in the wire industry.
      </Callout>
    </section>
  );
}

/* ============================================================
   Additional SVG cross-sections for library
   ============================================================ */
function CoaxXS({ size = 100, label = false }) {
  const cx = size / 2, cy = size / 2;
  const jacketR = size * 0.45;
  const braidR = size * 0.40;
  const foilR = size * 0.34;
  const dielR = size * 0.32;
  const condR = size * 0.10;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[120px]">
      <circle cx={cx} cy={cy} r={jacketR} fill={C.jacket} stroke={C.border} strokeWidth="1" />
      <circle cx={cx} cy={cy} r={braidR} fill="#8b8478" opacity="0.7" />
      <circle cx={cx} cy={cy} r={foilR} fill={C.shield} opacity="0.85" />
      <circle cx={cx} cy={cy} r={dielR} fill={C.fep} stroke={C.copper} strokeWidth="0.4" opacity="0.95" />
      <circle cx={cx} cy={cy} r={condR} fill={C.copper} stroke={C.copperDim} strokeWidth="0.5" />
    </svg>
  );
}

function TwinaxXS({ size = 100 }) {
  const cx = size / 2, cy = size / 2;
  const jacketW = size * 0.86, jacketH = size * 0.5;
  const condR = size * 0.085;
  const insR = size * 0.15;
  const off = size * 0.18;
  const jx = (size - jacketW) / 2;
  const jy = (size - jacketH) / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[120px]">
      <rect x={jx} y={jy} width={jacketW} height={jacketH} rx={jacketH / 2} fill={C.jacket} stroke={C.border} strokeWidth="1" />
      <rect x={jx + 3} y={jy + 3} width={jacketW - 6} height={jacketH - 6} rx={(jacketH - 6) / 2} fill="none" stroke={C.shield} strokeWidth="0.7" strokeDasharray="2 1" opacity="0.7" />
      <circle cx={cx - off} cy={cy} r={insR} fill={C.fep} stroke={C.border} strokeWidth="0.4" />
      <circle cx={cx + off} cy={cy} r={insR} fill={C.fep} stroke={C.border} strokeWidth="0.4" />
      <circle cx={cx - off} cy={cy} r={condR} fill={C.copper} stroke={C.copperDim} strokeWidth="0.4" />
      <circle cx={cx + off} cy={cy} r={condR} fill={C.copper} stroke={C.copperDim} strokeWidth="0.4" />
    </svg>
  );
}

function MultiCondXS({ size = 100 }) {
  const cx = size / 2, cy = size / 2;
  const jacketR = size * 0.45;
  const condR = size * 0.095;
  const ringR = size * 0.24;
  const colors = ['#ef4444', '#3b82f6', '#16a34a', '#fbbf24', '#a78bfa', '#f97316', '#ec4899'];
  const conductors = [{ x: cx, y: cy, color: '#9ca3af' }];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 2;
    conductors.push({
      x: cx + ringR * Math.cos(a),
      y: cy + ringR * Math.sin(a),
      color: colors[i],
    });
  }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[120px]">
      <circle cx={cx} cy={cy} r={jacketR} fill={C.jacket} stroke={C.border} strokeWidth="1" />
      {conductors.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={condR} fill={c.color} stroke="#000" strokeWidth="0.4" />
          <circle cx={c.x} cy={c.y} r={condR * 0.45} fill={C.copper} />
        </g>
      ))}
    </svg>
  );
}

function CableTypeIcon({ type, size = 90 }) {
  if (type === 'coax') return <CoaxXS size={size} />;
  if (type === 'twinax') return <TwinaxXS size={size} />;
  if (type === 'starquad') return <StarQuadXS size={size} />;
  if (type === '4pair') return <FourPairBundle size={size} withSpline={false} label={false} />;
  if (type === 'multicond') return <MultiCondXS size={size} />;
  return <SingleWireXS size={size} label={false} />;
}

/* ============================================================
   Build recipe — generates BOM + process from product specs
   ============================================================ */
function buildRecipe(p) {
  const blob = (p.hl || '') + ' ' + (p.name || '') + ' ' + (p.app || '') + ' ' + (p.std || '') + ' ' + (p.pn || '');
  const isShielded = /shield|s\/ftp|f\/utp|s\/utp|sftp|foil|braid|screened/i.test(blob);
  const isSFTP    = /s\/ftp|sftp|s-ftp/i.test(blob);
  const isFTP     = /f\/utp|fftp|ftp|f-utp/i.test(blob);
  const isUFTP    = /u\/ftp|uftp|per-?pair foil|individual.{0,5}foil/i.test(blob);
  // Per-pair foil = each pair gets its OWN foil shield (S/FTP, U/FTP, USB4 etc.)
  const hasPairFoil  = isSFTP || isUFTP || /usb4|usb 3\.|thunderbolt|tb[34]|hdmi|displayport/i.test(blob);
  // Per-pair binder/wrap (PTFE tape or polyester) — required for high-temp / fluoropolymer or before pair foil
  const hasPairWrap  = hasPairFoil || /PTFE|FEP|PFA|aerospace|MIL|space/i.test(blob);
  const hasOuterFoil = isFTP || isShielded;
  const hasOuterBraid = /braid|s\/ftp|sftp/i.test(blob);
  const isFEP = /FEP|PFA|PTFE|aerospace|space|MIL/i.test(p.app + p.std + p.hl);
  const isFoam = /foam/i.test(p.hl + p.name);
  const conductorMaterial = /SPC|silver/i.test(p.awg + p.hl) ? 'Silver-plated copper (SPC), ASTM B298 Class A'
    : /BCCAl/.test(p.awg) ? 'Bare copper-clad aluminum'
    : /TC|tinned/i.test(p.awg + p.hl) ? 'Tinned copper, ASTM B33'
    : 'Bare ETP copper, ASTM B3';
  const dielectric = isFEP ? 'FEP fluoropolymer (εᵣ≈2.05, tan δ <0.0007)'
    : isFoam ? 'Foamed HDPE / FFEP (εᵣ≈1.5, gas-injected N₂)'
    : 'Solid HDPE (εᵣ≈2.30)';
  const jacket = /LSZH|halogen-free/i.test(p.hl) ? 'LSZH polyolefin (IEC 60332-3)'
    : isFEP ? 'FEP plenum jacket (NFPA 262, CMP-rated)'
    : /PUR|polyurethane/i.test(p.hl) ? 'Polyurethane (PUR) — drag-chain rated'
    : /CMP|plenum/i.test(p.app + p.hl) ? 'PVC-LS (CMP plenum, NFPA 262)'
    : 'PVC FR (UL VW-1, CMR-rated)';

  // BOM
  const bom = [];
  bom.push({ stage: 'Conductor', material: conductorMaterial, qty: p.awg, role: 'Signal carrier' });
  bom.push({ stage: 'Dielectric', material: dielectric, qty: 'extruded', role: 'Sets Z₀ via εᵣ' });
  if (p.type === '4pair' || p.type === 'starquad' || p.type === 'twinax') {
    bom.push({ stage: 'Color compound', material: 'PE/FEP masterbatch (4–8 colors)', qty: 'per-pair coding', role: 'Pair identification' });
  }
  if (hasPairWrap) {
    bom.push({ stage: 'Pair binder wrap', material: hasPairFoil ? 'Polyester (Mylar) tape, 12 µm' : 'PTFE tape, 25-50 µm', qty: 'helical wrap, 25% overlap, per pair', role: 'Holds twist + interface to foil' });
  }
  if (hasPairFoil) {
    bom.push({ stage: 'Per-pair foil', material: 'Al/PET tape, 25 µm Al + 12 µm PET, foil-side-in', qty: 'longitudinal wrap, per pair', role: 'Pair-level HF shield (S/FTP / U/FTP / USB4 etc.)' });
    bom.push({ stage: 'Pair drain wire', material: '28-30 AWG tinned copper, per pair', qty: '1 strand × pair count', role: 'Per-pair foil ground continuity' });
  }
  if (hasOuterFoil) {
    bom.push({ stage: 'Outer foil shield', material: 'Aluminum-polyester (Al/PET) tape, 25 µm Al + 12 µm PET', qty: 'longitudinal wrap, 25% overlap', role: 'Bundle-level HF shielding (≥1 GHz)' });
    bom.push({ stage: 'Outer drain wire', material: '24-26 AWG tinned copper', qty: '1 strand', role: 'Outer-foil ground continuity' });
  }
  if (hasOuterBraid) {
    bom.push({ stage: 'Outer braid', material: '36-40 AWG TC/SPC, 16-24 carriers × 5-8 ends', qty: '85-95% coverage', role: 'LF shielding + mechanical robustness' });
  }
  if (p.type === '4pair') {
    bom.push({ stage: 'Cross-spline', material: 'PE / FRPE extruded X-profile', qty: '0.5-0.8 mm × 2.5-3.5 mm arms', role: 'Pair separation, NEXT control' });
  }
  bom.push({ stage: 'Binder tape', material: /PTFE|FEP/i.test(p.hl) ? 'PTFE binder tape' : 'Polyester binder tape', qty: 'helical wrap', role: 'Hold cable core during extrusion' });
  bom.push({ stage: 'Jacket', material: jacket, qty: 'extruded over core', role: 'Mechanical + environmental' });
  bom.push({ stage: 'Marking', material: 'Laser inkjet / hot-stamp', qty: 'continuous footage', role: 'Part ID, length, lot' });

  // Process steps
  const proc = [];
  proc.push({
    n: 1,
    name: 'Wire drawing',
    machine: 'Multi-pass drawing line (Niehoff M85, MFL Bull Block)',
    detail: `8 mm ETP rod → ${p.awg.match(/\d+/)?.[0] || '24'} AWG via 8-13 dies (rod-breakdown), 10-15% reduction/pass on PCD/diamond dies. Speed 25-35 m/s.`,
    spec: 'OD ±0.5%, eccentricity <2%',
  });
  proc.push({
    n: 2,
    name: 'Annealing',
    machine: 'In-line resistance annealer (Setic, Niehoff)',
    detail: 'ms residence at 400-600°C in 95N₂/5H₂ reducing atmosphere. Restores ductility (cold-drawn 410 MPa → annealed 200-250 MPa, elongation ≥15%).',
    spec: 'IACS ≥100%, tensile per ASTM B3',
  });
  if (/SPC|silver/i.test(conductorMaterial)) {
    proc.push({
      n: proc.length + 1,
      name: 'Silver plating',
      machine: 'Continuous electroplating line',
      detail: 'Silver bath deposit 50-100 µin (1.27-2.54 µm). At 1 GHz skin depth ≈2.1 µm — plating must be ≥3·δ for 95% AC current in Ag.',
      spec: 'ASTM B298 Class A, ≥1.25%w Ag',
    });
  }
  if (/stranded|7\/|19\//i.test(p.awg)) {
    proc.push({
      n: proc.length + 1,
      name: 'Stranding',
      machine: 'Bunching machine (Niehoff D632) or planetary strander',
      detail: '7/N or 19/N construction. Bunch lay 12-18× strand OD. Backtwist 100% to cancel residual torsion.',
      spec: 'Round, no broken strands, lay ±5%',
    });
  }
  proc.push({
    n: proc.length + 1,
    name: 'Insulation extrusion',
    machine: `${isFEP ? 'High-temp fluoropolymer extruder (Davis-Standard FEP)' : 'PE crosshead extruder (Maillefer)'}`,
    detail: isFoam
      ? 'Tandem foam-skin: solid 0.05-0.1 mm skin first as nucleation surface, then N₂ gas injected at L/D 18-24 (65-80% gas, 10-50 µm cells). Water-bath cooling.'
      : isFEP
      ? 'Pressure tooling at 380-400°C melt temp. Tubing-down ratio 8:1-30:1. PFA/FEP needs corrosion-resistant alloy screws.'
      : 'Pressure tooling at 200-220°C. Inline laser micrometer (1000+ Hz) feeds PID capstan loop.',
    spec: 'OD ±5 µm (laser), concentricity ≥95-97%, capacitance per spec',
  });
  if (p.type === 'twinax' || p.type === '4pair' || p.type === 'starquad') {
    proc.push({
      n: proc.length + 1,
      name: 'Pair twinning',
      machine: 'Double-twist twinner (Bartell Backtwist, Niehoff D403, Sampsistemi DTB)',
      detail: p.type === '4pair'
        ? `Carbon-fiber bow at 2500-4500 rpm, 2 twists/rev. CRITICAL conditions to prevent damage:
• TENSION: 50-250 g per conductor, imbalance between the 2 wires <5%. Dancer arm + magnetic brake holds tension constant ±2%. Too tight → conductor stretch (drops IACS, raises DCR), eccentricity grows.
• BACKTWIST: servo-driven payoff at 80-105% bow speed (called "100% backtwist") cancels residual torsion. Without it the pair "springs back" off-spool, pigtailing in the wrong direction.
• UNIQUE LAY: each pair gets a different lay (Cat 6A: 11/13/15/17 mm; Cat 8: 6/7/8/9 mm) to decorrelate NEXT — pairs are never "in phase" with each other.
• PRE-PAIRING: conductors sorted into (C₀, OD) bins before twinning, paired so capacitance unbalance cancels (US Patent 4,174,236).
• SPEED MATCH: bow rpm ÷ payoff m/min must match the lay length target. Wrong ratio → lay drift, NEXT drops 3 dB per 10% lay drift.`
        : p.type === 'starquad'
        ? `4 conductors fed simultaneously into the double-twist bow. Diagonal pairing HAPPENS NATURALLY during bunching — opposite conductors form one differential leg.
• Tension EQUAL across all 4 conductors (±3 g) — mismatch pushes 1 conductor outside, breaking symmetry → mode conversion rises.
• Lay 30-50 mm depending on frequency target.
• Backtwist 100% mandatory on all 4 wires.`
        : `Double-twist 2 conductors, 1500-3000 rpm.
• Tension 50-250 g per conductor, imbalance <5%.
• Backtwist 100% — most important for high-strand counts (19/38, 7/36) since stranded wire unsprings easily.
• Lay per Z target (e.g., 100Ω: lay 15-25 mm with εᵣ_eff ≈1.6).`,
      spec: 'Lay ±5%, capacitance unbalance <40 pF/100ft (<20 pF for Cat 6A), DCR shift <2%, no visible kink/loop',
    });
  }
  if ((p.type === '4pair' || p.type === 'twinax') && hasPairWrap) {
    proc.push({
      n: proc.length + 1,
      name: 'Pair binder wrap (PTFE / polyester tape)',
      machine: 'Helical tape applicator (per-pair head)',
      detail: `Each twisted pair runs through a tape head BEFORE the foil station (or as the only "wrap" layer in PTFE-only constructions).
• MATERIAL: ${hasPairFoil ? 'polyester (Mylar) 12 µm tape — works with the foil adhesive in S/FTP, U/FTP, USB4 builds' : 'PTFE tape 25-50 µm — high-temp, low-εr (~2.1), used in aerospace / FEP builds without foil'}.
• OVERLAP: 25-50% so the spiral seals after relaxation. Too loose → foil gaps; too tight → ovalises pair.
• TENSION: 50-150 g, dancer-controlled. Tape stretches if pulled — εr shifts.
• SPEED MATCH: tape pad rpm tied to line speed via servo so overlap stays constant on different cable diameters.`,
      spec: 'Continuous wrap, no gaps, overlap 25-50%, tension repeatable ±5%',
    });
  }
  if ((p.type === '4pair' || p.type === 'twinax') && hasPairFoil) {
    proc.push({
      n: proc.length + 1,
      name: 'Per-pair foil shield + drain wire',
      machine: 'Longitudinal "cigarette" wrap head + drain payoff',
      detail: `THIS IS THE STEP MOST OFTEN CALLED "S/FTP" OR "U/FTP" — each twisted pair gets its OWN foil shield (not a single shield over the whole bundle).
• ORIENTATION: foil-side INWARD toward the pair. The PET side is the outer face for mechanical strength + adhesion to the next layer.
• WRAP TYPE: longitudinal cigarette wrap — the tape folds around the pair lengthwise with a small longitudinal seam. Best HF performance; no helical seam to leak.
• DRAIN WIRE: 28-30 AWG tinned copper laid in continuous contact with the foil's metallic side, runs the full length. This is what carries the foil's induced shield current to the connector ground.
• ALTERNATIVE: helical 25-50% overlap wrap — easier on tight bend radii but worse Zt above 1 GHz.
• DOWNSTREAM: bonded onto the pair via low-pressure heat-set roll (60-80°C) so the foil can't slip during cabling.`,
      spec: '100% optical coverage longitudinal, drain DCR <10 Ω/100ft, foil-pair bond strength ≥0.5 N/cm',
    });
  }
  if (p.type === '4pair') {
    proc.push({
      n: proc.length + 1,
      name: 'Cabling (4-pair core) — crush prevention',
      machine: 'Planetary cabler (true-concentric) or SZ strander',
      detail: `Cross-spline extruded INLINE (simultaneously with cabling), 4 pairs laid into quadrants. This is the step most likely to "crush" pairs without proper control:

• CROSS-SPLINE PRE-EXTRUSION: extrude the X-profile PE/FRPE 0.5-0.8 mm × 2.5-3.5 mm arms BEFORE pairs enter, used as a "skeleton" to hold pair position. Without spline → pairs ride over each other through the die, OD ovalizes.

• PAIR PAYOFF TENSION: 200-400 g/pair (higher than twinning since the conductor already has hard insulation). Tension EQUAL across all 4 pairs (±5%). Mismatch → one pair gets pulled toward center, deforming cross-section.

• CABLING DIE GAP: die ID larger than theoretical OD by 0.05-0.10 mm (loose). Too tight → die forces pair into spline → insulation compresses → εᵣ shifts → Z drops 3-8 Ω.

• BUNDLE LAY 50-100 mm — many times longer than pair lay (8-17 mm). Lay too short → bend radius small at each turn → insulation crush.

• ALTERNATING S/Z DIRECTION: successive layers reverse twist direction so net torque = 0. Same direction → cable self-twists off-spool, creating loops/kinks.

• TAKE-UP TENSION: 80-150 N (4-pair Cat 6A); higher → cable elongates, pairs migrate inside the jacket. TIA-569 caps pulling tension at 110 N — exceeding it stretches conductors irreversibly.

• CAPSTAN: dual-belt or caterpillar tractor (NOT single-wheel — causes flat spots). Belt pressure 2-4 bar — enough grip without crushing.

• REEL TRAVERSE: distribute layers evenly on the reel — uneven traverse → outer layers compress inner layers, OD ovalizes permanently.`,
      spec: 'Round core (ovality <2%), no pair migration, OD ±0.10 mm, lay ±5%, no visible insulation deformation under cross-section',
    });
  }
  if (p.type === 'starquad') {
    proc.push({
      n: proc.length + 1,
      name: 'Star quad cabling — symmetry critical',
      machine: 'Planetary cabler (true-concentric mandatory)',
      detail: `Star quad is already formed during twinning (4 conductors enter the bow simultaneously). This step only applies binder + light shaping if needed.
• Do NOT use SZ stranding — oscillation breaks the diagonal pairing symmetry.
• Light binder tape holds the 4 conductors in a square cross-section.
• PE filler wedges may be inserted at the 4 corners to improve mechanical robustness.`,
      spec: 'Square symmetry maintained, opposite conductors true diametrical',
    });
  }
  if (hasOuterFoil) {
    proc.push({
      n: proc.length + 1,
      name: 'Outer foil shield (bundle-level)',
      machine: 'Tape-wrap head (longitudinal or helical)',
      detail: `Al/PET tape applied OVER the cabled bundle (not per-pair). Foil-side toward the drain wire.
• Longitudinal cigarette wrap = best HF performance, no helical seam.
• Helical 25-50% overlap = better bend tolerance but worse Zt above 1 GHz.
• Outer drain wire laid alongside the foil seam, in continuous metallic contact.
• In F/UTP cables this is the ONLY foil layer; in S/FTP it's stacked over per-pair foils for double-screen Zt < 1 mΩ/m.`,
      spec: '100% optical coverage (longitudinal), drain DCR <10 Ω/100 ft, no foil tears',
    });
  }
  if (hasOuterBraid) {
    proc.push({
      n: proc.length + 1,
      name: 'Outer braid (LF shield + mechanical)',
      machine: 'Maypole braider (Steeger / OMA, 16-48 carriers)',
      detail: '36-40 AWG TC/SPC strand. Typical 5-8 ends/carrier, 8-25 picks/inch, 35-45° helix angle. Coverage K = (2F − F²)·100% per SCTE 51. The braid carries the LF (<1 GHz) shield current — foil alone has too much Zt at low frequency due to the longitudinal seam.',
      spec: 'Coverage ≥85% general, ≥95% EMI-critical (aerospace, mil-spec)',
    });
  }
  proc.push({
    n: proc.length + 1,
    name: 'Jacket extrusion',
    machine: 'Crosshead jacket extruder',
    detail: isFEP
      ? 'FEP/PFA tubing tooling at 380-420°C. Crystalline shrinkage 1-3% — re-measure after 24h.'
      : 'Pressure or tubing tooling. Gel-filling for outdoor variants. Ink-jet print for marking.',
    spec: 'OD ±0.005 in (general), ±0.002 in (premium aerospace/coax)',
  });
  proc.push({
    n: proc.length + 1,
    name: 'Length marking + reeling',
    machine: 'Inkjet / hot-stamp printer + take-up',
    detail: 'Sequential footage marks every 2 ft. Reeled onto wooden/plastic spools per customer spec.',
    spec: 'Print legibility, no skipped marks',
  });

  // Test sequence
  const tests = [
    { name: 'DC continuity', detail: '4-wire Kelvin per conductor', limit: p.awg.includes('23') ? '≤9.4 Ω/100m' : '≤21 Ω/100m' },
    { name: 'Insulation resistance', detail: '500 V or 1000 V megger', limit: '≥5 GΩ·1000ft' },
    { name: 'Hi-Pot dielectric', detail: 'AC RMS or DC withstand 1 minute', limit: '1500-2500 V AC' },
    { name: 'Capacitance', detail: '1 kHz LCR mutual + pair-to-shield', limit: 'per IEC 61156' },
  ];
  if (/Ω/.test(p.z)) {
    tests.push({ name: 'TDR impedance', detail: 'Time-domain reflectometry — full-length plateau', limit: `${p.z} (typically ±5-10 Ω)` });
  }
  if (/MHz|GHz|Gbps|dB/.test(p.bw)) {
    tests.push({ name: 'VNA S-parameters', detail: '4-port differential — SDD11/21, SCD21, NEXT, FEXT', limit: `Per ${p.std || 'spec'}` });
    tests.push({ name: 'Insertion loss', detail: 'Per-frequency attenuation', limit: 'Below standard mask' });
  }
  if (p.type === '4pair') {
    tests.push({ name: 'NEXT / PSANEXT', detail: 'Pair-to-pair + alien crosstalk', limit: 'TIA/IEC class limits' });
    tests.push({ name: 'Cross-section inspection', detail: 'Cut sample, mount, polish, examine under microscope at 50× — check ovality, pair deformation, spline integrity, gaps', limit: 'Round, no crushed pairs, ovality <2%' });
    tests.push({ name: 'Capacitance unbalance', detail: 'Pair-to-ground per pair — detects asymmetry from one-sided crush', limit: '<330 pF/100m (Cat 6A)' });
  }
  if (p.type === 'starquad') {
    tests.push({ name: 'Diagonal pair balance', detail: 'TDR each diagonal pair separately — opposite conductors must produce identical Z plateau', limit: 'ΔZ between 2 diagonals <2 Ω' });
  }
  if (/CMP|plenum|LSZH|CMR/i.test(p.app + p.hl)) {
    tests.push({ name: 'Flame test', detail: /CMP/i.test(p.app + p.hl) ? 'NFPA 262 Steiner Tunnel' : /CMR/i.test(p.app + p.hl) ? 'UL 1666' : 'IEC 60332-3-24', limit: 'Pass per fire rating' });
  }

  // Approx cost slice for 1000 m
  const awgN = parseInt((p.awg.match(/\d+/) || ['24'])[0]);
  const condArea = Math.PI * Math.pow(0.005 * Math.pow(92, (36 - awgN) / 39) * 25.4 / 2, 2);
  const nCond = p.type === '4pair' ? 8 : p.type === 'starquad' ? 4 : p.type === 'twinax' ? 2 : 1;
  const cuMass = condArea * 1000 * 8.96 / 1000 * nCond;
  const cuCost = cuMass * 9.5;
  const dielCost = isFEP ? 80 : 8;
  const shieldCost = isShielded ? 25 : 0;
  const jacketCost = isFEP ? 60 : 12;
  const laborCost = 30;
  const subtotal = cuCost + dielCost + shieldCost + jacketCost + laborCost;
  const total = subtotal * 1.25;

  return {
    bom, proc, tests,
    cost: {
      cu: cuCost.toFixed(2), cuMass: cuMass.toFixed(2),
      diel: dielCost.toFixed(2), shield: shieldCost.toFixed(2),
      jacket: jacketCost.toFixed(2), labor: laborCost.toFixed(2),
      total: total.toFixed(2),
    },
    machineCount: proc.length,
    testCount: tests.length,
    construction: {
      isShielded, isSFTP, isFTP, isUFTP, isFEP, isFoam,
      hasPairWrap, hasPairFoil, hasOuterFoil, hasOuterBraid,
    },
  };
}

/* ============================================================
   Build Flow Diagram — horizontal cross-section progression
   Shows what each manufacturing stage does at the wire / pair / bundle
   level so the engineer can SEE that, e.g., per-pair foil lives inside
   the bundle, not over it.
   ============================================================ */
function StageXS({ kind, size = 56 }) {
  const c = size / 2;
  const stroke = '#384249';
  const cu = '#c97b3f';
  const cuHi = '#e89357';
  const insColors = ['#fbbf24', '#7dd3fc', '#a78bfa', '#5eead4'];
  const foilFill = '#a7b0b6';
  const wrapFill = '#384249';
  const jacketFill = '#1a2226';
  const W = size;
  if (kind === 'conductor') {
    return (
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
        <circle cx={c} cy={c} r={W * 0.18} fill={cu} stroke={cuHi} />
      </svg>
    );
  }
  if (kind === 'stranded') {
    const r = W * 0.08;
    const R = W * 0.16;
    const cx = (a) => c + R * Math.cos(a);
    const cy = (a) => c + R * Math.sin(a);
    return (
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
        <circle cx={c} cy={c} r={r} fill={cu} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <circle key={i} cx={cx((Math.PI / 3) * i)} cy={cy((Math.PI / 3) * i)} r={r} fill={cu} stroke={cuHi} strokeWidth="0.5" />
        ))}
      </svg>
    );
  }
  if (kind === 'insulated') {
    return (
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
        <circle cx={c} cy={c} r={W * 0.36} fill={insColors[0]} stroke={stroke} />
        <circle cx={c} cy={c} r={W * 0.18} fill={cu} />
      </svg>
    );
  }
  if (kind === 'pair') {
    return (
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
        <circle cx={c - W * 0.18} cy={c} r={W * 0.18} fill={insColors[0]} stroke={stroke} />
        <circle cx={c - W * 0.18} cy={c} r={W * 0.09} fill={cu} />
        <circle cx={c + W * 0.18} cy={c} r={W * 0.18} fill={insColors[1]} stroke={stroke} />
        <circle cx={c + W * 0.18} cy={c} r={W * 0.09} fill={cu} />
        <path d={`M ${c - W * 0.36} ${c} Q ${c} ${c - W * 0.10} ${c + W * 0.36} ${c}`} stroke={stroke} fill="none" strokeDasharray="2 2" />
      </svg>
    );
  }
  if (kind === 'pair-wrap') {
    return (
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
        <ellipse cx={c} cy={c} rx={W * 0.46} ry={W * 0.26} fill="none" stroke={wrapFill} strokeWidth="2" strokeDasharray="3 2" />
        <circle cx={c - W * 0.16} cy={c} r={W * 0.16} fill={insColors[0]} stroke={stroke} />
        <circle cx={c - W * 0.16} cy={c} r={W * 0.08} fill={cu} />
        <circle cx={c + W * 0.16} cy={c} r={W * 0.16} fill={insColors[1]} stroke={stroke} />
        <circle cx={c + W * 0.16} cy={c} r={W * 0.08} fill={cu} />
      </svg>
    );
  }
  if (kind === 'pair-foil') {
    return (
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
        <ellipse cx={c} cy={c} rx={W * 0.46} ry={W * 0.26} fill={foilFill} stroke={stroke} />
        <circle cx={c - W * 0.16} cy={c} r={W * 0.16} fill={insColors[0]} />
        <circle cx={c - W * 0.16} cy={c} r={W * 0.08} fill={cu} />
        <circle cx={c + W * 0.16} cy={c} r={W * 0.16} fill={insColors[1]} />
        <circle cx={c + W * 0.16} cy={c} r={W * 0.08} fill={cu} />
        <circle cx={c + W * 0.40} cy={c - W * 0.12} r={W * 0.04} fill={cu} stroke={cuHi} />
      </svg>
    );
  }
  if (kind === 'bundle') {
    const offsets = [
      [-0.20, -0.20, 0],
      [0.20, -0.20, 1],
      [-0.20, 0.20, 2],
      [0.20, 0.20, 3],
    ];
    return (
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
        <circle cx={c} cy={c} r={W * 0.46} fill="none" stroke={stroke} />
        <path d={`M ${c} ${c - W * 0.42} L ${c} ${c + W * 0.42} M ${c - W * 0.42} ${c} L ${c + W * 0.42} ${c}`} stroke={stroke} strokeWidth="1.5" />
        {offsets.map(([dx, dy, ci], i) => (
          <g key={i}>
            <circle cx={c + W * dx - W * 0.06} cy={c + W * dy} r={W * 0.06} fill={insColors[ci]} />
            <circle cx={c + W * dx + W * 0.06} cy={c + W * dy} r={W * 0.06} fill={insColors[ci]} />
          </g>
        ))}
      </svg>
    );
  }
  if (kind === 'bundle-foil') {
    return (
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
        <circle cx={c} cy={c} r={W * 0.46} fill={foilFill} stroke={stroke} />
        <circle cx={c} cy={c} r={W * 0.40} fill="#0a0d0f" stroke={stroke} />
        {[
          [-0.20, -0.20, 0],
          [0.20, -0.20, 1],
          [-0.20, 0.20, 2],
          [0.20, 0.20, 3],
        ].map(([dx, dy, ci], i) => (
          <g key={i}>
            <circle cx={c + W * dx - W * 0.06} cy={c + W * dy} r={W * 0.06} fill={insColors[ci]} />
            <circle cx={c + W * dx + W * 0.06} cy={c + W * dy} r={W * 0.06} fill={insColors[ci]} />
          </g>
        ))}
      </svg>
    );
  }
  if (kind === 'braid') {
    return (
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
        <defs>
          <pattern id="braidp" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={cu} strokeWidth="1.5" />
            <line x1="3" y1="0" x2="3" y2="6" stroke={cuHi} strokeWidth="1" />
          </pattern>
        </defs>
        <circle cx={c} cy={c} r={W * 0.48} fill="url(#braidp)" stroke={stroke} />
        <circle cx={c} cy={c} r={W * 0.40} fill="#0a0d0f" stroke={stroke} />
      </svg>
    );
  }
  if (kind === 'jacket') {
    return (
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
        <circle cx={c} cy={c} r={W * 0.48} fill={jacketFill} stroke={stroke} strokeWidth="1.5" />
        <circle cx={c} cy={c} r={W * 0.40} fill="#0a0d0f" stroke={stroke} />
      </svg>
    );
  }
  return null;
}

// Estimate the OD progression through every manufacturing stage. All numbers
// are first-order — assumes typical wall thicknesses and layer densities so the
// engineer sees realistic deltas, not exact spec sheet numbers.
function estimateBuildODs(product, c) {
  const awgN = parseInt((product.awg.match(/\d+/) || ['24'])[0]);
  const condOD = 0.005 * Math.pow(92, (36 - awgN) / 39) * 25.4; // mm
  // Stranded constructions stay at ~1.15× single-strand OD
  const isStranded = /stranded|7\/|19\//i.test(product.awg);
  const strandOD = isStranded ? condOD * 1.15 : condOD;
  // Solve insulation OD from target single-wire Z (≈ Z_diff/2 for differential pair, full Z for coax)
  const er = c.isFEP ? 2.05 : c.isFoam ? 1.55 : 2.30;
  const targetZ = product.type === 'coax' ? parseFloat((product.z || '50').match(/\d+/)?.[0] || '50') : 50;
  const Dd = Math.pow(10, (targetZ * Math.sqrt(er)) / 138);
  const insOD = strandOD * Math.max(1.4, Dd);
  // Twisted pair: 2 wires touching ≈ 2× insulated OD with 5% slack
  const pairOD = 2 * insOD * 1.05;
  // Pair binder wrap: helical tape adds ~50 µm radial
  const pairWrapOD = pairOD + 0.10;
  // Per-pair foil: 25 µm Al + 12 µm PET ≈ 80 µm radial
  const pairFoilOD = pairWrapOD + 0.16;
  // 4-pair bundle: 4 pairs around an X-spline ≈ 2.4× pair OD (2.7 if foiled, more space)
  const innerPairOD = c.hasPairFoil ? pairFoilOD : c.hasPairWrap ? pairWrapOD : pairOD;
  const bundleOD = product.type === '4pair' ? innerPairOD * 2.45 : innerPairOD;
  // Outer foil ≈ 80 µm radial
  const outerFoilOD = bundleOD + 0.16;
  // Outer braid: 2× braid wire diameter (typ 0.16 mm wire) on each side
  const braidOD = (c.hasOuterFoil ? outerFoilOD : bundleOD) + 0.32;
  // Jacket: typical 0.4-0.6 mm wall (use 0.5 mm)
  const beforeJacket = c.hasOuterBraid ? braidOD : c.hasOuterFoil ? outerFoilOD : bundleOD;
  const finalOD = beforeJacket + 1.0;
  return {
    cond: condOD,
    strand: strandOD,
    ins: insOD,
    pair: pairOD,
    pairWrap: pairWrapOD,
    pairFoil: pairFoilOD,
    bundle: bundleOD,
    outerFoil: outerFoilOD,
    braid: braidOD,
    finalOD,
  };
}

function fmtOD(mm) {
  if (mm == null || isNaN(mm)) return '—';
  return mm < 1 ? `ϕ${mm.toFixed(3)} mm` : `ϕ${mm.toFixed(2)} mm`;
}
function fmtODInch(mm) {
  if (mm == null || isNaN(mm)) return '—';
  const inch = mm / 25.4;
  return inch < 0.1 ? `${inch.toFixed(4)}″` : `${inch.toFixed(3)}″`;
}
function fmtODBoth(mm) {
  if (mm == null || isNaN(mm)) return '—';
  return `${fmtOD(mm)} / ${fmtODInch(mm)}`;
}

function BuildFlowDiagram({ recipe, product }) {
  const c = recipe.construction;
  const od = estimateBuildODs(product, c);

  const stages = [];
  stages.push({ kind: 'conductor', label: 'Conductor', mat: /SPC|silver/i.test(product.awg) ? 'Silver-plated Cu' : /TC|tinned/i.test(product.awg) ? 'Tinned Cu' : 'Bare ETP Cu', spec: product.awg, od: od.cond });
  if (/stranded|7\/|19\//i.test(product.awg)) {
    stages.push({ kind: 'stranded', label: 'Stranding', mat: '7/N or 19/N bunch', spec: 'lay 12-18× d', od: od.strand });
  }
  stages.push({ kind: 'insulated', label: 'Insulation', mat: c.isFEP ? 'FEP / PFA' : c.isFoam ? 'Foamed PE' : 'Solid PE', spec: `εᵣ ${c.isFEP ? '2.05' : c.isFoam ? '1.55' : '2.30'}`, od: od.ins });
  if (product.type === '4pair' || product.type === 'twinax' || product.type === 'starquad') {
    stages.push({ kind: 'pair', label: 'Twisted pair', mat: 'Pair lay', spec: 'lay 6-17 mm', od: od.pair, z: product.z });
  }
  if (c.hasPairWrap) stages.push({ kind: 'pair-wrap', label: 'Pair wrap', mat: c.hasPairFoil ? 'Polyester (Mylar)' : 'PTFE tape', spec: '12-50 µm, 25% lap', od: od.pairWrap });
  if (c.hasPairFoil) stages.push({ kind: 'pair-foil', label: 'Pair foil', mat: 'Al/PET 25 µm', spec: 'longitudinal + drain', od: od.pairFoil });
  if (product.type === '4pair') stages.push({ kind: 'bundle', label: '4-pair bundle', mat: 'X-spline core', spec: 'lays 11/13/15/17 mm', od: od.bundle });
  if (c.hasOuterFoil) stages.push({ kind: 'bundle-foil', label: 'Outer foil', mat: 'Al/PET 25 µm', spec: 'bundle-level wrap', od: od.outerFoil });
  if (c.hasOuterBraid) stages.push({ kind: 'braid', label: 'Outer braid', mat: '36-40 AWG TC/SPC', spec: 'K ≥ 85% (SCTE 51)', od: od.braid });
  stages.push({ kind: 'jacket', label: 'Jacket', mat: c.isFEP ? 'FEP plenum' : 'PVC / LSZH', spec: 'wall 0.4-0.6 mm', od: od.finalOD, isFinal: true });

  // Scale icons proportionally to OD growth so the cable visually grows.
  // Cap so the conductor is still visible (min 28 px) and final fits in the card (max 64 px).
  const minOD = Math.min(...stages.map((s) => s.od));
  const maxOD = Math.max(...stages.map((s) => s.od));
  const iconSize = (mm) => {
    if (maxOD === minOD) return 48;
    const t = (mm - minOD) / (maxOD - minOD);
    return Math.round(28 + t * 36); // 28→64 px
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5eead4]">
          ◆ Cross-section build flow · {stages.length} stage{stages.length === 1 ? '' : 's'}
        </div>
        <div className="font-mono text-[11px] text-[#a7b0b6]">
          <span className="text-[#6b7479]">OD growth:</span>{' '}
          <span className="text-[#fbbf24]">{fmtOD(od.cond)}</span>
          <span className="text-[#6b7479]"> ({fmtODInch(od.cond)})</span>
          {' → '}
          <span className="text-[#c97b3f]">{fmtOD(od.finalOD)}</span>
          <span className="text-[#6b7479]"> ({fmtODInch(od.finalOD)})</span>
          <span className="ml-2 text-[#5eead4]">({(od.finalOD / od.cond).toFixed(1)}×)</span>
        </div>
      </div>

      {/* OD growth ruler — visual scale of how thick the cable becomes */}
      <div className="mb-3">
        <div className="relative h-7 bg-[#0a0d0f] border border-[#252e33] rounded overflow-hidden">
          <div
            className="absolute left-0 top-0 bottom-0"
            style={{
              width: '100%',
              background: `linear-gradient(to right, #c97b3f 0%, #c97b3f ${(od.cond / od.finalOD) * 100}%, #fbbf24 ${(od.ins / od.finalOD) * 100}%, #5eead4 ${(od.bundle / od.finalOD) * 100}%, #1a2226 100%)`,
              opacity: 0.25,
            }}
          />
          {stages.map((s, i) => {
            const left = (s.od / od.finalOD) * 100;
            return (
              <div key={i} className="absolute top-0 bottom-0 w-px bg-[#384249]" style={{ left: `${left}%` }} title={`${s.label}: ${fmtOD(s.od)}`}>
                <div className="absolute -top-0.5 -translate-x-1/2 w-1.5 h-1.5 rounded-full" style={{ background: s.isFinal ? '#c97b3f' : '#5eead4', left: 0 }} />
              </div>
            );
          })}
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[9px] text-[#a7b0b6] pointer-events-none">
            ϕ scale · {fmtOD(od.cond)} ─ {fmtOD(od.finalOD)}
          </div>
        </div>
      </div>

      {/* Stage cards */}
      <div
        className="flex gap-0 overflow-x-auto pb-2 border border-[#252e33] bg-[#12171a] rounded"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
          backgroundSize: '12px 12px',
        }}
      >
        {stages.map((s, i) => {
          const sz = iconSize(s.od);
          const mmStr = s.od < 1 ? s.od.toFixed(3) : s.od.toFixed(2);
          const inchStr = s.od < 25.4 ? (s.od / 25.4).toFixed(4) : (s.od / 25.4).toFixed(3);
          return (
            <React.Fragment key={i}>
              <div className="flex flex-col items-stretch shrink-0 w-[140px] md:w-[160px] p-3 border-r border-[#252e33]" style={{ borderRightStyle: i === stages.length - 1 ? 'none' : 'solid' }}>
                {/* step number */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] text-[#c97b3f] tracking-wider font-medium">{String(i + 1).padStart(2, '0')}</span>
                  {s.isFinal && <span className="font-mono text-[8px] text-[#5eead4] bg-[#0d1f1d] border border-[#2f7a6e] px-1 rounded">FINAL</span>}
                </div>
                {/* SVG cross-section */}
                <div
                  className="bg-[#0a0d0f] border border-[#252e33] rounded mx-auto flex items-center justify-center"
                  style={{ width: 80, height: 80 }}
                >
                  <StageXS kind={s.kind} size={sz} />
                </div>
                {/* dimension block — bigger and shows both mm + inch */}
                <div className="mt-2 bg-[#0a0d0f] border border-[#384249] rounded px-1.5 py-1 text-center">
                  <div className="font-mono text-[13px] text-[#fbbf24] font-medium leading-none">
                    ϕ {mmStr}<span className="text-[10px] text-[#a7b0b6] ml-0.5">mm</span>
                  </div>
                  <div className="font-mono text-[11px] text-[#5eead4] leading-none mt-1">
                    {inchStr}″
                  </div>
                </div>
                {/* label */}
                <div className="font-mono text-[11px] text-[#fbbf24] text-center leading-tight mt-2 font-medium">{s.label}</div>
                <div className="font-mono text-[9px] text-[#a7b0b6] text-center leading-tight mt-0.5">{s.mat}</div>
                <div className="font-mono text-[9px] text-[#6b7479] text-center leading-tight mt-0.5">{s.spec}</div>
                {s.z && (
                  <div className="font-mono text-[10px] text-[#5eead4] text-center leading-tight mt-1.5 bg-[#0d1f1d] border border-[#2f7a6e] rounded py-1">
                    Z {s.z}
                  </div>
                )}
              </div>
              {i < stages.length - 1 && (
                <div className="flex items-center justify-center shrink-0 w-3 text-[#384249] -mx-1.5 z-10" style={{ minHeight: 80 }}>
                  ▸
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Summary line + caveats */}
      <div className="mt-2 flex items-center justify-between flex-wrap gap-2 font-mono text-[10px] text-[#6b7479]">
        <div>
          ⓘ ODs are first-order estimates from AWG + εᵣ + standard wall assumptions. Use the recipe BOM for sourcing specs.
        </div>
        <div className="flex items-center gap-3">
          <span>Δ <span className="text-[#fbbf24]">{(od.finalOD - od.cond).toFixed(2)} mm</span> <span className="text-[#5eead4]">/ {((od.finalOD - od.cond) / 25.4).toFixed(3)}″</span></span>
          <span>Final <span className="text-[#c97b3f]">ϕ {od.finalOD.toFixed(2)} mm</span> <span className="text-[#5eead4]">/ {(od.finalOD / 25.4).toFixed(3)}″</span></span>
        </div>
      </div>

      {!c.hasPairFoil && !c.hasOuterFoil && (
        <div className="mt-2 text-[11px] text-[#a7b0b6] bg-[#1a1612] border border-[#384249] px-3 py-2 rounded">
          <span className="text-[#fbbf24] font-medium">U/UTP variant</span> — this build has <span className="text-[#f87171]">no foil shield</span> and <span className="text-[#f87171]">no per-pair wrap</span>. Sister products in the S/FTP / U/FTP family add per-pair foil + binder steps and an outer braid.
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Build Recipe Page (replaces modal — full route navigation)
   ============================================================ */
function BuildRecipePage({ product, onBack }) {
  const [tab, setTab] = useState('bom');

  React.useEffect(() => {
    setTab('bom');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [product]);

  if (!product) return null;
  const r = buildRecipe(product);

  return (
    <section className="mb-20">
      {/* Back button — clearly says where it goes */}
      <button
        onClick={onBack}
        className="tappable mb-4 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#a7b0b6] hover:text-[#c97b3f] border border-[#384249] px-3 py-2"
      >
        <ChevronRight className="w-3.5 h-3.5 rotate-180" />
        Back to {product.vendor === 'Glenair' ? '963 Catalog' : 'Vendors'}
      </button>

      {/* Header */}
      <div className="mb-6 pb-6 border-b border-[#252e33]">
        <div className="flex items-start gap-4">
          <div className="shrink-0 hidden sm:block">
            <CableTypeIcon type={product.type} size={84} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#c97b3f] mb-1">
              {product.vendor} · BUILD RECIPE
            </div>
            <div className="font-mono text-xl md:text-2xl text-[#c97b3f] mt-1 break-all">{product.pn}</div>
            <h2 className="text-2xl md:text-3xl text-[#f0ebe2] font-light mt-1 leading-tight" style={{ fontFamily: 'Bricolage Grotesque' }}>
              {product.name}
            </h2>
            <div className="flex flex-wrap gap-2 mt-3">
              <Pill tone="teal">{product.z}</Pill>
              <Pill tone="amber">{product.awg}</Pill>
              <Pill>{product.bw}</Pill>
            </div>
          </div>
        </div>
      </div>

      {/* Stat bar */}
      <div className="grid grid-cols-3 gap-px bg-[#252e33] border border-[#252e33] mb-6">
        <div className="p-3 md:p-4 bg-[#0a0d0f]">
          <div className="font-mono text-[10px] uppercase text-[#6b7479]">BOM lines</div>
          <div className="font-mono text-2xl text-[#5eead4] mt-0.5">{r.bom.length}</div>
        </div>
        <div className="p-3 md:p-4 bg-[#0a0d0f]">
          <div className="font-mono text-[10px] uppercase text-[#6b7479]">Process</div>
          <div className="font-mono text-2xl text-[#fbbf24] mt-0.5">{r.machineCount}</div>
        </div>
        <div className="p-3 md:p-4 bg-[#0a0d0f]">
          <div className="font-mono text-[10px] uppercase text-[#6b7479]">Cost / 1km</div>
          <div className="font-mono text-2xl text-[#c97b3f] mt-0.5 truncate">${r.cost.total}</div>
        </div>
      </div>

      {/* Visual cross-section progression */}
      <BuildFlowDiagram recipe={r} product={product} />

      {/* Tabs */}
      <div className="flex border-b border-[#252e33] mb-6 overflow-x-auto">
        {[
          { id: 'bom', label: 'BOM', fullLabel: 'Bill of Materials', icon: Boxes, count: r.bom.length },
          { id: 'process', label: 'Process', fullLabel: 'Build Process', icon: Wrench, count: r.proc.length },
          { id: 'tests', label: 'QA', fullLabel: 'QA Tests', icon: FlaskConical, count: r.tests.length },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 flex items-center gap-1.5 md:gap-2 px-3 md:px-5 py-3 text-[11px] md:text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
              tab === t.id
                ? 'text-[#fbbf24] border-b-2 border-[#c97b3f] bg-[#2a1d14]'
                : 'text-[#a7b0b6] hover:text-[#fbbf24] hover:bg-[#1f1610] border-b-2 border-transparent'
            }`}
          >
            <t.icon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">{t.fullLabel}</span>
            <span className="md:hidden">{t.label}</span>
            <span className="text-[#6b7479] text-[10px]">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Body */}
      {tab === 'bom' && (
        <div>
          <p className="text-xs md:text-sm text-[#a7b0b6] mb-4 leading-relaxed">
            Materials needed to build this cable. Each component has a specific role and spec.
          </p>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {r.bom.map((b, i) => (
              <div key={i} className="border border-[#252e33] bg-[#12171a] p-3">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-mono text-[10px] text-[#6b7479] shrink-0">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-mono text-xs text-[#fbbf24] uppercase tracking-wider">{b.stage}</span>
                </div>
                <div className="text-xs text-[#f0ebe2] leading-relaxed">{b.material}</div>
                <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
                  <span className="font-mono text-[10px] text-[#5eead4]">{b.qty}</span>
                  <span className="text-[10px] text-[#6b7479]">·</span>
                  <span className="text-[10px] text-[#a7b0b6]">{b.role}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block border border-[#252e33] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0a0d0f]">
                <tr className="text-[#a7b0b6] font-mono text-[10px] uppercase">
                  <th className="px-3 py-2 text-left w-10">#</th>
                  <th className="px-3 py-2 text-left">Stage</th>
                  <th className="px-3 py-2 text-left">Material</th>
                  <th className="px-3 py-2 text-left">Spec / qty</th>
                  <th className="px-3 py-2 text-left">Role</th>
                </tr>
              </thead>
              <tbody>
                {r.bom.map((b, i) => (
                  <tr key={i} className="border-t border-[#252e33] hover:bg-[#171d20]">
                    <td className="px-3 py-2.5 font-mono text-[#6b7479]">{i + 1}</td>
                    <td className="px-3 py-2.5 font-mono text-[#fbbf24] text-xs whitespace-nowrap">{b.stage}</td>
                    <td className="px-3 py-2.5 text-[#f0ebe2] text-xs">{b.material}</td>
                    <td className="px-3 py-2.5 text-[#5eead4] font-mono text-[11px]">{b.qty}</td>
                    <td className="px-3 py-2.5 text-[#a7b0b6] text-xs">{b.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 p-4 bg-[#12171a] border border-[#252e33]">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-3">Cost estimate · 1000 m</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <div><div className="text-[#6b7479] font-mono uppercase text-[10px]">Copper</div><div className="font-mono text-[#e89357] mt-0.5">${r.cost.cu}<span className="text-[10px] text-[#6b7479] ml-1">({r.cost.cuMass}kg)</span></div></div>
              <div><div className="text-[#6b7479] font-mono uppercase text-[10px]">Dielectric</div><div className="font-mono text-[#fbbf24] mt-0.5">${r.cost.diel}</div></div>
              <div><div className="text-[#6b7479] font-mono uppercase text-[10px]">Shield</div><div className="font-mono text-[#b8b4a8] mt-0.5">${r.cost.shield}</div></div>
              <div><div className="text-[#6b7479] font-mono uppercase text-[10px]">Jacket</div><div className="font-mono text-[#a78bfa] mt-0.5">${r.cost.jacket}</div></div>
              <div><div className="text-[#6b7479] font-mono uppercase text-[10px]">Labor</div><div className="font-mono text-[#7dd3fc] mt-0.5">${r.cost.labor}</div></div>
            </div>
            <div className="mt-3 pt-3 border-t border-dashed border-[#252e33] flex justify-between items-baseline">
              <span className="font-mono text-[10px] uppercase text-[#6b7479]">Total + 25% overhead</span>
              <span className="font-mono text-2xl text-[#c97b3f]">${r.cost.total}</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'process' && (
        <div>
          <p className="text-xs md:text-sm text-[#a7b0b6] mb-4 leading-relaxed">
            Manufacturing process in order. Each step has machine, detail, and acceptance spec.
          </p>
          <ol className="space-y-3">
            {r.proc.map((s, i) => (
              <li key={i} className="relative pl-10 md:pl-12 pb-3">
                <div className="absolute left-0 top-0 w-8 h-8 md:w-9 md:h-9 border border-[#384249] bg-[#0a0d0f] rounded-sm flex items-center justify-center font-mono text-xs md:text-sm text-[#c97b3f]">
                  {String(s.n).padStart(2, '0')}
                </div>
                {i < r.proc.length - 1 && (
                  <div className="absolute left-[15px] md:left-[17px] top-8 md:top-9 bottom-0 w-px bg-[#252e33]" />
                )}
                <div className="border border-[#252e33] bg-[#12171a] p-3 md:p-4">
                  <h4 className="text-sm md:text-base text-[#f0ebe2] font-light" style={{ fontFamily: 'Bricolage Grotesque' }}>
                    {s.name}
                  </h4>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#fbbf24] mb-2 mt-1 break-words">
                    ⚙ {s.machine}
                  </div>
                  <p className="text-xs text-[#a7b0b6] leading-relaxed mb-2 whitespace-pre-line">{s.detail}</p>
                  <div className="font-mono text-[10px] text-[#5eead4] bg-[#0d1f1d] border border-[#2f7a6e] inline-block px-2 py-1 break-words max-w-full">
                    ✓ {s.spec}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {tab === 'tests' && (
        <div>
          <p className="text-xs md:text-sm text-[#a7b0b6] mb-4 leading-relaxed">
            Test sequence before cable leaves the factory. DC tests first, distributed parameters next, HF S-parameters last.
          </p>
          <div className="space-y-2">
            {r.tests.map((t, i) => (
              <div key={i} className="flex items-start gap-3 border border-[#252e33] bg-[#12171a] p-3 md:p-4">
                <div className="shrink-0 w-7 h-7 border border-[#5eead4] rounded-sm flex items-center justify-center text-[#5eead4] font-mono text-xs mt-0.5">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <h4 className="text-sm text-[#f0ebe2] font-medium">{t.name}</h4>
                    <span className="font-mono text-[10px] text-[#5eead4] break-words">{t.limit}</span>
                  </div>
                  <p className="text-xs text-[#a7b0b6] mt-1 leading-relaxed">{t.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {product.std && product.std !== '—' && (
            <div className="mt-5 p-3 md:p-4 bg-[#12171a] border-l-2 border-[#c97b3f]">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-1">Compliance standards</div>
              <div className="text-xs md:text-sm text-[#f0ebe2] font-mono break-words">{product.std}</div>
            </div>
          )}
        </div>
      )}

      {/* Bottom back button */}
      <div className="mt-8 pt-6 border-t border-[#252e33] flex justify-between items-center gap-3">
        <span className="text-[10px] font-mono text-[#6b7479]">
          Auto-generated · representative process
        </span>
        <button
          onClick={onBack}
          className="tappable text-xs font-mono uppercase tracking-wider px-4 py-2 border border-[#384249] hover:border-[#c97b3f] text-[#a7b0b6] hover:text-[#c97b3f]"
        >
          ← Back
        </button>
      </div>
    </section>
  );
}

/* ============================================================
   Lab 07 — Lay Designer (4-pair compatibility validator)
   ============================================================ */
function LayDesigner() {
  const [presetName, setPresetName] = useState('cat6a');
  const [pairLays, setPairLays] = useState([11, 13, 15, 17]);
  const [bundleLay, setBundleLay] = useState(75);
  const [pairOD, setPairOD] = useState(1.4);
  const [coreOD, setCoreOD] = useState(5.5);

  // Listen for agent-applied lay presets
  useEffect(() => {
    const onApply = (e) => {
      if (e.detail?.section !== 'lay') return;
      const p = e.detail.params || {};
      if (Array.isArray(p.pair_lays_mm) && p.pair_lays_mm.length === 4) setPairLays(p.pair_lays_mm);
      else if (p.lay_mm != null) setPairLays([p.lay_mm, p.lay_mm + 2, p.lay_mm + 4, p.lay_mm + 6]);
      if (p.bundle_lay_mm != null) setBundleLay(p.bundle_lay_mm);
      setPresetName('agent');
    };
    window.addEventListener('cable-suite:apply-preset', onApply);
    return () => window.removeEventListener('cable-suite:apply-preset', onApply);
  }, []);

  const presets = {
    cat5e: { lays: [13, 16, 19, 22], bundle: 90, pairOD: 1.5, coreOD: 5.0, name: 'Cat 5e' },
    cat6: { lays: [12, 14, 17, 20], bundle: 85, pairOD: 1.5, coreOD: 5.5, name: 'Cat 6' },
    cat6a: { lays: [11, 13, 15, 17], bundle: 75, pairOD: 1.4, coreOD: 5.5, name: 'Cat 6A (recommended)' },
    cat8: { lays: [6, 7, 8, 9], bundle: 50, pairOD: 1.3, coreOD: 6.0, name: 'Cat 8' },
    bad_identical: { lays: [13, 13, 13, 13], bundle: 75, pairOD: 1.4, coreOD: 5.5, name: '⚠ All identical (worst)' },
    bad_tight: { lays: [11, 13, 15, 17], bundle: 22, pairOD: 1.4, coreOD: 5.5, name: '⚠ Bundle lay too tight' },
  };

  const usePreset = (key) => {
    const p = presets[key];
    setPresetName(key);
    setPairLays([...p.lays]);
    setBundleLay(p.bundle);
    setPairOD(p.pairOD);
    setCoreOD(p.coreOD);
  };

  const setPairLay = (idx, val) => {
    const next = [...pairLays];
    next[idx] = val;
    setPairLays(next);
    setPresetName('custom');
  };

  // ============= ANALYSIS =============

  // 1. Pair sync — pairs are problematic if their lay ratio is close to a small integer (1:1, 2:1, 3:2)
  const checkSync = useMemo(() => {
    const issues = [];
    const PAIR_NAMES = ['P1', 'P2', 'P3', 'P4'];
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const ratio = Math.max(pairLays[i], pairLays[j]) / Math.min(pairLays[i], pairLays[j]);
        // Distance to nearest small rational
        const candidates = [1, 1.5, 2, 2.5, 3];
        const nearest = candidates.reduce((best, c) => Math.abs(ratio - c) < Math.abs(ratio - best) ? c : best, 1);
        const distance = Math.abs(ratio - nearest);
        if (distance < 0.04) {
          const sev = nearest === 1 ? 'critical' : 'warn';
          issues.push({
            pairs: `${PAIR_NAMES[i]}-${PAIR_NAMES[j]}`,
            ratio: ratio.toFixed(2),
            sync: nearest === 1 ? 'identical' : `${nearest}:1`,
            severity: sev,
          });
        }
      }
    }
    return issues;
  }, [pairLays]);

  // 2. Lay diversity — std deviation of lays
  const layDiversity = useMemo(() => {
    const mean = pairLays.reduce((a, b) => a + b, 0) / 4;
    const variance = pairLays.reduce((s, l) => s + (l - mean) ** 2, 0) / 4;
    const stdev = Math.sqrt(variance);
    const cov = (stdev / mean) * 100;
    return { mean, stdev, cov };
  }, [pairLays]);

  // 3. Bundle lay vs pair lay — bundle should be 4-10× shortest pair lay; <3× = crush risk
  const bundleRatio = bundleLay / Math.min(...pairLays);
  const bundleStatus = useMemo(() => {
    if (bundleRatio < 3) return { color: '#f87171', status: 'CRUSH RISK', detail: 'Bundle lay too short — small bend radius pushes pairs into spline' };
    if (bundleRatio < 4) return { color: '#fbbf24', status: 'TIGHT', detail: 'Bundle lay borderline — review process tension carefully' };
    if (bundleRatio < 12) return { color: '#5eead4', status: 'GOOD', detail: 'Bundle lay healthy ratio for 4-pair construction' };
    return { color: '#fbbf24', status: 'LOOSE', detail: 'Bundle lay too long — pair migration risk under flex' };
  }, [bundleRatio]);

  // 4. Helical excess length — each pair conductor travels √(1 + (πD/L)²) longer than axial
  const excess = useMemo(() => {
    return pairLays.map((L) => {
      const ratio = Math.sqrt(1 + Math.pow((Math.PI * pairOD) / L, 2));
      return (ratio - 1) * 100; // %
    });
  }, [pairLays, pairOD]);

  // 5. Skew estimate — difference between fastest and slowest pair (excess length / Vp)
  const skew = useMemo(() => {
    const max = Math.max(...excess);
    const min = Math.min(...excess);
    const delta_pct = max - min;
    // For 100m cable, εᵣ ≈ 1.6, vp ≈ 0.79c → 1m base ≈ 4.2 ns
    const skew_per_100m = (delta_pct / 100) * 100 * 4.2;
    return { delta: delta_pct, ns: skew_per_100m };
  }, [excess]);

  // 6. Pair-pair NEXT estimate at 100 MHz
  const nextEst = useMemo(() => {
    const results = [];
    const NAMES = ['P1', 'P2', 'P3', 'P4'];
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const dL = Math.abs(pairLays[i] - pairLays[j]);
        // Empirical: NEXT @ 100 MHz ≈ 30 + 4·dL dB, capped at ~58
        const next = Math.min(58, 30 + dL * 4);
        results.push({ pair: `${NAMES[i]}-${NAMES[j]}`, next, dL });
      }
    }
    return results;
  }, [pairLays]);

  // 7. Crush margin — distance between pair centers and spline arms
  // Each pair sits in quadrant; pair OD must fit (coreOD/2 - splineThickness/2)
  const splineArmThickness = 0.7;
  const quadrantSpace = (coreOD - splineArmThickness) / 2;
  const crushMargin = quadrantSpace - pairOD;
  const crushStatus = useMemo(() => {
    if (crushMargin < 0) return { color: '#f87171', status: 'PHYSICAL CONFLICT', detail: `Pair OD (${pairOD}mm) > quadrant space (${quadrantSpace.toFixed(2)}mm). Spline cuts into pair.` };
    if (crushMargin < 0.15) return { color: '#fbbf24', status: 'NO TOLERANCE', detail: `Margin only ${crushMargin.toFixed(2)}mm. Any extrusion variation will crush.` };
    if (crushMargin < 0.4) return { color: '#5eead4', status: 'TIGHT FIT', detail: `Margin ${crushMargin.toFixed(2)}mm — fine for production tolerance.` };
    return { color: '#7dd3fc', status: 'COMFORTABLE', detail: `Margin ${crushMargin.toFixed(2)}mm — generous, can reduce coreOD to save jacket material.` };
  }, [crushMargin, pairOD, quadrantSpace]);

  // ============= OVERALL VERDICT =============
  const verdict = useMemo(() => {
    const errors = [];
    const warnings = [];
    if (checkSync.some((s) => s.severity === 'critical')) errors.push('Identical pair lays detected');
    if (checkSync.some((s) => s.severity === 'warn')) warnings.push('Synchronous lay ratios');
    if (layDiversity.cov < 8) warnings.push('Low lay diversity (CoV <8%)');
    if (bundleRatio < 3) errors.push('Bundle lay too tight — crush risk');
    if (bundleRatio < 4) warnings.push('Bundle lay borderline');
    if (crushMargin < 0) errors.push('Pair physically does not fit in quadrant');
    if (crushMargin < 0.15) warnings.push('Crush margin near zero');
    if (skew.ns > 45) warnings.push(`Skew ${skew.ns.toFixed(1)} ns/100m exceeds Cat 6A spec`);

    if (errors.length) return { color: '#f87171', label: 'FAIL', errors, warnings };
    if (warnings.length) return { color: '#fbbf24', label: 'CAUTION', errors, warnings };
    return { color: '#5eead4', label: 'PASS', errors, warnings };
  }, [checkSync, layDiversity, bundleRatio, crushMargin, skew]);
  const layDesignerCouplingsAt100 = useMemo(() => (
    pairLays.map((lay, i) => {
      if (i === 0) return null;
      return Math.min(58, 30 + Math.abs(lay - pairLays[0]) * 4);
    })
  ), [pairLays]);
  const layDesignerVisual = nextVisualForDesign(pairLays, bundleRatio, layDiversity.cov);

  // ============= VISUAL CROSS SECTION =============
  const renderCrossSection = () => {
    const size = 280;
    const cx = size / 2;
    const cy = size / 2;
    const jacketR = (coreOD / 12) * size * 0.5;
    const splineW = (splineArmThickness / 12) * size * 0.5;
    const wireR = ((pairOD / 2) / 12) * size * 0.5;
    const pairOffset = jacketR * 0.55;

    const pairColors = ['#3b82f6', '#f97316', '#16a34a', '#a16207'];
    const quads = [
      { x: cx, y: cy - pairOffset, color: pairColors[0] },
      { x: cx + pairOffset, y: cy, color: pairColors[1] },
      { x: cx, y: cy + pairOffset, color: pairColors[2] },
      { x: cx - pairOffset, y: cy, color: pairColors[3] },
    ];

    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[300px]">
        <circle cx={cx} cy={cy} r={jacketR} fill={C.jacket} stroke={C.border} strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={jacketR * 0.97} fill={C.bgCard} />
        {/* Cross spline */}
        <rect x={cx - splineW} y={cy - jacketR * 0.85} width={splineW * 2} height={jacketR * 1.7} fill="#1a1f23" stroke={C.copper} strokeWidth="0.4" />
        <rect x={cx - jacketR * 0.85} y={cy - splineW} width={jacketR * 1.7} height={splineW * 2} fill="#1a1f23" stroke={C.copper} strokeWidth="0.4" />
        {/* Pairs - render 2 wires each */}
        {quads.map((q, i) => {
          const w1x = q.x - wireR * 0.95;
          const w2x = q.x + wireR * 0.95;
          const isCrush = crushMargin < 0;
          return (
            <g key={i}>
              <circle cx={w1x} cy={q.y} r={wireR} fill={q.color} stroke={isCrush ? '#f87171' : '#000'} strokeWidth={isCrush ? '1.5' : '0.5'} />
              <circle cx={w2x} cy={q.y} r={wireR} fill="#fff" stroke={isCrush ? '#f87171' : '#000'} strokeWidth={isCrush ? '1.5' : '0.5'} />
              <text x={q.x} y={q.y - wireR * 1.8} textAnchor="middle" fontSize="9" fill={C.textDim} fontFamily="JetBrains Mono">
                P{i + 1}: {pairLays[i]}mm
              </text>
            </g>
          );
        })}
        {/* OD dimension callout */}
        <line x1={cx - jacketR} y1={cy + jacketR + 12} x2={cx + jacketR} y2={cy + jacketR + 12} stroke={C.teal} strokeWidth="0.5" />
        <text x={cx} y={cy + jacketR + 24} textAnchor="middle" fontSize="9" fill={C.teal} fontFamily="JetBrains Mono">
          core Ø {coreOD.toFixed(1)} mm / {(coreOD/25.4).toFixed(3)}″
        </text>
      </svg>
    );
  };

  return (
    <section className="mb-20">
      <SectionTitle
        tag="LAB 07 — LAY DESIGNER"
        title="Pair lay compatibility validator"
        subtitle="Test 4 pair lays + bundle lay BEFORE setting up the machine. The validator checks NEXT decorrelation, crush risk, skew, and physical fit. Catch design errors at the virtual stage instead of after running 5 km of cable."
        icon={Settings}
      />

      {/* Presets */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-6">
        {Object.entries(presets).map(([key, p]) => (
          <button
            key={key}
            onClick={() => usePreset(key)}
            className={`tappable p-2 border rounded-sm text-left ${
              presetName === key
                ? 'border-[#c97b3f] bg-[#3d2a1c]'
                : 'border-[#384249] bg-[#1d2329]'
            }`}
          >
            <div className={`text-[10px] font-mono ${presetName === key ? 'text-[#fbbf24]' : 'text-[#a7b0b6]'}`}>
              {p.name}
            </div>
            <div className="text-[9px] font-mono text-[#6b7479] mt-0.5">
              {p.lays.join('/')}
            </div>
          </button>
        ))}
      </div>

      {/* Top row: visual + verdict */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-3">Cross-section preview</div>
          <div className="flex justify-center">{renderCrossSection()}</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-mono">
            <Spec label="Pair OD" value={pairOD.toFixed(2)} unit="mm" />
            <Spec label="Core OD" value={coreOD.toFixed(2)} unit="mm" />
            <Spec label="Quadrant space" value={quadrantSpace.toFixed(2)} unit="mm" />
            <Spec label="Crush margin" value={crushMargin.toFixed(2)} unit="mm" />
          </div>
        </div>

        <div className="p-6 border-2 bg-[#12171a]" style={{ borderColor: verdict.color }}>
          <div className="font-mono text-[10px] uppercase tracking-wider mb-2" style={{ color: verdict.color }}>
            Design verdict
          </div>
          <div className="text-5xl font-light font-mono mb-4" style={{ color: verdict.color, fontFamily: 'JetBrains Mono' }}>
            {verdict.label}
          </div>
          {verdict.errors.length > 0 && (
            <div className="mb-3">
              <div className="font-mono text-[10px] uppercase text-[#f87171] mb-1">Errors</div>
              {verdict.errors.map((e, i) => (
                <div key={i} className="text-xs text-[#f87171] flex gap-2 items-start mb-1">
                  <span className="font-mono shrink-0">✗</span>
                  <span>{e}</span>
                </div>
              ))}
            </div>
          )}
          {verdict.warnings.length > 0 && (
            <div className="mb-3">
              <div className="font-mono text-[10px] uppercase text-[#fbbf24] mb-1">Warnings</div>
              {verdict.warnings.map((w, i) => (
                <div key={i} className="text-xs text-[#fbbf24] flex gap-2 items-start mb-1">
                  <span className="font-mono shrink-0">⚠</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
          {verdict.errors.length === 0 && verdict.warnings.length === 0 && (
            <div className="text-xs text-[#5eead4] flex gap-2 items-start">
              <span className="font-mono shrink-0">✓</span>
              <span>Design valid. Safe to proceed with machine setup — pairs decorrelated, fits in core, skew within spec.</span>
            </div>
          )}
        </div>
      </div>

      <LayNextBlenderPanel
        visual={layDesignerVisual}
        lays={pairLays}
        activePair={0}
        couplings={layDesignerCouplingsAt100}
        contextLabel={`${presets[presetName]?.name || 'Custom lay set'} · bundle ${bundleLay} mm`}
      />

      {/* Lay sliders */}
      <div className="p-6 border border-[#252e33] bg-[#12171a] mb-6">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">Pair lay lengths</div>
        <div className="space-y-4">
          {pairLays.map((lay, i) => (
            <div key={i}>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase tracking-wider">
                  Pair {i + 1} lay
                </label>
                <span className="font-mono text-sm" style={{ color: ['#3b82f6', '#f97316', '#16a34a', '#a16207'][i] }}>
                  {lay} mm <span className="text-[10px] text-[#6b7479]">/ {(lay/25.4).toFixed(3)}″</span>
                </span>
              </div>
              <input
                type="range"
                min="4"
                max="30"
                step="1"
                value={lay}
                onChange={(e) => setPairLay(i, Number(e.target.value))}
                className="w-full accent-[#c97b3f]"
              />
            </div>
          ))}
        </div>

        <div className="mt-5 pt-5 border-t border-dashed border-[#252e33] grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <div>
            <div className="font-mono text-[10px] uppercase text-[#6b7479]">Mean lay</div>
            <div className="font-mono text-[#5eead4] mt-0.5">{layDiversity.mean.toFixed(1)} mm <span className="text-[9px] text-[#6b7479]">/ {(layDiversity.mean/25.4).toFixed(3)}″</span></div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase text-[#6b7479]">Stdev</div>
            <div className="font-mono text-[#5eead4] mt-0.5">{layDiversity.stdev.toFixed(2)} mm <span className="text-[9px] text-[#6b7479]">/ {(layDiversity.stdev/25.4).toFixed(3)}″</span></div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase text-[#6b7479]">CoV (diversity)</div>
            <div className="font-mono mt-0.5" style={{ color: layDiversity.cov < 8 ? '#fbbf24' : '#5eead4' }}>
              {layDiversity.cov.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Bundle + geometry sliders */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">Bundle geometry</div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase">Bundle lay</label>
                <span className="font-mono text-[#fbbf24]">{bundleLay} mm <span className="text-[10px] text-[#6b7479]">/ {(bundleLay/25.4).toFixed(2)}″</span></span>
              </div>
              <input type="range" min="20" max="150" step="5" value={bundleLay} onChange={(e) => { setBundleLay(Number(e.target.value)); setPresetName('custom'); }} className="w-full accent-[#c97b3f]" />
              <div className="text-[10px] font-mono text-[#6b7479] mt-1">
                ratio = bundle/min(pairLay) = <span className="text-[#5eead4]">{bundleRatio.toFixed(1)}×</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase">Pair OD</label>
                <span className="font-mono text-[#fbbf24]">{pairOD.toFixed(2)} mm <span className="text-[10px] text-[#6b7479]">/ {(pairOD/25.4).toFixed(3)}″</span></span>
              </div>
              <input type="range" min="0.8" max="2.5" step="0.05" value={pairOD} onChange={(e) => { setPairOD(Number(e.target.value)); setPresetName('custom'); }} className="w-full accent-[#c97b3f]" />
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-xs text-[#a7b0b6] font-mono uppercase">Core OD (under jacket)</label>
                <span className="font-mono text-[#fbbf24]">{coreOD.toFixed(2)} mm <span className="text-[10px] text-[#6b7479]">/ {(coreOD/25.4).toFixed(3)}″</span></span>
              </div>
              <input type="range" min="3" max="10" step="0.1" value={coreOD} onChange={(e) => { setCoreOD(Number(e.target.value)); setPresetName('custom'); }} className="w-full accent-[#c97b3f]" />
            </div>
          </div>
        </div>

        {/* Bundle status + crush */}
        <div className="space-y-3">
          <div className="p-5 border-2 bg-[#12171a]" style={{ borderColor: bundleStatus.color }}>
            <div className="flex items-baseline justify-between mb-2">
              <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: bundleStatus.color }}>
                Bundle lay check
              </div>
              <div className="font-mono text-sm" style={{ color: bundleStatus.color }}>{bundleStatus.status}</div>
            </div>
            <div className="text-xs text-[#a7b0b6] leading-relaxed">{bundleStatus.detail}</div>
            <div className="mt-2 pt-2 border-t border-dashed border-[#252e33] font-mono text-[10px] text-[#6b7479]">
              Rule of thumb: bundle lay = 4–10× shortest pair lay
            </div>
          </div>

          <div className="p-5 border-2 bg-[#12171a]" style={{ borderColor: crushStatus.color }}>
            <div className="flex items-baseline justify-between mb-2">
              <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: crushStatus.color }}>
                Crush margin check
              </div>
              <div className="font-mono text-sm" style={{ color: crushStatus.color }}>{crushStatus.status}</div>
            </div>
            <div className="text-xs text-[#a7b0b6] leading-relaxed">{crushStatus.detail}</div>
          </div>
        </div>
      </div>

      {/* NEXT estimate matrix */}
      <div className="p-6 border border-[#252e33] bg-[#12171a] mb-6">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">
          NEXT estimate @ 100 MHz · pair-to-pair
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {nextEst.map((e, i) => {
            const color = e.next < 28 ? '#f87171' : e.next < 38 ? '#fbbf24' : e.next < 48 ? '#5eead4' : '#7dd3fc';
            return (
              <div key={i} className="border border-[#252e33] bg-[#0a0d0f] p-3 text-center">
                <div className="font-mono text-[10px] text-[#a7b0b6]">{e.pair}</div>
                <div className="font-mono text-xl mt-1" style={{ color }}>
                  {e.next.toFixed(0)}<span className="text-[10px]">dB</span>
                </div>
                <div className="font-mono text-[9px] text-[#6b7479] mt-1">ΔL={e.dL}mm</div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-dashed border-[#252e33] flex items-center gap-3 text-[10px] font-mono">
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#f87171]" /><span className="text-[#a7b0b6]">&lt;28 fail</span></span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#fbbf24]" /><span className="text-[#a7b0b6]">28-38 marginal</span></span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#5eead4]" /><span className="text-[#a7b0b6]">38-48 good</span></span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#7dd3fc]" /><span className="text-[#a7b0b6]">≥48 excellent</span></span>
        </div>
      </div>

      {/* Helical excess + skew */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">
            Helical excess length per pair
          </div>
          <Formula>L_helix / L_axial = √(1 + (πD/L)²)</Formula>
          <div className="mt-3 space-y-2">
            {excess.map((e, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-12 font-mono text-xs" style={{ color: ['#3b82f6', '#f97316', '#16a34a', '#a16207'][i] }}>
                  P{i + 1}
                </div>
                <div className="flex-1 h-3 bg-[#0a0d0f] border border-[#252e33] overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, e * 5)}%`,
                      background: ['#3b82f6', '#f97316', '#16a34a', '#a16207'][i],
                    }}
                  />
                </div>
                <div className="w-16 text-right font-mono text-xs text-[#5eead4]">+{e.toFixed(2)}%</div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-dashed border-[#252e33] text-[10px] font-mono text-[#6b7479]">
            Conductor twists longer than the axial length per Pythagoras. Shorter pair lay → more excess → DCR rises + larger skew.
          </div>
        </div>

        <div className="p-6 border border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#c97b3f] mb-4">
            Inter-pair skew estimate
          </div>
          <div className="text-center py-4">
            <div className="font-mono text-5xl font-light" style={{ color: skew.ns < 25 ? '#5eead4' : skew.ns < 45 ? '#fbbf24' : '#f87171' }}>
              {skew.ns.toFixed(1)}<span className="text-base ml-1">ns</span>
            </div>
            <div className="font-mono text-xs text-[#a7b0b6] mt-1">delta over 100 m</div>
          </div>
          <div className="mt-3 pt-3 border-t border-dashed border-[#252e33] space-y-1">
            <Spec label="Excess Δ (max - min)" value={skew.delta.toFixed(3)} unit="%" />
            <Spec label="TIA Cat 6A limit" value="≤ 45" unit="ns/100m" />
            <Spec label="Cat 8 / SpaceWire" value="≤ 25" unit="ns/100m" />
            <Spec label="MIL aerospace" value="≤ 15" unit="ns/100m" />
          </div>
          <div className="mt-3 text-[10px] font-mono text-[#6b7479] leading-relaxed">
            {skew.ns < 25 ? '✓ Meets both Cat 8 / SpaceWire spec' : skew.ns < 45 ? '⚠ Meets Cat 6A but fails Cat 8' : '✗ Exceeds Cat 6A spec — pair lays too different'}
          </div>
        </div>
      </div>

      {/* Sync issues */}
      {checkSync.length > 0 && (
        <div className="p-6 border-2 border-[#fbbf24] bg-[#1a1408] mb-6">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#fbbf24] mb-3">
            ⚠ Synchronous lay ratios detected
          </div>
          <p className="text-xs text-[#a7b0b6] mb-3 leading-relaxed">
            When 2 pairs have a lay ratio close to a small integer (1:1, 2:1, 3:2), their twists fall in phase every few cycles → coupling accumulates instead of cancelling. NEXT degrades severely.
          </p>
          <div className="space-y-1.5">
            {checkSync.map((s, i) => (
              <div key={i} className="flex items-baseline gap-3 text-xs">
                <span className="font-mono text-[#fbbf24] w-16 shrink-0">{s.pairs}</span>
                <span className="font-mono text-[#a7b0b6]">ratio {s.ratio} ≈ {s.sync}</span>
                <span className={`ml-auto font-mono text-[10px] uppercase ${s.severity === 'critical' ? 'text-[#f87171]' : 'text-[#fbbf24]'}`}>
                  {s.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Callout tone="copper" title="Why this simulator matters">
        Setting up the machine with the wrong lay → 5-10 km of scrap cable. Each Cat 6A reel = 305 m × $0.5/m = $150, scrapping 5 km = $2500 just for material, not counting labor + overhead.
        Validate the design here first → simulating the Cat 6A standard 11/13/15/17 mm passes all 4 checks; try the "All identical" or "Bundle lay too tight" preset and you'll see immediate fail.
      </Callout>
    </section>
  );
}

/* ============================================================
   Multi-vendor cable library
   ============================================================ */
const PRODUCTS = [
  // ============ DATACOM ============
  { id: 'belden-10gxs13', vendor: 'Belden', pn: '10GXS13', name: 'Cat 6A 10GX U/UTP', cat: 'datacom', type: '4pair',
    z: '100 Ω', awg: '23 solid BC', bw: '625 MHz', app: '10GBASE-T 100m, PoE 100W', hl: 'Bonded-Pair, foam PE, CMP plenum', std: 'TIA Cat 6A' },
  { id: 'belden-10gx62f', vendor: 'Belden', pn: '10GX62F', name: 'Cat 6A F/UTP shielded', cat: 'datacom', type: '4pair',
    z: '100 Ω', awg: '23 solid BC', bw: '625 MHz', app: 'Datacenter, EMI environments', hl: 'Beldfoil overall shield, 4 bonded pairs', std: 'TIA Cat 6A' },
  { id: 'commscope-systimax', vendor: 'CommScope', pn: 'GS10E 91B', name: 'SYSTIMAX GigaSPEED X10D', cat: 'datacom', type: '4pair',
    z: '100 Ω', awg: '23 solid', bw: '500 MHz', app: '10GBASE-T enterprise', hl: 'Twin Conductor design', std: 'TIA Cat 6A' },
  { id: 'berktek-lanmark', vendor: 'CommScope (Berk-Tek)', pn: 'LANmark XTP', name: 'Cat 6A U/FTP screened', cat: 'datacom', type: '4pair',
    z: '100 Ω', awg: '23 solid', bw: '625 MHz', app: 'Datacenter, ANEXT-critical', hl: 'Per-pair foil shield', std: 'TIA Cat 6A' },
  { id: 'panduit-tx6a', vendor: 'Panduit', pn: 'TX6A 10Gig', name: 'Cat 6A U/UTP', cat: 'datacom', type: '4pair',
    z: '100 Ω', awg: '23 solid BC', bw: '500 MHz', app: '10GBASE-T enterprise', hl: 'MaTriX core spline', std: 'TIA Cat 6A' },
  { id: 'leviton-atlas', vendor: 'Leviton', pn: 'Atlas-X1', name: 'Cat 6A U/UTP', cat: 'datacom', type: '4pair',
    z: '100 Ω', awg: '23 solid BC', bw: '500 MHz', app: 'Office Cat 6A', hl: 'Slim 0.27" OD', std: 'TIA Cat 6A' },
  { id: 'gencable-genspeed10k', vendor: 'General Cable', pn: 'GenSpeed 10000', name: 'Cat 6A U/UTP', cat: 'datacom', type: '4pair',
    z: '100 Ω', awg: '23 solid BC', bw: '500 MHz', app: 'Enterprise 10GBASE-T', hl: 'Polypropylene cross-spline', std: 'TIA Cat 6A' },
  { id: 'nexans-lm8', vendor: 'Nexans', pn: 'LANmark-8.2', name: 'Cat 8.2 S/FTP', cat: 'datacom', type: '4pair',
    z: '100 Ω', awg: '22 solid', bw: '2 GHz', app: '40GBASE-T 30m datacenter', hl: 'Per-pair foil + braid', std: 'TIA Cat 8.2' },
  { id: 'hitachi-supra10g', vendor: 'Hitachi (Proterial)', pn: 'Supra 10G-XE', name: 'Cat 6A 10G U/UTP', cat: 'datacom', type: '4pair',
    z: '100 Ω', awg: '23 solid BC', bw: '500 MHz', app: '10GBASE-T enterprise, PoE 100W', hl: 'NCB™ Noise Control Barrier — small OD', std: 'TIA Cat 6A' },
  { id: 'hitachi-supra10g-stp', vendor: 'Hitachi (Proterial)', pn: 'Supra 10G-XE Shielded', name: 'Cat 6A F/UTP', cat: 'datacom', type: '4pair',
    z: '100 Ω', awg: '23 solid BC', bw: '500 MHz', app: 'Datacenter, heavy EMI/RFI environment', hl: 'Foil shield + drain wire', std: 'TIA Cat 6A' },
  { id: 'sumitomo-tb5', vendor: 'Sumitomo Electric', pn: 'Thunderbolt 5', name: 'TB5 / USB4 / DP 2.1 cable', cat: 'datacom', type: 'twinax',
    z: '85 Ω diff', awg: '—', bw: '80 Gbps (120 boost)', app: 'TB3/4/5, USB4, USB 3.2, DP 2.1, PCIe Gen4', hl: 'Intel-approved supplier; passive / active / optical variants', std: 'USB-IF, VESA, Intel TB5' },
  { id: 'sumitomo-usb4aoc', vendor: 'Sumitomo Electric', pn: 'USB4 AOC', name: 'USB4 Active Optical Cable', cat: 'datacom', type: 'twinax',
    z: '85 Ω', awg: '—', bw: '40 Gbps', app: 'Long-reach USB4/TB3, dual 4K display', hl: 'Up to 50 m, electro-optical hybrid', std: 'USB-IF USB4' },
  { id: 'sumitomo-mfcx', vendor: 'Sumitomo Electric', pn: 'MFCX', name: 'Micro Flex Coaxial', cat: 'datacom', type: 'coax',
    z: '50 Ω', awg: '40-46', bw: '20 GHz', app: 'Notebook LVDS, mobile LCD interconnect', hl: 'Sub-mm OD, ultra-flexible', std: '—' },

  // ============ INDUSTRIAL ============
  { id: 'belden-7919a', vendor: 'Belden', pn: '7919A', name: 'DataTuff Cat 5e industrial', cat: 'industrial', type: '4pair',
    z: '100 Ω', awg: '24 solid BC', bw: '100 MHz', app: 'Factory floor, oil & gas', hl: 'TPE jacket, oil resistant', std: 'TIA Cat 5e' },
  { id: 'lapp-etherline', vendor: 'Lapp', pn: 'ETHERLINE Cat.6A FLEX', name: 'Drag-chain Cat 6A', cat: 'industrial', type: '4pair',
    z: '100 Ω', awg: '23 stranded', bw: '500 MHz', app: 'Robotics, drag chain', hl: '5M flex cycles, PUR jacket', std: 'TIA Cat 6A, IEC 61156' },
  { id: 'igus-chainflex', vendor: 'Igus', pn: 'CFBUS.PVC.060', name: 'chainflex Profibus', cat: 'industrial', type: 'twinax',
    z: '150 Ω', awg: '22 stranded', bw: '12 Mbps', app: 'Profibus DP drag chain', hl: '36 month guarantee at 5M cycles', std: 'IEC 61158' },
  { id: 'helukabel-helukat', vendor: 'Helukabel', pn: 'HELUKAT 600', name: 'Cat 6A industrial', cat: 'industrial', type: '4pair',
    z: '100 Ω', awg: '23 solid', bw: '600 MHz', app: 'Industrial Ethernet', hl: 'PE jacket, gel-filled options', std: 'TIA Cat 6A' },
  { id: 'lapp-unitronic-pb', vendor: 'Lapp', pn: 'UNITRONIC BUS PB', name: 'Profibus DP', cat: 'industrial', type: 'twinax',
    z: '150 Ω ±10%', awg: '22 stranded', bw: '12 Mbps', app: 'Profibus DP fieldbus', hl: 'Violet jacket standard', std: 'EN 50170 / IEC 61158' },
  { id: 'lapp-olflex100', vendor: 'Lapp', pn: 'ÖLFLEX CLASSIC 100', name: 'PVC control cable', cat: 'industrial', type: 'multicond',
    z: '—', awg: '0.5–35 mm²', bw: 'DC-60 Hz', app: 'Machinery panel control wiring 300/500 V', hl: 'Industry-standard German PVC control workhorse', std: 'VDE 0281, EN 50525' },
  { id: 'lapp-olflex-servo-fd', vendor: 'Lapp', pn: 'ÖLFLEX SERVO FD 7TCE', name: 'Servo drag-chain TC-ER', cat: 'industrial', type: 'multicond',
    z: '—', awg: '0.5–6 mm²', bw: '—', app: 'Servo motor + feedback combo, drag chain', hl: 'UL TC-ER + NFPA 79, ≥5M flex cycles', std: 'UL TC-ER, NFPA 79' },
  { id: 'lapp-etherline-cat7t', vendor: 'Lapp', pn: 'ETHERLINE Cat.7 TORSION', name: 'Cat 7 torsion-rated', cat: 'industrial', type: '4pair',
    z: '100 Ω', awg: '22 stranded', bw: '600 MHz', app: 'Robot tool-changer, 6-axis arm joints', hl: '±180°/m torsion, ≥5M flex cycles', std: 'TIA Cat 7, ISO 11801' },
  { id: 'lapp-unitronic-spiral', vendor: 'Lapp', pn: 'UNITRONIC SPIRAL', name: 'Spiral retract data cable', cat: 'industrial', type: 'multicond',
    z: '—', awg: '0.14–0.34 mm²', bw: 'data', app: 'Pull-out / retracting data lines', hl: 'PUR jacket, up to 3.5× extension', std: 'LiF2Y11Y' },

  // ============ AEROSPACE / MIL ============
  { id: 'gore-eclipse5', vendor: 'W.L. Gore', pn: 'Eclipse-5', name: 'Eclipse high-speed digital', cat: 'aerospace', type: 'twinax',
    z: '100 Ω ±5', awg: '26-30 SPC', bw: '40 Gbps', app: 'Aircraft fly-by-wire data', hl: 'ePTFE dielectric, lightweight', std: 'AS50881' },
  { id: 'gore-rcn9047', vendor: 'W.L. Gore', pn: 'RCN9047-26', name: 'Cat 6A 26 AWG aerospace', cat: 'aerospace', type: '4pair',
    z: '100 Ω', awg: '26 SPC stranded', bw: '500 MHz', app: 'Aircraft 10GBASE-T (Glenair 963-033 base)', hl: 'FEP, −65/+200°C', std: 'TIA Cat 6A, AS22759' },
  { id: 'te-spec55', vendor: 'TE Raychem', pn: 'Spec 55 / M22759/11', name: 'Single conductor SPC', cat: 'aerospace', type: 'singlecond',
    z: '—', awg: '12-30 SPC', bw: 'DC-RF', app: 'Aircraft hookup wire', hl: 'PTFE-irradiated, 200°C', std: 'MIL-W-22759/11' },
  { id: 'te-spec44', vendor: 'TE Raychem', pn: 'Spec 44 / M81044', name: 'Cross-linked aerospace', cat: 'aerospace', type: 'singlecond',
    z: '—', awg: '12-26 TC/SPC', bw: 'DC-RF', app: 'Lightweight aircraft wiring', hl: 'XL-ETFE, 150°C', std: 'MIL-DTL-81044' },
  { id: 'carlisle-turboflex', vendor: 'Carlisle IT', pn: 'TurboFlex 22759', name: 'Aerospace hookup', cat: 'aerospace', type: 'singlecond',
    z: '—', awg: '14-26', bw: 'DC-RF', app: 'Mil-aero hookup', hl: 'Filotex heritage', std: 'MIL-W-22759' },
  { id: 'carlisle-octax', vendor: 'Carlisle IT', pn: 'OcTax', name: 'Octaxial 8-conductor', cat: 'aerospace', type: '4pair',
    z: '100 Ω', awg: '26 SPC', bw: '10 Gbps', app: 'Mil aerospace high-speed', hl: '8 conductors in single jacket', std: 'AS39029' },
  { id: 'pic-aviowire', vendor: 'Pic Wire', pn: 'AvioWire QHS-1', name: 'Aerospace Ethernet', cat: 'aerospace', type: '4pair',
    z: '100 Ω', awg: '24 SPC', bw: '1 GHz', app: 'Cat 6 avionics Ethernet', hl: 'FEP/PFA, MIL-DTL-22734', std: 'AS22734' },
  { id: 'habia-spec12', vendor: 'Habia Cable', pn: 'Spec 12 TSP', name: 'MIL twisted shielded pair', cat: 'aerospace', type: 'twinax',
    z: '78 Ω / 100 Ω', awg: '22-26 SPC', bw: '10 MHz / 1 GHz', app: 'MIL-STD-1553B, ARINC 429', hl: 'PTFE/FEP options', std: 'M17/176' },

  // ============ SPACE ============
  { id: 'axon-spacewire', vendor: "Axon' Cable", pn: 'SpaceWire ECSS-3902', name: 'SpaceWire ECSS compliant', cat: 'space', type: '4pair',
    z: '100 Ω ±6', awg: '26 SPC', bw: '200 Mbps', app: 'Satellite, SpaceWire/SpaceFibre', hl: 'Low outgassing, 4× shielded pairs', std: 'ECSS-E-ST-50-12C, ESCC 3902/003' },
  { id: 'gore-spaceflight', vendor: 'W.L. Gore', pn: 'Spaceflight HSD', name: 'Spaceflight high-speed data', cat: 'space', type: 'twinax',
    z: '50/100 Ω', awg: '24-30 SPC', bw: '40 GHz', app: 'Satellite, deep space probes', hl: 'ECSS-Q-ST-70 outgassing', std: 'ECSS, NASA EEE-INST-002' },

  // ============ BROADCAST / VIDEO ============
  { id: 'belden-1694a', vendor: 'Belden', pn: '1694A', name: 'Brilliance precision video', cat: 'broadcast', type: 'coax',
    z: '75 Ω', awg: '18 solid BC', bw: '4.5 GHz', app: 'HD-SDI, 3G/6G-SDI, 4K UHD', hl: 'Foam HDPE, Duobond+ 95% TC braid, Vp 82%', std: 'SMPTE 424M, RG-6/U, CMR' },
  { id: 'belden-1855a', vendor: 'Belden', pn: '1855A', name: 'Mini-RG59 broadcast', cat: 'broadcast', type: 'coax',
    z: '75 Ω', awg: '23 solid BC', bw: '3 GHz', app: 'Studio patch panels', hl: 'Sub-miniature flexible', std: 'SMPTE, Mini RG59' },
  { id: 'belden-7731a', vendor: 'Belden', pn: '7731A', name: '12G-SDI 4K coax', cat: 'broadcast', type: 'coax',
    z: '75 Ω', awg: '17 solid BC', bw: '6 GHz', app: '12G-SDI 4K UHD broadcast', hl: 'Foam FEP, plenum CMP', std: 'SMPTE 2082' },
  { id: 'canare-lv77s', vendor: 'Canare', pn: 'LV-77S', name: '5C-2V general SDI', cat: 'broadcast', type: 'coax',
    z: '75 Ω', awg: '20', bw: '3 GHz', app: 'HD-SDI broadcast', hl: 'PE foam, double shield', std: 'JIS 5C-2V' },
  { id: 'canare-v53cfb', vendor: 'Canare', pn: 'V5-3CFB', name: '12G-SDI 4K', cat: 'broadcast', type: 'coax',
    z: '75 Ω', awg: '23 solid BC', bw: '6 GHz', app: '12G-SDI 4K, HFR HDR', std: 'SMPTE 2082', hl: 'Skin-foam-skin dielectric' },

  // ============ AUDIO ============
  { id: 'mogami-2534', vendor: 'Mogami', pn: 'W2534 Neglex Quad', name: 'Reference Standard star quad', cat: 'audio', type: 'starquad',
    z: '—', awg: '24 (40 strands)', bw: 'Audio', app: 'Studio mic cable, balanced lines', hl: 'XLPE insulation, served BC shield, 10–20 dB SNR vs TP', std: 'IEC 60968' },
  { id: 'mogami-2549', vendor: 'Mogami', pn: 'W2549 Neglex', name: 'Twisted pair Reference', cat: 'audio', type: 'twinax',
    z: '—', awg: '24 (40 strands)', bw: 'Audio', app: 'Patch bays, AES/EBU', hl: 'Lower capacitance than quad', std: '—' },
  { id: 'canare-l4e6s', vendor: 'Canare', pn: 'L-4E6S', name: 'Star Quad mic cable', cat: 'audio', type: 'starquad',
    z: '—', awg: '21 (40 strands)', bw: 'Audio', app: 'PA, handheld, broadcast mic', hl: 'XLPE, broadcast standard, 40 strands flex', std: '—' },
  { id: 'canare-l2t2s', vendor: 'Canare', pn: 'L-2T2S', name: '2-cond twisted', cat: 'audio', type: 'twinax',
    z: '—', awg: '24', bw: 'Audio', app: 'Standard mic, line level', hl: 'Lower cap than star quad', std: '—' },
  { id: 'belden-9778', vendor: 'Belden', pn: '9778', name: 'Audio star quad', cat: 'audio', type: 'starquad',
    z: '—', awg: '22', bw: 'Audio', app: 'Pro audio, broadcast', hl: 'PE insulation, 95% braid', std: '—' },

  // ============ RF / MICROWAVE ============
  { id: 'times-lmr100', vendor: 'Times Microwave', pn: 'LMR-100A', name: 'Flex coax — small', cat: 'rf', type: 'coax',
    z: '50 Ω', awg: '26 BCCAl', bw: '6 GHz', app: 'GPS, small antenna jumpers', hl: 'OD 2.79 mm, RG-174 replacement', std: '—' },
  { id: 'times-lmr240', vendor: 'Times Microwave', pn: 'LMR-240', name: 'Flex coax — medium', cat: 'rf', type: 'coax',
    z: '50 Ω', awg: '15 BCCAl', bw: '5 GHz', app: 'WiFi, cellular antennas', hl: 'OD 6.10 mm, 8.2 dB/100ft @ 1 GHz', std: 'RG-8X replacement' },
  { id: 'times-lmr400', vendor: 'Times Microwave', pn: 'LMR-400', name: 'Low-loss flexible coax', cat: 'rf', type: 'coax',
    z: '50 Ω', awg: '10 BCCAl', bw: '6 GHz', app: 'Cellular, GPS, WLAN, SCADA', hl: 'OD 10.29 mm, 3.9 dB/100ft @ 900 MHz, drop-in RG-8 replacement', std: 'RG-8/U replacement' },
  { id: 'times-lmr600', vendor: 'Times Microwave', pn: 'LMR-600', name: 'Low-loss large coax', cat: 'rf', type: 'coax',
    z: '50 Ω', awg: '5.5 BC', bw: '5 GHz', app: 'Cellular tower runs, broadcast', hl: 'OD 14.99 mm, 2.5 dB/100ft @ 900 MHz', std: '—' },
  { id: 'times-lmr1200', vendor: 'Times Microwave', pn: 'LMR-1200', name: 'Largest LMR — broadcast', cat: 'rf', type: 'coax',
    z: '50 Ω', awg: '0 BC', bw: '2.5 GHz', app: 'Broadcast tower long runs', hl: 'OD 30.99 mm, 1.3 dB/100ft @ 900 MHz', std: '—' },
  { id: 'huber-sucoflex104', vendor: 'Huber+Suhner', pn: 'SUCOFLEX 104', name: 'Microwave low-loss flex', cat: 'rf', type: 'coax',
    z: '50 Ω', awg: '—', bw: '18 GHz', app: 'Test equipment, antenna VNA', hl: 'PTFE, phase stable, ruggedized', std: '—' },
  { id: 'huber-sucoflex526', vendor: 'Huber+Suhner', pn: 'SUCOFLEX 526', name: 'Microwave high-frequency', cat: 'rf', type: 'coax',
    z: '50 Ω', awg: '—', bw: '26.5 GHz', app: 'mmWave test, 5G NR R&D', hl: 'Phase-/amplitude-stable', std: '—' },
  { id: 'commscope-ldf4', vendor: 'CommScope', pn: 'LDF4-50A Heliax', name: 'Foam-dielectric Heliax', cat: 'rf', type: 'coax',
    z: '50 Ω', awg: '—', bw: '11 GHz', app: 'Cellular tower transmission', hl: 'Corrugated copper outer, 1/2" foam', std: '—' },
  { id: 'storm-phasetrack', vendor: 'Teledyne Storm', pn: 'PhaseTrack 210', name: 'Phase-stable test cable', cat: 'rf', type: 'coax',
    z: '50 Ω', awg: '—', bw: '40 GHz', app: 'Lab test, calibrated phase', hl: '±2° phase stability vs flex', std: '—' },

  // ============ AUTOMOTIVE ============
  { id: 'rosenberger-hsd', vendor: 'Rosenberger', pn: 'HSD', name: 'High-Speed Data automotive', cat: 'automotive', type: 'starquad',
    z: '100 Ω', awg: '26', bw: '6 Gbps', app: 'MOST150, LVDS, GVIF', hl: '4-conductor in twinax connector', std: 'USCAR-2' },
  { id: 'huber-mfakra', vendor: 'Huber+Suhner', pn: 'Mini-FAKRA', name: 'Mini-FAKRA coax', cat: 'automotive', type: 'coax',
    z: '50/75 Ω', awg: '—', bw: '20 GHz', app: 'Automotive radar, ADAS', hl: '70% smaller than FAKRA II', std: 'USCAR-30' },
  { id: 'leoni-dacar535', vendor: 'Leoni', pn: 'Dacar 535', name: '100BASE-T1 Automotive Ethernet', cat: 'automotive', type: 'twinax',
    z: '100 Ω', awg: '26', bw: '100 Mbps', app: 'In-vehicle Ethernet', hl: 'Single twisted pair, lightweight', std: 'IEEE 802.3bw' },
  { id: 'te-fakra2', vendor: 'TE Connectivity', pn: 'FAKRA II', name: 'Automotive coax', cat: 'automotive', type: 'coax',
    z: '50 Ω', awg: '—', bw: '6 GHz', app: 'Automotive radio, GPS, GNSS', hl: 'Color-coded keying', std: 'USCAR-18' },
  { id: 'sumitomo-lvcx', vendor: 'Sumitomo Electric', pn: 'LVCX', name: 'Automotive HF coax', cat: 'automotive', type: 'coax',
    z: '50 Ω', awg: '—', bw: '20 GHz', app: 'Automotive radar IF, 5G/V2X antenna', hl: 'Low-loss low-reflection broadband', std: 'USCAR-30' },
  { id: 'sumitomo-sumicard', vendor: 'Sumitomo Electric', pn: 'SUMI-CARD', name: 'Flat shielded multiwire', cat: 'automotive', type: 'multicond',
    z: '—', awg: 'flat conductor', bw: 'data + power', app: 'Automotive harness, consumer electronics', hl: 'Laminated flat conductors, µm precision', std: '—' },
];

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'datacom', label: 'Datacom' },
  { id: 'industrial', label: 'Industrial' },
  { id: 'aerospace', label: 'Aerospace/MIL' },
  { id: 'space', label: 'Space' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'audio', label: 'Audio' },
  { id: 'rf', label: 'RF/Microwave' },
  { id: 'automotive', label: 'Automotive' },
];

function ProductLibrary({ onOpenRecipe }) {
  const [cat, setCat] = useState('all');
  const [vendor, setVendor] = useState('all');
  const [search, setSearch] = useState('');

  const vendors = useMemo(() => {
    const set = new Set(PRODUCTS.map((p) => p.vendor));
    return ['all', ...Array.from(set).sort()];
  }, []);

  const filtered = useMemo(() => {
    return PRODUCTS.filter((p) => {
      if (cat !== 'all' && p.cat !== cat) return false;
      if (vendor !== 'all' && p.vendor !== vendor) return false;
      if (search) {
        const q = search.toLowerCase();
        const blob = `${p.vendor} ${p.pn} ${p.name} ${p.app} ${p.hl}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [cat, vendor, search]);

  const catCount = (id) => (id === 'all' ? PRODUCTS.length : PRODUCTS.filter((p) => p.cat === id).length);

  return (
    <section className="mb-20">
      <SectionTitle
        tag="MULTI-VENDOR LIBRARY"
        title="Cable catalog — across manufacturers"
        subtitle={`${PRODUCTS.length} products from ${vendors.length - 1} manufacturers. Click any cable to view its build recipe — materials, process, tests.`}
        icon={Boxes}
      />

      {/* Filter bar */}
      <div className="sticky top-12 z-30 -mx-4 md:-mx-12 px-4 md:px-12 py-4 bg-[#0a0d0f]/92 backdrop-blur-md border-b border-[#252e33] mb-6">
        {/* Search */}
        <div className="mb-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7479]" />
          <input
            type="text"
            placeholder="Search Belden 1694A, LMR-400, star quad, 10GBASE-T..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2 bg-[#12171a] border border-[#252e33] focus:border-[#c97b3f] focus:outline-none text-sm text-[#f0ebe2] placeholder:text-[#6b7479] font-mono rounded-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7479] hover:text-[#c97b3f]">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category chips + vendor select */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 border rounded-sm transition-all cursor-pointer ${
                cat === c.id
                  ? 'border-[#c97b3f] text-[#fbbf24] bg-[#2a1d14]'
                  : 'border-[#252e33] text-[#a7b0b6] hover:border-[#c97b3f] hover:text-[#c97b3f] hover:bg-[#1a120c]/40'
              }`}
            >
              {c.label} <span className="text-[#6b7479] ml-1">{catCount(c.id)}</span>
            </button>
          ))}
          <span className="text-[#384249] mx-1">|</span>
          <select
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 border border-[#252e33] bg-[#12171a] text-[#a7b0b6] rounded-sm hover:border-[#384249] focus:border-[#c97b3f] focus:outline-none"
          >
            {vendors.map((v) => (
              <option key={v} value={v}>{v === 'all' ? 'All vendors' : v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Result counter */}
      <div className="flex items-baseline justify-between mb-4 font-mono text-xs">
        <span className="text-[#a7b0b6]">
          <span className="text-[#5eead4]">{filtered.length}</span>
          <span className="text-[#6b7479]"> of {PRODUCTS.length} products</span>
        </span>
        {(cat !== 'all' || vendor !== 'all' || search) && (
          <button
            onClick={() => { setCat('all'); setVendor('all'); setSearch(''); }}
            className="text-[10px] uppercase tracking-wider text-[#a7b0b6] hover:text-[#c97b3f] border border-[#384249] hover:border-[#c97b3f] px-2 py-1"
          >
            ↻ Clear filters
          </button>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[#252e33] bg-[#12171a]">
          <div className="font-mono text-sm text-[#6b7479]">No products match these filters.</div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const catLabel = CATEGORIES.find((c) => c.id === p.cat)?.label || p.cat;
            return (
              <button
                key={p.id}
                onClick={() => onOpenRecipe(p)}
                className="click-card group p-5 border border-[#2a343b] text-left"
              >
                <div className="click-pulse-dot" />
                {/* Hover hint */}
                <div className="absolute top-2 right-6 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-[#c97b3f] bg-[#0a0d0f] border border-[#c97b3f] px-1.5 py-0.5 z-10">
                  <Wrench className="w-2.5 h-2.5" />
                  Build recipe
                </div>

                {/* Header */}
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#a7b0b6] truncate">
                      {p.vendor}
                    </div>
                    <div className="font-mono text-base text-[#c97b3f] tracking-tight mt-0.5 truncate">
                      {p.pn}
                    </div>
                    <div className="text-sm text-[#f0ebe2] mt-1 leading-tight" style={{ fontFamily: 'Bricolage Grotesque' }}>
                      {p.name}
                    </div>
                  </div>
                  <span className="shrink-0 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 border border-[#384249] text-[#a7b0b6] rounded-sm group-hover:border-[#384249]">
                    {catLabel}
                  </span>
                </div>

                {/* Icon */}
                <div className="flex justify-center my-3 min-h-[110px] items-center">
                  <CableTypeIcon type={p.type} size={100} />
                </div>

                {/* Specs grid */}
                <div className="space-y-1 pt-3 border-t border-dashed border-[#252e33]">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6b7479] font-mono uppercase">Z</span>
                    <span className="font-mono text-[#5eead4]">{p.z}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6b7479] font-mono uppercase">AWG</span>
                    <span className="font-mono text-[#fbbf24]">{p.awg}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6b7479] font-mono uppercase">BW</span>
                    <span className="font-mono text-[#7dd3fc]">{p.bw}</span>
                  </div>
                  <div className="flex justify-between text-xs gap-2">
                    <span className="text-[#6b7479] font-mono uppercase shrink-0">App</span>
                    <span className="text-[#a7b0b6] text-right truncate" title={p.app}>{p.app}</span>
                  </div>
                </div>

                {/* Highlight */}
                <div className="mt-3 pt-3 border-t border-dashed border-[#252e33]">
                  <div className="text-[11px] text-[#a7b0b6] leading-relaxed">
                    <span className="text-[#c97b3f] font-mono mr-1">★</span>
                    {p.hl}
                  </div>
                  {p.std && p.std !== '—' && (
                    <div className="mt-1.5 text-[10px] font-mono text-[#6b7479] truncate" title={p.std}>
                      {p.std}
                    </div>
                  )}
                </div>

                {/* Click affordance */}
                <div className="mt-3 pt-3 border-t border-dashed border-[#252e33] flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-[#6b7479] group-hover:text-[#c97b3f] transition-colors">
                  <span>View build recipe</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Callout tone="amber" title="Note on data accuracy">
        Specs are representative values from public manufacturer datasheets. For actual sourcing/design, verify directly with the manufacturer datasheet.
        Some part numbers may be EOL or superseded. This library serves as educational reference / cross-vendor comparison.
      </Callout>
    </section>
  );
}

/* ============================================================
   Further modules (4-10) preview
   ============================================================ */
function FurtherModules() {
  const mods = [
    { n: '04', title: 'Shielding', vi: 'Foil + braid + S/FTP', icon: Shield, key: 'Zt mΩ/m, transfer impedance' },
    { n: '05', title: 'Jacket / Sheath', vi: 'PVC, LSZH, FEP, PFA', icon: Box, key: 'CMP / CMR / CM fire ratings' },
    { n: '06', title: 'Testing & QA', vi: 'TDR, VNA, Hi-Pot', icon: FlaskConical, key: 'Cpk ≥1.33 normal, ≥1.67 mil-aero' },
    { n: '07', title: 'Standards Index', vi: 'TIA / IEC / IEEE / ECSS / MIL', icon: BookOpen, key: '568.2-D, 11801, 802.3bq, 1553B' },
    { n: '08', title: 'Formula Stack', vi: 'All design equations', icon: Calculator, key: 'Z₀, skin depth, braid coverage' },
    { n: '09', title: 'Defects & Pitfalls', vi: 'Eccentricity, kinks, suckouts', icon: Activity, key: 'Western Electric run rules' },
    { n: '10', title: 'Capstone Lab', vi: 'Design 100Ω 26AWG STP for USB 3.2 Gen 2x2 aerospace', icon: Wrench, key: 'Output: full Glenair-style datasheet' },
  ];

  return (
    <section className="mb-20">
      <SectionTitle
        tag="ROADMAP"
        title="Modules 4 — 10"
        subtitle="The rest of the curriculum. Each module is designed to teach standalone with its own assessment."
        icon={ChevronRight}
      />

      <div className="grid md:grid-cols-2 gap-3">
        {mods.map((m) => (
          <div key={m.n} className="flex gap-4 p-4 border border-[#252e33] bg-[#12171a] hover:bg-[#171d20] transition-all">
            <div className="shrink-0">
              <div className="w-10 h-10 border border-[#384249] rounded-sm flex items-center justify-center">
                <m.icon className="w-5 h-5 text-[#c97b3f]" />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <span className="font-mono text-[10px] tracking-[0.2em] text-[#c97b3f]">MODULE {m.n}</span>
                  <h4 className="text-base text-[#f0ebe2] font-light mt-0.5" style={{ fontFamily: 'Bricolage Grotesque' }}>{m.title}</h4>
                  <p className="text-xs text-[#a7b0b6] italic">{m.vi}</p>
                </div>
              </div>
              <div className="mt-2 font-mono text-[11px] text-[#5eead4]">★ {m.key}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   Hero
   ============================================================ */
function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[#252e33]">
      {/* Decorative grid */}
      <div className="absolute inset-0 pointer-events-none opacity-30">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke={C.border} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>
      </div>

      {/* Decorative cable cross-section */}
      <div className="absolute right-[-60px] top-[10%] opacity-10 pointer-events-none">
        <FourPairBundle size={400} withSpline={true} label={false} />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 md:px-12 py-20 md:py-28">
        <div className="font-mono text-xs tracking-[0.3em] text-[#c97b3f] mb-4">
          ◆ HIGH-SPEED CABLE MANUFACTURING
        </div>
        <h1
          className="text-5xl md:text-7xl text-[#f0ebe2] font-light leading-[0.95] tracking-tight mb-6 max-w-3xl"
          style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}
        >
          From a strand of copper<br />
          to a <span className="italic text-[#c97b3f]">controlled-impedance</span> cable
        </h1>
        <p className="text-lg text-[#a7b0b6] max-w-2xl leading-relaxed mb-8">
          A technical curriculum for engineers and technicians. Follow the manufacturing process from
          conductor preparation → twisted pair → 4-pair bundle → shielding → testing.
        </p>

        <div className="flex flex-wrap gap-3 mb-10">
          <Pill tone="copper">10 modules</Pill>
          <Pill tone="teal">live calculators</Pill>
          <Pill tone="amber">Glenair Series 963 reference</Pill>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl pt-8 border-t border-[#252e33]">
          {[
            { n: '276', l: 'log/√εᵣ — Z formula' },
            { n: '11–17', l: 'mm pair lay set' },
            { n: '60+', l: 'dB ANEXT @ 100 MHz' },
            { n: '≤6 ps/ft', l: 'intra-pair skew' },
          ].map((s, i) => (
            <div key={i}>
              <div className="text-3xl text-[#5eead4] font-light font-mono" style={{ fontFamily: 'JetBrains Mono' }}>
                {s.n}
              </div>
              <div className="text-xs text-[#6b7479] mt-1 font-mono uppercase tracking-wider">{s.l}</div>
            </div>
          ))}
        </div>

        {/* Interaction legend */}
        <div className="mt-10 pt-6 border-t border-[#252e33]">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#c97b3f] mb-4">
            ◆ Interaction guide
          </div>
          <div className="flex flex-wrap gap-3 md:gap-4 text-[12px] font-mono text-[#f0ebe2]">
            <div className="flex items-center gap-2.5 px-3 py-2 border border-[#384249] bg-gradient-to-br from-[#1a1f24] to-[#12171a] rounded-sm">
              <div className="relative w-7 h-7 border border-[#c97b3f] bg-[#1a120c] rounded-sm shrink-0">
                <div
                  className="absolute top-0 right-0"
                  style={{
                    width: 0, height: 0,
                    borderStyle: 'solid', borderWidth: '0 9px 9px 0',
                    borderColor: 'transparent #c97b3f transparent transparent',
                  }}
                />
                <div
                  className="absolute"
                  style={{
                    top: 4, right: 4, width: 4, height: 4,
                    borderRadius: '50%', background: '#5eead4',
                    boxShadow: '0 0 8px #5eead4, 0 0 4px #5eead4',
                  }}
                />
              </div>
              <span><span className="text-[#c97b3f]">Card</span> → opens detail page</span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 border border-[#384249] bg-gradient-to-br from-[#1a1f24] to-[#12171a] rounded-sm">
              <div className="w-9 h-6 border border-[#c97b3f] bg-[#1a120c] rounded-sm flex items-center justify-center text-[9px] text-[#c97b3f] font-bold shrink-0">SET</div>
              <span><span className="text-[#c97b3f]">Preset</span> → loads values</span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 border border-[#384249] bg-gradient-to-br from-[#1a1f24] to-[#12171a] rounded-sm">
              <div className="w-4 h-4 rounded-full shrink-0" style={{ background: '#fbbf24', boxShadow: '0 0 8px rgba(251, 191, 36, 0.5)' }} />
              <span><span className="text-[#fbbf24]">Colored zone</span> → clickable area</span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 border border-[#384249] bg-gradient-to-br from-[#1a1f24] to-[#12171a] rounded-sm">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: '#5eead4', boxShadow: '0 0 8px #5eead4, 0 0 4px #5eead4' }} />
              <span><span className="text-[#5eead4]">Pulsing dot</span> → primary action</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Top Nav
   ============================================================ */
// Top-level nav tree. A node is either a leaf (`{id, label, icon}`) or a
// group (`{group, label, icon, children: [...leaves]}`). Groups render as
// dropdown menus on desktop and as collapsible sections on mobile.
const NAV_TREE = [
  { id: 'home', label: 'Home', icon: Cable },
  {
    group: 'learn', label: 'Learn', icon: GitBranch,
    children: [
      { id: 'progression', label: 'Progression', icon: GitBranch },
      { id: 'm1', label: 'Conductor', icon: Atom },
      { id: 'm2', label: 'Twisted Pair', icon: Layers },
      { id: 'm3', label: 'Bundle', icon: Box },
      { id: 'more', label: 'Modules 4–10', icon: ChevronRight },
    ],
  },
  {
    group: 'sim', label: 'Simulations', icon: Wrench,
    children: [
      { id: 'sim', label: 'Process Sim', icon: Wrench },
      { id: 'tdr', label: 'TDR Sim', icon: Activity },
      { id: 'vna', label: 'VNA Lab', icon: FlaskConical },
      { id: 'suckout', label: 'Tape Suckout', icon: Activity },
      { id: 'next', label: 'NEXT crosstalk', icon: Radio },
      { id: 'eye', label: 'Eye Diagram', icon: Eye },
    ],
  },
  {
    group: 'calc', label: 'Calculators', icon: Calculator,
    children: [
      { id: 'calc', label: 'Z₀ Calc', icon: Calculator },
      { id: 'braid', label: 'Braid Coverage', icon: Shield },
      { id: 'atten', label: 'Attenuation', icon: Zap },
      { id: 'lay', label: 'Lay Designer', icon: Settings },
      { id: 'cost', label: 'Cost Calc', icon: Coins },
    ],
  },
  {
    group: 'analysis', label: 'Analysis', icon: Activity,
    children: [
      { id: 'qc', label: 'QC Stats', icon: Activity },
      { id: '3d', label: '3D Visualizer', icon: Box },
    ],
  },
  {
    group: 'lib', label: 'Library', icon: Library,
    children: [
      { id: 'library', label: 'Vendors', icon: Boxes },
      { id: 'catalog', label: '963 Catalog', icon: Library },
    ],
  },
];

// Flatten the tree for label lookup
function findActiveLabel(active) {
  for (const node of NAV_TREE) {
    if (node.id === active) return node.label;
    if (node.children) {
      const child = node.children.find((c) => c.id === active);
      if (child) return child.label;
    }
  }
  return 'CABLE.LAB';
}

// Find which group contains the given child id (for highlighting parent)
function findActiveGroup(active) {
  for (const node of NAV_TREE) {
    if (node.children?.some((c) => c.id === active)) return node.group;
  }
  return null;
}

function TopNav({ active, onChange }) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);  // desktop dropdown
  const [expandedGroup, setExpandedGroup] = useState(findActiveGroup(active));  // mobile section
  const navRef = useRef(null);
  const activeLabel = findActiveLabel(active);
  const activeGroup = findActiveGroup(active);

  // Close dropdown on outside click (desktop)
  useEffect(() => {
    if (!openGroup) return;
    const handle = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setOpenGroup(null);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [openGroup]);

  // Close dropdown on Esc
  useEffect(() => {
    if (!openGroup) return;
    const handle = (e) => { if (e.key === 'Escape') setOpenGroup(null); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [openGroup]);

  const pickLeaf = (id) => {
    onChange(id);
    setOpenGroup(null);
    setDrawerOpen(false);
  };

  if (isMobile) {
    return (
      <>
        <nav className="sticky top-0 z-40 backdrop-blur-md bg-[#0a0d0f]/85 border-b border-[#252e33]">
          <div className="px-4 py-2 flex items-center justify-between gap-2">
            <div className="font-mono text-[11px] text-[#c97b3f] tracking-[0.2em] shrink-0">
              ◆ CABLE.LAB
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#fbbf24] truncate">
                {activeLabel}
              </span>
              <button
                onClick={() => setDrawerOpen(true)}
                className="p-2 -mr-2 text-[#a7b0b6] hover:text-[#fbbf24]"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
            </div>
          </div>
        </nav>
        {drawerOpen && (
          <div className="fixed inset-0 z-[200]" onClick={() => setDrawerOpen(false)}>
            <div className="absolute inset-0 bg-[#0a0d0f]/90 backdrop-blur-sm" />
            <aside
              onClick={(e) => e.stopPropagation()}
              className="absolute top-0 right-0 bottom-0 w-[85%] max-w-[340px] bg-[#0a0d0f] border-l border-[#252e33] overflow-y-auto"
              style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#252e33]">
                <span className="font-mono text-[11px] text-[#c97b3f] tracking-[0.2em]">◆ CABLE.LAB</span>
                <button onClick={() => setDrawerOpen(false)} className="p-2 -mr-2 text-[#a7b0b6] hover:text-[#fbbf24]" aria-label="Close menu">
                  <XIcon size={18} />
                </button>
              </div>
              <div className="px-3 py-3 border-b border-[#252e33] flex flex-col gap-1">
                <Link to="/rf" onClick={() => setDrawerOpen(false)} className="px-3 py-2 text-[12px] font-mono uppercase tracking-wider text-[#a7b0b6] hover:text-[#fbbf24] hover:bg-[#1f1610] rounded">RF Workbench</Link>
                <Link to="/builder" onClick={() => setDrawerOpen(false)} className="px-3 py-2 text-[12px] font-mono uppercase tracking-wider text-[#a7b0b6] hover:text-[#fbbf24] hover:bg-[#1f1610] rounded">Cable Builder</Link>
                <Link to="/about" onClick={() => setDrawerOpen(false)} className="px-3 py-2 text-[12px] font-mono uppercase tracking-wider text-[#a7b0b6] hover:text-[#fbbf24] hover:bg-[#1f1610] rounded">Methodology</Link>
                <Link to="/" onClick={() => setDrawerOpen(false)} className="px-3 py-2 text-[12px] font-mono uppercase tracking-wider text-[#a7b0b6] hover:text-[#fbbf24] hover:bg-[#1f1610] rounded">Home</Link>
              </div>
              <div className="px-2 py-2 flex flex-col">
                {NAV_TREE.map((node) => {
                  if (!node.children) {
                    // leaf
                    return (
                      <button
                        key={node.id}
                        onClick={() => pickLeaf(node.id)}
                        className={`flex items-center gap-3 px-3 py-3 text-[13px] font-mono uppercase tracking-wider rounded transition-colors text-left ${
                          active === node.id
                            ? 'bg-[#2a1d14] text-[#fbbf24]'
                            : 'text-[#a7b0b6] hover:text-[#fbbf24] hover:bg-[#1f1610]'
                        }`}
                      >
                        <node.icon className="w-4 h-4 shrink-0" />
                        {node.label}
                      </button>
                    );
                  }
                  // group: collapsible section
                  const expanded = expandedGroup === node.group;
                  const groupActive = activeGroup === node.group;
                  return (
                    <div key={node.group} className="flex flex-col">
                      <button
                        onClick={() => setExpandedGroup(expanded ? null : node.group)}
                        className={`flex items-center gap-3 px-3 py-3 text-[13px] font-mono uppercase tracking-wider rounded transition-colors text-left ${
                          groupActive ? 'text-[#fbbf24]' : 'text-[#a7b0b6]'
                        }`}
                      >
                        <node.icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1">{node.label}</span>
                        <ChevronDown
                          className={`w-4 h-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {expanded && (
                        <div className="ml-2 pl-3 border-l border-[#252e33] flex flex-col">
                          {node.children.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => pickLeaf(c.id)}
                              className={`flex items-center gap-3 px-3 py-2.5 text-[12px] font-mono uppercase tracking-wider rounded transition-colors text-left ${
                                active === c.id
                                  ? 'bg-[#2a1d14] text-[#fbbf24]'
                                  : 'text-[#a7b0b6] hover:text-[#fbbf24] hover:bg-[#1f1610]'
                              }`}
                            >
                              <c.icon className="w-3.5 h-3.5 shrink-0" />
                              {c.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        )}
      </>
    );
  }

  // Desktop: horizontal strip with dropdowns for groups
  return (
    <nav ref={navRef} className="sticky top-0 z-40 backdrop-blur-md bg-[#0a0d0f]/85 border-b border-[#252e33]">
      <div className="px-4 md:px-8 py-2 pr-[230px] flex items-center gap-y-1 gap-x-0.5 flex-wrap">
        <div className="font-mono text-[11px] text-[#c97b3f] tracking-[0.2em] mr-3 shrink-0">
          ◆ CABLE.LAB
        </div>
        {NAV_TREE.map((node) => {
          if (!node.children) {
            const isActive = active === node.id;
            return (
              <button
                key={node.id}
                onClick={() => pickLeaf(node.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer rounded-sm ${
                  isActive
                    ? 'text-[#fbbf24] border-b border-[#c97b3f] bg-[#2a1d14]'
                    : 'text-[#a7b0b6] hover:text-[#fbbf24] hover:bg-[#1f1610]'
                }`}
              >
                <node.icon className="w-3.5 h-3.5" />
                {node.label}
              </button>
            );
          }
          // group: dropdown
          const isOpen = openGroup === node.group;
          const groupActive = activeGroup === node.group;
          return (
            <div key={node.group} className="relative">
              <button
                onClick={() => setOpenGroup(isOpen ? null : node.group)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer rounded-sm ${
                  groupActive
                    ? 'text-[#fbbf24] border-b border-[#c97b3f] bg-[#2a1d14]'
                    : isOpen
                      ? 'text-[#fbbf24] bg-[#1f1610]'
                      : 'text-[#a7b0b6] hover:text-[#fbbf24] hover:bg-[#1f1610]'
                }`}
                aria-expanded={isOpen}
                aria-haspopup="menu"
              >
                <node.icon className="w-3.5 h-3.5" />
                {node.label}
                <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full mt-1 min-w-[200px] bg-[#0a0d0f] border border-[#252e33] rounded shadow-xl z-50 py-1"
                >
                  {node.children.map((c) => (
                    <button
                      key={c.id}
                      role="menuitem"
                      onClick={() => pickLeaf(c.id)}
                      className={`flex items-center gap-2 w-full px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-left transition-colors ${
                        active === c.id
                          ? 'bg-[#2a1d14] text-[#fbbf24]'
                          : 'text-[#a7b0b6] hover:text-[#fbbf24] hover:bg-[#1f1610]'
                      }`}
                    >
                      <c.icon className="w-3.5 h-3.5 shrink-0" />
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/* ============================================================
   App
   ============================================================ */
export default function CableApp() {
  const [section, setSection] = useState('home');
  const [recipeProduct, setRecipeProduct] = useState(null);

  const openRecipe = (product) => {
    setRecipeProduct(product);
    setSection('recipe');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // Subscribe to ProcessSim state so the agent gets it as context.extra when on the sim tab
  const [processSimState, setProcessSimState] = useState(null);
  useEffect(() => {
    const onUpdate = (e) => setProcessSimState(e.detail);
    window.addEventListener('processsim:state', onUpdate);
    return () => window.removeEventListener('processsim:state', onUpdate);
  }, []);

  const closeRecipe = () => {
    const returnTo = recipeProduct?.vendor === 'Glenair' ? 'catalog' : 'library';
    setRecipeProduct(null);
    setSection(returnTo);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return (
    <div className="min-h-screen bg-[#0a0d0f] text-[#f0ebe2]" style={{ fontFamily: 'Manrope, system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=JetBrains+Mono:wght@400;500;600&family=Manrope:wght@300;400;500;600&display=swap');
        body { font-family: Manrope, system-ui, sans-serif; }
        .font-mono, code { font-family: 'JetBrains Mono', monospace; }
        input[type='range'] { height: 4px; background: #252e33; border-radius: 2px; }
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          background: #c97b3f;
          border-radius: 50%;
          cursor: pointer;
          border: 1px solid #1a120c;
        }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #0a0d0f; }
        ::-webkit-scrollbar-thumb { background: #252e33; }
        ::-webkit-scrollbar-thumb:hover { background: #384249; }

        @keyframes strandFlowFwd {
          to { stroke-dashoffset: -40; }
        }
        @keyframes strandFlowBwd {
          to { stroke-dashoffset: 40; }
        }
        .strand-flow-fwd { animation: strandFlowFwd 2s linear infinite; }
        .strand-flow-bwd { animation: strandFlowBwd 2s linear infinite; }

        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
        .aperture-pulse { animation: pulse-glow 2.4s ease-in-out infinite; }

        @keyframes needle-settle {
          0% { transform: rotate(-3deg); }
          50% { transform: rotate(2deg); }
          100% { transform: rotate(0deg); }
        }

        /* ===== CLICKABLE AFFORDANCE STYLES ===== */
        @keyframes click-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(201, 123, 63, 0.5); }
          50% { box-shadow: 0 0 0 4px rgba(201, 123, 63, 0); }
        }
        @keyframes hint-dot {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }

        /* Clickable card — lighter background so content is visible */
        .click-card {
          position: relative;
          cursor: pointer;
          transition: all 0.18s ease;
          background: linear-gradient(165deg, #1d2329 0%, #161c20 60%, #131a1e 100%) !important;
          border-color: #2a343b !important;
        }
        .click-card::before {
          content: '';
          position: absolute;
          top: 0;
          right: 0;
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 0 20px 20px 0;
          border-color: transparent #c97b3f transparent transparent;
          opacity: 1;
          transition: border-width 0.18s, filter 0.18s;
          pointer-events: none;
          filter: drop-shadow(0 0 4px rgba(201, 123, 63, 0.5));
          z-index: 1;
        }
        .click-card:hover::before {
          border-width: 0 26px 26px 0;
          filter: drop-shadow(0 0 6px rgba(201, 123, 63, 0.8));
        }
        .click-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(201, 123, 63, 0.28), inset 0 1px 0 rgba(201, 123, 63, 0.2);
          background: linear-gradient(165deg, #2a1d14 0%, #1f1610 60%, #1a130d 100%) !important;
          border-color: #c97b3f !important;
        }

        /* Pulsing dot — for critical clickables (recipe, modal triggers) */
        .click-pulse-dot {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #5eead4;
          box-shadow: 0 0 12px #5eead4, 0 0 4px #5eead4;
          animation: hint-dot 2s ease-in-out infinite;
          pointer-events: none;
          z-index: 5;
        }

        /* Tappable button — segments, presets — lighter visible default */
        .tappable {
          cursor: pointer;
          transition: all 0.15s ease;
          position: relative;
        }
        .tappable::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(180deg, rgba(201, 123, 63, 0.06) 0%, transparent 100%);
          pointer-events: none;
          opacity: 0.6;
          transition: opacity 0.15s;
        }
        .tappable:hover {
          border-color: #c97b3f !important;
          box-shadow: 0 2px 8px rgba(201, 123, 63, 0.25), inset 0 1px 0 rgba(201, 123, 63, 0.15);
          filter: brightness(1.15);
        }
        .tappable:hover::after {
          opacity: 1;
        }
        .tappable:active {
          transform: scale(0.97);
        }

        /* Interactive segment — TDR, NEXT pair clicks */
        .interactive-zone {
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .interactive-zone:hover {
          filter: brightness(1.3);
        }
      `}</style>

      {section !== 'recipe' && <TopNav active={section} onChange={setSection} />}
      {section !== 'recipe' && section !== 'home' && <TabIntro section={section} />}

      <main className="max-w-6xl mx-auto px-4 md:px-12 py-12">
        {section === 'recipe' && <BuildRecipePage product={recipeProduct} onBack={closeRecipe} />}
        {section === 'home' && <HomeView setSection={setSection} />}
        {section === 'progression' && <ProgressionView />}
        {section === 'm1' && <ModuleConductor />}
        {section === 'm2' && <ModuleTwistedPair />}
        {section === 'm3' && <ModuleBundle />}
        {section === 'calc' && <ImpedanceCalc />}
        {section === 'tdr' && <TDRSim />}
        {section === 'vna' && <VNATest />}
        {section === 'sim' && <ProcessSim />}
        {section === 'braid' && <BraidCoverage />}
        {section === 'atten' && <AttenPlot />}
        {section === 'suckout' && <SuckoutSim />}
        {section === 'next' && <NEXTViz />}
        {section === 'eye' && <EyeDiagram />}
        {section === 'cost' && <CostCalc />}
        {section === 'qc' && <QCStats />}
        {section === '3d' && <Cable3D />}
        {section === 'lay' && <LayDesigner />}
        {section === 'library' && (
          <>
            <CompanyDefaultsPanel accentColor="#c97b3f" />
            <CustomCablesPanel side="cable" accentColor="#c97b3f" />
            <ProductLibrary onOpenRecipe={openRecipe} />
          </>
        )}
        {section === 'catalog' && <Catalog onOpenRecipe={openRecipe} />}
        {section === 'more' && <FurtherModules />}
      </main>

      {section !== 'recipe' && (
        <footer className="border-t border-[#252e33] py-8 mt-12">
          <div className="max-w-6xl mx-auto px-4 md:px-12">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="font-mono text-xs text-[#c97b3f] tracking-[0.2em] mb-2">◆ CABLE.LAB / v0.1 PROTOTYPE</div>
                <div className="text-xs text-[#6b7479]">
                  Reference: Glenair Series 963 SpeedLine · TIA-568.2-D · IEC 61156 · IEEE 802.3bq · ECSS-E-ST-50-12C · MIL-STD-1553B
                </div>
              </div>
              <div className="text-xs text-[#6b7479] font-mono">
                <span className="text-[#5eead4]">Z₀</span> = (276/√εᵣ) · log₁₀(2D/d)
              </div>
            </div>
          </div>
        </footer>
      )}

      <FloatingAgent
        accent="#c97b3f"
        accentBright="#e89357"
        label="◆ CABLE.LAB · AGENT"
        systemPrompt={CABLE_SYSTEM_PROMPT}
        starters={CABLE_STARTERS}
        contextStarters={cableContextStarters}
        roleDescription="Senior cable manufacturing engineer."
        topics={['Z₀ formulas', 'braid coverage', 'pair lay', 'TDR', 'VNA measurements']}
        placeholder="Ask about cable design, manufacturing, formulas…"
        storageKey="cablelab-chat-history"
        tools={CABLE_TOOLS}
        onToolUse={dispatchCableTool}
        onAttachData={summarizeTouchstoneFile}
        attachAccept="image/*,application/pdf,.pdf,.s1p,.s2p,.s3p,.s4p"
        context={{
          section,
          sectionLabel: SECTION_LABELS[section] || section,
          extra: section === 'sim' ? formatProcessSimContext(processSimState) : undefined,
        }}
        toolToSection={CABLE_TOOL_TO_SECTION}
        onJumpToSection={(target) => {
          // Process Sim consumes every preset locally (braid → stage ⑧, etc.) — don't tab-hop.
          if (section === 'sim') return;
          setSection(target);
        }}
      />
    </div>
  );
}
