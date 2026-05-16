import React, { useState, useMemo, useRef, useEffect, createContext, useContext } from "react";
import { Link } from "react-router-dom";
import { Activity, Flame, Gauge, Menu, Radio, Ruler, ShieldCheck, Sparkles, Weight, X as XIcon, Zap, ChevronDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import FloatingAgent from "../components/FloatingAgent.jsx";
import { RF_TOOLS, dispatchRfTool } from "../components/rfTools.js";
import CustomCablesPanel from "../components/CustomCablesPanel.jsx";
import CompanyDefaultsPanel from "../components/CompanyDefaultsPanel.jsx";
import ShopMemoryPanel from "../components/ShopMemoryPanel.jsx";
import RFStackLab from "../components/RFStackLab.jsx";
import MaterialLibrary from "../components/MaterialLibrary.jsx";
import { useIsMobile } from "../components/useIsMobile.js";
import { formatActiveShopRulesForPrompt, useShopMemory } from "../components/shopMemory.js";
import {
  RF_CABLES as CABLES,
  RF_CATEGORIES as CATEGORIES,
  RF_CABLE_IDS as CABLE_IDS,
  RF_SOURCE_CONFIDENCE,
  getRfCableSourceMeta,
  getRfCableSourceStats,
} from "../data/rfCableLibrary.js";

const RF_SYSTEM_PROMPT = `You are a senior RF cable engineer embedded in the RF Cable Engineering Suite. You have access to calculation tools — use them whenever a numeric answer is requested instead of relying on memorized constants.

Domain focus:
- Coaxial cable selection (RG-50/75/174/178/213, LMR-100/240/400/600, Heliax LDF/AVA, semi-rigid, phase-stable, video/broadcast)
- RF connectors (N, BNC, TNC, SMA, SMB, MMCX, F, 7-16 DIN, MCX) — gender, polarity, frequency limits, IL
- Link budget: TX → cable → connector → cable → RX with attenuation accounting
- Free-space path loss: FSPL = 32.45 + 20·log10(f_MHz) + 20·log10(d_km) dB
- Smith chart, return loss, VSWR, impedance matching, mismatch loss
- Velocity factor, Z₀, propagation delay, electrical length
- Frequency-dependent attenuation (skin effect √f, dielectric loss ∝f)
- Power handling (CW/peak), voltage rating, max VSWR
- 50 Ω vs 75 Ω systems, when each is used
- Noise figure cascade (Friis), IP3, dynamic range
- TDR, return loss measurement, time-to-distance via VF
- Manufacturers: Belden, Times Microwave, CommScope/Andrew, Pasternack, Harbour, Micro-Coax

Style:
- Concise, technically precise. 2–4 short paragraphs default.
- Show formulas in ASCII (FSPL = 32.45 + 20·log(f) + 20·log(d)). Use markdown sparingly.
- When asked "why", give physics intuition before the formula.
- If the user references a specific tab (Ask, Design, Library, Connectors, Link, Tools, Wizard, Cheat Sheet, Compare), tie the answer to what that tab does.
- If outside RF cable/connector scope, say so briefly and redirect.

Proactive behavior:
- When the user pastes a cable spec (datasheet excerpt, manufacturer table, etc.), ask if they want you to call \`add_cable\` to save it to their local library.
- When the user mentions an upcoming measurement, link, or radio link with concrete numbers, offer to run \`link_budget\` / \`compute_attenuation\` / \`compare_cables\` without being asked.
- When the user asks "which cable for…", run \`cable_selector\` instead of just listing options from memory.
- If the user attaches a PDF datasheet (📎 button accepts PDFs up to 32 MB), READ IT DIRECTLY. Extract the cable specs (id, name, Z₀ Ω, VF, OD mm, AWG, atten table { freq_MHz: dB_per_100ft }, datasheet URL) and offer to save via \`add_cable\` so it lands in the user's local RF library. Cite the page where each value appears.

Multi-tool orchestration (chain calls in one turn whenever the engineer's question implies multiple steps):
- "Plan a 2.4 GHz link to my AP 100 m away" → \`get_company_defaults\` (read preferred materials / pricing) → \`free_space_path_loss\` AND \`compute_attenuation\` for both cables in parallel → \`link_budget\` to combine. ONE response, parallel tool_use blocks where independent.
- "Compare LMR-400 vs RG-213 for a 50 m run" → \`lookup_rf_cable\` for both → \`compare_cables\` → \`compute_attenuation\` if specific freq/length given.
- "Save this datasheet" → \`add_cable\`. If the spec implies factory standardisation, also \`set_company_defaults\`.
- ALWAYS call \`get_company_defaults\` first when the user asks about cost, BOM, or picking materials. Use the values you read.
- When the user states a stable factory fact ("Cu is $11/kg here", "we always use SPC"), call \`set_company_defaults\` immediately to persist it.
- Shop-process self-learning is human-approved. When the engineer corrects you or says a reusable shop rule ("always", "never", "minimum", "prefer", "learn this", "remember this") about MI, PTFE taping, WTM settings, spiral shields, material selection, or QC, call \`propose_shop_rule\`. Do not treat proposed rules as active until they are approved in Shop Memory.
- Call \`get_shop_memory\` when shop-specific process rules could change the answer. Approved Shop Memory rules override generic practice unless they conflict with physics or safety; pending rules are informational only.
- Prefer parallel tool calls (multiple tool_use blocks in one turn) when calls are independent. Chain sequentially only when one feeds the next.

Cable-build requests ("can you build this cable…" / "tape stack to hit X% VP and Y Ω"):
- The user describes a target — e.g. "conductor 0.045 inch, hit 80% VP at 50 Ω". First call \`optimize_dielectric_stack\` to scan stocked PTFE tape/wrap/tension/pass combinations against Z0, VP, and dielectric OD. Then call \`design_dielectric_stack\` with the chosen stocked tape/wrap/tension settings when an MI download is needed. If the engineer gives a specific recipe, call \`validate_recipe_against_rf_stack\` before recommending Apply. These tools dry-run the recipe against the RF stack calculator before exposing an Apply preset. Only tell the user to click Apply if \`_preflight.allow_apply\` is true; if Apply is held, adjust the tool input/recipe or explain what failed.
- Auto-detect units: if the conductor OD is between 0.005 and 0.5 it is almost certainly inches (RF inner conductors are 0.020 / 0.032 / 0.045 / 0.057"); pass it as \`conductor_od_inch\`. If between 0.5 and 30 and the user said "mm", pass as \`conductor_od_mm\`.
- Default to a HD-inside / LD-outside MIX unless the user specifies otherwise — it gives the lowest dielectric loss while still hitting target VP.
- PTFE tape must come from the Material Library. Use real 962-96000 tape part numbers returned by \`design_dielectric_stack\` / \`lookup_material_library\`; do not invent tape thickness, density, or width when a library match exists.
- PTFE tape overlap is always one of the standard wraps: 50% (1/2 wrap), 66.7% (2/3 wrap), or 75% (3/4 wrap). Prefer 2/3 wrap for PTFE because it reduces shrink-back; use 1/2 wrap only when the target OD requires the lower single-pass build. One 2/3 wrap builds 3 tape thicknesses, smaller than two 1/2 wraps at 4 tape thicknesses with the same tape. For cable OD ≤ 0.051", also avoid 0.0375" tape width.
- WTM taping-head pitch set-point is OD-based: use the calibrated shop formula from MI-ST962-032-130 / 032-200, then clamp only if it falls below the 0.0390 in/rev machine minimum. Do not use tape width alone for PTFE pitch.
- SPC spiral flatwire width rule: width = dielectric OD × 3.14 ÷ 8 bobbins minus 10% gap. Use 962-96001 spiral stock and snap to the nearest catalog width.
- Shield-stack requests are part of cable-build work. If the user says first shield is SPC spiral, second shield is foil or helical flatwire, then braid, call \`design_shield_stack\` after \`design_dielectric_stack\` using the predicted dielectric OD. If the dielectric OD is already given, call \`design_shield_stack\` directly.
- Spiral means separate SPC flatwires running around the cable with no overlap. A 10% spiral gap means each gap between flatwire 1-2, 2-3, ... 8-1 is 10% of the equal bobbin spacing. Do not describe it like PTFE overlap.
- For shield materials, use real catalog families: 962-96001 for SPC spiral bobbin stock, 962-96004 for helical flatwire stock, 962-96003 for ALK foil. For braid, report total carriers, ends per carrier, picks/in, AWG, and predicted optical coverage.
- If the user asks for a blank manufacturing instruction / MI template, call \`generate_blank_mi_template\`; it returns the shop MI-ST962-032-130 .xlsx template as a downloadable Excel workbook.
- When \`design_dielectric_stack\` is used for a factory build, the tool returns a downloadable filled shop MI .xlsx based on MI-ST962-032-130. Tell the user to download it from the tool card; it fills the Taping (3-Bay) sheets with selected Material Library tape, lay direction, pitch set-point, tension, and OD after each wrap.
- Manufacturing rule (enforced by the tool): if conductor_od ≤ 0.091" (2.311 mm), tape thickness is auto-clamped to ≤ 10 mil (0.254 mm). The tool reports the clamp in its notes — surface that fact to the user so they understand why the recipe uses thinner tape with more passes.
- Before presenting an Apply button as the final answer, treat \`optimize_dielectric_stack\` / \`validate_recipe_against_rf_stack\` as the agent's calculator screenshot check: confirm the predicted dielectric OD, VP, and Z0 match the requested target. Do not rely on a visual-looking stack if the calculator says impedance is low or dielectric OD is low.
- Treat safety as a separate step from design. Any RF stack tool result may include \`_safety_audit\`, \`_machine_guard\`, \`_tolerance\`, and \`_mi_qa\`; summarize blockers/warnings before telling the engineer to Apply or download. If Apply is held, do not override it in prose.
- When the engineer attaches or references an image of a VNA/test report or handwritten MI actuals, read the visible values and call \`parse_actual_test_report\` with Z0, VP, final/outgoing OD, suckout/notch GHz, VSWR, S11/RL, insertion loss, capacitance, cable id, and notes. The returned Apply button fills the Measured Test Correlator.
- After designing, ALSO call \`compute_tape_notches\` in the same turn (parallel) to flag Bragg suckouts the build will produce. Warn explicitly when 2+ tape layers share the same pitch (coherent → strong notch).
- In the chat reply, summarise: targets → composition (HD% + LD%) → predicted final OD/VP/Z₀ → notch frequencies → preflight status. Say "click Apply" only when the returned tool card actually shows an Apply button. Always cite the small-conductor clamp note when it fires.

Inline diagrams (\`generate_diagram\` tool):
- Use it when a picture beats text. Kinds: smith_chart, atten_curve, cross_section, eye_diagram, z_step_chart, bargraph.
- "Plot this impedance on a Smith chart" → smith_chart with the impedances array.
- "Compare cable A vs B vs C attenuation" → bargraph or atten_curve with both tables overlaid.
- "What does a TDR with a kink at 30 m look like" → z_step_chart with synthesised z_trace.
- Always include \`title\` and short \`annotation\` so the engineer knows what they're looking at.

Disagree-and-justify (don't be a yes-man):
- When the engineer proposes something physically suspect, PUSH BACK with the physics reason. Examples: VSWR target < 1.05 across multi-octave (impossible without active match), cable rated 3 GHz used at 6 GHz, phase-stable claim for a flexible cable not actually phase-stable, link budget where antenna gain > 30 dBi for an omni.
- Be direct but respectful. State concern + physics + alternative.

Citations (every factual claim should be traceable):
- Attach a square-bracket tag after each numeric fact, formula, or standard. Format: \`[SOURCE]\` / \`[SOURCE p.N]\` / \`[SOURCE §X]\`.
- Common short-codes: WADELL (Wadell), POZAR (Pozar — Microwave Engineering), FRIIS (Friis path loss equation), SCTE51, ITUR (ITU-R recommendations), IEEE (IEEE specifications), DATASHEET-X (replace X with cable id).
- Example: "FSPL = 32.45 + 20·log f + 20·log d [FRIIS]"
- If you don't have a specific source, use \`[knowledge]\` and offer to look up.`;

const RF_STARTERS = [
  'Build link budget: 30 dBm @ 2.4 GHz, 100 m, RX -85 dBm, 10 ft LMR-400 each side',
  'Compare LMR-400 and RG-213 attenuation at 900 MHz',
  'Convert VSWR 1.5 to return loss and reflection coefficient',
  'Cascaded NF for [LNA: NF=1.5, G=20] + [filter: NF=1, G=-1] + [mixer: NF=8, G=-7]',
];

const RF_SECTION_LABELS = {
  home: 'Home (RF workbench overview)',
  design: 'Design',
  library: 'Library',
  connectors: 'Connectors',
  link: 'Link Budget',
  tools: 'Tools (NF / IP3 / Path / Smith)',
  failure: 'RF Failure Theater',
  launch: 'Connector Launch Lab',
  shielding: 'Shielding Effectiveness Lab',
  scanner: 'Near-field / EMI Scanner Lab',
  stack: 'RF Stack / Suckout / MI Lab',
  suckout: 'RF Stack / Suckout / MI Lab',
  dielectric: 'RF Stack / Suckout / MI Lab',
  materials: 'Material Library / MI Templates',
  wizard: 'Wizard',
  cheat: 'Cheat Sheet',
  compare: 'Compare',
};

const RF_SECTION_STARTERS = {
  home: [
    'What can this workbench do?',
    'Recommend a cable for a 2.4 GHz link, 80 m run',
    'Walk me through building a link budget',
    'Compare LMR-400 vs RG-213 at 900 MHz',
  ],
  link: [
    'Build link budget: 30 dBm @ 2.4 GHz, 100 m, RX -85 dBm, 10 ft LMR-400 each side',
    'How does antenna gain factor into the link margin?',
    'Compute FSPL at 2.4 GHz over 1 km',
    'What link margin is "enough" for outdoor 5 GHz Wi-Fi?',
  ],
  tools: [
    'Cascaded NF for [LNA: NF=1.5, G=20] + [mixer: NF=8, G=-7]',
    'Why does first-stage NF dominate?',
    'Convert VSWR 2.0 to return loss',
    'Compute mismatch loss between source VSWR 1.5 and load VSWR 1.8',
  ],
  failure: [
    'Show me how a crushed RF cable appears in TDR and return loss',
    'Which physical defects hurt high-frequency return loss most?',
    'What does a bad connector launch look like?',
    'How do I explain a foil gap to production using RF data?',
  ],
  launch: [
    'Tune an SMA launch for best return loss to 18 GHz',
    'What happens if the pin is too long at the connector?',
    'Show TDR and S11 for a dielectric gap at the ferrule',
    'Which connector launch dimensions should QC measure first?',
  ],
  shielding: [
    'Compare braid-only vs foil-braid shielding at 2.4 GHz',
    'How much does a foil seam gap reduce shielding effectiveness?',
    'What should production inspect for RF shielding leakage?',
    'Show shielding dB vs frequency for a quad-shield coax',
  ],
  scanner: [
    'Scan a coax for a foil seam leakage hotspot',
    'How would a bad connector bond look on a near-field probe?',
    'Compare E-field and H-field probes for a shield defect',
    'What production fix should I try after a pigtail leakage scan?',
  ],
  library: [
    'Compare LMR-400 and RG-213 attenuation at 900 MHz',
    'Specs for Heliax LDF4-50A',
    'Show me 75 Ω options',
    'Which cables work above 6 GHz?',
  ],
  connectors: [
    'Specs for N-type and SMA',
    'Highest-frequency connector in the database',
    'Difference between TNC and BNC',
    'Recommend a connector for 18 GHz',
  ],
  design: [
    'What εr does foamed PE typically have?',
    'Why pick 75 Ω over 50 Ω for video?',
    'Trade-off between dielectric loss and dielectric strength',
  ],
  stack: [
    'Build a cable: conductor 0.045", target 80% VP, 50 Ω',
    'What pitch puts PTFE suckout above 18 GHz?',
    'Compare foil overlap vs braid coverage for shield leakage',
    'How do SPC flatwire spiral and helical shields affect notches?',
  ],
  materials: [
    'Generate a blank MI Excel template',
    'Build me a cable: conductor 0.0113", 75% VP, 50 ohm, then generate MI',
    'Find a 5 mil low-density PTFE tape around 0.0750 inch wide',
    'Decode 962-96000-05L0750',
  ],
  dielectric: [
    'Build a cable: conductor 0.045", target 80% VP, 50 Ω',
    'Build a 75 Ω cable, conductor 0.032", VP 70%, all HD PTFE',
    'I have 0.0250 inch PTFE tape — what pitch for 2/3 wrap?',
    'Stack 2 layers of HD PTFE at the same pitch — what notch frequencies?',
    'Why does foamed PTFE have lower εᵣ?',
  ],
};

function rfContextStarters(ctx) {
  return RF_SECTION_STARTERS[ctx?.section] || RF_STARTERS;
}

const RF_TOOL_TO_SECTION = {
  link_budget:              { id: 'link',       label: 'Link Budget' },
  free_space_path_loss:     { id: 'tools',      label: 'Tools' },
  noise_figure_cascade:     { id: 'tools',      label: 'Tools' },
  vswr_to_rl:               { id: 'tools',      label: 'Tools' },
  mismatch_loss:            { id: 'tools',      label: 'Tools' },
  compute_attenuation:      { id: 'tools',      label: 'Tools' },
  lookup_rf_cable:          { id: 'library',    label: 'Library' },
  lookup_connector:         { id: 'connectors', label: 'Connectors' },
  lookup_material_library:  { id: 'materials', label: 'Material Library' },
  generate_blank_mi_template:{ id: 'materials', label: 'Material Library' },
  parse_actual_test_report:{ id: 'stack', label: 'RF Stack / Suckout / MI Lab' },
  design_dielectric_stack:  { id: 'stack', label: 'RF Stack / Suckout / MI Lab' },
  optimize_dielectric_stack:{ id: 'stack', label: 'RF Stack / Suckout / MI Lab' },
  validate_recipe_against_rf_stack:{ id: 'stack', label: 'RF Stack / Suckout / MI Lab' },
  design_shield_stack:      { id: 'stack', label: 'RF Stack / Suckout / MI Lab' },
  compute_tape_notches:     { id: 'stack', label: 'RF Stack / Suckout / MI Lab' },
  connector_launch_analyzer:{ id: 'tools', label: 'Tools' },
  shielding_effectiveness_predictor:{ id: 'tools', label: 'Tools' },
  sparameter_cascade:       { id: 'tools', label: 'Tools' },
  phase_delay_match:        { id: 'tools', label: 'Tools' },
  bend_crush_risk:          { id: 'tools', label: 'Tools' },
  thermal_power_derating:   { id: 'tools', label: 'Tools' },
  highspeed_compliance_checker:{ id: 'tools', label: 'Tools' },
};

const cableIdToModelSlug = (id) => `rf-${String(id)
  .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
  .replace(/_/g, "-")
  .toLowerCase()}`;
const getCableModelPath = (id, cable = CABLES[id]) => cable?.model || `/models/${cableIdToModelSlug(id)}.glb`;
const getCableMacroModelPath = (id, cable = CABLES[id]) => cable?.macroModel || getCableModelPath(id, cable).replace(/\.glb$/, "-macro.glb");
const withCableModel = (id, cable = CABLES[id]) => cable ? { ...cable, model: getCableModelPath(id, cable), macroModel: getCableMacroModelPath(id, cable) } : cable;

// ═══════════════════════════════════════════════════════════════
// RF CONNECTOR DATABASE
// ═══════════════════════════════════════════════════════════════
const CONNECTOR_CATEGORIES = {
  rugged:     { label: "Threaded Rugged",      color: "#f97316" },
  din:        { label: "Low-PIM Cellular",     color: "#38bdf8" },
  bayonet:    { label: "Bayonet Quick",        color: "#fbbf24" },
  precision:  { label: "Precision mmWave",     color: "#c084fc" },
  consumer:   { label: "Consumer / CATV",      color: "#9ca3af" },
  miniature:  { label: "Miniature Board",      color: "#34d399" },
  automotive: { label: "Automotive Keyed",     color: "#f43f5e" },
};

const CONNECTORS = {
  nType: { name: "N-type", cat: "rugged", alias: "MIL-C-39012, IEC 61169-16",
    z: 50, fMax: 11, maxPower: 1500, precisionFMax: 18,
    mate: "threaded", thread: "5/8-24 UNEF-2A", weatherproof: "variant (N-Wp)",
    sizeMm: 17, lengthMm: 32, massG: 25, cableOD: [5, 13],
    render: "/connector-renders/rf-connector-n-type.png",
    typicalIL: "<0.15 dB @ 11 GHz", typicalVSWR: "<1.2 @ 6 GHz",
    apps: "Cellular, broadcast, test, general outdoor 50Ω RF",
    pros: "Rugged, weatherproof variants, good power, ubiquitous",
    cons: "Larger than SMA, slow mate vs BNC, unsuitable for mmWave",
    typicalLoss: 0.15 },
  nType75: { name: "N-type 75Ω", cat: "rugged", alias: "N 75Ω variant",
    z: 75, fMax: 1.5, maxPower: 500, precisionFMax: 3,
    mate: "threaded", thread: "5/8-24 UNEF-2A", weatherproof: "variant",
    sizeMm: 17, lengthMm: 32, massG: 25, cableOD: [5, 13],
    render: "/connector-renders/rf-connector-n-type-75.png",
    typicalIL: "<0.2 dB @ 1 GHz", typicalVSWR: "<1.2 @ 1 GHz",
    apps: "Broadcast video, CATV trunk, satellite uplink",
    pros: "Rugged 75Ω option for long-run video",
    cons: "Mechanically identical to 50Ω N — easy to confuse",
    typicalLoss: 0.2 },
  tnc: { name: "TNC", cat: "rugged", alias: "Threaded Neill-Concelman",
    z: 50, fMax: 11, maxPower: 500,
    mate: "threaded", thread: "7/16-28 UNEF-2A", weatherproof: "variant",
    sizeMm: 12, lengthMm: 26, massG: 15, cableOD: [2.5, 6.5],
    render: "/connector-renders/rf-connector-tnc.png",
    typicalIL: "<0.15 dB @ 11 GHz", typicalVSWR: "<1.3 @ 6 GHz",
    apps: "GPS antenna, vibration-prone applications, handheld radios",
    pros: "Vibration-resistant (threaded BNC), smaller than N",
    cons: "Slower mate than BNC, less common than SMA/N",
    typicalLoss: 0.15 },
  sma: { name: "SMA", cat: "precision", alias: "SubMiniature A, MIL-C-39012",
    z: 50, fMax: 18, maxPower: 100, precisionFMax: 26.5,
    mate: "threaded", thread: "1/4-36 UNS-2A", weatherproof: "no",
    sizeMm: 8, lengthMm: 20, massG: 5, cableOD: [2, 7],
    render: "/connector-renders/rf-connector-sma.png",
    typicalIL: "<0.2 dB @ 18 GHz", typicalVSWR: "<1.3 @ 18 GHz",
    apps: "Bench test, RF modules, small boards, GPS receivers",
    pros: "Compact, widely available, good freq range, precision variants to 26.5 GHz",
    cons: "Low power (<100W), requires torque wrench for repeatability, wears after ~500 cycles",
    typicalLoss: 0.2 },
  smaR: { name: "RP-SMA", cat: "precision", alias: "Reverse Polarity SMA",
    z: 50, fMax: 18, maxPower: 100,
    mate: "threaded", thread: "1/4-36 UNS-2A", weatherproof: "no",
    sizeMm: 8, lengthMm: 20, massG: 5, cableOD: [2, 7],
    render: "/connector-renders/rf-connector-rp-sma.png",
    typicalIL: "<0.2 dB @ 18 GHz", typicalVSWR: "<1.3 @ 18 GHz",
    apps: "Wi-Fi consumer gear (FCC Part 15 anti-swap)",
    pros: "Mandated for consumer Wi-Fi to prevent high-gain antenna swap",
    cons: "Gender is reversed (male has socket) — non-interchangeable with SMA",
    typicalLoss: 0.2 },
  bnc: { name: "BNC", cat: "bayonet", alias: "Bayonet Neill-Concelman",
    z: 50, fMax: 4, maxPower: 500,
    mate: "bayonet", thread: "none (quarter-turn bayonet lock)", weatherproof: "no",
    sizeMm: 14, lengthMm: 28, massG: 15, cableOD: [3, 7],
    render: "/connector-renders/rf-connector-bnc.png",
    typicalIL: "<0.2 dB @ 4 GHz", typicalVSWR: "<1.3 @ 1 GHz",
    apps: "Test / oscilloscope probes, video (75Ω variant), legacy Ethernet (10Base2)",
    pros: "Fast quarter-turn mate, ubiquitous on lab equipment",
    cons: "Limited to ~4 GHz, bayonet lock loosens with vibration, both 50Ω and 75Ω exist (confusing)",
    typicalLoss: 0.2 },
  bnc75: { name: "BNC 75Ω", cat: "bayonet", alias: "75Ω video BNC",
    z: 75, fMax: 4, maxPower: 300,
    mate: "bayonet", thread: "none (bayonet)", weatherproof: "no",
    sizeMm: 14, lengthMm: 28, massG: 15, cableOD: [3, 7],
    render: "/connector-renders/rf-connector-bnc-75.png",
    typicalIL: "<0.2 dB @ 3 GHz", typicalVSWR: "<1.3 @ 1 GHz",
    apps: "HD-SDI broadcast, precision 75Ω video",
    pros: "Same mechanical shape as 50Ω BNC but matched to 75Ω",
    cons: "Visually identical to 50Ω BNC — check impedance marking; mating with wrong impedance → reflections",
    typicalLoss: 0.2 },
  fType: { name: "F-type", cat: "consumer", alias: "CATV F connector",
    z: 75, fMax: 3, maxPower: 100,
    mate: "threaded", thread: "7/16-28 UNEF-2A", weatherproof: "poor",
    sizeMm: 10, lengthMm: 18, massG: 5, cableOD: [5, 7.5],
    render: "/connector-renders/rf-connector-f-type.png",
    typicalIL: "<0.3 dB @ 1 GHz", typicalVSWR: "<1.4 @ 1 GHz",
    apps: "Cable TV drop, satellite LNB, home consumer RF",
    pros: "Cheap, uses cable's center conductor as pin — no pin to damage",
    cons: "Limited freq + power, mediocre weatherproofing, ~1.4 VSWR typical",
    typicalLoss: 0.3 },
  uhf: { name: "UHF (PL-259)", cat: "consumer", alias: "SO-239 / PL-259, misnomer",
    z: 50, fMax: 0.3, maxPower: 2000,
    mate: "threaded", thread: "5/8-24 UNEF-2A", weatherproof: "poor",
    sizeMm: 20, lengthMm: 40, massG: 35, cableOD: [5, 12],
    render: "/connector-renders/rf-connector-uhf-pl259.png",
    typicalIL: "<0.2 dB @ 300 MHz", typicalVSWR: "typically >1.5 above 300 MHz",
    apps: "Ham radio HF/VHF (1.8-300 MHz), CB, marine",
    pros: "Rugged mechanical, cheap, handles high power",
    cons: "NOT actually UHF — impedance discontinuity, poor VSWR >300 MHz, name is historical misnomer",
    typicalLoss: 0.3 },
  din716: { name: "7/16 DIN", cat: "din", alias: "Low-PIM cellular tower",
    z: 50, fMax: 7.5, maxPower: 2500,
    mate: "threaded", thread: "M29 × 1.5", weatherproof: "yes (IP67)",
    sizeMm: 28, lengthMm: 53, massG: 150, cableOD: [9, 16],
    render: "/connector-renders/rf-connector-716-din.png",
    typicalIL: "<0.1 dB @ 6 GHz", typicalVSWR: "<1.1 @ 2 GHz", typicalPIM: "-160 dBc (low-PIM)",
    apps: "Cellular base stations (2G/3G/4G), broadcast, high-power low-PIM",
    pros: "Excellent low-PIM (<-160 dBc), high power, weatherproof, precision",
    cons: "Large and heavy, expensive, being replaced by 4.3-10 for new installs",
    typicalLoss: 0.1 },
  din43: { name: "4.3-10", cat: "din", alias: "Compact low-PIM",
    z: 50, fMax: 6, maxPower: 1500,
    mate: "screw / push-pull / hand-screw", thread: "M13 × 0.75 or push-pull", weatherproof: "yes (IP68)",
    sizeMm: 13, lengthMm: 28, massG: 40, cableOD: [5, 12],
    render: "/connector-renders/rf-connector-43-10.png",
    typicalIL: "<0.1 dB @ 4 GHz", typicalVSWR: "<1.15 @ 2 GHz", typicalPIM: "-165 dBc",
    apps: "New 4G/5G base station deployments, small-cell, replacing 7/16 DIN",
    pros: "Smaller + lighter than 7/16 DIN, same low-PIM performance, multiple mating options (screw/push-pull)",
    cons: "Newer ecosystem — less second-source availability than 7/16 DIN",
    typicalLoss: 0.1 },
  k292: { name: "2.92mm (K)", cat: "precision", alias: "K-type, Anritsu",
    z: 50, fMax: 40, maxPower: 40,
    mate: "threaded", thread: "1/4-36 UNS-2A", weatherproof: "no",
    sizeMm: 8, lengthMm: 20, massG: 5, cableOD: [2, 5],
    render: "/connector-renders/rf-connector-292-k.png",
    typicalIL: "<0.3 dB @ 26 GHz", typicalVSWR: "<1.25 @ 26 GHz",
    apps: "mmWave test (Ka-band), 5G FR2 development, phased-array characterization",
    pros: "Mates with SMA mechanically (not recommended at high freq), 40 GHz bandwidth",
    cons: "Precision only — torque critical, easily damaged by over-tightening, expensive",
    typicalLoss: 0.3 },
  conn24: { name: "2.4mm", cat: "precision", alias: "50 GHz precision",
    z: 50, fMax: 50, maxPower: 20,
    mate: "threaded", thread: "M8 × 0.75", weatherproof: "no",
    sizeMm: 7, lengthMm: 18, massG: 4, cableOD: [2, 4],
    render: "/connector-renders/rf-connector-24mm.png",
    typicalIL: "<0.4 dB @ 40 GHz", typicalVSWR: "<1.25 @ 40 GHz",
    apps: "V-band VNA test, high-end 5G / satellite / radar mmWave",
    pros: "50 GHz bandwidth, mates with 1.85mm, precision lab-grade",
    cons: "Very low power, expensive, delicate — only for test / calibration use",
    typicalLoss: 0.4 },
  conn185: { name: "1.85mm (V)", cat: "precision", alias: "V-connector, Anritsu",
    z: 50, fMax: 67, maxPower: 10,
    mate: "threaded", thread: "M7 × 0.75", weatherproof: "no",
    sizeMm: 6, lengthMm: 16, massG: 3, cableOD: [2, 3.5],
    render: "/connector-renders/rf-connector-185mm.png",
    typicalIL: "<0.5 dB @ 50 GHz", typicalVSWR: "<1.3 @ 50 GHz",
    apps: "W-band VNA test, 67 GHz instrumentation, 5G FR2+ R&D",
    pros: "67 GHz bandwidth, mates with 2.4mm",
    cons: "Extremely low power (~10W), very delicate, precision torque required",
    typicalLoss: 0.5 },
  conn10: { name: "1.0mm (W)", cat: "precision", alias: "110 GHz precision",
    z: 50, fMax: 110, maxPower: 5,
    mate: "threaded", thread: "M3 × 0.25", weatherproof: "no",
    sizeMm: 4, lengthMm: 10, massG: 2, cableOD: [1, 2.5],
    render: "/connector-renders/rf-connector-10mm.png",
    typicalIL: "<0.8 dB @ 110 GHz", typicalVSWR: "<1.4 @ 110 GHz",
    apps: "Ultra-high-freq research, automotive radar 77-81 GHz, 6G / sub-THz",
    pros: "110 GHz bandwidth — state-of-the-art",
    cons: "Tiny, fragile, ~$500-1000 per connector, short life (~100 cycles)",
    typicalLoss: 0.8 },
  mcx: { name: "MCX", cat: "miniature", alias: "Micro Coax push-on",
    z: 50, fMax: 6, maxPower: 100,
    mate: "push-on snap", thread: "none (snap-lock)", weatherproof: "no",
    sizeMm: 5, lengthMm: 10, massG: 1.5, cableOD: [2, 4],
    render: "/connector-renders/rf-connector-mcx.png",
    typicalIL: "<0.2 dB @ 6 GHz", typicalVSWR: "<1.3 @ 4 GHz",
    apps: "GPS modules, compact board-level RF, handheld devices",
    pros: "Snap-on (no rotation), very small, fast mate",
    cons: "Limited power, loosens with vibration, not for outdoor",
    typicalLoss: 0.2 },
  mmcx: { name: "MMCX", cat: "miniature", alias: "Micro-Miniature Coax",
    z: 50, fMax: 6, maxPower: 50,
    mate: "push-on snap", thread: "none", weatherproof: "no",
    sizeMm: 3.5, lengthMm: 8, massG: 0.8, cableOD: [1.5, 3],
    render: "/connector-renders/rf-connector-mmcx.png",
    typicalIL: "<0.2 dB @ 6 GHz", typicalVSWR: "<1.3 @ 4 GHz",
    apps: "Very tight spaces, HDD / SSD antennas, wearables, IoT modules",
    pros: "Tiniest snap connector widely used, 360° rotation after mate",
    cons: "Very low power, fragile, easy to damage during mate",
    typicalLoss: 0.2 },
  smb: { name: "SMB", cat: "miniature", alias: "SubMiniature B",
    z: 50, fMax: 4, maxPower: 100,
    mate: "push-on snap", thread: "none", weatherproof: "no",
    sizeMm: 5, lengthMm: 11, massG: 1.8, cableOD: [2, 4],
    render: "/connector-renders/rf-connector-smb.png",
    typicalIL: "<0.3 dB @ 4 GHz", typicalVSWR: "<1.4 @ 2 GHz",
    apps: "Automotive (pre-FAKRA), industrial, modems",
    pros: "Push-on snap, cheaper than MCX, reliable mate",
    cons: "Lower freq ceiling than MCX (4 vs 6 GHz), becoming obsolete",
    typicalLoss: 0.3 },
  smp: { name: "SMP (GPO)", cat: "miniature", alias: "Board-level mmWave",
    z: 50, fMax: 40, maxPower: 50,
    mate: "blind-mate push-on", thread: "none (snap)", weatherproof: "no",
    sizeMm: 4, lengthMm: 9, massG: 1, cableOD: [1.5, 3],
    render: "/connector-renders/rf-connector-smp.png",
    typicalIL: "<0.3 dB @ 40 GHz", typicalVSWR: "<1.3 @ 26 GHz",
    apps: "mmWave modules, T/R modules, phased array board-level interconnect",
    pros: "Blind-mate (PCB-to-PCB), 40 GHz in tiny form factor",
    cons: "Board-level only, not meant for field mate, mechanical tolerance critical",
    typicalLoss: 0.3 },
  uFl: { name: "U.FL / IPEX-1", cat: "miniature", alias: "Hirose IPEX-1, MHF",
    z: 50, fMax: 6, maxPower: 10,
    mate: "push-on snap", thread: "none (snap-fit, ~30 mate cycles rated)", weatherproof: "no",
    sizeMm: 2.5, lengthMm: 3, massG: 0.05, cableOD: [0.81, 1.37],
    render: "/connector-renders/rf-connector-u-fl.png",
    typicalIL: "<0.3 dB @ 6 GHz", typicalVSWR: "<1.4 @ 3 GHz",
    apps: "Wi-Fi / BT / GPS / LTE module antenna ports, M.2 WLAN cards, IoT modules",
    pros: "Tiny footprint, industry-standard on nearly every wireless module, cheap in volume",
    cons: "Very fragile, ~30 mate cycles before contact fatigue, board-level only, needs specific extraction tool",
    typicalLoss: 0.3 },
  mhf4: { name: "MHF4 (IPEX-4)", cat: "miniature", alias: "Hirose MHF-4, W.FL",
    z: 50, fMax: 15, maxPower: 10,
    mate: "push-on snap", thread: "none (snap)", weatherproof: "no",
    sizeMm: 2.1, lengthMm: 2.5, massG: 0.03, cableOD: [0.81, 1.13],
    render: "/connector-renders/rf-connector-mhf4.png",
    typicalIL: "<0.4 dB @ 10 GHz", typicalVSWR: "<1.4 @ 6 GHz",
    apps: "M.2 5G / LTE-A / Wi-Fi 6E/7 modules, smartphone RF modems, low-profile IoT",
    pros: "Smaller and lower profile than U.FL, higher frequency ceiling (15 GHz), ideal for thin devices",
    cons: "Even more fragile than U.FL, not cross-mateable with U.FL/MHF, precision tooling required",
    typicalLoss: 0.4 },
  qma: { name: "QMA", cat: "rugged", alias: "Quick-SMA, push-pull snap",
    z: 50, fMax: 18, maxPower: 100,
    mate: "push-pull snap-latch", thread: "none (quick-lock)", weatherproof: "variant (IP67)",
    sizeMm: 9, lengthMm: 24, massG: 7, cableOD: [2, 7],
    render: "/connector-renders/rf-connector-qma.png",
    typicalIL: "<0.25 dB @ 18 GHz", typicalVSWR: "<1.3 @ 18 GHz",
    apps: "Small-cell, DAS, femtocell, racks requiring fast tool-less mate",
    pros: "Tool-less install (no torque wrench), ~10× faster mate than SMA, electrically equivalent",
    cons: "Slightly larger bulkhead than SMA, premium price vs SMA, newer ecosystem",
    typicalLoss: 0.25 },
  qn: { name: "QN", cat: "rugged", alias: "Quick-N push-pull",
    z: 50, fMax: 11, maxPower: 1500,
    mate: "push-pull snap-latch", thread: "none (quick-lock)", weatherproof: "yes (IP67)",
    sizeMm: 21, lengthMm: 40, massG: 32, cableOD: [5, 13],
    render: "/connector-renders/rf-connector-qn.png",
    typicalIL: "<0.15 dB @ 11 GHz", typicalVSWR: "<1.2 @ 6 GHz",
    apps: "Outdoor cellular feeders, base station jumpers needing fast field swap",
    pros: "Same RF performance as N, push-pull saves install time on busy tower work",
    cons: "Slightly bulkier than N, variant-dependent tooling, more expensive per connector",
    typicalLoss: 0.15 },
  conn35: { name: "3.5mm", cat: "precision", alias: "3.5mm precision (Amphenol, Rosenberger)",
    z: 50, fMax: 26.5, maxPower: 80, precisionFMax: 34,
    mate: "threaded", thread: "1/4-36 UNS-2A (mates with SMA / 2.92mm)", weatherproof: "no",
    sizeMm: 8, lengthMm: 20, massG: 5, cableOD: [2, 6],
    render: "/connector-renders/rf-connector-35mm.png",
    typicalIL: "<0.2 dB @ 26.5 GHz", typicalVSWR: "<1.15 @ 26.5 GHz",
    apps: "VNA test up to 26.5 GHz, 5G FR2 sub-6 development, precision metrology intermediate",
    pros: "Air dielectric (better than SMA), mechanically mates with SMA and K, 26.5 GHz repeatable",
    cons: "Cross-mating with plain SMA degrades performance > 12 GHz, torque wrench required, pricier than SMA",
    typicalLoss: 0.2 },
  apc7: { name: "APC-7 (7mm)", cat: "precision", alias: "7mm hermaphroditic, HP 85050",
    z: 50, fMax: 18, maxPower: 200, precisionFMax: 18,
    mate: "threaded, sexless (hermaphroditic)", thread: "M10 × 1 coupling collar", weatherproof: "no",
    sizeMm: 12, lengthMm: 30, massG: 40, cableOD: [3, 10],
    render: "/connector-renders/rf-connector-apc7.png",
    typicalIL: "<0.05 dB @ 18 GHz", typicalVSWR: "<1.04 @ 18 GHz",
    apps: "Primary lab reference, NIST-traceable cal kits, highest-accuracy VNA standard",
    pros: "No gender — either end mates, extreme repeatability (<0.001 dB cal drift), industry metrology baseline",
    cons: "Bulky, slow to mate (multi-turn collar), 18 GHz ceiling (superseded by 3.5mm/K for mmWave), very expensive",
    typicalLoss: 0.05 },
  fakra: { name: "FAKRA", cat: "automotive", alias: "ISO 20860, SMB-derived color-keyed",
    z: 50, fMax: 6, maxPower: 75,
    mate: "push-lock with keying tab", thread: "none (latch + color key)", weatherproof: "yes (sealed variant IP67)",
    sizeMm: 9, lengthMm: 19, massG: 4, cableOD: [2.5, 5],
    render: "/connector-renders/rf-connector-fakra.png",
    typicalIL: "<0.3 dB @ 3 GHz", typicalVSWR: "<1.4 @ 2 GHz",
    apps: "Automotive GPS (code A, blue), SDARS (code D, grey), DAB (code S, brown), LTE/5G (code I, violet), Wi-Fi (code K, red) — ISO color-coded",
    pros: "Vibration- and temp-cycle rated, color+mechanical keying prevents cross-mating of different services, standardized across OEMs",
    cons: "6 GHz freq ceiling, slower mate than push-on, primarily automotive ecosystem (hard to source outside auto supply chain)",
    typicalLoss: 0.3 },
  hn: { name: "HN (High-Voltage N)", cat: "rugged", alias: "MIL-C-3643 high-voltage N",
    z: 50, fMax: 4, maxPower: 5000,
    mate: "threaded", thread: "5/8-24 UNEF-2A (mates with plain N — DO NOT)", weatherproof: "yes",
    sizeMm: 20, lengthMm: 38, massG: 40, cableOD: [6, 13],
    render: "/connector-renders/rf-connector-hn.png",
    typicalIL: "<0.2 dB @ 1 GHz", typicalVSWR: "<1.3 @ 1 GHz",
    apps: "Broadcast transmitter final stages, plasma/NMR/MRI feeds, pulsed-RF test, medical imaging",
    pros: "5 kV DC working voltage, same outer envelope as N for retrofit, handles multi-kW CW",
    cons: "Looks identical to N — cross-mating causes arcing and destroys both connectors, label clearly; limited to ~4 GHz",
    typicalLoss: 0.2 },
  din1023: { name: "DIN 1.0/2.3", cat: "consumer", alias: "Mini-BNC 75Ω broadcast",
    z: 75, fMax: 10, maxPower: 50,
    mate: "snap-lock push-on", thread: "none (latch variant available)", weatherproof: "no",
    sizeMm: 5, lengthMm: 12, massG: 1.5, cableOD: [2, 5],
    render: "/connector-renders/rf-connector-din-1023.png",
    typicalIL: "<0.2 dB @ 6 GHz", typicalVSWR: "<1.3 @ 4.5 GHz",
    apps: "HD-SDI 3G/6G/12G-SDI broadcast patch panels, 4K/8K studio racks, high-density routing",
    pros: "~4× port density vs BNC, qualified for 12G-SDI (12 GHz bandwidth), fast push-lock, locking variant for rack stability",
    cons: "Lower mechanical durability than BNC, specialty crimp tooling, not intended for test-bench reuse",
    typicalLoss: 0.2 },
  bma: { name: "BMA (Blind-Mate)", cat: "miniature", alias: "SBMA / OSP-style blind-mate",
    z: 50, fMax: 22, maxPower: 50,
    mate: "blind-mate, spring-float", thread: "none (PCB-level self-alignment)", weatherproof: "no",
    sizeMm: 5, lengthMm: 10, massG: 1.5, cableOD: [1.5, 3],
    render: "/connector-renders/rf-connector-bma.png",
    typicalIL: "<0.3 dB @ 18 GHz", typicalVSWR: "<1.3 @ 18 GHz",
    apps: "Phased-array T/R module stacks, backplane-to-daughtercard RF, drawer / LRU modules",
    pros: "Self-aligning up to ~0.5 mm radial float, blind insertion with PCB guides, 22 GHz usable",
    cons: "Not field-serviceable, ~500 mate cycle life, needs precision alignment fixture during assembly",
    typicalLoss: 0.3 },
};

const CONNECTOR_IDS = Object.keys(CONNECTORS);

const MATERIALS = {
  air: { label: "Air", er: 1.00, tanD: 0.0000, Eb: 3.0 },
  pe_solid: { label: "Solid PE", er: 2.30, tanD: 0.0002, Eb: 22.0 },
  pe_foam: { label: "Foam PE", er: 1.50, tanD: 0.0003, Eb: 18.0 },
  ptfe: { label: "Solid PTFE", er: 2.10, tanD: 0.0002, Eb: 60.0 },
  ptfe_foam: { label: "Foam PTFE", er: 1.60, tanD: 0.0002, Eb: 50.0 },
  fep: { label: "FEP", er: 2.10, tanD: 0.0007, Eb: 60.0 },
};
const CONDUCTORS = {
  cu: { label: "Pure Copper", sigma: 5.96e7 },
  spc: { label: "Silver-Plated Copper", sigma: 6.30e7 },
  ccs: { label: "Copper-Clad Steel", sigma: 5.96e7 },
  cca: { label: "Copper-Clad Aluminum", sigma: 5.96e7 },
};

// ═══════════════════════════════════════════════════════════════
// UNIT CONVERSION & FORMAT HELPERS (context-aware)
// ═══════════════════════════════════════════════════════════════
const MM_PER_IN = 25.4;
const SettingsContext = createContext({ units: "both", showTools: false });

const fmt = (n, p = 2) => Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: p, maximumFractionDigits: p }) : "—";

// Format length (mm input)
function fmtLen(mm, units, p = 2) {
  if (!Number.isFinite(mm)) return "—";
  const inch = mm / MM_PER_IN;
  if (units === "imperial") return `${fmt(inch, p + 1)} in`;
  if (units === "both") return `${fmt(mm, p)} mm (${fmt(inch, p + 1)} in)`;
  return `${fmt(mm, p)} mm`;
}

// Format per-length metrics
function fmtMass(gpm, units, p = 1) {
  if (!Number.isFinite(gpm)) return "—";
  const lb_1000ft = gpm * 0.672;
  if (units === "imperial") return `${fmt(lb_1000ft, p)} lb/1000ft`;
  if (units === "both") return `${fmt(gpm, p)} g/m (${fmt(lb_1000ft, p)} lb/1000ft)`;
  return `${fmt(gpm, p)} g/m`;
}

function fmtLoss(dbPer100m, units, p = 2) {
  if (!Number.isFinite(dbPer100m)) return "—";
  const dbPer100ft = dbPer100m * 0.3048;
  if (units === "imperial") return `${fmt(dbPer100ft, p)} dB/100ft`;
  if (units === "both") return `${fmt(dbPer100m, p)} dB/100m (${fmt(dbPer100ft, p)} dB/100ft)`;
  return `${fmt(dbPer100m, p)} dB/100m`;
}

function fmtCap(pFm, units, p = 1) {
  if (!Number.isFinite(pFm)) return "—";
  const pFft = pFm * 0.3048;
  if (units === "imperial") return `${fmt(pFft, p)} pF/ft`;
  if (units === "both") return `${fmt(pFm, p)} pF/m (${fmt(pFft, p)} pF/ft)`;
  return `${fmt(pFm, p)} pF/m`;
}

// Compact length (for tight spaces — just value with unit tag)
function fmtLenCompact(mm, units, p = 2) {
  if (units === "imperial") return `${fmt(mm / MM_PER_IN, p + 1)}"`;
  return `${fmt(mm, p)}mm`;
}

// ═══════════════════════════════════════════════════════════════
// PURE CALCULATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function calcImpedance(d, D, er) { if (D <= d || er < 1) return NaN; return (138 / Math.sqrt(er)) * Math.log10(D / d); }
function calcVP(er) { return 100 / Math.sqrt(er); }
function calcCap(D, d, er) { return (55.63 * er) / Math.log(D / d); }
function calcInd(D, d) { return 200 * Math.log(D / d); }
function calcLossAtFreq(cable, fMHz) {
  if (!cable || !cable.atten) return NaN;
  const sorted = [...cable.atten].sort((a, b) => a[0] - b[0]);
  if (fMHz <= sorted[0][0]) return sorted[0][1] * Math.sqrt(fMHz / sorted[0][0]);
  if (fMHz >= sorted[sorted.length - 1][0]) { const last = sorted[sorted.length - 1]; return last[1] * Math.sqrt(fMHz / last[0]); }
  for (let i = 0; i < sorted.length - 1; i++) {
    if (fMHz >= sorted[i][0] && fMHz <= sorted[i + 1][0]) {
      const t = (Math.log(fMHz) - Math.log(sorted[i][0])) / (Math.log(sorted[i + 1][0]) - Math.log(sorted[i][0]));
      return sorted[i][1] + t * (sorted[i + 1][1] - sorted[i][1]);
    }
  }
  return NaN;
}
function calcVSWR(Z0, R, X = 0) {
  const numRe = R - Z0, numIm = X, denRe = R + Z0, denIm = X;
  const den2 = denRe * denRe + denIm * denIm;
  const gRe = (numRe * denRe + numIm * denIm) / den2;
  const gIm = (numIm * denRe - numRe * denIm) / den2;
  const gMag = Math.sqrt(gRe * gRe + gIm * gIm);
  return { gMag, vswr: (1 + gMag) / (1 - gMag), rl_dB: -20 * Math.log10(Math.max(gMag, 1e-10)), ml_dB: -10 * Math.log10(Math.max(1 - gMag * gMag, 1e-10)) };
}
function calcCutoff(D, d, er) { return 190.85 / (Math.sqrt(er) * (D + d) / 2); }
function calcBreakdown(Eb, d, D) { return Eb * (d / 2) * Math.log(D / d); }

// ═══════════════════════════════════════════════════════════════
// AGENT TOOLS (expanded)
// ═══════════════════════════════════════════════════════════════
function searchCables({ impedance, max_freq_min_ghz, category, flexibility, outdoor_rated, query }) {
  return Object.entries(CABLES).filter(([id, c]) => {
    if (impedance && c.z !== impedance) return false;
    if (max_freq_min_ghz && c.fMax < max_freq_min_ghz) return false;
    if (category && !CATEGORIES[c.cat].label.toLowerCase().includes(category.toLowerCase())) return false;
    if (flexibility === "flexible" && !["high", "medium"].includes(c.flex)) return false;
    if (flexibility === "rigid" && !["low", "none"].includes(c.flex)) return false;
    if (outdoor_rated === true && !c.outdoor) return false;
    if (query) { const q = query.toLowerCase(); if (!(c.name + " " + c.apps + " " + c.alias).toLowerCase().includes(q)) return false; }
    return true;
  }).map(([id, c]) => ({ id, name: c.name, impedance: c.z, max_freq_ghz: c.fMax, od_mm: c.OD, flexibility: c.flex, outdoor: c.outdoor, apps: c.apps })).slice(0, 10);
}

function getCableFullDetails({ cable_id }) {
  const c = CABLES[cable_id];
  if (!c) return { error: `Unknown '${cable_id}'. Available: ${CABLE_IDS.join(", ")}` };
  return { id: cable_id, name: c.name, category: CATEGORIES[c.cat].label, aliases: c.alias,
    electrical: { impedance: c.z, vp_pct: c.vp, cap_pF_m: c.cap, fmax_GHz: c.fMax, vmax_rms: c.vMax },
    mechanical: { d_mm: c.d, D_mm: c.D, shield_mm: c.shield, jacket_OD_mm: c.OD, mass_g_m: c.mass, flex: c.flex, outdoor: c.outdoor, power: c.power },
    construction: c.cons, manufacturing_process: c.proc,
    attenuation: c.atten.map(([f, a]) => ({ freq_MHz: f, loss_dB_100m: a })),
    applications: c.apps, makers: c.makers };
}

function compareCables({ cable_ids }) {
  const result = {};
  for (const id of cable_ids) {
    const c = CABLES[id];
    if (!c) { result[id] = { error: "not found" }; continue; }
    result[id] = { name: c.name, impedance: c.z, vp: c.vp, od_mm: c.OD, od_inch: (c.OD / 25.4).toFixed(3), mass_g_m: c.mass, fmax_ghz: c.fMax, flex: c.flex, outdoor: c.outdoor, loss_at_1GHz_dB_100m: calcLossAtFreq(c, 1000).toFixed(2), loss_at_2_4GHz_dB_100m: calcLossAtFreq(c, 2400).toFixed(2), construction_summary: `${c.cons.conductor} | ${c.cons.dielectric} | ${c.cons.shield}` };
  }
  return result;
}

function recommendCables({ frequency_mhz, length_m, max_loss_db, impedance, outdoor_required, flexibility_required, min_power_w }) {
  const results = [];
  for (const [id, c] of Object.entries(CABLES)) {
    if (impedance && c.z !== impedance) continue;
    if (outdoor_required && !c.outdoor) continue;
    if (flexibility_required && !["high", "medium"].includes(c.flex)) continue;
    if (frequency_mhz > c.fMax * 1000) continue;
    const lossPer100 = calcLossAtFreq(c, frequency_mhz);
    const total = (lossPer100 / 100) * length_m;
    if (max_loss_db && total > max_loss_db) continue;
    const powerClass = c.power === "high" ? 1000 : c.power === "medium" ? 200 : 50;
    if (min_power_w && powerClass < min_power_w) continue;
    results.push({ id, name: c.name, loss_db_100m: lossPer100.toFixed(2), total_loss_db: total.toFixed(2), mass_kg: (c.mass * length_m / 1000).toFixed(2), od_mm: c.OD, flex: c.flex, outdoor: c.outdoor, power_class: c.power, reason: `${c.flex} flex · ${c.outdoor ? "outdoor-rated" : "indoor"} · ${total.toFixed(1)}dB over ${length_m}m · OD ${c.OD}mm` });
  }
  results.sort((a, b) => parseFloat(a.total_loss_db) - parseFloat(b.total_loss_db));
  return { count: results.length, top_5: results.slice(0, 5) };
}

function toolCalcImpedance({ inner_diameter_mm, dielectric_diameter_mm, dielectric_constant }) {
  const z = calcImpedance(inner_diameter_mm, dielectric_diameter_mm, dielectric_constant);
  return { impedance_ohm: z.toFixed(2), vp_pct: calcVP(dielectric_constant).toFixed(2), ratio: (dielectric_diameter_mm / inner_diameter_mm).toFixed(3) };
}
function toolSolveDielectric({ target_impedance, inner_diameter_mm, dielectric_constant }) {
  const D = inner_diameter_mm * Math.pow(10, target_impedance * Math.sqrt(dielectric_constant) / 138);
  return { required_D_mm: D.toFixed(3), required_D_inch: (D / 25.4).toFixed(4), inner_diameter_mm, dielectric_constant };
}
function toolCalcLoss({ cable_id, frequency_mhz, length_m }) {
  const c = CABLES[cable_id];
  if (!c) return { error: `Unknown: ${cable_id}` };
  const per100 = calcLossAtFreq(c, frequency_mhz);
  const total = (per100 / 100) * length_m;
  return { cable: c.name, freq_mhz: frequency_mhz, length_m, loss_per_100m: per100.toFixed(2), loss_per_100ft: (per100 * 0.3048).toFixed(2), total_loss_db: total.toFixed(2), power_remaining_pct: (100 * Math.pow(10, -total / 10)).toFixed(1) };
}
function toolCalcVSWR({ line_impedance, load_resistance, load_reactance = 0 }) {
  const r = calcVSWR(line_impedance, load_resistance, load_reactance);
  return { vswr: r.vswr.toFixed(3), gamma_mag: r.gMag.toFixed(4), return_loss_db: r.rl_dB.toFixed(2), mismatch_loss_db: r.ml_dB.toFixed(4), power_reflected_pct: (r.gMag * r.gMag * 100).toFixed(3) };
}
function toolDiagnose({ cable_id, length_m, measurements }) {
  const c = CABLES[cable_id];
  if (!c) return { error: `Unknown: ${cable_id}` };
  const analysis = measurements.map(m => {
    const th = (calcLossAtFreq(c, m.freq_mhz) / 100) * length_m;
    return { freq_mhz: m.freq_mhz, measured_db: m.loss_db, theoretical_db: th.toFixed(3), excess_db: (m.loss_db - th).toFixed(3) };
  });
  const avgExcess = analysis.reduce((s, a) => s + parseFloat(a.excess_db), 0) / analysis.length;
  let diagnosis = "Measurements closely match theoretical. No anomaly.";
  if (avgExcess > 0.05 * length_m) {
    const first = parseFloat(analysis[0].excess_db);
    const last = parseFloat(analysis[analysis.length - 1].excess_db);
    const fRatio = analysis[analysis.length - 1].freq_mhz / analysis[0].freq_mhz;
    if (last / first > fRatio * 0.7) diagnosis = "Excess scales linearly with f → DIELECTRIC issue (moisture, contamination). Check jacket integrity and cable-end seals.";
    else if (last / first > Math.sqrt(fRatio) * 0.7) diagnosis = "Excess scales with √f → CONDUCTOR issue (oxidation, surface roughness, plating defect). Inspect for aged or unplated Cu.";
    else diagnosis = "Excess roughly constant across f → CONNECTOR or constant mismatch. Re-terminate connectors, verify torque.";
  }
  return { cable: c.name, analysis, avg_excess_db: avgExcess.toFixed(3), diagnosis };
}

// NEW: Link budget
function toolLinkBudget({ tx_power_dbm, frequency_mhz, cable_id_or_loss_db_100m, cable_length_m, n_connectors = 2, connector_il_db = 0.15, fspl_enabled = false, distance_km, tx_antenna_gain_dbi = 0, rx_antenna_gain_dbi = 0, rx_sensitivity_dbm }) {
  let cableLoss100m;
  let cableName = "custom";
  if (typeof cable_id_or_loss_db_100m === "string" && CABLES[cable_id_or_loss_db_100m]) {
    cableLoss100m = calcLossAtFreq(CABLES[cable_id_or_loss_db_100m], frequency_mhz);
    cableName = CABLES[cable_id_or_loss_db_100m].name;
  } else {
    cableLoss100m = parseFloat(cable_id_or_loss_db_100m);
  }
  const cableLoss = (cableLoss100m / 100) * cable_length_m;
  const connLoss = n_connectors * connector_il_db;
  const fspl = fspl_enabled && distance_km ? 32.44 + 20 * Math.log10(frequency_mhz) + 20 * Math.log10(distance_km) : 0;
  const rxPower = tx_power_dbm - cableLoss - connLoss + tx_antenna_gain_dbi + rx_antenna_gain_dbi - fspl;
  const margin = rx_sensitivity_dbm ? rxPower - rx_sensitivity_dbm : null;
  const verdict = margin === null ? "No sensitivity given" : margin > 20 ? "Excellent (>20 dB margin)" : margin > 10 ? "Good (10-20 dB margin)" : margin > 3 ? "Marginal (3-10 dB)" : margin > 0 ? "Poor (<3 dB)" : "LINK FAILS";
  return { cable: cableName, stages_db: { tx_power: tx_power_dbm, cable_loss: -cableLoss.toFixed(2), connector_loss: -connLoss.toFixed(2), tx_antenna: tx_antenna_gain_dbi, path_loss: fspl > 0 ? -fspl.toFixed(2) : 0, rx_antenna: rx_antenna_gain_dbi }, rx_power_dbm: rxPower.toFixed(2), margin_db: margin?.toFixed(2) ?? null, verdict };
}

// NEW: Connector suggestions
function toolSuggestConnectors({ cable_id, frequency_mhz, power_w }) {
  const c = CABLES[cable_id];
  if (!c) return { error: `Unknown cable: ${cable_id}` };
  const od = c.OD;
  const suggestions = [];
  const fGhz = frequency_mhz / 1000;
  if (c.z === 50) {
    if (od <= 3.5 && fGhz <= 6) suggestions.push({ connector: "MCX", freq_limit_ghz: 6, power_w: 200, note: "Compact snap-on, good for portable" });
    if (od <= 3.5 && fGhz <= 6) suggestions.push({ connector: "MMCX", freq_limit_ghz: 6, power_w: 100, note: "Smallest common RF connector" });
    if (od >= 2.5 && od <= 7 && fGhz <= 18) suggestions.push({ connector: "SMA", freq_limit_ghz: 18, power_w: 500, note: "Industry standard for microwave" });
    if (fGhz > 18 && fGhz <= 40) suggestions.push({ connector: "2.92mm (K)", freq_limit_ghz: 40, power_w: 500, note: "mmWave, mates with SMA mechanically" });
    if (od >= 5 && fGhz <= 11) suggestions.push({ connector: "N-type", freq_limit_ghz: 11, power_w: 2000, note: "Robust, weatherproof, outdoor RF" });
    if (od >= 6 && fGhz <= 7.5 && power_w && power_w > 1000) suggestions.push({ connector: "7/16 DIN", freq_limit_ghz: 7.5, power_w: 5000, note: "Cellular base station, high power" });
  } else if (c.z === 75) {
    if (fGhz <= 3) suggestions.push({ connector: "F-type", freq_limit_ghz: 3, power_w: 100, note: "Consumer TV, cable television" });
    if (fGhz <= 2) suggestions.push({ connector: "BNC (75Ω)", freq_limit_ghz: 2, power_w: 500, note: "Video and broadcast" });
  }
  suggestions.sort((a, b) => b.freq_limit_ghz - a.freq_limit_ghz);
  return { cable: c.name, impedance: c.z, cable_od_mm: od, suggestions: suggestions.slice(0, 4) };
}

// NEW: Validate custom design
function toolValidateDesign({ inner_diameter_mm, dielectric_diameter_mm, dielectric_constant, target_frequency_mhz, target_power_w }) {
  const warnings = [];
  const z = calcImpedance(inner_diameter_mm, dielectric_diameter_mm, dielectric_constant);
  const ratio = dielectric_diameter_mm / inner_diameter_mm;
  const fc = calcCutoff(dielectric_diameter_mm, inner_diameter_mm, dielectric_constant);
  if (ratio < 2) warnings.push("D/d ratio too low (<2): mechanical tolerance will dominate impedance variation");
  if (ratio > 10) warnings.push("D/d ratio too high (>10): high impedance, large OD for given power handling");
  if (Math.abs(z - 50) > 2 && Math.abs(z - 75) > 2) warnings.push(`Non-standard impedance ${z.toFixed(1)}Ω — verify system expects this`);
  if (target_frequency_mhz && target_frequency_mhz / 1000 > fc * 0.8) warnings.push(`Frequency ${target_frequency_mhz}MHz near/above cutoff ${fc.toFixed(1)}GHz — multi-mode propagation risk`);
  if (inner_diameter_mm < 0.3) warnings.push("Very small inner conductor: high DC resistance, handling difficulty");
  if (dielectric_diameter_mm > 25) warnings.push("Large dielectric OD: mechanical rigidity limits flex");
  return { impedance_ohm: z.toFixed(2), D_over_d: ratio.toFixed(2), cutoff_ghz: fc.toFixed(2), vp_pct: calcVP(dielectric_constant).toFixed(1), warnings, verdict: warnings.length === 0 ? "Design looks sound" : `${warnings.length} warning(s) to review` };
}

function toolLookupConnector({ impedance, min_freq_ghz, min_power_w, weatherproof_required, query }) {
  const matches = Object.entries(CONNECTORS).filter(([id, c]) => {
    if (impedance !== undefined && c.z !== impedance) return false;
    if (min_freq_ghz !== undefined && c.fMax < min_freq_ghz) return false;
    if (min_power_w !== undefined && c.maxPower < min_power_w) return false;
    if (weatherproof_required && !/^(yes|variant|ip)/i.test(c.weatherproof)) return false;
    if (query) { const q = query.toLowerCase(); if (!(c.name + " " + c.alias + " " + c.apps).toLowerCase().includes(q)) return false; }
    return true;
  }).map(([id, c]) => ({
    id, name: c.name, category: CONNECTOR_CATEGORIES[c.cat].label,
    impedance_ohm: c.z, max_freq_ghz: c.fMax, max_power_w: c.maxPower,
    mate: c.mate, thread: c.thread, weatherproof: c.weatherproof,
    body_size_mm: c.sizeMm, mass_g: c.massG,
    cable_od_min_mm: c.cableOD[0], cable_od_max_mm: c.cableOD[1],
    typical_il_db: c.typicalLoss, typical_il_spec: c.typicalIL, typical_vswr: c.typicalVSWR,
    applications: c.apps, pros: c.pros, cons: c.cons,
    pim_spec: c.typicalPIM || "not specified",
  }));
  return { count: matches.length, connectors: matches };
}

function toolAnalyzeLinkChain({ frequency_mhz, stages }) {
  if (!stages || !stages.length) return { error: "No stages provided" };
  let pwr = 0;
  const out = [];
  for (const seg of stages) {
    let loss = 0, label = seg.type, detail = "", warn = null;
    if (seg.type === "tx") {
      pwr = seg.power_dbm || 0; label = "TX"; detail = `${pwr} dBm transmit`;
    } else if (seg.type === "cable") {
      const c = CABLES[seg.cable_id];
      if (!c) { warn = `Cable '${seg.cable_id}' not in DB`; label = "?"; }
      else {
        if (frequency_mhz > c.fMax * 1000) warn = `Above cable fMax ${c.fMax} GHz`;
        loss = interpAtten(c.atten, frequency_mhz) * (seg.length_m || 0) / 100;
        label = c.name; detail = `${seg.length_m} m → ${loss.toFixed(2)} dB loss`;
        pwr -= loss;
      }
    } else if (seg.type === "connector") {
      const c = CONNECTORS[seg.connector_id];
      if (!c) { loss = 0.15; label = "Connector"; detail = `assumed 0.15 dB IL`; warn = `Connector '${seg.connector_id}' not in DB`; }
      else { loss = c.typicalLoss; label = c.name; detail = `${loss} dB IL`; if (frequency_mhz > c.fMax * 1000) warn = `Above connector fMax ${c.fMax} GHz`; }
      pwr -= loss;
    } else if (seg.type === "amp") { loss = -(seg.gain_db || 0); label = "Amplifier"; detail = `+${seg.gain_db} dB gain`; pwr -= loss; }
    else if (seg.type === "atten") { loss = seg.loss_db || 0; label = "Attenuator"; detail = `${loss} dB pad`; pwr -= loss; }
    else if (seg.type === "splitter") { const n = seg.n_way || 2; loss = SPLITTER_LOSS[n] || (10 * Math.log10(n) + 0.5); label = `${n}-way splitter`; detail = `÷${n} ports, ${loss.toFixed(1)} dB`; pwr -= loss; }
    else if (seg.type === "rx") { label = "RX"; detail = `sensitivity ${seg.sensitivity_dbm} dBm`; }
    out.push({ type: seg.type, label, loss_db: loss, power_out_dbm: pwr.toFixed(2), detail, warning: warn });
  }
  const first = out[0], last = out[out.length - 1];
  const rxSens = stages[stages.length - 1]?.sensitivity_dbm ?? -85;
  const txPwr = first?.power_out_dbm !== undefined ? Number(first.power_out_dbm) : 0;
  const rxPwr = last?.power_out_dbm !== undefined ? Number(last.power_out_dbm) : 0;
  const totalLoss = txPwr - rxPwr;
  const margin = rxPwr - rxSens;
  return {
    frequency_mhz, stages: out,
    tx_power_dbm: txPwr, rx_power_dbm: rxPwr, total_loss_db: totalLoss.toFixed(2),
    rx_sensitivity_dbm: rxSens, link_margin_db: margin.toFixed(2),
    link_closes: margin > 0,
    verdict: margin < 0 ? "BROKEN" : margin < 3 ? "MARGINAL" : margin < 10 ? "TIGHT" : margin < 20 ? "GOOD" : margin < 40 ? "EXCELLENT" : "OVERKILL",
  };
}

function toolCalcNFCascade({ stages }) {
  if (!stages || !stages.length) return { error: "No stages" };
  let F_total = 1, G_cum = 1, G_cum_dB = 0;
  let iip3_inv = 0;
  const per = [];
  stages.forEach((s, i) => {
    const F = Math.pow(10, s.nf_db / 10);
    const G = Math.pow(10, s.gain_db / 10);
    if (i === 0) F_total = F; else F_total += (F - 1) / G_cum;
    if (s.oip3_dbm !== undefined) {
      const iip3_lin = Math.pow(10, ((s.oip3_dbm - s.gain_db) - 30) / 10);
      iip3_inv += G_cum / iip3_lin;
    }
    G_cum *= G;
    G_cum_dB += s.gain_db;
    per.push({ stage: s.name || `stage ${i + 1}`, gain_db: s.gain_db, nf_db: s.nf_db, cum_nf_db: (10 * Math.log10(F_total)).toFixed(2), cum_gain_db: G_cum_dB.toFixed(1) });
  });
  const nf_total = 10 * Math.log10(F_total);
  const iip3 = iip3_inv > 0 ? 10 * Math.log10(1 / iip3_inv) + 30 : null;
  return {
    nf_total_db: nf_total.toFixed(2),
    total_gain_db: G_cum_dB.toFixed(1),
    noise_temperature_k: (290 * (F_total - 1)).toFixed(1),
    iip3_total_dbm: iip3 !== null ? iip3.toFixed(1) : "not provided",
    oip3_total_dbm: iip3 !== null ? (iip3 + G_cum_dB).toFixed(1) : "not provided",
    per_stage: per,
    note: "First stage NF dominates. Put a low-NF LNA early in the chain before any lossy element.",
  };
}

function toolCalcDistortion({ pin_per_tone_dbm, gain_db, oip3_dbm, p1db_out_dbm, f1_mhz, f2_mhz }) {
  const pout = pin_per_tone_dbm + gain_db;
  const iip3 = oip3_dbm - gain_db;
  const p1db_in = p1db_out_dbm !== undefined ? p1db_out_dbm - gain_db : null;
  const pim3_out = 3 * pout - 2 * oip3_dbm;
  const fund_minus_im3 = pout - pim3_out;
  const in_compression = p1db_out_dbm !== undefined && pout > p1db_out_dbm;
  const near_compression = p1db_out_dbm !== undefined && pout > p1db_out_dbm - 5;
  const kTB = -174 + 10 * Math.log10(1e6); // 1 MHz BW
  const noise_floor = kTB + 6;
  const sfdr = (2 / 3) * (iip3 - noise_floor);
  return {
    pout_dbm: pout.toFixed(1),
    iip3_dbm: iip3.toFixed(1),
    p1db_in_dbm: p1db_in !== null ? p1db_in.toFixed(1) : "not provided",
    pim3_out_dbm: pim3_out.toFixed(1),
    pim3_in_dbm: (pim3_out - gain_db).toFixed(1),
    fundamental_to_im3_dbc: fund_minus_im3.toFixed(1),
    sfdr_db: sfdr.toFixed(1),
    in_compression,
    near_compression,
    verdict: in_compression ? "AMP IN COMPRESSION — reduce input" : near_compression ? "Within 5 dB of P1dB — nonlinear region" : "Linear operation",
    im_products: (f1_mhz && f2_mhz) ? {
      f1_mhz, f2_mhz,
      im3_low_mhz: 2 * f1_mhz - f2_mhz,
      im3_high_mhz: 2 * f2_mhz - f1_mhz,
      im5_low_mhz: 3 * f1_mhz - 2 * f2_mhz,
      im5_high_mhz: 3 * f2_mhz - 2 * f1_mhz,
    } : null,
    note: "Rule of thumb: P1dB ≈ OIP3 - 10 to 15 dB. IM3 grows 3× faster than fundamental.",
  };
}

function toolCalcPathLoss({ frequency_mhz, distance_km, tx_power_dbm, tx_antenna_gain_dbi = 0, rx_antenna_gain_dbi = 0, rx_sensitivity_dbm = -85, tx_cable_loss_db = 0, rx_cable_loss_db = 0 }) {
  const fspl = 32.45 + 20 * Math.log10(frequency_mhz) + 20 * Math.log10(distance_km);
  const eirp = tx_power_dbm + tx_antenna_gain_dbi - tx_cable_loss_db;
  const rx_power = eirp - fspl + rx_antenna_gain_dbi - rx_cable_loss_db;
  const margin = rx_power - rx_sensitivity_dbm;
  const wavelength_m = 300 / frequency_mhz;
  const fresnel_m = 0.6 * Math.sqrt(wavelength_m * distance_km * 1000 / 4);
  const fspl_max = tx_power_dbm + tx_antenna_gain_dbi - tx_cable_loss_db - rx_sensitivity_dbm + rx_antenna_gain_dbi - rx_cable_loss_db;
  const max_dist_km = Math.pow(10, (fspl_max - 32.45 - 20 * Math.log10(frequency_mhz)) / 20);
  return {
    fspl_db: fspl.toFixed(2),
    eirp_dbm: eirp.toFixed(1),
    rx_power_dbm: rx_power.toFixed(1),
    link_margin_db: margin.toFixed(1),
    link_closes: margin > 0,
    wavelength_m: wavelength_m.toFixed(3),
    fresnel_zone_1_radius_m: fresnel_m.toFixed(2),
    max_theoretical_range_km: max_dist_km.toFixed(2),
    verdict: margin < 0 ? "BROKEN" : margin < 10 ? "TIGHT (recommend 10+ dB margin)" : margin < 20 ? "GOOD" : "EXCELLENT",
    note: "FSPL assumes clear line-of-sight. Real links have additional losses: rain, foliage, atmosphere, multipath.",
  };
}

const TOOLS = [
  { name: "search_cables", description: "Search cable database by criteria. Returns matching cables.", input_schema: { type: "object", properties: { impedance: { type: "number" }, max_freq_min_ghz: { type: "number" }, category: { type: "string" }, flexibility: { type: "string", enum: ["flexible", "rigid"] }, outdoor_rated: { type: "boolean" }, query: { type: "string" } } } },
  { name: "get_cable_details", description: "Full specs including construction and manufacturing process. Use cable id ('rg58','lmr400',etc).", input_schema: { type: "object", properties: { cable_id: { type: "string" } }, required: ["cable_id"] } },
  { name: "compare_cables", description: "Side-by-side comparison of 2-5 cables. Returns key electrical, mechanical, and loss values.", input_schema: { type: "object", properties: { cable_ids: { type: "array", items: { type: "string" } } }, required: ["cable_ids"] } },
  { name: "recommend_cables", description: "Rank cables by suitability for requirements. Returns top 5 ordered by loss.", input_schema: { type: "object", properties: { frequency_mhz: { type: "number" }, length_m: { type: "number" }, max_loss_db: { type: "number" }, impedance: { type: "number" }, outdoor_required: { type: "boolean" }, flexibility_required: { type: "boolean" }, min_power_w: { type: "number" } }, required: ["frequency_mhz", "length_m"] } },
  { name: "calculate_impedance", description: "Calculate Z₀ and VP from geometry", input_schema: { type: "object", properties: { inner_diameter_mm: { type: "number" }, dielectric_diameter_mm: { type: "number" }, dielectric_constant: { type: "number" } }, required: ["inner_diameter_mm", "dielectric_diameter_mm", "dielectric_constant"] } },
  { name: "solve_dielectric_diameter", description: "Reverse-solve: what dielectric OD gives target impedance", input_schema: { type: "object", properties: { target_impedance: { type: "number" }, inner_diameter_mm: { type: "number" }, dielectric_constant: { type: "number" } }, required: ["target_impedance", "inner_diameter_mm", "dielectric_constant"] } },
  { name: "calculate_loss", description: "Total loss for specific cable at freq over length", input_schema: { type: "object", properties: { cable_id: { type: "string" }, frequency_mhz: { type: "number" }, length_m: { type: "number" } }, required: ["cable_id", "frequency_mhz", "length_m"] } },
  { name: "calculate_vswr", description: "VSWR, return loss, mismatch loss from impedance mismatch", input_schema: { type: "object", properties: { line_impedance: { type: "number" }, load_resistance: { type: "number" }, load_reactance: { type: "number" } }, required: ["line_impedance", "load_resistance"] } },
  { name: "diagnose_loss_anomaly", description: "Classify excess loss by frequency signature (conductor/dielectric/connector)", input_schema: { type: "object", properties: { cable_id: { type: "string" }, length_m: { type: "number" }, measurements: { type: "array", items: { type: "object", properties: { freq_mhz: { type: "number" }, loss_db: { type: "number" } } } } }, required: ["cable_id", "length_m", "measurements"] } },
  { name: "calculate_link_budget", description: "Full signal-chain analysis: TX power through cable, connectors, optional wireless path to RX. Returns stage-by-stage power and margin.", input_schema: { type: "object", properties: { tx_power_dbm: { type: "number" }, frequency_mhz: { type: "number" }, cable_id_or_loss_db_100m: { type: "string", description: "Either cable id like 'lmr400' or numeric loss per 100m" }, cable_length_m: { type: "number" }, n_connectors: { type: "number" }, connector_il_db: { type: "number" }, fspl_enabled: { type: "boolean" }, distance_km: { type: "number" }, tx_antenna_gain_dbi: { type: "number" }, rx_antenna_gain_dbi: { type: "number" }, rx_sensitivity_dbm: { type: "number" } }, required: ["tx_power_dbm", "frequency_mhz", "cable_id_or_loss_db_100m", "cable_length_m"] } },
  { name: "suggest_connectors", description: "Recommend suitable connectors for a cable based on OD, impedance, and operating frequency", input_schema: { type: "object", properties: { cable_id: { type: "string" }, frequency_mhz: { type: "number" }, power_w: { type: "number" } }, required: ["cable_id", "frequency_mhz"] } },
  { name: "validate_custom_design", description: "Review a custom cable geometry for engineering issues — flags anti-patterns and warnings", input_schema: { type: "object", properties: { inner_diameter_mm: { type: "number" }, dielectric_diameter_mm: { type: "number" }, dielectric_constant: { type: "number" }, target_frequency_mhz: { type: "number" }, target_power_w: { type: "number" } }, required: ["inner_diameter_mm", "dielectric_diameter_mm", "dielectric_constant"] } },
  { name: "lookup_connector", description: "Search the 20-connector RF connector database by impedance, freq, power, or query string. Returns matches with specs (IL, VSWR, mating, weatherproof, cable-OD compat).", input_schema: { type: "object", properties: { impedance: { type: "number", description: "50 or 75 ohm" }, min_freq_ghz: { type: "number" }, min_power_w: { type: "number" }, weatherproof_required: { type: "boolean" }, query: { type: "string", description: "name / family keyword (e.g., 'N', 'SMA', 'DIN')" } } } },
  { name: "analyze_link_chain", description: "Analyze a multi-segment RF link chain (TX → cable → connector → amp → splitter → RX) with accurate per-segment loss + running power + link margin. Use this when user describes a multi-component system.", input_schema: { type: "object", properties: { frequency_mhz: { type: "number" }, stages: { type: "array", description: "Ordered list of segments. First must be type='tx', last must be type='rx'.", items: { type: "object", properties: { type: { type: "string", enum: ["tx", "cable", "connector", "amp", "atten", "splitter", "rx"] }, power_dbm: { type: "number", description: "for tx" }, sensitivity_dbm: { type: "number", description: "for rx" }, cable_id: { type: "string" }, length_m: { type: "number" }, connector_id: { type: "string" }, gain_db: { type: "number", description: "for amp" }, loss_db: { type: "number", description: "for atten/custom" }, n_way: { type: "number", description: "for splitter: 2,3,4,6,8,16" } } } } }, required: ["frequency_mhz", "stages"] } },
  { name: "calculate_nf_cascade", description: "Cascaded noise figure + IP3 using Friis formula for a chain of amplifiers, mixers, cables, or lossy elements. Returns total NF, gain, noise temperature, and cascaded IP3.", input_schema: { type: "object", properties: { stages: { type: "array", items: { type: "object", properties: { name: { type: "string" }, gain_db: { type: "number" }, nf_db: { type: "number" }, oip3_dbm: { type: "number", description: "optional, for IP3 cascade" } }, required: ["gain_db", "nf_db"] } } }, required: ["stages"] } },
  { name: "calculate_distortion", description: "Amplifier distortion: IM3 power, 1-dB compression, SFDR from Pin, Gain, OIP3, and P1dB. Also computes IM product frequencies if f1/f2 provided.", input_schema: { type: "object", properties: { pin_per_tone_dbm: { type: "number" }, gain_db: { type: "number" }, oip3_dbm: { type: "number" }, p1db_out_dbm: { type: "number" }, f1_mhz: { type: "number" }, f2_mhz: { type: "number" } }, required: ["pin_per_tone_dbm", "gain_db", "oip3_dbm"] } },
  { name: "calculate_path_loss", description: "Free-space path loss (Friis) for a wireless hop: FSPL, EIRP, received power, link margin, Fresnel zone, max theoretical range.", input_schema: { type: "object", properties: { frequency_mhz: { type: "number" }, distance_km: { type: "number" }, tx_power_dbm: { type: "number" }, tx_antenna_gain_dbi: { type: "number" }, rx_antenna_gain_dbi: { type: "number" }, rx_sensitivity_dbm: { type: "number" }, tx_cable_loss_db: { type: "number" }, rx_cable_loss_db: { type: "number" } }, required: ["frequency_mhz", "distance_km", "tx_power_dbm"] } },
  { name: "synth_s11_sweep", description: "Generate a synthetic |S11| frequency sweep in Touchstone .s1p format for the TDR / S-params viewer. Use when the user asks to plot / visualise return-loss or S-parameters of a cable, connector mismatch, or arbitrary resistive load. Output text is plottable directly.", input_schema: { type: "object", properties: { cable_id: { type: "string", description: "optional — database cable id (adds a gaussian mismatch bump around bump_mhz)" }, line_impedance: { type: "number", description: "system Z0, default 50" }, load_impedance: { type: "number", description: "optional — real resistive load for constant-VSWR sweep" }, freq_min_mhz: { type: "number" }, freq_max_mhz: { type: "number" }, n_points: { type: "number", description: "5-60, default 15" }, bump_mhz: { type: "number", description: "frequency of the simulated mismatch bump, default = mid-band" }, bump_depth_db: { type: "number", description: "depth of the bump above the baseline return loss, default 10 dB" }, note: { type: "string", description: "free-form comment written into the s1p header" } }, required: ["freq_min_mhz", "freq_max_mhz"] } },
];

function executeTool(name, input) {
  try {
    switch (name) {
      case "search_cables": return searchCables(input);
      case "get_cable_details": return getCableFullDetails(input);
      case "compare_cables": return compareCables(input);
      case "recommend_cables": return recommendCables(input);
      case "calculate_impedance": return toolCalcImpedance(input);
      case "solve_dielectric_diameter": return toolSolveDielectric(input);
      case "calculate_loss": return toolCalcLoss(input);
      case "calculate_vswr": return toolCalcVSWR(input);
      case "diagnose_loss_anomaly": return toolDiagnose(input);
      case "calculate_link_budget": return toolLinkBudget(input);
      case "suggest_connectors": return toolSuggestConnectors(input);
      case "validate_custom_design": return toolValidateDesign(input);
      case "lookup_connector": return toolLookupConnector(input);
      case "analyze_link_chain": return toolAnalyzeLinkChain(input);
      case "calculate_nf_cascade": return toolCalcNFCascade(input);
      case "calculate_distortion": return toolCalcDistortion(input);
      case "calculate_path_loss": return toolCalcPathLoss(input);
      case "synth_s11_sweep": return toolSynthS11(input);
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch (e) { return { error: e.message }; }
}

// ═══════════════════════════════════════════════════════════════
// Agent tool-input → sub-tool state mappers (for "Jump to tool" auto-fill)
// ═══════════════════════════════════════════════════════════════
const _pid = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function mapAgentStageToNF(s, idx) {
  return {
    id: `${_pid()}-${idx}`,
    name: s.name || `Stage ${idx + 1}`,
    gain: Number(s.gain_db) || 0,
    nf: Number(s.nf_db) || 0,
    oip3: Number(s.oip3_dbm ?? 30),
  };
}

function mapAgentSegToLink(s, idx) {
  const out = { id: `${_pid()}-${idx}`, type: s.type };
  switch (s.type) {
    case "tx": out.power = Number(s.power_dbm ?? 30); break;
    case "rx": out.sensitivity = Number(s.sensitivity_dbm ?? -85); break;
    case "cable": out.cableId = s.cable_id; out.lengthM = Number(s.length_m) || 1; break;
    case "connector": out.connectorId = s.connector_id; break;
    case "amp": out.gain = Number(s.gain_db) || 0; break;
    case "atten": out.loss = Number(s.loss_db) || 0; break;
    case "splitter": out.nWay = Number(s.n_way) || 2; break;
    case "custom": out.loss = Number(s.loss_db) || 0; out.label = s.name || "Custom"; break;
    default: break;
  }
  return out;
}

// Pick a plausible frequency hint from any agent tool input block (for Smith)
function pickFreqFromInputs(inputsByName) {
  if (!inputsByName) return null;
  const order = ["calculate_path_loss", "analyze_link_chain", "calculate_link_budget", "calculate_nf_cascade", "calculate_distortion", "synth_s11_sweep"];
  for (const k of order) {
    const inp = inputsByName[k];
    if (!inp) continue;
    if (inp.frequency_mhz) return Number(inp.frequency_mhz);
    if (inp.freq_mhz) return Number(inp.freq_mhz);
    if (inp.f1_mhz) return Number(inp.f1_mhz);
    if (inp.freq_min_mhz && inp.freq_max_mhz) return (Number(inp.freq_min_mhz) + Number(inp.freq_max_mhz)) / 2;
  }
  return null;
}

// Compute Γ (reflection coefficient) from load (R+jX) on line Z₀
function reflectionFromLoad(R, X, Z0) {
  const Zr = Number(R), Zi = Number(X) || 0, Z = Number(Z0) || 50;
  const denom = (Zr + Z) * (Zr + Z) + Zi * Zi;
  if (denom < 1e-12) return null;
  return {
    gR: (Zr * Zr - Z * Z + Zi * Zi) / denom,
    gI: (2 * Zi * Z) / denom,
  };
}

// Deterministic S11 sweep generator (shared by the agent tool AND the TDR auto-fill chip,
// so the preset matches the data the agent just reasoned about).
function synthesizeS11SweepText({ cable_id, line_impedance = 50, load_impedance, freq_min_mhz, freq_max_mhz, n_points = 15, note, bump_mhz, bump_depth_db = 10 }) {
  const fMin = Number(freq_min_mhz), fMax = Number(freq_max_mhz);
  if (!Number.isFinite(fMin) || !Number.isFinite(fMax) || fMax <= fMin) return null;
  const N = Math.max(5, Math.min(60, Math.round(Number(n_points) || 15)));
  const ratio = fMax / fMin;
  const freqs = [];
  if (ratio > 10) {
    for (let k = 0; k < N; k++) freqs.push(fMin * Math.pow(ratio, k / (N - 1)));
  } else {
    for (let k = 0; k < N; k++) freqs.push(fMin + (fMax - fMin) * k / (N - 1));
  }
  const z0 = Number(line_impedance) || 50;
  const bump_f = Number(bump_mhz) || ((fMin + fMax) / 2);
  const bump_w = (fMax - fMin) * 0.12 + 1;
  const hasCable = cable_id && CABLES[cable_id];
  const baseDb = hasCable ? -33 : -30;
  const rows = [];
  for (const f of freqs) {
    let s11_db, phase_deg;
    if (Number.isFinite(Number(load_impedance))) {
      const gamma = Math.abs((Number(load_impedance) - z0) / (Number(load_impedance) + z0));
      s11_db = 20 * Math.log10(Math.max(1e-5, gamma));
      phase_deg = -30 - ((f - fMin) / Math.max(1, fMax - fMin)) * 120;
    } else {
      // Cable-like base return loss with a gaussian mismatch bump
      const bump = bump_depth_db * Math.exp(-Math.pow((f - bump_f) / bump_w, 2) / 2);
      s11_db = baseDb + bump;
      phase_deg = -45 - ((f - fMin) / Math.max(1, fMax - fMin)) * 140;
    }
    const fStr = f < 100 ? f.toFixed(1) : Math.round(f).toString();
    rows.push(`${fStr} ${s11_db.toFixed(2)} ${phase_deg.toFixed(0)}`);
  }
  const header = [
    `! ${note || (hasCable ? `Synthesized S11 sweep for ${CABLES[cable_id].name}` : `Synthesized S11 sweep ${fMin}-${fMax} MHz`)}`,
    `! Agent-generated via synth_s11_sweep tool`,
    `# MHz S DB R ${z0}`,
  ];
  return [...header, ...rows].join("\n");
}

function toolSynthS11(input) {
  const s1p = synthesizeS11SweepText(input);
  if (!s1p) return { error: "Invalid frequency range. Require freq_min_mhz < freq_max_mhz." };
  return {
    s1p_text: s1p,
    n_points: s1p.split("\n").filter(l => !l.startsWith("!") && !l.startsWith("#")).length,
    freq_min_mhz: input.freq_min_mhz,
    freq_max_mhz: input.freq_max_mhz,
    line_impedance: Number(input.line_impedance) || 50,
    note: "User can click the 'TDR / S-Params' jump chip to plot this sweep.",
  };
}

const SYSTEM_PROMPT = `You are a senior RF cable engineer with 15+ years of experience in both design and field troubleshooting. You have access to:
- A ${CABLE_IDS.length}-cable production database (RG, LMR, Heliax, semi-rigid, video, phase-stable, Chinese SYV, Russian RK).
- A ${CONNECTOR_IDS.length}-connector database (N, SMA, TNC, BNC, 7/16 DIN, 4.3-10, F, UHF, 2.92mm, 2.4mm, 1.85mm, 1.0mm, MCX, MMCX, SMB, SMP, RP-SMA).
- 37 computational tools for lookup, calculation, validation, and system analysis.

CORE PRINCIPLES:
1. ALWAYS use tools for specific numbers. Never guess impedance, loss, VSWR, or dimensions from memory. Even if you recall a typical value, confirm with tools.
2. Be concise, technically precise, and solve the user's actual problem. Engineers value signal over noise.
3. Respond in the user's language (Vietnamese or English). Keep technical terms in English when they are industry-standard.

REASONING BEHAVIOR:
- Explain TRADE-OFFS, not just options. "LMR-400 has lower loss but less flex than RG-58" is more useful than listing both.
- PROACTIVELY suggest alternatives: if user picks a marginal cable, mention a better option.
- VALIDATE designs: if the user proposes something questionable (non-standard impedance, frequency above cutoff, power above limits), flag it.
- Use validate_custom_design whenever the user proposes custom geometry.
- For selection questions, use recommend_cables first, then get_cable_details on top candidates for detail.
- For single cable + single-hop system questions, use calculate_link_budget.
- For multi-segment chains (TX → cable → connector → amp → splitter → RX), use analyze_link_chain — it handles the full chain with running power per stage.
- For wireless hop calculations (free-space), use calculate_path_loss (Friis FSPL, EIRP, margin).
- For receiver chain / NF analysis, use calculate_nf_cascade (Friis for NF + IP3 cascade).
- For amplifier linearity (IP3, P1dB, IM3), use calculate_distortion.
- For connector lookup / matching, use lookup_connector (by impedance, freq, power, or query).

MANDATORY TOOL USE FOR VISUAL TOOLS (critical — user sees incomplete answers if you skip these):
- If the question involves a SPECIFIC numeric load impedance (R [+ jX]) and a SPECIFIC line Z₀ and the user wants VSWR / return loss / matching network / Smith-chart behaviour:
  - You MUST call calculate_vswr with numeric line_impedance, load_resistance, and load_reactance. Do NOT just type out |Γ|, VSWR, return loss values by mental math — even if you can derive them. The UI snaps the Smith-chart pin to the exact Γ from the tool's input. Skipping the call means the Smith-chart auto-fill chip shows up without a "•" dot and the user's pin does not move. ALWAYS make the call, then explain the results in prose.
- If the user asks to plot / show / visualise / sweep S11 / return loss / S-parameters / Touchstone data for a cable or a resistive mismatch:
  - You MUST call synth_s11_sweep with numeric freq_min_mhz and freq_max_mhz (plus cable_id or load_impedance as appropriate). Do NOT draw an ASCII-art chart. Do NOT list out frequency/dB rows by hand. The UI has a proper TDR / S-Params viewer that plots the tool's output automatically via the jump chip. ASCII art is not a substitute and makes the chip dot stay off.
- For troubleshooting measured loss, always use diagnose_loss_anomaly with the measurement data.
- For multi-cable comparisons, use compare_cables (one tool call) instead of many get_cable_details calls.
- When cables are selected, also suggest_connectors if frequency is given.

OUTPUT FORMAT:
- For comparisons, present as compact tables or side-by-side notes.
- For recommendations, always include WHY (1-2 sentence rationale per option).
- For complex answers (>3 paragraphs), use brief section headings.
- When referencing a specific cable, use its canonical name (e.g., "RG-213/U", "LMR-400") so the UI can create quick-action chips.

UNIT CONVENTION (IMPORTANT):
- Tool outputs give raw dimensions in mm. ALWAYS present BOTH metric and imperial in your reply: "1.83 mm (0.072 in)" format.
- Applies to: conductor diameters, dielectric OD, shield OD, jacket OD, strand sizes, bend radius, cable lengths.
- Power/voltage/frequency stay in SI (W, V, Hz). Loss stays in dB/100m AND dB/100ft when possible.
- Conversions: 1 inch = 25.4 mm; 100 m = 328.08 ft; 1 mm = 0.03937 in.
- Never present only one unit unless explicitly asked.

HONESTY:
- If a cable is not in the database (e.g., RG-8, Commscope FDH series), say so and offer the closest equivalent.
- If a calculation result seems unusual, note it — don't silently present questionable numbers.
- If user requirements conflict (low loss + flexible + cheap), name the trade-off explicitly.`;

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function RFCableSuite() {
  const [tab, setTab] = useState("home");
  const [activeCable, setActiveCable] = useState(null);
  const [queuedPrompt, setQueuedPrompt] = useState(null);

  const [units, setUnits] = useState("both");
  const [showTools, setShowTools] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [comparedCables, setComparedCables] = useState(() => {
    try { const s = localStorage.getItem("rf-compared"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("rf-compared", JSON.stringify(comparedCables)); } catch {} }, [comparedCables]);
  const toggleCompare = (id) => setComparedCables(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev);

  const [printing, setPrinting] = useState(null);
  const [printSetup, setPrintSetup] = useState(null);
  // { target: "nf"|"ip3"|"path"|"smith"|"link", data: {...}, ts: number }
  const [toolPreset, setToolPreset] = useState(null);
  const clearToolPreset = () => setToolPreset(null);
  useEffect(() => {
    if (!printing) return;
    const prevTitle = document.title;
    document.title = printing.meta?.docTitle || prevTitle;
    document.body.setAttribute("data-printing", "1");
    const done = () => { setPrinting(null); document.body.removeAttribute("data-printing"); document.title = prevTitle; };
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 120);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); document.body.removeAttribute("data-printing"); document.title = prevTitle; };
  }, [printing]);
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try { return localStorage.getItem("rf-tts") === "1"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem("rf-tts", ttsEnabled ? "1" : "0"); } catch {} }, [ttsEnabled]);
  const [model, setModel] = useState(() => {
    try { return localStorage.getItem("rf-model") || "claude-sonnet-4-6"; } catch { return "claude-sonnet-4-6"; }
  });
  useEffect(() => { try { localStorage.setItem("rf-model", model); } catch {} }, [model]);
  const shopMemory = useShopMemory();
  const rfSystemPromptWithMemory = useMemo(() => {
    const activeRules = formatActiveShopRulesForPrompt();
    const pendingCount = shopMemory.pending_rules?.length || 0;
    return `${RF_SYSTEM_PROMPT}

Approved Shop Memory rules (engineer-approved, stored on this device):
${activeRules || '- No approved shop rules saved yet.'}

Pending Shop Memory rules: ${pendingCount}. Pending rules are not active; tell the engineer to approve them in the Shop Memory panel before relying on them.`;
  }, [shopMemory]);

  const settingsCtx = { units, setUnits, showTools, setShowTools, ttsEnabled, setTtsEnabled, model, setModel };

  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [navOpenGroup, setNavOpenGroup] = useState(null); // desktop dropdown
  const navRef = useRef(null);

  // Top-level nav tree: leaves render as buttons, groups as dropdowns.
  // The compare count is injected dynamically into its label.
  const NAV_TREE = useMemo(() => ([
    { id: "home", label: "Home" },
    { id: "design", label: "Design" },
    {
      group: "lib", label: "Library",
      children: [
        { id: "library", label: "Cables" },
        { id: "connectors", label: "Connectors" },
        { id: "compare", label: `Compare${comparedCables.length ? ` (${comparedCables.length})` : ""}`, hot: comparedCables.length > 0 },
      ],
    },
    { id: "link", label: "Link" },
    { id: "tools", label: "Tools" },
    { id: "failure", label: "Failure" },
    { id: "launch", label: "Launch Lab" },
    { id: "shielding", label: "Shielding" },
    { id: "scanner", label: "EMI Scan" },
    {
      group: "build", label: "Build",
      children: [
        { id: "stack", label: "Stack / Suckout / MI" },
        { id: "materials", label: "Materials / MI Template" },
      ],
    },
    {
      group: "ref", label: "Reference",
      children: [
        { id: "wizard", label: "Wizard" },
        { id: "cheat", label: "Cheat Sheet" },
      ],
    },
  ]), [comparedCables.length]);

  const findNavLabel = (id) => {
    for (const n of NAV_TREE) {
      if (n.id === id) return n.label;
      if (n.children) {
        const c = n.children.find((x) => x.id === id);
        if (c) return c.label;
      }
    }
    return null;
  };
  const findNavGroup = (id) => {
    for (const n of NAV_TREE) if (n.children?.some((c) => c.id === id)) return n.group;
    return null;
  };
  const activeNavGroup = findNavGroup(tab);
  const [navExpandedMobile, setNavExpandedMobile] = useState(activeNavGroup);

  // Close desktop dropdown on outside click / Esc
  useEffect(() => {
    if (!navOpenGroup) return;
    const onDoc = (e) => { if (navRef.current && !navRef.current.contains(e.target)) setNavOpenGroup(null); };
    const onKey = (e) => { if (e.key === "Escape") setNavOpenGroup(null); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [navOpenGroup]);

  const loadCableIntoDesign = (id) => { setActiveCable(id); setTab("design"); };
  const askAboutCable = (id) => {
    const c = CABLES[id];
    // Surface the prompt to the floating agent (bottom-left chat)
    setQueuedPrompt(`Analyze ${c.name}: construction highlights, ideal applications, and closest alternatives to consider.`);
  };
  const openInLibrary = (id) => { setActiveCable(id); setTab("library"); };
  const showingLibraryDetail = tab === "library" && Boolean(activeCable);

  return (
    <SettingsContext.Provider value={settingsCtx}>
      <div style={S.root}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap');
          @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
          @keyframes slideIn { from{opacity:0; transform:translateY(6px)} to{opacity:1; transform:translateY(0)} }
          @keyframes slideDown { from{opacity:0; transform:translateY(-10px); max-height:0} to{opacity:1; transform:translateY(0); max-height:200px} }
          @keyframes blink { 0%,50%{opacity:1} 51%,100%{opacity:0} }
          .print-only { display: none; }
          @media print {
            @page {
              size: A4;
              margin: 16mm 14mm 18mm 14mm;
              @bottom-right { content: counter(page) " / " counter(pages); font-size: 8pt; color: #888; font-family: 'Inter', -apple-system, Segoe UI, sans-serif; }
              @bottom-left { content: "RF Cable Suite"; font-size: 8pt; color: #888; font-family: 'Inter', -apple-system, Segoe UI, sans-serif; }
            }
            html, body { background: white !important; color: #111 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body > *:not(#root):not(.print-only) { display: none !important; }
            #root > *:not(.print-only) { display: none !important; }
            .print-only { display: block !important; position: static !important; background: white !important; color: #111 !important; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif !important; font-size: 10pt !important; }
            .print-only * { color: #111; border-color: #bbb; }
            .print-only .print-accent { color: #b45309 !important; }
            .print-only .print-muted { color: #555 !important; }
            .print-only table { border-collapse: collapse !important; width: 100% !important; font-size: 9.5pt !important; margin: 0 !important; }
            .print-only th, .print-only td { border: 1px solid #d0d0d0 !important; padding: 4pt 6pt !important; text-align: left !important; vertical-align: top !important; }
            .print-only th { background: #efe9e0 !important; font-weight: 700 !important; font-size: 8.5pt !important; text-transform: uppercase; letter-spacing: 0.5px; color: #4a3520 !important; }
            .print-only table.zebra tbody tr:nth-child(even) td { background: #faf7f2 !important; }
            .print-only h1 { font-size: 20pt !important; margin: 0 0 3pt 0 !important; color: #111 !important; font-weight: 700 !important; letter-spacing: -0.3px; }
            .print-only h2 { font-size: 11pt !important; margin: 14pt 0 5pt 0 !important; color: #b45309 !important; border-bottom: 1px solid #d97706 !important; padding-bottom: 2pt !important; text-transform: uppercase; letter-spacing: 1px; page-break-after: avoid !important; break-after: avoid !important; }
            .print-only .avoid-break { page-break-inside: avoid !important; break-inside: avoid !important; }
            .print-only table, .print-only tr, .print-only td, .print-only th { page-break-inside: avoid !important; break-inside: avoid !important; }
            .print-only ol, .print-only ul { page-break-inside: avoid !important; break-inside: avoid !important; }
            .print-only svg { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .print-only .print-meta { background: #faf7f2 !important; }
          }
          .msg-anim { animation: slideIn 0.25s ease-out; }
          .settings-anim { animation: slideDown 0.2s ease-out; }
          .dots span { animation: pulse 1.4s infinite; }
          .dots span:nth-child(2) { animation-delay: 0.2s; }
          .dots span:nth-child(3) { animation-delay: 0.4s; }
          input[type=range] { -webkit-appearance:none; appearance:none; height:2px; background:#3a2e1f; outline:none; }
          input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:14px; height:14px; background:#d97706; border:2px solid #1a1410; border-radius:50%; cursor:pointer; }
          .num-input::-webkit-outer-spin-button,.num-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
          .num-input{-moz-appearance:textfield;}
          .hover-card:hover { border-color: #d97706 !important; }
          .hover-pill:hover { background: rgba(217,119,6,0.1) !important; }
        `}</style>

        {isMobile ? (
          <header style={{ ...S.header, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <div style={{ ...S.eyebrow, fontSize: 9 }}>RF Engineering Suite</div>
              <div style={{ ...S.title, fontSize: 18, lineHeight: 1.1, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {findNavLabel(tab) || "Coaxial Cable Workbench"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setSettingsOpen(!settingsOpen)} style={{ ...S.settingsBtn, ...(settingsOpen ? S.settingsBtnActive : {}) }} title="Settings">
                <SettingsIcon />
              </button>
              <button
                onClick={() => setMobileNavOpen(true)}
                style={{ ...S.settingsBtn, padding: 8 }}
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
            </div>
          </header>
        ) : (
          <header style={S.header}>
            <div>
              <div style={S.eyebrow}>RF Engineering Suite</div>
              <h1 style={S.title}>Coaxial Cable Workbench</h1>
            </div>
            <div style={S.headerRight}>
              <nav ref={navRef} style={{ ...S.nav, position: "relative", overflow: "visible" }}>
                {NAV_TREE.map((node) => {
                  if (!node.children) {
                    const isActive = tab === node.id;
                    return (
                      <button
                        key={node.id}
                        onClick={() => { setTab(node.id); setNavOpenGroup(null); }}
                        style={{ ...S.navBtn, ...(isActive ? S.navBtnActive : {}) }}
                      >
                        {node.label}
                      </button>
                    );
                  }
                  // group: dropdown
                  const isOpen = navOpenGroup === node.group;
                  const groupActive = activeNavGroup === node.group;
                  const hasHotChild = node.children.some((c) => c.hot);
                  return (
                    <div key={node.group} style={{ position: "relative" }}>
                      <button
                        onClick={() => setNavOpenGroup(isOpen ? null : node.group)}
                        style={{
                          ...S.navBtn,
                          ...(groupActive ? S.navBtnActive : {}),
                          ...(isOpen && !groupActive ? { background: "rgba(217,119,6,0.15)", color: "#fbbf24" } : {}),
                          ...(hasHotChild && !groupActive ? { color: "#fbbf24" } : {}),
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                        aria-expanded={isOpen}
                        aria-haspopup="menu"
                      >
                        {node.label}
                        <ChevronDown size={11} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                      </button>
                      {isOpen && (
                        <div
                          role="menu"
                          style={{
                            position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 230,
                            background: "#0a0705", border: "1px solid #3a2e1f", borderRadius: 4,
                            boxShadow: "0 8px 24px rgba(0,0,0,0.6)", zIndex: 50, padding: 4,
                            display: "flex", flexDirection: "column", gap: 2,
                          }}
                        >
                          {node.children.map((c) => {
                            const isActive = tab === c.id;
                            return (
                              <button
                                key={c.id}
                                role="menuitem"
                                onClick={() => { setTab(c.id); setNavOpenGroup(null); }}
                                style={{
                                  ...S.navBtn,
                                  textAlign: "left",
                                  padding: "8px 14px",
                                  borderRadius: 3,
                                  whiteSpace: "nowrap",
                                  ...(isActive
                                    ? { background: "#2a1d14", color: "#fbbf24" }
                                    : c.hot
                                      ? { color: "#fbbf24" }
                                      : {}),
                                }}
                              >
                                {c.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
              <button onClick={() => setSettingsOpen(!settingsOpen)} style={{ ...S.settingsBtn, ...(settingsOpen ? S.settingsBtnActive : {}) }} title="Settings">
                <SettingsIcon />
              </button>
            </div>
          </header>
        )}
        {isMobile && mobileNavOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 200 }} onClick={() => setMobileNavOpen(false)}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(10,7,5,0.92)", backdropFilter: "blur(6px)" }} />
            <aside
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute", top: 0, right: 0, bottom: 0, width: "85%", maxWidth: 340,
                background: "#0a0705", borderLeft: "1px solid #2a1f15", overflowY: "auto",
                fontFamily: "'Fraunces', serif",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #2a1f15" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#d97706", letterSpacing: 2, textTransform: "uppercase" }}>◆ RF Workbench</span>
                <button onClick={() => setMobileNavOpen(false)} style={{ background: "transparent", border: "none", color: "#a89d8e", padding: 6, cursor: "pointer" }} aria-label="Close">
                  <XIcon size={18} />
                </button>
              </div>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #2a1f15", display: "flex", flexDirection: "column", gap: 2 }}>
                <Link to="/highspeed" onClick={() => setMobileNavOpen(false)} style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#a89d8e", textTransform: "uppercase", letterSpacing: 1, textDecoration: "none", borderRadius: 3 }}>Highspeed Cable</Link>
                <Link to="/about" onClick={() => setMobileNavOpen(false)} style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#a89d8e", textTransform: "uppercase", letterSpacing: 1, textDecoration: "none", borderRadius: 3 }}>Methodology</Link>
                <Link to="/" onClick={() => setMobileNavOpen(false)} style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#a89d8e", textTransform: "uppercase", letterSpacing: 1, textDecoration: "none", borderRadius: 3 }}>Home</Link>
              </div>
              <div style={{ padding: "8px 8px", display: "flex", flexDirection: "column" }}>
                {NAV_TREE.map((node) => {
                  if (!node.children) {
                    const isActive = tab === node.id;
                    return (
                      <button
                        key={node.id}
                        onClick={() => { setTab(node.id); setMobileNavOpen(false); }}
                        style={{
                          textAlign: "left", padding: "12px 14px", border: "none",
                          background: isActive ? "#2a1d14" : "transparent",
                          color: isActive ? "#fbbf24" : "#a89d8e",
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 13, textTransform: "uppercase", letterSpacing: 1,
                          borderRadius: 3, cursor: "pointer", marginBottom: 2,
                        }}
                      >
                        {node.label}
                      </button>
                    );
                  }
                  // group: collapsible
                  const expanded = navExpandedMobile === node.group;
                  const groupActive = activeNavGroup === node.group;
                  return (
                    <div key={node.group} style={{ display: "flex", flexDirection: "column" }}>
                      <button
                        onClick={() => setNavExpandedMobile(expanded ? null : node.group)}
                        style={{
                          textAlign: "left", padding: "12px 14px", border: "none",
                          background: "transparent",
                          color: groupActive ? "#fbbf24" : "#a89d8e",
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 13, textTransform: "uppercase", letterSpacing: 1,
                          borderRadius: 3, cursor: "pointer", marginBottom: 2,
                          display: "flex", alignItems: "center", gap: 8,
                        }}
                      >
                        <span style={{ flex: 1 }}>{node.label}</span>
                        <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                      </button>
                      {expanded && (
                        <div style={{ marginLeft: 10, paddingLeft: 10, borderLeft: "1px solid #2a1f15", display: "flex", flexDirection: "column" }}>
                          {node.children.map((c) => {
                            const isActive = tab === c.id;
                            return (
                              <button
                                key={c.id}
                                onClick={() => { setTab(c.id); setMobileNavOpen(false); }}
                                style={{
                                  textAlign: "left", padding: "10px 14px", border: "none",
                                  background: isActive ? "#2a1d14" : "transparent",
                                  color: isActive ? "#fbbf24" : c.hot ? "#fbbf24" : "#a89d8e",
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontSize: 12, textTransform: "uppercase", letterSpacing: 1,
                                  borderRadius: 3, cursor: "pointer", marginBottom: 2,
                                }}
                              >
                                {c.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        )}

        {settingsOpen && (
          <div className="settings-anim" style={S.settingsPanel}>
            <div style={S.settingsRow}>
              <div style={S.settingsLabel}>Units</div>
              <div style={S.segControl}>
                {[["metric", "mm"], ["imperial", "inch"], ["both", "mm + inch"]].map(([v, label]) => (
                  <button key={v} onClick={() => setUnits(v)} style={{ ...S.segBtn, ...(units === v ? S.segBtnActive : {}) }}>{label}</button>
                ))}
              </div>
            </div>
            <div style={S.settingsRow}>
              <div style={S.settingsLabel}>Agent tool calls</div>
              <div style={S.segControl}>
                <button onClick={() => setShowTools(false)} style={{ ...S.segBtn, ...(!showTools ? S.segBtnActive : {}) }}>Hidden</button>
                <button onClick={() => setShowTools(true)} style={{ ...S.segBtn, ...(showTools ? S.segBtnActive : {}) }}>Visible</button>
              </div>
            </div>
            <div style={S.settingsRow}>
              <div style={S.settingsLabel}>Voice reply (TTS)</div>
              <div style={S.segControl}>
                <button onClick={() => setTtsEnabled(false)} style={{ ...S.segBtn, ...(!ttsEnabled ? S.segBtnActive : {}) }}>Off</button>
                <button onClick={() => setTtsEnabled(true)} style={{ ...S.segBtn, ...(ttsEnabled ? S.segBtnActive : {}) }}>On</button>
              </div>
            </div>
            <div style={{ ...S.settingsRow, flexDirection: "column", alignItems: "stretch", gap: 6 }}>
              <div style={S.settingsLabel}>Agent model</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 4 }}>
                {[
                  { id: "claude-haiku-4-5",  icon: "⚡", name: "Haiku 4.5",           desc: "Fastest, cheapest. Best for simple questions, quick lookups." },
                  { id: "claude-sonnet-4-6", icon: "⚖", name: "Sonnet 4.6 (default)", desc: "Balanced. Good for most questions." },
                  { id: "claude-opus-4-7",   icon: "🧠", name: "Opus 4.7",             desc: "Smartest, slower & more expensive. Best for complex reasoning (link budgets, diagnostics)." },
                ].map((m) => (
                  <button key={m.id} onClick={() => setModel(m.id)} style={{ textAlign: "left", padding: "8px 10px", background: model === m.id ? "rgba(217,119,6,0.18)" : "rgba(15,10,5,0.35)", border: `1px solid ${model === m.id ? "#d97706" : "#2a1f15"}`, borderRadius: 3, cursor: "pointer", color: "#d6cfc4", fontFamily: "inherit" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: model === m.id ? "#fbbf24" : "#e7e5e4", marginBottom: 2 }}>{m.icon} {m.name}</div>
                    <div style={{ fontSize: 9.5, color: "#a8a29e", lineHeight: 1.45 }}>{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={S.settingsHint}>Hidden tool calls keep the chat clean for non-technical viewers. TTS reads agent replies aloud (English voice). Model choice applies to new messages only — previous replies were generated by whatever model was selected then.</div>
          </div>
        )}

        {activeCable && !showingLibraryDetail && (
          <div style={S.activeCableBar}>
            <span style={S.activeLabel}>Active cable</span>
            <span style={S.activeName}>{CABLES[activeCable].name}</span>
            <span style={{ ...S.activeCat, color: CATEGORIES[CABLES[activeCable].cat].color }}>{CATEGORIES[CABLES[activeCable].cat].label}</span>
            <button onClick={() => setActiveCable(null)} style={S.clearBtn}>Clear ×</button>
          </div>
        )}

        <main style={S.main}>
          {tab === "home" && <HomeView setTab={setTab} setActiveCable={setActiveCable} comparedCables={comparedCables} />}
          {tab === "design" && <DesignView activeCable={activeCable} clearCable={() => setActiveCable(null)} openLibrary={() => setTab("library")} />}
          {tab === "library" && (
            <>
              {!showingLibraryDetail && <CompanyDefaultsPanel accentColor="#d97706" />}
              {!showingLibraryDetail && <ShopMemoryPanel accentColor="#d97706" />}
              {!showingLibraryDetail && <CustomCablesPanel side="rf" accentColor="#d97706" />}
              <LibraryView activeCable={activeCable} loadIntoDesign={loadCableIntoDesign} askAboutCable={askAboutCable} setActiveCable={setActiveCable} comparedCables={comparedCables} toggleCompare={toggleCompare} onPrint={(id) => setPrintSetup({ type: "cable", id })} isMobile={isMobile} />
            </>
          )}
          {tab === "connectors" && <ConnectorView />}
          {tab === "link" && <LinkView openInLibrary={openInLibrary} onPrint={() => setPrintSetup({ type: "link" })} toolPreset={toolPreset} clearToolPreset={clearToolPreset} />}
          {tab === "tools" && <ToolsView toolPreset={toolPreset} clearToolPreset={clearToolPreset} />}
          {tab === "failure" && <RFFailureTheater />}
          {tab === "launch" && <ConnectorLaunchLab />}
          {tab === "shielding" && <ShieldingEffectivenessLab />}
          {tab === "scanner" && <NearFieldEmiScannerLab />}
          {(tab === "stack" || tab === "suckout" || tab === "dielectric") && <RFStackLab />}
          {tab === "materials" && <MaterialLibrary />}
          {tab === "wizard" && <WizardView openInLibrary={openInLibrary} toggleCompare={toggleCompare} comparedCables={comparedCables} />}
          {tab === "cheat" && <CheatSheetView />}
          {tab === "compare" && <CompareView comparedCables={comparedCables} setComparedCables={setComparedCables} openInLibrary={openInLibrary} />}
        </main>
      </div>
      {printSetup && <PrintSetupModal type={printSetup.type} subjectId={printSetup.id} onCancel={() => setPrintSetup(null)} onConfirm={(meta) => { setPrinting({ ...printSetup, meta }); setPrintSetup(null); }} />}
      {printing?.type === "cable" && <PrintableCableSpec id={printing.id} units={units} meta={printing.meta || {}} />}
      {printing?.type === "link" && <PrintableLinkReport meta={printing.meta || {}} />}
      <FloatingAgent
        accent="#d97706"
        accentBright="#fbbf24"
        label="◆ RF · AGENT"
        systemPrompt={rfSystemPromptWithMemory}
        starters={RF_STARTERS}
        contextStarters={rfContextStarters}
        roleDescription="Senior RF cable engineer."
        topics={['cable selection', 'link budgets', 'connectors', 'VSWR / Smith', 'path loss']}
        placeholder="Ask about RF cable, connectors, link budgets…"
        storageKey="rf-chat-history"
        tools={RF_TOOLS}
        onToolUse={dispatchRfTool}
        context={{ section: tab, sectionLabel: RF_SECTION_LABELS[tab] || tab }}
        toolToSection={RF_TOOL_TO_SECTION}
        onJumpToSection={setTab}
        attachAccept="image/*,application/pdf,.pdf"
      />
    </SettingsContext.Provider>
  );
}

function PrintSetupModal({ type, subjectId, onCancel, onConfirm }) {
  const savedDefaults = (() => { try { return JSON.parse(localStorage.getItem("rf-print-meta") || "{}"); } catch { return {}; } })();
  const today = new Date().toISOString().slice(0, 10);
  const [project, setProject] = useState(savedDefaults.project || "");
  const [engineer, setEngineer] = useState(savedDefaults.engineer || "");
  const [client, setClient] = useState(savedDefaults.client || "");
  const [revision, setRevision] = useState("A");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [freqMHz, setFreqMHz] = useState(() => {
    if (type !== "link") return 900;
    try { const f = localStorage.getItem("rf-link-freq"); if (f) return Number(f) || 900; } catch {}
    return 900;
  });

  const subjectName = type === "cable" && subjectId && CABLES[subjectId] ? CABLES[subjectId].name : null;
  const docTitle = type === "cable"
    ? `RF Cable Spec${subjectName ? ` - ${subjectName}` : ""}${project ? ` - ${project}` : ""}`
    : `RF Link Budget Report${project ? ` - ${project}` : ""}`;
  const docId = `RF-${type === "cable" ? "SPEC" : "LINK"}-${date.replace(/-/g, "")}-${revision || "A"}`;

  const confirm = () => {
    const meta = { project, engineer, client, revision, date, notes, docTitle, docId };
    if (type === "link") meta.freq = Number(freqMHz) || 900;
    try { localStorage.setItem("rf-print-meta", JSON.stringify({ engineer, client, project: "" })); } catch {}
    onConfirm(meta);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) confirm();
  };

  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
  const panel = { background: "#110a05", border: "1px solid #3a2e1f", borderRadius: 4, width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto", fontFamily: "'JetBrains Mono', monospace", color: "#e7e2dc" };
  const header = { padding: "14px 18px", borderBottom: "1px solid #2a1f15", display: "flex", alignItems: "center", justifyContent: "space-between" };
  const body = { padding: 18, display: "grid", gap: 10 };
  const row = { display: "grid", gridTemplateColumns: "130px 1fr", gap: 10, alignItems: "center" };
  const label = { fontSize: 10, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 1 };
  const input = { background: "#0a0705", border: "1px solid #3a2e1f", color: "#e7e2dc", padding: "7px 9px", fontFamily: "inherit", fontSize: 12, borderRadius: 2, outline: "none" };
  const footer = { padding: "12px 18px", borderTop: "1px solid #2a1f15", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 };
  const btnBase = { padding: "7px 14px", fontFamily: "inherit", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, border: "1px solid", borderRadius: 2, cursor: "pointer" };

  return (
    <div style={overlay} onClick={onCancel} onKeyDown={onKeyDown}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 10, color: "#a8a29e", letterSpacing: 1.5, textTransform: "uppercase" }}>Print Setup</div>
            <div style={{ fontSize: 14, color: "#fbbf24", fontWeight: 700, marginTop: 2 }}>{type === "cable" ? `Cable Spec Sheet${subjectName ? ` · ${subjectName}` : ""}` : "Link Budget Report"}</div>
          </div>
          <button onClick={onCancel} style={{ background: "transparent", border: "none", color: "#a8a29e", fontSize: 18, cursor: "pointer" }} title="Cancel (Esc)">×</button>
        </div>

        <div style={body}>
          <div style={{ fontSize: 10.5, color: "#a8a29e", lineHeight: 1.5, padding: "8px 10px", background: "rgba(217,119,6,0.07)", border: "1px solid rgba(217,119,6,0.3)", borderRadius: 2 }}>
            💡 Bỏ trống bất kỳ field nào → PDF sẽ hiện dấu gạch để điền tay. Engineer/Client được lưu cho lần in sau.
          </div>

          <div style={row}><div style={label}>Project</div><input autoFocus value={project} onChange={(e) => setProject(e.target.value)} placeholder="(blank)" style={input} /></div>
          <div style={row}><div style={label}>Prepared by</div><input value={engineer} onChange={(e) => setEngineer(e.target.value)} placeholder="(blank)" style={input} /></div>
          <div style={row}><div style={label}>Client</div><input value={client} onChange={(e) => setClient(e.target.value)} placeholder="(blank)" style={input} /></div>
          <div style={row}><div style={label}>Revision</div><input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="A" style={{ ...input, maxWidth: 100 }} /></div>
          <div style={row}><div style={label}>Date</div><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...input, maxWidth: 180, colorScheme: "dark" }} /></div>
          {type === "link" && (
            <div style={row}><div style={label}>Frequency (MHz)</div><input type="number" value={freqMHz} onChange={(e) => setFreqMHz(e.target.value)} min={1} max={50000} style={{ ...input, maxWidth: 140 }} /></div>
          )}
          <div style={row}><div style={label}>Notes</div><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="(blank)" rows={2} style={{ ...input, resize: "vertical", fontFamily: "inherit" }} /></div>

          <div style={{ marginTop: 4, padding: "8px 10px", background: "rgba(15,10,5,0.5)", border: "1px solid #2a1f15", borderRadius: 2 }}>
            <div style={{ fontSize: 9, color: "#a8a29e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Document ID (auto)</div>
            <div style={{ fontSize: 11, color: "#fbbf24", fontFamily: "'JetBrains Mono', monospace" }}>{docId}</div>
          </div>
        </div>

        <div style={footer}>
          <div style={{ fontSize: 9, color: "#6b5a45" }}>Ctrl/⌘ + Enter to print · Esc to cancel</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onCancel} style={{ ...btnBase, background: "transparent", borderColor: "#3a2e1f", color: "#a8a29e" }}>Cancel</button>
            <button onClick={confirm} style={{ ...btnBase, background: "#d97706", borderColor: "#d97706", color: "#1a1410" }}>🖨 Print / PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrintMetaBlock({ meta = {}, docId }) {
  const blank = <span style={{ display: "inline-block", minWidth: 80, borderBottom: "1px solid #999", height: "1em", verticalAlign: "bottom" }}>&nbsp;</span>;
  const rowStyle = { display: "contents" };
  const lblStyle = { fontSize: "8pt", color: "#555", textTransform: "uppercase", letterSpacing: 0.8, paddingTop: 2 };
  const valStyle = { fontSize: "10pt", color: "#111", fontWeight: 500, paddingBottom: 4, borderBottom: "1px dotted #ddd" };
  const field = (label, value) => (
    <div style={rowStyle}>
      <div style={lblStyle}>{label}</div>
      <div style={valStyle}>{value && String(value).trim() ? value : blank}</div>
    </div>
  );
  return (
    <div className="print-meta avoid-break" style={{ border: "1px solid #ccc", padding: "10pt 12pt", margin: "10pt 0 14pt", display: "grid", gridTemplateColumns: "auto 1fr auto 1fr auto 1fr", gap: "2pt 10pt", fontFamily: "inherit" }}>
      {field("Project", meta.project)}
      {field("Client", meta.client)}
      {field("Doc ID", docId || meta.docId)}
      {field("Prepared by", meta.engineer)}
      {field("Date", meta.date)}
      {field("Revision", meta.revision)}
    </div>
  );
}

function PrintableCableSpec({ id, units, meta = {} }) {
  const c = CABLES[id];
  if (!c) return null;
  const cat = CATEGORIES[c.cat];
  const now = new Date();
  // Cross-section ratios against jacket OD
  const rJacket = 80, rShield = (c.shield / c.OD) * 80, rDiel = (c.D / c.OD) * 80, rInner = (c.d / c.OD) * 80;
  return (
    <div className="print-only" style={{ padding: 0, color: "#111", background: "white", lineHeight: 1.4 }}>
      <div className="avoid-break" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #b45309", paddingBottom: 8, marginBottom: 10 }}>
        <div>
          <div className="print-muted" style={{ fontSize: "9pt", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2 }}>RF Cable Specification Sheet</div>
          <h1>{c.name}</h1>
          <div className="print-muted" style={{ fontSize: "10pt" }}>{cat.label} · {c.alias}</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "9pt" }} className="print-muted">
          <div style={{ fontWeight: 700, color: "#111" }}>{meta.docId || ""}</div>
          <div>Generated {now.toISOString().slice(0, 10)}</div>
          <div>RF Cable Suite</div>
        </div>
      </div>

      <PrintMetaBlock meta={meta} docId={meta.docId} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="avoid-break">
          <h2>Electrical</h2>
          <table><tbody>
            <tr><th style={{ width: "40%" }}>Impedance</th><td>{c.z} Ω</td></tr>
            <tr><th>Velocity factor</th><td>{c.vp}%</td></tr>
            <tr><th>Capacitance</th><td>{fmtCap(c.cap, units, 1)}</td></tr>
            <tr><th>Max frequency</th><td>{c.fMax} GHz</td></tr>
            <tr><th>Max voltage</th><td>{c.vMax} V RMS</td></tr>
          </tbody></table>

          <h2>Mechanical</h2>
          <table><tbody>
            <tr><th style={{ width: "40%" }}>Inner conductor</th><td>{fmtLen(c.d, units)}</td></tr>
            <tr><th>Dielectric OD</th><td>{fmtLen(c.D, units)}</td></tr>
            <tr><th>Shield OD</th><td>{fmtLen(c.shield, units)}</td></tr>
            <tr><th>Jacket OD</th><td>{fmtLen(c.OD, units)}</td></tr>
            <tr><th>Mass</th><td>{fmtMass(c.mass, units, 1)}</td></tr>
            <tr><th>Flexibility</th><td>{c.flex}</td></tr>
            <tr><th>Outdoor-rated</th><td>{c.outdoor ? "Yes" : "No"}</td></tr>
            <tr><th>Power class</th><td>{c.power}</td></tr>
          </tbody></table>
        </div>

        <div className="avoid-break">
          <h2>Cross-section</h2>
          <svg width="100%" viewBox="0 0 340 220" preserveAspectRatio="xMidYMid meet" style={{ display: "block", margin: "0 auto", maxWidth: 340, overflow: "visible" }}>
            {/* layers (centered at 100,110) */}
            <circle cx="100" cy="110" r={rJacket} fill="#3a2b1a" stroke="#1a0e05" strokeWidth="0.8" />
            <circle cx="100" cy="110" r={rShield} fill="#c0c4ca" stroke="#888" strokeWidth="0.3" />
            <circle cx="100" cy="110" r={rDiel} fill="#f5e6a8" stroke="#d4c080" strokeWidth="0.3" />
            <circle cx="100" cy="110" r={rInner} fill="#cd7f32" stroke="#8b4513" strokeWidth="0.3" />
            {/* leader lines from each layer midpoint outward to right-side labels */}
            <line x1={100 + rInner * 0.4} y1="110" x2="195" y2="70"  stroke="#555" strokeWidth="0.4" />
            <line x1={100 + (rInner + rDiel) / 2 * 0.8} y1="110" x2="195" y2="95"  stroke="#555" strokeWidth="0.4" />
            <line x1={100 + (rDiel + rShield) / 2 * 0.85} y1="110" x2="195" y2="125" stroke="#555" strokeWidth="0.4" />
            <line x1={100 + (rShield + rJacket) / 2 * 0.9} y1="110" x2="195" y2="150" stroke="#555" strokeWidth="0.4" />
            {/* labels */}
            <text x="200" y="73"  fontSize="8" fill="#111">Inner · {fmtLen(c.d, units)}</text>
            <text x="200" y="98"  fontSize="8" fill="#111">Dielectric · {fmtLen(c.D, units)}</text>
            <text x="200" y="128" fontSize="8" fill="#111">Shield · {fmtLen(c.shield, units)}</text>
            <text x="200" y="153" fontSize="8" fill="#111">Jacket · {fmtLen(c.OD, units)}</text>
            {/* caption */}
            <text x="170" y="210" fontSize="7.5" fill="#555" textAnchor="middle" fontStyle="italic">Figure 1 — Cross-section, not to absolute scale</text>
          </svg>

          <h2>Construction</h2>
          <table><tbody>
            <tr><th style={{ width: "30%" }}>Conductor</th><td>{c.cons.conductor}</td></tr>
            <tr><th>Dielectric</th><td>{c.cons.dielectric}</td></tr>
            <tr><th>Shield</th><td>{c.cons.shield}</td></tr>
            <tr><th>Jacket</th><td>{c.cons.jacket}</td></tr>
          </tbody></table>
        </div>
      </div>

      <h2>Attenuation</h2>
      <table className="zebra avoid-break">
        <thead><tr><th>Frequency</th><th style={{ textAlign: "right" }}>dB/100m</th><th style={{ textAlign: "right" }}>dB/100ft</th><th style={{ textAlign: "right" }}>dB/25ft</th></tr></thead>
        <tbody>
          {c.atten.map(([f, a], i) => (
            <tr key={i}>
              <td>{f < 1000 ? `${f} MHz` : `${(f / 1000).toFixed(1)} GHz`}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace" }}>{a.toFixed(2)}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace" }}>{(a * 0.3048).toFixed(2)}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace" }}>{(a * 0.0762).toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="print-muted" style={{ fontSize: "7.5pt", marginTop: 3, marginBottom: 8, fontStyle: "italic" }}>
        Attenuation values are manufacturer-typical at 20 °C, matched impedance. 100 ft ≈ 30.48 m · 25 ft ≈ 7.62 m (common jumper length).
      </div>

      <div className="avoid-break">
        <h2>Manufacturing process</h2>
        <ol style={{ fontSize: "10pt", paddingLeft: 20, margin: 0 }}>
          {c.proc.map((s, i) => <li key={i} style={{ marginBottom: 3 }}>{s}</li>)}
        </ol>
      </div>

      <div className="avoid-break">
        <h2>Applications &amp; suppliers</h2>
        <div style={{ fontSize: "10pt", marginBottom: 6 }}><strong>Applications:</strong> {c.apps}</div>
        <div style={{ fontSize: "10pt" }}><strong>Typical makers:</strong> {c.makers}</div>
      </div>

      {(meta.notes && meta.notes.trim()) ? (
        <div className="avoid-break">
          <h2>Notes</h2>
          <div style={{ fontSize: "10pt", whiteSpace: "pre-wrap", padding: "6pt 8pt", border: "1px solid #ddd", background: "#fafafa" }}>{meta.notes}</div>
        </div>
      ) : null}

      <div className="avoid-break">
        <h2>Sign-off</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 6 }}>
          <div>
            <div style={{ borderBottom: "1px solid #999", height: 36 }}></div>
            <div style={{ fontSize: "8pt", color: "#555", marginTop: 2 }}>Prepared by{meta.engineer ? ` · ${meta.engineer}` : ""}</div>
          </div>
          <div>
            <div style={{ borderBottom: "1px solid #999", height: 36 }}></div>
            <div style={{ fontSize: "8pt", color: "#555", marginTop: 2 }}>Reviewed / approved</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 8, borderTop: "1px solid #ccc", fontSize: "8pt", color: "#888", display: "flex", justifyContent: "space-between" }}>
        <span>{meta.docId || ""} · Rev {meta.revision || "A"}</span>
        <span>Generated by RF Cable Suite · {now.toLocaleString()}</span>
      </div>
    </div>
  );
}

function PrintableLinkReport({ meta = {} }) {
  let segments = [], freq = Number(meta.freq) || 900;
  try {
    const s = localStorage.getItem("rf-link-chain");
    if (s) segments = JSON.parse(s);
    if (!meta.freq) {
      const f = localStorage.getItem("rf-link-freq");
      if (f) freq = Number(f) || freq;
    }
  } catch {}
  // Compute stages same way as LinkView
  const stages = [];
  let pwr = 0;
  segments.forEach(seg => {
    let loss = 0, label = "", sub = "", warn = null;
    if (seg.type === "tx") { pwr = seg.power; label = "TX"; sub = dbmToPower(pwr) + " transmit"; }
    else if (seg.type === "cable") {
      const cable = CABLES[seg.cableId];
      if (cable) {
        loss = interpAtten(cable.atten, freq) * seg.lengthM / 100;
        label = cable.name; sub = `${seg.lengthM} m`;
        pwr -= loss;
      }
    } else if (seg.type === "connector") {
      const conn = CONNECTORS[seg.connectorId];
      loss = conn?.typicalLoss ?? 0.15;
      label = conn ? conn.name : "Connector"; sub = "connector";
      pwr -= loss;
    } else if (seg.type === "amp") { loss = -(seg.gain || 0); label = "Amplifier"; sub = `+${seg.gain} dB`; pwr -= loss; }
    else if (seg.type === "atten") { loss = seg.loss || 0; label = "Attenuator"; sub = `${loss} dB`; pwr -= loss; }
    else if (seg.type === "splitter") { const n = seg.nWay || 2; loss = SPLITTER_LOSS[n] || 10 * Math.log10(n); label = `${n}-way splitter`; sub = `÷${n}`; pwr -= loss; }
    else if (seg.type === "custom") { loss = seg.loss || 0; label = seg.label || "Custom"; sub = ""; pwr -= loss; }
    else if (seg.type === "rx") { label = "RX"; sub = `sens ${seg.sensitivity} dBm`; }
    stages.push({ ...seg, label, sub, loss, pwrOut: pwr });
  });
  const txPwr = stages[0]?.power ?? 0;
  const rxPwr = stages[stages.length - 1]?.pwrOut ?? 0;
  const rxSens = stages[stages.length - 1]?.sensitivity ?? -85;
  const totalLoss = txPwr - rxPwr;
  const margin = rxPwr - rxSens;
  const verdict = linkVerdict(margin);
  const now = new Date();

  // BOM aggregation
  const cables = {}, connectors = {};
  let amps = 0, attens = 0, splitters = [];
  segments.forEach(s => {
    if (s.type === "cable" && CABLES[s.cableId]) {
      if (!cables[s.cableId]) cables[s.cableId] = { cable: CABLES[s.cableId], totalLength: 0 };
      cables[s.cableId].totalLength += s.lengthM || 0;
    } else if (s.type === "connector" && CONNECTORS[s.connectorId]) {
      if (!connectors[s.connectorId]) connectors[s.connectorId] = { connector: CONNECTORS[s.connectorId], qty: 0 };
      connectors[s.connectorId].qty += 1;
    } else if (s.type === "amp") amps++;
    else if (s.type === "atten") attens++;
    else if (s.type === "splitter") splitters.push(s.nWay);
  });

  // Verdict → light-bg callout colors
  const calloutColors = (() => {
    if (margin < 0) return { bg: "#fef2f2", border: "#dc2626", title: "#991b1b" };
    if (margin < 10) return { bg: "#fffbeb", border: "#d97706", title: "#92400e" };
    return { bg: "#f0fdf4", border: "#16a34a", title: "#14532d" };
  })();
  const chainComponentCount = Math.max(0, segments.length - 2);
  const freqLabel = freq < 1000 ? `${freq} MHz` : `${(freq / 1000).toFixed(2)} GHz`;

  return (
    <div className="print-only" style={{ padding: 0, color: "#111", background: "white", lineHeight: 1.4 }}>
      <div className="avoid-break" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #b45309", paddingBottom: 8, marginBottom: 10 }}>
        <div>
          <div className="print-muted" style={{ fontSize: "9pt", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2 }}>RF Link Budget Report</div>
          <h1>{chainComponentCount} component chain · {freqLabel}</h1>
          <div className="print-muted" style={{ fontSize: "10pt" }}>TX {txPwr} dBm → RX {rxPwr.toFixed(2)} dBm · sens {rxSens} dBm</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "9pt" }} className="print-muted">
          <div style={{ fontWeight: 700, color: "#111" }}>{meta.docId || ""}</div>
          <div>Generated {now.toISOString().slice(0, 10)}</div>
          <div>RF Cable Suite</div>
        </div>
      </div>

      <PrintMetaBlock meta={meta} docId={meta.docId} />

      {/* Verdict callout */}
      <div className="avoid-break" style={{ border: `1.5px solid ${calloutColors.border}`, background: calloutColors.bg, borderLeft: `6px solid ${calloutColors.border}`, padding: "10pt 14pt", marginBottom: 12, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "8.5pt", textTransform: "uppercase", letterSpacing: 1.2, color: calloutColors.title, fontWeight: 700 }}>Link margin</div>
          <div style={{ fontSize: "10pt", color: "#333", marginTop: 4, lineHeight: 1.4 }}>{verdict.desc}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "26pt", fontWeight: 700, color: calloutColors.title, lineHeight: 1, fontFamily: "monospace" }}>{margin > 0 ? "+" : ""}{margin.toFixed(2)}<span style={{ fontSize: "14pt" }}> dB</span></div>
          <div style={{ fontSize: "10pt", fontWeight: 700, color: calloutColors.title, marginTop: 4, letterSpacing: 1 }}>{verdict.title}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="avoid-break">
          <h2>Summary</h2>
          <table><tbody>
            <tr><th style={{ width: "48%" }}>Transmit power</th><td>{txPwr} dBm ({dbmToPower(txPwr)})</td></tr>
            <tr><th>Total chain loss</th><td>{totalLoss.toFixed(2)} dB</td></tr>
            <tr><th>Received power</th><td>{rxPwr.toFixed(2)} dBm ({dbmToPower(rxPwr)})</td></tr>
            <tr><th>RX sensitivity</th><td>{rxSens} dBm</td></tr>
            <tr><th>Frequency</th><td>{freqLabel}</td></tr>
          </tbody></table>
        </div>
        <div className="avoid-break">
          <h2>Chain overview</h2>
          <table><tbody>
            <tr><th style={{ width: "48%" }}>Components</th><td>{chainComponentCount}</td></tr>
            <tr><th>Cable runs</th><td>{Object.values(cables).length} type(s), {Object.values(cables).reduce((s, c) => s + c.totalLength, 0).toFixed(1)} m total</td></tr>
            <tr><th>Connectors</th><td>{Object.values(connectors).reduce((s, c) => s + c.qty, 0)} pcs, {Object.values(connectors).length} type(s)</td></tr>
            <tr><th>Active stages</th><td>{amps} amp(s)</td></tr>
            <tr><th>Passive stages</th><td>{attens} atten · {splitters.length} splitter</td></tr>
          </tbody></table>
        </div>
      </div>

      <h2>Stage-by-stage analysis</h2>
      <table className="zebra avoid-break">
        <thead><tr><th style={{ width: 28 }}>#</th><th>Component</th><th>Detail</th><th style={{ textAlign: "right" }}>Loss / Gain</th><th style={{ textAlign: "right" }}>Power out</th></tr></thead>
        <tbody>
          {stages.map((st, i) => (
            <tr key={i}>
              <td style={{ fontFamily: "monospace" }}>{i + 1}</td>
              <td>{st.label}</td>
              <td className="print-muted" style={{ fontSize: "9pt" }}>{st.sub}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace" }}>{st.type === "tx" || st.type === "rx" ? "—" : `${st.loss > 0 ? "−" : st.loss < 0 ? "+" : ""}${Math.abs(st.loss).toFixed(2)} dB`}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{st.type === "tx" ? `${st.power} dBm` : `${st.pwrOut.toFixed(2)} dBm`}</td>
            </tr>
          ))}
          <tr style={{ borderTop: "2px solid #b45309" }}>
            <td colSpan="3" style={{ fontWeight: 700, textAlign: "right" }}>Total cascade loss</td>
            <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>−{totalLoss.toFixed(2)} dB</td>
            <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{rxPwr.toFixed(2)} dBm</td>
          </tr>
        </tbody>
      </table>
      <div className="print-muted" style={{ fontSize: "7.5pt", marginTop: 3, marginBottom: 8, fontStyle: "italic" }}>
        Loss values computed at {freqLabel}. Cable attenuation interpolated from manufacturer data; connector loss is typical insertion loss.
      </div>

      <h2>Bill of materials</h2>
      <table className="zebra avoid-break">
        <thead><tr><th style={{ width: "14%" }}>Category</th><th>Item</th><th>Spec</th><th style={{ textAlign: "right", width: "18%" }}>Quantity</th></tr></thead>
        <tbody>
          {Object.values(cables).map((c, i) => (
            <tr key={`c${i}`}><td>Cable</td><td>{c.cable.name}</td><td className="print-muted" style={{ fontSize: "9pt" }}>{c.cable.z} Ω · OD {c.cable.OD.toFixed(2)} mm · {c.cable.cons.dielectric}</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>{c.totalLength} m</td></tr>
          ))}
          {Object.values(connectors).map((c, i) => (
            <tr key={`n${i}`}><td>Connector</td><td>{c.connector.name}</td><td className="print-muted" style={{ fontSize: "9pt" }}>{c.connector.z} Ω · DC–{c.connector.fMax} GHz</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>{c.qty} pcs</td></tr>
          ))}
          {amps > 0 && <tr><td>Active</td><td>Amplifier</td><td className="print-muted" style={{ fontSize: "9pt" }}>application-specific gain / NF</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>{amps} pcs</td></tr>}
          {attens > 0 && <tr><td>Passive</td><td>Attenuator pad</td><td className="print-muted" style={{ fontSize: "9pt" }}>50 Ω fixed</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>{attens} pcs</td></tr>}
          {splitters.map((n, i) => (
            <tr key={`s${i}`}><td>Passive</td><td>{n}-way splitter</td><td className="print-muted" style={{ fontSize: "9pt" }}>{SPLITTER_LOSS[n]} dB insertion loss</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>1 pc</td></tr>
          ))}
        </tbody>
      </table>

      {(meta.notes && meta.notes.trim()) ? (
        <div className="avoid-break">
          <h2>Notes</h2>
          <div style={{ fontSize: "10pt", whiteSpace: "pre-wrap", padding: "6pt 8pt", border: "1px solid #ddd", background: "#fafafa" }}>{meta.notes}</div>
        </div>
      ) : null}

      <div className="avoid-break">
        <h2>Sign-off</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 6 }}>
          <div>
            <div style={{ borderBottom: "1px solid #999", height: 36 }}></div>
            <div style={{ fontSize: "8pt", color: "#555", marginTop: 2 }}>Prepared by{meta.engineer ? ` · ${meta.engineer}` : ""}</div>
          </div>
          <div>
            <div style={{ borderBottom: "1px solid #999", height: 36 }}></div>
            <div style={{ fontSize: "8pt", color: "#555", marginTop: 2 }}>Reviewed / approved</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 8, borderTop: "1px solid #ccc", fontSize: "8pt", color: "#888", display: "flex", justifyContent: "space-between" }}>
        <span>{meta.docId || ""} · Rev {meta.revision || "A"}</span>
        <span>Generated by RF Cable Suite · {now.toLocaleString()}</span>
      </div>
    </div>
  );
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// ASK VIEW
// ═══════════════════════════════════════════════════════════════
// Guarantees a payload the Messages API will accept:
//  - strips tool_use blocks that have no matching tool_result
//  - strips orphan tool_result blocks
//  - drops empty messages
//  - merges consecutive same-role messages (API requires alternation)
//  - ensures it starts with a user turn
function sanitizeHistory(msgs) {
  if (!Array.isArray(msgs)) return [];
  const pass1 = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (!m || !m.role) continue;
    if (m.role === "assistant" && Array.isArray(m.content)) {
      const toolUseIds = m.content.filter(b => b?.type === "tool_use").map(b => b.id);
      if (toolUseIds.length > 0) {
        const next = msgs[i + 1];
        const resultIds = next?.role === "user" && Array.isArray(next.content)
          ? next.content.filter(b => b?.type === "tool_result").map(b => b.tool_use_id)
          : [];
        const allMatched = toolUseIds.every(id => resultIds.includes(id));
        if (!allMatched) {
          const stripped = m.content.filter(b => b?.type !== "tool_use");
          if (stripped.length > 0) pass1.push({ role: "assistant", content: stripped });
          continue;
        }
      }
    }
    if (m.role === "user" && Array.isArray(m.content)) {
      const prev = msgs[i - 1];
      const prevToolUseIds = prev?.role === "assistant" && Array.isArray(prev.content)
        ? prev.content.filter(b => b?.type === "tool_use").map(b => b.id)
        : [];
      const cleaned = m.content.filter(b => b?.type !== "tool_result" || prevToolUseIds.includes(b.tool_use_id));
      if (cleaned.length === 0) continue;
      pass1.push({ role: "user", content: cleaned });
      continue;
    }
    if (Array.isArray(m.content) && m.content.length === 0) continue;
    if (typeof m.content === "string" && m.content.trim() === "") continue;
    pass1.push({ role: m.role, content: m.content });
  }
  const merged = [];
  for (const m of pass1) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === m.role) {
      const toArr = c => Array.isArray(c) ? c : [{ type: "text", text: String(c) }];
      prev.content = [...toArr(prev.content), ...toArr(m.content)];
    } else {
      merged.push({ role: m.role, content: m.content });
    }
  }
  while (merged.length && merged[0].role !== "user") merged.shift();
  return merged;
}

const IDENTIFY_PROMPT = `Analyze this cable photograph and identify it. Provide a structured answer:

1. **Type / family** — RG-X, LMR-X, heliax (LDF/FSJ), semi-rigid (UT-XXX), Belden 8XXX, or "unknown / custom" if unclear.
2. **Visible construction** — jacket color and likely material (PVC/PE/FEP/LSZH), shield type if exposed (braid coverage %, foil, double), dielectric if visible (solid PE, foam PE, PTFE), conductor (solid/stranded, bare Cu/CCS/SPC).
3. **Estimated outer diameter** — if a size reference (ruler, coin, fingers, known object) is in frame, estimate in mm and inches. Otherwise qualitative (thin/medium/thick).
4. **Closest database match** — use the recommend_cables and get_cable_details tools to confirm. Mention the canonical name (e.g. "RG-213/U", "LMR-400") so it becomes a clickable chip.
5. **Confidence** — high / medium / low, with the main uncertainty.
6. **Use cases** — what this cable is typically used for.

Keep it under 200 words. If the image is unclear or not a cable, say so.`;

const DIAGNOSE_PROMPT = `Diagnose this damaged / suspect cable. Provide a structured analysis:

1. **Visible failure mode(s)** — UV cracking, kink / sharp bend, rodent chew, corrosion, arc / burn / melt, water ingress, abrasion, crush, connector pull-out, plasticizer migration, shield fatigue, etc.
2. **Affected layer(s)** — jacket / shield / dielectric / conductor (be specific about which).
3. **Severity** — cosmetic (no impact) / functional (degraded performance) / critical (replace immediately, safety risk).
4. **Likely root cause** — environmental exposure, install error (tight bend, crush), age / UV, wildlife, moisture, overload / lightning, galvanic corrosion.
5. **Expected electrical impact** — VSWR bump, impedance shift (magnitude if estimable), extra insertion loss (dB if estimable), intermittent contact, total open or short.
6. **Recommended action** — monitor / field repair (e.g. re-terminate) / full replacement. Give concrete steps.
7. **Prevention for future installs** — 1-2 practical tips.

Keep it under 250 words. If cause is ambiguous list top 2 hypotheses.`;

const CONSTRUCTION_PROMPT = `Estimate the specs of this cable from the visible construction. Use what you can see (strand count, braid angle, jacket thickness, dielectric foaming, connector) to infer:

1. **Characteristic impedance (Z₀)** — 50 Ω, 75 Ω, or custom estimate with reasoning.
2. **Velocity factor (VP)** — based on dielectric type (solid PE ≈ 66%, foam PE ≈ 80-88%, PTFE ≈ 69-70%, air-dielectric ≈ 90%+).
3. **Typical frequency range** — fMax in GHz.
4. **Power handling** — low (<100W) / medium (100W-1kW) / high (>1kW).
5. **Flexibility class** — rigid / semi-rigid / semi-flexible / flexible / super-flexible.
6. **Attenuation ballpark at 1 GHz** — dB/100m estimate with reasoning.
7. **Likely standard it matches** — MIL-C-17, IEC 61196, Belden, Times, etc.

Use the database tools where helpful. Keep under 200 words.`;

// ═══════════════════════════════════════════════════════════════
// HOME — main landing view for the RF workbench. Replaces the AskView
// since chat is always available via the bottom-left FloatingAgent.
// ═══════════════════════════════════════════════════════════════
function HomeView({ setTab, setActiveCable, comparedCables }) {
  const cableCount = Object.keys(CABLES).length;
  const connectorCount = Object.keys(CONNECTORS).length;

  // Hero quick-action cards — link to the heavy-lifting tools.
  const tools = [
    { id: 'library', icon: 'cable', title: 'Cable Library', sub: `${cableCount} presets · RG / LMR / Heliax / phase-stable`, accent: '#c97b3f' },
    { id: 'connectors', icon: 'plug', title: 'Connector Library', sub: `${connectorCount} types · N / SMA / TNC / 7-16 DIN`, accent: '#fbbf24' },
    { id: 'design', icon: 'layers', title: 'Design / Clone Workbench', sub: 'Compose chains · clone library cable · share', accent: '#5eead4' },
    { id: 'link', icon: 'link', title: 'Link Budget', sub: 'TX → cable → FSPL → RX with margin', accent: '#7dd3fc' },
    { id: 'tools', icon: 'tools', title: 'Tools', sub: 'Friis NF · IP3 · Smith · path loss', accent: '#a78bfa' },
    { id: 'failure', icon: 'failure', title: 'RF Failure Theater', sub: 'Blender defect → TDR · S11 · VSWR story', accent: '#f87171' },
    { id: 'launch', icon: 'launch', title: 'Connector Launch Lab', sub: 'Pin depth · strip length · ferrule step → S11', accent: '#38bdf8' },
    { id: 'shielding', icon: 'shielding', title: 'Shielding Effectiveness Lab', sub: 'Braid · foil gap · bond quality → leakage dB', accent: '#22d3ee' },
    { id: 'scanner', icon: 'scanner', title: 'Near-field / EMI Scanner', sub: 'Probe scan · hotspot map · spectrum clue', accent: '#f472b6' },
    { id: 'stack', icon: 'wave', title: 'Stack / Suckout / MI Lab', sub: 'PTFE · spiral/foil/braid · notch check · apply MI', accent: '#e89357' },
    { id: 'wizard', icon: 'sparkles', title: 'Cable Selector / Clone', sub: 'Wizard + library profile for picking a starting cable', accent: '#84cc16' },
    { id: 'cheat', icon: 'book', title: 'Cheat Sheet', sub: 'Formulas · constants · standards', accent: '#cbd5e1' },
  ];

  // Pick a few interesting cables to surface on the home page. IDs without
  // hyphens — match the CABLES map keys.
  const featuredCandidates = ['lmr400', 'rg58', 'lmr600', 'rg213', 'rg6', 'heliaxLDF450A', 'ut141', 'sf141', 'sucoflex104', 'rg174', 'rg400'];
  const featured = featuredCandidates.filter(id => CABLES[id]).slice(0, 6);

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      <style>{`
        @keyframes rfPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes rfFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes rfScan { 0% { transform: translateX(-110%); opacity: 0; } 12%, 62% { opacity: 0.75; } 100% { transform: translateX(110%); opacity: 0; } }
        .rf-fade { animation: rfFadeUp 0.6s ease-out backwards; }
        .rf-card { transition: all 0.18s ease; }
        .rf-card:hover { transform: translateY(-2px); border-color: rgba(201, 123, 63, 0.6); }
        .rf-command { transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease; }
        .rf-command:hover { transform: translateY(-2px); border-color: rgba(94, 234, 212, 0.72); background: rgba(8, 15, 17, 0.76); }
        .rf-hero-title { font-size: 76px; }
        .rf-hero-copy { font-size: 18px; }
        @media (max-width: 760px) { .rf-hero-title { font-size: 44px; } .rf-hero-copy { font-size: 15px; } }
        @keyframes rfRingDraw { from { stroke-dashoffset: 360; } to { stroke-dashoffset: 0; } }
      `}</style>

      {/* Decorative grid + radial glow */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.18 }}>
        <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="rf-home-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#252e33" strokeWidth="0.5" />
            </pattern>
            <radialGradient id="rf-home-glow" cx="78%" cy="22%" r="55%">
              <stop offset="0%" stopColor="#c97b3f" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#0a0d0f" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#rf-home-grid)" />
          <rect width="100%" height="100%" fill="url(#rf-home-glow)" />
        </svg>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* HERO */}
        <section
          className="rf-fade"
          style={{
            position: 'relative',
            minHeight: 'clamp(520px, 74vh, 760px)',
            overflow: 'hidden',
            border: '1px solid #2f251d',
            borderRadius: 6,
            background: '#07090a',
            boxShadow: '0 28px 90px rgba(0,0,0,0.42)',
          }}
        >
          <video
            aria-label="Mission-critical RF cable signal path hero animation"
            autoPlay
            loop
            muted
            playsInline
            poster="/hero/rf-main-hero-mission-poster.jpg"
            preload="metadata"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.08) contrast(1.08)' }}
          >
            <source src="/hero/rf-main-hero-mission.webm" type="video/webm" />
            <source src="/hero/rf-main-hero-mission.mp4" type="video/mp4" />
          </video>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(5,7,8,0.95) 0%, rgba(5,7,8,0.78) 36%, rgba(5,7,8,0.28) 72%, rgba(5,7,8,0.42) 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.34))' }} />
          <div style={{ position: 'absolute', inset: '0 0 auto', height: 1, background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.85), rgba(94,234,212,0.55), transparent)', animation: 'rfScan 6s ease-in-out infinite' }} />

          <div style={{ position: 'relative', zIndex: 1, minHeight: 'inherit', display: 'grid', gridTemplateRows: '1fr auto', padding: 'clamp(22px, 4vw, 42px)' }}>
            <div style={{ maxWidth: 840, alignSelf: 'center', paddingBottom: 34 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, border: '1px solid rgba(251,191,36,0.35)', background: 'rgba(5,9,10,0.62)', padding: '7px 10px', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 2.8, color: '#fbbf24', textTransform: 'uppercase', marginBottom: 18 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: '#5eead4', boxShadow: '0 0 18px #5eead4' }} />
                Mission-critical RF signal paths
              </div>
              <h1 className="rf-hero-title" style={{ fontFamily: 'Fraunces, serif', fontWeight: 400, lineHeight: 0.92, color: '#f8efe0', margin: 0, letterSpacing: 0 }}>
                Coaxial Cable Workbench
              </h1>
              <p className="rf-hero-copy" style={{ marginTop: 20, color: '#d9e2e5', lineHeight: 1.5, maxWidth: 760 }}>
                From aerospace radar to satellite ground stations and RF labs, design the cable that keeps the signal clean.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 24 }}>
                <PrimaryCTA onClick={() => setTab('design')} label="Design cable" />
                <SecondaryCTA onClick={() => setTab('stack')} label="Build RF stack" />
                <SecondaryCTA onClick={() => setTab('launch')} label="Launch lab" />
                <SecondaryCTA onClick={() => setTab('shielding')} label="Shielding lab" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, border: '1px solid rgba(167,176,182,0.18)', background: 'rgba(167,176,182,0.16)', backdropFilter: 'blur(10px)', width: 'min(100%, 620px)', marginLeft: 'auto' }}>
              <HeroReadout value={cableCount} label="RF cable presets" accent="#5eead4" />
              <HeroReadout value={connectorCount} label="connector types" accent="#fbbf24" />
              <HeroReadout value={RF_TOOLS.length} label="calculation tools" accent="#fb923c" />
              <HeroReadout value="0" label="cloud telemetry" accent="#cbd5e1" />
            </div>
          </div>
        </section>

        {/* STATS BAR */}
        <section className="rf-fade" style={{ animationDelay: '120ms', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 18 }}>
          <CommandCard label="Design workbench" sub="Compose a cable chain and test margin." accent="#5eead4" onClick={() => setTab('design')} />
          <CommandCard label="Build + MI flow" sub="Agent preflight, apply stack, then fill MI." accent="#fbbf24" onClick={() => setTab('stack')} />
          <CommandCard label="Connector launch" sub="Pin plane, strip length, ferrule step." accent="#38bdf8" onClick={() => setTab('launch')} />
          <CommandCard label="Failure theater" sub="Turn damage into TDR and S11 clues." accent="#f87171" onClick={() => setTab('failure')} />
        </section>

        {/* TOOL CARDS */}
        <section style={{ marginTop: 36 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 400, color: '#f0ebe2', margin: 0 }}>The toolkit</h2>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#6b7479', letterSpacing: 2, textTransform: 'uppercase' }}>
              ◆ click to open · {tools.length} tools
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {tools.map((t, i) => (
              <button
                key={t.id}
                className="rf-card rf-fade"
                onClick={() => setTab(t.id)}
                style={{
                  animationDelay: `${160 + i * 40}ms`,
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
                <ToolGlyph kind={t.icon} color={t.accent} />
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 500, color: t.accent, marginTop: 8 }}>{t.title}</div>
                <div style={{ fontSize: 12, color: '#a7b0b6', lineHeight: 1.45 }}>{t.sub}</div>
                <div style={{ marginTop: 10, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#6b7479', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                  Open →
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* FEATURED CABLES */}
        <section style={{ marginTop: 40 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 400, color: '#f0ebe2', margin: 0 }}>Featured cables</h2>
            <button onClick={() => setTab('library')} style={{ background: 'transparent', border: 'none', color: '#fbbf24', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, cursor: 'pointer' }}>
              Library →
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {featured.map((id) => {
              const c = CABLES[id];
              if (!c) return null;
              return (
                <button
                  key={id}
                  onClick={() => { setActiveCable?.(id); setTab('library'); }}
                  className="rf-card"
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
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <CablePreviewThumb c={c} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#6b7479', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>{c.makers || 'cable'}</div>
                      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 500, color: '#fbbf24' }}>{c.name}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                    <Stat label="Z" value={`${c.z} Ω`} accent="#5eead4" />
                    <Stat label="VF" value={c.vp != null ? `${c.vp}%` : '—'} accent="#c97b3f" />
                    <Stat label="OD" value={c.OD != null ? `${c.OD.toFixed(1)} mm` : '—'} accent="#a7b0b6" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* COMPARE PROMPT */}
        {comparedCables.length > 0 && (
          <section style={{ marginTop: 32, padding: 14, background: 'rgba(94, 234, 212, 0.08)', border: '1px solid rgba(94, 234, 212, 0.4)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13, color: '#a7b0b6' }}>
              <span style={{ color: '#5eead4', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, letterSpacing: 2, marginRight: 8, textTransform: 'uppercase' }}>◆ {comparedCables.length} cable{comparedCables.length === 1 ? '' : 's'} pinned</span>
              ready to compare side-by-side.
            </div>
            <button onClick={() => setTab('compare')} style={{ background: 'transparent', border: '1px solid #5eead4', color: '#5eead4', padding: '6px 14px', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer' }}>
              → Open compare view
            </button>
          </section>
        )}

        {/* WHAT'S NEW */}
        <section style={{ marginTop: 40, padding: 18, background: '#12171a', border: '1px solid #252e33', borderRadius: 4 }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 3, color: '#c97b3f', textTransform: 'uppercase', marginBottom: 10 }}>◆ Workflows grouped</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8, fontSize: 13, color: '#a7b0b6' }}>
            <NewItem accent="#e89357">
              <strong style={{ color: '#fbbf24' }}>Stack / Suckout / MI Lab</strong> — PTFE build-up, SPC flatwire shields, foil/braid coverage, suckout, TDR, S11, VSWR, insertion loss, and MI apply all live together.
            </NewItem>
            <NewItem accent="#5eead4">
              <strong style={{ color: '#fbbf24' }}>Design / Clone Workbench</strong> — library profiles, cable selector, compare mode, and design chain all share the same cable starting point.
            </NewItem>
            <NewItem accent="#a78bfa">
              <strong style={{ color: '#fbbf24' }}>Materials / MI Templates</strong> — stocked PTFE, SPC spiral, foil, braid families, and blank MI templates stay in the Build menu instead of becoming separate tabs.
            </NewItem>
          </ul>
        </section>

        <div style={{ marginTop: 36, paddingTop: 20, borderTop: '1px solid #252e33', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#6b7479', textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center' }}>
          v1 prototype · every formula local · no telemetry
        </div>
      </div>
    </div>
  );
}

function PrimaryCTA({ onClick, label }) {
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
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {label} →
    </button>
  );
}
function HeroReadout({ value, label, accent }) {
  return (
    <div style={{ background: 'rgba(7, 12, 14, 0.66)', padding: '14px 16px', minHeight: 76 }}>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 23, color: accent, fontWeight: 900, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#d6dee2', textTransform: 'uppercase', letterSpacing: 1.8, marginTop: 8 }}>{label}</div>
    </div>
  );
}
function CommandCard({ label, sub, accent, onClick }) {
  return (
    <button
      type="button"
      className="rf-command"
      onClick={onClick}
      style={{
        minHeight: 112,
        border: '1px solid rgba(167,176,182,0.18)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: 4,
        background: 'linear-gradient(135deg, rgba(15,22,24,0.92), rgba(8,12,13,0.72))',
        color: '#f0ebe2',
        textAlign: 'left',
        padding: 16,
        cursor: 'pointer',
        boxShadow: '0 16px 36px rgba(0,0,0,0.22)',
      }}
    >
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: accent, textTransform: 'uppercase', letterSpacing: 2.2, marginBottom: 12 }}>◆ Priority path</div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 21, color: '#f8efe0', lineHeight: 1.05 }}>{label}</div>
      <div style={{ marginTop: 8, color: '#9fb0b7', fontSize: 12, lineHeight: 1.45 }}>{sub}</div>
    </button>
  );
}
function SecondaryCTA({ onClick, label }) {
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
function StatTile({ value, label, sub, color }) {
  return (
    <div style={{ background: '#0a0d0f', padding: 14 }}>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 500, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#a7b0b6', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 6 }}>{label}</div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#6b7479', marginTop: 2 }}>{sub}</div>
    </div>
  );
}
function Stat({ label, value, accent }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#6b7479', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ color: accent, fontSize: 11 }}>{value}</div>
    </div>
  );
}
function ToolGlyph({ kind, color }) {
  const size = 22;
  if (kind === 'cable') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill={color} />
    </svg>
  );
  if (kind === 'plug') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M5 12h6m0 0v3m0-3v-3m0 3l4 4 5-5-4-4-5 5z" />
      <circle cx="12" cy="12" r="1.5" fill={color} />
    </svg>
  );
  if (kind === 'layers') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round">
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" opacity="0.6" />
      <path d="M3 17l9 5 9-5" opacity="0.3" />
    </svg>
  );
  if (kind === 'link') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 18l4-4M14 5l4-4M21 6l-3 3M9 19l-3 3" opacity="0.6" />
      <path d="M8 16l8-8M5 13l3 3 8-8 3 3" />
    </svg>
  );
  if (kind === 'tools') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 21l8-8m0 0l3-3m-3 3l-3-3m6 0l5 5-3 3-5-5m3-3l3-3-5-5-3 3" />
    </svg>
  );
  if (kind === 'failure') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13h4l1.5-4 1.5 8 2-12 2.5 15 1.5-7h5" />
      <path d="M17 5l4 4M21 5l-4 4" opacity="0.7" />
    </svg>
  );
  if (kind === 'launch') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h7" />
      <path d="M10 8v8" />
      <path d="M10 10h4l3-3h4v10h-4l-3-3h-4" />
      <path d="M18 9v6" opacity="0.55" />
      <circle cx="6" cy="12" r="1.5" fill={color} stroke="none" />
    </svg>
  );
  if (kind === 'shielding') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v5c0 4.4-2.8 8-7 10-4.2-2-7-5.6-7-10V6l7-3z" />
      <path d="M8 12h8" opacity="0.75" />
      <path d="M9 9c2 1.2 4 1.2 6 0M9 15c2-1.2 4-1.2 6 0" opacity="0.55" />
      <circle cx="12" cy="12" r="1.6" fill={color} stroke="none" />
    </svg>
  );
  if (kind === 'scanner') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16" />
      <path d="M12 5v6" />
      <path d="M9.5 11h5l-1.4 3h-2.2L9.5 11z" />
      <path d="M5 18c2.5-3 4.5-3 7 0s4.5 3 7 0" opacity="0.65" />
      <circle cx="12" cy="16" r="1.5" fill={color} stroke="none" />
    </svg>
  );
  if (kind === 'wave') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 12c2-4 3-4 5 0s3 4 5 0 3-4 5 0 3 4 5 0" />
    </svg>
  );
  if (kind === 'sparkles') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6M5 5l4 4M15 15l4 4M5 19l4-4M15 9l4-4" />
    </svg>
  );
  if (kind === 'book') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round">
      <path d="M4 4h16v16H4z" />
      <path d="M9 4v16M4 9h5" />
    </svg>
  );
  return null;
}
function NewItem({ accent, children }) {
  return (
    <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ color: accent, marginTop: 4, fontSize: 8 }}>●</span>
      <span style={{ flex: 1, lineHeight: 1.55 }}>{children}</span>
    </li>
  );
}

// Decorative Smith-chart inspired badge for the hero
function SmithChartBadge() {
  return (
    <svg width="200" height="200" viewBox="0 0 200 200" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="rf-smith-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c97b3f" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#5eead4" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="90" fill="url(#rf-smith-grad)" stroke="#c97b3f" strokeOpacity="0.5" strokeWidth="1" />
      {/* Constant-resistance circles */}
      {[
        { cx: 130, cy: 100, r: 60 },
        { cx: 145, cy: 100, r: 45 },
        { cx: 165, cy: 100, r: 25 },
        { cx: 100, cy: 100, r: 90 },
      ].map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill="none" stroke="#c97b3f" strokeOpacity="0.35" strokeWidth="1" />
      ))}
      {/* Constant-reactance arcs (top + bottom) */}
      {[40, 70, 120].map((r, i) => (
        <g key={i}>
          <circle cx={190} cy={100 - r} r={r} fill="none" stroke="#5eead4" strokeOpacity="0.35" strokeWidth="0.8" />
          <circle cx={190} cy={100 + r} r={r} fill="none" stroke="#5eead4" strokeOpacity="0.35" strokeWidth="0.8" />
        </g>
      ))}
      {/* Real-axis line */}
      <line x1="10" y1="100" x2="190" y2="100" stroke="#384249" strokeWidth="0.5" />
      {/* Pulse dot */}
      <circle cx="100" cy="100" r="3" fill="#fbbf24" style={{ animation: 'rfPulse 2s ease-in-out infinite' }} />
      {/* Center label */}
      <text x="100" y="190" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#6b7479" textAnchor="middle" letterSpacing="2">SMITH · 50 Ω</text>
    </svg>
  );
}

const RF_FAILURE_UI = {
  panel: {
    background: "linear-gradient(180deg, rgba(18,24,27,0.96), rgba(10,14,16,0.98))",
    border: "1px solid #26343a",
    borderRadius: 6,
    boxShadow: "0 14px 34px rgba(0,0,0,0.28)",
  },
  eyebrow: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 11,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "#fb923c",
    fontWeight: 800,
  },
};

const RF_FAILURE_BANDS = [
  { id: "low", label: "0-6 GHz", min: 0, max: 6 },
  { id: "mid", label: "0-18 GHz", min: 0, max: 18 },
  { id: "mmwave", label: "0-40 GHz", min: 0, max: 40 },
];

const RF_FAILURE_CASES = [
  {
    id: "kink",
    label: "Kink / tight bend",
    tag: "bend stress",
    accent: "#facc15",
    preview: "/cable-renders/rf-failure-kink.png",
    scene: "Local bend collapses the coax geometry and changes dielectric spacing.",
    tdr: "positive echo then recovery",
    s11: "broad return-loss lift",
    distanceM: 4.8,
    zShift: 6.5,
    width: 0.95,
    notchGHz: 7.2,
    notchWidth: 2.5,
    rlBase: 25.5,
    rlDamage: 12.2,
    fix: "Increase bend radius, reroute clamp points, and re-test TDR before final VNA sweep.",
  },
  {
    id: "crush",
    label: "Crushed jacket",
    tag: "clamp pressure",
    accent: "#fb7185",
    preview: "/cable-renders/rf-failure-crush.png",
    scene: "Compression flattens the shield and dielectric, lowering local impedance.",
    tdr: "negative impedance dip",
    s11: "mid-band VSWR rise",
    distanceM: 6.3,
    zShift: -7.4,
    width: 1.1,
    notchGHz: 5.9,
    notchWidth: 2.9,
    rlBase: 26.8,
    rlDamage: 14.8,
    fix: "Replace hard clamps with saddles or strain relief, then inspect OD with a go/no-go gauge.",
  },
  {
    id: "foil-gap",
    label: "Foil gap / shield tear",
    tag: "shield leak",
    accent: "#cbd5e1",
    preview: "/cable-renders/rf-failure-foil-gap.png",
    scene: "A shield discontinuity leaks energy and creates a high-frequency reflection point.",
    tdr: "small positive echo",
    s11: "high-frequency ripple",
    distanceM: 8.7,
    zShift: 4.3,
    width: 0.62,
    notchGHz: 14.4,
    notchWidth: 4.7,
    rlBase: 27.2,
    rlDamage: 10.6,
    fix: "Add overlap control, verify foil tension, and check braid coverage at the same station.",
  },
  {
    id: "eccentric",
    label: "Off-center dielectric",
    tag: "eccentric core",
    accent: "#5eead4",
    preview: "/cable-renders/rf-failure-eccentric.png",
    scene: "The center conductor is not concentric, creating a long impedance slope.",
    tdr: "slow impedance ramp",
    s11: "standing-wave ripple",
    distanceM: 5.7,
    zShift: 3.1,
    width: 2.8,
    notchGHz: 10.8,
    notchWidth: 5.5,
    rlBase: 28.0,
    rlDamage: 13.2,
    fix: "Tune extrusion centering, cooling stability, and take cross-section samples by reel.",
  },
  {
    id: "launch",
    label: "Bad connector launch",
    tag: "pin / ferrule step",
    accent: "#7dd3fc",
    preview: "/cable-renders/rf-failure-launch.png",
    scene: "The connector transition creates an abrupt 50 ohm discontinuity at the launch.",
    tdr: "sharp near-end spike",
    s11: "narrow launch resonance",
    distanceM: 0.35,
    zShift: 9.2,
    width: 0.34,
    notchGHz: 18.5,
    notchWidth: 3.2,
    rlBase: 26.0,
    rlDamage: 9.8,
    fix: "Adjust strip length, pin depth, ferrule crimp, and use a launch coupon for first-article approval.",
  },
];

function rfFailureClamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rfFailureGaussian(x, center, width) {
  const normalized = (x - center) / Math.max(width, 0.001);
  return Math.exp(-0.5 * normalized * normalized);
}

function rfFailureVswrFromReturnLoss(returnLossDb) {
  const gamma = Math.pow(10, -Math.max(returnLossDb, 0.1) / 20);
  return (1 + gamma) / Math.max(1 - gamma, 0.001);
}

function makeRfFailureTdrTrace(failure, severity) {
  const severityGain = severity / 100;
  return Array.from({ length: 96 }, (_, index) => {
    const distance = (index / 95) * 12;
    const echo = failure.zShift * severityGain * rfFailureGaussian(distance, failure.distanceM, failure.width);
    const ringing = Math.sin((distance - failure.distanceM) * 7) * echo * 0.12;
    return {
      distance: Number(distance.toFixed(2)),
      ohms: Number((50 + echo + ringing).toFixed(2)),
    };
  });
}

function makeRfFailureReturnLossTrace(failure, band, severity) {
  const severityGain = severity / 100;
  const maxGHz = band.max || 6;
  return Array.from({ length: 120 }, (_, index) => {
    const frequency = band.min + (index / 119) * (maxGHz - band.min);
    const base = failure.rlBase - 1.8 * Math.log10(frequency + 1);
    const notch = (failure.rlDamage + severityGain * 10) * rfFailureGaussian(frequency, failure.notchGHz, failure.notchWidth);
    const ripple = Math.sin(frequency * 2.1 + failure.distanceM) * severityGain * 1.1;
    return {
      frequency: Number(frequency.toFixed(2)),
      rl: Number((-rfFailureClamp(base - notch + ripple, 8, 34)).toFixed(2)),
    };
  });
}

function RFFailureTheater() {
  const [activeId, setActiveId] = useState("foil-gap");
  const [severity, setSeverity] = useState(72);
  const [bandId, setBandId] = useState("mid");

  const activeFailure = RF_FAILURE_CASES.find((item) => item.id === activeId) || RF_FAILURE_CASES[0];
  const activeBand = RF_FAILURE_BANDS.find((item) => item.id === bandId) || RF_FAILURE_BANDS[0];
  const tdrTrace = useMemo(() => makeRfFailureTdrTrace(activeFailure, severity), [activeFailure, severity]);
  const rlTrace = useMemo(() => makeRfFailureReturnLossTrace(activeFailure, activeBand, severity), [activeFailure, activeBand, severity]);
  const worstReturnLoss = Math.abs(Math.max(...rlTrace.map((point) => point.rl)));
  const peakVswr = rfFailureVswrFromReturnLoss(worstReturnLoss);
  const tdrPeak = Math.max(...tdrTrace.map((point) => Math.abs(point.ohms - 50)));

  return (
    <div style={S.viewInner} data-testid="rf-failure-theater">
      <div style={{ ...S.viewIntro, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 16, alignItems: "center" }}>
        <div style={{ width: 48, height: 48, border: "1px solid #324047", borderRadius: 4, display: "grid", placeItems: "center", color: "#fb923c" }}>
          <Sparkles size={22} />
        </div>
        <div>
          <div style={RF_FAILURE_UI.eyebrow}>RF Failure Theater</div>
          <div style={{ ...S.viewIntroStrong, marginTop: 6 }}>Physical defect {"->"} RF symptom</div>
          <div style={{ color: "#cbd5e1", lineHeight: 1.7, maxWidth: 820 }}>
            Coax-focused failure scenes connect a visible build defect to TDR impedance, return loss, VSWR, and the manufacturing fix.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18, marginTop: 22 }}>
        <section style={{ ...RF_FAILURE_UI.panel, overflow: "hidden" }}>
          <div style={{ position: "relative", height: "clamp(330px, 28vw, 430px)", background: "linear-gradient(135deg, #050808, #151b1e)" }}>
            <img
              src={activeFailure.preview}
              alt={`${activeFailure.label} RF coax defect preview`}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", opacity: 0.94 }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.58))" }} />
            <div style={{ position: "absolute", top: 14, left: 14, ...RF_FAILURE_UI.eyebrow, color: "#5eead4" }}>Blender RF Scene</div>
            <div style={{ position: "absolute", top: 18, right: 18, border: `1px solid ${activeFailure.accent}`, color: activeFailure.accent, borderRadius: 4, padding: "6px 10px", fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 800 }}>
              REVIEW
            </div>
            <div style={{ position: "absolute", left: "55%", top: "58%", transform: "translate(-50%, -50%)", width: 62, height: 62, borderRadius: "50%", border: `1px solid ${activeFailure.accent}`, display: "grid", placeItems: "center", color: "#fff", background: "rgba(6,10,12,0.74)", boxShadow: `0 0 36px ${activeFailure.accent}66` }}>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 800 }}>RF</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, padding: 12 }}>
            <RfFailureChip label="Scene" value={activeFailure.label} />
            <RfFailureChip label="TDR" value={activeFailure.tdr} accent="#67e8f9" />
            <RfFailureChip label="S11" value={activeFailure.s11} accent="#fbbf24" />
          </div>
        </section>

        <aside style={{ ...RF_FAILURE_UI.panel, padding: 18 }}>
          <div style={RF_FAILURE_UI.eyebrow}>Failure Director</div>
          <p style={{ color: "#cbd5e1", lineHeight: 1.6, margin: "8px 0 18px" }}>
            Select a coax fault, then tune severity and frequency band.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            {RF_FAILURE_CASES.map((failure) => (
              <button
                type="button"
                key={failure.id}
                onClick={() => setActiveId(failure.id)}
                style={{
                  textAlign: "left",
                  border: activeId === failure.id ? `1px solid ${failure.accent}` : "1px solid #243139",
                  background: activeId === failure.id ? `${failure.accent}16` : "#070c0e",
                  color: "#f8fafc",
                  borderRadius: 4,
                  padding: "13px 14px",
                  cursor: "pointer",
                  minHeight: 70,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 900 }}>
                  <span>{failure.label}</span>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: failure.accent }} />
                </div>
                <div style={{ marginTop: 6, color: "#7b8990", fontSize: 12 }}>{failure.tag}</div>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 2 }}>
              <span>Severity</span>
              <strong style={{ color: "#e2e8f0" }}>{severity}%</strong>
            </div>
            <input
              type="range"
              min="20"
              max="100"
              value={severity}
              onChange={(event) => setSeverity(Number(event.target.value))}
              style={{ width: "100%", marginTop: 12, accentColor: activeFailure.accent }}
              aria-label="RF failure severity"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 18 }}>
            {RF_FAILURE_BANDS.map((band) => (
              <button
                type="button"
                key={band.id}
                onClick={() => setBandId(band.id)}
                style={{
                  border: bandId === band.id ? "1px solid #cbd5e1" : "1px solid #26343a",
                  background: bandId === band.id ? "#1b2227" : "#070c0e",
                  color: "#dbeafe",
                  borderRadius: 4,
                  padding: "10px 8px",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {band.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 16 }}>
            <RfFailureMetric label="Worst RL" value={`${worstReturnLoss.toFixed(1)} dB`} sub={`clean ${activeFailure.rlBase.toFixed(1)}`} accent="#fbbf24" />
            <RfFailureMetric label="Peak VSWR" value={peakVswr.toFixed(2)} sub="from S11" accent="#fbbf24" />
            <RfFailureMetric label="TDR peak" value={`${tdrPeak.toFixed(1)} Ω`} sub={activeFailure.tdr} accent="#fbbf24" />
          </div>
        </aside>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18, marginTop: 18 }}>
        <section style={{ ...RF_FAILURE_UI.panel, padding: 16 }}>
          <RfFailureChartHeader label="TDR impedance trace" value={`${activeFailure.distanceM.toFixed(1)} m defect`} />
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tdrTrace} margin={{ top: 12, right: 12, bottom: 4, left: -10 }}>
                <CartesianGrid stroke="#1d2a30" strokeDasharray="4 4" />
                <XAxis dataKey="distance" tick={{ fill: "#718088", fontSize: 11 }} unit="m" />
                <YAxis domain={[38, 62]} tick={{ fill: "#718088", fontSize: 11 }} unit="Ω" />
                <Tooltip
                  contentStyle={{ background: "#081013", border: "1px solid #26343a", borderRadius: 4, color: "#e2e8f0" }}
                  formatter={(value) => [`${Number(value).toFixed(1)} Ω`, "Impedance"]}
                  labelFormatter={(value) => `${Number(value).toFixed(1)} m`}
                />
                <ReferenceLine y={50} stroke="#64748b" strokeDasharray="3 3" />
                <ReferenceLine x={activeFailure.distanceM} stroke={activeFailure.accent} strokeDasharray="5 5" />
                <Line type="monotone" dataKey="ohms" stroke={activeFailure.accent} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section style={{ ...RF_FAILURE_UI.panel, padding: 16 }}>
          <RfFailureChartHeader label="Return loss / S11" value={activeBand.label} />
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rlTrace} margin={{ top: 12, right: 12, bottom: 4, left: -10 }}>
                <CartesianGrid stroke="#1d2a30" strokeDasharray="4 4" />
                <XAxis dataKey="frequency" tick={{ fill: "#718088", fontSize: 11 }} unit="GHz" />
                <YAxis domain={[-35, -8]} tick={{ fill: "#718088", fontSize: 11 }} unit="dB" />
                <Tooltip
                  contentStyle={{ background: "#081013", border: "1px solid #26343a", borderRadius: 4, color: "#e2e8f0" }}
                  formatter={(value) => [`${Number(value).toFixed(1)} dB`, "S11"]}
                  labelFormatter={(value) => `${Number(value).toFixed(1)} GHz`}
                />
                <ReferenceLine y={-15} stroke="#f97316" strokeDasharray="3 3" label={{ value: "-15 dB", fill: "#f97316", fontSize: 10 }} />
                <ReferenceLine x={activeFailure.notchGHz} stroke={activeFailure.accent} strokeDasharray="5 5" />
                <Line type="monotone" dataKey="rl" stroke={activeFailure.accent} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 18 }}>
        <RfFailureSmithCard failure={activeFailure} worstReturnLoss={worstReturnLoss} peakVswr={peakVswr} />
        <RfFailureChainCard failure={activeFailure} />
      </div>
    </div>
  );
}

function RfFailureChip({ label, value, accent = "#f8fafc" }) {
  return (
    <div style={{ border: "1px solid #25333a", background: "#080d10", borderRadius: 4, padding: "10px 12px", minHeight: 60 }}>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: "#718088", textTransform: "uppercase", letterSpacing: 1.5 }}>{label}</div>
      <div style={{ color: accent, fontFamily: '"JetBrains Mono", monospace', fontWeight: 800, fontSize: 12, marginTop: 7 }}>{value}</div>
    </div>
  );
}

function RfFailureMetric({ label, value, sub, accent }) {
  return (
    <div style={{ border: "1px solid #25333a", background: "#080d10", borderRadius: 4, padding: 12 }}>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: "#718088", textTransform: "uppercase", letterSpacing: 1.5 }}>{label}</div>
      <div style={{ color: accent, fontSize: 20, fontFamily: '"JetBrains Mono", monospace', fontWeight: 900, marginTop: 8 }}>{value}</div>
      <div style={{ color: "#6b7479", fontSize: 11, marginTop: 3 }}>{sub}</div>
    </div>
  );
}

function RfFailureChartHeader({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
      <div style={RF_FAILURE_UI.eyebrow}>{label}</div>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', color: "#94a3b8", fontSize: 11 }}>{value}</div>
    </div>
  );
}

function RfFailureSmithCard({ failure, worstReturnLoss, peakVswr }) {
  const gamma = Math.pow(10, -worstReturnLoss / 20);
  const dotX = 96 + Math.cos(failure.notchGHz * 0.7) * gamma * 76;
  const dotY = 96 + Math.sin(failure.notchGHz * 0.7) * gamma * 76;

  return (
    <section style={{ ...RF_FAILURE_UI.panel, padding: 16 }}>
      <div style={RF_FAILURE_UI.eyebrow}>Smith / mismatch view</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, alignItems: "center", marginTop: 12 }}>
        <svg viewBox="0 0 192 192" style={{ width: "100%", maxWidth: 210, justifySelf: "center" }} aria-label="Simplified Smith chart">
          <circle cx="96" cy="96" r="82" fill="#071012" stroke="#334149" />
          <circle cx="126" cy="96" r="52" fill="none" stroke="#41515a" />
          <circle cx="146" cy="96" r="32" fill="none" stroke="#41515a" />
          <circle cx="96" cy="46" r="50" fill="none" stroke="#26343a" />
          <circle cx="96" cy="146" r="50" fill="none" stroke="#26343a" />
          <line x1="14" y1="96" x2="178" y2="96" stroke="#41515a" />
          <circle cx="96" cy="96" r="4" fill="#5eead4" />
          <circle cx={dotX} cy={dotY} r="7" fill={failure.accent} filter="url(#rfFailureGlow)" />
          <defs>
            <filter id="rfFailureGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>
        <div>
          <div style={{ color: "#e2e8f0", fontSize: 18, fontWeight: 800 }}>{peakVswr.toFixed(2)} VSWR peak</div>
          <p style={{ color: "#9aa6ad", lineHeight: 1.65, margin: "8px 0 0" }}>
            The reflection vector moves away from the 50 ohm center as the physical defect gets stronger. Worst return loss is {worstReturnLoss.toFixed(1)} dB in this band.
          </p>
        </div>
      </div>
    </section>
  );
}

function RfFailureChainCard({ failure }) {
  const steps = [
    { label: "Physical", value: failure.scene },
    { label: "Measurement", value: `${failure.tdr}; ${failure.s11}.` },
    { label: "Production fix", value: failure.fix },
  ];

  return (
    <section style={{ ...RF_FAILURE_UI.panel, padding: 16 }}>
      <div style={RF_FAILURE_UI.eyebrow}>Root cause chain</div>
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {steps.map((step, index) => (
          <div key={step.label} style={{ display: "grid", gridTemplateColumns: "38px minmax(0, 1fr)", gap: 12 }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", border: `1px solid ${failure.accent}`, color: failure.accent, fontFamily: '"JetBrains Mono", monospace', fontWeight: 900, fontSize: 12 }}>
              {index + 1}
            </div>
            <div>
              <div style={{ color: "#e2e8f0", fontFamily: '"JetBrains Mono", monospace', fontWeight: 900, fontSize: 12 }}>{step.label}</div>
              <div style={{ color: "#9aa6ad", lineHeight: 1.6, marginTop: 3 }}>{step.value}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const CONNECTOR_LAUNCH_PRESETS = [
  {
    id: "sma18",
    label: "SMA 18 GHz",
    sub: "test cable launch",
    accent: "#38bdf8",
    targetRl: 24,
    pinMm: 0.04,
    stripMm: 0.00,
    gapMm: 0.04,
    stepMm: 0.03,
    ovalityPct: 4,
    bandId: "mid",
    fix: "Tighten pin depth, keep PTFE support flush, and verify strip length under microscope before crimp.",
  },
  {
    id: "nType",
    label: "N-Type field",
    sub: "rugged crimp",
    accent: "#fbbf24",
    targetRl: 21,
    pinMm: 0.08,
    stripMm: 0.12,
    gapMm: 0.08,
    stepMm: 0.05,
    ovalityPct: 8,
    bandId: "low",
    fix: "Use a strip-stop tool, inspect ferrule shoulder seating, and reject oval crimps above the spec limit.",
  },
  {
    id: "bnc75",
    label: "75Ω BNC",
    sub: "video / broadcast",
    accent: "#5eead4",
    targetRl: 23,
    pinMm: -0.03,
    stripMm: -0.08,
    gapMm: 0.03,
    stepMm: 0.02,
    ovalityPct: 5,
    bandId: "low",
    fix: "Keep dielectric flush to the rear insulator and avoid nicking the foil shield during strip.",
  },
  {
    id: "mmwave",
    label: "2.92 mm",
    sub: "mmWave sensitive",
    accent: "#a78bfa",
    targetRl: 28,
    pinMm: 0.02,
    stripMm: 0.04,
    gapMm: 0.02,
    stepMm: 0.02,
    ovalityPct: 3,
    bandId: "mmwave",
    fix: "Control pin plane within a few mils, polish the dielectric face, and use VNA time-gating to isolate the launch.",
  },
];

const CONNECTOR_LAUNCH_SCENES = {
  golden: {
    label: "Golden launch",
    sub: "flush dielectric · centered pin · round ferrule",
    image: "/cable-renders/rf-launch-golden.png",
    accent: "#5eead4",
    note: "Use this as the visual reference for a clean connector launch.",
    hotspots: [
      { left: "66%", top: "47%", color: "#5eead4", label: "Reference planes", value: () => "flush stack" },
      { left: "78%", top: "53%", color: "#38bdf8", label: "Pin plane", value: ({ pinMm, pinLabel }) => `${pinMm.toFixed(2)} mm · ${pinLabel}` },
      { left: "57%", top: "71%", color: "#fbbf24", label: "Ferrule", value: () => "round seat" },
    ],
  },
  "pin-plane": {
    label: "Pin plane offset",
    sub: "center contact too long / short",
    image: "/cable-renders/rf-launch-pin-plane.png",
    accent: "#38bdf8",
    note: "Pin plane error moves the first discontinuity right at the connector face.",
    hotspots: [
      { left: "72%", top: "41%", color: "#38bdf8", label: "Target plane", value: () => "nominal" },
      { left: "82%", top: "52%", color: "#7dd3fc", label: "Actual pin", value: ({ pinMm, pinLabel }) => `${pinMm.toFixed(2)} mm · ${pinLabel}` },
      { left: "64%", top: "69%", color: "#fbbf24", label: "TDR echo", value: ({ launch }) => `${launch.deltaZ >= 0 ? "+" : ""}${launch.deltaZ.toFixed(1)} Ω` },
    ],
  },
  "strip-length": {
    label: "Strip length error",
    sub: "exposed dielectric / shield transition",
    image: "/cable-renders/rf-launch-strip-length.png",
    accent: "#fbbf24",
    note: "Bad strip length changes how much dielectric and shield transition the launch sees.",
    hotspots: [
      { left: "45%", top: "35%", color: "#fbbf24", label: "Strip window", value: ({ stripMm, stripLabel }) => `${stripMm.toFixed(2)} mm · ${stripLabel}` },
      { left: "65%", top: "59%", color: "#fbbf24", label: "Dielectric edge", value: () => "support face" },
      { left: "57%", top: "72%", color: "#fb923c", label: "Shield pickup", value: ({ launch }) => `${launch.resonance.toFixed(1)} GHz` },
    ],
  },
  "dielectric-gap": {
    label: "Dielectric gap",
    sub: "air pocket at connector launch",
    image: "/cable-renders/rf-launch-dielectric-gap.png",
    accent: "#5eead4",
    note: "Air at the launch raises local impedance and creates a compact S11 notch.",
    hotspots: [
      { left: "66%", top: "45%", color: "#5eead4", label: "Air gap", value: ({ gapMm }) => `${gapMm.toFixed(2)} mm` },
      { left: "74%", top: "59%", color: "#67e8f9", label: "Fringe field", value: () => "mode step" },
      { left: "55%", top: "70%", color: "#fbbf24", label: "RL notch", value: ({ launch }) => `${launch.worstReturnLoss.toFixed(1)} dB` },
    ],
  },
  "ferrule-step": {
    label: "Ferrule shoulder step",
    sub: "shield OD step / seating error",
    image: "/cable-renders/rf-launch-ferrule-step.png",
    accent: "#fb923c",
    note: "A ferrule shoulder step reflects current at the shield transition before the pin looks wrong.",
    hotspots: [
      { left: "57%", top: "56%", color: "#fb923c", label: "Shoulder step", value: ({ stepMm }) => `${stepMm.toFixed(2)} mm` },
      { left: "48%", top: "72%", color: "#fbbf24", label: "Shield current", value: () => "interrupted" },
      { left: "70%", top: "45%", color: "#38bdf8", label: "Pin still OK", value: ({ pinMm }) => `${pinMm.toFixed(2)} mm` },
    ],
  },
  "crimp-ovality": {
    label: "Crimp ovality",
    sub: "ferrule no longer round",
    image: "/cable-renders/rf-launch-crimp-ovality.png",
    accent: "#fb7185",
    note: "Oval crimp changes shield geometry and creates a broad near-end ripple.",
    hotspots: [
      { left: "48%", top: "35%", color: "#fb7185", label: "Crimp die", value: ({ ovalityPct }) => `${ovalityPct.toFixed(0)}% ovality` },
      { left: "55%", top: "62%", color: "#f472b6", label: "Oval ferrule", value: () => "roundness loss" },
      { left: "72%", top: "48%", color: "#fbbf24", label: "Ripple", value: ({ launch }) => `${launch.peakVswr.toFixed(2)} VSWR` },
    ],
  },
};

function rfLaunchClamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeConnectorLaunch({ preset, pinMm, stripMm, gapMm, stepMm, ovalityPct, band }) {
  const pinRisk = Math.abs(pinMm) / 0.35;
  const stripRisk = Math.abs(stripMm) / 0.8;
  const gapRisk = gapMm / 0.55;
  const stepRisk = stepMm / 0.28;
  const ovalRisk = ovalityPct / 30;
  const rawRisk = pinRisk * 26 + stripRisk * 20 + gapRisk * 24 + stepRisk * 22 + ovalRisk * 16;
  const risk = rfLaunchClamp(rawRisk, 0, 100);
  const deltaZ = pinMm * 18 + stripMm * 6 + gapMm * 11 - stepMm * 15 + ovalityPct * 0.08;
  const resonance = rfLaunchClamp(
    2.2 + Math.abs(pinMm) * 12 + Math.abs(stripMm) * 6.5 + gapMm * 13 + stepMm * 18 + (band.max > 18 ? 10 : band.max > 6 ? 4 : 0),
    0.8,
    Math.max(1.2, band.max * 0.92),
  );
  const bandPenalty = band.max > 18 ? 5 : band.max > 6 ? 2 : 0;
  const worstReturnLoss = rfLaunchClamp(preset.targetRl - risk * 0.17 - bandPenalty, 6.2, 34);
  const gamma = Math.pow(10, -worstReturnLoss / 20);
  const peakVswr = (1 + gamma) / Math.max(1 - gamma, 0.001);
  const mismatchLoss = -10 * Math.log10(Math.max(1 - gamma * gamma, 0.001));
  const grade = worstReturnLoss >= 20 ? "PASS" : worstReturnLoss >= 14 ? "REVIEW" : "REWORK";
  const gradeColor = worstReturnLoss >= 20 ? "#5eead4" : worstReturnLoss >= 14 ? "#fbbf24" : "#fb7185";
  const dominantItem = [
    { id: "pin-plane", label: "Pin plane", value: pinRisk },
    { id: "strip-length", label: "Strip length", value: stripRisk },
    { id: "dielectric-gap", label: "Dielectric gap", value: gapRisk },
    { id: "ferrule-step", label: "Ferrule step", value: stepRisk },
    { id: "crimp-ovality", label: "Crimp ovality", value: ovalRisk },
  ].sort((a, b) => b.value - a.value)[0];
  const dominant = dominantItem.label;
  const dominantId = dominantItem.id;

  return { risk, deltaZ, resonance, worstReturnLoss, peakVswr, mismatchLoss, grade, gradeColor, dominant, dominantId };
}

function makeConnectorLaunchTdr({ pinMm, stripMm, gapMm, stepMm, ovalityPct }) {
  return Array.from({ length: 110 }, (_, index) => {
    const mm = (index / 109) * 52;
    const pinEcho = pinMm * 18 * rfFailureGaussian(mm, 7, 3.2);
    const stripEcho = stripMm * 7 * rfFailureGaussian(mm, 17, 6.2);
    const gapEcho = gapMm * 14 * rfFailureGaussian(mm, 27, 4.4);
    const stepEcho = -stepMm * 18 * rfFailureGaussian(mm, 38, 5.2);
    const crimpEcho = ovalityPct * 0.075 * Math.sin(mm * 0.55) * rfFailureGaussian(mm, 33, 14);
    return {
      mm: Number(mm.toFixed(1)),
      ohms: Number((50 + pinEcho + stripEcho + gapEcho + stepEcho + crimpEcho).toFixed(2)),
    };
  });
}

function makeConnectorLaunchS11({ preset, band, launch }) {
  const maxGHz = band.max || 6;
  return Array.from({ length: 130 }, (_, index) => {
    const frequency = band.min + (index / 129) * (maxGHz - band.min);
    const clean = preset.targetRl + 6 - 1.6 * Math.log10(frequency + 1);
    const launchDip = (9 + launch.risk * 0.17) * rfFailureGaussian(frequency, launch.resonance, Math.max(0.55, maxGHz * 0.075));
    const harmonic = (2 + launch.risk * 0.045) * rfFailureGaussian(frequency, launch.resonance * 1.85, Math.max(0.75, maxGHz * 0.09));
    const ripple = Math.sin(frequency * 2.4 + launch.deltaZ * 0.12) * launch.risk * 0.018;
    const positiveRl = rfLaunchClamp(clean - launchDip - harmonic + ripple, 5.5, 34);
    return {
      frequency: Number(frequency.toFixed(2)),
      rl: Number((-positiveRl).toFixed(2)),
    };
  });
}

function ConnectorLaunchExplainerVideo() {
  return (
    <div style={{ position: "relative", minHeight: 220, aspectRatio: "16 / 9", border: "1px solid #26343a", borderRadius: 4, overflow: "hidden", background: "#05090a" }}>
      <video
        aria-label="Connector Launch Lab RF pulse animation"
        autoPlay
        loop
        muted
        playsInline
        poster="/launch/connector-launch-explainer-poster.jpg"
        preload="metadata"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", transform: "scale(1.02)", transformOrigin: "center center" }}
      >
        <source src="/launch/connector-launch-explainer.webm" type="video/webm" />
        <source src="/launch/connector-launch-explainer.mp4" type="video/mp4" />
      </video>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.28))" }} />
    </div>
  );
}

function ConnectorLaunchLab() {
  const [presetId, setPresetId] = useState("sma18");
  const selectedPreset = CONNECTOR_LAUNCH_PRESETS.find((preset) => preset.id === presetId) || CONNECTOR_LAUNCH_PRESETS[0];
  const [pinMm, setPinMm] = useState(selectedPreset.pinMm);
  const [stripMm, setStripMm] = useState(selectedPreset.stripMm);
  const [gapMm, setGapMm] = useState(selectedPreset.gapMm);
  const [stepMm, setStepMm] = useState(selectedPreset.stepMm);
  const [ovalityPct, setOvalityPct] = useState(selectedPreset.ovalityPct);
  const [bandId, setBandId] = useState(selectedPreset.bandId);

  const activeBand = RF_FAILURE_BANDS.find((band) => band.id === bandId) || RF_FAILURE_BANDS[1];
  const launch = useMemo(
    () => computeConnectorLaunch({ preset: selectedPreset, pinMm, stripMm, gapMm, stepMm, ovalityPct, band: activeBand }),
    [selectedPreset, pinMm, stripMm, gapMm, stepMm, ovalityPct, activeBand],
  );
  const tdrTrace = useMemo(() => makeConnectorLaunchTdr({ pinMm, stripMm, gapMm, stepMm, ovalityPct }), [pinMm, stripMm, gapMm, stepMm, ovalityPct]);
  const s11Trace = useMemo(() => makeConnectorLaunchS11({ preset: selectedPreset, band: activeBand, launch }), [selectedPreset, activeBand, launch]);
  const launchScene = (launch.risk <= 6 ? CONNECTOR_LAUNCH_SCENES.golden : CONNECTOR_LAUNCH_SCENES[launch.dominantId]) || CONNECTOR_LAUNCH_SCENES.golden;
  const applyPreset = (preset) => {
    setPresetId(preset.id);
    setPinMm(preset.pinMm);
    setStripMm(preset.stripMm);
    setGapMm(preset.gapMm);
    setStepMm(preset.stepMm);
    setOvalityPct(preset.ovalityPct);
    setBandId(preset.bandId);
  };

  const pinLabel = pinMm >= 0 ? "pin long" : "pin short";
  const stripLabel = stripMm >= 0 ? "over-strip" : "under-strip";
  const hotspotContext = { pinMm, pinLabel, stripMm, stripLabel, gapMm, stepMm, ovalityPct, launch };

  return (
    <div style={S.viewInner} data-testid="connector-launch-lab">
      <div style={{ ...S.viewIntro, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 18, alignItems: "center" }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 16, alignItems: "center" }}>
          <div style={{ width: 48, height: 48, border: "1px solid #324047", borderRadius: 4, display: "grid", placeItems: "center", color: "#38bdf8" }}>
            <Gauge size={22} />
          </div>
          <div>
            <div style={{ ...RF_FAILURE_UI.eyebrow, color: "#38bdf8" }}>Connector Launch Lab</div>
            <div style={{ ...S.viewIntroStrong, marginTop: 6 }}>Connector geometry {"->"} return-loss story</div>
            <div style={{ color: "#cbd5e1", lineHeight: 1.7, maxWidth: 860 }}>
              Tune pin plane, strip length, dielectric gap, ferrule step, and crimp ovality to see the near-end TDR echo and S11 resonance move.
            </div>
          </div>
        </div>
        <ConnectorLaunchExplainerVideo />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18, marginTop: 22 }}>
        <section style={{ ...RF_FAILURE_UI.panel, overflow: "hidden" }}>
          <div style={{ position: "relative", height: "clamp(340px, 30vw, 470px)", background: "linear-gradient(135deg, #050808, #11181b)" }}>
            <img
              data-testid="connector-launch-blender-preview"
              src={launchScene.image}
              alt={`${launchScene.label} Blender connector launch close-up`}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: 0.97 }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.48))" }} />
            <div style={{ position: "absolute", top: 14, left: 14, ...RF_FAILURE_UI.eyebrow, color: "#5eead4" }}>Blender launch close-up</div>
            <div style={{ position: "absolute", top: 14, right: 14, border: `1px solid ${launchScene.accent}`, background: "rgba(5,9,11,0.72)", color: launchScene.accent, borderRadius: 4, padding: "7px 10px", fontFamily: '"JetBrains Mono", monospace', fontSize: 10, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase" }}>
              {launchScene.label}
            </div>
            {launchScene.hotspots.map((hotspot) => (
              <LaunchHotspot
                key={hotspot.label}
                left={hotspot.left}
                top={hotspot.top}
                color={hotspot.color}
                label={hotspot.label}
                value={hotspot.value(hotspotContext)}
              />
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, padding: 12 }}>
            <RfFailureChip label="Launch grade" value={launch.grade} accent={launch.gradeColor} />
            <RfFailureChip label="Dominant risk" value={launch.dominant} accent={launchScene.accent} />
            <RfFailureChip label="Resonance" value={`${launch.resonance.toFixed(1)} GHz`} accent="#fbbf24" />
          </div>
          <div style={{ padding: "0 12px 12px", color: "#9aa6ad", fontSize: 12, lineHeight: 1.55 }}>
            <span style={{ color: launchScene.accent, fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>{launchScene.sub}</span>
            <span> — {launchScene.note}</span>
          </div>
        </section>

        <aside style={{ ...RF_FAILURE_UI.panel, padding: 18 }}>
          <div style={RF_FAILURE_UI.eyebrow}>Launch Tuner</div>
          <p style={{ color: "#cbd5e1", lineHeight: 1.6, margin: "8px 0 16px" }}>
            Pick a connector baseline, then move the assembly dimensions away from nominal.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            {CONNECTOR_LAUNCH_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.id}
                onClick={() => applyPreset(preset)}
                style={{
                  textAlign: "left",
                  border: presetId === preset.id ? `1px solid ${preset.accent}` : "1px solid #243139",
                  background: presetId === preset.id ? `${preset.accent}16` : "#070c0e",
                  color: "#f8fafc",
                  borderRadius: 4,
                  padding: "12px 13px",
                  cursor: "pointer",
                  minHeight: 66,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 900 }}>
                  <span>{preset.label}</span>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: preset.accent }} />
                </div>
                <div style={{ marginTop: 6, color: "#7b8990", fontSize: 12 }}>{preset.sub}</div>
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            <LaunchSlider label="Pin protrusion" value={pinMm} setValue={setPinMm} min={-0.35} max={0.35} step={0.01} unit="mm" hint={pinLabel} accent="#38bdf8" />
            <LaunchSlider label="Strip length error" value={stripMm} setValue={setStripMm} min={-0.8} max={0.8} step={0.02} unit="mm" hint={stripLabel} accent="#fbbf24" />
            <LaunchSlider label="Dielectric gap" value={gapMm} setValue={setGapMm} min={0} max={0.55} step={0.01} unit="mm" hint="air at launch" accent="#5eead4" />
            <LaunchSlider label="Ferrule shoulder step" value={stepMm} setValue={setStepMm} min={0} max={0.28} step={0.01} unit="mm" hint="shield discontinuity" accent="#fb923c" />
            <LaunchSlider label="Crimp ovality" value={ovalityPct} setValue={setOvalityPct} min={0} max={30} step={1} unit="%" hint="roundness loss" accent="#f87171" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 18 }}>
            {RF_FAILURE_BANDS.map((band) => (
              <button
                type="button"
                key={band.id}
                onClick={() => setBandId(band.id)}
                style={{
                  border: bandId === band.id ? "1px solid #cbd5e1" : "1px solid #26343a",
                  background: bandId === band.id ? "#1b2227" : "#070c0e",
                  color: "#dbeafe",
                  borderRadius: 4,
                  padding: "10px 8px",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {band.label}
              </button>
            ))}
          </div>
        </aside>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginTop: 18 }}>
        <RfFailureMetric label="Worst return loss" value={`${launch.worstReturnLoss.toFixed(1)} dB`} sub={`target ${selectedPreset.targetRl} dB`} accent={launch.gradeColor} />
        <RfFailureMetric label="Peak VSWR" value={launch.peakVswr.toFixed(2)} sub="from worst S11" accent="#fbbf24" />
        <RfFailureMetric label="Launch ΔZ" value={`${launch.deltaZ >= 0 ? "+" : ""}${launch.deltaZ.toFixed(1)} Ω`} sub="near-end discontinuity" accent="#67e8f9" />
        <RfFailureMetric label="Mismatch loss" value={`${launch.mismatchLoss.toFixed(3)} dB`} sub="reflection only" accent="#cbd5e1" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18, marginTop: 18 }}>
        <section style={{ ...RF_FAILURE_UI.panel, padding: 16 }}>
          <RfFailureChartHeader label="Near-end TDR launch trace" value="0-52 mm from connector" />
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tdrTrace} margin={{ top: 12, right: 12, bottom: 4, left: -10 }}>
                <CartesianGrid stroke="#1d2a30" strokeDasharray="4 4" />
                <XAxis dataKey="mm" tick={{ fill: "#718088", fontSize: 11 }} unit="mm" />
                <YAxis domain={[42, 58]} tick={{ fill: "#718088", fontSize: 11 }} unit="Ω" />
                <Tooltip
                  contentStyle={{ background: "#081013", border: "1px solid #26343a", borderRadius: 4, color: "#e2e8f0" }}
                  formatter={(value) => [`${Number(value).toFixed(1)} Ω`, "Impedance"]}
                  labelFormatter={(value) => `${Number(value).toFixed(1)} mm`}
                />
                <ReferenceLine y={50} stroke="#64748b" strokeDasharray="3 3" />
                <ReferenceLine x={7} stroke="#38bdf8" strokeDasharray="4 4" />
                <ReferenceLine x={27} stroke="#5eead4" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="ohms" stroke={launch.gradeColor} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section style={{ ...RF_FAILURE_UI.panel, padding: 16 }}>
          <RfFailureChartHeader label="Return loss / launch resonance" value={activeBand.label} />
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={s11Trace} margin={{ top: 12, right: 12, bottom: 4, left: -10 }}>
                <CartesianGrid stroke="#1d2a30" strokeDasharray="4 4" />
                <XAxis dataKey="frequency" tick={{ fill: "#718088", fontSize: 11 }} unit="GHz" />
                <YAxis domain={[-34, -5]} tick={{ fill: "#718088", fontSize: 11 }} unit="dB" />
                <Tooltip
                  contentStyle={{ background: "#081013", border: "1px solid #26343a", borderRadius: 4, color: "#e2e8f0" }}
                  formatter={(value) => [`${Number(value).toFixed(1)} dB`, "S11"]}
                  labelFormatter={(value) => `${Number(value).toFixed(1)} GHz`}
                />
                <ReferenceLine y={-20} stroke="#5eead4" strokeDasharray="3 3" label={{ value: "-20 dB", fill: "#5eead4", fontSize: 10 }} />
                <ReferenceLine y={-14} stroke="#f97316" strokeDasharray="3 3" label={{ value: "-14 dB", fill: "#f97316", fontSize: 10 }} />
                <ReferenceLine x={launch.resonance} stroke="#38bdf8" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="rl" stroke={launch.gradeColor} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 18 }}>
        <LaunchSmithCard launch={launch} />
        <LaunchInspectionCard launch={launch} preset={selectedPreset} />
      </div>
    </div>
  );
}

function LaunchSlider({ label, value, setValue, min, max, step, unit, hint, accent }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', color: "#cbd5e1", fontSize: 11, textTransform: "uppercase", letterSpacing: 1.8 }}>{label}</div>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', color: accent, fontSize: 12, fontWeight: 900 }}>
          {value >= 0 ? "+" : ""}{Number(value).toFixed(step < 0.02 ? 2 : 1)} {unit}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
        style={{ width: "100%", marginTop: 7, accentColor: accent }}
        aria-label={label}
      />
      <div style={{ display: "flex", justifyContent: "space-between", color: "#64727a", fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}>
        <span>{min}{unit}</span>
        <span>{hint}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

function LaunchHotspot({ left, top, color, label, value }) {
  return (
    <div style={{ position: "absolute", left, top, transform: "translate(-50%, -50%)", display: "grid", placeItems: "center", pointerEvents: "none" }}>
      <div style={{ width: 50, height: 50, borderRadius: "50%", border: `1px solid ${color}`, boxShadow: `0 0 24px ${color}55`, display: "grid", placeItems: "center", background: "rgba(5,9,11,0.70)" }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      </div>
      <div style={{ marginTop: 6, padding: "6px 9px", border: `1px solid ${color}80`, background: "rgba(5,9,11,0.78)", borderRadius: 4, minWidth: 120, textAlign: "center" }}>
        <div style={{ color, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, textTransform: "uppercase", letterSpacing: 1.6, fontWeight: 900 }}>{label}</div>
        <div style={{ color: "#dbeafe", fontSize: 11, marginTop: 3 }}>{value}</div>
      </div>
    </div>
  );
}

function LaunchSmithCard({ launch }) {
  const gamma = Math.pow(10, -launch.worstReturnLoss / 20);
  const angle = Math.atan2(launch.deltaZ, 12) + launch.resonance * 0.42;
  const dotX = 96 + Math.cos(angle) * gamma * 82;
  const dotY = 96 + Math.sin(angle) * gamma * 82;

  return (
    <section style={{ ...RF_FAILURE_UI.panel, padding: 16 }}>
      <div style={RF_FAILURE_UI.eyebrow}>Launch Smith pin</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, alignItems: "center", marginTop: 12 }}>
        <svg viewBox="0 0 192 192" style={{ width: "100%", maxWidth: 210, justifySelf: "center" }} aria-label="Connector launch Smith chart">
          <circle cx="96" cy="96" r="82" fill="#071012" stroke="#334149" />
          <circle cx="126" cy="96" r="52" fill="none" stroke="#41515a" />
          <circle cx="146" cy="96" r="32" fill="none" stroke="#41515a" />
          <circle cx="96" cy="46" r="50" fill="none" stroke="#26343a" />
          <circle cx="96" cy="146" r="50" fill="none" stroke="#26343a" />
          <line x1="14" y1="96" x2="178" y2="96" stroke="#41515a" />
          <circle cx="96" cy="96" r="4" fill="#5eead4" />
          <path d={`M96 96 L${dotX.toFixed(1)} ${dotY.toFixed(1)}`} stroke="#64748b" strokeDasharray="3 3" />
          <circle cx={dotX} cy={dotY} r="7" fill={launch.gradeColor} />
        </svg>
        <div>
          <div style={{ color: launch.gradeColor, fontSize: 18, fontWeight: 900 }}>{launch.grade} · {launch.worstReturnLoss.toFixed(1)} dB RL</div>
          <p style={{ color: "#9aa6ad", lineHeight: 1.65, margin: "8px 0 0" }}>
            The Smith point moves away from center as the launch impedance step grows. Delta-Z is {launch.deltaZ >= 0 ? "+" : ""}{launch.deltaZ.toFixed(1)} ohms.
          </p>
        </div>
      </div>
    </section>
  );
}

function LaunchInspectionCard({ launch, preset }) {
  const items = [
    { label: "First inspection", value: `${launch.dominant} is the biggest contributor in this setup.` },
    { label: "VNA view", value: `Time-gate the near-end launch around ${launch.resonance.toFixed(1)} GHz to separate connector from cable loss.` },
    { label: "Production action", value: preset.fix },
  ];

  return (
    <section style={{ ...RF_FAILURE_UI.panel, padding: 16 }}>
      <div style={RF_FAILURE_UI.eyebrow}>QC playbook</div>
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {items.map((item, index) => (
          <div key={item.label} style={{ display: "grid", gridTemplateColumns: "34px minmax(0, 1fr)", gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", border: `1px solid ${launch.gradeColor}`, color: launch.gradeColor, fontFamily: '"JetBrains Mono", monospace', fontWeight: 900, fontSize: 12 }}>
              {index + 1}
            </div>
            <div>
              <div style={{ color: "#e2e8f0", fontFamily: '"JetBrains Mono", monospace', fontWeight: 900, fontSize: 12 }}>{item.label}</div>
              <div style={{ color: "#9aa6ad", lineHeight: 1.6, marginTop: 3 }}>{item.value}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const RF_SHIELD_PRESETS = [
  {
    id: "none",
    label: "No shield",
    sub: "dielectric + jacket only",
    image: "/cable-renders/rf-shield-none.png",
    accent: "#fb7185",
    coverage: 0,
    foilOverlap: 0,
    seamGap: 1.2,
    transfer: 180,
    bond: 18,
    hasFoil: false,
    stackBonus: 0,
    layerNote: "No conductive barrier between the incident field and the dielectric.",
    fix: "Add a continuous shield layer before worrying about connector details.",
  },
  {
    id: "braid70",
    label: "70% braid",
    sub: "flexible, visible apertures",
    image: "/cable-renders/rf-shield-braid70.png",
    accent: "#fbbf24",
    coverage: 70,
    foilOverlap: 0,
    seamGap: 0.62,
    transfer: 42,
    bond: 66,
    hasFoil: false,
    stackBonus: 5,
    layerNote: "Single braid gives a drain path, but aperture leakage rises with frequency.",
    fix: "Increase braid picks or add foil under the braid for high-frequency isolation.",
  },
  {
    id: "braid95",
    label: "95% braid",
    sub: "dense single braid",
    image: "/cable-renders/rf-shield-braid95.png",
    accent: "#5eead4",
    coverage: 95,
    foilOverlap: 0,
    seamGap: 0.22,
    transfer: 15,
    bond: 82,
    hasFoil: false,
    stackBonus: 9,
    layerNote: "Dense braid closes most optical apertures while staying flexible.",
    fix: "Control braid coverage, carrier tension, and 360-degree shell contact.",
  },
  {
    id: "foilGap",
    label: "Foil seam gap",
    sub: "continuous layer with one leak",
    image: "/cable-renders/rf-shield-foil-gap.png",
    accent: "#fb923c",
    coverage: 100,
    foilOverlap: 12,
    seamGap: 0.45,
    transfer: 24,
    bond: 70,
    hasFoil: true,
    stackBonus: 11,
    layerNote: "Foil is strong at high frequency, but one seam gap becomes a slot antenna.",
    fix: "Raise overlap, add adhesive foil control, and inspect seam wander after bending.",
  },
  {
    id: "foilBraid",
    label: "Foil + braid",
    sub: "barrier plus low-Z drain",
    image: "/cable-renders/rf-shield-foil-braid.png",
    accent: "#38bdf8",
    coverage: 88,
    foilOverlap: 35,
    seamGap: 0.06,
    transfer: 7,
    bond: 88,
    hasFoil: true,
    stackBonus: 17,
    layerNote: "Foil blocks high-frequency fields; braid carries current and makes termination practical.",
    fix: "Keep foil overlap stable and terminate braid to the connector shell all around.",
  },
  {
    id: "quad",
    label: "Quad shield",
    sub: "foil + braid + foil + braid",
    image: "/cable-renders/rf-shield-quad.png",
    accent: "#a78bfa",
    coverage: 94,
    foilOverlap: 50,
    seamGap: 0.02,
    transfer: 2.5,
    bond: 94,
    hasFoil: true,
    stackBonus: 30,
    layerNote: "Alternating foil and braid layers reduce both slot leakage and shield transfer impedance.",
    fix: "The connector backshell is now the likely weak point; verify bond resistance and pigtail length.",
  },
];

const RF_SHIELD_FREQ_PRESETS = [
  { id: "vhf", label: "150 MHz", value: 150 },
  { id: "cell", label: "900 MHz", value: 900 },
  { id: "wifi", label: "2.4 GHz", value: 2400 },
  { id: "mid", label: "6 GHz", value: 6000 },
  { id: "ku", label: "18 GHz", value: 18000 },
];

function computeShieldingEffectiveness({ preset, freqMHz, coveragePct, foilOverlapPct, seamGapMm, transferMilliOhm, bondPct }) {
  const ghz = freqMHz / 1000;
  if (!preset.hasFoil && coveragePct < 1) {
    const openField = rfLaunchClamp(5.5 - Math.log10(freqMHz + 10) * 0.9 - seamGapMm * 1.8 - (100 - bondPct) * 0.015, 0.5, 8);
    return {
      seDb: openField,
      coupledDbuv: 100 - openField,
      fieldLeakPct: Math.pow(10, -openField / 20) * 100,
      powerLeakPpm: Math.pow(10, -openField / 10) * 1000000,
      grade: "OPEN LEAK",
      gradeColor: "#fb7185",
      dominant: "missing shield barrier",
      penalties: {
        aperture: 100,
        seam: 100,
        transfer: 100,
        bond: rfLaunchClamp(100 - bondPct, 0, 100),
      },
    };
  }

  const openArea = Math.max(0.012, 1 - coveragePct / 100);
  const braidTerm = coveragePct > 0 ? 10 + 21 * Math.log10(1 / openArea) : 0;
  const foilTerm = preset.hasFoil ? 34 + Math.min(22, foilOverlapPct * 0.46) : 0;
  const seamPenalty = seamGapMm * (14 + 7 * Math.log10(freqMHz / 100 + 1));
  const transferPenalty = 8.5 * Math.log10(transferMilliOhm + 1);
  const bondPenalty = (100 - bondPct) * 0.22;
  const freqPenalty = (preset.hasFoil ? 2.8 : 8.2) * Math.log10(ghz + 1);
  const rawSe = braidTerm + foilTerm + preset.stackBonus - seamPenalty - transferPenalty - bondPenalty - freqPenalty;
  const seDb = rfLaunchClamp(rawSe, 4, 128);
  const fieldLeakPct = Math.pow(10, -seDb / 20) * 100;
  const powerLeakPpm = Math.pow(10, -seDb / 10) * 1000000;
  const grade = seDb >= 92 ? "EXCELLENT" : seDb >= 72 ? "PRODUCTION" : seDb >= 48 ? "REVIEW" : "LEAK RISK";
  const gradeColor = seDb >= 92 ? "#a78bfa" : seDb >= 72 ? "#5eead4" : seDb >= 48 ? "#fbbf24" : "#fb7185";
  const penaltyRows = [
    { label: "open shield aperture", value: Math.max(0, 96 - coveragePct) * (preset.hasFoil ? 0.35 : 1.05) },
    { label: "foil seam gap", value: preset.hasFoil ? seamGapMm * 90 : seamGapMm * 28 },
    { label: "shield transfer impedance", value: transferMilliOhm * 0.65 },
    { label: "connector bond", value: (100 - bondPct) * 0.9 },
  ];
  const dominant = penaltyRows.sort((a, b) => b.value - a.value)[0].label;

  return {
    seDb,
    coupledDbuv: 100 - seDb,
    fieldLeakPct,
    powerLeakPpm,
    grade,
    gradeColor,
    dominant,
    penalties: {
      aperture: rfLaunchClamp(100 - coveragePct, 0, 100),
      seam: rfLaunchClamp((seamGapMm / 1.2) * 100, 0, 100),
      transfer: rfLaunchClamp((transferMilliOhm / 180) * 100, 0, 100),
      bond: rfLaunchClamp(100 - bondPct, 0, 100),
    },
  };
}

function makeShieldingTrace({ preset, coveragePct, foilOverlapPct, seamGapMm, transferMilliOhm, bondPct }) {
  return Array.from({ length: 130 }, (_, index) => {
    const freqMHz = 50 + (index / 129) * 17950;
    const result = computeShieldingEffectiveness({ preset, freqMHz, coveragePct, foilOverlapPct, seamGapMm, transferMilliOhm, bondPct });
    return {
      frequency: Number((freqMHz / 1000).toFixed(2)),
      se: Number(result.seDb.toFixed(1)),
      coupled: Number(result.coupledDbuv.toFixed(1)),
    };
  });
}

function ShieldingEffectivenessLab() {
  const [presetId, setPresetId] = useState("foilBraid");
  const activePreset = RF_SHIELD_PRESETS.find((preset) => preset.id === presetId) || RF_SHIELD_PRESETS[4];
  const [freqMHz, setFreqMHz] = useState(activePreset.id === "foilBraid" ? 2400 : 900);
  const [coveragePct, setCoveragePct] = useState(activePreset.coverage);
  const [foilOverlapPct, setFoilOverlapPct] = useState(activePreset.foilOverlap);
  const [seamGapMm, setSeamGapMm] = useState(activePreset.seamGap);
  const [transferMilliOhm, setTransferMilliOhm] = useState(activePreset.transfer);
  const [bondPct, setBondPct] = useState(activePreset.bond);

  const result = useMemo(
    () => computeShieldingEffectiveness({ preset: activePreset, freqMHz, coveragePct, foilOverlapPct, seamGapMm, transferMilliOhm, bondPct }),
    [activePreset, freqMHz, coveragePct, foilOverlapPct, seamGapMm, transferMilliOhm, bondPct],
  );
  const trace = useMemo(
    () => makeShieldingTrace({ preset: activePreset, coveragePct, foilOverlapPct, seamGapMm, transferMilliOhm, bondPct }),
    [activePreset, coveragePct, foilOverlapPct, seamGapMm, transferMilliOhm, bondPct],
  );

  const applyPreset = (preset) => {
    setPresetId(preset.id);
    setCoveragePct(preset.coverage);
    setFoilOverlapPct(preset.foilOverlap);
    setSeamGapMm(preset.seamGap);
    setTransferMilliOhm(preset.transfer);
    setBondPct(preset.bond);
    if (preset.id === "quad") setFreqMHz(6000);
    else if (preset.id === "none") setFreqMHz(900);
    else setFreqMHz(2400);
  };

  const leakLabel = result.fieldLeakPct < 0.001 ? `${result.powerLeakPpm.toExponential(1)} ppm power` : `${result.fieldLeakPct.toFixed(3)}% field`;

  return (
    <div style={S.viewInner} data-testid="shielding-effectiveness-lab">
      <div style={{ ...S.viewIntro, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 16, alignItems: "center" }}>
        <div style={{ width: 48, height: 48, border: "1px solid #324047", borderRadius: 4, display: "grid", placeItems: "center", color: "#22d3ee" }}>
          <ShieldCheck size={23} />
        </div>
        <div>
          <div style={{ ...RF_FAILURE_UI.eyebrow, color: "#22d3ee" }}>Shielding Effectiveness Lab</div>
          <div style={{ ...S.viewIntroStrong, marginTop: 6 }}>Shield stack {"->"} leakage dB</div>
          <div style={{ color: "#cbd5e1", lineHeight: 1.7, maxWidth: 930 }}>
            Compare braid coverage, foil overlap, seam gaps, transfer impedance, and connector shell bonding with a Blender RF cutaway and a live shielding-effectiveness trace.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 18, marginTop: 22, alignItems: "stretch" }}>
        <section style={{ ...RF_FAILURE_UI.panel, overflow: "hidden", minWidth: 0 }}>
          <div style={{ position: "relative", height: "clamp(390px, 34vw, 560px)", background: "radial-gradient(circle at 24% 18%, #142327, #050808 62%)" }}>
            <style>{`
              @media (prefers-reduced-motion: reduce) {
                .shielding-explainer-video { display: none; }
                .shielding-explainer-poster { opacity: 1 !important; }
              }
            `}</style>
            <div
              className="shielding-explainer-poster"
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: "url(/shielding/rf-shielding-explainer-poster.jpg)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                opacity: 0,
              }}
            />
            <video
              className="shielding-explainer-video"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster="/shielding/rf-shielding-explainer-poster.jpg"
              aria-label={`${activePreset.label} RF shielding effectiveness explainer`}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: 0.96 }}
            >
              <source src="/shielding/rf-shielding-explainer-veo31.webm" type="video/webm" />
              <source src="/shielding/rf-shielding-explainer-veo31.mp4" type="video/mp4" />
            </video>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.48))" }} />
            <div style={{ position: "absolute", top: 16, left: 16, ...RF_FAILURE_UI.eyebrow, color: "#5eead4" }}>RF shielding explainer</div>
            <div style={{ position: "absolute", right: 16, top: 16, padding: "9px 11px", border: `1px solid ${result.gradeColor}`, borderRadius: 4, background: "rgba(5,9,11,0.78)", color: result.gradeColor, fontFamily: '"JetBrains Mono", monospace', fontWeight: 900, fontSize: 12 }}>
              {result.grade}
            </div>
            <ShieldingFieldBadge left="8%" top="24%" color="#fbbf24" label="incident EMI" value={`${freqMHz >= 1000 ? `${(freqMHz / 1000).toFixed(1)} GHz` : `${freqMHz.toFixed(0)} MHz`}`} />
            <ShieldingFieldBadge left="73%" top="54%" color={result.gradeColor} label="coupled field" value={`${result.coupledDbuv.toFixed(1)} dBuV/m`} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, padding: 12 }}>
            <RfFailureChip label="Stack" value={activePreset.label} accent={activePreset.accent} />
            <RfFailureChip label="Dominant leak" value={result.dominant} accent="#67e8f9" />
            <RfFailureChip label="Leakage" value={leakLabel} accent="#fbbf24" />
          </div>
        </section>

        <aside style={{ ...RF_FAILURE_UI.panel, padding: 18, minWidth: 0 }}>
          <div style={RF_FAILURE_UI.eyebrow}>Shield Stack Director</div>
          <p style={{ color: "#cbd5e1", lineHeight: 1.6, margin: "8px 0 16px" }}>
            Pick a construction, then tune the factory variables that usually decide real shielding performance.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {RF_SHIELD_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.id}
                onClick={() => applyPreset(preset)}
                style={{
                  textAlign: "left",
                  border: presetId === preset.id ? `1px solid ${preset.accent}` : "1px solid #243139",
                  background: presetId === preset.id ? `${preset.accent}17` : "#070c0e",
                  color: "#f8fafc",
                  borderRadius: 4,
                  padding: "12px 13px",
                  cursor: "pointer",
                  minHeight: 70,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 900 }}>
                  <span>{preset.label}</span>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: preset.accent }} />
                </div>
                <div style={{ marginTop: 6, color: "#7b8990", fontSize: 12 }}>{preset.sub}</div>
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginTop: 18 }}>
            {RF_SHIELD_FREQ_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.id}
                onClick={() => setFreqMHz(preset.value)}
                style={{
                  border: Math.abs(freqMHz - preset.value) < 1 ? "1px solid #cbd5e1" : "1px solid #26343a",
                  background: Math.abs(freqMHz - preset.value) < 1 ? "#1b2227" : "#070c0e",
                  color: "#dbeafe",
                  borderRadius: 4,
                  padding: "10px 6px",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 10,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            <ShieldingSlider label="Frequency" value={freqMHz} setValue={setFreqMHz} min={50} max={18000} step={50} unit="MHz" accent="#22d3ee" formatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(2)} GHz` : `${value.toFixed(0)} MHz`} />
            <ShieldingSlider label="Shield coverage" value={coveragePct} setValue={setCoveragePct} min={0} max={98} step={1} unit="%" accent="#fbbf24" />
            <ShieldingSlider label="Foil overlap" value={foilOverlapPct} setValue={setFoilOverlapPct} min={0} max={75} step={1} unit="%" accent="#5eead4" />
            <ShieldingSlider label="Foil seam gap" value={seamGapMm} setValue={setSeamGapMm} min={0} max={1.2} step={0.02} unit="mm" accent="#fb923c" formatter={(value) => `${value.toFixed(2)} mm`} />
            <ShieldingSlider label="Transfer impedance" value={transferMilliOhm} setValue={setTransferMilliOhm} min={1} max={180} step={1} unit="mOhm/m" accent="#a78bfa" />
            <ShieldingSlider label="Connector shell bond" value={bondPct} setValue={setBondPct} min={20} max={100} step={1} unit="%" accent="#67e8f9" />
          </div>
        </aside>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginTop: 18 }}>
        <RfFailureMetric label="Shielding effectiveness" value={`${result.seDb.toFixed(1)} dB`} sub="field attenuation" accent={result.gradeColor} />
        <RfFailureMetric label="Coupled field" value={`${result.coupledDbuv.toFixed(1)} dBuV/m`} sub="100 dBuV/m incident" accent="#fbbf24" />
        <RfFailureMetric label="Field leakage" value={result.fieldLeakPct < 0.001 ? "<0.001%" : `${result.fieldLeakPct.toFixed(3)}%`} sub={`${result.powerLeakPpm.toExponential(1)} ppm power`} accent="#67e8f9" />
        <RfFailureMetric label="Weakest contributor" value={result.dominant} sub={activePreset.fix} accent="#cbd5e1" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 18, marginTop: 18 }}>
        <section style={{ ...RF_FAILURE_UI.panel, padding: 16, minWidth: 0 }}>
          <RfFailureChartHeader label="Shielding effectiveness vs frequency" value="50 MHz-18 GHz" />
          <div style={{ height: 285 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trace} margin={{ top: 12, right: 12, bottom: 4, left: -8 }}>
                <CartesianGrid stroke="#1d2a30" strokeDasharray="4 4" />
                <XAxis dataKey="frequency" type="number" domain={[0, 18]} tick={{ fill: "#718088", fontSize: 11 }} unit="GHz" />
                <YAxis domain={[0, 125]} tick={{ fill: "#718088", fontSize: 11 }} unit="dB" />
                <Tooltip
                  contentStyle={{ background: "#081013", border: "1px solid #26343a", borderRadius: 4, color: "#e2e8f0" }}
                  formatter={(value, name) => [`${Number(value).toFixed(1)} ${name === "se" ? "dB" : "dBuV/m"}`, name === "se" ? "SE" : "Coupled"]}
                  labelFormatter={(value) => `${Number(value).toFixed(2)} GHz`}
                />
                <ReferenceLine y={80} stroke="#5eead4" strokeDasharray="3 3" label={{ value: "80 dB", fill: "#5eead4", fontSize: 10 }} />
                <ReferenceLine y={50} stroke="#f97316" strokeDasharray="3 3" label={{ value: "50 dB", fill: "#f97316", fontSize: 10 }} />
                <ReferenceLine x={freqMHz / 1000} stroke="#38bdf8" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="se" stroke={result.gradeColor} strokeWidth={2.6} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <ShieldingLeakageCard result={result} coveragePct={coveragePct} seamGapMm={seamGapMm} transferMilliOhm={transferMilliOhm} bondPct={bondPct} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 18 }}>
        <ShieldingConstructionCard preset={activePreset} result={result} />
        <ShieldingFactoryCard result={result} preset={activePreset} />
      </div>
    </div>
  );
}

function ShieldingSlider({ label, value, setValue, min, max, step, unit, accent, formatter }) {
  const display = formatter ? formatter(value) : `${Number(value).toFixed(step < 1 ? 2 : 0)} ${unit}`;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', color: "#cbd5e1", fontSize: 11, textTransform: "uppercase", letterSpacing: 1.8 }}>{label}</div>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', color: accent, fontSize: 12, fontWeight: 900 }}>{display}</div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
        style={{ width: "100%", marginTop: 7, accentColor: accent }}
        aria-label={label}
      />
      <div style={{ display: "flex", justifyContent: "space-between", color: "#64727a", fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}>
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

function ShieldingFieldBadge({ left, top, color, label, value }) {
  return (
    <div style={{ position: "absolute", left, top, transform: "translate(-50%, -50%)", pointerEvents: "none" }}>
      <div style={{ width: 58, height: 58, borderRadius: "50%", border: `1px solid ${color}`, boxShadow: `0 0 28px ${color}55`, display: "grid", placeItems: "center", background: "rgba(5,9,11,0.62)" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${color}99`, display: "grid", placeItems: "center" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
        </div>
      </div>
      <div style={{ marginTop: 7, padding: "6px 9px", border: `1px solid ${color}80`, background: "rgba(5,9,11,0.82)", borderRadius: 4, minWidth: 128, textAlign: "center" }}>
        <div style={{ color, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 900 }}>{label}</div>
        <div style={{ color: "#dbeafe", fontSize: 11, marginTop: 3 }}>{value}</div>
      </div>
    </div>
  );
}

function ShieldingLeakageCard({ result, coveragePct, seamGapMm, transferMilliOhm, bondPct }) {
  const rows = [
    { label: "Aperture closure", value: coveragePct, note: `${coveragePct.toFixed(0)}% optical coverage`, accent: "#fbbf24" },
    { label: "Foil seam control", value: 100 - result.penalties.seam, note: `${seamGapMm.toFixed(2)} mm gap`, accent: "#5eead4" },
    { label: "Low transfer Z", value: 100 - result.penalties.transfer, note: `${transferMilliOhm.toFixed(0)} mOhm/m`, accent: "#a78bfa" },
    { label: "360 shell bond", value: bondPct, note: `${bondPct.toFixed(0)}% connector contact`, accent: "#67e8f9" },
  ];

  return (
    <section style={{ ...RF_FAILURE_UI.panel, padding: 16, minWidth: 0 }}>
      <RfFailureChartHeader label="Leakage budget" value={result.dominant} />
      <div style={{ display: "grid", gap: 15, marginTop: 16 }}>
        {rows.map((row) => (
          <div key={row.label}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", fontFamily: '"JetBrains Mono", monospace' }}>
              <span style={{ color: "#dbeafe", fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4 }}>{row.label}</span>
              <span style={{ color: row.accent, fontSize: 11, fontWeight: 900 }}>{row.note}</span>
            </div>
            <div style={{ height: 9, borderRadius: 999, background: "#071012", border: "1px solid #1d2a30", overflow: "hidden", marginTop: 7 }}>
              <div style={{ width: `${rfLaunchClamp(row.value, 0, 100)}%`, height: "100%", background: `linear-gradient(90deg, ${row.accent}55, ${row.accent})` }} />
            </div>
          </div>
        ))}
      </div>
      <p style={{ color: "#9aa6ad", lineHeight: 1.65, margin: "16px 0 0" }}>
        Better shielding is the combination of a closed aperture, a continuous foil seam, low shield transfer impedance, and a short 360-degree connector bond.
      </p>
    </section>
  );
}

function ShieldingConstructionCard({ preset, result }) {
  const rows = [
    { label: "Layer stack", value: preset.layerNote },
    { label: "What the VNA sees", value: `${result.seDb.toFixed(1)} dB isolation at the selected frequency; ${result.dominant} is the first thing to inspect.` },
    { label: "Manufacturing move", value: preset.fix },
  ];

  return (
    <section style={{ ...RF_FAILURE_UI.panel, padding: 16 }}>
      <div style={RF_FAILURE_UI.eyebrow}>Build interpretation</div>
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {rows.map((row, index) => (
          <div key={row.label} style={{ display: "grid", gridTemplateColumns: "34px minmax(0, 1fr)", gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", border: `1px solid ${preset.accent}`, color: preset.accent, fontFamily: '"JetBrains Mono", monospace', fontWeight: 900, fontSize: 12 }}>
              {index + 1}
            </div>
            <div>
              <div style={{ color: "#e2e8f0", fontFamily: '"JetBrains Mono", monospace', fontWeight: 900, fontSize: 12 }}>{row.label}</div>
              <div style={{ color: "#9aa6ad", lineHeight: 1.6, marginTop: 3 }}>{row.value}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShieldingFactoryCard({ result, preset }) {
  const checks = [
    result.seDb < 48 ? "Treat this as a containment failure before optimizing impedance." : "Shielding is usable; confirm it survives bend and connector assembly.",
    !preset.hasFoil && preset.coverage < 1 ? "Choose the shield architecture first: braid, foil-braid, or quad shield." : result.dominant === "foil seam gap" ? "Add seam-overlap inspection after tape/foil wrapping." : "Inspect braid picks, carrier tension, and OD after braiding.",
    result.dominant === "connector bond" ? "Shorten pigtails and prefer a full-circumference clamp or ferrule." : "Terminate every conductive layer intentionally at the connector.",
  ];

  return (
    <section style={{ ...RF_FAILURE_UI.panel, padding: 16 }}>
      <div style={RF_FAILURE_UI.eyebrow}>QC checklist</div>
      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {checks.map((check, index) => (
          <div key={check} style={{ display: "grid", gridTemplateColumns: "24px minmax(0, 1fr)", gap: 10, color: "#cbd5e1", lineHeight: 1.55 }}>
            <span style={{ color: index === 0 ? result.gradeColor : preset.accent, fontFamily: '"JetBrains Mono", monospace', fontWeight: 900 }}>{String(index + 1).padStart(2, "0")}</span>
            <span>{check}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const RF_EMI_SCAN_CASES = [
  {
    id: "clean",
    label: "Clean shield",
    sub: "low baseline",
    image: "/cable-renders/rf-scanner-clean.png",
    accent: "#5eead4",
    defectM: 1.4,
    widthM: 0.62,
    basePeak: 38,
    floor: 25,
    centerGHz: 1.2,
    probe: "H",
    signature: "smooth low-level scan",
    root: "no obvious leakage source",
    fix: "Use this trace as the golden baseline before comparing production samples.",
  },
  {
    id: "foil-seam",
    label: "Foil seam leak",
    sub: "slot-like aperture",
    image: "/cable-renders/rf-scanner-foil-seam.png",
    accent: "#fb923c",
    defectM: 2.25,
    widthM: 0.28,
    basePeak: 70,
    floor: 30,
    centerGHz: 2.4,
    probe: "E",
    signature: "sharp E-field spike",
    root: "foil overlap opened into a slot",
    fix: "Increase foil overlap, stabilize tape tension, and inspect seam wander after bend testing.",
  },
  {
    id: "braid-window",
    label: "Braid window",
    sub: "coverage dropout",
    image: "/cable-renders/rf-scanner-braid-window.png",
    accent: "#fbbf24",
    defectM: 3.18,
    widthM: 0.48,
    basePeak: 63,
    floor: 29,
    centerGHz: 1.8,
    probe: "H",
    signature: "wide magnetic-field hill",
    root: "braid pick density or carrier tension changed",
    fix: "Check braid angle, carrier tension, pick count, and OD compression through the braid zone.",
  },
  {
    id: "pigtail",
    label: "Ground pigtail",
    sub: "common-mode radiator",
    image: "/cable-renders/rf-scanner-pigtail.png",
    accent: "#38bdf8",
    defectM: 4.45,
    widthM: 0.55,
    basePeak: 73,
    floor: 31,
    centerGHz: 0.45,
    probe: "H",
    signature: "low-frequency current plume",
    root: "shield current forced through a long lead",
    fix: "Replace the pigtail with a 360-degree clamp, short ferrule bond, or conductive backshell.",
  },
  {
    id: "connector-bond",
    label: "Connector bond gap",
    sub: "backshell discontinuity",
    image: "/cable-renders/rf-scanner-connector-bond.png",
    accent: "#f472b6",
    defectM: 6.18,
    widthM: 0.36,
    basePeak: 80,
    floor: 33,
    centerGHz: 3.2,
    probe: "E",
    signature: "hotspot at connector shell",
    root: "poor 360-degree shield termination",
    fix: "Verify shell bite, ferrule crimp height, plating contact, and backshell torque.",
  },
];

const RF_EMI_FREQ_PRESETS = [
  { id: "vhf", label: "150 MHz", value: 150 },
  { id: "uhf", label: "450 MHz", value: 450 },
  { id: "cell", label: "900 MHz", value: 900 },
  { id: "wifi", label: "2.4 GHz", value: 2400 },
  { id: "ism", label: "5.8 GHz", value: 5800 },
];

function computeNearFieldScan({ scenario, driveDbm, scanHeightMm, freqMHz, probeKind, thresholdDbuv }) {
  const freqGHz = freqMHz / 1000;
  const heightPenalty = 20 * Math.log10(Math.max(scanHeightMm, 1) / 5);
  const driveGain = (driveDbm - 10) * 0.82;
  const centerBonus = 10 * rfFailureGaussian(freqGHz, scenario.centerGHz, Math.max(0.25, scenario.centerGHz * 0.42));
  const harmonicBonus = 3.5 * rfFailureGaussian(freqGHz, scenario.centerGHz * 2, Math.max(0.35, scenario.centerGHz * 0.65));
  const probeBonus = probeKind === scenario.probe ? 4.5 : -4.2;
  const peak = rfLaunchClamp(scenario.basePeak + driveGain - heightPenalty + centerBonus + harmonicBonus + probeBonus, 18, 105);
  const baseline = rfLaunchClamp(scenario.floor + driveGain * 0.32 - heightPenalty * 0.42 + (probeKind === "E" ? 1.5 : 0), 12, 72);
  const margin = thresholdDbuv - peak;
  const grade = margin >= 10 ? "PASS" : margin >= 0 ? "WATCH" : "HOTSPOT";
  const gradeColor = margin >= 10 ? "#5eead4" : margin >= 0 ? "#fbbf24" : "#fb7185";
  const contrast = peak - baseline;
  const severity = rfLaunchClamp((peak - thresholdDbuv + 18) * 2.4, 0, 100);
  return {
    peak,
    baseline,
    margin,
    grade,
    gradeColor,
    contrast,
    severity,
    root: scenario.root,
    signature: probeKind === scenario.probe ? scenario.signature : `${scenario.signature}, weaker on ${probeKind}-probe`,
  };
}

function makeNearFieldScanTrace({ scenario, scan, driveDbm, scanHeightMm, probeKind }) {
  return Array.from({ length: 142 }, (_, index) => {
    const distance = (index / 141) * 7.0;
    const local = rfFailureGaussian(distance, scenario.defectM, scenario.widthM);
    const connectorEcho = scenario.id === "connector-bond" ? 8 * rfFailureGaussian(distance, 6.72, 0.22) : 0;
    const pigtailSkirt = scenario.id === "pigtail" ? 6 * rfFailureGaussian(distance, scenario.defectM + 0.55, 0.9) : 0;
    const ripple = Math.sin(distance * 4.7 + driveDbm * 0.11) * 1.2 + Math.sin(distance * 9.1 + scanHeightMm * 0.07) * 0.6;
    const probeTilt = probeKind === scenario.probe ? 0 : -3.5;
    const level = scan.baseline + (scan.peak - scan.baseline) * local + connectorEcho + pigtailSkirt + ripple + probeTilt * local;
    return {
      distance: Number(distance.toFixed(2)),
      level: Number(rfLaunchClamp(level, 10, 108).toFixed(1)),
    };
  });
}

function makeNearFieldSpectrumTrace({ scenario, scan, driveDbm, probeKind }) {
  return Array.from({ length: 138 }, (_, index) => {
    const frequency = 0.05 + (index / 137) * 5.95;
    const main = (scan.peak - scan.baseline) * 0.74 * rfFailureGaussian(frequency, scenario.centerGHz, Math.max(0.16, scenario.centerGHz * 0.20));
    const harmonic = (scan.peak - scan.baseline) * 0.28 * rfFailureGaussian(frequency, scenario.centerGHz * 2, Math.max(0.20, scenario.centerGHz * 0.26));
    const commonMode = scenario.id === "pigtail" ? 13 * Math.exp(-frequency * 0.55) : 0;
    const comb = scenario.id === "connector-bond" ? 4.5 * Math.abs(Math.sin(frequency * 3.3)) : 0;
    const mismatch = probeKind === scenario.probe ? 0 : -4.5;
    const noise = Math.sin(frequency * 5.7 + driveDbm * 0.13) * 0.9;
    return {
      frequency: Number(frequency.toFixed(2)),
      level: Number(rfLaunchClamp(scan.baseline + main + harmonic + commonMode + comb + mismatch + noise, 8, 106).toFixed(1)),
    };
  });
}

function NearFieldEmiScannerLab() {
  const [caseId, setCaseId] = useState("connector-bond");
  const activeCase = RF_EMI_SCAN_CASES.find((item) => item.id === caseId) || RF_EMI_SCAN_CASES[4];
  const [driveDbm, setDriveDbm] = useState(18);
  const [scanHeightMm, setScanHeightMm] = useState(8);
  const [freqMHz, setFreqMHz] = useState(2400);
  const [thresholdDbuv, setThresholdDbuv] = useState(62);
  const [probeKind, setProbeKind] = useState("E");

  const scan = useMemo(
    () => computeNearFieldScan({ scenario: activeCase, driveDbm, scanHeightMm, freqMHz, probeKind, thresholdDbuv }),
    [activeCase, driveDbm, scanHeightMm, freqMHz, probeKind, thresholdDbuv],
  );
  const scanTrace = useMemo(
    () => makeNearFieldScanTrace({ scenario: activeCase, scan, driveDbm, scanHeightMm, probeKind }),
    [activeCase, scan, driveDbm, scanHeightMm, probeKind],
  );
  const spectrumTrace = useMemo(
    () => makeNearFieldSpectrumTrace({ scenario: activeCase, scan, driveDbm, probeKind }),
    [activeCase, scan, driveDbm, probeKind],
  );

  const applyCase = (item) => {
    setCaseId(item.id);
    setFreqMHz(Math.round(item.centerGHz * 1000));
    setProbeKind(item.probe);
    if (item.id === "clean") {
      setDriveDbm(14);
      setThresholdDbuv(58);
    } else {
      setDriveDbm(18);
      setThresholdDbuv(62);
    }
  };

  return (
    <div style={S.viewInner} data-testid="near-field-emi-scanner-lab">
      <div style={{ ...S.viewIntro, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 16, alignItems: "center" }}>
        <div style={{ width: 48, height: 48, border: "1px solid #324047", borderRadius: 4, display: "grid", placeItems: "center", color: "#f472b6" }}>
          <Radio size={23} />
        </div>
        <div>
          <div style={{ ...RF_FAILURE_UI.eyebrow, color: "#f472b6" }}>Near-field / EMI Scanner Lab</div>
          <div style={{ ...S.viewIntroStrong, marginTop: 6 }}>Probe scan {"->"} RF leakage hotspot</div>
          <div style={{ color: "#cbd5e1", lineHeight: 1.7, maxWidth: 940 }}>
            Move an E-field or H-field probe across coax faults, then connect the visible Blender hotspot to a scan trace, spectrum clue, and production fix.
          </div>
        </div>
      </div>

      <EmiScanReadPanel />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 18, marginTop: 22, alignItems: "stretch" }}>
        <section style={{ ...RF_FAILURE_UI.panel, overflow: "hidden", minWidth: 0 }}>
          <div style={{ position: "relative", height: "clamp(390px, 34vw, 560px)", background: "radial-gradient(circle at 50% 18%, #14191c, #050708 68%)" }}>
            <img
              src={activeCase.image}
              alt={`${activeCase.label} near-field EMI scanner Blender render`}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", opacity: 0.98 }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.03), rgba(0,0,0,0.45))" }} />
            <div style={{ position: "absolute", top: 16, left: 16, ...RF_FAILURE_UI.eyebrow, color: "#5eead4" }}>Blender scanner scene</div>
            <div style={{ position: "absolute", right: 16, top: 16, padding: "9px 11px", border: `1px solid ${scan.gradeColor}`, borderRadius: 4, background: "rgba(5,9,11,0.80)", color: scan.gradeColor, fontFamily: '"JetBrains Mono", monospace', fontWeight: 900, fontSize: 12 }}>
              {scan.grade}
            </div>
            <EmiScanBadge left="16%" top="78%" color="#67e8f9" label="scan height" value={`${scanHeightMm.toFixed(0)} mm`} />
            <EmiScanBadge left="76%" top="55%" color={scan.gradeColor} label="peak field" value={`${scan.peak.toFixed(1)} dBuV/m`} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, padding: 12 }}>
            <RfFailureChip label="Scene" value={activeCase.label} accent={activeCase.accent} />
            <RfFailureChip label="Probe" value={`${probeKind}-field`} accent="#67e8f9" />
            <RfFailureChip label="Signature" value={scan.signature} accent="#fbbf24" />
          </div>
        </section>

        <aside style={{ ...RF_FAILURE_UI.panel, padding: 18, minWidth: 0 }}>
          <div style={RF_FAILURE_UI.eyebrow}>Scanner Director</div>
          <p style={{ color: "#cbd5e1", lineHeight: 1.6, margin: "8px 0 16px" }}>
            Pick a physical leakage source, then tune probe type, height, drive level, and the pass threshold.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {RF_EMI_SCAN_CASES.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => applyCase(item)}
                style={{
                  textAlign: "left",
                  border: caseId === item.id ? `1px solid ${item.accent}` : "1px solid #243139",
                  background: caseId === item.id ? `${item.accent}17` : "#070c0e",
                  color: "#f8fafc",
                  borderRadius: 4,
                  padding: "12px 13px",
                  cursor: "pointer",
                  minHeight: 70,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 900 }}>
                  <span>{item.label}</span>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.accent }} />
                </div>
                <div style={{ marginTop: 6, color: "#7b8990", fontSize: 12 }}>{item.sub}</div>
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginTop: 18 }}>
            {RF_EMI_FREQ_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.id}
                onClick={() => setFreqMHz(preset.value)}
                style={{
                  border: Math.abs(freqMHz - preset.value) < 1 ? "1px solid #cbd5e1" : "1px solid #26343a",
                  background: Math.abs(freqMHz - preset.value) < 1 ? "#1b2227" : "#070c0e",
                  color: "#dbeafe",
                  borderRadius: 4,
                  padding: "10px 6px",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 10,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
            {["E", "H"].map((kind) => (
              <button
                type="button"
                key={kind}
                onClick={() => setProbeKind(kind)}
                style={{
                  border: probeKind === kind ? `1px solid ${activeCase.accent}` : "1px solid #26343a",
                  background: probeKind === kind ? `${activeCase.accent}16` : "#070c0e",
                  color: probeKind === kind ? activeCase.accent : "#dbeafe",
                  borderRadius: 4,
                  padding: "10px 8px",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 11,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                {kind}-field probe
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            <EmiScanSlider label="Frequency" value={freqMHz} setValue={setFreqMHz} min={50} max={6000} step={50} unit="MHz" accent="#f472b6" formatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(2)} GHz` : `${value.toFixed(0)} MHz`} />
            <EmiScanSlider label="Drive level" value={driveDbm} setValue={setDriveDbm} min={0} max={30} step={1} unit="dBm" accent="#fbbf24" />
            <EmiScanSlider label="Probe height" value={scanHeightMm} setValue={setScanHeightMm} min={2} max={40} step={1} unit="mm" accent="#67e8f9" />
            <EmiScanSlider label="Fail threshold" value={thresholdDbuv} setValue={setThresholdDbuv} min={42} max={85} step={1} unit="dBuV/m" accent="#fb7185" />
          </div>
        </aside>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginTop: 18 }}>
        <RfFailureMetric label="Peak field" value={`${scan.peak.toFixed(1)} dBuV/m`} sub={`${scan.margin >= 0 ? "+" : ""}${scan.margin.toFixed(1)} dB margin`} accent={scan.gradeColor} />
        <RfFailureMetric label="Hotspot location" value={`${activeCase.defectM.toFixed(2)} m`} sub={activeCase.signature} accent={activeCase.accent} />
        <RfFailureMetric label="Contrast" value={`${scan.contrast.toFixed(1)} dB`} sub="peak above local floor" accent="#67e8f9" />
        <RfFailureMetric label="Likely root cause" value={activeCase.root} sub={activeCase.fix} accent="#cbd5e1" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 18, marginTop: 18 }}>
        <section style={{ ...RF_FAILURE_UI.panel, padding: 16, minWidth: 0 }}>
          <RfFailureChartHeader label="Probe scan trace" value="0-7 m cable sweep" />
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scanTrace} margin={{ top: 12, right: 12, bottom: 4, left: -8 }}>
                <CartesianGrid stroke="#1d2a30" strokeDasharray="4 4" />
                <XAxis dataKey="distance" type="number" domain={[0, 7]} tick={{ fill: "#718088", fontSize: 11 }} unit="m" />
                <YAxis domain={[10, 105]} tick={{ fill: "#718088", fontSize: 11 }} unit="dB" />
                <Tooltip
                  contentStyle={{ background: "#081013", border: "1px solid #26343a", borderRadius: 4, color: "#e2e8f0" }}
                  formatter={(value) => [`${Number(value).toFixed(1)} dBuV/m`, "Probe"]}
                  labelFormatter={(value) => `${Number(value).toFixed(2)} m`}
                />
                <ReferenceLine y={thresholdDbuv} stroke="#fb7185" strokeDasharray="3 3" label={{ value: "limit", fill: "#fb7185", fontSize: 10 }} />
                <ReferenceLine x={activeCase.defectM} stroke={activeCase.accent} strokeDasharray="5 5" />
                <Line type="monotone" dataKey="level" stroke={scan.gradeColor} strokeWidth={2.6} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section style={{ ...RF_FAILURE_UI.panel, padding: 16, minWidth: 0 }}>
          <RfFailureChartHeader label="Spectrum clue" value="near-field pickup" />
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={spectrumTrace} margin={{ top: 12, right: 12, bottom: 4, left: -8 }}>
                <CartesianGrid stroke="#1d2a30" strokeDasharray="4 4" />
                <XAxis dataKey="frequency" type="number" domain={[0, 6]} tick={{ fill: "#718088", fontSize: 11 }} unit="GHz" />
                <YAxis domain={[10, 105]} tick={{ fill: "#718088", fontSize: 11 }} unit="dB" />
                <Tooltip
                  contentStyle={{ background: "#081013", border: "1px solid #26343a", borderRadius: 4, color: "#e2e8f0" }}
                  formatter={(value) => [`${Number(value).toFixed(1)} dBuV/m`, "Pickup"]}
                  labelFormatter={(value) => `${Number(value).toFixed(2)} GHz`}
                />
                <ReferenceLine x={freqMHz / 1000} stroke="#f472b6" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="level" stroke={activeCase.accent} strokeWidth={2.6} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 18 }}>
        <EmiScanHeatMap scenario={activeCase} scan={scan} />
        <EmiScanPlaybook scenario={activeCase} scan={scan} probeKind={probeKind} />
      </div>
    </div>
  );
}

function EmiScanSlider({ label, value, setValue, min, max, step, unit, accent, formatter }) {
  const display = formatter ? formatter(value) : `${Number(value).toFixed(0)} ${unit}`;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', color: "#cbd5e1", fontSize: 11, textTransform: "uppercase", letterSpacing: 1.8 }}>{label}</div>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', color: accent, fontSize: 12, fontWeight: 900 }}>{display}</div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
        style={{ width: "100%", marginTop: 7, accentColor: accent }}
        aria-label={label}
      />
      <div style={{ display: "flex", justifyContent: "space-between", color: "#64727a", fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}>
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

function EmiScanReadPanel() {
  const steps = [
    { id: "01", label: "Pick the source", value: "Choose clean, foil seam, braid window, pigtail, or connector bond to set the physical leak." },
    { id: "02", label: "Match the probe", value: "E-field is best for slot/connector gaps. H-field is best for braid current and pigtails." },
    { id: "03", label: "Read the peak", value: "If Peak field is above the threshold, the scan trace marks where production should inspect first." },
  ];

  return (
    <section style={{ ...RF_FAILURE_UI.panel, padding: 14, marginTop: 16, borderColor: "#3b2a36", background: "linear-gradient(135deg, rgba(244,114,182,0.08), rgba(8,16,19,0.92))" }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 12, alignItems: "center" }}>
        <div style={{ width: 34, height: 34, borderRadius: 4, border: "1px solid #f472b6", color: "#f472b6", display: "grid", placeItems: "center" }}>
          <Radio size={17} />
        </div>
        <div>
          <div style={{ ...RF_FAILURE_UI.eyebrow, color: "#f472b6" }}>Reading the Scan</div>
          <div style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.55, marginTop: 3 }}>
            This lab is a virtual near-field probe sweep: it finds where shield energy is escaping.
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 12 }}>
        {steps.map((step) => (
          <div key={step.id} style={{ border: "1px solid #26343a", background: "rgba(5,9,11,0.72)", borderRadius: 4, padding: "11px 12px", minHeight: 86 }}>
            <div style={{ display: "flex", gap: 9, alignItems: "center", color: "#f8fafc", fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.2 }}>
              <span style={{ color: "#f472b6" }}>{step.id}</span>
              <span>{step.label}</span>
            </div>
            <div style={{ color: "#9aa6ad", lineHeight: 1.55, marginTop: 6, fontSize: 12 }}>{step.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmiScanBadge({ left, top, color, label, value }) {
  return (
    <div style={{ position: "absolute", left, top, transform: "translate(-50%, -50%)", pointerEvents: "none" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", border: `1px solid ${color}`, boxShadow: `0 0 28px ${color}55`, display: "grid", placeItems: "center", background: "rgba(5,9,11,0.68)" }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      </div>
      <div style={{ marginTop: 7, padding: "6px 9px", border: `1px solid ${color}80`, background: "rgba(5,9,11,0.82)", borderRadius: 4, minWidth: 120, textAlign: "center" }}>
        <div style={{ color, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 900 }}>{label}</div>
        <div style={{ color: "#dbeafe", fontSize: 11, marginTop: 3 }}>{value}</div>
      </div>
    </div>
  );
}

function EmiScanHeatMap({ scenario, scan }) {
  const columns = 30;
  const rows = 5;
  const cells = Array.from({ length: columns * rows }, (_, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const distance = (col / (columns - 1)) * 7;
    const cross = Math.abs(row - 2) / 2;
    const local = rfFailureGaussian(distance, scenario.defectM, scenario.widthM * 1.15) * (1 - cross * 0.42);
    const base = scenario.id === "clean" ? 0.10 : 0.16;
    const intensity = rfLaunchClamp(base + local * (scan.severity / 100), 0.04, 1);
    return { index, intensity };
  });

  return (
    <section style={{ ...RF_FAILURE_UI.panel, padding: 16, minWidth: 0 }}>
      <RfFailureChartHeader label="Hotspot map" value={`${scenario.defectM.toFixed(2)} m focus`} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(4px, 1fr))`, gap: 3, marginTop: 16 }}>
        {cells.map((cell) => (
          <div
            key={cell.index}
            style={{
              aspectRatio: "1 / 1",
              borderRadius: 2,
              background: `rgba(${scenario.accent === "#f472b6" ? "244,114,182" : scenario.accent === "#fb923c" ? "251,146,60" : scenario.accent === "#fbbf24" ? "251,191,36" : scenario.accent === "#38bdf8" ? "56,189,248" : "94,234,212"}, ${0.12 + cell.intensity * 0.75})`,
              boxShadow: cell.intensity > 0.72 ? `0 0 14px ${scenario.accent}` : "none",
            }}
          />
        ))}
      </div>
      <p style={{ color: "#9aa6ad", lineHeight: 1.65, margin: "16px 0 0" }}>
        The heat map shows the probe raster view: narrow peaks usually point to foil/connector slots, while broader hills point to braid or common-mode current.
      </p>
    </section>
  );
}

function EmiScanPlaybook({ scenario, scan, probeKind }) {
  const items = [
    { label: "Probe choice", value: probeKind === scenario.probe ? `${probeKind}-field is the right first probe for this defect.` : `Try ${scenario.probe}-field next; this defect is weaker on ${probeKind}-field.` },
    { label: "Measurement call", value: scan.margin < 0 ? `Hotspot exceeds limit by ${Math.abs(scan.margin).toFixed(1)} dB.` : `Peak is ${scan.margin.toFixed(1)} dB below the limit.` },
    { label: "Production fix", value: scenario.fix },
  ];

  return (
    <section style={{ ...RF_FAILURE_UI.panel, padding: 16 }}>
      <div style={RF_FAILURE_UI.eyebrow}>Debug playbook</div>
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {items.map((item, index) => (
          <div key={item.label} style={{ display: "grid", gridTemplateColumns: "34px minmax(0, 1fr)", gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", border: `1px solid ${index === 1 ? scan.gradeColor : scenario.accent}`, color: index === 1 ? scan.gradeColor : scenario.accent, fontFamily: '"JetBrains Mono", monospace', fontWeight: 900, fontSize: 12 }}>
              {index + 1}
            </div>
            <div>
              <div style={{ color: "#e2e8f0", fontFamily: '"JetBrains Mono", monospace', fontWeight: 900, fontSize: 12 }}>{item.label}</div>
              <div style={{ color: "#9aa6ad", lineHeight: 1.6, marginTop: 3 }}>{item.value}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AskView({ queuedPrompt, clearQueued, openInLibrary, loadIntoDesign, toggleCompare, comparedCables, setTab, setToolPreset }) {
  const { showTools, ttsEnabled, model } = useContext(SettingsContext);
  const [messages, setMessages] = useState(() => {
    try {
      const s = localStorage.getItem("rf-chat-history");
      const raw = s ? JSON.parse(s) : [];
      return sanitizeHistory(raw);
    } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [listening, setListening] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, loading]);
  useEffect(() => { if (queuedPrompt) { sendMessage(queuedPrompt); clearQueued(); } /* eslint-disable-next-line */ }, [queuedPrompt]);
  useEffect(() => {
    try { localStorage.setItem("rf-chat-history", JSON.stringify(messages)); } catch {}
  }, [messages]);
  useEffect(() => {
    if (!ttsEnabled || !window.speechSynthesis) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && Array.isArray(last.content)) {
      const text = last.content.filter(b => b.type === "text").map(b => b.text).join(" ").slice(0, 600);
      if (text) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.05; u.pitch = 1;
        window.speechSynthesis.speak(u);
      }
    }
  }, [messages, ttsEnabled]);

  const clearHistory = () => { setMessages([]); try { localStorage.removeItem("rf-chat-history"); } catch {} };

  const toggleListen = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input không hỗ trợ. Dùng Chrome / Edge / Safari."); return; }
    if (listening) { recognitionRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = "en-US"; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e) => { const t = e.results[0][0].transcript; setInput(p => p + (p ? " " : "") + t); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec; rec.start(); setListening(true);
  };

  const handleFile = (f) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { alert("Chỉ hỗ trợ file ảnh (JPG, PNG, WebP, GIF)."); return; }
    if (f.size > 5 * 1024 * 1024) { alert("Ảnh quá lớn (>5MB). Nén lại giúp."); return; }
    const reader = new FileReader();
    reader.onload = () => setPendingImage({ mediaType: f.type, data: reader.result.split(",")[1], preview: reader.result });
    reader.readAsDataURL(f);
  };

  const sendMessage = async (text) => {
    if ((!text.trim() && !pendingImage) || loading) return;
    setError(null); setInput("");
    const userContent = pendingImage ? [
      { type: "image", source: { type: "base64", media_type: pendingImage.mediaType, data: pendingImage.data } },
      { type: "text", text: text || "What cable is this? Identify material, type, likely impedance, and nearest match in the database." },
    ] : text;
    const newMessages = [...messages, { role: "user", content: userContent }];
    setMessages(newMessages);
    setPendingImage(null);
    setLoading(true);
    const freshUser = { role: "user", content: userContent };
    const callApiStream = async (messagesPayload, onBlocksUpdate) => {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 8000, system: SYSTEM_PROMPT, messages: messagesPayload, tools: TOOLS, stream: true }),
      });
      if (!res.ok) {
        let detail = "";
        try { const body = await res.json(); detail = body?.error?.message || body?.error || JSON.stringify(body); }
        catch { try { detail = await res.text(); } catch {} }
        const err = new Error(`API error ${res.status}: ${detail}`.trim());
        err.status = res.status; err.payload = messagesPayload; throw err;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const blocks = [];
      let stopReason = "end_turn";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const chunk of events) {
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const ev = JSON.parse(jsonStr);
              if (ev.type === "content_block_start") {
                const b = { ...ev.content_block };
                if (b.type === "text") b.text = "";
                else if (b.type === "tool_use") { b.input_json = ""; b.input = {}; }
                blocks[ev.index] = b;
                if (onBlocksUpdate) onBlocksUpdate(blocks.map(x => ({ ...x })));
              } else if (ev.type === "content_block_delta") {
                const b = blocks[ev.index];
                if (!b) continue;
                if (ev.delta.type === "text_delta") {
                  b.text = (b.text || "") + ev.delta.text;
                  if (onBlocksUpdate) onBlocksUpdate(blocks.map(x => ({ ...x })));
                } else if (ev.delta.type === "input_json_delta") {
                  b.input_json = (b.input_json || "") + ev.delta.partial_json;
                }
              } else if (ev.type === "content_block_stop") {
                const b = blocks[ev.index];
                if (b && b.type === "tool_use" && b.input_json) {
                  try { b.input = JSON.parse(b.input_json); } catch {}
                  delete b.input_json;
                }
              } else if (ev.type === "message_delta" && ev.delta?.stop_reason) {
                stopReason = ev.delta.stop_reason;
              }
            } catch {}
          }
        }
      }
      return { content: blocks.filter(Boolean), stop_reason: stopReason };
    };

    try {
      let api = sanitizeHistory(newMessages);
      let recoveredFromBadHistory = false;
      for (let i = 0; i < 10; i++) {
        setMessages(prev => [...prev.filter(m => !m.streaming), { role: "assistant", content: [], streaming: true }]);
        const onDelta = (currentBlocks) => {
          setMessages(prev => {
            const noStream = prev.filter(m => !m.streaming);
            return [...noStream, { role: "assistant", content: currentBlocks, streaming: true }];
          });
        };
        let data;
        try {
          data = await callApiStream(api, onDelta);
        } catch (e) {
          if (e.status === 400 && !recoveredFromBadHistory && i === 0) {
            console.warn("[chat] 400 on first turn — retrying with cleared history:", e.message, e.payload);
            recoveredFromBadHistory = true;
            api = [freshUser];
            setMessages([freshUser, { role: "assistant", content: [], streaming: true }]);
            data = await callApiStream(api, onDelta);
          } else { setMessages(prev => prev.filter(m => !m.streaming)); throw e; }
        }
        api.push({ role: "assistant", content: data.content });
        setMessages(prev => [...prev.filter(m => !m.streaming), { role: "assistant", content: data.content }]);
        if (data.stop_reason !== "tool_use") break;
        const results = data.content.filter(b => b.type === "tool_use").map(b => ({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(executeTool(b.name, b.input)) }));
        api.push({ role: "user", content: results });
        setMessages(prev => [...prev, { role: "user", content: results }]);
      }
    } catch (e) {
      console.error("[chat] request failed:", e.message, e.payload);
      setError(e.message);
    }
    finally { setLoading(false); }
  };

  const starters = [
    "Recommend a cable for 5G outdoor jumper at 3.5 GHz over 20 meters, low loss priority",
    "Compare RG-213, LMR-400, and LDF4-50A for cellular backhaul",
    "I want to design a 50Ω cable with VP above 85% — what geometry do I need?",
    "My LMR-400 measured 25 dB loss at 2.4 GHz over 10 m — is this normal? What could be wrong?",
    "Build a link budget: 30 dBm TX, 15 m of LMR-400 at 2.4 GHz, 2 connectors each end, -85 dBm RX sensitivity",
    "For UT-141 at 18 GHz, which connector types should I use?",
  ];

  return (
    <div style={S.viewInner}>
      <div style={{ ...S.viewIntro, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <strong style={S.viewIntroStrong}>Ask mode.</strong> Senior RF engineer agent with 37 tools for lookup, calculation, validation, and plot synthesis.
          Replies are grounded in the database — all numerical claims come from tool calls, not memory.
        </div>
        {messages.length > 0 && (
          <button onClick={clearHistory} style={{ background: "transparent", color: "#a8a29e", border: "1px solid #57534e", padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>✕ Clear ({messages.length})</button>
        )}
      </div>

      <div style={S.chatArea} ref={scrollRef}>
        {messages.length === 0 && (
          <div>
            <div style={S.starterLabel}>Example questions:</div>
            <div style={S.starters}>
              {starters.map((p, i) => (<button key={i} onClick={() => sendMessage(p)} className="hover-card" style={S.starter}>{p}</button>))}
            </div>
          </div>
        )}
        {messages.map((m, i) => <ChatMessage key={i} message={m} messageIndex={i} allMessages={messages} showTools={showTools} openInLibrary={openInLibrary} loadIntoDesign={loadIntoDesign} toggleCompare={toggleCompare} comparedCables={comparedCables} setTab={setTab} setToolPreset={setToolPreset} />)}
        {loading && (
          <div style={S.loadingMsg}>
            <span style={{ fontSize: 11, color: "#a89d8e", letterSpacing: "0.1em" }}>Thinking</span>
            <span className="dots" style={{ color: "#d97706", marginLeft: 8, fontSize: 20, letterSpacing: 3 }}><span>·</span><span>·</span><span>·</span></span>
          </div>
        )}
        {error && <div style={S.errorBox}><div style={{ color: "#fca5a5", fontSize: 11 }}>Error</div><div style={{ fontSize: 12, marginTop: 3 }}>{error}</div></div>}
      </div>

      {pendingImage && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "rgba(217,119,6,0.08)", border: "1px solid #d97706", borderRadius: 3, marginBottom: 8 }}>
          <img src={pendingImage.preview} alt="upload preview" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "#d6cfc4", marginBottom: 6 }}>Image attached. Pick an analysis mode or type a custom question below:</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => sendMessage(IDENTIFY_PROMPT)} disabled={loading} style={{ background: "rgba(217,119,6,0.18)", color: "#fbbf24", border: "1px solid #d97706", padding: "5px 10px", fontSize: 10.5, cursor: "pointer", borderRadius: 3, letterSpacing: 0.3, fontWeight: 600 }}>🔬 Identify cable</button>
              <button onClick={() => sendMessage(DIAGNOSE_PROMPT)} disabled={loading} style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5", border: "1px solid #991b1b", padding: "5px 10px", fontSize: 10.5, cursor: "pointer", borderRadius: 3, letterSpacing: 0.3, fontWeight: 600 }}>🏥 Diagnose damage</button>
              <button onClick={() => sendMessage(CONSTRUCTION_PROMPT)} disabled={loading} style={{ background: "rgba(52,211,153,0.15)", color: "#86efac", border: "1px solid #166534", padding: "5px 10px", fontSize: 10.5, cursor: "pointer", borderRadius: 3, letterSpacing: 0.3, fontWeight: 600 }}>🔎 Estimate specs</button>
            </div>
          </div>
          <button onClick={() => setPendingImage(null)} style={{ background: "none", border: "none", color: "#a8a29e", cursor: "pointer", fontSize: 16, alignSelf: "flex-start" }}>✕</button>
        </div>
      )}
      <div style={S.inputBar}>
        <input type="file" ref={fileInputRef} accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
        <button onClick={() => fileInputRef.current?.click()} disabled={loading} title="Upload image of a cable" style={{ background: "rgba(217,119,6,0.1)", color: pendingImage ? "#fbbf24" : "#a8a29e", border: "1px solid #57534e", padding: "0 10px", cursor: "pointer", fontSize: 16, borderRadius: 3, alignSelf: "stretch" }}>📎</button>
        <button onClick={toggleListen} disabled={loading} title={listening ? "Stop listening" : "Voice input"} style={{ background: listening ? "#d97706" : "rgba(217,119,6,0.1)", color: listening ? "#0a0705" : "#a8a29e", border: "1px solid #57534e", padding: "0 10px", cursor: "pointer", fontSize: 14, borderRadius: 3, alignSelf: "stretch", fontWeight: 600 }}>{listening ? "● REC" : "🎤"}</button>
        <textarea value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
          placeholder={pendingImage ? "Optional: ask a specific question about this image..." : "Ask about cable selection, design, link budgets, or troubleshooting..."}
          style={S.textarea} rows={2} disabled={loading} />
        <button onClick={() => sendMessage(input)} disabled={loading || (!input.trim() && !pendingImage)} style={S.sendBtn}>Send ↵</button>
      </div>
    </div>
  );
}

function ChatMessage({ message: m, messageIndex, allMessages, showTools, openInLibrary, loadIntoDesign, toggleCompare, comparedCables, setTab, setToolPreset }) {
  // Aggregate tool_use inputs across THIS turn (may span multiple assistant rounds
  // because the agent's tool_use blocks live in prior assistant messages, not the
  // final text-only reply).
  const msgToolInputs = useMemo(() => {
    const map = {};
    const collect = (blocks) => {
      if (!Array.isArray(blocks)) return;
      for (const b of blocks) if (b && b.type === "tool_use" && b.name) map[b.name] = b.input || {};
    };
    if (!Array.isArray(allMessages) || messageIndex == null) {
      collect(m?.content);
      return map;
    }
    // Walk backward to find the user-prompt that started this turn (tool_result user
    // messages do NOT count — they are part of the same turn).
    let turnStart = 0;
    for (let i = messageIndex - 1; i >= 0; i--) {
      const mm = allMessages[i];
      if (!mm) continue;
      if (mm.role === "user") {
        const isToolResult = Array.isArray(mm.content) && mm.content.length > 0 && mm.content.every(b => b?.type === "tool_result");
        if (!isToolResult) { turnStart = i; break; }
      }
    }
    // Walk forward from turn start through current message, collecting tool_use inputs
    for (let i = turnStart; i <= messageIndex; i++) {
      const mm = allMessages[i];
      if (mm?.role === "assistant") collect(mm.content);
    }
    return map;
  }, [allMessages, messageIndex, m]);
  const jumpToTool = (target, data) => {
    if (setToolPreset) setToolPreset({ target, data: data || {}, ts: Date.now() });
    if (setTab) setTab(target === "link" ? "link" : "tools");
  };
  if (m.role === "user") {
    if (typeof m.content === "string") return <div className="msg-anim" style={S.userMsg}><div style={S.userBubble}>{m.content}</div></div>;
    if (Array.isArray(m.content)) {
      if (m.content.every(b => b.type === "tool_result")) return null;
      return (
        <div className="msg-anim" style={S.userMsg}>
          <div style={S.userBubble}>
            {m.content.map((b, i) => {
              if (b.type === "image") return <img key={i} src={`data:${b.source.media_type};base64,${b.source.data}`} alt="upload" style={{ maxWidth: 280, maxHeight: 280, display: "block", borderRadius: 4, marginBottom: 6 }} />;
              if (b.type === "text") return <div key={i}>{b.text}</div>;
              return null;
            })}
          </div>
        </div>
      );
    }
  }
  if (typeof m.content === "string") return <div className="msg-anim" style={S.assistantMsg}><div style={S.assistantText}>{m.content}</div></div>;

  return (
    <div className="msg-anim" style={S.assistantMsg}>
      {m.content.map((block, i) => {
        if (block.type === "text") {
          const mentioned = CABLE_IDS.filter(id => block.text.toLowerCase().includes(CABLES[id].name.toLowerCase()) || block.text.toLowerCase().includes(`'${id}'`));
          const uniqueMentioned = [...new Set(mentioned)];
          const mentionedConn = CONNECTOR_IDS.filter(id => block.text.toLowerCase().includes(CONNECTORS[id].name.toLowerCase()));
          const uniqueConn = [...new Set(mentionedConn)];
          const isLastTextBlock = i === m.content.length - 1 || !m.content.slice(i + 1).some(b => b.type === "text");
          const lowerText = block.text.toLowerCase();
          const hasLinkTool = !!(msgToolInputs.analyze_link_chain || msgToolInputs.calculate_link_budget);
          const hasNFTool = !!msgToolInputs.calculate_nf_cascade;
          const hasIP3Tool = !!msgToolInputs.calculate_distortion;
          const hasPathTool = !!msgToolInputs.calculate_path_loss;
          const hasSmithTool = !!msgToolInputs.calculate_vswr;
          const hasTDRTool = !!msgToolInputs.synth_s11_sweep;
          const suggestLink = hasLinkTool || /\b(link\s+budget|chain|tx\s*→|cascade|multi[- ]?segment)\b/.test(lowerText);
          const suggestSmith = hasSmithTool || /\b(impedance|smith\s+chart|vswr|matching\s+network|reflection)\b/.test(lowerText);
          const suggestNF = hasNFTool || /\b(noise\s+figure|nf\s+cascade|friis|sensitivity\s+budget)\b/.test(lowerText);
          const suggestPath = hasPathTool || /\b(free[- ]?space|path\s+loss|fspl|fresnel|eirp)\b/.test(lowerText);
          const suggestIP3 = hasIP3Tool || /\b(ip3|oip3|iip3|p1db|intermod|distortion)\b/.test(lowerText);
          const suggestTDR = hasTDRTool || /\b(s11|s-param|s\d+p|touchstone|return\s+loss|tdr)\b/.test(lowerText);
          return (
            <div key={i}>
              <div style={S.assistantText}>{block.text}{m.streaming && isLastTextBlock && <span className="streaming-cursor" style={{ display: "inline-block", width: 8, height: 14, background: "#fbbf24", marginLeft: 2, verticalAlign: "text-bottom", animation: "blink 1s steps(2) infinite" }}></span>}</div>
              {!m.streaming && uniqueMentioned.length > 0 && uniqueMentioned.length <= 5 && (
                <div style={S.quickChipsRow}>
                  {uniqueMentioned.map(id => {
                    const isCompared = comparedCables?.includes(id);
                    return (
                      <div key={id} style={S.quickChipGroup}>
                        <span style={S.quickChipName}>{CABLES[id].name}:</span>
                        <button onClick={() => openInLibrary(id)} style={S.quickChip}>📖 View</button>
                        <button onClick={() => loadIntoDesign(id)} style={S.quickChip}>✏ Design</button>
                        {toggleCompare && <button onClick={() => toggleCompare(id)} style={{ ...S.quickChip, ...(isCompared ? { background: "rgba(52,211,153,0.15)", color: "#34d399", borderColor: "#10b981" } : {}) }}>{isCompared ? "✓ In compare" : "+ Compare"}</button>}
                      </div>
                    );
                  })}
                </div>
              )}
              {!m.streaming && uniqueConn.length > 0 && uniqueConn.length <= 4 && setTab && (
                <div style={S.quickChipsRow}>
                  {uniqueConn.map(id => (
                    <div key={id} style={S.quickChipGroup}>
                      <span style={{ ...S.quickChipName, color: "#38bdf8" }}>{CONNECTORS[id].name}:</span>
                      <button onClick={() => setTab("connectors")} style={{ ...S.quickChip, color: "#38bdf8", borderColor: "#0284c7" }}>🔌 View connector</button>
                    </div>
                  ))}
                </div>
              )}
              {!m.streaming && setTab && (suggestLink || suggestSmith || suggestNF || suggestPath || suggestIP3 || suggestTDR) && (() => {
                const nfData = msgToolInputs.calculate_nf_cascade;
                const ip3Data = msgToolInputs.calculate_distortion;
                const pathData = msgToolInputs.calculate_path_loss;
                const linkData = msgToolInputs.analyze_link_chain || msgToolInputs.calculate_link_budget;
                const vswrData = msgToolInputs.calculate_vswr;
                const smithFreq = pickFreqFromInputs(msgToolInputs);
                const smithData = {};
                if (smithFreq) smithData.frequency_mhz = smithFreq;
                if (vswrData) {
                  if (vswrData.line_impedance != null) smithData.line_impedance = vswrData.line_impedance;
                  if (vswrData.load_resistance != null) smithData.load_resistance = vswrData.load_resistance;
                  if (vswrData.load_reactance != null) smithData.load_reactance = vswrData.load_reactance;
                }
                const hasSmithData = !!(smithFreq || vswrData);
                const tdrSynthInput = msgToolInputs.synth_s11_sweep;
                const tdrData = tdrSynthInput ? { s1p_text: synthesizeS11SweepText(tdrSynthInput) } : null;
                const anyFill = !!(nfData || ip3Data || pathData || linkData || hasSmithData || tdrData?.s1p_text);
                const dot = (on) => on ? <span style={{ color: "#fbbf24", marginLeft: 4 }}>•</span> : null;
                return (
                  <div style={{ ...S.quickChipsRow, marginTop: 4 }}>
                    <div style={S.quickChipGroup}>
                      <span style={{ ...S.quickChipName, color: "#a8a29e" }}>Jump to tool{anyFill ? " (• = auto-fill ready)" : ""}:</span>
                      {suggestLink && <button onClick={() => jumpToTool("link", linkData)} style={{ ...S.quickChip, color: "#fbbf24" }}>🔗 Link Budget{dot(!!linkData)}</button>}
                      {suggestSmith && <button onClick={() => jumpToTool("smith", smithData)} style={{ ...S.quickChip, color: "#c084fc", borderColor: "#7c3aed" }}>🎯 Smith Chart{dot(hasSmithData)}</button>}
                      {suggestTDR && <button onClick={() => jumpToTool("tdr", tdrData)} style={{ ...S.quickChip, color: "#fbbf24", borderColor: "#d97706" }}>📊 TDR / S-Params{dot(!!tdrData?.s1p_text)}</button>}
                      {suggestNF && <button onClick={() => jumpToTool("nf", nfData)} style={{ ...S.quickChip, color: "#34d399", borderColor: "#10b981" }}>🔊 NF Cascade{dot(!!nfData)}</button>}
                      {suggestIP3 && <button onClick={() => jumpToTool("ip3", ip3Data)} style={{ ...S.quickChip, color: "#f97316", borderColor: "#c2410c" }}>⚡ IP3 / P1dB{dot(!!ip3Data)}</button>}
                      {suggestPath && <button onClick={() => jumpToTool("path", pathData)} style={{ ...S.quickChip, color: "#60a5fa", borderColor: "#2563eb" }}>📡 Path Loss{dot(!!pathData)}</button>}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        }
        if (block.type === "tool_use" && showTools) {
          return (
            <div key={i} style={S.toolCall}>
              <span style={S.toolIcon}>⚙</span>
              <span style={S.toolName}>{block.name}</span>
              <span style={S.toolArgs}>{Object.entries(block.input).map(([k, v]) => `${k}=${typeof v === "object" ? "[…]" : v}`).join(", ")}</span>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DESIGN VIEW
// ═══════════════════════════════════════════════════════════════
function DesignView({ activeCable, clearCable, openLibrary }) {
  const { units } = useContext(SettingsContext);
  const loaded = activeCable ? CABLES[activeCable] : null;
  const [d, setD] = useState(loaded?.d ?? 0.91);
  const [D, setDdx] = useState(loaded?.D ?? 2.95);
  const [matKey, setMatKey] = useState("pe_solid");
  const [solveMode, setSolveMode] = useState(false);
  const [Ztarget, setZtarget] = useState(50);
  const [freqMHz, setFreqMHz] = useState(1000);
  const [length, setLength] = useState(10);
  const [condKey, setCondKey] = useState("cu");
  const [jacketThick, setJacketThick] = useState(0.85);
  const [shieldThick, setShieldThick] = useState(0.30);

  useEffect(() => { if (loaded) { setD(loaded.d); setDdx(loaded.D); } }, [activeCable, loaded]);

  const mat = MATERIALS[matKey];
  const er = mat.er;
  const cond = CONDUCTORS[condKey];

  const D_solved = solveMode ? d * Math.pow(10, Ztarget * Math.sqrt(er) / 138) : null;
  const D_active = D_solved ?? D;

  const Z0 = calcImpedance(d, D_active, er);
  const VP = calcVP(er);
  const C = calcCap(D_active, d, er);
  const L = calcInd(D_active, d);
  const delay = Math.sqrt(er) / 0.2998;

  const f = freqMHz * 1e6;
  const Rs = Math.sqrt(Math.PI * f * 4 * Math.PI * 1e-7 / cond.sigma);
  const alphaC = (Rs / (2 * Z0)) * (1 / (Math.PI * d / 1000) + 1 / (Math.PI * D_active / 1000));
  const alphaD = (Math.PI * f * Math.sqrt(er) * mat.tanD) / 3e8;
  const loss_dBm = 8.686 * (alphaC + alphaD);
  const lossTotal = loss_dBm * length;

  const fc = calcCutoff(D_active, d, er);
  const Vbreak = calcBreakdown(mat.Eb, d, D_active);
  const Ppeak = (Vbreak * 1000) ** 2 / (2 * Z0) / 1000;

  const shieldOD = D_active + 2 * shieldThick;
  const jacketOD = shieldOD + 2 * jacketThick;
  const bendRadius = jacketOD * 8;
  const mass = (Math.PI * (d / 2) ** 2 * 8.96 + Math.PI * ((D_active / 2) ** 2 - (d / 2) ** 2) * 0.92 + Math.PI * ((shieldOD / 2) ** 2 - (D_active / 2) ** 2) * 8.96 * 0.9 + Math.PI * ((jacketOD / 2) ** 2 - (shieldOD / 2) ** 2) * 1.2);

  return (
    <div style={S.viewInner}>
      <div style={S.viewIntro}>
        <strong style={S.viewIntroStrong}>Design mode.</strong> Interactive geometry calculator.
        {activeCable ? ` Loaded from ${loaded.name}.` : " Enter parameters or "}
        {!activeCable && <button onClick={openLibrary} style={S.inlineLink}>load from library</button>}{!activeCable && "."}
      </div>

      <div style={S.designGrid}>
        <div style={S.sidePanel}>
          <CrossSection d={d} D={D_active} shield={shieldOD} jacket={jacketOD} units={units} />
          <div style={S.headlineGrid}>
            <Headline label="Z₀" value={`${fmt(Z0, 1)} Ω`} match={Math.abs(Z0 - 50) < 1 || Math.abs(Z0 - 75) < 1} />
            <Headline label="VP" value={`${fmt(VP, 1)} %`} />
            <Headline label={`α @ ${freqMHz}M`} value={fmtLoss(loss_dBm * 100, units === "both" ? "metric" : units, 1)} />
            <Headline label="fc" value={`${fmt(fc, 1)} GHz`} />
          </div>
        </div>

        <div style={S.mainPanel}>
          <Section title="Geometry">
            <GridInputs>
              <Field label={`Conductor d (${units === "imperial" ? "inch" : "mm"})`}>
                <UnitInput mm={d} onChange={setD} units={units} step={0.01} min={0.05} />
              </Field>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={solveMode} onChange={(e) => setSolveMode(e.target.checked)} id="solve" style={{ accentColor: "#10b981" }} />
                <label htmlFor="solve" style={{ fontSize: 11, color: "#34d399" }}>Solve mode (Z → D)</label>
              </div>
              {solveMode
                ? <Field label="Target Z₀ (Ω)"><NumInput value={Ztarget} onChange={setZtarget} step={0.5} min={10} max={200} /></Field>
                : <Field label={`Dielectric D (${units === "imperial" ? "inch" : "mm"})`}><UnitInput mm={D} onChange={setDdx} units={units} step={0.01} min={d * 1.05} /></Field>
              }
              <Field label="Dielectric material">
                <select value={matKey} onChange={(e) => setMatKey(e.target.value)} style={S.select}>
                  {Object.entries(MATERIALS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </select>
              </Field>
            </GridInputs>
            {D_solved && <div style={S.solveBox}><span style={S.solveLabel}>Required D</span><span style={S.solveVal}>{fmtLen(D_solved, units, 3)}</span></div>}
            <ResultGrid>
              <R label="Impedance Z₀" value={`${fmt(Z0, 2)} Ω`} />
              <R label="Velocity of propagation" value={`${fmt(VP, 2)} %`} />
              <R label="Capacitance" value={fmtCap(C, units, 1)} />
              <R label="Inductance" value={`${fmt(L, 1)} nH/m`} />
              <R label="Propagation delay" value={`${fmt(delay, 3)} ns/m`} />
              <R label="D/d ratio" value={fmt(D_active / d, 3)} />
            </ResultGrid>
          </Section>

          <Section title="Attenuation">
            <GridInputs>
              <Field label="Frequency (MHz)"><NumInput value={freqMHz} onChange={setFreqMHz} step={10} min={0.1} max={50000} /></Field>
              <Field label={`Length (${units === "imperial" ? "ft" : "m"})`}>
                <NumInput value={units === "imperial" ? (length * 3.281).toFixed(1) : length} onChange={(v) => setLength(units === "imperial" ? v / 3.281 : v)} step={0.5} min={0.1} />
              </Field>
              <Field label="Conductor">
                <select value={condKey} onChange={(e) => setCondKey(e.target.value)} style={S.select}>
                  {Object.entries(CONDUCTORS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                </select>
              </Field>
            </GridInputs>
            <ResultGrid>
              <R label={`Loss @ ${freqMHz} MHz`} value={fmtLoss(loss_dBm * 100, units, 2)} big />
              <R label={`Total over ${fmt(length, 1)} m`} value={`${fmt(lossTotal, 2)} dB`} />
              <R label="Conductor loss (α_c)" value={`${fmt(8.686 * alphaC * 100, 2)} dB/100m`} />
              <R label="Dielectric loss (α_d)" value={`${fmt(8.686 * alphaD * 100, 4)} dB/100m`} />
              <R label="Power remaining" value={`${fmt(100 * Math.pow(10, -lossTotal / 10), 1)} %`} />
            </ResultGrid>
          </Section>

          <Section title="Power & Frequency Limits">
            <ResultGrid>
              <R label="TE₁₁ cutoff frequency" value={`${fmt(fc, 2)} GHz`} big />
              <R label="Safe operating range" value={`< ${fmt(fc * 0.8, 2)} GHz`} />
              <R label="Breakdown voltage" value={`${fmt(Vbreak, 2)} kV`} />
              <R label="Peak power (theoretical)" value={`${fmt(Ppeak, 2)} kW`} />
              <R label="Peak power (4× safety)" value={`${fmt(Ppeak / 4, 2)} kW`} />
              <R label="Field strength limit" value={`${mat.Eb} kV/mm`} />
            </ResultGrid>
          </Section>

          <Section title="Mechanical Construction">
            <GridInputs>
              <Field label={`Shield thickness (${units === "imperial" ? "inch" : "mm"})`}><UnitInput mm={shieldThick} onChange={setShieldThick} units={units} step={0.05} min={0.05} max={2} /></Field>
              <Field label={`Jacket thickness (${units === "imperial" ? "inch" : "mm"})`}><UnitInput mm={jacketThick} onChange={setJacketThick} units={units} step={0.05} min={0.1} max={5} /></Field>
            </GridInputs>
            <ResultGrid>
              <R label="Total OD" value={fmtLen(jacketOD, units)} big />
              <R label="Mass per meter" value={fmtMass(mass, units, 1)} />
              <R label="Minimum bend radius" value={fmtLen(bendRadius, units, 1)} />
              <R label="Shield OD" value={fmtLen(shieldOD, units)} />
            </ResultGrid>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LIBRARY VIEW
// ═══════════════════════════════════════════════════════════════
function LibraryView({ activeCable, loadIntoDesign, askAboutCable, setActiveCable, comparedCables, toggleCompare, onPrint, isMobile = false }) {
  const [search, setSearch] = useState("");
  const [filterZ, setFilterZ] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [filterFreq, setFilterFreq] = useState(0);
  const [filterSource, setFilterSource] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [visualOnly, setVisualOnly] = useState(false);
  const [detailId, setDetailId] = useState(activeCable || null);
  const [renderModalId, setRenderModalId] = useState(null);
  const [renderModalInitialMode, setRenderModalInitialMode] = useState("standard");
  const savedScrollY = useRef(0);

  // Auto-open detail when activeCable changes from outside the library
  useEffect(() => {
    if (activeCable && activeCable !== detailId) {
      setDetailId(activeCable);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCable]);

  const openDetail = (id) => {
    savedScrollY.current = typeof window !== "undefined" ? window.scrollY : 0;
    setActiveCable(id);
    setDetailId(id);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" });
  };
  const closeDetail = () => {
    setDetailId(null);
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => window.scrollTo({ top: savedScrollY.current, behavior: "instant" }));
    }
  };
  const openRenderModal = (id, mode = "standard") => {
    setRenderModalInitialMode(mode);
    setRenderModalId(id);
  };

  const filtered = useMemo(() => {
    let list = Object.entries(CABLES).filter(([id, c]) => {
      if (filterZ !== "all" && c.z !== Number(filterZ)) return false;
      if (filterCat !== "all" && c.cat !== filterCat) return false;
      if (c.fMax < filterFreq) return false;
      if (filterSource !== "all" && getRfCableSourceMeta(id, c).confidence !== filterSource) return false;
      if (visualOnly && !getCableModelPath(id, c)) return false;
      if (search) { const q = search.toLowerCase(); if (!(c.name + " " + c.alias + " " + c.apps).toLowerCase().includes(q)) return false; }
      return true;
    });
    list.sort((a, b) => {
      if (sortBy === "name") return a[1].name.localeCompare(b[1].name);
      if (sortBy === "z") return a[1].z - b[1].z;
      if (sortBy === "od") return a[1].OD - b[1].OD;
      if (sortBy === "freq") return b[1].fMax - a[1].fMax;
      if (sortBy === "loss") { const aL = a[1].atten.find(x => x[0] >= 900)?.[1] ?? 999; const bL = b[1].atten.find(x => x[0] >= 900)?.[1] ?? 999; return aL - bL; }
      return 0;
    });
    return list;
  }, [search, filterZ, filterCat, filterFreq, filterSource, sortBy, visualOnly]);

  const total = Object.keys(CABLES).length;
  const sourceStats = useMemo(() => getRfCableSourceStats(CABLES), []);
  const categoryCount = Object.values(CABLES).filter(c => filterCat === "all" || c.cat === filterCat).length;
  const highFreqCount = Object.values(CABLES).filter(c => c.fMax >= 6).length;
  const lowPimCount = Object.values(CABLES).filter(c => /PIM|cellular|LTE|5G/i.test(`${c.name} ${c.alias} ${c.apps}`)).length;
  const renderedCableCount = Object.entries(CABLES).filter(([id, c]) => Boolean(getCableModelPath(id, c))).length;
  const renderedFilteredCount = filtered.filter(([id, c]) => Boolean(getCableModelPath(id, c))).length;
  const renderCoveragePct = total ? Math.round((renderedCableCount / total) * 100) : 0;
  const renderedFamilyCount = new Set(Object.entries(CABLES).filter(([id, c]) => getCableModelPath(id, c)).map(([, c]) => c.cat)).size;
  const coverageShowcaseIds = ["lmr400", "ava5", "ut141", "sucoflex550s", "belden4694r", "hca158"].filter(id => CABLES[id]?.render && getCableModelPath(id, CABLES[id]));
  const activeFilterText = [
    filterZ !== "all" ? `${filterZ} ohm` : null,
    filterCat !== "all" ? CATEGORIES[filterCat]?.label : null,
    filterFreq > 0 ? `${filterFreq} GHz+` : null,
    filterSource !== "all" ? `${RF_SOURCE_CONFIDENCE[filterSource]?.label || filterSource} source` : null,
    visualOnly ? "3D render" : null,
  ].filter(Boolean).join(" / ") || "All families";

  const hasActiveFilter = search || filterZ !== "all" || filterCat !== "all" || filterFreq > 0 || filterSource !== "all" || visualOnly;
  const clearFilters = () => { setSearch(""); setFilterZ("all"); setFilterCat("all"); setFilterFreq(0); setFilterSource("all"); setVisualOnly(false); };
  const renderModalCable = renderModalId && CABLES[renderModalId] ? withCableModel(renderModalId) : null;
  const renderModal = renderModalCable ? (
    <CableRenderModal
      id={renderModalId}
      cable={renderModalCable}
      initialMode={renderModalInitialMode}
      onClose={() => setRenderModalId(null)}
    />
  ) : null;

  // ── Detail view: take over the page when a cable is selected ──
  if (detailId && CABLES[detailId]) {
    return (
      <>
        <CableDetailView
          id={detailId}
          cable={withCableModel(detailId)}
          onBack={closeDetail}
          onDesign={() => loadIntoDesign(detailId)}
          onAsk={() => askAboutCable(detailId)}
          compared={comparedCables?.includes(detailId)}
          toggleCompare={toggleCompare}
          onPrint={onPrint ? () => onPrint(detailId) : undefined}
          onViewMacro={getCableMacroModelPath(detailId, CABLES[detailId]) ? () => openRenderModal(detailId, "macro") : undefined}
          onViewRender={!getCableMacroModelPath(detailId, CABLES[detailId]) && getCableModelPath(detailId, CABLES[detailId]) ? () => openRenderModal(detailId, "standard") : undefined}
        />
        {renderModal}
      </>
    );
  }

  return (
    <>
      <div style={S.viewInner}>
        {/* Compact header */}
        <div style={S.libHeader}>
        <div style={S.libHeaderMain}>
          <div style={S.libEyebrow}>◆ RF Reference Database</div>
          <div style={S.libTitleRow}>
            <h2 style={S.libTitle}>Cable Library</h2>
            <div style={S.libCounter}>
              <span style={S.libCounterValue}>{filtered.length}</span>
              <span style={S.libCounterDivider}>/</span>
              <span style={S.libCounterTotal}>{total}</span>
              <span style={S.libCounterLabel}>shown</span>
            </div>
          </div>
          <p style={S.libSubcopy}>
            Compare coax families · inspect construction · send a candidate to designer or link-budget.
          </p>
        </div>
        <div style={S.libHeaderStats}>
          <div style={S.libQuickStat}>
            <span style={S.libQuickStatValue}>{highFreqCount}</span>
            <span style={S.libQuickStatLabel}>≥ 6 GHz</span>
          </div>
          <div style={S.libQuickStat}>
            <span style={S.libQuickStatValue}>{lowPimCount}</span>
            <span style={S.libQuickStatLabel}>Low-PIM</span>
          </div>
          <div style={S.libQuickStat}>
            <span style={S.libQuickStatValue}>{renderCoveragePct}%</span>
            <span style={S.libQuickStatLabel}>3D coverage</span>
          </div>
          <div style={S.libQuickStat}>
            <span style={{ ...S.libQuickStatValue, color: RF_SOURCE_CONFIDENCE.catalog.color }}>{sourceStats.catalog}</span>
            <span style={S.libQuickStatLabel}>Catalog</span>
          </div>
          <div style={S.libQuickStat}>
            <span style={{ ...S.libQuickStatValue, color: RF_SOURCE_CONFIDENCE.estimate.color }}>{sourceStats.estimate}</span>
            <span style={S.libQuickStatLabel}>Estimate</span>
          </div>
        </div>
        </div>

        {/* Toolbar: single row with search + filters */}
        <div style={S.libToolbar}>
        <div style={S.libToolbarSearchWrap}>
          <span style={S.libToolbarSearchIcon}>⌕</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, alias, application…"
            style={S.libToolbarSearch}
          />
          {search && (
            <button onClick={() => setSearch("")} style={S.libToolbarClearBtn} title="Clear search">×</button>
          )}
        </div>
        <div style={S.libToolbarFilter}>
          <span style={S.libToolbarFilterLabel}>Z₀</span>
          <div style={S.libToolbarPillRow}>
            {[["all", "All"], ["50", "50 Ω"], ["75", "75 Ω"]].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setFilterZ(v)}
                style={{ ...S.libToolbarPill, ...(filterZ === v ? S.libToolbarPillActive : {}) }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div style={S.libToolbarFilter}>
          <span style={S.libToolbarFilterLabel}>Sort</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={S.libToolbarSelect}
          >
            <option value="name">Name</option>
            <option value="z">Impedance</option>
            <option value="od">Diameter</option>
            <option value="freq">Max freq</option>
            <option value="loss">Loss @ 900 MHz</option>
          </select>
        </div>
        <div style={S.libToolbarFilter}>
          <span style={S.libToolbarFilterLabel}>Source</span>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            style={S.libToolbarSelect}
          >
            <option value="all">All</option>
            <option value="verified">Datasheet</option>
            <option value="catalog">Catalog</option>
            <option value="estimate">Estimate</option>
          </select>
        </div>
        <div style={S.libToolbarFilter}>
          <span style={S.libToolbarFilterLabel}>Min&nbsp;f</span>
          <div style={S.libToolbarRangeWrap}>
            <input
              type="range"
              min={0}
              max={50}
              step={0.5}
              value={filterFreq}
              onChange={(e) => setFilterFreq(Number(e.target.value))}
              style={S.libToolbarRange}
            />
            <span style={S.libToolbarRangeValue}>{filterFreq}&nbsp;GHz</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setVisualOnly(v => !v)}
          data-testid="rf-library-visual-filter"
          style={{ ...S.libToolbarToggle, ...(visualOnly ? S.libToolbarToggleActive : {}) }}
        >
          3D only
        </button>
        {hasActiveFilter && (
          <button onClick={clearFilters} style={S.libToolbarReset} title="Clear all filters">
            Reset
          </button>
        )}
        </div>

        {/* Category strip */}
        <div style={S.libCatStrip}>
        <span style={S.libCatStripLabel}>Family</span>
        <div style={S.libCatStripPills}>
          <button
            onClick={() => setFilterCat("all")}
            className="hover-pill"
            style={{ ...S.libCatPill, ...(filterCat === "all" ? S.libCatPillActive : {}) }}
          >
            All
          </button>
          {Object.entries(CATEGORIES).map(([k, v]) => {
            const active = filterCat === k;
            return (
              <button
                key={k}
                onClick={() => setFilterCat(k)}
                className="hover-pill"
                style={{
                  ...S.libCatPill,
                  borderLeft: `3px solid ${v.color}`,
                  ...(active ? { ...S.libCatPillActive, borderColor: v.color, color: v.color, borderLeftColor: v.color } : {}),
                }}
              >
                {v.label}
              </button>
            );
          })}
        </div>
        </div>

        <LibraryRenderCoveragePanel
          total={total}
          rendered={renderedCableCount}
          coveragePct={renderCoveragePct}
          familyCount={renderedFamilyCount}
          filteredRendered={renderedFilteredCount}
          filteredTotal={filtered.length}
          filterLabel={activeFilterText}
          categoryCount={categoryCount}
          showcaseIds={coverageShowcaseIds}
          onOpen={openDetail}
          onShowRendered={() => setVisualOnly(true)}
        />

        {/* Cable list */}
        <div style={S.cableList}>
          {filtered.map(([id, c]) => (
            <CableCard
              key={id}
              id={id}
              cable={c}
              onOpen={() => openDetail(id)}
              onViewMacro={getCableMacroModelPath(id, c) ? () => openRenderModal(id, "macro") : undefined}
              onViewRender={!getCableMacroModelPath(id, c) && getCableModelPath(id, c) ? () => openRenderModal(id, "standard") : undefined}
              compared={comparedCables?.includes(id)}
              isMobile={isMobile}
            />
          ))}
          {filtered.length === 0 && (
            <div style={S.emptyState}>
              No cables match filters.{' '}
              {hasActiveFilter && <button onClick={clearFilters} style={S.emptyStateBtn}>Clear filters</button>}
            </div>
          )}
        </div>
      </div>
      {renderModal}
    </>
  );
}

function LibraryStat({ value, label }) {
  return (
    <div style={S.libraryStat}>
      <div style={S.libraryStatValue}>{value}</div>
      <div style={S.libraryStatLabel}>{label}</div>
    </div>
  );
}

function LibraryRenderCoveragePanel({ total, rendered, coveragePct, familyCount, filteredRendered, filteredTotal, filterLabel, categoryCount, showcaseIds, onOpen, onShowRendered }) {
  const showcase = showcaseIds.map(id => [id, CABLES[id]]).filter(([, c]) => c?.render);

  return (
    <section style={S.renderCoveragePanel} data-testid="rf-library-render-coverage">
      <div style={S.renderCoverageSummary}>
        <div style={S.renderCoverageEyebrow}>◆ Blender visual coverage</div>
        <div style={S.renderCoverageHeadline}>
          <span style={S.renderCoverageBig}>{rendered}</span>
          <span style={S.renderCoverageSlash}>/</span>
          <span style={S.renderCoverageTotal}>{total}</span>
          <span style={S.renderCoverageUnit}>profiles</span>
        </div>
        <div style={S.renderCoverageCopy}>
          {coveragePct}% of RF cable entries have dedicated 3D cutaway renders across {familyCount} families.
        </div>
      </div>

      <div style={S.renderCoverageMetrics}>
        <div style={S.renderCoverageMetric}>
          <span style={S.renderCoverageMetricLabel}>Current view</span>
          <span style={S.renderCoverageMetricValue}>{filteredRendered}/{filteredTotal}</span>
          <span style={S.renderCoverageMetricSub}>{filterLabel}</span>
        </div>
        <div style={S.renderCoverageMiniStat}>
          <span>{categoryCount}</span>
          <small style={S.renderCoverageMiniStatLabel}>in scope</small>
        </div>
        <button type="button" onClick={onShowRendered} style={S.renderCoverageButton}>
          Show 3D set
        </button>
      </div>

      <div style={S.renderCoverageReel}>
        {showcase.map(([id, c]) => (
          <button key={id} type="button" onClick={() => onOpen(id)} style={S.renderCoverageTile} title={c.name}>
            <img src={c.render} alt={`${c.name} 3D cutaway`} loading="lazy" decoding="async" style={S.renderCoverageTileImg} />
            <span style={S.renderCoverageTileName}>{c.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const RF_RENDER_LAYER_META = {
  conductor: { label: "Conductor", color: "#f59e0b" },
  dielectric: { label: "Dielectric", color: "#fef3c7" },
  foil: { label: "Foil shield", color: "#cbd5e1" },
  braid: { label: "Braid shield", color: "#d6b680" },
  outerShield: { label: "Outer shield", color: "#fb923c" },
  jacket: { label: "Jacket", color: "#7dd3fc" },
};

const RF_RENDER_LAYER_TESTS = {
  conductor: [/conductor/i, /center/i, /solid.*cu/i, /bare.*cu/i, /copper.*core/i],
  dielectric: [/dielectric/i, /foam/i, /ptfe/i, /polyethylene/i, /pe spacer/i, /smooth.*skin/i],
  foil: [/foil/i, /duobond/i, /duofoil/i, /lap/i, /tape sleeve/i],
  braid: [/braid/i, /carrier/i, /woven/i],
  outerShield: [/corrugated/i, /outer conductor/i, /solid.*tube/i, /metal.*tube/i, /groove shadow/i, /shield sleeve/i],
  jacket: [/jacket/i, /pvc/i, /fep/i, /pe jacket/i, /cut edge/i, /cut face/i],
};

const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));

function rfLayerMaskFromName(name) {
  const mask = new Set();
  Object.entries(RF_RENDER_LAYER_TESTS).forEach(([layerId, tests]) => {
    if (tests.some((test) => test.test(name))) mask.add(layerId);
  });
  return mask;
}

function getRfRenderLayers(c) {
  const cons = c.cons || {};
  const shield = `${cons.shield || ""} ${c.shield || ""}`;
  const layers = [
    { id: "conductor", sub: cons.conductor || `${fmt(c.d, 2)} mm center` },
    { id: "dielectric", sub: cons.dielectric || `${fmt(c.D, 2)} mm dielectric` },
  ];
  if (/foil|duobond|duofoil|tape|al[- ]?polymer/i.test(shield)) {
    layers.push({ id: "foil", sub: cons.shield || "100% foil barrier" });
  }
  if (/braid|carrier|al-mg/i.test(shield)) {
    layers.push({ id: "braid", sub: cons.shield || "woven shield" });
  }
  if (/corrugated|solid.*tube|outer tube|outer conductor|annular/i.test(shield) || (!/foil|braid|duobond|duofoil|tape/i.test(shield) && shield)) {
    layers.push({ id: "outerShield", sub: cons.shield || "outer conductor" });
  }
  if (!/^none\b/i.test(cons.jacket || "")) {
    layers.push({ id: "jacket", sub: cons.jacket || `${fmt(c.OD, 2)} mm OD` });
  }
  return layers.map((layer) => ({
    ...layer,
    ...RF_RENDER_LAYER_META[layer.id],
  }));
}

function getRfConnectorMatches(c) {
  const od = Number(c.OD) || 0;
  const cableFmax = Math.max(Number(c.fMax) || 0.3, 0.3);
  const targetFmax = Math.min(cableFmax, 18);
  return Object.entries(CONNECTORS)
    .map(([connectorId, connector]) => {
      const [minOd = 0, maxOd = 999] = connector.cableOD || [];
      const odFit = od >= minOd && od <= maxOd;
      const zFit = Number(connector.z) === Number(c.z);
      const freqFit = Number(connector.fMax) >= targetFmax;
      const odMiss = odFit ? 0 : Math.min(Math.abs(od - minOd), Math.abs(od - maxOd));
      const odScore = odFit ? 36 : clampValue(28 - odMiss * 6, 0, 28);
      const freqScore = clampValue((Number(connector.fMax) || 0) / targetFmax, 0, 1) * 20;
      const score = (zFit ? 44 : 0) + odScore + freqScore;
      return { connectorId, connector, odFit, zFit, freqFit, odMiss, score };
    })
    .sort((a, b) => b.score - a.score || b.connector.fMax - a.connector.fMax)
    .slice(0, 4);
}

function getRfBendRisk(c, bendMultiplier) {
  const recommendedByFlex = { high: 6, medium: 10, low: 15 };
  const recommendedMultiplier = recommendedByFlex[c.flex] || (/corrugated|hardline|rigid/i.test(c.cat || "") ? 20 : 12);
  const actualRadius = (Number(c.OD) || 0) * bendMultiplier;
  const recommendedRadius = (Number(c.OD) || 0) * recommendedMultiplier;
  const ratio = recommendedRadius ? actualRadius / recommendedRadius : 1;
  const complexityPenalty = c.complexity === "high" ? 6 : c.complexity === "medium" ? 3 : 0;
  const risk = clampValue(Math.round((1.35 - ratio) * 78 + complexityPenalty), 4, 96);
  const label = risk > 70 ? "High crush risk" : risk > 42 ? "Borderline bend" : "Healthy bend";
  const color = risk > 70 ? "#fb7185" : risk > 42 ? "#fbbf24" : "#5eead4";
  return { recommendedMultiplier, actualRadius, recommendedRadius, ratio, risk, label, color };
}

function getRfShieldCoverage(c, freqGHz = 2.4) {
  const shield = c.cons?.shield || "";
  const percentMatch = shield.match(/(\d{2,3})\s*%/);
  const parsedCoverage = percentMatch ? clampValue(Number(percentMatch[1]), 0, 100) : null;
  let coverage = parsedCoverage ?? 88;
  let seDb = 55;
  let family = "Braid";

  if (/corrugated|solid.*tube|outer tube|outer conductor|annular/i.test(shield)) {
    coverage = 100;
    seDb = 120;
    family = "Solid outer conductor";
  } else if (/foil\+braid\+foil\+braid|quad/i.test(shield)) {
    coverage = 100;
    seDb = 108;
    family = "Quad shield";
  } else if (/double.*braid|braid.*braid/i.test(shield)) {
    coverage = Math.max(parsedCoverage ?? 96, 96);
    seDb = 92;
    family = "Double braid";
  } else if (/foil|duobond|duofoil|al[- ]?polymer/i.test(shield) && /braid/i.test(shield)) {
    coverage = Math.max(parsedCoverage ?? 95, /100/.test(shield) ? 100 : 95);
    seDb = 88;
    family = "Foil + braid";
  } else if (/foil|duobond|duofoil/i.test(shield)) {
    coverage = Math.max(parsedCoverage ?? 100, 96);
    seDb = 78;
    family = "Foil";
  } else if (/braid/i.test(shield)) {
    coverage = parsedCoverage ?? 90;
    seDb = coverage >= 95 ? 72 : coverage >= 85 ? 62 : 50;
  } else if (/none/i.test(shield)) {
    coverage = 0;
    seDb = 0;
    family = "Unshielded";
  }

  const freqPenalty = freqGHz > 1 ? Math.log10(freqGHz) * 8 : 0;
  const effectiveSe = clampValue(seDb - freqPenalty, 0, 130);
  const leakRisk = clampValue(Math.round(100 - effectiveSe * 0.75 - coverage * 0.18), 2, 96);
  return { coverage, seDb: effectiveSe, baseSeDb: seDb, family, leakRisk, shield };
}

function RenderLayerCallouts({ layers, activeLayer, pinnedLayer, onHoverLayer, onToggleLayer }) {
  return (
    <section style={S.renderInspectorCard}>
      <div style={S.renderInspectorHeader}>
        <span style={S.renderInspectorKicker}>Layer callouts</span>
        <span style={S.renderInspectorValue}>{layers.length}</span>
      </div>
      <div style={S.renderLayerGrid}>
        {layers.map((layer) => {
          const active = activeLayer === layer.id;
          const pinned = pinnedLayer === layer.id;
          return (
            <button
              key={layer.id}
              type="button"
              onMouseEnter={() => onHoverLayer(layer.id)}
              onMouseLeave={() => onHoverLayer(null)}
              onFocus={() => onHoverLayer(layer.id)}
              onBlur={() => onHoverLayer(null)}
              onClick={() => onToggleLayer(layer.id)}
              style={{
                ...S.renderLayerButton,
                borderColor: active ? layer.color : "rgba(168,162,158,0.16)",
                background: active ? "rgba(94,234,212,0.08)" : "rgba(3,7,8,0.58)",
                boxShadow: pinned ? `inset 0 0 0 1px ${layer.color}` : "none",
              }}
            >
              <span style={{ ...S.renderLayerSwatch, background: layer.color }} />
              <span style={S.renderLayerCopy}>
                <span style={{ ...S.renderLayerName, color: active ? layer.color : "#f5f5f4" }}>{layer.label}</span>
                <span style={S.renderLayerSub}>{layer.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ConnectorCompatibilityPanel({ cable }) {
  const matches = useMemo(() => getRfConnectorMatches(cable), [cable]);
  return (
    <section style={S.renderInspectorCard}>
      <div style={S.renderInspectorHeader}>
        <span style={S.renderInspectorKicker}>Connector fit</span>
        <span style={S.renderInspectorValue}>{cable.z} Ω</span>
      </div>
      <div style={S.renderConnectorList}>
        {matches.map(({ connectorId, connector, odFit, zFit, freqFit, score }) => (
          <div key={connectorId} style={S.renderConnectorRow}>
            <div style={S.renderConnectorTop}>
              <strong style={S.renderConnectorName}>{connector.name}</strong>
              <span style={{ ...S.renderFitBadge, color: zFit && odFit ? "#5eead4" : "#fbbf24", borderColor: zFit && odFit ? "rgba(94,234,212,0.45)" : "rgba(251,191,36,0.42)" }}>
                {Math.round(score)}%
              </span>
            </div>
            <div style={S.renderConnectorFlags}>
              <span style={{ color: zFit ? "#5eead4" : "#fb7185" }}>Z</span>
              <span style={{ color: odFit ? "#5eead4" : "#fb7185" }}>OD {connector.cableOD?.[0]}-{connector.cableOD?.[1]} mm</span>
              <span style={{ color: freqFit ? "#5eead4" : "#fbbf24" }}>{connector.fMax} GHz</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BendCrushPanel({ cable, bendMultiplier, onBendMultiplier }) {
  const bend = getRfBendRisk(cable, bendMultiplier);
  return (
    <section style={S.renderInspectorCard}>
      <div style={S.renderInspectorHeader}>
        <span style={S.renderInspectorKicker}>Bend / crush</span>
        <span style={{ ...S.renderInspectorValue, color: bend.color }}>{bend.risk}%</span>
      </div>
      <div style={S.renderRiskMeter}>
        <div style={{ ...S.renderRiskFill, width: `${bend.risk}%`, background: bend.color }} />
      </div>
      <div style={S.renderBendReadout}>
        <span>{bend.label}</span>
        <strong>{fmt(bend.actualRadius, 1)} mm R</strong>
      </div>
      <input
        type="range"
        min={3}
        max={30}
        step={1}
        value={bendMultiplier}
        onChange={(e) => onBendMultiplier(Number(e.target.value))}
        style={S.renderSlider}
      />
      <div style={S.renderFinePrint}>
        Set {bendMultiplier}x OD / recommended {bend.recommendedMultiplier}x OD
      </div>
    </section>
  );
}

function ShieldCoveragePanel({ cable, freqGHz, onFreq }) {
  const shield = getRfShieldCoverage(cable, freqGHz);
  return (
    <section style={S.renderInspectorCard}>
      <div style={S.renderInspectorHeader}>
        <span style={S.renderInspectorKicker}>Shield coverage</span>
        <span style={S.renderInspectorValue}>{fmt(shield.seDb, 0)} dB</span>
      </div>
      <div style={S.renderCoverageBar}>
        <div style={{ ...S.renderCoverageFill, width: `${shield.coverage}%` }} />
      </div>
      <div style={S.renderShieldStats}>
        <span>{shield.family}</span>
        <strong>{fmt(shield.coverage, 0)}%</strong>
      </div>
      <div style={S.renderBendReadout}>
        <span>Leak risk</span>
        <strong style={{ color: shield.leakRisk > 45 ? "#fbbf24" : "#5eead4" }}>{shield.leakRisk}%</strong>
      </div>
      <div style={S.renderFreqPills}>
        {[0.9, 2.4, 6, 18].map((freq) => (
          <button
            key={freq}
            type="button"
            onClick={() => onFreq(freq)}
            style={{
              ...S.renderFreqPill,
              borderColor: freqGHz === freq ? "rgba(94,234,212,0.58)" : "rgba(168,162,158,0.14)",
              color: freqGHz === freq ? "#5eead4" : "#a8a29e",
            }}
          >
            {freq < 1 ? `${freq * 1000} MHz` : `${freq} GHz`}
          </button>
        ))}
      </div>
      <div style={S.renderFinePrint}>{shield.shield || "Shield stack not specified"}</div>
    </section>
  );
}

function CableRenderModal({ id, cable: c, initialMode = "standard", onClose }) {
  const layers = useMemo(() => getRfRenderLayers(c), [c]);
  const hasMacro = Boolean(c.macroModel);
  const [pinnedLayer, setPinnedLayer] = useState(null);
  const [hoverLayer, setHoverLayer] = useState(null);
  const activeLayer = hoverLayer || pinnedLayer;
  const [bendMultiplier, setBendMultiplier] = useState(c.flex === "high" ? 8 : c.flex === "low" ? 16 : 10);
  const [shieldFreq, setShieldFreq] = useState(2.4);
  const renderCable = useMemo(
    () => (c.macroModel ? { ...c, model: c.macroModel } : c),
    [c]
  );
  const isMacro = hasMacro;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    setPinnedLayer(null);
    setHoverLayer(null);
  }, [id, initialMode, hasMacro]);

  return (
    <div style={S.renderModalOverlay} onClick={onClose}>
      <div style={S.renderModalCard} onClick={(e) => e.stopPropagation()} data-testid="rf-glb-render-modal">
        <div style={S.renderModalHeader}>
          <div>
            <div style={S.renderModalEyebrow}>{isMacro ? "◆ Macro 3D / Three.js render" : "◆ GLB / Three.js render"}</div>
            <div style={S.renderModalTitle}>{c.name}</div>
          </div>
          <div style={S.renderModalHeaderTools}>
            <button type="button" onClick={onClose} style={S.renderModalClose} title="Close">
              <XIcon size={18} />
            </button>
          </div>
        </div>
        <div style={S.renderModalBody}>
          <div style={S.renderModalViewerPane}>
            <CableGlbViewer cable={renderCable} activeLayer={activeLayer} />
            <div style={S.renderModalStats}>
              <RfFailureMetric label="Model" value={isMacro ? `${id}-macro` : id} sub={isMacro ? "macro 3D render" : "runtime GLB"} accent="#5eead4" />
              <RfFailureMetric label="OD" value={`${fmt(c.OD, 1)} mm`} sub={`${fmt(c.OD / MM_PER_IN, 2)} in`} accent="#fbbf24" />
              <RfFailureMetric label="VP" value={`${c.vp}%`} sub={`${c.z} Ω`} accent="#38bdf8" />
            </div>
          </div>
          <aside style={S.renderInspectorPanel}>
            <RenderLayerCallouts
              layers={layers}
              activeLayer={activeLayer}
              pinnedLayer={pinnedLayer}
              onHoverLayer={setHoverLayer}
              onToggleLayer={(layerId) => setPinnedLayer((current) => current === layerId ? null : layerId)}
            />
            <ConnectorCompatibilityPanel cable={c} />
            <BendCrushPanel cable={c} bendMultiplier={bendMultiplier} onBendMultiplier={setBendMultiplier} />
            <ShieldCoveragePanel cable={c} freqGHz={shieldFreq} onFreq={setShieldFreq} />
          </aside>
        </div>
      </div>
    </div>
  );
}

function CableGlbViewer({ cable: c, activeLayer }) {
  const mountRef = useRef(null);
  const modelRootRef = useRef(null);
  const activeLayerRef = useRef(activeLayer);
  const applyLayerHighlightRef = useRef(() => {});
  const [status, setStatus] = useState("Loading GLB");

  useEffect(() => {
    activeLayerRef.current = activeLayer;
    applyLayerHighlightRef.current(activeLayer);
  }, [activeLayer]);

  useEffect(() => {
    let alive = true;
    let frameId = 0;
    let renderer = null;
    let scene = null;
    let camera = null;
    let modelGroup = null;
    let resizeObserver = null;
    const disposables = [];
    const pointer = { down: false, x: 0, y: 0 };

    const disposeMaterial = (material) => {
      if (!material) return;
      for (const value of Object.values(material)) {
        if (value && typeof value === "object" && value.isTexture) value.dispose();
      }
      if (material.dispose) material.dispose();
    };

    const disposeObject = (object) => {
      object?.traverse?.((node) => {
        if (node.geometry) node.geometry.dispose();
        if (Array.isArray(node.material)) node.material.forEach(disposeMaterial);
        else disposeMaterial(node.material);
      });
    };

    const run = async () => {
      try {
        const [THREE, { GLTFLoader }] = await Promise.all([
          import("three"),
          import("three/examples/jsm/loaders/GLTFLoader.js"),
        ]);
        if (!alive || !mountRef.current) return;

        const mount = mountRef.current;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.dataset.testid = "rf-glb-viewer-canvas";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        mount.appendChild(renderer.domElement);

        scene = new THREE.Scene();
        modelGroup = new THREE.Group();
        modelGroup.rotation.set(-0.1, -0.18, 0.015);
        scene.add(modelGroup);

        camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
        camera.position.set(0, 0.15, 5.2);
        scene.add(camera);

        const ambient = new THREE.HemisphereLight(0xf5efe4, 0x15191c, 1.7);
        const key = new THREE.DirectionalLight(0xffffff, 3.0);
        key.position.set(-2.8, 4.2, 5.0);
        const rim = new THREE.DirectionalLight(0xf59e0b, 1.4);
        rim.position.set(4.0, -1.6, 2.4);
        scene.add(ambient, key, rim);
        disposables.push(ambient, key, rim);

        const resize = () => {
          if (!mount || !renderer || !camera) return;
          const rect = mount.getBoundingClientRect();
          const width = Math.max(320, Math.floor(rect.width || 720));
          const height = Math.max(260, Math.floor(rect.height || 420));
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(mount);
        resize();

        const onPointerDown = (e) => {
          pointer.down = true;
          pointer.x = e.clientX;
          pointer.y = e.clientY;
          renderer.domElement.setPointerCapture?.(e.pointerId);
        };
        const onPointerMove = (e) => {
          if (!pointer.down || !modelGroup) return;
          const dx = e.clientX - pointer.x;
          const dy = e.clientY - pointer.y;
          pointer.x = e.clientX;
          pointer.y = e.clientY;
          modelGroup.rotation.y += dx * 0.008;
          modelGroup.rotation.x = Math.max(-0.72, Math.min(0.42, modelGroup.rotation.x + dy * 0.005));
        };
        const onPointerUp = () => { pointer.down = false; };
        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        disposables.push({
          dispose: () => {
            renderer?.domElement?.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
          },
        });

        const loader = new GLTFLoader();
        const applyLayerHighlight = (layerId = activeLayerRef.current) => {
          const root = modelRootRef.current;
          if (!root) return;
          const layerColor = layerId && RF_RENDER_LAYER_META[layerId]?.color ? new THREE.Color(RF_RENDER_LAYER_META[layerId].color) : null;
          root.traverse((node) => {
            if (!node.isMesh || !node.userData?.rfBaseMaterials) return;
            const nodeLayers = node.userData.rfLayers || [];
            const isActive = !layerId || nodeLayers.includes(layerId);
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach((mat, index) => {
              const base = node.userData.rfBaseMaterials[index] || node.userData.rfBaseMaterials[0];
              if (!base || !mat) return;
              mat.color.copy(base.color);
              if (mat.emissive && base.emissive) mat.emissive.copy(base.emissive);
              mat.opacity = base.opacity;
              mat.transparent = base.transparent;
              mat.depthWrite = base.depthWrite;
              mat.roughness = base.roughness;
              mat.metalness = base.metalness;
              if (layerId) {
                if (isActive) {
                  if (layerColor) mat.color.lerp(layerColor, 0.28);
                  if (mat.emissive && layerColor) mat.emissive.copy(layerColor).multiplyScalar(0.24);
                  mat.opacity = Math.max(base.opacity, 0.92);
                  mat.transparent = base.transparent && mat.opacity < 1;
                  mat.depthWrite = true;
                  mat.roughness = Math.max(0.18, base.roughness * 0.78);
                } else {
                  mat.opacity = Math.min(base.opacity, 0.24);
                  mat.transparent = true;
                  mat.depthWrite = false;
                  mat.color.multiplyScalar(0.54);
                }
              }
              mat.needsUpdate = true;
            });
          });
        };
        applyLayerHighlightRef.current = applyLayerHighlight;

        const snapshotBaseMaterials = (object, layers) => {
          object.traverse((node) => {
            if (!node.isMesh || !node.material) return;
            node.userData.rfLayers = Array.from(new Set(layers || []));
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            node.userData.rfBaseMaterials = materials.map((mat) => ({
              color: mat.color.clone(),
              emissive: mat.emissive?.clone?.() || new THREE.Color(0x000000),
              opacity: mat.opacity ?? 1,
              transparent: Boolean(mat.transparent),
              depthWrite: mat.depthWrite !== false,
              roughness: mat.roughness ?? 0.5,
              metalness: mat.metalness ?? 0,
            }));
          });
          return object;
        };

        const makeRfMaterial = (name, color, options = {}) => {
          const opacity = options.opacity ?? 1;
          const material = new THREE.MeshStandardMaterial({
            name,
            color,
            metalness: options.metalness ?? 0,
            roughness: options.roughness ?? 0.55,
            transparent: opacity < 1,
            opacity,
            side: options.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
            depthWrite: opacity >= 0.98,
          });
          if (options.emissive) {
            material.emissive = new THREE.Color(options.emissive);
            material.emissiveIntensity = options.emissiveIntensity ?? 0.12;
          }
          return material;
        };

        const addCylinderX = (group, name, x, length, radius, material, layers, options = {}) => {
          const geometry = new THREE.CylinderGeometry(
            Math.max(radius, 0.006),
            Math.max(radius, 0.006),
            Math.max(length, 0.01),
            options.radialSegments || 128,
            options.heightSegments || 1,
            Boolean(options.openEnded)
          );
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = name;
          mesh.rotation.z = Math.PI / 2;
          mesh.position.x = x;
          snapshotBaseMaterials(mesh, layers);
          group.add(mesh);
          return mesh;
        };

        const addCurveTube = (group, name, points, material, layers, radius, segments = 96) => {
          const curve = new THREE.CatmullRomCurve3(points);
          const geometry = new THREE.TubeGeometry(curve, segments, Math.max(radius, 0.003), 8, false);
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = name;
          snapshotBaseMaterials(mesh, layers);
          group.add(mesh);
          return mesh;
        };

        const addHelix = (group, name, x0, x1, radius, turns, phase, material, layers, tubeRadius, handedness = 1) => {
          const points = [];
          const steps = 92;
          for (let i = 0; i < steps; i += 1) {
            const t = i / (steps - 1);
            const x = x0 + (x1 - x0) * t;
            const angle = phase + handedness * turns * Math.PI * 2 * t;
            points.push(new THREE.Vector3(x, radius * Math.cos(angle), radius * Math.sin(angle)));
          }
          return addCurveTube(group, name, points, material, layers, tubeRadius, steps);
        };

        const addBraid = (group, x0, x1, radius, cableOd, materialA, materialB) => {
          const carriers = Math.max(12, Math.min(22, Math.round(12 + cableOd * 0.55)));
          const evenCarriers = carriers % 2 ? carriers + 1 : carriers;
          const turns = cableOd >= 10 ? 2.15 : 2.55;
          const tubeRadius = Math.max(0.0045, radius * 0.011);
          for (let i = 0; i < evenCarriers; i += 1) {
            const phase = (Math.PI * 2 * i) / evenCarriers;
            addHelix(group, `procedural woven braid carrier ${i + 1}A`, x0, x1, radius, turns, phase, materialA, ["braid"], tubeRadius, 1);
            addHelix(group, `procedural woven braid carrier ${i + 1}B`, x0, x1, radius * 1.012, turns, phase + Math.PI / evenCarriers, materialB, ["braid"], tubeRadius, -1);
          }
        };

        const addSurfaceLines = (group, label, x0, x1, radius, count, material, layers, tubeRadius, wobble = 0.015) => {
          for (let i = 0; i < count; i += 1) {
            const phase = (Math.PI * 2 * i) / count;
            const points = [];
            const steps = 24;
            for (let step = 0; step < steps; step += 1) {
              const t = step / (steps - 1);
              const x = x0 + (x1 - x0) * t;
              const angle = phase + Math.sin(t * Math.PI * 2 + i * 0.31) * wobble;
              points.push(new THREE.Vector3(x, radius * Math.cos(angle), radius * Math.sin(angle)));
            }
            addCurveTube(group, `${label} surface line ${i + 1}`, points, material, layers, tubeRadius, steps);
          }
        };

        const addTorusRingX = (group, name, x, radius, tubeRadius, material, layers) => {
          const geometry = new THREE.TorusGeometry(Math.max(radius, 0.01), Math.max(tubeRadius, 0.002), 10, 128);
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = name;
          mesh.rotation.y = Math.PI / 2;
          mesh.position.x = x;
          snapshotBaseMaterials(mesh, layers);
          group.add(mesh);
          return mesh;
        };

        const conductorStrandCount = (text = "") => {
          const lower = `${text}`.toLowerCase();
          const match = lower.match(/\b(7|19|37)\s*[- ]?strand/);
          if (match) return Number(match[1]);
          if (/stranded|flexible/.test(lower)) return 7;
          return 1;
        };

        const colorByText = {
          jacket(text = "") {
            const lower = text.toLowerCase();
            if (/white|plenum|lszh|fep/.test(lower)) return 0xd8d1bd;
            if (/brown|tan/.test(lower)) return 0x8b5e38;
            if (/orange/.test(lower)) return 0x8a3a12;
            if (/blue/.test(lower)) return 0x17365f;
            return 0x11110f;
          },
          conductor(text = "") {
            const lower = text.toLowerCase();
            if (/silver|spc|ss|steel/.test(lower)) return 0xd8d2c3;
            if (/tin|tinned/.test(lower)) return 0xc0b8a8;
            return 0xb8692c;
          },
          braid(text = "") {
            const lower = text.toLowerCase();
            if (/silver|spc|tin|tinned|al|aluminum|foil/.test(lower)) return 0xcfc7b8;
            return 0xb06b34;
          },
          dielectric(text = "") {
            const lower = text.toLowerCase();
            if (/ptfe|fep|teflon/.test(lower)) return 0xf3ead0;
            if (/air/.test(lower)) return 0xd9e8e4;
            if (/foam/.test(lower)) return 0xfff2cf;
            return 0xf4df9f;
          },
        };

        const addConductor = (group, x0, x1, radius, material, strands) => {
          if (strands <= 1) {
            addCylinderX(group, "procedural continuous center conductor", (x0 + x1) / 2, x1 - x0, radius, material, ["conductor"], { radialSegments: 96 });
            return;
          }
          const centerRadius = radius * 0.34;
          addCylinderX(group, "procedural center conductor core strand", (x0 + x1) / 2, x1 - x0, centerRadius, material, ["conductor"], { radialSegments: 48 });
          const ringCount = Math.min(strands - 1, 18);
          const strandRadius = radius * (strands >= 19 ? 0.18 : 0.24);
          const ringRadius = radius - strandRadius * 1.1;
          for (let i = 0; i < ringCount; i += 1) {
            const phase = (Math.PI * 2 * i) / ringCount;
            const points = [];
            const steps = 42;
            for (let step = 0; step < steps; step += 1) {
              const t = step / (steps - 1);
              const x = x0 + (x1 - x0) * t;
              const angle = phase + Math.PI * 2 * 1.15 * t;
              points.push(new THREE.Vector3(x, ringRadius * Math.cos(angle), ringRadius * Math.sin(angle)));
            }
            addCurveTube(group, `procedural conductor strand ${i + 1}`, points, material, ["conductor"], strandRadius, steps);
          }
        };

        const buildProceduralRfMacro = () => {
          const group = new THREE.Group();
          group.name = `${c.name || "RF cable"} procedural macro render`;
          const cons = c.cons || {};
          const shieldText = `${cons.shield || ""} ${c.shield || ""}`;
          const conductorText = cons.conductor || "";
          const dielectricText = cons.dielectric || "";
          const jacketText = cons.jacket || "";
          const od = Math.max(Number(c.OD) || 8, 1);
          const scale = Math.max(0.055, Math.min(0.23, 1.26 / od));
          const outerR = Math.max(0.22, (od * 0.5) * scale);
          const shieldR = Math.max(0.08, (Number(c.shield) || od * 0.82) * 0.5 * scale);
          const dielectricR = Math.max(0.055, (Number(c.D) || od * 0.52) * 0.5 * scale);
          const conductorR = Math.max(0.022, (Number(c.d) || od * 0.12) * 0.5 * scale);
          const isHardline = c.cat === "heliax" || /corrugated|annular|outer conductor|solid.*tube|cellflex|heliax/i.test(shieldText);
          const isSemiRigid = c.cat === "semi" || /semi[- ]?rigid|seamless|solid cu tube|bare semi|conformable/i.test(`${c.name} ${shieldText}`);
          const hasFoil = /foil|duobond|duofoil|al[- ]?polymer|bonded/i.test(shieldText);
          const hasBraid = /braid|woven|carrier|tinned cu/i.test(shieldText) || (!isHardline && !isSemiRigid);

          const jacket = makeRfMaterial("procedural jacket material", colorByText.jacket(`${c.name} ${jacketText}`), { roughness: 0.92 });
          const jacketEdge = makeRfMaterial("procedural jacket cut edge", colorByText.jacket(`${c.name} ${jacketText}`), { roughness: 0.98 });
          const conductor = makeRfMaterial("procedural conductor copper surface", colorByText.conductor(conductorText), { metalness: 0.88, roughness: 0.18 });
          const dielectric = makeRfMaterial("procedural dielectric surface", colorByText.dielectric(dielectricText), { roughness: /foam/i.test(dielectricText) ? 0.86 : 0.58 });
          const dielectricLine = makeRfMaterial("procedural dielectric extrusion texture", 0xd8c9a6, { roughness: 0.94 });
          const foil = makeRfMaterial("procedural golden foil shield", hasFoil ? 0xd2a549 : 0x9c7a3f, { metalness: 0.82, roughness: 0.28, doubleSide: true });
          const foilSeam = makeRfMaterial("procedural foil lap seam", 0x6b4b1f, { metalness: 0.6, roughness: 0.4 });
          const braidA = makeRfMaterial("procedural bright woven braid wires", colorByText.braid(shieldText), { metalness: 0.76, roughness: 0.32 });
          const braidB = makeRfMaterial("procedural shadow woven braid wires", 0x776f61, { metalness: 0.62, roughness: 0.48 });
          const copperShield = makeRfMaterial("procedural corrugated copper outer conductor", 0xb7652d, { metalness: 0.9, roughness: 0.22 });
          const copperShadow = makeRfMaterial("procedural corrugation groove shadow", 0x5a2c12, { metalness: 0.68, roughness: 0.46 });

          addCylinderX(group, "procedural rear jacket body", -1.92, 2.7, outerR, jacket, ["jacket"], { radialSegments: 128 });
          addCylinderX(group, "procedural jacket cut lip", -0.58, 0.08, outerR * 1.012, jacketEdge, ["jacket"], { radialSegments: 128 });
          addSurfaceLines(group, "procedural jacket", -3.05, -0.7, outerR * 1.006, 8, makeRfMaterial("procedural jacket satin streaks", 0x2b2b27, { roughness: 0.96 }), ["jacket"], Math.max(0.0025, outerR * 0.004), 0.01);

          if (isHardline) {
            addCylinderX(group, "procedural hardline corrugated shield sleeve", -0.02, 2.45, shieldR, copperShield, ["outerShield"], { radialSegments: 128 });
            const rings = Math.max(14, Math.min(34, Math.round(od * 0.9)));
            for (let i = 0; i < rings; i += 1) {
              const x = -1.12 + (2.0 * i) / Math.max(1, rings - 1);
              addTorusRingX(group, `procedural annular corrugation ${i + 1}`, x, shieldR * 1.01, Math.max(0.006, shieldR * 0.035), i % 2 ? copperShadow : copperShield, ["outerShield"]);
            }
            addCylinderX(group, "procedural exposed hardline dielectric", 1.52, 1.85, dielectricR, dielectric, ["dielectric"], { radialSegments: 128 });
            if (/air/i.test(dielectricText)) {
              addHelix(group, "procedural PE air spacer ribbon", 0.74, 2.34, Math.max(conductorR * 1.7, dielectricR * 0.55), 3.1, 0, makeRfMaterial("procedural air spacer ribbon", 0xe8ddba, { roughness: 0.58 }), ["dielectric"], Math.max(0.006, dielectricR * 0.018), 1);
            }
          } else if (isSemiRigid) {
            addCylinderX(group, "procedural semi rigid outer tube", -0.22, 3.18, shieldR, /silver|tin/i.test(shieldText) ? braidA : copperShield, ["outerShield"], { radialSegments: 128 });
            addCylinderX(group, "procedural semi rigid tube cut rim", 1.35, 0.08, shieldR * 1.02, /silver|tin/i.test(shieldText) ? braidA : copperShield, ["outerShield"], { radialSegments: 128 });
            addCylinderX(group, "procedural exposed PTFE dielectric", 1.70, 1.65, dielectricR, dielectric, ["dielectric"], { radialSegments: 128 });
          } else {
            if (hasFoil) {
              addCylinderX(group, "procedural golden foil shield sleeve", -0.18, 1.65, Math.max(dielectricR * 1.03, shieldR * 0.93), foil, ["foil"], { radialSegments: 128, openEnded: true });
              addHelix(group, "procedural foil lap seam", -0.92, 0.62, Math.max(dielectricR * 1.045, shieldR * 0.945), 1.12, Math.PI / 7, foilSeam, ["foil"], Math.max(0.004, shieldR * 0.006), 1);
            }
            if (hasBraid) {
              addBraid(group, -0.86, 0.98, Math.max(shieldR, dielectricR * 1.10), od, braidA, braidB);
            } else {
              addCylinderX(group, "procedural shield sleeve", -0.15, 1.7, shieldR, braidA, ["outerShield"], { radialSegments: 128, openEnded: true });
            }
            addCylinderX(group, "procedural exposed dielectric core", 1.30, 2.25, dielectricR, dielectric, ["dielectric"], { radialSegments: 128 });
          }

          addSurfaceLines(group, "procedural dielectric", 0.84, 2.35, dielectricR * 1.004, 9, dielectricLine, ["dielectric"], Math.max(0.0025, dielectricR * 0.004), 0.014);
          addConductor(group, -2.85, 2.94, conductorR, conductor, conductorStrandCount(conductorText));
          return group;
        };

        const mountRoot = (root) => {
          const box = new THREE.Box3().setFromObject(root);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          root.position.sub(center);
          const rect = mount.getBoundingClientRect();
          const od = Number(c.OD) || 0;
          const targetSize = rect.width < 560
            ? (od >= 40 ? 1.35 : od >= 20 ? 1.75 : od >= 14 ? 2.1 : 2.45)
            : (od >= 40 ? 2.45 : od >= 20 ? 3.15 : od >= 14 ? 3.7 : 4.55);
          const scale = targetSize / Math.max(size.x, size.y, size.z, 0.001);
          root.scale.setScalar(scale);
          modelGroup.add(root);
          modelRootRef.current = root;
          applyLayerHighlight(activeLayerRef.current);
        };

        loader.load(
          c.model,
          (gltf) => {
            if (!alive) return;
            const root = gltf.scene;
            root.traverse((node) => {
              if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
                if (node.material) {
                  node.material = Array.isArray(node.material)
                    ? node.material.map((mat) => mat.clone())
                    : node.material.clone();
                  const materials = Array.isArray(node.material) ? node.material : [node.material];
                  const materialNames = materials.map((mat) => mat.name || "").join(" ");
                  node.userData.rfLayers = Array.from(rfLayerMaskFromName(`${node.name || ""} ${materialNames}`));
                  materials.forEach((mat) => {
                    const isFoil = /foil|duobond/i.test(`${node.name || ""} ${mat.name || ""}`);
                    if (isFoil) {
                      mat.side = THREE.DoubleSide;
                      mat.transparent = false;
                      mat.opacity = 1;
                      mat.depthWrite = true;
                      mat.roughness = Math.max(mat.roughness ?? 0.34, 0.32);
                      mat.metalness = Math.min(mat.metalness ?? 0.38, 0.42);
                    } else if (mat.transparent || mat.opacity < 1) {
                      mat.side = THREE.DoubleSide;
                      mat.depthWrite = false;
                    }
                    mat.needsUpdate = true;
                  });
                  node.userData.rfBaseMaterials = materials.map((mat) => ({
                    color: mat.color.clone(),
                    emissive: mat.emissive?.clone?.() || new THREE.Color(0x000000),
                    opacity: mat.opacity ?? 1,
                    transparent: Boolean(mat.transparent),
                    depthWrite: mat.depthWrite !== false,
                    roughness: mat.roughness ?? 0.5,
                    metalness: mat.metalness ?? 0,
                  }));
                }
              }
            });
            mountRoot(root);
            setStatus("");
          },
          undefined,
          () => {
            if (!alive) return;
            try {
              setStatus("Building procedural macro");
              const fallbackRoot = buildProceduralRfMacro();
              mountRoot(fallbackRoot);
              setStatus("");
            } catch {
              if (alive) setStatus("Procedural render unavailable");
            }
          }
        );

        const animate = () => {
          if (!alive || !renderer || !scene || !camera) return;
          renderer.render(scene, camera);
          frameId = requestAnimationFrame(animate);
        };
        animate();
      } catch {
        if (alive) setStatus("WebGL unavailable");
      }
    };

    run();

    return () => {
      alive = false;
      modelRootRef.current = null;
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect?.();
      disposables.forEach((item) => item.dispose?.());
      if (modelGroup) disposeObject(modelGroup);
      if (renderer) {
        renderer.dispose();
        renderer.domElement?.remove?.();
      }
    };
  }, [c.model, c.OD]);

  return (
    <div style={S.glbViewerStage} data-testid="rf-glb-viewer-stage">
      <div ref={mountRef} style={S.glbCanvasMount} />
      {activeLayer && (
        <div style={{ ...S.glbLayerBadge, borderColor: RF_RENDER_LAYER_META[activeLayer]?.color, color: RF_RENDER_LAYER_META[activeLayer]?.color }}>
          {RF_RENDER_LAYER_META[activeLayer]?.label}
        </div>
      )}
      {status && <div style={S.glbViewerStatus}>{status}</div>}
    </div>
  );
}

function SourceConfidenceBadge({ meta, compact = false }) {
  if (!meta) return null;
  return (
    <span
      style={{
        ...S.sourceBadge,
        ...(compact ? S.sourceBadgeCompact : {}),
        color: meta.color,
        borderColor: meta.color,
        background: `${meta.color}12`,
      }}
      title={`${meta.label}: ${meta.description}`}
    >
      {compact ? meta.label : meta.short}
    </span>
  );
}

// Slim list-item card: just the head row, taps open the detail page.
function CableCard({ id, cable: c, onOpen, onViewRender, onViewMacro, compared, isMobile = false }) {
  const { units } = useContext(SettingsContext);
  const cat = CATEGORIES[c.cat];
  const cxColor = { low: "#34d399", medium: "#fbbf24", high: "#ef4444" }[c.complexity];
  const cxLabel = { low: "Simple", medium: "Moderate", high: "Complex" }[c.complexity];
  const sourceMeta = getRfCableSourceMeta(id, c);
  const loss900 = c.atten.find(([f]) => f >= 900)?.[1];
  const lossLabel = Number.isFinite(loss900) ? `${fmt(loss900, 2)} dB/100m` : "n/a";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="hover-card"
      style={{
        ...S.cableCard,
        ...S.cableCardClickable,
        ...(compared ? S.cableCardCompared : {}),
      }}
    >
      <div style={S.cableHead}>
        <div style={S.cableIdentity}>
          <CablePreviewThumb c={c} isMobile={isMobile} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={S.cableNameRow}>
              <span style={S.cableName}>{c.name}</span>
              <span style={{ ...S.catBadge, color: cat.color, borderColor: cat.color }}>{cat.label}</span>
              <span style={{ ...S.cxBadge, background: `${cxColor}22`, color: cxColor, borderColor: cxColor }}>{cxLabel}</span>
              <SourceConfidenceBadge meta={sourceMeta} compact />
              {compared && <span style={S.compareDot} title="In compare list">●</span>}
              {onViewRender && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onViewRender(); }}
                  onKeyDown={(e) => e.stopPropagation()}
                  style={S.cableRenderBtn}
                >
                  <Sparkles size={12} />
                  <span>View Render</span>
                </button>
              )}
              {onViewMacro && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onViewMacro(); }}
                  onKeyDown={(e) => e.stopPropagation()}
                  style={{ ...S.cableRenderBtn, ...S.cableMacroBtn }}
                >
                  <Sparkles size={12} />
                  <span>Macro</span>
                </button>
              )}
            </div>
            {(c.alias || c.apps) && (
              <div style={S.cableMeta}>
                {c.alias && <span style={S.cableAliasInline}>{wrapTerms(c.alias)}</span>}
                {c.alias && c.apps && <span style={S.cableMetaSep}>·</span>}
                {c.apps && <span style={S.cableAppsInline}>{wrapTerms(c.apps)}</span>}
              </div>
            )}
            <div style={S.cableInlineStats}>
              <span style={S.cableInlineStat}><span style={S.cableInlineStatLbl}>Z</span> {c.z}&nbsp;Ω</span>
              <span style={S.cableInlineStatSep}>·</span>
              <span style={S.cableInlineStat}><span style={S.cableInlineStatLbl}>OD</span> {fmtLenCompact(c.OD, units, 2)}</span>
              <span style={S.cableInlineStatSep}>·</span>
              <span style={S.cableInlineStat}><span style={S.cableInlineStatLbl}>VP</span> {c.vp}%</span>
              <span style={S.cableInlineStatSep}>·</span>
              <span style={S.cableInlineStat}><span style={S.cableInlineStatLbl}>fmax</span> {c.fMax}&nbsp;GHz</span>
              <span style={S.cableInlineStatSep}>·</span>
              <span style={S.cableInlineStat}><span style={S.cableInlineStatLbl}>@900M</span> {lossLabel}</span>
            </div>
          </div>
        </div>
        <div style={S.cableCardActions}>
          <span style={S.cableCardOpenIcon}>›</span>
        </div>
      </div>
    </div>
  );
}

function CablePreviewThumb({ c, isMobile = false }) {
  const size = isMobile ? S.cableThumbMobile : S.cableThumbDesktop;

  if (c.render) {
    return (
      <span style={{ ...S.cableThumb, ...size }} aria-hidden="true">
        <img
          src={c.render}
          alt=""
          loading="lazy"
          decoding="async"
          style={S.cableThumbImage}
        />
        <span style={S.cableThumbFlag}>3D</span>
      </span>
    );
  }

  return (
    <span style={{ ...S.cableThumb, ...S.cableThumbFallback, ...size }} aria-hidden="true">
      <MiniCrossSection c={c} />
    </span>
  );
}

// Full detail view — takes over the page when a cable is selected.
//
// Layout: action row → hero (always visible) → tab strip → tab panel.
// Tabs: Overview · Construction · Performance · Engineering. Each tab
// owns one focused job — no more atten/material lists duplicated across
// the poster and the Full Cable Data accordion.
function CableDetailView({ id, cable: c, onBack, onDesign, onAsk, compared, toggleCompare, onPrint, onViewRender, onViewMacro }) {
  const { units } = useContext(SettingsContext);
  const cat = CATEGORIES[c.cat] || { label: c.cat, color: "#d97706" };
  const cxColor = { low: "#34d399", medium: "#fbbf24", high: "#ef4444" }[c.complexity] || "#fbbf24";
  const cxLabel = { low: "Simple", medium: "Moderate", high: "Complex" }[c.complexity] || c.complexity;
  const sourceMeta = getRfCableSourceMeta(id, c);

  const [buildStep, setBuildStep] = useState(0);
  const [selectedLayer, setSelectedLayer] = useState(null);
  const [hoveredLayer, setHoveredLayer] = useState(null);
  const [expandedStep, setExpandedStep] = useState(null);

  useEffect(() => {
    setBuildStep(0); setSelectedLayer(null); setHoveredLayer(null); setExpandedStep(null);
  }, [id]);
  useEffect(() => {
    if (buildStep < 4) {
      const t = setTimeout(() => setBuildStep(s => s + 1), 750);
      return () => clearTimeout(t);
    }
  }, [buildStep]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onBack(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onBack]);

  const replay = () => { setBuildStep(0); setSelectedLayer(null); };
  const shieldLayers = getShieldLayers(c.cons);
  const hasVisualProfile = Boolean(c.render);
  const bendMm = c.OD * 10;
  const odPrimary = units === "imperial" ? `${fmt(c.OD / MM_PER_IN, 2)} in` : `${fmt(c.OD, 1)} mm`;
  const massPrimary = units === "imperial" ? `${fmt(c.mass * 0.672, 0)} lb/1000ft` : `${fmt(c.mass, 0)} g/m`;
  const heroMetrics = [
    { icon: Gauge,       label: "Impedance", value: `${c.z} Ω`,         sub: "nominal" },
    { icon: Activity,    label: "Velocity",  value: `${c.vp}%`,         sub: "VF · % c" },
    { icon: Ruler,       label: "OD",        value: odPrimary,          sub: hasVisualProfile ? "outer jacket" : "" },
    { icon: Radio,       label: "Max freq",  value: `${c.fMax} GHz`,    sub: "catalog limit" },
    { icon: Weight,      label: "Mass",      value: massPrimary,        sub: "" },
    { icon: ShieldCheck, label: "Shield",    value: "100%",             sub: shieldLayers?.[0]?.name || "" },
  ];

  return (
    <div style={S.viewInner}>
      {/* Breadcrumb / back */}
      <div style={S.cableDetailBreadcrumb}>
        <button onClick={onBack} style={S.cableDetailBackBtn} title="Back (Esc)">
          <span style={{ fontSize: 14 }}>‹</span> Back to Library
        </button>
        <span style={S.cableDetailCrumbSep}>/</span>
        <span style={S.cableDetailCrumbCurrent}>{c.name}</span>
      </div>

      {/* Action row */}
      <div style={S.cableDetailActionRow}>
        <div style={S.cableDetailHeading}>
          <span style={{ ...S.catBadge, color: cat.color, borderColor: cat.color, fontSize: 9 }}>{cat.label}</span>
          <span style={{ ...S.cxBadge, background: `${cxColor}22`, color: cxColor, borderColor: cxColor, fontSize: 9 }}>{cxLabel}</span>
          <SourceConfidenceBadge meta={sourceMeta} />
        </div>
        <div style={S.cableDetailActions}>
          {onViewRender && (
            <button onClick={onViewRender} style={{ ...S.actionBtn, ...S.actionBtn3d }}>
              <Sparkles size={12} /> View Render
            </button>
          )}
          {onViewMacro && (
            <button onClick={onViewMacro} style={{ ...S.actionBtn, ...S.actionBtnMacro }}>
              <Sparkles size={12} /> Macro Render
            </button>
          )}
          <button onClick={onDesign} style={S.actionBtn}>→ Load into Designer</button>
          <button onClick={onAsk} style={{ ...S.actionBtn, ...S.actionBtnSecondary }}>Ask Agent about this</button>
          {toggleCompare && (
            <button
              onClick={() => toggleCompare(id)}
              style={{ ...S.actionBtn, ...(compared ? { background: "rgba(52,211,153,0.15)", color: "#34d399", borderColor: "#10b981" } : S.actionBtnSecondary) }}
            >
              {compared ? "✓ In compare" : "+ Add to compare"}
            </button>
          )}
          {onPrint && <button onClick={onPrint} style={{ ...S.actionBtn, ...S.actionBtnSecondary }}>🖨 Print / PDF</button>}
        </div>
      </div>

      {/* Hero — always visible */}
      <div style={S.cdHero}>
        <div style={S.cdHeroCopy}>
          <div style={S.libEyebrow}>◆ RF Library Profile</div>
          <h2 style={S.cdHeroTitle}>{c.name}</h2>
          {c.alias && <div style={S.cdHeroAlias}>{wrapTerms(c.alias)}</div>}
          {(c.description || c.apps) && (
            <p style={S.cdHeroDescription}>{wrapTerms(c.description || c.apps)}</p>
          )}
          <div style={{ ...S.cdSourceStrip, borderColor: `${sourceMeta.color}44` }}>
            <span style={S.cdSourceLabel}>Data source</span>
            <span style={{ ...S.cdSourceValue, color: sourceMeta.color }}>{sourceMeta.label}</span>
            <span style={S.cdSourceDetail}>{sourceMeta.sourceName} · {sourceMeta.sourceDetail}</span>
          </div>
          <div style={S.cdHeroMetrics}>
            {heroMetrics.map((m) => (
              <div key={m.label} style={S.cdHeroMetric}>
                <m.icon size={13} style={{ color: "#a8a29e" }} />
                <div>
                  <div style={S.cdHeroMetricLabel}>{m.label}</div>
                  <div style={S.cdHeroMetricValue}>{m.value}</div>
                  {m.sub && <div style={S.cdHeroMetricSub}>{m.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={S.cdHeroVisual}>
          {hasVisualProfile ? (
            <>
              <img src={c.render} alt={`${c.name} cutaway render`} style={S.cdHeroImage} />
              <div style={S.cdHeroVisualMeta}>
                <span>Blender cutaway</span>
                <span>{fmtLen(bendMm, units, 0)} bend guide</span>
              </div>
            </>
          ) : (
            <CableHeroBlueprint c={c} units={units} shieldLayers={shieldLayers} />
          )}
        </div>
      </div>

      {/* Compact profile cockpit. The page keeps the visual/interactive
          tools up front, while dense datasheet content folds away. */}
      <div style={S.cdAllSections}>
        <CableSection eyebrow="01" title="Construction snapshot" sub="Layer order + cross-section in one scan">
          <div style={S.cdConstructionGrid}>
            <div style={S.cdCompactPanel}>
              <div style={S.cdCompactPanelHead}>
                <span>Layer stack</span>
                <strong>{shieldLayers.length + 3}</strong>
              </div>
              <CableSectionLayerStack c={c} shieldLayers={shieldLayers} />
            </div>
            <div style={S.cdCompactPanel}>
              <CableConstructionInspector
                c={c}
                units={units}
                shieldLayers={shieldLayers}
                buildStep={buildStep}
                selectedLayer={selectedLayer}
                hoveredLayer={hoveredLayer}
                setSelectedLayer={setSelectedLayer}
                setHoveredLayer={setHoveredLayer}
                replay={replay}
                compact
              />
            </div>
          </div>
        </CableSection>

        <CableSection eyebrow="02" title="Live link budget" sub="TX power → cable loss → receiver margin">
          <CableSignalSection cable={c} compact />
        </CableSection>

        <div style={S.cdDisclosureGrid}>
          <CableDetailDisclosure eyebrow="03" title="Attenuation table" sub="Frequency resolved loss">
            <CableSectionAttenTable c={c} units={units} />
          </CableDetailDisclosure>
          <CableDetailDisclosure eyebrow="04" title="Engineering detail" sub="Electrical + mechanical geometry">
            <CableSectionEngineering c={c} units={units} sourceMeta={sourceMeta} />
          </CableDetailDisclosure>
          <CableDetailDisclosure eyebrow="05" title="Manufacturing process" sub="Operator-facing build notes">
            <CableSectionManufacturing c={c} expandedStep={expandedStep} setExpandedStep={setExpandedStep} />
          </CableDetailDisclosure>
          {(c.makers || (c.benefits && c.benefits.length > 0)) && (
            <CableDetailDisclosure eyebrow="06" title="Suppliers + benefits" sub="Makers and why to choose it">
              <CableSectionMakersBenefits c={c} />
            </CableDetailDisclosure>
          )}
        </div>
      </div>
    </div>
  );
}

function CableHeroBlueprint({ c, units, shieldLayers }) {
  return (
    <div style={S.cdHeroBlueprint}>
      <div style={S.cdHeroBlueprintLabel}>Cross-section blueprint</div>
      <div style={S.cdHeroBlueprintSvg}>
        <CrossSection
          d={c.d}
          D={c.D}
          shield={c.shield}
          jacket={c.OD}
          units={units}
          cons={c.cons}
          shieldLayers={shieldLayers}
          buildStep={4}
        />
      </div>
      <div style={S.cdHeroBlueprintStats}>
        <span>{fmtLen(c.d, units, 2)} core</span>
        <span>{fmtLen(c.OD, units, 2)} OD</span>
      </div>
    </div>
  );
}

// One major block on the detail scroll. Big eyebrow number + title + sub
// description, copper rule above, content below. Repeats 6–7 times so
// the user can scan the whole page top-to-bottom.
function CableSection({ eyebrow, title, sub, children }) {
  return (
    <section style={S.cdSection}>
      <header style={S.cdSectionHeader}>
        <span style={S.cdSectionEyebrow}>◆ {eyebrow}</span>
        <h3 style={S.cdSectionH}>{title}</h3>
        {sub && <p style={S.cdSectionSub}>{sub}</p>}
      </header>
      <div style={S.cdSectionContent}>{children}</div>
    </section>
  );
}

// ── Section: Layer stack (4 numbered cards) ──
function CableSectionLayerStack({ c, shieldLayers }) {
  const shieldLayer = shieldLayers?.[0];
  const layers = [
    { n: "01", name: "Outer jacket",                desc: c.cons.jacket,     color: "#57534e" },
    { n: "02", name: shieldLayer?.name || "Shield", desc: c.cons.shield,     color: shieldLayer?.color || "#f97316" },
    { n: "03", name: "Dielectric",                  desc: c.cons.dielectric, color: "#fde68a" },
    { n: "04", name: "Center conductor",            desc: c.cons.conductor,  color: "#fbbf24" },
  ];
  return (
    <div style={S.cdLayerCardGrid}>
      {layers.map((layer) => (
        <div key={layer.n} style={{ ...S.cdLayerCard, borderLeft: `3px solid ${layer.color}` }}>
          <div style={{ ...S.cdLayerCardNum, color: layer.color }}>{layer.n}</div>
          <div style={S.cdLayerCardName}>{layer.name}</div>
          <div style={S.cdLayerCardDesc}>{wrapTerms(layer.desc)}</div>
        </div>
      ))}
    </div>
  );
}

// ── Section: Attenuation full table ──
function CableSectionAttenTable({ c, units }) {
  return (
    <>
      <div style={S.cdTableWrap}>
        <table style={S.cdAttenTable}>
          <thead>
            <tr>
              <th style={S.cdAttenTh}>Frequency</th>
              {units !== "imperial" && <th style={S.cdAttenTh}>dB/100m</th>}
              {units !== "metric"   && <th style={S.cdAttenTh}>dB/100ft</th>}
              {units !== "metric"   && <th style={S.cdAttenTh}>dB/25ft</th>}
            </tr>
          </thead>
          <tbody>
            {c.atten.map(([f, a], i) => (
              <tr key={i} style={i % 2 ? S.cdAttenRowAlt : undefined}>
                <td style={S.cdAttenTd}>{f < 1000 ? `${f} MHz` : `${fmt(f / 1000, 1)} GHz`}</td>
                {units !== "imperial" && <td style={{ ...S.cdAttenTd, color: "#fbbf24" }}>{a.toFixed(2)}</td>}
                {units !== "metric"   && <td style={{ ...S.cdAttenTd, color: "#fbbf24" }}>{(a * 0.3048).toFixed(2)}</td>}
                {units !== "metric"   && <td style={{ ...S.cdAttenTd, color: "#fbbf24" }}>{(a * 0.0762).toFixed(3)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={S.cdTableFootnote}>
        25 ft ≈ 7.62 m — typical RG jumper / patch length. For arbitrary lengths: loss = (dB/100m) × (length in m / 100).
      </div>
    </>
  );
}

// ── Section: Engineering detail (electrical + mechanical, 2 columns) ──
function CableSectionEngineering({ c, units, sourceMeta }) {
  return (
    <div style={S.cdSectionGrid}>
      <div>
        <div style={S.cdSubsectionTitle}>Electrical</div>
        <div style={S.cdSpecList}>
          <SpecRow label="Impedance"   value={`${c.z} Ω`} />
          <SpecRow label="VP"          value={`${c.vp}%`} />
          <SpecRow label="Capacitance" value={fmtCap(c.cap, units, 1)} />
          <SpecRow label="Max freq"    value={`${c.fMax} GHz`} />
          <SpecRow label="Max voltage" value={`${c.vMax} V RMS`} />
          {sourceMeta && <SpecRow label="Source confidence" value={sourceMeta.label} />}
        </div>
      </div>
      <div>
        <div style={S.cdSubsectionTitle}>Mechanical</div>
        <div style={S.cdSpecList}>
          <SpecRow label="Inner conductor d" value={fmtLen(c.d, units)} />
          <SpecRow label="Dielectric D"      value={fmtLen(c.D, units)} />
          <SpecRow label="Shield OD"         value={fmtLen(c.shield, units)} />
          <SpecRow label="Jacket OD (final)" value={fmtLen(c.OD, units)} />
          <SpecRow label="Mass"              value={fmtMass(c.mass, units, 1)} />
          {sourceMeta && <SpecRow label="Source" value={sourceMeta.sourceName} />}
        </div>
      </div>
    </div>
  );
}

// ── Section: Manufacturing process steps ──
function CableSectionManufacturing({ c, expandedStep, setExpandedStep }) {
  const procSteps = c.proc || [];
  if (procSteps.length === 0) {
    return <div style={S.cdEmptyHint}>No manufacturing steps recorded for this cable.</div>;
  }
  return (
    <div style={S.cdProcList}>
      {procSteps.map((s, i) => {
        const info = explainStep(s);
        const hasInfo = !!info;
        const isOpen = expandedStep === i;
        return (
          <React.Fragment key={i}>
            <div
              style={{ ...S.cdProcStep, cursor: hasInfo ? "pointer" : "default", ...(isOpen ? { background: "rgba(217,119,6,0.06)" } : {}) }}
              onClick={() => hasInfo && setExpandedStep(isOpen ? null : i)}
            >
              <div style={S.cdProcNum}>{i + 1}</div>
              <StepIcon text={s} />
              <div style={S.cdProcText}>{wrapTerms(s)}</div>
              {hasInfo && (
                <span style={{ color: "#d97706", fontSize: 11, fontFamily: "monospace", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>▸</span>
              )}
            </div>
            {isOpen && info && (
              <div style={S.cdProcInfo}>
                <div style={S.cdProcInfoTitle}>{info.title}</div>
                {info.body}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Section: Suppliers + key benefits ──
function CableSectionMakersBenefits({ c }) {
  const benefits = c.benefits || [];
  return (
    <div style={S.cdSectionGrid}>
      {c.makers && (
        <div>
          <div style={S.cdSubsectionTitle}>Typical makers</div>
          <div style={S.cdSuppliers}>{wrapTerms(c.makers)}</div>
        </div>
      )}
      {benefits.length > 0 && (
        <div>
          <div style={S.cdSubsectionTitle}>Key benefits</div>
          <ul style={S.cdBenefitList}>
            {benefits.map((b) => (
              <li key={b} style={S.cdBenefitItem}>
                <span style={S.cdBenefitBullet}>◆</span>
                <span>{wrapTerms(b)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────
function CableTabOverview({ c, shieldLayers }) {
  const shieldLayer = shieldLayers?.[0];
  const layers = [
    { n: "01", name: "Outer jacket",                desc: c.cons.jacket,     color: "#57534e" },
    { n: "02", name: shieldLayer?.name || "Shield", desc: c.cons.shield,     color: shieldLayer?.color || "#f97316" },
    { n: "03", name: "Dielectric",                  desc: c.cons.dielectric, color: "#fde68a" },
    { n: "04", name: "Center conductor",            desc: c.cons.conductor,  color: "#fbbf24" },
  ];
  const summaryFreqs = c.atten.slice(0, 6);
  const benefits = c.benefits || [];

  return (
    <div style={S.cdSectionGrid}>
      <div>
        <div style={S.cdSectionTitle}>Layer stack</div>
        <div style={S.cdLayerList}>
          {layers.map((layer) => (
            <div key={layer.n} style={S.cdLayer}>
              <div style={{ ...S.cdLayerNum, borderColor: layer.color, color: layer.color }}>{layer.n}</div>
              <div style={{ minWidth: 0 }}>
                <div style={S.cdLayerName}>{layer.name}</div>
                <div style={S.cdLayerDesc}>{wrapTerms(layer.desc)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={S.cdSectionTitle}>Typical attenuation</div>
        <div style={S.cdAttenGrid}>
          {summaryFreqs.map(([freq, loss]) => (
            <div key={freq} style={S.cdAttenCell}>
              <div style={S.cdAttenFreq}>{freq < 1000 ? `${freq} MHz` : `${fmt(freq / 1000, 1)} GHz`}</div>
              <div style={S.cdAttenLoss}>{fmt(loss, 2)} <span style={S.cdAttenUnit}>dB/100m</span></div>
              <div style={S.cdAttenSub}>{fmt(loss * 0.3048, 2)} dB/100ft</div>
            </div>
          ))}
        </div>
        {benefits.length > 0 && (
          <>
            <div style={{ ...S.cdSectionTitle, marginTop: 22 }}>Key benefits</div>
            <ul style={S.cdBenefitList}>
              {benefits.map((b) => (
                <li key={b} style={S.cdBenefitItem}>
                  <span style={S.cdBenefitBullet}>◆</span>
                  <span>{wrapTerms(b)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// ── Tab: Performance ─────────────────────────────────────────
function CableTabPerformance({ c, units }) {
  return (
    <div style={S.cdSectionStack}>
      <div>
        <div style={S.cdSectionTitle}>Signal flow simulator</div>
        <CableSignalSection cable={c} />
      </div>
      <div>
        <div style={S.cdSectionTitle}>Full attenuation table</div>
        <div style={S.cdTableWrap}>
          <table style={S.cdAttenTable}>
            <thead>
              <tr>
                <th style={S.cdAttenTh}>Frequency</th>
                {units !== "imperial" && <th style={S.cdAttenTh}>dB/100m</th>}
                {units !== "metric"   && <th style={S.cdAttenTh}>dB/100ft</th>}
                {units !== "metric"   && <th style={S.cdAttenTh}>dB/25ft</th>}
              </tr>
            </thead>
            <tbody>
              {c.atten.map(([f, a], i) => (
                <tr key={i} style={i % 2 ? S.cdAttenRowAlt : undefined}>
                  <td style={S.cdAttenTd}>{f < 1000 ? `${f} MHz` : `${fmt(f / 1000, 1)} GHz`}</td>
                  {units !== "imperial" && <td style={{ ...S.cdAttenTd, color: "#fbbf24" }}>{a.toFixed(2)}</td>}
                  {units !== "metric"   && <td style={{ ...S.cdAttenTd, color: "#fbbf24" }}>{(a * 0.3048).toFixed(2)}</td>}
                  {units !== "metric"   && <td style={{ ...S.cdAttenTd, color: "#fbbf24" }}>{(a * 0.0762).toFixed(3)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={S.cdTableFootnote}>
          25 ft ≈ 7.62 m — typical RG jumper / patch length. For arbitrary lengths: loss = (dB/100m) × (length in m / 100).
        </div>
      </div>
    </div>
  );
}

// ── Tab: Engineering ─────────────────────────────────────────
function CableTabEngineering({ c, units, expandedStep, setExpandedStep }) {
  const procSteps = c.proc || [];
  return (
    <div style={S.cdSectionGrid}>
      <div>
        <div style={S.cdSectionTitle}>Electrical detail</div>
        <div style={S.cdSpecList}>
          <SpecRow label="Capacitance"  value={fmtCap(c.cap, units, 1)} />
          <SpecRow label="Max voltage"  value={`${c.vMax} V RMS`} />
        </div>

        <div style={{ ...S.cdSectionTitle, marginTop: 22 }}>Mechanical detail</div>
        <div style={S.cdSpecList}>
          <SpecRow label="Inner conductor d"   value={fmtLen(c.d, units)} />
          <SpecRow label="Dielectric D"        value={fmtLen(c.D, units)} />
          <SpecRow label="Shield OD"           value={fmtLen(c.shield, units)} />
          <SpecRow label="Jacket OD (Final D)" value={fmtLen(c.OD, units)} />
        </div>

        {c.makers && (
          <>
            <div style={{ ...S.cdSectionTitle, marginTop: 22 }}>Suppliers</div>
            <div style={S.cdSuppliers}>{wrapTerms(c.makers)}</div>
          </>
        )}
      </div>

      <div>
        <div style={S.cdSectionTitle}>Manufacturing process</div>
        <div style={S.cdProcList}>
          {procSteps.map((s, i) => {
            const info = explainStep(s);
            const hasInfo = !!info;
            const isOpen = expandedStep === i;
            return (
              <React.Fragment key={i}>
                <div
                  style={{ ...S.cdProcStep, cursor: hasInfo ? "pointer" : "default", ...(isOpen ? { background: "rgba(217,119,6,0.06)" } : {}) }}
                  onClick={() => hasInfo && setExpandedStep(isOpen ? null : i)}
                >
                  <div style={S.cdProcNum}>{i + 1}</div>
                  <StepIcon text={s} />
                  <div style={S.cdProcText}>{wrapTerms(s)}</div>
                  {hasInfo && (
                    <span style={{ color: "#d97706", fontSize: 11, fontFamily: "monospace", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>▸</span>
                  )}
                </div>
                {isOpen && info && (
                  <div style={S.cdProcInfo}>
                    <div style={S.cdProcInfoTitle}>{info.title}</div>
                    {info.body}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SpecRow({ label, value }) {
  return (
    <div style={S.cdSpecRow}>
      <span style={S.cdSpecLabel}>{label}</span>
      <span style={S.cdSpecValue}>{value}</span>
    </div>
  );
}

function LibraryDisclosure({ eyebrow, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={S.libraryDisclosure}>
      <button type="button" onClick={() => setOpen(v => !v)} style={S.libraryDisclosureHead}>
        <span>
          <span style={S.libraryDisclosureEyebrow}>{eyebrow}</span>
          <span style={S.libraryDisclosureTitle}>{title}</span>
        </span>
        <ChevronDown size={15} style={{ color: "#d97706", transition: "transform 0.18s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && <div style={S.libraryDisclosureBody}>{children}</div>}
    </section>
  );
}

function CableConstructionInspector({ c, units, shieldLayers, buildStep, selectedLayer, hoveredLayer, setSelectedLayer, setHoveredLayer, replay, framed = false, compact = false }) {
  return (
    <div style={framed ? S.sectionFrame : compact ? S.cdInspectorCompact : undefined}>
      <div style={compact ? S.cdInspectorHeadCompact : { display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 8 }}>
        <div style={compact ? S.cdCompactPanelHeadLabel : { fontSize: 10, letterSpacing: 2, color: "#a8a29e", textTransform: "uppercase" }}>Cross-section · layer inspector</div>
        <button onClick={replay} style={compact ? S.cdReplayBtnCompact : { background: "rgba(217,119,6,0.15)", color: "#fbbf24", border: "1px solid #d97706", padding: "3px 10px", fontSize: 9, letterSpacing: 1, cursor: "pointer", borderRadius: 3, textTransform: "uppercase", fontWeight: 600 }}>↻ Replay build</button>
      </div>
      <div style={compact ? S.cdInspectorBodyCompact : { display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
        <CrossSection d={c.d} D={c.D} shield={c.shield} jacket={c.OD} units={units} cons={c.cons} shieldLayers={shieldLayers} buildStep={buildStep} selectedLayer={selectedLayer} hoveredLayer={hoveredLayer} onLayerClick={setSelectedLayer} onLayerHover={setHoveredLayer} />
        {selectedLayer && <LayerDetailPanel layer={selectedLayer} c={c} onClose={() => setSelectedLayer(null)} units={units} />}
      </div>
    </div>
  );
}

function CableSignalSection({ cable, framed = false, compact = false }) {
  return (
    <div style={framed ? S.sectionFrame : undefined}>
      {!compact && <div style={{ textAlign: "center", fontSize: 10, letterSpacing: 2, color: "#a8a29e", marginBottom: 10, textTransform: "uppercase" }}>Signal flow · live link-budget simulator</div>}
      <SignalFlow cable={cable} compact={compact} />
    </div>
  );
}

function CableEngineeringDetails({ c, units, shieldLayers, expandedStep, setExpandedStep }) {
  return (
    <div style={S.detailsGrid}>
      <div>
        <DS title="Electrical">
          <DR label="Impedance" v={`${c.z} Ω`} />
          <DR label="VP" v={`${c.vp}%`} />
          <DR label="Capacitance" v={fmtCap(c.cap, units, 1)} />
          <DR label="Max freq" v={`${c.fMax} GHz`} />
          <DR label="Max voltage" v={`${c.vMax} V RMS`} />
        </DS>
        <DS title="Mechanical">
          <DR label="Inner d" v={fmtLen(c.d, units)} />
          <DR label="Dielectric D" v={fmtLen(c.D, units)} />
          <DR label="Shield OD" v={fmtLen(c.shield, units)} />
          <DR label="Jacket OD" v={fmtLen(c.OD, units)} />
          <DR label="Mass" v={fmtMass(c.mass, units, 1)} />
        </DS>
        <DS title="Attenuation">
          <table style={S.attenTable}>
            <thead>
              <tr>
                <th style={S.attenTh}>Freq</th>
                {units !== "imperial" && <th style={S.attenTh}>dB/100m</th>}
                {units !== "metric" && <th style={S.attenTh}>dB/100ft</th>}
                {units !== "metric" && <th style={S.attenTh}>dB/25ft</th>}
              </tr>
            </thead>
            <tbody>
              {c.atten.map(([f, a], i) => (
                <tr key={i}>
                  <td style={S.attenTd}>{f < 1000 ? `${f} MHz` : `${(f / 1000).toFixed(1)} GHz`}</td>
                  {units !== "imperial" && <td style={{ ...S.attenTd, color: "#fbbf24" }}>{a.toFixed(2)}</td>}
                  {units !== "metric" && <td style={{ ...S.attenTd, color: "#fbbf24" }}>{(a * 0.3048).toFixed(2)}</td>}
                  {units !== "metric" && <td style={{ ...S.attenTd, color: "#fbbf24" }}>{(a * 0.0762).toFixed(3)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 9, color: "#78716c", marginTop: 6, lineHeight: 1.5 }}>25 ft ≈ 7.62 m — typical RG jumper / patch length. For arbitrary lengths: loss = (dB/100m) × (length in m / 100).</div>
        </DS>
      </div>
      <div>
        <DS title="Materials & Layers">
          <Layer n="1" name="Inner Conductor" color="#fbbf24" desc={c.cons.conductor} />
          <Layer n="2" name="Dielectric" color="#fde68a" desc={c.cons.dielectric} />
          {shieldLayers.map((layer, i) => (
            <Layer key={layer.key} n={`3.${i + 1}`} name={layer.name} color={layer.color} desc={layer.desc} />
          ))}
          <Layer n="4" name="Jacket" color="#57534e" desc={c.cons.jacket} />
        </DS>
        <DS title="Manufacturing Process">
          {c.proc.map((s, i) => {
            const info = explainStep(s);
            const hasInfo = !!info;
            const isOpen = expandedStep === i;
            return (
              <React.Fragment key={i}>
                <div style={{ ...S.procStep, cursor: hasInfo ? "pointer" : "default", ...(isOpen ? { background: "rgba(217,119,6,0.05)" } : {}) }} onClick={() => hasInfo && setExpandedStep(isOpen ? null : i)}>
                  <div style={S.procNum}>{i + 1}</div>
                  <StepIcon text={s} />
                  <div style={{ ...S.procText, flex: 1 }}>{wrapTerms(s)}</div>
                  {hasInfo && <span style={{ color: "#d97706", fontSize: 11, fontFamily: "monospace", transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "none", userSelect: "none" }}>▸</span>}
                </div>
                {isOpen && info && (
                  <div style={{ background: "rgba(217,119,6,0.06)", padding: "10px 14px 12px", margin: "0 0 6px 26px", borderLeft: "2px solid #d97706", fontSize: 10, lineHeight: 1.6, color: "#d6cfc4" }}>
                    <div style={{ fontWeight: 700, color: "#fbbf24", marginBottom: 5, letterSpacing: 0.3, fontSize: 10.5 }}>{info.title}</div>
                    {info.body}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </DS>
        <DS title="Suppliers"><DR label="Typical makers" v={wrapTerms(c.makers)} /></DS>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FREQUENCY SWEEP CHART (log-log loss plot)
// ═══════════════════════════════════════════════════════════════
const COMPARE_COLORS = ["#fbbf24", "#34d399", "#60a5fa", "#c084fc", "#f97316", "#ec4899"];

function FreqSweep({ cables, height = 340 }) {
  if (!cables || cables.length === 0) return null;
  const W = 720, H = height;
  const padL = 54, padR = 16, padT = 20, padB = 44;
  const fMin = 10, fMax = 70000;  // 10 MHz → 70 GHz
  const lMin = 0.1, lMax = 1000;  // dB/100m
  const xf = (f) => padL + (Math.log10(f) - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin)) * (W - padL - padR);
  const yl = (l) => padT + (1 - (Math.log10(l) - Math.log10(lMin)) / (Math.log10(lMax) - Math.log10(lMin))) * (H - padT - padB);

  const fTicks = [10, 30, 100, 300, 1000, 3000, 10000, 30000, 70000];
  const lTicks = [0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000];
  const fmtFreq = (f) => f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 0)} GHz` : `${f} MHz`;

  const pathForCable = (c) => {
    if (!c?.atten || c.atten.length === 0) return "";
    const pts = c.atten.filter(([f]) => f >= fMin && f <= fMax);
    if (pts.length === 0) return "";
    // Dense interpolation for smooth curve
    const all = [];
    const fFirst = Math.max(fMin, pts[0][0]);
    const fLast = Math.min(fMax, pts[pts.length - 1][0]);
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const f = Math.pow(10, Math.log10(fFirst) + i / steps * (Math.log10(fLast) - Math.log10(fFirst)));
      const l = interpAtten(pts, f);
      if (l >= lMin && l <= lMax) all.push([f, l]);
    }
    return all.map(([f, l], i) => `${i === 0 ? "M" : "L"} ${xf(f).toFixed(1)} ${yl(l).toFixed(1)}`).join(" ");
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", background: "rgba(15,10,5,0.45)", borderRadius: 4 }}>
      {lTicks.map((l, i) => (
        <g key={`ly${i}`}>
          <line x1={padL} y1={yl(l)} x2={W - padR} y2={yl(l)} stroke="#2a1f15" strokeWidth="0.5" strokeDasharray={l === 1 || l === 10 || l === 100 ? "" : "2,3"} />
          <text x={padL - 6} y={yl(l) + 3} fontSize="9" fill="#78716c" textAnchor="end" fontFamily="JetBrains Mono, monospace">{l}</text>
        </g>
      ))}
      {fTicks.map((f, i) => (
        <g key={`fx${i}`}>
          <line x1={xf(f)} y1={padT} x2={xf(f)} y2={H - padB} stroke="#2a1f15" strokeWidth="0.5" strokeDasharray="2,3" />
          <text x={xf(f)} y={H - padB + 13} fontSize="8.5" fill="#78716c" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{fmtFreq(f)}</text>
        </g>
      ))}
      <text x={padL - 42} y={padT + (H - padT - padB) / 2} fontSize="9" fill="#a8a29e" textAnchor="middle" transform={`rotate(-90, ${padL - 42}, ${padT + (H - padT - padB) / 2})`} letterSpacing="1">Loss (dB/100m)</text>
      <text x={padL + (W - padL - padR) / 2} y={H - 6} fontSize="9" fill="#a8a29e" textAnchor="middle" letterSpacing="1">Frequency</text>

      {cables.map((c, i) => {
        const color = COMPARE_COLORS[i % COMPARE_COLORS.length];
        const d = pathForCable(c);
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
            {(c.atten || []).filter(([f]) => f >= fMin && f <= fMax).map(([f, l], j) => (
              l >= lMin && l <= lMax ? <circle key={j} cx={xf(f)} cy={yl(l)} r="2.5" fill={color} stroke="#0a0705" strokeWidth="0.5" /> : null
            ))}
          </g>
        );
      })}

      <g transform={`translate(${padL + 8}, ${padT + 8})`}>
        {cables.map((c, i) => (
          <g key={i} transform={`translate(0, ${i * 14})`}>
            <line x1={0} y1={5} x2={14} y2={5} stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]} strokeWidth="2.5" />
            <text x={18} y={8} fontSize="9.5" fill="#e7e5e4" fontFamily="JetBrains Mono, monospace" fontWeight="600">{c.name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPARE VIEW (side-by-side)
// ═══════════════════════════════════════════════════════════════
function CompareView({ comparedCables, setComparedCables, openInLibrary }) {
  const { units } = useContext(SettingsContext);
  const cables = comparedCables.map(id => ({ id, ...CABLES[id] })).filter(x => x.name);
  const remove = (id) => setComparedCables(prev => prev.filter(x => x !== id));

  if (cables.length === 0) {
    return (
      <div style={S.viewInner}>
        <div style={S.viewIntro}>
          <strong style={S.viewIntroStrong}>Compare mode.</strong> Add cables from the Library tab (each cable card has a "+ Add to compare" button when expanded). Up to 4 cables at once.
        </div>
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#78716c" }}>
          <div style={{ fontSize: 48, marginBottom: 10, opacity: 0.3 }}>⚖️</div>
          <div style={{ fontSize: 13, color: "#a8a29e" }}>No cables pinned for compare yet.</div>
          <div style={{ fontSize: 11, marginTop: 8 }}>Go to Library → expand a cable → click "+ Add to compare"</div>
        </div>
      </div>
    );
  }

  const rows = [
    { label: "Impedance", fn: c => `${c.z} Ω` },
    { label: "Velocity factor", fn: c => `${c.vp}%` },
    { label: "Capacitance", fn: c => fmtCap(c.cap, units, 1) },
    { label: "Max frequency", fn: c => `${c.fMax} GHz` },
    { label: "Max voltage", fn: c => `${c.vMax} V RMS` },
    { label: "Inner conductor d", fn: c => fmtLen(c.d, units) },
    { label: "Dielectric OD", fn: c => fmtLen(c.D, units) },
    { label: "Shield OD", fn: c => fmtLen(c.shield, units) },
    { label: "Jacket OD", fn: c => fmtLen(c.OD, units) },
    { label: "Mass", fn: c => fmtMass(c.mass, units, 1) },
    { label: "Flexibility", fn: c => c.flex },
    { label: "Outdoor-rated", fn: c => c.outdoor ? "✓ Yes" : "— No" },
    { label: "Power class", fn: c => c.power },
    { label: "Complexity", fn: c => c.complexity },
  ];

  const keyFreqs = [100, 900, 2400, 5800];
  keyFreqs.forEach(f => {
    rows.push({ label: `Loss @ ${f < 1000 ? `${f} MHz` : `${(f / 1000).toFixed(1)} GHz`}`, fn: c => {
      const a = interpAtten(c.atten, f);
      return a && f <= c.fMax * 1000 ? fmtLoss(a, units, 2) : "— (above fMax)";
    }});
  });

  rows.push({ label: "Conductor", fn: c => c.cons.conductor });
  rows.push({ label: "Dielectric", fn: c => c.cons.dielectric });
  rows.push({ label: "Shield", fn: c => c.cons.shield });
  rows.push({ label: "Jacket", fn: c => c.cons.jacket });
  rows.push({ label: "Applications", fn: c => c.apps });
  rows.push({ label: "Makers", fn: c => c.makers });

  return (
    <div style={S.viewInner}>
      <div style={{ ...S.viewIntro, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <strong style={S.viewIntroStrong}>Compare mode.</strong> {cables.length} of 4 cables pinned. Shows specs table + cross-sections + loss curves side-by-side.
        </div>
        <button onClick={() => setComparedCables([])} style={{ background: "transparent", color: "#a8a29e", border: "1px solid #57534e", padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3, letterSpacing: 1, textTransform: "uppercase" }}>Clear all</button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {cables.map((c, i) => {
          const color = COMPARE_COLORS[i % COMPARE_COLORS.length];
          const cat = CATEGORIES[c.cat];
          return (
            <div key={c.id} style={{ flex: "1 1 200px", minWidth: 200, padding: 12, background: "rgba(15,10,5,0.4)", border: `1px solid ${color}55`, borderRadius: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                  <button onClick={() => openInLibrary(c.id)} style={{ background: "transparent", border: "none", color: "#fbbf24", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0, textAlign: "left" }}>{c.name}</button>
                </div>
                <button onClick={() => remove(c.id)} style={{ background: "none", border: "none", color: "#a8a29e", cursor: "pointer", fontSize: 14, padding: 0 }}>✕</button>
              </div>
              <div style={{ fontSize: 9, color: cat.color, marginBottom: 6, letterSpacing: 0.5 }}>{cat.label}</div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <svg width={120} height={120} viewBox="0 0 120 120">
                  <circle cx={60} cy={60} r={(c.OD / 2) * (50 / (c.OD / 2))} fill="#0a0705" stroke="#2a1f15" strokeWidth="1" />
                  <circle cx={60} cy={60} r={(c.shield / c.OD) * 50} fill="#4b5563" />
                  <circle cx={60} cy={60} r={(c.D / c.OD) * 50} fill="rgba(255,250,235,0.12)" />
                  <circle cx={60} cy={60} r={(c.d / c.OD) * 50} fill="#b45309" />
                </svg>
              </div>
              <div style={{ fontSize: 9.5, color: "#a8a29e", textAlign: "center", marginTop: 4, fontFamily: "JetBrains Mono, monospace" }}>{c.z}Ω · {fmtLen(c.OD, "metric")} OD</div>
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 6, textAlign: "center" }}>Attenuation curves · log-log</div>
        <FreqSweep cables={cables} />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
          <thead>
            <tr>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "#a8a29e", borderBottom: "1px solid #2a1f15", fontSize: 10, letterSpacing: 1 }}>PROPERTY</th>
              {cables.map((c, i) => (
                <th key={c.id} style={{ padding: "8px 10px", textAlign: "left", color: COMPARE_COLORS[i % COMPARE_COLORS.length], borderBottom: "1px solid #2a1f15", fontSize: 10.5, letterSpacing: 0.5, minWidth: 130 }}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "rgba(15,10,5,0.25)" : "transparent" }}>
                <td style={{ padding: "6px 10px", color: "#78716c", fontSize: 10 }}>{r.label}</td>
                {cables.map(c => (
                  <td key={c.id} style={{ padding: "6px 10px", color: "#d6cfc4", fontSize: 10.5 }}>{r.fn(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RECOMMENDATION WIZARD
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// RF CHEAT SHEET
// ═══════════════════════════════════════════════════════════════
const CHEAT_CATEGORIES = {
  impedance: { label: "Impedance & Geometry", color: "#fbbf24", icon: "Z" },
  loss:      { label: "Loss & Attenuation",   color: "#f97316", icon: "α" },
  vswr:      { label: "VSWR & Reflection",    color: "#ef4444", icon: "Γ" },
  path:      { label: "Path Loss & Antenna",  color: "#60a5fa", icon: "⟶" },
  noise:     { label: "Noise & Sensitivity",  color: "#34d399", icon: "N" },
  distortion: { label: "Distortion (IP3 etc)", color: "#c084fc", icon: "3f" },
  matching:  { label: "Matching Networks",    color: "#d97706", icon: "L-C" },
  units:     { label: "Unit Conversions",     color: "#a8a29e", icon: "=" },
};

const FORMULAS = [
  // IMPEDANCE
  { cat: "impedance", name: "Coax characteristic impedance", f: "Z₀ = (138 / √εr) · log₁₀(D/d)", vars: "D = dielectric OD (mm), d = inner conductor OD (mm), εr = dielectric constant", ex: "D=2.95, d=0.91, εr=2.3 → Z₀ = 50.0 Ω", units: "Ω" },
  { cat: "impedance", name: "Coax cutoff frequency", f: "fc = 1 / [π · (D + d) · √εr] · c", vars: "c = 3·10⁸ m/s. Below fc, coax is single-mode (TEM only).", ex: "D=7.24mm, d=2.17mm → fc ≈ 11.3 GHz for PE dielectric", units: "GHz" },
  { cat: "impedance", name: "Velocity of propagation (VP)", f: "VP = 1 / √εr × 100%", vars: "εr = relative dielectric constant. Air εr=1 (VP=100%), solid PE εr=2.3 (VP=66%), foam PE εr=1.45 (VP=83%).", ex: "PTFE εr=2.1 → VP = 69%", units: "%" },
  { cat: "impedance", name: "Capacitance per length", f: "C = 2π·εr·ε₀ / ln(D/d)", vars: "ε₀ = 8.854·10⁻¹² F/m. Standard 50Ω coax: ~100 pF/m solid PE, ~80 pF/m foam PE.", ex: "RG-58: 101 pF/m", units: "pF/m" },
  { cat: "impedance", name: "Inductance per length", f: "L = (μ₀ / 2π) · ln(D/d)", vars: "μ₀ = 4π·10⁻⁷ H/m. For 50Ω coax, L ≈ 250 nH/m.", ex: "RG-213: ~260 nH/m", units: "nH/m" },

  // LOSS
  { cat: "loss", name: "Total cable loss", f: "L_total = α(f) · length / 100", vars: "α(f) in dB/100m at operating frequency, length in meters. Loss scales with √f for conductor, with f for dielectric.", ex: "LMR-400 @ 2.4 GHz = 12.6 dB/100m · 20 m / 100 = 2.52 dB", units: "dB" },
  { cat: "loss", name: "Loss frequency scaling (approx)", f: "α(f) ≈ α(f₀) · √(f/f₀)", vars: "Approximation for conductor-loss dominated region. At high freq, dielectric loss adds linear term.", ex: "RG-58: 14 dB/100m @ 100 MHz → ~48 dB/100m @ 1 GHz (√10 ≈ 3.16)", units: "dB/100m" },
  { cat: "loss", name: "dB ↔ ratio", f: "dB = 10 · log₁₀(P_out/P_in)", vars: "+3 dB = 2× power, +10 dB = 10×, +20 dB = 100×. Voltage: ×√2 = +3 dB.", ex: "Loss 6 dB = output is 25% of input (−6 dB in power)", units: "dB" },
  { cat: "loss", name: "Power kept after loss", f: "P_out / P_in = 10^(−L/10)", vars: "L in dB. 1 dB loss → 79% of input, 3 dB → 50%, 10 dB → 10%, 30 dB → 0.1%.", ex: "Cable eats 5 dB → 31.6% of TX power reaches RX", units: "ratio" },

  // VSWR
  { cat: "vswr", name: "Reflection coefficient Γ", f: "Γ = (Z_L − Z₀) / (Z_L + Z₀)", vars: "Z_L = load impedance, Z₀ = line impedance (50 or 75 Ω). |Γ|=0 → perfect match; |Γ|=1 → total reflection.", ex: "Z_L=75, Z₀=50 → Γ = 0.20", units: "unitless" },
  { cat: "vswr", name: "VSWR from Γ", f: "VSWR = (1 + |Γ|) / (1 − |Γ|)", vars: "VSWR=1 is perfect, typical spec <1.5. VSWR=2 means 11% reflected.", ex: "|Γ|=0.2 → VSWR = 1.5", units: "unitless" },
  { cat: "vswr", name: "Return loss", f: "RL = −20 · log₁₀(|Γ|)", vars: "Higher dB = better match. RL > 15 dB good, > 20 dB excellent.", ex: "|Γ|=0.1 → RL = 20 dB (VSWR = 1.22)", units: "dB" },
  { cat: "vswr", name: "Mismatch loss", f: "ML = −10 · log₁₀(1 − |Γ|²)", vars: "Power reflected back to source (not delivered to load). Separate from conductor/dielectric loss.", ex: "VSWR=2 → |Γ|=0.33 → ML = 0.51 dB", units: "dB" },
  { cat: "vswr", name: "VSWR → Γ (inverse)", f: "|Γ| = (VSWR − 1) / (VSWR + 1)", vars: "For converting spec back to reflection magnitude.", ex: "VSWR=1.5 → |Γ| = 0.20", units: "unitless" },

  // PATH LOSS
  { cat: "path", name: "Free-space path loss (Friis)", f: "FSPL = 32.45 + 20·log(f_MHz) + 20·log(d_km)", vars: "Each 2× distance → +6 dB. Each 2× frequency → +6 dB. Assumes clear LoS.", ex: "2.4 GHz, 1 km → FSPL = 100 dB", units: "dB" },
  { cat: "path", name: "EIRP (effective radiated power)", f: "EIRP = Pt + Gt − Lt", vars: "Pt = TX power (dBm), Gt = antenna gain (dBi), Lt = TX cable+connector loss (dB).", ex: "30 dBm TX + 15 dBi antenna − 2 dB cable = 43 dBm EIRP = 20 W ERP", units: "dBm" },
  { cat: "path", name: "Received power", f: "Pr = EIRP − FSPL + Gr − Lr", vars: "Gr = RX antenna gain, Lr = RX cable loss. Margin = Pr − RX sensitivity.", ex: "EIRP 43 dBm − 100 FSPL + 15 dBi − 1 dB = −43 dBm", units: "dBm" },
  { cat: "path", name: "Fresnel zone 1 radius", f: "F₁ = 17.3 · √(d₁·d₂ / [f · (d₁+d₂)])", vars: "d₁, d₂ in km from each end, f in GHz. Clear 60% of F₁ along path for near-FSPL performance.", ex: "1 km path, 2.4 GHz, midpoint → F₁ = 5.6 m", units: "m" },
  { cat: "path", name: "Antenna gain (dipole ↔ isotropic)", f: "G_dBi = G_dBd + 2.15", vars: "Reference antenna: isotropic (dBi) vs half-wave dipole (dBd). Always check which is used.", ex: "Yagi 10 dBd = 12.15 dBi", units: "dB" },

  // NOISE
  { cat: "noise", name: "Thermal noise power", f: "P_n = k·T·B = −174 + 10·log(B) [dBm/Hz → dBm]", vars: "k = 1.38·10⁻²³ J/K, T = 290 K (room). −174 dBm/Hz at 290 K. Add 10·log(bandwidth in Hz).", ex: "1 MHz BW → −174 + 60 = −114 dBm noise floor", units: "dBm" },
  { cat: "noise", name: "Noise factor F (linear)", f: "F = 1 + Te/290", vars: "Te = equivalent noise temperature (K). NF_dB = 10·log(F).", ex: "F = 1.26 → NF = 1 dB", units: "unitless" },
  { cat: "noise", name: "Friis cascaded noise factor", f: "F_total = F₁ + (F₂−1)/G₁ + (F₃−1)/(G₁G₂) + ...", vars: "First stage dominates. High-G low-NF LNA first = best. Cable BEFORE LNA = NF hit equals cable loss.", ex: "3dB cable before 1dB NF LNA = total NF ≈ 4 dB", units: "unitless" },
  { cat: "noise", name: "MDS / receiver sensitivity", f: "MDS = kTB + NF + SNR_required", vars: "Minimum detectable signal. Typical WiFi: −174 + 10·log(20MHz) + 10 + 10 ≈ −81 dBm.", ex: "2 MHz BW, 4 dB NF, 10 dB SNR → −174 + 63 + 4 + 10 = −97 dBm", units: "dBm" },

  // DISTORTION
  { cat: "distortion", name: "Output vs input IP3", f: "OIP3 = IIP3 + Gain", vars: "OIP3, IIP3, and Gain all in dB/dBm. Specifying OIP3 is conventional for PA; IIP3 for LNA/mixer.", ex: "IIP3 = 15 dBm + Gain 20 dB → OIP3 = 35 dBm", units: "dBm" },
  { cat: "distortion", name: "IM3 output power", f: "P_IM3 = 3·Pout − 2·OIP3", vars: "IM3 grows 3× fundamental. If Pout rises 1 dB, IM3 rises 3 dB → spacing shrinks 2 dB per dB of input.", ex: "Pout=0 dBm, OIP3=30 → P_IM3 = −60 dBm (60 dBc below fund)", units: "dBm" },
  { cat: "distortion", name: "P1dB rule of thumb", f: "P1dB ≈ OIP3 − 10 to 15 dB", vars: "Rough relationship — real amplifiers vary. P1dB is where gain drops 1 dB from linear.", ex: "OIP3=30 dBm → P1dB ≈ 15-20 dBm", units: "dBm" },
  { cat: "distortion", name: "Cascaded IIP3 (linear)", f: "1/IIP3_total = Σ Gcum_i / IIP3_i", vars: "Convert IIP3 to linear (mW): IIP3_lin = 10^((IIP3−30)/10). Last stages hurt most if high-gain chain.", ex: "Final mixer with 0 dBm IIP3 after 30 dB gain = system IIP3 ≈ −30 dBm", units: "linear" },
  { cat: "distortion", name: "Intermod product frequencies", f: "IM3: 2f₁−f₂ and 2f₂−f₁. IM5: 3f₁−2f₂, etc.", vars: "Close-in spurs around the two carriers. In-band IM products corrupt the channel you want.", ex: "f₁=1000, f₂=1010 MHz → IM3 at 990 + 1020 MHz", units: "Hz" },

  // MATCHING
  { cat: "matching", name: "L-network Q factor", f: "Q = √(R_high/R_low − 1)", vars: "R_high = larger resistance side, R_low = smaller. Q determines bandwidth (narrower = higher Q).", ex: "50 ↔ 100 Ω: Q = 1. 50 ↔ 1000 Ω: Q = 4.4", units: "unitless" },
  { cat: "matching", name: "L-network series reactance", f: "X_series = Q · R_low", vars: "Place in series with R_low side. Sign determines L or C: +X → inductor, −X → capacitor.", ex: "Q=1, R_low=50 → |X_series| = 50 Ω. At 1 GHz → L = 8 nH or C = 3.2 pF", units: "Ω" },
  { cat: "matching", name: "L-network shunt reactance", f: "X_shunt = R_high / Q", vars: "Place in parallel on R_high side. Opposite sign to X_series for matching.", ex: "Q=1, R_high=100 → |X_shunt| = 100 Ω → L=16 nH or C=1.6 pF @ 1 GHz", units: "Ω" },
  { cat: "matching", name: "Component values from reactance", f: "L = X/(2πf), C = 1/(2πf·X)", vars: "f in Hz. X in Ω. Quick form at 1 GHz: L(nH) = X/6.28, C(pF) = 159/X.", ex: "X=50 Ω @ 2 GHz → L = 4 nH or C = 1.6 pF", units: "H or F" },
  { cat: "matching", name: "Skin depth", f: "δ = 1 / √(π · f · μ₀ · σ)", vars: "f in Hz, σ in S/m. Cu at 1 GHz: δ ≈ 2.1 µm. At 10 GHz: 0.66 µm. Current flows in δ near surface.", ex: "Cu @ 100 MHz → δ ≈ 6.6 µm (why thin Cu plating works at RF)", units: "m" },

  // UNITS
  { cat: "units", name: "Length: inch ↔ mm", f: "1 inch = 25.4 mm", vars: "Exact conversion. Divide by 25.4 for in → mm. US RF cables spec in inches; IEC in mm.", ex: "5/8 in = 15.875 mm · 0.141 in = 3.58 mm", units: "length" },
  { cat: "units", name: "Length: ft ↔ m", f: "1 ft = 0.3048 m (exact)", vars: "100 ft ≈ 30.48 m. Loss specs: 1 dB/100ft ≈ 3.28 dB/100m.", ex: "100 m = 328.08 ft", units: "length" },
  { cat: "units", name: "dBm ↔ Watts", f: "P_W = 10^((dBm − 30)/10)", vars: "0 dBm = 1 mW. +30 dBm = 1 W. +60 dBm = 1 kW. −30 dBm = 1 µW.", ex: "43 dBm = 20 W, −85 dBm = 3.2 pW", units: "W" },
  { cat: "units", name: "dB quick table", f: "+3 ≈ 2×, +10 = 10×, −3 ≈ ½, −10 = 1/10", vars: "Mental math shortcuts. +6 ≈ 4×, +20 = 100×, +30 = 1000×. Voltage gets ×/÷√2 per 3 dB.", ex: "27 dB = 10^2.7 ≈ 500×", units: "ratio" },
  { cat: "units", name: "Temp: °C ↔ °F ↔ K", f: "°F = °C·1.8 + 32; K = °C + 273.15", vars: "Room 20°C = 68°F = 293 K. Cable limits: PVC −20 to +75°C, PE −55 to +80, PTFE −55 to +260.", ex: "−40°C = −40°F (crossover), 125°C = 257°F", units: "temperature" },
];

function CheatSheetView() {
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");

  const filtered = useMemo(() => {
    return FORMULAS.filter(f => {
      if (filterCat !== "all" && f.cat !== filterCat) return false;
      if (search) { const q = search.toLowerCase(); if (!(f.name + " " + f.f + " " + f.vars + " " + f.ex).toLowerCase().includes(q)) return false; }
      return true;
    });
  }, [search, filterCat]);

  return (
    <div style={S.viewInner}>
      <div style={S.viewIntro}>
        <strong style={S.viewIntroStrong}>RF Cheat Sheet.</strong> {FORMULAS.length} formulas across {Object.keys(CHEAT_CATEGORIES).length} categories. Search or filter by topic. Each card shows formula + variables + worked example.
      </div>

      <div style={S.filterGrid}>
        <div style={{ gridColumn: "span 2" }}>
          <label style={S.filterLabel}>Search formulas</label>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. impedance, VSWR, IP3, path loss..." style={S.searchInput} />
        </div>
      </div>

      <div style={S.catChips}>
        <button onClick={() => setFilterCat("all")} className="hover-pill" style={{ ...S.catChip, ...(filterCat === "all" ? S.catChipActive : {}) }}>All ({FORMULAS.length})</button>
        {Object.entries(CHEAT_CATEGORIES).map(([k, v]) => {
          const count = FORMULAS.filter(f => f.cat === k).length;
          return (
            <button key={k} onClick={() => setFilterCat(k)} className="hover-pill" style={{ ...S.catChip, ...(filterCat === k ? { ...S.catChipActive, borderColor: v.color, color: v.color } : {}), borderLeftColor: v.color, borderLeftWidth: 3 }}>{v.icon} {v.label} ({count})</button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 10 }}>
        {filtered.map((f, i) => {
          const cat = CHEAT_CATEGORIES[f.cat];
          return (
            <div key={i} style={{ padding: "12px 14px", background: "rgba(15,10,5,0.5)", border: `1px solid ${cat.color}44`, borderRadius: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 3, background: `${cat.color}22`, border: `1px solid ${cat.color}`, color: cat.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", flexShrink: 0 }}>{cat.icon}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#e7e5e4" }}>{f.name}</div>
              </div>
              <div style={{ fontSize: 12.5, color: cat.color, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, padding: "6px 10px", background: "rgba(15,10,5,0.6)", border: `1px solid ${cat.color}33`, borderRadius: 3, marginBottom: 6 }}>{f.f}</div>
              <div style={{ fontSize: 10.5, color: "#d6cfc4", lineHeight: 1.55, marginBottom: 6 }}>{wrapTerms(f.vars)}</div>
              <div style={{ fontSize: 10.5, color: "#a8a29e", lineHeight: 1.55, paddingLeft: 8, borderLeft: `2px solid ${cat.color}55`, fontStyle: "italic" }}><strong style={{ color: cat.color, fontStyle: "normal" }}>Example:</strong> {wrapTerms(f.ex)}</div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <div style={S.emptyState}>No formulas match. Try a broader search.</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RF TOOLS (Smith Chart + TDR Viewer)
// ═══════════════════════════════════════════════════════════════
function ToolsView({ toolPreset, clearToolPreset }) {
  const [subTool, setSubTool] = useState("smith");
  useEffect(() => {
    if (!toolPreset) return;
    if (["smith", "tdr", "nf", "ip3", "path"].includes(toolPreset.target)) {
      setSubTool(toolPreset.target);
    }
  }, [toolPreset?.ts, toolPreset?.target]);
  const matchedPreset = (key) => (toolPreset && toolPreset.target === key) ? toolPreset : null;
  return (
    <div style={S.viewInner}>
      <div style={S.viewIntro}>
        <strong style={S.viewIntroStrong}>RF Tools.</strong> Smith chart, Touchstone viewer, Noise Figure cascade (Friis), IP3 / distortion, and Free-space path loss calculator.
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
        {[["smith", "🎯 Smith Chart"], ["tdr", "📊 TDR / S-Params"], ["nf", "🔊 NF Cascade"], ["ip3", "⚡ IP3 / P1dB"], ["path", "📡 Path Loss"]].map(([k, label]) => (
          <button key={k} onClick={() => setSubTool(k)} style={{ padding: "7px 14px", background: subTool === k ? "#d97706" : "rgba(15,10,5,0.4)", color: subTool === k ? "#0a0705" : "#a8a29e", border: `1px solid ${subTool === k ? "#d97706" : "#2a1f15"}`, borderRadius: 3, cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>{label}</button>
        ))}
      </div>
      {subTool === "smith" && <SmithChartTool preset={matchedPreset("smith")} onPresetApplied={clearToolPreset} />}
      {subTool === "tdr" && <TDRTool preset={matchedPreset("tdr")} onPresetApplied={clearToolPreset} />}
      {subTool === "nf" && <NFCascadeTool preset={matchedPreset("nf")} onPresetApplied={clearToolPreset} />}
      {subTool === "ip3" && <DistortionTool preset={matchedPreset("ip3")} onPresetApplied={clearToolPreset} />}
      {subTool === "path" && <PathLossTool preset={matchedPreset("path")} onPresetApplied={clearToolPreset} />}
    </div>
  );
}

function NFCascadeTool({ preset, onPresetApplied }) {
  const [stages, setStages] = useState(() => {
    try { const s = localStorage.getItem("rf-nf-stages"); if (s) return JSON.parse(s); } catch {}
    return [
      { id: "s1", name: "LNA", gain: 15, nf: 1.2, oip3: 30 },
      { id: "s2", name: "Cable loss", gain: -3, nf: 3.0, oip3: 50 },
      { id: "s3", name: "Mixer", gain: -7, nf: 7.0, oip3: 15 },
      { id: "s4", name: "IF Amp", gain: 20, nf: 2.0, oip3: 25 },
    ];
  });
  useEffect(() => { try { localStorage.setItem("rf-nf-stages", JSON.stringify(stages)); } catch {} }, [stages]);
  useEffect(() => {
    if (!preset?.data?.stages || !Array.isArray(preset.data.stages) || preset.data.stages.length === 0) return;
    setStages(preset.data.stages.map((s, i) => mapAgentStageToNF(s, i)));
    onPresetApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.ts]);

  const result = useMemo(() => {
    let F_total = 1, G_cum = 1, G_cum_dB = 0;
    let iip3_inv = 0;
    const perStage = [];
    stages.forEach((s, i) => {
      const F = Math.pow(10, s.nf / 10);
      const G = Math.pow(10, s.gain / 10);
      const IIP3_dBm = s.oip3 - s.gain;
      const IIP3_lin = Math.pow(10, (IIP3_dBm - 30) / 10);
      const F_contrib = i === 0 ? F : (F - 1) / G_cum;
      if (i === 0) F_total = F; else F_total += (F - 1) / G_cum;
      iip3_inv += G_cum / IIP3_lin;
      G_cum *= G;
      G_cum_dB += s.gain;
      perStage.push({ ...s, F_contrib, cumGain: G_cum_dB, cumNF: 10 * Math.log10(F_total), cumF: F_total });
    });
    const NF_dB = 10 * Math.log10(F_total);
    const T_noise = 290 * (F_total - 1);
    const IIP3_total_dBm = iip3_inv > 0 ? 10 * Math.log10(1 / iip3_inv) + 30 : Infinity;
    const OIP3_total_dBm = IIP3_total_dBm + G_cum_dB;
    return { NF_dB, G_cum_dB, F_total, T_noise, IIP3_total_dBm, OIP3_total_dBm, perStage };
  }, [stages]);

  const update = (i, patch) => setStages(prev => prev.map((s, j) => j === i ? { ...s, ...patch } : s));
  const add = () => setStages(prev => [...prev, { id: "s" + Math.random().toString(36).slice(2, 7), name: "Stage " + (prev.length + 1), gain: 10, nf: 3, oip3: 20 }]);
  const remove = (i) => setStages(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev);

  const W = 720, H = 180, padL = 60, padR = 20, padT = 20, padB = 40;
  const maxContrib = Math.max(...result.perStage.map(p => 10 * Math.log10(1 + p.F_contrib / (result.F_total - 1 || 1e-9))), 0.1);
  const xStep = (W - padL - padR) / Math.max(1, stages.length - 1);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 18, marginBottom: 16, alignItems: "flex-start" }}>
        <div style={{ padding: 14, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid #2a1f15", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 8px", textAlign: "left", color: "#a8a29e", fontSize: 9, letterSpacing: 1, textTransform: "uppercase", borderBottom: "1px solid #2a1f15" }}>#</th>
                <th style={{ padding: "6px 8px", textAlign: "left", color: "#a8a29e", fontSize: 9, letterSpacing: 1, textTransform: "uppercase", borderBottom: "1px solid #2a1f15" }}>Name</th>
                <th style={{ padding: "6px 8px", textAlign: "right", color: "#a8a29e", fontSize: 9, letterSpacing: 1, textTransform: "uppercase", borderBottom: "1px solid #2a1f15" }}>Gain (dB)</th>
                <th style={{ padding: "6px 8px", textAlign: "right", color: "#a8a29e", fontSize: 9, letterSpacing: 1, textTransform: "uppercase", borderBottom: "1px solid #2a1f15" }}>NF (dB)</th>
                <th style={{ padding: "6px 8px", textAlign: "right", color: "#a8a29e", fontSize: 9, letterSpacing: 1, textTransform: "uppercase", borderBottom: "1px solid #2a1f15" }}>OIP3 (dBm)</th>
                <th style={{ padding: "6px 8px", textAlign: "right", color: "#a8a29e", fontSize: 9, letterSpacing: 1, textTransform: "uppercase", borderBottom: "1px solid #2a1f15" }}>Cum NF</th>
                <th style={{ padding: "6px 8px", borderBottom: "1px solid #2a1f15" }}></th>
              </tr>
            </thead>
            <tbody>
              {result.perStage.map((s, i) => (
                <tr key={s.id} style={{ background: i % 2 === 0 ? "rgba(15,10,5,0.25)" : "transparent" }}>
                  <td style={{ padding: "4px 8px", color: "#78716c", fontFamily: "JetBrains Mono, monospace" }}>{i + 1}</td>
                  <td style={{ padding: "4px 8px" }}><input type="text" value={s.name} onChange={e => update(i, { name: e.target.value })} style={calcInputStyle} /></td>
                  <td style={{ padding: "4px 8px", textAlign: "right" }}><input type="number" step="0.5" value={s.gain} onChange={e => update(i, { gain: Number(e.target.value) })} style={{ ...calcInputStyle, width: 60, textAlign: "right" }} /></td>
                  <td style={{ padding: "4px 8px", textAlign: "right" }}><input type="number" step="0.1" value={s.nf} onChange={e => update(i, { nf: Number(e.target.value) })} style={{ ...calcInputStyle, width: 60, textAlign: "right" }} /></td>
                  <td style={{ padding: "4px 8px", textAlign: "right" }}><input type="number" step="1" value={s.oip3} onChange={e => update(i, { oip3: Number(e.target.value) })} style={{ ...calcInputStyle, width: 60, textAlign: "right" }} /></td>
                  <td style={{ padding: "4px 8px", textAlign: "right", color: "#fbbf24", fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{s.cumNF.toFixed(2)}</td>
                  <td style={{ padding: "4px 4px" }}>{stages.length > 1 && <button onClick={() => remove(i)} style={{ background: "none", border: "none", color: "#78716c", cursor: "pointer", fontSize: 12, padding: "2px 6px" }}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={add} style={{ marginTop: 8, background: "rgba(217,119,6,0.15)", color: "#fbbf24", border: "1px solid #d97706", padding: "5px 12px", fontSize: 10, cursor: "pointer", borderRadius: 2, fontWeight: 600 }}>+ Add Stage</button>
        </div>

        <div style={{ padding: 14, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid #2a1f15" }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 10 }}>System results</div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#d6cfc4", lineHeight: 1.9 }}>
            <div>NF<sub>total</sub> = <strong style={{ color: "#fbbf24", fontSize: 14 }}>{result.NF_dB.toFixed(2)} dB</strong></div>
            <div>Gain<sub>cum</sub> = <strong style={{ color: "#fbbf24" }}>{result.G_cum_dB.toFixed(1)} dB</strong></div>
            <div>T<sub>noise</sub> = <strong style={{ color: "#fbbf24" }}>{result.T_noise.toFixed(1)} K</strong></div>
            <div style={{ borderTop: "1px dashed #2a1f15", margin: "6px 0", paddingTop: 4 }}>IIP3 = <strong style={{ color: "#fbbf24" }}>{result.IIP3_total_dBm.toFixed(1)} dBm</strong></div>
            <div>OIP3 = <strong style={{ color: "#fbbf24" }}>{result.OIP3_total_dBm.toFixed(1)} dBm</strong></div>
          </div>
          <div style={{ fontSize: 9, color: "#78716c", marginTop: 10, lineHeight: 1.5, paddingTop: 6, borderTop: "1px dashed #2a1f15" }}>
            <strong style={{ color: "#a8a29e" }}>Friis:</strong> F = F₁ + (F₂−1)/G₁ + (F₃−1)/(G₁G₂) + ...
            <br /><strong style={{ color: "#a8a29e" }}>IP3 cascade:</strong> 1/IIP3 = Σ Gcum/IIP3ᵢ
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: "rgba(15,10,5,0.5)", borderRadius: 4, marginBottom: 14 }}>
        <text x={padL - 42} y={padT + (H - padT - padB) / 2} fontSize="9" fill="#a8a29e" textAnchor="middle" transform={`rotate(-90, ${padL - 42}, ${padT + (H - padT - padB) / 2})`} letterSpacing="1">Cumulative NF (dB)</text>
        <text x={padL + (W - padL - padR) / 2} y={H - 8} fontSize="9" fill="#a8a29e" textAnchor="middle" letterSpacing="1">Stage</text>
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#57534e" strokeWidth="0.8" />
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#57534e" strokeWidth="0.8" />
        {result.perStage.map((s, i) => {
          const maxNF = Math.max(...result.perStage.map(p => p.cumNF)) * 1.1 || 1;
          const x = padL + i * xStep;
          const y = (H - padB) - (s.cumNF / maxNF) * (H - padT - padB);
          return (
            <g key={s.id}>
              {i > 0 && <line x1={padL + (i - 1) * xStep} y1={(H - padB) - (result.perStage[i - 1].cumNF / maxNF) * (H - padT - padB)} x2={x} y2={y} stroke="#d97706" strokeWidth="2" />}
              <circle cx={x} cy={y} r="4" fill="#fbbf24" stroke="#d97706" strokeWidth="1.5" />
              <text x={x} y={H - padB + 14} fontSize="9" fill="#a8a29e" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{s.name.slice(0, 8)}</text>
              <text x={x} y={y - 8} fontSize="9" fill="#fbbf24" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{s.cumNF.toFixed(2)}</text>
            </g>
          );
        })}
      </svg>

      <div style={{ fontSize: 10, color: "#a8a29e", padding: "10px 12px", background: "rgba(15,10,5,0.4)", borderRadius: 3, lineHeight: 1.6 }}>
        💡 <strong style={{ color: "#fbbf24" }}>Friis formula for cascaded NF:</strong> The first stage dominates — its NF and gain are most critical. High-gain low-NF LNA early in the chain minimizes contributions from later stages. <strong style={{ color: "#fbbf24" }}>Rule:</strong> A cable-before-LNA setup degrades NF by exactly the cable loss (3 dB cable → +3 dB NF hit). That's why outdoor antennas need mast-mounted LNAs.
      </div>
    </div>
  );
}

function DistortionTool({ preset, onPresetApplied }) {
  const [pin, setPin] = useState(-20);     // dBm input
  const [gain, setGain] = useState(15);
  const [oip3, setOip3] = useState(30);
  const [p1dbOut, setP1dbOut] = useState(20);
  const [f1, setF1] = useState(1000);
  const [f2, setF2] = useState(1010);

  useEffect(() => {
    if (!preset?.data) return;
    const d = preset.data;
    if (d.pin_per_tone_dbm != null) setPin(Number(d.pin_per_tone_dbm));
    if (d.gain_db != null) setGain(Number(d.gain_db));
    if (d.oip3_dbm != null) setOip3(Number(d.oip3_dbm));
    if (d.p1db_out_dbm != null) setP1dbOut(Number(d.p1db_out_dbm));
    if (d.f1_mhz != null) setF1(Number(d.f1_mhz));
    if (d.f2_mhz != null) setF2(Number(d.f2_mhz));
    onPresetApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.ts]);

  const pout = pin + gain;
  const iip3 = oip3 - gain;
  const p1dbIn = p1dbOut - gain;
  // IM3 output power: Pim3 = 3*Pout - 2*OIP3
  const pim3_out = 3 * pout - 2 * oip3;
  const pim3_in = pim3_out - gain;
  // SFDR: dynamic range where signal is above noise and IM3 is below noise
  const kTB_dBm = -174 + 10 * Math.log10(1e6);  // 1 MHz BW
  const noise_floor = kTB_dBm + 6;  // assume 6 dB NF
  const sfdr = (2 / 3) * (iip3 - noise_floor);

  // IM products frequencies
  const im3_low = 2 * f1 - f2;
  const im3_high = 2 * f2 - f1;
  const im5_low = 3 * f1 - 2 * f2;
  const im5_high = 3 * f2 - 2 * f1;

  // Compression zone
  const compression = pout - (-1); // 1 dB below
  const inCompression = pout > p1dbOut;
  const nearCompression = pout > p1dbOut - 5;

  const W = 720, H = 260, padL = 60, padR = 20, padT = 20, padB = 50;
  // Plot Pout vs Pin, show linear, 1dB compression, OIP3 extrapolation, IM3
  const pinMin = -50, pinMax = 20;
  const poutMin = -60, poutMax = 40;
  const xP = p => padL + (p - pinMin) / (pinMax - pinMin) * (W - padL - padR);
  const yP = p => padT + (1 - (p - poutMin) / (poutMax - poutMin)) * (H - padT - padB);

  const linearPath = `M ${xP(pinMin).toFixed(1)} ${yP(pinMin + gain).toFixed(1)} L ${xP(pinMax).toFixed(1)} ${yP(pinMax + gain).toFixed(1)}`;
  const im3Path = `M ${xP(pinMin).toFixed(1)} ${yP(3 * (pinMin + gain) - 2 * oip3).toFixed(1)} L ${xP(pinMax).toFixed(1)} ${yP(3 * (pinMax + gain) - 2 * oip3).toFixed(1)}`;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 16 }}>
        <div style={{ padding: 14, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid #2a1f15" }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 10 }}>Amplifier specs</div>
          <CalcField label="Gain (dB)" value={gain} set={setGain} step={0.5} />
          <CalcField label="OIP3 (dBm)" value={oip3} set={setOip3} step={1} />
          <CalcField label="P1dB out (dBm)" value={p1dbOut} set={setP1dbOut} step={0.5} />
          <div style={{ fontSize: 9, color: "#78716c", marginTop: 6, lineHeight: 1.5 }}>IIP3 = OIP3 − Gain = <strong style={{ color: "#fbbf24" }}>{iip3.toFixed(1)} dBm</strong></div>
          <div style={{ fontSize: 9, color: "#78716c", lineHeight: 1.5 }}>P1dB in = <strong style={{ color: "#fbbf24" }}>{p1dbIn.toFixed(1)} dBm</strong></div>
        </div>

        <div style={{ padding: 14, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid #2a1f15" }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 10 }}>Signal conditions</div>
          <CalcField label="Pin per tone (dBm)" value={pin} set={setPin} step={1} />
          <CalcField label="f₁ (MHz)" value={f1} set={setF1} step={1} />
          <CalcField label="f₂ (MHz)" value={f2} set={setF2} step={1} />
          <div style={{ fontSize: 9, color: "#78716c", marginTop: 6, lineHeight: 1.5 }}>Pout = Pin + Gain = <strong style={{ color: "#fbbf24" }}>{pout.toFixed(1)} dBm</strong></div>
        </div>

        <div style={{ padding: 14, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: `1px solid ${inCompression ? "#ef4444" : nearCompression ? "#f97316" : "#34d399"}` }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: inCompression ? "#ef4444" : nearCompression ? "#f97316" : "#34d399", textTransform: "uppercase", marginBottom: 10 }}>IM3 distortion</div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#d6cfc4", lineHeight: 1.9 }}>
            <div>P<sub>IM3 out</sub> = <strong style={{ color: "#ef4444" }}>{pim3_out.toFixed(1)} dBm</strong></div>
            <div>P<sub>IM3 in</sub> = <strong style={{ color: "#ef4444" }}>{pim3_in.toFixed(1)} dBm</strong></div>
            <div>Fund − IM3 = <strong style={{ color: pout - pim3_out > 40 ? "#34d399" : pout - pim3_out > 20 ? "#fbbf24" : "#ef4444" }}>{(pout - pim3_out).toFixed(1)} dBc</strong></div>
            <div style={{ fontSize: 10, color: "#78716c", marginTop: 4 }}>SFDR ≈ <strong style={{ color: "#fbbf24" }}>{sfdr.toFixed(1)} dB</strong> (at 1 MHz BW, 6 dB NF)</div>
            {inCompression && <div style={{ fontSize: 10, color: "#ef4444", marginTop: 4, fontWeight: 700 }}>⚠ ABOVE P1dB — amp compressed!</div>}
            {!inCompression && nearCompression && <div style={{ fontSize: 10, color: "#f97316", marginTop: 4 }}>⚠ Within 5 dB of P1dB — nonlinear region</div>}
          </div>
        </div>
      </div>

      <div style={{ padding: 14, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid #2a1f15", marginBottom: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 10 }}>Intermodulation products</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, fontSize: 10.5, fontFamily: "JetBrains Mono, monospace", color: "#d6cfc4" }}>
          <div>f₁ fundamental: <span style={{ color: "#fbbf24" }}>{f1} MHz</span></div>
          <div>f₂ fundamental: <span style={{ color: "#fbbf24" }}>{f2} MHz</span></div>
          <div>2f₁ − f₂ (IM3 lo): <span style={{ color: "#ef4444" }}>{im3_low} MHz</span></div>
          <div>2f₂ − f₁ (IM3 hi): <span style={{ color: "#ef4444" }}>{im3_high} MHz</span></div>
          <div>3f₁ − 2f₂ (IM5 lo): <span style={{ color: "#f97316" }}>{im5_low} MHz</span></div>
          <div>3f₂ − 2f₁ (IM5 hi): <span style={{ color: "#f97316" }}>{im5_high} MHz</span></div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: "rgba(15,10,5,0.5)", borderRadius: 4 }}>
        {[-60, -40, -20, 0, 20, 40].map(d => <g key={`py${d}`}><line x1={padL} y1={yP(d)} x2={W - padR} y2={yP(d)} stroke="#2a1f15" strokeWidth="0.5" strokeDasharray="2,3" /><text x={padL - 6} y={yP(d) + 3} fontSize="9" fill="#78716c" textAnchor="end" fontFamily="JetBrains Mono, monospace">{d}</text></g>)}
        {[-50, -30, -10, 10].map(d => <g key={`px${d}`}><line x1={xP(d)} y1={padT} x2={xP(d)} y2={H - padB} stroke="#2a1f15" strokeWidth="0.5" strokeDasharray="2,3" /><text x={xP(d)} y={H - padB + 14} fontSize="9" fill="#78716c" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{d}</text></g>)}
        <text x={padL + (W - padL - padR) / 2} y={H - 6} fontSize="10" fill="#a8a29e" textAnchor="middle">Pin per tone (dBm)</text>
        <text x={padL - 48} y={padT + (H - padT - padB) / 2} fontSize="10" fill="#a8a29e" textAnchor="middle" transform={`rotate(-90, ${padL - 48}, ${padT + (H - padT - padB) / 2})`}>Pout (dBm)</text>

        <path d={linearPath} stroke="#fbbf24" strokeWidth="2" fill="none" />
        <path d={im3Path} stroke="#ef4444" strokeWidth="2" fill="none" />
        <line x1={padL} y1={yP(p1dbOut)} x2={W - padR} y2={yP(p1dbOut)} stroke="#f97316" strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
        <text x={W - padR - 4} y={yP(p1dbOut) - 3} fontSize="9" fill="#f97316" textAnchor="end" opacity="0.8">P1dB out ({p1dbOut} dBm)</text>
        {iip3 > pinMin && iip3 < pinMax && <g>
          <line x1={xP(iip3)} y1={padT} x2={xP(iip3)} y2={yP(oip3)} stroke="#c084fc" strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
          <circle cx={xP(iip3)} cy={yP(oip3)} r="5" fill="#c084fc" />
          <text x={xP(iip3) + 8} y={yP(oip3) - 4} fontSize="9" fill="#c084fc" fontFamily="JetBrains Mono, monospace">IP3 ({iip3.toFixed(0)}, {oip3.toFixed(0)})</text>
        </g>}
        {pin > pinMin && pin < pinMax && <g>
          <circle cx={xP(pin)} cy={yP(pout)} r="5" fill="#fbbf24" />
          <circle cx={xP(pin)} cy={yP(pim3_out)} r="5" fill="#ef4444" />
          <line x1={xP(pin)} y1={padT} x2={xP(pin)} y2={H - padB} stroke="#fbbf24" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.4" />
        </g>}

        <g transform={`translate(${W - padR - 140}, ${padT + 10})`}>
          <rect x={0} y={0} width={140} height={50} fill="rgba(15,10,5,0.9)" stroke="#2a1f15" strokeWidth="0.5" />
          <line x1={8} y1={14} x2={24} y2={14} stroke="#fbbf24" strokeWidth="2" />
          <text x={30} y={17} fontSize="9" fill="#d6cfc4" fontFamily="JetBrains Mono, monospace">Fundamental (slope 1)</text>
          <line x1={8} y1={28} x2={24} y2={28} stroke="#ef4444" strokeWidth="2" />
          <text x={30} y={31} fontSize="9" fill="#d6cfc4" fontFamily="JetBrains Mono, monospace">IM3 (slope 3)</text>
          <circle cx={16} cy={42} r="3" fill="#c084fc" />
          <text x={30} y={45} fontSize="9" fill="#d6cfc4" fontFamily="JetBrains Mono, monospace">IP3 extrapolation</text>
        </g>
      </svg>

      <div style={{ fontSize: 10, color: "#a8a29e", padding: "10px 12px", background: "rgba(15,10,5,0.4)", borderRadius: 3, lineHeight: 1.6, marginTop: 14 }}>
        💡 <strong style={{ color: "#fbbf24" }}>IM3 grows 3× faster than fundamental:</strong> Increase input by 1 dB → fundamental rises 1 dB, IM3 rises 3 dB. IP3 is the extrapolated intercept where they'd meet (never reached in real amps because they saturate first). <strong>Rule of thumb:</strong> P1dB ≈ OIP3 − 10 to 15 dB. Keep Pin well below P1dB for linear operation.
      </div>
    </div>
  );
}

function CalcField({ label, value, set, step = 1 }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, color: "#a8a29e", marginBottom: 2, letterSpacing: 0.5 }}>{label}</div>
      <input type="number" value={value} step={step} onChange={e => set(Number(e.target.value))} style={{ width: "100%", background: "rgba(15,10,5,0.8)", border: "1px solid #57534e", color: "#fbbf24", padding: "4px 8px", fontSize: 11, fontFamily: "JetBrains Mono, monospace", borderRadius: 2 }} />
    </div>
  );
}

function PathLossTool({ preset, onPresetApplied }) {
  const [freqMHz, setFreqMHz] = useState(2400);
  const [distKm, setDistKm] = useState(1);
  const [txPower, setTxPower] = useState(30);
  const [txGain, setTxGain] = useState(15);
  const [rxGain, setRxGain] = useState(15);
  const [rxSens, setRxSens] = useState(-85);
  const [cableLossTx, setCableLossTx] = useState(3);
  const [cableLossRx, setCableLossRx] = useState(0);

  useEffect(() => {
    if (!preset?.data) return;
    const d = preset.data;
    if (d.frequency_mhz != null) setFreqMHz(Number(d.frequency_mhz));
    if (d.distance_km != null) setDistKm(Number(d.distance_km));
    if (d.tx_power_dbm != null) setTxPower(Number(d.tx_power_dbm));
    if (d.tx_antenna_gain_dbi != null) setTxGain(Number(d.tx_antenna_gain_dbi));
    if (d.rx_antenna_gain_dbi != null) setRxGain(Number(d.rx_antenna_gain_dbi));
    if (d.rx_sensitivity_dbm != null) setRxSens(Number(d.rx_sensitivity_dbm));
    if (d.tx_cable_loss_db != null) setCableLossTx(Number(d.tx_cable_loss_db));
    if (d.rx_cable_loss_db != null) setCableLossRx(Number(d.rx_cable_loss_db));
    onPresetApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.ts]);

  // FSPL (Friis): 32.45 + 20log(f_MHz) + 20log(d_km)
  const fspl = 32.45 + 20 * Math.log10(freqMHz) + 20 * Math.log10(distKm);
  const eirp = txPower + txGain - cableLossTx;
  const rxPower = eirp - fspl + rxGain - cableLossRx;
  const margin = rxPower - rxSens;
  const ok = margin > 0;
  const verdict = linkVerdict(margin);

  // Fresnel zone 1 radius at midpoint
  const wavelength = 300 / freqMHz;  // meters (c=300e6/f_Hz; f_MHz → λ in m = 300/fMHz)
  const fresnelR = 0.6 * Math.sqrt(wavelength * distKm * 1000 / 4);  // 60% F1 clearance recommended

  // Max theoretical range for current margin
  const fsplMax = txPower + txGain - cableLossTx - rxSens + rxGain - cableLossRx;
  // fsplMax = 32.45 + 20log(f) + 20log(d) → d = 10^((fsplMax - 32.45 - 20log(f))/20)
  const maxDistKm = Math.pow(10, (fsplMax - 32.45 - 20 * Math.log10(freqMHz)) / 20);

  const W = 720, H = 200, padL = 60, padR = 20, padT = 20, padB = 40;
  // Plot RX power vs distance (log scale)
  const dMin = 0.01, dMax = Math.min(1000, maxDistKm * 2);
  const pMin = rxSens - 20, pMax = txPower + txGain + 10;
  const xD = d => padL + (Math.log10(d) - Math.log10(dMin)) / (Math.log10(dMax) - Math.log10(dMin)) * (W - padL - padR);
  const yR = r => padT + (1 - (r - pMin) / (pMax - pMin)) * (H - padT - padB);
  const curvePath = Array.from({ length: 80 }, (_, i) => {
    const d = Math.pow(10, Math.log10(dMin) + i / 79 * (Math.log10(dMax) - Math.log10(dMin)));
    const fs = 32.45 + 20 * Math.log10(freqMHz) + 20 * Math.log10(d);
    const rx = txPower + txGain - cableLossTx - fs + rxGain - cableLossRx;
    return `${i === 0 ? "M" : "L"} ${xD(d).toFixed(1)} ${yR(rx).toFixed(1)}`;
  }).join(" ");

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 16 }}>
        <div style={{ padding: 14, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid #2a1f15" }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 10 }}>RF link</div>
          <CalcField label="Frequency (MHz)" value={freqMHz} set={setFreqMHz} step={10} />
          <CalcField label="Distance (km)" value={distKm} set={setDistKm} step={0.1} />
          <div style={{ fontSize: 9, color: "#78716c", marginTop: 6 }}>λ = <strong style={{ color: "#fbbf24" }}>{(wavelength * 100).toFixed(2)} cm</strong> · F₁ clearance mid = <strong style={{ color: "#fbbf24" }}>{fresnelR.toFixed(2)} m</strong></div>
        </div>
        <div style={{ padding: 14, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid #2a1f15" }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 10 }}>TX side</div>
          <CalcField label="TX power (dBm)" value={txPower} set={setTxPower} step={1} />
          <CalcField label="TX antenna gain (dBi)" value={txGain} set={setTxGain} step={0.5} />
          <CalcField label="TX cable loss (dB)" value={cableLossTx} set={setCableLossTx} step={0.5} />
          <div style={{ fontSize: 10, color: "#a8a29e", marginTop: 6 }}>EIRP = <strong style={{ color: "#fbbf24", fontFamily: "JetBrains Mono, monospace" }}>{eirp.toFixed(1)} dBm</strong></div>
        </div>
        <div style={{ padding: 14, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid #2a1f15" }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 10 }}>RX side</div>
          <CalcField label="RX antenna gain (dBi)" value={rxGain} set={setRxGain} step={0.5} />
          <CalcField label="RX cable loss (dB)" value={cableLossRx} set={setCableLossRx} step={0.5} />
          <CalcField label="RX sensitivity (dBm)" value={rxSens} set={setRxSens} step={1} />
        </div>
        <div style={{ padding: 14, background: `${verdict.color}18`, border: `1px solid ${verdict.color}`, borderRadius: 4 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: verdict.color, textTransform: "uppercase", marginBottom: 10 }}>{verdict.icon} {verdict.title}</div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#d6cfc4", lineHeight: 1.9 }}>
            <div>FSPL = <strong style={{ color: "#ef4444" }}>{fspl.toFixed(2)} dB</strong></div>
            <div>RX power = <strong style={{ color: ok ? "#34d399" : "#ef4444" }}>{rxPower.toFixed(1)} dBm</strong></div>
            <div>Margin = <strong style={{ color: verdict.color, fontSize: 14 }}>{margin > 0 ? "+" : ""}{margin.toFixed(1)} dB</strong></div>
            <div style={{ fontSize: 10, color: "#a8a29e", marginTop: 4 }}>Max range: <strong style={{ color: "#fbbf24" }}>{maxDistKm < 1 ? `${(maxDistKm * 1000).toFixed(0)} m` : `${maxDistKm.toFixed(2)} km`}</strong></div>
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: "rgba(15,10,5,0.5)", borderRadius: 4 }}>
        {[dMin, 0.1, 1, 10, 100, dMax].filter(d => d >= dMin && d <= dMax).map((d, i) => <g key={`d${i}`}><line x1={xD(d)} y1={padT} x2={xD(d)} y2={H - padB} stroke="#2a1f15" strokeWidth="0.5" strokeDasharray="2,3" /><text x={xD(d)} y={H - padB + 14} fontSize="9" fill="#78716c" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{d < 1 ? `${(d * 1000).toFixed(0)}m` : `${d}km`}</text></g>)}
        {[pMin, -60, -30, 0, 30].filter(p => p >= pMin && p <= pMax).map((p, i) => <g key={`p${i}`}><line x1={padL} y1={yR(p)} x2={W - padR} y2={yR(p)} stroke="#2a1f15" strokeWidth="0.5" strokeDasharray="2,3" /><text x={padL - 6} y={yR(p) + 3} fontSize="9" fill="#78716c" textAnchor="end" fontFamily="JetBrains Mono, monospace">{p}</text></g>)}
        <text x={padL + (W - padL - padR) / 2} y={H - 6} fontSize="10" fill="#a8a29e" textAnchor="middle">Distance (log)</text>
        <text x={padL - 46} y={padT + (H - padT - padB) / 2} fontSize="10" fill="#a8a29e" textAnchor="middle" transform={`rotate(-90, ${padL - 46}, ${padT + (H - padT - padB) / 2})`}>RX power (dBm)</text>

        <line x1={padL} y1={yR(rxSens)} x2={W - padR} y2={yR(rxSens)} stroke="#ef4444" strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
        <text x={W - padR - 4} y={yR(rxSens) - 3} fontSize="9" fill="#ef4444" textAnchor="end" opacity="0.7">Sensitivity ({rxSens} dBm)</text>
        <path d={curvePath} stroke="#fbbf24" strokeWidth="2" fill="none" />
        <circle cx={xD(distKm)} cy={yR(rxPower)} r="6" fill={ok ? "#34d399" : "#ef4444"} stroke="#0a0705" strokeWidth="2" />
        <text x={xD(distKm) + 10} y={yR(rxPower) + 4} fontSize="10" fill={ok ? "#34d399" : "#ef4444"} fontFamily="JetBrains Mono, monospace" fontWeight="700">{distKm < 1 ? `${(distKm * 1000).toFixed(0)}m` : `${distKm}km`}, {rxPower.toFixed(1)} dBm</text>
      </svg>

      <div style={{ fontSize: 10, color: "#a8a29e", padding: "10px 12px", background: "rgba(15,10,5,0.4)", borderRadius: 3, lineHeight: 1.6, marginTop: 14 }}>
        💡 <strong style={{ color: "#fbbf24" }}>Friis FSPL:</strong> 32.45 + 20·log(f<sub>MHz</sub>) + 20·log(d<sub>km</sub>). Every doubling of distance = +6 dB loss, every doubling of freq = +6 dB loss. <strong>Fresnel zone 1:</strong> Clear 60% of F₁ radius of any obstruction along the path for near-FSPL performance. Below that, expect diffraction loss.
      </div>
    </div>
  );
}

const calcInputStyle = { background: "rgba(15,10,5,0.8)", border: "1px solid #57534e", color: "#fbbf24", padding: "3px 6px", fontSize: 10.5, fontFamily: "JetBrains Mono, monospace", borderRadius: 2, width: "100%" };

function SmithChartTool({ preset, onPresetApplied }) {
  const [gR, setGR] = useState(0.3);
  const [gI, setGI] = useState(0.2);
  const [freq, setFreq] = useState(1000);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef(null);
  const Z0 = 50;

  useEffect(() => {
    if (!preset?.data) return;
    const d = preset.data;
    const f = Number(d.frequency_mhz || d.freq_mhz);
    if (Number.isFinite(f) && f > 0) setFreq(f);
    // If calculate_vswr was invoked, drop the reflection pin on Γ(R + jX)
    if (d.load_resistance != null) {
      const g = reflectionFromLoad(d.load_resistance, d.load_reactance, d.line_impedance ?? Z0);
      if (g && Number.isFinite(g.gR) && Number.isFinite(g.gI)) {
        setGR(Math.max(-0.999, Math.min(0.999, g.gR)));
        setGI(Math.max(-0.999, Math.min(0.999, g.gI)));
      }
    }
    onPresetApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.ts]);

  // Z from Γ
  const num = { r: 1 + gR, i: gI };
  const den = { r: 1 - gR, i: -gI };
  const dm2 = den.r * den.r + den.i * den.i;
  const zNR = dm2 > 1e-9 ? (num.r * den.r + num.i * den.i) / dm2 : 99;
  const zNI = dm2 > 1e-9 ? (num.i * den.r - num.r * den.i) / dm2 : 0;
  const R = zNR * Z0, X = zNI * Z0;
  const gMag = Math.sqrt(gR * gR + gI * gI);
  const VSWR = gMag < 0.999 ? (1 + gMag) / (1 - gMag) : 999;
  const RL = gMag > 0.001 ? -20 * Math.log10(gMag) : 99;
  const gAngle = Math.atan2(gI, gR) * 180 / Math.PI;

  // L-network matching to 50Ω at freq
  const omega = 2 * Math.PI * freq * 1e6;
  let match = null;
  if (R > 0 && Math.abs(R - Z0) > 0.1) {
    if (R > Z0) {
      const Q = Math.sqrt(R / Z0 - 1);
      const Xs_series = Q * Z0;
      const Xp_shunt = -R / Q;
      match = {
        kind: "Shunt+Series (R>Z₀)",
        shuntReact: Xp_shunt - X * (R * R + X * X) / ((R - Z0) * Z0 + X * X),
        seriesReact: Xs_series - X,
        shuntSimpleRx: Xp_shunt,
        seriesSimpleRx: Xs_series,
      };
    } else {
      const Q = Math.sqrt(Z0 / R - 1);
      const Xs_series = Q * R - X;
      const Xp_shunt = -Z0 / Q;
      match = {
        kind: "Series+Shunt (R<Z₀)",
        seriesReact: Xs_series,
        shuntReact: Xp_shunt,
        shuntSimpleRx: Xp_shunt,
        seriesSimpleRx: Q * R,
      };
    }
  }

  const SZ = 440, CX = SZ / 2, CY = SZ / 2, Rc = SZ * 0.42;
  const gToSvg = (gr, gi) => ({ x: CX + gr * Rc, y: CY - gi * Rc });
  const svgToG = (cx, cy) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { gr: gR, gi: gI };
    const scale = SZ / rect.width;
    const gr = ((cx - rect.left) * scale - CX) / Rc;
    const gi = -(((cy - rect.top) * scale - CY) / Rc);
    const m = Math.sqrt(gr * gr + gi * gi);
    return m > 0.999 ? { gr: gr * 0.999 / m, gi: gi * 0.999 / m } : { gr, gi };
  };

  const pt = gToSvg(gR, gI);
  const handleMove = (e) => { if (!dragging) return; const { gr, gi } = svgToG(e.clientX, e.clientY); setGR(gr); setGI(gi); };
  const handleDown = (e) => { setDragging(true); const { gr, gi } = svgToG(e.clientX, e.clientY); setGR(gr); setGI(gi); };

  const setZFromR = (newR) => {
    const r = newR / Z0, x = zNI;
    const d2 = (r + 1) * (r + 1) + x * x;
    setGR(((r - 1) * (r + 1) + x * x) / d2);
    setGI((2 * x) / d2);
  };
  const setZFromX = (newX) => {
    const r = zNR, x = newX / Z0;
    const d2 = (r + 1) * (r + 1) + x * x;
    setGR(((r - 1) * (r + 1) + x * x) / d2);
    setGI((2 * x) / d2);
  };

  const presets = [
    { name: "Matched (50Ω)", gr: 0, gi: 0 },
    { name: "Short", gr: -1, gi: 0 },
    { name: "Open", gr: 0.999, gi: 0 },
    { name: "100Ω load", R: 100, X: 0 },
    { name: "25Ω load", R: 25, X: 0 },
    { name: "L=10nH @ 1GHz", R: 0.01, X: 62.8 },
    { name: "C=10pF @ 1GHz", R: 0.01, X: -15.9 },
  ];

  const loadPreset = (p) => {
    if (p.gr !== undefined) { setGR(p.gr); setGI(p.gi); return; }
    const r = p.R / Z0, x = p.X / Z0;
    const d2 = (r + 1) * (r + 1) + x * x;
    setGR(((r - 1) * (r + 1) + x * x) / d2);
    setGI((2 * x) / d2);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(350px, 1fr) 280px", gap: 20, alignItems: "flex-start" }}>
      <div>
        <svg ref={svgRef} viewBox={`0 0 ${SZ} ${SZ}`} style={{ width: "100%", maxWidth: 520, height: "auto", cursor: dragging ? "grabbing" : "crosshair", background: "rgba(15,10,5,0.5)", borderRadius: 4, userSelect: "none", touchAction: "none" }}
          onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)}>
          <defs>
            <clipPath id="smith-clip"><circle cx={CX} cy={CY} r={Rc} /></clipPath>
          </defs>
          <circle cx={CX} cy={CY} r={Rc} fill="rgba(15,10,5,0.3)" />
          <g clipPath="url(#smith-clip)">
            {[0.2, 0.5, 1, 2, 5].map(r => <circle key={`r${r}`} cx={CX + (r / (r + 1)) * Rc} cy={CY} r={(1 / (r + 1)) * Rc} fill="none" stroke={r === 1 ? "#d97706" : "#4b5563"} strokeWidth={r === 1 ? 1.2 : 0.6} opacity={r === 1 ? 0.8 : 0.5} />)}
            {[-5, -2, -1, -0.5, -0.2, 0.2, 0.5, 1, 2, 5].map(x => <circle key={`x${x}`} cx={CX + Rc} cy={CY - Rc / x} r={Rc / Math.abs(x)} fill="none" stroke={x > 0 ? "#ef444499" : "#3b82f699"} strokeWidth="0.5" opacity="0.5" />)}
            <line x1={CX - Rc} y1={CY} x2={CX + Rc} y2={CY} stroke="#57534e" strokeWidth="0.8" />
            {[1.5, 2, 3, 5].map(v => { const m = (v - 1) / (v + 1); return <circle key={`v${v}`} cx={CX} cy={CY} r={m * Rc} fill="none" stroke="#fbbf24" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.35" />; })}
          </g>
          <circle cx={CX} cy={CY} r={Rc} fill="none" stroke="#a8a29e" strokeWidth="1.5" />

          {[1.5, 2, 3].map((v, i) => { const m = (v - 1) / (v + 1); return <text key={`vt${v}`} x={CX + m * Rc + 3} y={CY - 3} fontSize="8" fill="#fbbf24" fontFamily="JetBrains Mono, monospace" opacity="0.6">{v}</text>; })}

          <circle cx={CX} cy={CY} r="3.5" fill="#34d399" />
          <text x={CX} y={CY + 14} fontSize="9" fill="#34d399" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight="700">50Ω</text>

          <text x={CX - Rc + 4} y={CY - 4} fontSize="9" fill="#a8a29e" fontFamily="JetBrains Mono, monospace">← SHORT</text>
          <text x={CX + Rc - 4} y={CY - 4} fontSize="9" fill="#a8a29e" fontFamily="JetBrains Mono, monospace" textAnchor="end">OPEN →</text>
          <text x={CX + 4} y={CY - Rc + 12} fontSize="8.5" fill="#ef4444" fontFamily="JetBrains Mono, monospace">+jX (inductive)</text>
          <text x={CX + 4} y={CY + Rc - 4} fontSize="8.5" fill="#3b82f6" fontFamily="JetBrains Mono, monospace">−jX (capacitive)</text>

          <line x1={CX} y1={CY} x2={pt.x} y2={pt.y} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.7" />
          <circle cx={pt.x} cy={pt.y} r="9" fill="#fbbf24" stroke="#d97706" strokeWidth="2" />
          <circle cx={pt.x} cy={pt.y} r="3" fill="#0a0705" />
        </svg>
        <div style={{ fontSize: 10, color: "#78716c", marginTop: 8, textAlign: "center", lineHeight: 1.6 }}>
          Drag yellow point. Center = perfect 50Ω match. Red arcs = inductive (+jX), blue = capacitive (−jX). Dashed yellow rings = VSWR levels. Orange circle = r=1 (real=50Ω).
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ padding: 12, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid #2a1f15" }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 8 }}>Impedance</div>
          <div style={{ fontSize: 15, color: "#fbbf24", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, marginBottom: 4 }}>{R.toFixed(1)} {X >= 0 ? "+" : "−"} j{Math.abs(X).toFixed(1)} Ω</div>
          <div style={{ fontSize: 10, color: "#a8a29e", fontFamily: "JetBrains Mono, monospace" }}>normalized: {zNR.toFixed(2)} {zNI >= 0 ? "+" : "−"} j{Math.abs(zNI).toFixed(2)}</div>
        </div>

        <div style={{ padding: 12, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid #2a1f15" }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 8 }}>Reflection</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 10.5, color: "#d6cfc4", fontFamily: "JetBrains Mono, monospace" }}>
            <div>|Γ| = <span style={{ color: "#fbbf24" }}>{gMag.toFixed(3)}</span></div>
            <div>∠Γ = <span style={{ color: "#fbbf24" }}>{gAngle.toFixed(1)}°</span></div>
            <div>VSWR = <span style={{ color: VSWR < 1.5 ? "#34d399" : VSWR < 3 ? "#fbbf24" : "#ef4444" }}>{VSWR > 100 ? "∞" : VSWR.toFixed(2)}</span></div>
            <div>RL = <span style={{ color: RL > 20 ? "#34d399" : RL > 10 ? "#fbbf24" : "#ef4444" }}>{RL > 60 ? "∞" : RL.toFixed(1)} dB</span></div>
          </div>
        </div>

        <div style={{ padding: 12, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid #2a1f15" }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 8 }}>Set Z manually</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <div>
              <div style={{ fontSize: 9, color: "#a8a29e", marginBottom: 2 }}>R (Ω)</div>
              <input type="number" value={R.toFixed(1)} step="1" onChange={e => setZFromR(Number(e.target.value))} style={{ width: "100%", background: "rgba(15,10,5,0.8)", border: "1px solid #57534e", color: "#fbbf24", padding: "4px 8px", fontSize: 11, fontFamily: "JetBrains Mono, monospace", borderRadius: 2 }} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: "#a8a29e", marginBottom: 2 }}>X (Ω)</div>
              <input type="number" value={X.toFixed(1)} step="1" onChange={e => setZFromX(Number(e.target.value))} style={{ width: "100%", background: "rgba(15,10,5,0.8)", border: "1px solid #57534e", color: "#fbbf24", padding: "4px 8px", fontSize: 11, fontFamily: "JetBrains Mono, monospace", borderRadius: 2 }} />
            </div>
          </div>
        </div>

        <div style={{ padding: 12, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid #2a1f15" }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
            <span>L-network match</span><span style={{ color: "#fbbf24" }}>{freq} MHz</span>
          </div>
          <input type="range" min={1} max={10000} step={1} value={freq} onChange={e => setFreq(Number(e.target.value))} style={{ width: "100%", accentColor: "#d97706", marginBottom: 8 }} />
          {match ? (
            <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "#d6cfc4", lineHeight: 1.8 }}>
              <div style={{ color: "#fbbf24", fontWeight: 700, marginBottom: 4 }}>{match.kind}</div>
              <div>Series: X = <span style={{ color: "#fbbf24" }}>{match.seriesReact.toFixed(1)} Ω</span></div>
              <div style={{ paddingLeft: 10, fontSize: 9, color: "#a8a29e" }}>→ {match.seriesReact > 0 ? `L = ${(match.seriesReact / omega * 1e9).toFixed(2)} nH` : `C = ${(1 / (-match.seriesReact * omega) * 1e12).toFixed(2)} pF`}</div>
              <div>Shunt: X = <span style={{ color: "#fbbf24" }}>{match.shuntReact.toFixed(1)} Ω</span></div>
              <div style={{ paddingLeft: 10, fontSize: 9, color: "#a8a29e" }}>→ {match.shuntReact > 0 ? `L = ${(match.shuntReact / omega * 1e9).toFixed(2)} nH` : `C = ${(1 / (-match.shuntReact * omega) * 1e12).toFixed(2)} pF`}</div>
            </div>
          ) : (
            <div style={{ fontSize: 10, color: "#34d399" }}>{Math.abs(R - Z0) < 0.1 ? "✓ Already matched to 50Ω" : "Out of matchable range"}</div>
          )}
        </div>

        <div style={{ padding: 10, background: "rgba(15,10,5,0.4)", borderRadius: 3 }}>
          <div style={{ fontSize: 9, letterSpacing: 1, color: "#a8a29e", textTransform: "uppercase", marginBottom: 6 }}>Presets</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {presets.map((p, i) => (
              <button key={i} onClick={() => loadPreset(p)} style={{ fontSize: 9, padding: "3px 7px", background: "rgba(217,119,6,0.1)", border: "1px solid #57534e", color: "#a8a29e", borderRadius: 2, cursor: "pointer", fontFamily: "inherit" }}>{p.name}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Parse Touchstone .s1p / .s2p format
function parseTouchstone(text) {
  const lines = text.split(/\r?\n/);
  let unit = "GHZ", format = "MA", z0 = 50;
  const data = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("!")) continue;
    if (line.startsWith("#")) {
      const t = line.slice(1).trim().split(/\s+/);
      if (t[0]) unit = t[0].toUpperCase();
      if (t[2]) format = t[2].toUpperCase();
      const rIdx = t.findIndex(x => x.toUpperCase() === "R");
      if (rIdx >= 0 && t[rIdx + 1]) z0 = Number(t[rIdx + 1]);
      continue;
    }
    const tok = line.split(/\s+/).map(Number).filter(x => Number.isFinite(x));
    if (tok.length < 3) continue;
    const freqRaw = tok[0];
    const a = tok[1], b = tok[2];
    let mag, phase;
    if (format === "MA") { mag = a; phase = b; }
    else if (format === "DB") { mag = Math.pow(10, a / 20); phase = b; }
    else { mag = Math.sqrt(a * a + b * b); phase = Math.atan2(b, a) * 180 / Math.PI; }
    const freqMHz = freqRaw * ({ "HZ": 1e-6, "KHZ": 1e-3, "MHZ": 1, "GHZ": 1000 }[unit] || 1);
    data.push({ freqMHz, mag, phase, dB: 20 * Math.log10(Math.max(1e-10, mag)) });
  }
  if (data.length === 0) throw new Error("No data rows found. Check format.");
  return { unit, format, z0, data };
}

const SAMPLE_TOUCHSTONE = `! Sample S1P — LMR-400 type cable, 10m, with minor connector mismatch at ~2.4 GHz
# MHz S DB R 50
10 -35.2 -45
50 -34.8 -55
100 -33.5 -70
200 -32.1 -82
500 -30.5 -95
1000 -28.8 -110
1500 -26.2 -125
2000 -22.5 -140
2400 -16.8 -158
2500 -14.2 -165
2600 -15.5 -172
3000 -19.8 175
4000 -24.3 155
5000 -27.6 135
6000 -29.8 115
`;

function TDRTool({ preset, onPresetApplied }) {
  const [input, setInput] = useState(SAMPLE_TOUCHSTONE);
  const [parsed, setParsed] = useState(() => { try { return parseTouchstone(SAMPLE_TOUCHSTONE); } catch { return null; } });

  useEffect(() => {
    if (!preset?.data?.s1p_text) return;
    setInput(preset.data.s1p_text);
    try { setParsed(parseTouchstone(preset.data.s1p_text)); } catch {}
    onPresetApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.ts]);
  const [error, setError] = useState(null);

  const doParse = () => {
    try {
      const r = parseTouchstone(input);
      setParsed(r); setError(null);
    } catch (e) { setError(e.message); setParsed(null); }
  };

  const handleFile = (f) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setInput(reader.result); try { setParsed(parseTouchstone(reader.result)); setError(null); } catch (e) { setError(e.message); } };
    reader.readAsText(f);
  };

  const W = 760, H = 340, padL = 58, padR = 18, padT = 20, padB = 50;
  const freqs = parsed?.data.map(d => d.freqMHz) || [];
  const fMin = freqs.length ? Math.max(1, Math.min(...freqs)) : 1;
  const fMax = freqs.length ? Math.max(...freqs) : 10000;
  const dbs = parsed?.data.map(d => d.dB) || [];
  const dbMin = dbs.length ? Math.min(-60, Math.min(...dbs) - 5) : -60;
  const dbMax = dbs.length ? Math.max(0, Math.max(...dbs) + 2) : 0;
  const xf = f => padL + (Math.log10(f) - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin)) * (W - padL - padR);
  const yD = d => padT + (1 - (d - dbMin) / (dbMax - dbMin)) * (H - padT - padB);

  const freqTicks = [1, 10, 100, 1000, 10000, 100000].filter(f => f >= fMin * 0.5 && f <= fMax * 1.5);
  const dbTicks = [];
  for (let d = Math.ceil(dbMin / 10) * 10; d <= dbMax; d += 10) dbTicks.push(d);

  const path = parsed ? parsed.data.map((d, i) => `${i === 0 ? "M" : "L"} ${xf(d.freqMHz).toFixed(1)} ${yD(d.dB).toFixed(1)}`).join(" ") : "";

  // Peak detection (worst match / largest S11)
  const peaks = parsed ? parsed.data.map((d, i) => {
    const prev = parsed.data[i - 1]?.dB ?? -999;
    const next = parsed.data[i + 1]?.dB ?? -999;
    if (d.dB > prev && d.dB > next && d.dB > dbMin + 10) return d;
    return null;
  }).filter(Boolean) : [];
  const worst = parsed ? parsed.data.reduce((acc, d) => d.dB > (acc?.dB ?? -999) ? d : acc, null) : null;
  const fmtFreq = (f) => f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 1 : 2)} GHz` : `${f.toFixed(0)} MHz`;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, marginBottom: 14 }}>
        <div style={{ padding: 12, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid #2a1f15" }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 8 }}>Input: Touchstone .s1p</div>
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={9} style={{ width: "100%", background: "rgba(15,10,5,0.8)", border: "1px solid #57534e", color: "#fbbf24", padding: "6px 8px", fontSize: 10, fontFamily: "JetBrains Mono, monospace", borderRadius: 2, resize: "vertical" }} spellCheck={false} />
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <button onClick={doParse} style={{ flex: 1, background: "#d97706", color: "#0a0705", border: "none", padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 2 }}>Parse + Plot</button>
            <label style={{ background: "rgba(217,119,6,0.15)", border: "1px solid #d97706", color: "#fbbf24", padding: "6px 10px", fontSize: 10, cursor: "pointer", borderRadius: 2 }}>
              📁 Upload .s1p
              <input type="file" accept=".s1p,.s2p,.txt,text/plain" onChange={e => handleFile(e.target.files?.[0])} style={{ display: "none" }} />
            </label>
            <button onClick={() => { setInput(SAMPLE_TOUCHSTONE); setParsed(parseTouchstone(SAMPLE_TOUCHSTONE)); setError(null); }} style={{ background: "transparent", color: "#a8a29e", border: "1px solid #57534e", padding: "6px 10px", fontSize: 10, cursor: "pointer", borderRadius: 2 }}>Sample</button>
          </div>
          {error && <div style={{ marginTop: 6, fontSize: 10, color: "#ef4444" }}>⚠ {error}</div>}
        </div>

        <div style={{ padding: 12, background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid #2a1f15", fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "#d6cfc4" }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 8 }}>Analysis</div>
          {parsed ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div>Points: <span style={{ color: "#fbbf24" }}>{parsed.data.length}</span></div>
              <div>Z₀: <span style={{ color: "#fbbf24" }}>{parsed.z0} Ω</span></div>
              <div>Freq: <span style={{ color: "#fbbf24" }}>{fmtFreq(fMin)} → {fmtFreq(fMax)}</span></div>
              <div>Format: <span style={{ color: "#fbbf24" }}>{parsed.format}</span></div>
              {worst && <div style={{ gridColumn: "span 2" }}>Worst match: <span style={{ color: "#ef4444" }}>{worst.dB.toFixed(1)} dB @ {fmtFreq(worst.freqMHz)}</span> (VSWR {((1 + worst.mag) / (1 - worst.mag)).toFixed(2)})</div>}
              {peaks.length > 0 && <div style={{ gridColumn: "span 2", fontSize: 10, color: "#a8a29e", marginTop: 4 }}>{peaks.length} local peak{peaks.length !== 1 ? "s" : ""} detected — possible impedance discontinuities</div>}
            </div>
          ) : <div style={{ color: "#78716c" }}>Paste Touchstone data and click Parse</div>}
        </div>
      </div>

      {parsed && (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", background: "rgba(15,10,5,0.5)", borderRadius: 4 }}>
          {dbTicks.map((d, i) => (
            <g key={`d${i}`}>
              <line x1={padL} y1={yD(d)} x2={W - padR} y2={yD(d)} stroke="#2a1f15" strokeWidth="0.5" strokeDasharray={d === -10 || d === -20 || d === -30 ? "" : "2,3"} />
              <text x={padL - 6} y={yD(d) + 3} fontSize="9" fill="#78716c" textAnchor="end" fontFamily="JetBrains Mono, monospace">{d}</text>
            </g>
          ))}
          {freqTicks.map((f, i) => (
            <g key={`f${i}`}>
              <line x1={xf(f)} y1={padT} x2={xf(f)} y2={H - padB} stroke="#2a1f15" strokeWidth="0.5" strokeDasharray="2,3" />
              <text x={xf(f)} y={H - padB + 14} fontSize="9" fill="#78716c" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{fmtFreq(f)}</text>
            </g>
          ))}
          <text x={padL - 44} y={padT + (H - padT - padB) / 2} fontSize="10" fill="#a8a29e" textAnchor="middle" transform={`rotate(-90, ${padL - 44}, ${padT + (H - padT - padB) / 2})`} letterSpacing="1">|S11| dB (return loss)</text>
          <text x={padL + (W - padL - padR) / 2} y={H - 10} fontSize="10" fill="#a8a29e" textAnchor="middle" letterSpacing="1">Frequency (log)</text>

          <line x1={padL} y1={yD(-10)} x2={W - padR} y2={yD(-10)} stroke="#ef4444" strokeWidth="0.7" opacity="0.4" strokeDasharray="4,4" />
          <text x={W - padR - 4} y={yD(-10) - 3} fontSize="9" fill="#ef4444" textAnchor="end" opacity="0.7">VSWR=2 (-10 dB)</text>
          <line x1={padL} y1={yD(-14)} x2={W - padR} y2={yD(-14)} stroke="#fbbf24" strokeWidth="0.7" opacity="0.4" strokeDasharray="4,4" />
          <text x={W - padR - 4} y={yD(-14) - 3} fontSize="9" fill="#fbbf24" textAnchor="end" opacity="0.7">VSWR=1.5 (-14 dB)</text>

          <path d={path} fill="none" stroke="#fbbf24" strokeWidth="2" />
          {parsed.data.map((d, i) => <circle key={i} cx={xf(d.freqMHz)} cy={yD(d.dB)} r="2.5" fill="#fbbf24" stroke="#0a0705" strokeWidth="0.5" />)}

          {peaks.map((p, i) => (
            <g key={`pk${i}`}>
              <line x1={xf(p.freqMHz)} y1={yD(p.dB)} x2={xf(p.freqMHz)} y2={yD(p.dB) - 18} stroke="#ef4444" strokeWidth="1" />
              <text x={xf(p.freqMHz)} y={yD(p.dB) - 22} fontSize="9" fill="#ef4444" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{p.dB.toFixed(1)} dB</text>
              <text x={xf(p.freqMHz)} y={yD(p.dB) - 32} fontSize="8" fill="#ef4444" textAnchor="middle" fontFamily="JetBrains Mono, monospace" opacity="0.7">{fmtFreq(p.freqMHz)}</text>
            </g>
          ))}
        </svg>
      )}

      <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(15,10,5,0.4)", borderRadius: 3, fontSize: 10, color: "#a8a29e", lineHeight: 1.6 }}>
        💡 <strong style={{ color: "#fbbf24" }}>Touchstone .s1p format:</strong> first comment lines start with <code>!</code>. Options line starts with <code>#</code> (e.g. <code># MHz S DB R 50</code>). Data rows: freq, parameter-a, parameter-b. Supported formats: <strong>MA</strong> (magnitude + angle), <strong>DB</strong> (dB + angle), <strong>RI</strong> (real + imaginary). Red dashes show VSWR=2 threshold; peaks above indicate likely impedance discontinuities (bad crimp, damaged shield, water ingress).
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MULTI-SEGMENT LINK BUDGET
// ═══════════════════════════════════════════════════════════════
function BOMPanel({ segments, freq }) {
  const bom = useMemo(() => {
    const cables = {}, connectors = {};
    let amps = 0, attens = 0, splitters = [];
    const items = [];
    segments.forEach(s => {
      if (s.type === "cable") {
        const c = CABLES[s.cableId];
        if (!c) return;
        if (!cables[s.cableId]) cables[s.cableId] = { cable: c, totalLength: 0, qty: 0 };
        cables[s.cableId].totalLength += s.lengthM || 0;
        cables[s.cableId].qty += 1;
      } else if (s.type === "connector") {
        const c = CONNECTORS[s.connectorId];
        if (!c) return;
        if (!connectors[s.connectorId]) connectors[s.connectorId] = { connector: c, qty: 0 };
        connectors[s.connectorId].qty += 1;
      } else if (s.type === "amp") { amps++; }
      else if (s.type === "atten") { attens++; }
      else if (s.type === "splitter") { splitters.push(s.nWay); }
    });
    Object.values(cables).forEach(c => items.push({ category: "Cable", item: c.cable.name, spec: `${c.cable.z} Ω, OD ${c.cable.OD.toFixed(2)} mm`, qty: `${c.totalLength} m total`, maker: c.cable.makers }));
    Object.values(connectors).forEach(c => items.push({ category: "Connector", item: c.connector.name, spec: `${c.connector.z} Ω, ${c.connector.fMax} GHz`, qty: `${c.qty} pcs`, maker: "various (Amphenol, Huber+Suhner, Radiall, etc.)" }));
    if (amps) items.push({ category: "Active", item: "Amplifier", spec: "application-specific (LNA/PA)", qty: `${amps} pcs`, maker: "Mini-Circuits, Qorvo, RFMD, etc." });
    if (attens) items.push({ category: "Passive", item: "Attenuator pad", spec: "50 Ω fixed-value", qty: `${attens} pcs`, maker: "Mini-Circuits, Pasternack, etc." });
    splitters.forEach(n => items.push({ category: "Passive", item: `${n}-way splitter / divider`, spec: `Wilkinson or resistive, ${SPLITTER_LOSS[n]} dB loss`, qty: "1 pc", maker: "Mini-Circuits, Marki, Pasternack, etc." }));
    return items;
  }, [segments]);

  const csv = useMemo(() => {
    const header = "Category,Item,Spec,Qty,Typical maker\n";
    const rows = bom.map(b => [b.category, b.item, b.spec, b.qty, b.maker].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    return header + rows;
  }, [bom]);

  const markdown = useMemo(() => {
    const header = "| Category | Item | Spec | Qty | Maker |\n|---|---|---|---|---|\n";
    const rows = bom.map(b => `| ${b.category} | ${b.item} | ${b.spec} | ${b.qty} | ${b.maker} |`).join("\n");
    return `# RF Link Budget BOM (@ ${freq} MHz)\n\n${header}${rows}\n`;
  }, [bom, freq]);

  const [copied, setCopied] = useState(null);
  const copy = async (what, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 2000); } catch {}
  };
  const downloadCSV = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rf-link-bom-${freq}mhz.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ marginBottom: 16, padding: 14, background: "rgba(15,10,5,0.5)", border: "1px solid #d97706", borderRadius: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>📋 Bill of Materials</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button onClick={() => copy("csv", csv)} style={bomBtn(copied === "csv")}>{copied === "csv" ? "✓ Copied" : "Copy CSV"}</button>
          <button onClick={() => copy("md", markdown)} style={bomBtn(copied === "md")}>{copied === "md" ? "✓ Copied" : "Copy Markdown"}</button>
          <button onClick={downloadCSV} style={bomBtn(false)}>⬇ Download CSV</button>
        </div>
      </div>
      {bom.length === 0 ? (
        <div style={{ fontSize: 10, color: "#78716c", textAlign: "center", padding: 10 }}>No parts in chain yet. Add some cables / connectors.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, fontFamily: "JetBrains Mono, monospace" }}>
            <thead>
              <tr>
                <th style={bomTh}>CATEGORY</th><th style={bomTh}>ITEM</th><th style={bomTh}>SPEC</th><th style={bomTh}>QTY</th><th style={bomTh}>TYPICAL MAKER</th>
              </tr>
            </thead>
            <tbody>
              {bom.map((b, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "rgba(15,10,5,0.25)" : "transparent" }}>
                  <td style={bomTd}><span style={{ color: b.category === "Cable" ? "#fbbf24" : b.category === "Connector" ? "#38bdf8" : b.category === "Active" ? "#34d399" : "#c084fc" }}>{b.category}</span></td>
                  <td style={{ ...bomTd, color: "#e7e5e4", fontWeight: 600 }}>{b.item}</td>
                  <td style={bomTd}>{b.spec}</td>
                  <td style={{ ...bomTd, color: "#fbbf24" }}>{b.qty}</td>
                  <td style={{ ...bomTd, color: "#78716c", fontSize: 10 }}>{b.maker}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 9, color: "#78716c", marginTop: 8, lineHeight: 1.5 }}>
        💡 BOM auto-generated from your current chain. Use Copy CSV / Markdown to paste into spreadsheet or report. Quantities for cables are total meters; for connectors/amps/splitters are counts.
      </div>
    </div>
  );
}
const bomBtn = (active) => ({ background: active ? "rgba(52,211,153,0.2)" : "rgba(15,10,5,0.4)", color: active ? "#34d399" : "#a8a29e", border: `1px solid ${active ? "#10b981" : "#57534e"}`, padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 2 });
const bomTh = { padding: "6px 10px", textAlign: "left", color: "#a8a29e", borderBottom: "1px solid #2a1f15", fontSize: 9, letterSpacing: 1 };
const bomTd = { padding: "5px 10px", color: "#d6cfc4" };

function defaultSegment(type) {
  const id = "s" + Math.random().toString(36).slice(2, 9);
  if (type === "cable")     return { id, type, cableId: "lmr400", lengthM: 5 };
  if (type === "connector") return { id, type, connectorId: "nType" };
  if (type === "amp")       return { id, type, gain: 15 };
  if (type === "atten")     return { id, type, loss: 3 };
  if (type === "splitter")  return { id, type, nWay: 2 };
  if (type === "custom")    return { id, type, label: "Custom component", loss: 1 };
  return { id, type };
}

const SPLITTER_LOSS = { 2: 3.5, 3: 5.2, 4: 6.5, 6: 8.2, 8: 9.5, 16: 12.5 };
const SEGMENT_TYPES = [
  { v: "cable",     icon: "━", label: "Cable",     color: "#fbbf24" },
  { v: "connector", icon: "◎", label: "Connector", color: "#38bdf8" },
  { v: "amp",       icon: "▲", label: "Amplifier", color: "#34d399" },
  { v: "atten",     icon: "▼", label: "Attenuator", color: "#f97316" },
  { v: "splitter",  icon: "⌂", label: "Splitter",  color: "#c084fc" },
  { v: "custom",    icon: "◆", label: "Custom",    color: "#a8a29e" },
];

function LinkView({ openInLibrary, onPrint, toolPreset, clearToolPreset }) {
  const [freq, setFreq] = useState(() => {
    try { const s = localStorage.getItem("rf-link-freq"); if (s) return Number(s) || 900; } catch {}
    return 900;
  });
  useEffect(() => { try { localStorage.setItem("rf-link-freq", String(freq)); } catch {} }, [freq]);
  const [segments, setSegments] = useState(() => {
    // URL-shared link takes priority over localStorage
    try {
      const params = new URLSearchParams(window.location.search);
      const linkData = params.get("link");
      if (linkData) {
        const decoded = JSON.parse(decodeURIComponent(atob(linkData.replace(/-/g, "+").replace(/_/g, "/"))));
        if (decoded.segments) { if (decoded.freq) setTimeout(() => setFreq(decoded.freq), 0); return decoded.segments; }
      }
    } catch {}
    try { const s = localStorage.getItem("rf-link-chain"); if (s) return JSON.parse(s); } catch {}
    return [
      { id: "tx", type: "tx", power: 30 },
      { id: "c1", type: "cable", cableId: "lmr400", lengthM: 10 },
      { id: "n1", type: "connector", connectorId: "nType" },
      { id: "c2", type: "cable", cableId: "lmr400", lengthM: 5 },
      { id: "n2", type: "connector", connectorId: "nType" },
      { id: "rx", type: "rx", sensitivity: -85 },
    ];
  });
  useEffect(() => { try { localStorage.setItem("rf-link-chain", JSON.stringify(segments)); } catch {} }, [segments]);

  // Auto-fill from agent's analyze_link_chain / calculate_link_budget tool input when user clicks the chip
  useEffect(() => {
    if (!toolPreset || toolPreset.target !== "link" || !toolPreset.data) return;
    const d = toolPreset.data;
    if (d.frequency_mhz) setFreq(Number(d.frequency_mhz));
    // analyze_link_chain shape: { frequency_mhz, stages: [...] }
    if (Array.isArray(d.stages) && d.stages.length >= 2) {
      setSegments(d.stages.map((s, i) => mapAgentSegToLink(s, i)));
    } else if (d.cable_id_or_loss_db_100m && d.cable_length_m) {
      // calculate_link_budget shape — single cable hop. Synthesize a simple chain.
      const cableId = (CABLES[d.cable_id_or_loss_db_100m] ? d.cable_id_or_loss_db_100m : "lmr400");
      const nConn = Number(d.n_connectors) || 2;
      const synth = [{ id: `${_pid()}-tx`, type: "tx", power: Number(d.tx_power_dbm) || 30 }];
      for (let k = 0; k < nConn; k++) synth.push({ id: `${_pid()}-n${k}`, type: "connector", connectorId: "nType" });
      synth.splice(2, 0, { id: `${_pid()}-c`, type: "cable", cableId, lengthM: Number(d.cable_length_m) || 10 });
      synth.push({ id: `${_pid()}-rx`, type: "rx", sensitivity: Number(d.rx_sensitivity_dbm) || -85 });
      setSegments(synth);
    }
    clearToolPreset?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolPreset?.ts]);

  const [shareState, setShareState] = useState(null); // "copied" | "error" | null
  const [showBOM, setShowBOM] = useState(false);

  const shareLink = async () => {
    try {
      const payload = JSON.stringify({ segments, freq });
      const encoded = btoa(encodeURIComponent(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const url = `${window.location.origin}${window.location.pathname}?link=${encoded}#link`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        setShareState("copied");
      } else {
        window.prompt("Copy this URL:", url);
      }
      setTimeout(() => setShareState(null), 2500);
    } catch (e) {
      setShareState("error");
      setTimeout(() => setShareState(null), 2500);
    }
  };

  const stages = useMemo(() => {
    const out = [];
    let pwr = 0;
    segments.forEach((seg, i) => {
      let loss = 0, label = "", sub = "", warn = null;
      if (seg.type === "tx") {
        pwr = seg.power;
        label = "TX"; sub = dbmToPower(pwr) + " transmit";
      } else if (seg.type === "cable") {
        const cable = CABLES[seg.cableId];
        if (!cable) { warn = "Cable missing"; label = "?"; sub = ""; }
        else {
          if (freq > cable.fMax * 1000) warn = `Above fMax (${cable.fMax} GHz)`;
          loss = interpAtten(cable.atten, freq) * seg.lengthM / 100;
          label = cable.name; sub = `${seg.lengthM} m · ${loss.toFixed(2)} dB`;
          pwr -= loss;
        }
      } else if (seg.type === "connector") {
        const conn = CONNECTORS[seg.connectorId];
        loss = conn?.typicalLoss ?? 0.15;
        if (conn && freq > conn.fMax * 1000) warn = `Above ${conn.name} fMax (${conn.fMax} GHz)`;
        label = conn ? conn.name : "Connector"; sub = `${loss.toFixed(2)} dB IL`;
        pwr -= loss;
      } else if (seg.type === "amp") {
        loss = -(seg.gain || 0);
        label = "Amplifier"; sub = `+${seg.gain || 0} dB gain`;
        pwr -= loss;
      } else if (seg.type === "atten") {
        loss = seg.loss || 0;
        label = "Attenuator"; sub = `${loss} dB pad`;
        pwr -= loss;
      } else if (seg.type === "splitter") {
        const n = seg.nWay || 2;
        loss = SPLITTER_LOSS[n] || (10 * Math.log10(n) + 0.5);
        label = `${n}-way splitter`; sub = `÷${n} ports · ${loss.toFixed(1)} dB`;
        pwr -= loss;
      } else if (seg.type === "custom") {
        loss = seg.loss || 0;
        label = seg.label || "Custom"; sub = `${loss} dB`;
        pwr -= loss;
      } else if (seg.type === "rx") {
        label = "RX"; sub = `sens ${seg.sensitivity} dBm`;
      }
      out.push({ ...seg, label, sub, loss, pwrOut: pwr, warn, idx: i });
    });
    return out;
  }, [segments, freq]);

  const txPower = stages[0]?.power ?? 0;
  const rxPower = stages[stages.length - 1]?.pwrOut ?? 0;
  const rxSens = stages[stages.length - 1]?.sensitivity ?? -85;
  const totalLoss = stages.reduce((s, st) => st.type !== "tx" && st.type !== "rx" ? s + (st.loss || 0) : s, 0);
  const margin = rxPower - rxSens;
  const verdict = linkVerdict(margin);
  const cableStageStats = stages.filter((st) => st.type === "cable");
  const totalCableLengthM = cableStageStats.reduce((sum, st) => sum + (Number(st.lengthM) || 0), 0);
  const cableOnlyLoss = cableStageStats.reduce((sum, st) => sum + Math.max(0, Number(st.loss) || 0), 0);
  const passiveLoss = stages.reduce((sum, st) => st.type !== "tx" && st.type !== "rx" ? sum + Math.max(0, Number(st.loss) || 0) : sum, 0);
  const activeGain = stages.reduce((sum, st) => st.loss < 0 ? sum + Math.abs(st.loss) : sum, 0);

  const update = (idx, patch) => setSegments(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  const insert = (atIdx, type) => setSegments(prev => { const a = [...prev]; a.splice(atIdx, 0, defaultSegment(type)); return a; });
  const remove = (idx) => { if (segments[idx].type === "tx" || segments[idx].type === "rx") return; setSegments(prev => prev.filter((_, i) => i !== idx)); };
  const reset = () => setSegments([
    { id: "tx", type: "tx", power: 30 },
    { id: "c1", type: "cable", cableId: "lmr400", lengthM: 10 },
    { id: "rx", type: "rx", sensitivity: -85 },
  ]);

  const cableIdsByName = Object.entries(CABLES).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const connIdsByName = Object.entries(CONNECTORS).sort((a, b) => a[1].name.localeCompare(b[1].name));

  return (
    <div style={S.viewInner}>
      <div style={{ ...S.viewIntro, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 250 }}>
          <strong style={S.viewIntroStrong}>Link Budget.</strong> Chain components (TX → cable → connector → amp/atten/splitter → RX). Edit each stage to see live running power + total loss + margin.
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={shareLink} style={{ background: shareState === "copied" ? "rgba(52,211,153,0.2)" : "rgba(96,165,250,0.15)", color: shareState === "copied" ? "#34d399" : "#60a5fa", border: `1px solid ${shareState === "copied" ? "#10b981" : "#2563eb"}`, padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>{shareState === "copied" ? "✓ Link copied" : shareState === "error" ? "⚠ Error" : "🔗 Share"}</button>
          <button onClick={() => setShowBOM(!showBOM)} style={{ background: showBOM ? "rgba(217,119,6,0.2)" : "transparent", color: showBOM ? "#fbbf24" : "#a8a29e", border: `1px solid ${showBOM ? "#d97706" : "#57534e"}`, padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>📋 BOM {showBOM ? "▲" : "▼"}</button>
          {onPrint && <button onClick={onPrint} style={{ background: "rgba(217,119,6,0.15)", color: "#fbbf24", border: "1px solid #d97706", padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>🖨 Print / PDF</button>}
          <button onClick={reset} style={{ background: "transparent", color: "#a8a29e", border: "1px solid #57534e", padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3, letterSpacing: 1, textTransform: "uppercase" }}>↺ Reset</button>
        </div>
      </div>

      {showBOM && <BOMPanel segments={segments} freq={freq} />}

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center", marginBottom: 18, padding: 14, background: "rgba(15,10,5,0.4)", borderRadius: 4, border: "1px solid #2a1f15" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1, color: "#a8a29e", textTransform: "uppercase", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
            <span>Link frequency</span>
            <span style={{ color: "#fbbf24" }}>{freq < 1000 ? `${freq} MHz` : `${(freq / 1000).toFixed(2)} GHz`}</span>
          </div>
          <input type="range" min={10} max={40000} step={10} value={freq} onChange={e => setFreq(Number(e.target.value))} style={{ width: "100%", accentColor: "#d97706" }} />
        </div>
        <div style={{ padding: "8px 12px", background: `${verdict.color}20`, border: `1px solid ${verdict.color}`, borderRadius: 3, minWidth: 160, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: verdict.color, fontWeight: 700, letterSpacing: 0.5 }}>{verdict.icon} {verdict.title}</div>
          <div style={{ fontSize: 12, color: verdict.color, fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{margin > 0 ? "+" : ""}{margin.toFixed(1)} dB margin</div>
        </div>
      </div>

      <LinkChainTheater3D
        stages={stages}
        freq={freq}
        txPower={txPower}
        rxPower={rxPower}
        rxSens={rxSens}
        totalLoss={totalLoss}
        margin={margin}
        verdict={verdict}
        totalCableLengthM={totalCableLengthM}
        cableOnlyLoss={cableOnlyLoss}
        passiveLoss={passiveLoss}
        activeGain={activeGain}
      />

      <div style={{ display: "flex", alignItems: "stretch", gap: 0, flexWrap: "nowrap", overflowX: "auto", padding: "12px 6px", marginBottom: 16, background: "rgba(15,10,5,0.35)", borderRadius: 4 }}>
        {stages.map((st, i) => (
          <React.Fragment key={st.id}>
            {i > 0 && i < stages.length && (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minWidth: 60, padding: "0 4px", position: "relative" }}>
                <div style={{ fontSize: 9, color: st.loss > 0 ? "#ef4444" : st.loss < 0 ? "#34d399" : "#78716c", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{st.loss > 0 ? `-${st.loss.toFixed(2)}` : st.loss < 0 ? `+${(-st.loss).toFixed(1)}` : "0"} dB</div>
                <div style={{ width: "100%", height: 2, background: `linear-gradient(90deg, #fbbf24 0%, ${st.pwrOut > rxSens ? "#34d399" : "#ef4444"} 100%)`, margin: "4px 0" }} />
                <div style={{ fontSize: 9, color: "#a8a29e", fontFamily: "JetBrains Mono, monospace" }}>{st.pwrOut.toFixed(1)} dBm</div>
                <button onClick={() => insert(i, "cable")} style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)", width: 16, height: 16, borderRadius: "50%", background: "#0a0705", border: "1px solid #57534e", color: "#a8a29e", fontSize: 10, lineHeight: "14px", cursor: "pointer", padding: 0 }} title="Insert cable here">+</button>
              </div>
            )}
            <SegmentCard stage={st} onUpdate={(patch) => update(i, patch)} onRemove={() => remove(i)} onAdd={(type) => insert(i + 1, type)} isLast={i === stages.length - 1} isFirst={i === 0} cableOptions={cableIdsByName} connOptions={connIdsByName} openInLibrary={openInLibrary} />
          </React.Fragment>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
          <thead>
            <tr>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "#a8a29e", borderBottom: "1px solid #2a1f15", fontSize: 10, letterSpacing: 1 }}>#</th>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "#a8a29e", borderBottom: "1px solid #2a1f15", fontSize: 10, letterSpacing: 1 }}>COMPONENT</th>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "#a8a29e", borderBottom: "1px solid #2a1f15", fontSize: 10, letterSpacing: 1 }}>DETAIL</th>
              <th style={{ padding: "8px 10px", textAlign: "right", color: "#a8a29e", borderBottom: "1px solid #2a1f15", fontSize: 10, letterSpacing: 1 }}>LOSS / GAIN</th>
              <th style={{ padding: "8px 10px", textAlign: "right", color: "#a8a29e", borderBottom: "1px solid #2a1f15", fontSize: 10, letterSpacing: 1 }}>POWER OUT</th>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "#a8a29e", borderBottom: "1px solid #2a1f15", fontSize: 10, letterSpacing: 1 }}>NOTE</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((st, i) => (
              <tr key={st.id} style={{ background: i % 2 === 0 ? "rgba(15,10,5,0.25)" : "transparent" }}>
                <td style={{ padding: "6px 10px", color: "#78716c" }}>{i + 1}</td>
                <td style={{ padding: "6px 10px", color: "#e7e5e4", fontWeight: 600 }}>{st.label}</td>
                <td style={{ padding: "6px 10px", color: "#a8a29e" }}>{st.sub}</td>
                <td style={{ padding: "6px 10px", textAlign: "right", color: st.loss > 0 ? "#ef4444" : st.loss < 0 ? "#34d399" : "#78716c", fontWeight: 600 }}>{st.type === "tx" || st.type === "rx" ? "—" : `${st.loss > 0 ? "-" : st.loss < 0 ? "+" : ""}${Math.abs(st.loss).toFixed(2)} dB`}</td>
                <td style={{ padding: "6px 10px", textAlign: "right", color: st.pwrOut >= rxSens || st.type === "tx" ? "#fbbf24" : "#ef4444", fontWeight: 600 }}>{st.type === "tx" ? `${st.power} dBm` : `${st.pwrOut.toFixed(2)} dBm`}</td>
                <td style={{ padding: "6px 10px", color: st.warn ? "#f97316" : "#78716c", fontSize: 10 }}>{st.warn || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 10, color: "#78716c", marginTop: 12, padding: "10px 12px", background: "rgba(15,10,5,0.3)", borderRadius: 3, lineHeight: 1.6 }}>
        💡 <strong style={{ color: "#a8a29e" }}>Tip:</strong> Click <strong style={{ color: "#fbbf24" }}>+</strong> between segments to insert a cable. Click icon buttons at the bottom of each card (━ ◎ ▲ ▼ ⌂) to insert other component types. Frequency slider affects all cables + connectors in the chain.
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 8 }}>Component guide — what each does + example</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 }}>
          {[
            { icon: "━", color: "#fbbf24", name: "Cable",
              what: "RF transmission line carrying signal from source to load. Loss rises with length, frequency, and skin effect; drops with larger conductor + lower-εr dielectric.",
              example: "LMR-400 at 2.4 GHz, 10 m → 1.26 dB loss. Doubling length doubles dB. Going from 1 GHz → 5 GHz ≈ 2.2× more loss." },
            { icon: "◎", color: "#38bdf8", name: "Connector",
              what: "Mechanical interface between two cables (or cable-to-device). Adds small fixed insertion loss (0.1–0.3 dB typical) plus potential impedance bump and PIM. Every joint = one more loss point.",
              example: "N-type male/female mate → 0.15 dB IL. 5 connectors in a chain → 0.75 dB total — not free even though each seems small." },
            { icon: "▲", color: "#34d399", name: "Amplifier (amp)",
              what: "Active device that ADDS RF power (gain in positive dB). Uses DC power to boost signal. Placed near RX antenna (LNA) to raise weak signal above noise floor, or near TX (PA) for transmit power.",
              example: "LNA with +20 dB gain: input -75 dBm → output -55 dBm. Compensates for a 20 dB cable loss at TX end, keeping RX SNR intact." },
            { icon: "▼", color: "#f97316", name: "Attenuator (pad)",
              what: "Passive fixed-loss pad that INTENTIONALLY reduces signal. Uses: protect sensitive RX from overload, isolate reflections, impedance matching, test-setup calibration.",
              example: "Spectrum analyzer with +30 dBm TX nearby → insert 20 dB attenuator to bring signal down to +10 dBm (safe for analyzer's -10 dBm max input)." },
            { icon: "⌂", color: "#c084fc", name: "Splitter / divider",
              what: "Divides input signal into N equal outputs. Each output receives 1/N of input power (ideal), plus 0.5–1 dB extra insertion loss. Resistive splitters simplest; Wilkinson / hybrid have better isolation.",
              example: "2-way splitter: -3.5 dB per port (ideal 3.0 + 0.5 loss). 4-way: -6.5 dB. 8-way: -9.5 dB. Used in DAS to feed multiple antennas from one TX." },
            { icon: "◆", color: "#a8a29e", name: "Custom",
              what: "Any other component with user-defined fixed loss or gain. Use for filters, circulators, isolators, switches, bias tees, couplers, or unknown passive devices.",
              example: "Bandpass filter in passband → 1 dB IL. Circulator → 0.4 dB IL per port. 10-dB directional coupler's through path → 0.5 dB IL." },
          ].map((c) => (
            <div key={c.name} style={{ padding: "10px 12px", background: "rgba(15,10,5,0.5)", border: `1px solid ${c.color}44`, borderRadius: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <div style={{ width: 24, height: 24, borderRadius: 3, background: `${c.color}22`, border: `1px solid ${c.color}`, color: c.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{c.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: c.color, letterSpacing: 0.5 }}>{c.name}</div>
              </div>
              <div style={{ fontSize: 10, color: "#d6cfc4", lineHeight: 1.55, marginBottom: 6 }}>{c.what}</div>
              <div style={{ fontSize: 10, color: "#a8a29e", lineHeight: 1.55, paddingLeft: 8, borderLeft: `2px solid ${c.color}55`, fontStyle: "italic" }}><strong style={{ color: c.color, fontStyle: "normal" }}>Example:</strong> {c.example}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(15,10,5,0.5)", border: "1px solid #2a1f15", borderRadius: 4 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 6 }}>Common real-world chains</div>
          <div style={{ fontSize: 10.5, color: "#d6cfc4", lineHeight: 1.7, fontFamily: "JetBrains Mono, monospace" }}>
            <div>📡 <strong style={{ color: "#fbbf24" }}>Cellular macro (LTE 2600 MHz, 20W TX):</strong> TX 43 dBm → LDF4-50A 40m → 4.3-10 → splitter 2-way → LDF4 5m → antenna. Margin ~8-12 dB typical.</div>
            <div>📶 <strong style={{ color: "#fbbf24" }}>Outdoor Wi-Fi bridge (5.8 GHz, 20 dBm):</strong> router → LMR-400 15m → N → antenna. Loss ~5 dB, margin depends on RX −74 dBm sens + antenna gain.</div>
            <div>🛰️ <strong style={{ color: "#fbbf24" }}>GPS receiver (1.57 GHz):</strong> GPS antenna (gain +3 dBi) → LNA +25 dB gain → LMR-240 20m → GPS receiver. LNA near antenna = critical (no cable before it).</div>
            <div>🔬 <strong style={{ color: "#fbbf24" }}>VNA test (up to 18 GHz):</strong> VNA port (0 dBm) → SUCOFLEX 104 1.5m → SMA → DUT. Need low phase drift cable.</div>
            <div>📺 <strong style={{ color: "#fbbf24" }}>Broadcast FM (100 MHz, 10 kW):</strong> TX +70 dBm → LDF7-50A 80m → 7/16 DIN → antenna. Large cable mandatory for kW-class power + low loss.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CableDetailDisclosure({ eyebrow, title, sub, children }) {
  return (
    <section style={S.cdDisclosure}>
      <div style={S.cdDisclosureSummary}>
        <span style={S.cdDisclosureTitleWrap}>
          <span style={S.cdDisclosureEyebrow}>◆ {eyebrow}</span>
          <span style={S.cdDisclosureTitle}>{title}</span>
          {sub && <span style={S.cdDisclosureSub}>{sub}</span>}
        </span>
      </div>
      <div style={S.cdDisclosureBody}>{children}</div>
    </section>
  );
}

function LinkChainTheater3D({ stages, freq, txPower, rxPower, rxSens, totalLoss, margin, verdict, totalCableLengthM, cableOnlyLoss, passiveLoss, activeGain }) {
  const cableStages = stages.filter((st) => st.type === "cable");
  const primaryCableId = cableStages[0]?.cableId || "lmr400";
  const primaryCable = CABLES[primaryCableId] || CABLES.lmr400;
  const linkLength = Math.max(1, totalCableLengthM || cableStages[0]?.lengthM || 10);
  const chainStages = stages.filter((st) => st.type !== "tx" && st.type !== "rx");
  const componentSummary = chainStages.length
    ? chainStages.slice(0, 4).map((st) => st.type === "cable" ? CABLES[st.cableId]?.name || "Cable" : st.label).join(" · ")
    : "direct TX to RX";
  const title = `${chainStages.length + 2} stages · ${freq < 1000 ? `${freq} MHz` : `${(freq / 1000).toFixed(2)} GHz`}`;
  const chainSub = [
    `${cableOnlyLoss.toFixed(2)} dB cable`,
    `${Math.max(0, passiveLoss - cableOnlyLoss).toFixed(2)} dB components`,
    activeGain > 0 ? `${activeGain.toFixed(1)} dB active gain` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div style={S.linkChainTheaterWrap}>
      <LinkBudgetTheater3D
        cable={primaryCable}
        length={linkLength}
        freq={freq}
        txPower={txPower}
        rxPower={rxPower}
        rxSens={rxSens}
        attenPer100m={linkLength ? (cableOnlyLoss * 100 / linkLength) : 0}
        totalLoss={Math.max(0, totalLoss)}
        margin={margin}
        ok={margin > 0}
        eyebrow="Blender GLB chain theater"
        title={title}
        statusText={`${verdict.title} · ${margin > 0 ? "+" : ""}${margin.toFixed(1)} dB`}
        lossLabel={activeGain > 0 ? "Net chain" : "Total chain"}
        lossValue={`${totalLoss.toFixed(2)} dB`}
        lossSub={chainSub}
        txSub={dbmToPower(txPower)}
        rxSub={`sens ${rxSens} dBm · ${dbmToPower(rxPower)}`}
      >
        <LinkTheaterStageRail stages={stages} rxSens={rxSens} />
      </LinkBudgetTheater3D>
      <div style={S.linkChainCaption}>
        <span style={S.linkChainCaptionLabel}>Chain read</span>
        <span>{componentSummary}</span>
      </div>
    </div>
  );
}

function LinkTheaterStageRail({ stages, rxSens }) {
  const compact = stages.length > 8;
  const visible = compact ? [...stages.slice(0, 4), ...stages.slice(-3)] : stages;
  return (
    <div style={S.linkTheaterStageRail}>
      {visible.map((st, i) => {
        const typeInfo = st.type === "tx"
          ? { icon: "TX", label: "TX", color: "#fbbf24" }
          : st.type === "rx"
            ? { icon: "RX", label: "RX", color: st.pwrOut >= rxSens ? "#34d399" : "#ef4444" }
            : SEGMENT_TYPES.find((t) => t.v === st.type) || { icon: "◆", label: st.type, color: "#a8a29e" };
        const lossText = st.type === "tx"
          ? `${st.power ?? st.pwrOut} dBm`
          : st.type === "rx"
            ? `${st.pwrOut?.toFixed?.(1) || "?"} dBm`
            : `${st.loss > 0 ? "-" : st.loss < 0 ? "+" : ""}${Math.abs(st.loss || 0).toFixed(st.type === "splitter" ? 1 : 2)} dB`;
        return (
          <React.Fragment key={`${st.id}-${i}`}>
            {compact && i === 4 && <div style={S.linkTheaterStageGap}>+{stages.length - 7}</div>}
            <div style={{ ...S.linkTheaterStageChip, borderColor: `${typeInfo.color}77` }}>
              <div style={{ ...S.linkTheaterStageIcon, color: typeInfo.color, borderColor: `${typeInfo.color}88` }}>{typeInfo.icon}</div>
              <div style={S.linkTheaterStageText}>
                <span style={{ color: typeInfo.color }}>{st.type === "tx" || st.type === "rx" ? typeInfo.label : st.label}</span>
                <small style={{ color: "#94a3b8", fontWeight: 700 }}>{lossText}</small>
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function SegmentCard({ stage, onUpdate, onRemove, onAdd, isFirst, isLast, cableOptions, connOptions, openInLibrary }) {
  const typeInfo = SEGMENT_TYPES.find(t => t.v === stage.type) || { color: "#a8a29e", icon: "●", label: stage.type };
  const isEndpoint = stage.type === "tx" || stage.type === "rx";
  const accent = stage.type === "tx" ? "#fbbf24" : stage.type === "rx" ? "#34d399" : stage.warn ? "#f97316" : typeInfo.color;

  return (
    <div style={{ minWidth: 170, maxWidth: 210, padding: "10px 10px 8px", background: "rgba(15,10,5,0.6)", border: `1px solid ${accent}77`, borderRadius: 4, display: "flex", flexDirection: "column", gap: 5, position: "relative", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 9, letterSpacing: 1, color: accent, fontWeight: 700, textTransform: "uppercase" }}>{typeInfo.icon} {stage.type === "tx" ? "TX" : stage.type === "rx" ? "RX" : typeInfo.label}</div>
        {!isEndpoint && <button onClick={onRemove} style={{ background: "none", border: "none", color: "#78716c", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>✕</button>}
      </div>

      <div style={{ fontSize: 11.5, color: "#fbbf24", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", minHeight: 15 }}>{stage.label}</div>

      {stage.type === "tx" && (
        <div style={{ fontSize: 10 }}>
          <input type="number" value={stage.power} onChange={e => onUpdate({ power: Number(e.target.value) })} style={{ ...segInputStyle }} />
          <span style={{ color: "#78716c", marginLeft: 4 }}>dBm · {dbmToPower(stage.power)}</span>
        </div>
      )}
      {stage.type === "rx" && (
        <div style={{ fontSize: 10 }}>
          <input type="number" value={stage.sensitivity} onChange={e => onUpdate({ sensitivity: Number(e.target.value) })} style={{ ...segInputStyle }} />
          <span style={{ color: "#78716c", marginLeft: 4 }}>dBm sens</span>
        </div>
      )}
      {stage.type === "cable" && (
        <>
          <select value={stage.cableId} onChange={e => onUpdate({ cableId: e.target.value })} style={segSelectStyle}>
            {cableOptions.map(([id, c]) => <option key={id} value={id}>{c.name}</option>)}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
            <input type="number" min={0.1} step={0.1} value={stage.lengthM} onChange={e => onUpdate({ lengthM: Number(e.target.value) })} style={{ ...segInputStyle, width: 55 }} />
            <span style={{ color: "#78716c" }}>m</span>
            <button onClick={() => openInLibrary && openInLibrary(stage.cableId)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontSize: 9, textDecoration: "underline", padding: 0 }}>view</button>
          </div>
        </>
      )}
      {stage.type === "connector" && (
        <select value={stage.connectorId} onChange={e => onUpdate({ connectorId: e.target.value })} style={segSelectStyle}>
          {connOptions.map(([id, c]) => <option key={id} value={id}>{c.name}</option>)}
        </select>
      )}
      {stage.type === "amp" && (
        <div style={{ fontSize: 10 }}>
          <input type="number" value={stage.gain} onChange={e => onUpdate({ gain: Number(e.target.value) })} style={segInputStyle} />
          <span style={{ color: "#78716c", marginLeft: 4 }}>dB gain</span>
        </div>
      )}
      {stage.type === "atten" && (
        <div style={{ fontSize: 10 }}>
          <input type="number" value={stage.loss} min={0} step={0.5} onChange={e => onUpdate({ loss: Number(e.target.value) })} style={segInputStyle} />
          <span style={{ color: "#78716c", marginLeft: 4 }}>dB pad</span>
        </div>
      )}
      {stage.type === "splitter" && (
        <select value={stage.nWay} onChange={e => onUpdate({ nWay: Number(e.target.value) })} style={segSelectStyle}>
          {[2, 3, 4, 6, 8, 16].map(n => <option key={n} value={n}>{n}-way ({SPLITTER_LOSS[n]} dB)</option>)}
        </select>
      )}
      {stage.type === "custom" && (
        <>
          <input type="text" value={stage.label} onChange={e => onUpdate({ label: e.target.value })} placeholder="Component name" style={{ ...segInputStyle, width: "100%" }} />
          <div style={{ fontSize: 10 }}>
            <input type="number" value={stage.loss} step={0.1} onChange={e => onUpdate({ loss: Number(e.target.value) })} style={segInputStyle} />
            <span style={{ color: "#78716c", marginLeft: 4 }}>dB</span>
          </div>
        </>
      )}

      <div style={{ fontSize: 9, color: "#a8a29e", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>{stage.sub}</div>
      {stage.warn && <div style={{ fontSize: 9, color: "#f97316", marginTop: 2 }}>⚠ {stage.warn}</div>}

      {!isLast && (
        <div style={{ position: "absolute", bottom: -16, right: -2, display: "flex", gap: 2 }}>
          {SEGMENT_TYPES.slice(0, 5).map(t => (
            <button key={t.v} onClick={() => onAdd(t.v)} title={`Insert ${t.label}`} style={{ width: 18, height: 18, borderRadius: 2, background: "#0a0705", border: `1px solid ${t.color}55`, color: t.color, fontSize: 9, cursor: "pointer", padding: 0, lineHeight: "16px" }}>{t.icon}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const segInputStyle = { background: "rgba(15,10,5,0.8)", border: "1px solid #57534e", color: "#fbbf24", padding: "3px 6px", fontSize: 11, fontFamily: "JetBrains Mono, monospace", borderRadius: 2, width: 60 };
const segSelectStyle = { background: "rgba(15,10,5,0.8)", border: "1px solid #57534e", color: "#fbbf24", padding: "3px 6px", fontSize: 10.5, fontFamily: "inherit", borderRadius: 2, width: "100%", cursor: "pointer" };

function ConnectorView() {
  const { units } = useContext(SettingsContext);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterZ, setFilterZ] = useState("all");
  const [minFreq, setMinFreq] = useState(0);
  const [expanded, setExpanded] = useState(null);

  const filtered = useMemo(() => {
    return Object.entries(CONNECTORS).filter(([id, c]) => {
      if (filterCat !== "all" && c.cat !== filterCat) return false;
      if (filterZ !== "all" && c.z !== Number(filterZ)) return false;
      if (c.fMax < minFreq) return false;
      if (search) { const q = search.toLowerCase(); if (!(c.name + " " + c.alias + " " + c.apps).toLowerCase().includes(q)) return false; }
      return true;
    }).sort((a, b) => a[1].fMax - b[1].fMax);
  }, [search, filterCat, filterZ, minFreq]);

  return (
    <div style={S.viewInner}>
      <div style={S.viewIntro}>
        <strong style={S.viewIntroStrong}>Connectors.</strong> {Object.keys(CONNECTORS).length} RF connectors with freq range, power, mating, cable-OD compatibility.
      </div>

      <div style={S.filterGrid}>
        <div style={{ gridColumn: "span 2" }}>
          <label style={S.filterLabel}>Search</label>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, alias, application..." style={S.searchInput} />
        </div>
        <div><label style={S.filterLabel}>Impedance</label><select value={filterZ} onChange={(e) => setFilterZ(e.target.value)} style={S.select}><option value="all">All</option><option value="50">50 Ω</option><option value="75">75 Ω</option></select></div>
        <div><label style={S.filterLabel}>Min freq: {minFreq} GHz</label><input type="range" min={0} max={100} step={1} value={minFreq} onChange={(e) => setMinFreq(Number(e.target.value))} style={{ width: "100%", accentColor: "#d97706" }} /></div>
      </div>

      <div style={S.catChips}>
        <button onClick={() => setFilterCat("all")} className="hover-pill" style={{ ...S.catChip, ...(filterCat === "all" ? S.catChipActive : {}) }}>All</button>
        {Object.entries(CONNECTOR_CATEGORIES).map(([k, v]) => (
          <button key={k} onClick={() => setFilterCat(k)} className="hover-pill" style={{ ...S.catChip, ...(filterCat === k ? { ...S.catChipActive, borderColor: v.color, color: v.color } : {}), borderLeftColor: v.color, borderLeftWidth: 3 }}>{v.label}</button>
        ))}
      </div>

      <div style={S.cableList}>
        {filtered.map(([id, c]) => {
          const cat = CONNECTOR_CATEGORIES[c.cat];
          const isOpen = expanded === id;
          const freqDesc = c.fMax >= 1 ? `${c.fMax} GHz` : `${(c.fMax * 1000).toFixed(0)} MHz`;
          return (
            <div key={id} className="hover-card" style={{ ...S.cableCard, ...(isOpen ? S.cableCardExpanded : {}) }}>
              <div onClick={() => setExpanded(isOpen ? null : id)} style={S.cableHead}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
                  <ConnectorPreviewThumb c={c} cat={cat} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                      <span style={S.cableName}>{c.name}</span>
                      <span style={{ ...S.catBadge, color: cat.color, borderColor: cat.color }}>{cat.label}</span>
                    </div>
                    {c.alias && <div style={S.cableAlias}>{wrapTerms(c.alias)}</div>}
                    <div style={S.cableApps}>{wrapTerms(c.apps)}</div>
                  </div>
                </div>
                <div style={S.quickStats}>
                  <QS label="Z" v={`${c.z}Ω`} />
                  <QS label="fMax" v={freqDesc} />
                  <QS label="P" v={`${c.maxPower}W`} />
                  <QS label="M" v={c.mate.slice(0, 5)} />
                  <span style={S.expandIcon}>{isOpen ? "−" : "+"}</span>
                </div>
              </div>
              {isOpen && (
                <div style={S.cableDetails}>
                  <div style={S.detailsGrid}>
                    <div>
                      <DS title="Electrical">
                        <DR label="Impedance" v={`${c.z} Ω`} />
                        <DR label="Max frequency" v={freqDesc} />
                        {c.precisionFMax && <DR label="Precision fMax" v={`${c.precisionFMax} GHz`} />}
                        <DR label="Max power (avg)" v={`${c.maxPower} W @ 1 GHz`} />
                        <DR label="Typical IL" v={c.typicalIL} />
                        <DR label="Typical VSWR" v={c.typicalVSWR} />
                        {c.typicalPIM && <DR label="PIM" v={c.typicalPIM} />}
                      </DS>
                      <DS title="Mechanical">
                        <DR label="Mate" v={c.mate} />
                        <DR label="Thread / lock" v={c.thread} />
                        <DR label="Weatherproof" v={c.weatherproof} />
                        <DR label="Body diameter" v={fmtLen(c.sizeMm, units)} />
                        <DR label="Body length" v={fmtLen(c.lengthMm, units)} />
                        <DR label="Mass (male)" v={`${c.massG} g`} />
                        <DR label="Cable OD fit" v={`${fmtLen(c.cableOD[0], units)} – ${fmtLen(c.cableOD[1], units)}`} />
                      </DS>
                    </div>
                    <div>
                      {c.render && <ConnectorDetailVisual c={c} />}
                      <DS title="Standards"><DR label="Spec" v={wrapTerms(c.alias)} /></DS>
                      <DS title="Pros">
                        <div style={{ fontSize: 10.5, color: "#86efac", lineHeight: 1.55 }}>✓ {wrapTerms(c.pros)}</div>
                      </DS>
                      <DS title="Cons">
                        <div style={{ fontSize: 10.5, color: "#fca5a5", lineHeight: 1.55 }}>⚠ {wrapTerms(c.cons)}</div>
                      </DS>
                      <DS title="Compatible cables (by OD)">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {Object.entries(CABLES).filter(([, cable]) => cable.OD >= c.cableOD[0] && cable.OD <= c.cableOD[1] && cable.z === c.z).slice(0, 12).map(([cid, cable]) => (
                            <span key={cid} style={{ fontSize: 9.5, color: "#fbbf24", padding: "2px 6px", background: "rgba(217,119,6,0.1)", border: "1px solid #57534e", borderRadius: 2 }}>{cable.name}</span>
                          ))}
                          {Object.entries(CABLES).filter(([, cable]) => cable.OD >= c.cableOD[0] && cable.OD <= c.cableOD[1] && cable.z === c.z).length === 0 && <span style={{ fontSize: 10, color: "#78716c", fontStyle: "italic" }}>No exact-impedance cables in OD range</span>}
                        </div>
                      </DS>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div style={S.emptyState}>No connectors match filters.</div>}
      </div>
    </div>
  );
}

function ConnectorPreviewThumb({ c, cat }) {
  if (c.render) {
    return (
      <span style={S.connectorThumb} aria-hidden="true">
        <img
          src={c.render}
          alt=""
          loading="lazy"
          decoding="async"
          style={S.connectorThumbImage}
        />
      </span>
    );
  }

  return (
    <span style={S.connectorThumbFallback} aria-hidden="true">
      <ConnectorIcon cat={c.cat} color={cat.color} />
    </span>
  );
}

function ConnectorDetailVisual({ c }) {
  return (
    <div style={S.connectorDetailVisual}>
      <img src={c.render} alt={`${c.name} connector render`} style={S.connectorDetailImage} />
    </div>
  );
}

function ConnectorIcon({ cat, color }) {
  const icons = {
    rugged: <g><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="2.5" /><circle cx="24" cy="24" r="10" fill="currentColor" opacity="0.3" /><circle cx="24" cy="24" r="4" fill="currentColor" /><path d="M 8 24 L 12 24 M 36 24 L 40 24 M 24 8 L 24 12 M 24 36 L 24 40" stroke="currentColor" strokeWidth="1.5" /></g>,
    din: <g><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="24" cy="24" r="13" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.5" /><circle cx="24" cy="24" r="5" fill="currentColor" /><circle cx="24" cy="24" r="2" fill="#0a0705" /></g>,
    bayonet: <g><circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="24" cy="24" r="4" fill="currentColor" /><path d="M 24 8 L 30 14 M 24 40 L 18 34 M 8 24 L 14 18 M 40 24 L 34 30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></g>,
    precision: <g><circle cx="24" cy="24" r="12" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="24" cy="24" r="3" fill="currentColor" /><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2,2" /></g>,
    consumer: <g><circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="24" cy="24" r="3" fill="currentColor" /></g>,
    miniature: <g><circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="24" cy="24" r="2" fill="currentColor" /></g>,
  };
  return <svg width="48" height="48" viewBox="0 0 48 48" style={{ color, flexShrink: 0 }}>{icons[cat] || icons.consumer}</svg>;
}

function WizardView({ openInLibrary, toggleCompare, comparedCables }) {
  const { units } = useContext(SettingsContext);
  const [freq, setFreq] = useState(900);
  const [length, setLength] = useState(20);
  const [outdoor, setOutdoor] = useState(true);
  const [flexNeed, setFlexNeed] = useState("any");
  const [powerNeed, setPowerNeed] = useState("medium");
  const [impedance, setImpedance] = useState(50);
  const [priority, setPriority] = useState("loss");

  const results = useMemo(() => {
    const scored = Object.entries(CABLES).map(([id, c]) => {
      const reasons = [];
      const warnings = [];
      let score = 100;

      // Hard filter: impedance
      if (c.z !== impedance) return null;

      // Hard filter: freq must be below fMax
      if (freq > c.fMax * 1000) return null;

      // Outdoor requirement
      if (outdoor && !c.outdoor) { score -= 30; warnings.push("not rated for outdoor"); }
      else if (outdoor && c.outdoor) reasons.push("outdoor-rated");

      // Flex preference
      const flexOrder = { low: 1, medium: 2, high: 3 };
      if (flexNeed !== "any") {
        const want = flexOrder[flexNeed], got = flexOrder[c.flex];
        if (got < want) { score -= 15 * (want - got); warnings.push(`less flex than requested`); }
        else if (got === want) { reasons.push(`${flexNeed}-flex match`); }
        else { reasons.push(`more flex than required`); }
      }

      // Power requirement
      const powerOrder = { low: 1, medium: 2, high: 3 };
      if (powerOrder[c.power] < powerOrder[powerNeed]) { score -= 20; warnings.push("power class below request"); }

      // Loss at freq
      const lossPerHundred = interpAtten(c.atten, freq);
      const totalLoss = lossPerHundred * length / 100;

      // Priority scoring
      if (priority === "loss") score -= totalLoss * 2;
      else if (priority === "cost") {
        const costProxy = { low: 0, medium: 10, high: 25 }[c.complexity] || 0;
        score -= costProxy;
        if (c.complexity === "low") reasons.push("simple / low cost");
      } else if (priority === "size") {
        score -= c.OD * 0.8;
        if (c.OD < 6) reasons.push("compact OD");
      }

      // Bonus reasons
      if (totalLoss < 1) reasons.push(`only ${totalLoss.toFixed(2)} dB loss over ${length} m`);
      else if (totalLoss < 3) reasons.push(`low loss (${totalLoss.toFixed(2)} dB) over the run`);

      if (freq > c.fMax * 1000 * 0.7) warnings.push("near cable fMax");

      return { id, cable: c, score, totalLoss, lossPerHundred, reasons, warnings };
    }).filter(x => x).sort((a, b) => b.score - a.score).slice(0, 5);
    return scored;
  }, [freq, length, outdoor, flexNeed, powerNeed, impedance, priority]);

  const Input = ({ label, children }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 10, color: "#a8a29e", letterSpacing: 1, textTransform: "uppercase" }}>{label}</label>
      {children}
    </div>
  );
  const Seg = ({ value, onChange, options }) => (
    <div style={{ display: "flex", gap: 2, background: "rgba(15,10,5,0.4)", padding: 2, borderRadius: 3, border: "1px solid #2a1f15" }}>
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} style={{ flex: 1, padding: "6px 8px", fontSize: 10.5, background: value === v ? "#d97706" : "transparent", color: value === v ? "#0a0705" : "#a8a29e", border: "none", cursor: "pointer", borderRadius: 2, fontWeight: value === v ? 700 : 400, fontFamily: "inherit" }}>{l}</button>
      ))}
    </div>
  );

  return (
    <div style={S.viewInner}>
      <div style={S.viewIntro}>
        <strong style={S.viewIntroStrong}>Wizard mode.</strong> Answer 5 questions → top 5 cable recommendations with reasoning. Scores 83 cables against your requirements.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24, padding: 16, background: "rgba(15,10,5,0.4)", borderRadius: 4, border: "1px solid #2a1f15" }}>
        <Input label={`Frequency: ${freq < 1000 ? `${freq} MHz` : `${(freq / 1000).toFixed(2)} GHz`}`}>
          <input type="range" min={10} max={40000} step={10} value={freq} onChange={e => setFreq(Number(e.target.value))} style={{ accentColor: "#d97706" }} />
        </Input>
        <Input label={`Length: ${length} m (${(length * 3.28).toFixed(0)} ft)`}>
          <input type="range" min={1} max={200} step={1} value={length} onChange={e => setLength(Number(e.target.value))} style={{ accentColor: "#d97706" }} />
        </Input>
        <Input label="Impedance">
          <Seg value={impedance} onChange={setImpedance} options={[[50, "50 Ω"], [75, "75 Ω"], [93, "93 Ω"]]} />
        </Input>
        <Input label="Location">
          <Seg value={outdoor} onChange={setOutdoor} options={[[false, "Indoor"], [true, "Outdoor"]]} />
        </Input>
        <Input label="Flex needed">
          <Seg value={flexNeed} onChange={setFlexNeed} options={[["any", "Any"], ["low", "Rigid"], ["medium", "Normal"], ["high", "Flex"]]} />
        </Input>
        <Input label="Power class">
          <Seg value={powerNeed} onChange={setPowerNeed} options={[["low", "<100W"], ["medium", "<1kW"], ["high", ">1kW"]]} />
        </Input>
        <Input label="Optimize for">
          <Seg value={priority} onChange={setPriority} options={[["loss", "Low loss"], ["cost", "Low cost"], ["size", "Compact"]]} />
        </Input>
      </div>

      <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 10 }}>Top {results.length} matches</div>

      {results.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", color: "#a8a29e" }}>
          <div style={{ fontSize: 30, opacity: 0.4, marginBottom: 10 }}>🔍</div>
          No cables match these constraints. Try relaxing impedance / frequency / outdoor.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {results.map((r, i) => {
            const rank = i + 1;
            const color = rank === 1 ? "#fbbf24" : rank === 2 ? "#9ca3af" : rank === 3 ? "#a16207" : "#57534e";
            return (
              <div key={r.id} style={{ display: "flex", gap: 14, padding: 14, background: "rgba(15,10,5,0.45)", border: `1px solid ${color}55`, borderRadius: 4, alignItems: "flex-start" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: color, color: "#0a0705", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{rank}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 14, color: "#fbbf24", fontWeight: 700 }}>{r.cable.name}</div>
                    <div style={{ fontSize: 10, color: CATEGORIES[r.cable.cat].color, letterSpacing: 0.5 }}>{CATEGORIES[r.cable.cat].label}</div>
                    <div style={{ fontSize: 10, color: "#a8a29e", fontFamily: "JetBrains Mono, monospace", marginLeft: "auto" }}>Score: {r.score.toFixed(0)}</div>
                  </div>
                  <div style={{ fontSize: 11, color: "#d6cfc4", marginBottom: 6, fontFamily: "JetBrains Mono, monospace" }}>
                    Loss over {length} m @ {freq < 1000 ? `${freq} MHz` : `${(freq / 1000).toFixed(1)} GHz`}: <strong style={{ color: r.totalLoss < 3 ? "#34d399" : r.totalLoss < 10 ? "#fbbf24" : "#ef4444" }}>{r.totalLoss.toFixed(2)} dB</strong> ({r.lossPerHundred.toFixed(2)} dB/100m) · OD {fmtLen(r.cable.OD, units)} · {r.cable.flex} flex
                  </div>
                  {r.reasons.length > 0 && <div style={{ fontSize: 10.5, color: "#34d399", marginBottom: 3 }}>✓ {r.reasons.join(" · ")}</div>}
                  {r.warnings.length > 0 && <div style={{ fontSize: 10.5, color: "#f97316" }}>⚠ {r.warnings.join(" · ")}</div>}
                  <div style={{ fontSize: 10, color: "#a8a29e", marginTop: 6, lineHeight: 1.5 }}>{r.cable.apps}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <button onClick={() => openInLibrary(r.id)} style={{ background: "rgba(217,119,6,0.15)", color: "#fbbf24", border: "1px solid #d97706", padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3, letterSpacing: 0.5 }}>Open in Library</button>
                    <button onClick={() => toggleCompare(r.id)} style={{ background: comparedCables.includes(r.id) ? "rgba(52,211,153,0.15)" : "transparent", color: comparedCables.includes(r.id) ? "#34d399" : "#a8a29e", border: `1px solid ${comparedCables.includes(r.id) ? "#10b981" : "#57534e"}`, padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3, letterSpacing: 0.5 }}>{comparedCables.includes(r.id) ? "✓ In compare" : "+ Compare"}</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════
const GLOSSARY = {
  CCS: "Copper-Clad Steel — steel wire plated with Cu. RF flows in Cu skin-depth, steel core adds tensile strength.",
  SPC: "Silver-Plated Copper — Cu wire with Ag coating. Highest conductivity, resists oxidation. Used in precision RF.",
  OFC: "Oxygen-Free Copper — 99.95%+ pure Cu, no oxide inclusions. Low-loss, used in audio and precision cables.",
  PE: "Polyethylene — common dielectric. εr ≈ 2.30 (solid), ~1.45 (foam). Cheap, stable.",
  HDPE: "High-Density Polyethylene — harder PE grade, used for tough jackets.",
  LDPE: "Low-Density Polyethylene — softer, more flexible PE.",
  PVC: "Polyvinyl Chloride — cheap flexible jacket material. Indoor-rated. Emits HCl when burning.",
  PTFE: "Polytetrafluoroethylene (Teflon) — low-loss high-temp dielectric. εr ≈ 2.10. -55 to +260 °C.",
  FEP: "Fluorinated Ethylene Propylene — high-temp (200 °C) jacket/dielectric. Plenum-rated, chemical resistant.",
  LSZH: "Low-Smoke Zero-Halogen jacket — fire-safe. Releases no corrosive gases when burning.",
  TPE: "Thermoplastic Elastomer — flexible jacket, better cold-temp performance than PVC.",
  VP: "Velocity of Propagation — signal speed relative to speed of light. VP = 1/√εr. Typical 66-88%.",
  "Z0": "Characteristic impedance (Ω). 50 Ω = power/RF, 75 Ω = video/CATV.",
  εr: "Relative permittivity (dielectric constant). Sets impedance and VP. Air=1, PE=2.3, PTFE=2.1.",
  VSWR: "Voltage Standing Wave Ratio — measure of impedance match. 1.0 = perfect, >2.0 = significant mismatch.",
  TDR: "Time-Domain Reflectometry — fast-pulse test that locates discontinuities along cable length.",
  VNA: "Vector Network Analyzer — instrument for full S-parameter (magnitude + phase) characterization.",
  EMI: "Electromagnetic Interference — unwanted radiated noise that shield must block.",
  RF: "Radio Frequency — roughly 100 kHz to 300 GHz band.",
  CCTV: "Closed-Circuit Television — private video surveillance systems (75 Ω).",
  CATV: "Community Antenna Television (cable TV) — 75 Ω distribution.",
  DAS: "Distributed Antenna System — multiple antennas fed through cables for indoor cellular.",
  GPS: "Global Positioning System — 1.57542 GHz (L1) satellite nav. Low-loss cable needed.",
  "MIL-C-17": "US military RF cable specification — defines RG-/M17 cables.",
  BNC: "Bayonet Neill-Concelman — quick-lock connector. OK up to ~4 GHz. Common for test/video.",
  SMA: "SubMiniature A — threaded connector, usable up to 18 GHz (precision to 26).",
  TNC: "Threaded Neill-Concelman — threaded version of BNC, better at mid freq.",
  UHF: "UHF = Ultra High Frequency (300 MHz-3 GHz). Also old PL-259 connector (unrelated to freq).",
  SHF: "Super High Frequency (3-30 GHz).",
  EHF: "Extremely High Frequency (30-300 GHz) — mmWave.",
  dBm: "Decibel-milliwatt. 0 dBm = 1 mW, +30 dBm = 1 W, -30 dBm = 1 µW.",
  OD: "Outer Diameter.",
  ID: "Inner Diameter.",
  AWG: "American Wire Gauge — wire diameter standard. Lower number = thicker wire.",
  "RG-": "Radio Guide — US military-origin cable nomenclature (RG-58, RG-213...).",
  QC: "Quality Control — factory testing of finished cable.",
  fc: "Cutoff frequency — above this, higher-order modes propagate. Coax limit.",
};
const GLOSSARY_KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const GLOSSARY_REGEX = new RegExp(`\\b(${GLOSSARY_KEYS.map(k => k.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|")})\\b`, "g");

function Term({ children }) {
  const key = String(children).toUpperCase();
  const def = GLOSSARY[children] || GLOSSARY[key] || GLOSSARY[children?.toString()];
  if (!def) return <>{children}</>;
  return <span title={def} style={{ borderBottom: "1px dotted rgba(217,119,6,0.55)", cursor: "help" }}>{children}</span>;
}

function wrapTerms(text) {
  if (!text || typeof text !== "string") return text;
  const parts = text.split(GLOSSARY_REGEX);
  return parts.map((part, i) => GLOSSARY[part] ? <Term key={i}>{part}</Term> : <React.Fragment key={i}>{part}</React.Fragment>);
}

const LAYER_INFO = {
  conductor: {
    function: "Carries the RF signal. Ohmic loss depends on conductivity and skin depth — at high freq, current flows only in the outer ~skin-depth of the wire.",
    failure: "Oxidation (bare Cu in humid air), fatigue cracking at flex points, Sn-whisker growth under mechanical stress, galvanic corrosion at connectors.",
    keyProp: "Conductivity (σ, S/m). Cu ≈ 5.96e7, Ag ≈ 6.30e7, Al ≈ 3.50e7.",
  },
  dielectric: {
    function: "Separates conductor from shield. Its permittivity (εr) sets the characteristic impedance and velocity factor (VP = 1/√εr); loss tangent adds attenuation.",
    failure: "Cold flow under long-term compression, UV degradation (if exposed), moisture ingress via foam open cells, heat-induced dimensional drift.",
    keyProp: "Relative permittivity εr. Solid PE 2.30, Foam PE 1.45, PTFE 2.10, Air 1.00.",
  },
  shield: {
    function: "Blocks external EMI from leaking in, and confines RF energy inside the cable. Coverage % (braid) and foil presence determine shielding effectiveness (dB).",
    failure: "Braid fatigue at bend points, foil tears from repeated flex, corrosion of bare Cu braid, shield/jacket adhesion loss exposes shield.",
    keyProp: "Coverage %. Single braid 85-97%, Double braid 99%, Foil+Braid >99% + low-f bond.",
  },
  jacket: {
    function: "Protects inner layers from moisture, UV, abrasion, chemicals. Sets temperature range, flame rating, and outdoor lifespan.",
    failure: "UV cracking (non-stabilized PE), chemical attack (PVC + hydrocarbons), cold-temperature brittleness, rodent damage (outdoor runs).",
    keyProp: "Material + wall thickness. PVC: cheap, flexible, indoor. PE: UV, outdoor. FEP: high-temp. LSZH: indoor fire-safe.",
  },
};

function LayerDetailPanel({ layer, c, onClose, units }) {
  if (!layer) return null;
  const shieldLayer = layer.startsWith("shield")
    ? getShieldLayers(c.cons).find(l => l.key === layer) || getShieldLayers(c.cons)[0]
    : null;
  const baseLayer = shieldLayer ? "shield" : layer;
  const info = LAYER_INFO[baseLayer] || LAYER_INFO.shield;
  const dims = {
    conductor: { label: "Inner conductor d", mm: c.d },
    dielectric: { label: "Dielectric OD", mm: c.D },
    shield: { label: "Shield OD", mm: c.shield },
    jacket: { label: "Jacket OD", mm: c.OD },
  }[baseLayer];
  const matColor = shieldLayer?.color || { conductor: "#fbbf24", dielectric: "#fde68a", shield: "#9ca3af", jacket: "#a8a29e" }[baseLayer];
  const displayName = shieldLayer?.name || baseLayer;
  const materialText = shieldLayer?.desc || c.cons[baseLayer];
  return (
    <div style={{ flex: 1, minWidth: 240, padding: 14, background: "rgba(15,10,5,0.55)", border: `1px solid ${matColor}33`, borderRadius: 4, fontSize: 10.5, lineHeight: 1.55 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${matColor}22` }}>
        <div style={{ color: matColor, fontSize: 10, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase" }}>{displayName}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#a8a29e", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ color: "#e7e5e4", fontWeight: 600, marginBottom: 4 }}>{wrapTerms(materialText)}</div>
      <div style={{ color: "#d6cfc4", marginBottom: 10 }}>{dims.label}: {fmtLen(dims.mm, units)}</div>
      <div style={{ color: "#a8a29e", fontSize: 9.5, letterSpacing: 1.5, marginTop: 8, marginBottom: 3, textTransform: "uppercase" }}>Function</div>
      <div style={{ color: "#d6cfc4", marginBottom: 8 }}>{info.function}</div>
      <div style={{ color: "#a8a29e", fontSize: 9.5, letterSpacing: 1.5, marginBottom: 3, textTransform: "uppercase" }}>Key property</div>
      <div style={{ color: "#d6cfc4", marginBottom: 8 }}>{info.keyProp}</div>
      <div style={{ color: "#a8a29e", fontSize: 9.5, letterSpacing: 1.5, marginBottom: 3, textTransform: "uppercase" }}>Failure modes</div>
      <div style={{ color: "#d6cfc4" }}>{info.failure}</div>
    </div>
  );
}

function SvgLines({ lines, x, y, size = 18, fill = "#f5f5f4", weight = 500, line = 1.45, anchor = "start", italic = false, family = "JetBrains Mono, monospace", opacity = 1 }) {
  return (
    <text x={x} y={y} fill={fill} fontSize={size} fontWeight={weight} fontFamily={family} textAnchor={anchor} fontStyle={italic ? "italic" : "normal"} opacity={opacity}>
      {lines.map((text, i) => <tspan key={i} x={x} dy={i === 0 ? 0 : size * line}>{text}</tspan>)}
    </text>
  );
}

function PosterCallout({ n, title, desc, x, y, tx, ty, side = "left" }) {
  const elbowY = y + 46;
  const elbowX = side === "right" ? x - 28 : x + 28;
  const path = `M ${elbowX} ${elbowY} L ${elbowX} ${ty} L ${tx} ${ty}`;
  return (
    <g>
      <path d={path} stroke="#d6d3d1" strokeWidth="1.2" fill="none" opacity="0.78" />
      <circle cx={tx} cy={ty} r="5" fill="#f59e0b" filter="url(#posterGlow)" />
      <text x={x} y={y} fill="#f59e0b" fontFamily="JetBrains Mono, monospace" fontSize="18" fontWeight="800" letterSpacing="0.8" textAnchor={side === "right" ? "end" : "start"}>
        <tspan fontSize="24">{n}</tspan>  {title.toUpperCase()}
      </text>
      <SvgLines lines={desc} x={x} y={y + 30} size={17} fill="#f5f5f4" anchor={side === "right" ? "end" : "start"} line={1.28} />
    </g>
  );
}

function PosterSpec({ label, value, sub, x, y, w }) {
  const valueLines = Array.isArray(value) ? value : [value];
  const subLines = Array.isArray(sub) ? sub : [sub];
  const center = x + w / 2;
  const valueSize = valueLines.length > 1 ? 17 : 19;
  return (
    <g>
      <line x1={x} y1={y - 44} x2={x} y2={y + 110} stroke="#78716c" strokeWidth="1" opacity="0.7" />
      <circle cx={center} cy={y - 17} r="18" fill="none" stroke="#a8a29e" strokeWidth="1.4" />
      <text x={center} y={y + 20} textAnchor="middle" fill="#d6d3d1" fontFamily="JetBrains Mono, monospace" fontSize="13" letterSpacing="0.7">{label}</text>
      <text x={center} y={y + 53} textAnchor="middle" fill="#f5f5f4" fontFamily="JetBrains Mono, monospace" fontSize={valueSize} fontWeight="700">
        {valueLines.map((text, i) => <tspan key={text} x={center} dy={i === 0 ? 0 : 22}>{text}</tspan>)}
      </text>
      <text x={center} y={y + 86 + (valueLines.length - 1) * 20} textAnchor="middle" fill="#a8a29e" fontFamily="JetBrains Mono, monospace" fontSize="12">
        {subLines.map((text, i) => <tspan key={text} x={center} dy={i === 0 ? 0 : 16}>{text}</tspan>)}
      </text>
    </g>
  );
}

function CableDatasheetPoster({ id, c, units, shieldLayers }) {
  const cat = CATEGORIES[c.cat] || { label: c.cat, color: "#d97706" };
  const cxColor = { low: "#34d399", medium: "#fbbf24", high: "#ef4444" }[c.complexity] || "#fbbf24";
  const cxLabel = { low: "Simple", medium: "Moderate", high: "Complex" }[c.complexity] || c.complexity;
  const sourceMeta = getRfCableSourceMeta(id, c);
  const shieldLayer = shieldLayers?.[0];
  const bendMm = c.OD * 10;
  const attenRows = c.atten.slice(0, 6);
  const odPrimary = units === "imperial" ? `${fmt(c.OD / MM_PER_IN, 2)} in` : `${fmt(c.OD, 1)} mm`;
  const odSub = units === "metric" ? "7/8 in feeder class" : `${fmt(c.OD / MM_PER_IN, 2)} in / 7/8 class`;
  const massPrimary = units === "imperial" ? `${fmt(c.mass * 0.672, 0)} lb/1000ft` : `${fmt(c.mass, 0)} g/m`;
  const massSub = units === "metric" ? "installed run load" : `${fmt(c.mass * 0.672, 0)} lb/1000ft installed`;
  const metrics = [
    { icon: Gauge, label: "Impedance", value: `${c.z} Ω`, sub: "nominal coax" },
    { icon: Activity, label: "Velocity", value: `${c.vp}%`, sub: "air + low-loss spacer" },
    { icon: Ruler, label: "Outer diameter", value: odPrimary, sub: odSub },
    { icon: Radio, label: "Max frequency", value: `${c.fMax} GHz`, sub: "catalog limit" },
    { icon: Weight, label: "Mass", value: massPrimary, sub: massSub },
    { icon: ShieldCheck, label: "Shield", value: "100%", sub: shieldLayer?.name || "continuous shield" },
  ];
  const layers = [
    { n: "01", name: "Outer jacket", desc: c.cons.jacket, color: "#57534e" },
    { n: "02", name: shieldLayer?.name || "Shield", desc: c.cons.shield, color: shieldLayer?.color || "#f97316" },
    { n: "03", name: "Dielectric", desc: c.cons.dielectric, color: "#fde68a" },
    { n: "04", name: "Center conductor", desc: c.cons.conductor, color: "#fbbf24" },
  ];
  return (
    <div style={S.profilePanel}>
      <div style={S.profileHero}>
        <div style={S.profileCopy}>
          <div style={S.profileKicker}>RF library profile</div>
          <div style={S.profileTitleRow}>
            <h2 style={S.profileTitle}>{c.name}</h2>
            <span style={{ ...S.profileBadge, color: cat.color, borderColor: cat.color }}>{cat.label}</span>
            <span style={{ ...S.profileBadge, color: cxColor, borderColor: cxColor }}>{cxLabel}</span>
            <SourceConfidenceBadge meta={sourceMeta} />
          </div>
          <div style={S.profileAlias}>{wrapTerms(c.alias)}</div>
          <p style={S.profileDescription}>{wrapTerms(c.description || c.apps)}</p>
          <div style={S.profileMetricGrid}>
            {metrics.map(metric => <ProfileMetric key={metric.label} {...metric} />)}
          </div>
        </div>
        <div style={S.profileVisual}>
          <img src={c.render} alt={`${c.name} cutaway render`} style={S.profileImage} />
          <div style={S.profileVisualMeta}>
            <span>Layer render</span>
            <span>{fmtLen(bendMm, units, 0)} bend guide</span>
          </div>
        </div>
      </div>

      <div style={S.profileSplit}>
        <div>
          <div style={S.profileSectionTitle}>Layer stack</div>
          <div style={S.profileLayerGrid}>
            {layers.map(layer => <ProfileLayer key={layer.n} {...layer} />)}
          </div>
        </div>
        <div>
          <div style={S.profileSectionTitle}>Typical attenuation</div>
          <div style={S.profileAttenGrid}>
            {attenRows.map(([freq, loss]) => (
              <div key={freq} style={S.profileAttenCell}>
                <div style={S.profileAttenFreq}>{freq < 1000 ? `${freq} MHz` : `${fmt(freq / 1000, 1)} GHz`}</div>
                <div style={S.profileAttenLoss}>{fmt(loss, 2)} dB/100m</div>
                <div style={S.profileAttenSub}>{fmt(loss * 0.3048, 2)} dB/100ft</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileMetric({ icon: Icon, label, value, sub }) {
  return (
    <div style={S.profileMetric}>
      <Icon size={15} style={{ color: "#a8a29e" }} />
      <div>
        <div style={S.profileMetricLabel}>{label}</div>
        <div style={S.profileMetricValue}>{value}</div>
        <div style={S.profileMetricSub}>{sub}</div>
      </div>
    </div>
  );
}

function ProfileLayer({ n, name, desc, color }) {
  return (
    <div style={S.profileLayer}>
      <div style={{ ...S.profileLayerNum, borderColor: color, color }}>{n}</div>
      <div>
        <div style={S.profileLayerName}>{name}</div>
        <div style={S.profileLayerDesc}>{wrapTerms(desc)}</div>
      </div>
    </div>
  );
}

function CableDatasheetHero({ id, c, units, shieldLayers }) {
  const cat = CATEGORIES[c.cat] || { label: c.cat, color: "#d97706" };
  const cxColor = { low: "#34d399", medium: "#fbbf24", high: "#ef4444" }[c.complexity] || "#fbbf24";
  const cxLabel = { low: "Simple", medium: "Moderate", high: "Complex" }[c.complexity] || c.complexity;
  const sourceMeta = getRfCableSourceMeta(id, c);
  const attenRows = c.atten.slice(0, 6);
  const shieldLayer = shieldLayers?.[0];
  const bendMm = c.OD * 10;
  const sheetTitle = id === "ava5" ? "Low-PIM feeder profile" : "RF cable profile";
  const layerCallouts = [
    { n: 1, title: "Outer jacket", desc: c.cons.jacket, style: { right: "5%", top: "7%" }, leader: { from: [78, 25], to: [81, 45] } },
    { n: 2, title: shieldLayer?.name || "Shield", desc: c.cons.shield, style: { left: "35%", top: "6%" }, leader: { from: [48, 25], to: [49, 58] } },
    { n: 3, title: "Dielectric", desc: c.cons.dielectric, style: { left: "4%", top: "23%" }, leader: { from: [18, 39], to: [37, 67] } },
    { n: 4, title: "Center conductor", desc: c.cons.conductor, style: { left: "5%", bottom: "12%" }, leader: { from: [20, 73], to: [31, 67] } },
  ];
  const specs = [
    { icon: Gauge, label: "Impedance", value: `${c.z} Ω`, sub: "nominal coax" },
    { icon: Activity, label: "Velocity", value: `${c.vp}%`, sub: "air/PE spacer" },
    { icon: Ruler, label: "Outer diameter", value: fmtLen(c.OD, units, 1), sub: "7/8 in class" },
    { icon: Radio, label: "Max frequency", value: `${c.fMax} GHz`, sub: "catalog limit" },
    { icon: Weight, label: "Mass", value: fmtMass(c.mass, units, 0), sub: "installed run load" },
    { icon: Ruler, label: "Bend guide", value: fmtLen(bendMm, units, 0), sub: "typ. 10x OD" },
    { icon: ShieldCheck, label: "Shield", value: "100%", sub: shieldLayer?.name || "continuous shield" },
    { icon: Zap, label: "Voltage", value: `${c.vMax} V`, sub: "RMS rating" },
    { icon: Flame, label: "Jacket", value: "Low-halogen PE", sub: c.outdoor ? "outdoor feeder" : "indoor run" },
  ];
  return (
    <div style={S.sheetPanel}>
      <div style={S.sheetHeader}>
        <MiniCrossSection c={c} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={S.sheetKicker}>{sheetTitle}</div>
          <div style={S.sheetTitleRow}>
            <div style={S.sheetTitle}>{c.name}</div>
            <span style={{ ...S.sheetBadge, color: cat.color, borderColor: cat.color }}>{cat.label}</span>
            <span style={{ ...S.sheetBadge, color: cxColor, borderColor: cxColor }}>{cxLabel}</span>
            <SourceConfidenceBadge meta={sourceMeta} />
          </div>
          <div style={S.sheetAlias}>{wrapTerms(c.alias)}</div>
          <div style={S.sheetApps}>{wrapTerms(c.apps)}</div>
        </div>
      </div>

      <div style={S.sheetBody}>
        <div style={S.sheetCopy}>
          <div style={S.sheetSectionLabel}>Description</div>
          <div style={S.sheetDescription}>{wrapTerms(c.description || c.apps)}</div>
          <div style={S.sheetSectionLabel}>Key benefits</div>
          <div style={S.sheetBenefits}>
            {(c.benefits || []).map((benefit) => (
              <div key={benefit} style={S.sheetBenefit}><span style={S.sheetBullet} />{wrapTerms(benefit)}</div>
            ))}
          </div>
        </div>

        <div style={S.sheetVisual}>
          <img src={c.render} alt={`${c.name} generated cutaway`} style={S.sheetImage} />
          {layerCallouts.map((callout) => <CableLayerCallout key={callout.n} {...callout} />)}
        </div>
      </div>

      <div style={S.sheetSpecGrid}>
        {specs.map((spec) => <CableSpecTile key={spec.label} {...spec} />)}
      </div>

      <div style={S.sheetAtten}>
        <div style={S.sheetAttenLabel}>Typical attenuation</div>
        <div style={S.sheetAttenRow}>
          {attenRows.map(([freq, loss]) => (
            <div key={freq} style={S.sheetAttenCell}>
              <div style={S.sheetAttenFreq}>{freq < 1000 ? `${freq} MHz` : `${fmt(freq / 1000, 1)} GHz`}</div>
              <div style={S.sheetAttenLoss}>{fmt(loss, 2)} dB/100m</div>
              <div style={S.sheetAttenSub}>{fmt(loss * 0.3048, 2)} dB/100ft</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CableLayerCallout({ n, title, desc, style, leader }) {
  return (
    <>
      {leader && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={S.sheetCalloutLeader} aria-hidden="true">
          <path d={`M ${leader.from[0]} ${leader.from[1]} L ${leader.to[0]} ${leader.to[1]}`} stroke="#f59e0b" strokeWidth="0.18" fill="none" opacity="0.72" />
          <circle cx={leader.to[0]} cy={leader.to[1]} r="0.55" fill="#f59e0b" />
        </svg>
      )}
      <div style={{ ...S.sheetCallout, ...style }}>
        <div style={S.sheetCalloutTitle}><span style={S.sheetCalloutNum}>{n}</span>{title}</div>
        <div style={S.sheetCalloutDesc}>{wrapTerms(desc)}</div>
      </div>
    </>
  );
}

function CableSpecTile({ icon: Icon, label, value, sub }) {
  return (
    <div style={S.sheetSpecTile}>
      <Icon size={21} strokeWidth={1.6} style={S.sheetSpecIcon} />
      <div style={S.sheetSpecLabel}>{label}</div>
      <div style={S.sheetSpecValue}>{value}</div>
      <div style={S.sheetSpecSub}>{sub}</div>
    </div>
  );
}

const STEP_PATTERNS = [
  [/\b(pim|passive[- ]intermod)\b|low[- ]pim|dbc/i, { title: "Low-PIM (Passive Intermodulation)", body: "PIM = spurious RF signals generated when two strong carriers mix in any non-linear junction (dirty connector, corroded braid, loose foil seam). Critical in cellular base stations where TX and RX bands overlap. Low-PIM construction: annular (not spiral) corrugations, bonded foil, tight shield seams, precision connectors. Spec like -160 dBc @ 2×43 dBm means the PIM product is 160 dB below the carrier — essentially invisible to the receiver." }],
  [/phase[- ]?(stable|match|coherent|track)|low\s*tempco|eye[- ]?opener|miniature\s+phase/i, { title: "Phase-stable construction", body: "Cable engineered so the electrical length (phase delay) stays constant vs temperature, flex, and vibration. Critical for VNA test setups, phased-array antennas, and interferometry where a degree of phase drift ruins the measurement. Achieved via stable PTFE dielectric, low-tempco conductors (Invar-Cu, PTFE tape wrap), and controlled braid geometry." }],
  [/miniature|dense\s+array|\bprobes?\b|small\s+form[- ]factor|chip[- ]to[- ]chip|mmic/i, { title: "Miniature / probe construction", body: "Very small OD cable for crowded test fixtures, VNA probe heads, phased arrays, or chip-level interconnect. Trade-offs: higher loss per meter (smaller conductor cross-section), lower power handling, more delicate to handle. Benefit: fits tight spaces and minimizes mutual coupling between adjacent cables in dense installations." }],
  [/dual[- ]shield|triple[- ]shield|double[- ]shield|dual[- ]screen|multi[- ]layer\s+shield/i, { title: "Multi-layer shield", body: "Two+ shield layers stacked (typically foil + braid, or foil+braid+foil+braid). First foil gives 100% EMI barrier at HF. Braid gives mechanical continuity at connector crimps + blocks low-freq noise. Each added layer improves shielding effectiveness by ~20-30 dB. Required for high-interference environments and high-speed digital (SDI, USB, SAS)." }],
  [/\b(hd[- ]?sdi|3g[- ]?sdi|6g[- ]?sdi|12g[- ]?sdi|sdi)\b|\b(4k|8k|uhd)\b.*(qualif|test|spec)|\b\d+\s*g(hz|b)?\s+qualif/i, { title: "Digital video qualification", body: "Video cables are tested to SDI (Serial Digital Interface) standards: HD-SDI = 1.5 Gb/s, 3G = 3, 6G = 6, 12G = 12 Gb/s (4K/UHD). Each tier requires tighter impedance control, lower jitter, better shielding. 'Full 12 GHz qualification' means the cable passes eye-pattern and return-loss tests all the way to 12 GHz (~6 GHz Nyquist for 12G-SDI)." }],
  [/\b\d+\s*awg\b|\bsolid\s+(bare\s+)?(cu|copper)\b|\b(cu|copper)\s+(wire|rod|draw|inner|core|to|\d)|fine\s+(cu|copper)|precision.*(cu|copper|wire)|cu\s+\d+\.\d+\s*mm|(large|small|medium|fine|heavy)\s+(cu|copper)|specialized.*(cu|copper|draw)/i, { title: "Solid / precision Cu conductor", body: "Solid copper inner conductor. AWG (American Wire Gauge): lower number = thicker wire (18 AWG ≈ 1.02 mm, 14 AWG ≈ 1.63 mm). 'Cu to 2.74 mm ±0.01 mm' means precision-drawn to very tight diameter tolerance — critical because even ±0.05 mm variation causes impedance ripple (VSWR bumps). Solid wire gives slightly lower RF loss than stranded (no skin-effect between strands). Drawback: breaks at repeated bending." }],
  [/\bduo[- ]?foil|\bduo[- ]?bond|bonded\s+foil|foil[- ]polymer|bonded\s+(al|aluminum)/i, { title: "Duobond / bonded foil shield", body: "Aluminum foil laminated to a polymer carrier film, then bonded (glued or heat-seamed) around the dielectric. Provides 100% shield coverage with no gaps. 'Bonded' means the foil is permanently adhered to the dielectric, so it can't shift under flex and create impedance ripple. Common in HD-SDI and high-quality CATV cables." }],
  [/air[- ]?dielectric|spiral.*spacer|helical.*spacer|pe\s+spacer|precision.*spacer|centered.*spacer|air\s*\+\s*(spiral|pe|spacer)|\bspacer\b|air[- ]spaced/i, { title: "Air dielectric with PE spacer", body: "Air is the ideal RF dielectric — εr ≈ 1.00, virtually lossless. A helical / spiral PE ribbon keeps the conductor centered while 90%+ of the volume stays air. Result: VP 90-92% and the lowest loss per diameter of any coax. Downsides: moisture-sensitive (needs pressurization) and more complex to manufacture than foam." }],
  [/\b(n2|nitrogen|dry[- ]?gas|pressuri[sz]|gas[- ]?pressur|moisture\s+control)/i, { title: "Dry N2 gas pressurization", body: "Air-dielectric cables are sealed at 3-10 psi of dry nitrogen to block moisture ingress. Any moisture inside shifts the impedance, raises loss, and can arc under high power. A gas-leak sensor at the headend monitors pressure — a drop triggers service before damage occurs." }],
  [/annular|\b(cu|copper|solid\s+cu)\s+tube|centered\s+alignment/i, { title: "Corrugated Cu tube shield", body: "Solid copper formed into a tube with annular (ring-like) or helical corrugations. Annular rings give better low-PIM (no spiral discontinuities) and more uniform impedance. Weld-seamed longitudinally. Very stiff but provides 100% EMI coverage. Centered alignment of the inner conductor is critical for impedance consistency." }],
  [/low(er)?\s+loss|less\s+loss|better\s+loss|reduced\s+loss|foam\s+ldf|vs\.?\s+foam/i, { title: "Loss advantage vs foam", body: "Air-dielectric designs achieve lower loss than equivalent foam cables because air (εr 1.00) has zero loss tangent while even foam PE has small dielectric absorption. Typical benefit: ~30-40% lower loss per meter at the same OD. Trade-off: higher cost, stiffer, needs pressurization." }],
  [/bend\s+radius|flex(ib)?l?e?\s+(run|bend|install)|tight\s+bend|hyperbend/i, { title: "Bend radius constraint", body: "Large Heliax / corrugated cables have minimum bend radius ≈ 10-20× cable OD. Bending tighter will kink the corrugated shield, creating an impedance discontinuity (VSWR bump) and sometimes cracking the dielectric. Hyperbend / SuperFlex variants allow tighter bends via redesigned corrugation geometry." }],
  [/flex\s+cycles?|\d+\+?\s*(flex|bend|cycle)|bend\s+cycles?|drum\s+reel|robot\s+arm|repeated\s+(flex|bend)|repositioning|pan[- ]tilt/i, { title: "Flex cycle endurance testing", body: "Cable is mechanically cycled through its minimum bend radius thousands of times to verify no performance degradation. UltraFlex / SuperFlex grades rate for 1000-10,000+ cycles. Standard cables may fail after 100-500 cycles due to shield fatigue, dielectric cold-flow, or conductor breakage. Critical for robotic arms, PTZ cameras, cable reels, drum-wound deployables." }],
  [/high[- ]?power\s+broadcast|very\s+high[- ]?power|high[- ]?power|broadcast\s+trunk|tower\s+feed|cellular\s+feeder/i, { title: "High-power application note", body: "This step positions the cable for high-power RF service — broadcast TV/FM (1-100 kW), high-power cellular base stations, or radar feeds. Large conductor cross-section and robust dielectric are required to dissipate heat and withstand voltage. Look at the cable's vMax (V RMS) and thermal rating spec to verify margin." }],
  [/\b(ccs|copper[- ]clad[- ]steel)\b/i, { title: "CCS (Copper-Clad Steel)", body: "Steel wire electroplated with copper. RF current flows in the outer skin depth (~2 µm at 1 GHz), so a thin Cu layer carries all the RF signal. Steel core adds tensile strength and reduces cost vs pure Cu. Drawback: higher DC/LF resistance." }],
  [/\b(spc|silver[- ]?plat)/i, { title: "Silver-plated copper (SPC)", body: "Cu wire with thin Ag coating (~2-5 µm). Silver has the highest conductivity of any metal, reducing skin-effect loss at GHz. Also resists oxidation — stable over years. Common in aerospace, military, and precision RF cables." }],
  [/\b(tin[- ]?plat|tinned\s+c[ou])/i, { title: "Tin-plated copper", body: "Cu strand with tin plating. Tin resists oxidation (still solderable after years in humid/marine environments). Slightly lower conductivity than bare Cu, but far more reliable for outdoor / long-life service. Standard for shields and conductors in commercial RF cables." }],
  [/(19|7)[- ]?strand|draw.*(bunch|strand)|bunch.*strand|stranded/i, { title: "Drawing + stranding", body: "Copper rod is pulled through progressively smaller dies to reach target strand diameter (e.g. 0.18 mm). Multiple strands are then twisted together (bunched or concentric-lay). Stranded = flexible bend. Solid = slightly lower RF loss but breaks at repeated flex points. 19-strand pattern = 1 center + 6 inner + 12 outer." }],
  [/foam\s*pe|gas[- ]?foam|gas[- ]?inject/i, { title: "Foam PE dielectric", body: "Polyethylene with gas bubbles injected (~30-50% air by volume). Lower effective εr (~1.45 vs 2.30 solid PE) → higher velocity factor (VP 80-88%) and lower loss. Used in low-loss cables: LMR, Heliax, RG-6. Downside: open-cell foam can absorb moisture over time." }],
  [/ptfe|teflon|sinter/i, { title: "PTFE / Teflon dielectric", body: "Paste-extruded PTFE, then sintered at 370°C. Very low loss tangent, stable -55 to +260°C, εr ≈ 2.10. Used in aerospace / military / high-freq (RG-142, RG-178, semi-rigid). Expensive, needs specialized extrusion." }],
  [/\b(pe|polyeth)\s*(extrus|jacket|dielectric)|extrude\s+(solid\s+)?pe|pe\s+at\s+\d/i, { title: "PE dielectric extrusion", body: "Polyethylene pellets melted at 180-220°C, extruded through a die that wraps the conductor concentrically. PE = cheap, stable, low loss, εr ≈ 2.30. Geometry sets impedance and velocity factor. Concentricity tolerance is tight (±0.05 mm) — determines cable quality." }],
  [/\bextrud(e|ing|ed|sion)\b/i, { title: "Extrusion", body: "Molten polymer pushed through a shaped die around the conductor or dielectric. Temperature, pressure, and line speed are tightly controlled. Defects (voids, eccentricity) cause impedance ripple that shows up as VSWR bumps." }],
  [/\bbraid/i, { title: "Braided shield", body: "Multiple thin wires (tinned or bare Cu) woven at an angle around the dielectric. Coverage % (80-97%) = fraction of surface covered. Higher coverage = better EMI shielding. Flexible, kink-tolerant. Trade-off: can't reach 100% like foil, so high-freq leakage through braid gaps." }],
  [/al[- ]?(polymer|foil)|\bfoil\b|duobond|longitudinal.*(tape|foil)/i, { title: "Foil shield", body: "Thin aluminum foil bonded to a polymer film, wrapped longitudinally around the dielectric. 100% coverage — blocks high-frequency EMI perfectly. Usually paired with a braid underneath (foil+braid combo) so the braid provides mechanical continuity at connector crimps." }],
  [/corrugat|heliax|seam[- ]?weld|solid\s+cu\s+tube|rigid/i, { title: "Corrugated Cu tube shield", body: "Solid copper tape formed into a tube around the dielectric, seams welded continuously. Corrugations let it flex (accordion-like). 100% shielding, virtually zero leakage — used in Heliax / rigid tower feeders. Expensive, stiff, requires minimum bend radius (~20× OD)." }],
  [/\bfep\b/i, { title: "FEP jacket/dielectric", body: "Fluorinated Ethylene Propylene. High-temp (200°C continuous), chemically inert, low smoke. Used for high-temp cables and plenum-rated commercial building cables (air-handling space). Expensive but required by fire code in some installs." }],
  [/\bpvc\b|non[- ]?contaminating/i, { title: "PVC jacket", body: "Polyvinyl chloride, extruded over the shield at 160-200°C. Cheap, flexible, flame-retardant (self-extinguishing). Indoor-rated. 'Non-contaminating' grade = no plasticizer migration into dielectric (would slowly degrade foam PE). 'Matte' finish = low reflection for studio visibility. Emits HCl when burning — not allowed in LSZH / plenum zones." }],
  [/\bpe\s*jacket|black\s+(uv|pe).*jacket|uv[- ]?resist|carbon[- ]?black/i, { title: "PE jacket (UV-stable)", body: "Polyethylene jacket, carbon-black-filled for UV stability. Tough, moisture-resistant, outdoor/buried-rated. Higher temp limit and chemical resistance than PVC. Used for outdoor drops, towers, marine. Less flexible than PVC." }],
  [/\b(lszh|low[- ]?smoke|plenum)\b|fire[- ]safe|air[- ]handl|ul\s*910|\bcm[pr]\b|fire[- ]?retard/i, { title: "LSZH / plenum / fire-safe jacket", body: "Cable rated for indoor air-handling spaces (plenum) or fire-safety zones. LSZH (Low-Smoke Zero-Halogen): when burning, releases minimal smoke and no corrosive halides. 'UL 910' and 'CMP' ratings certify plenum use. Required in commercial buildings because burning PVC would release HCl into air ducts, damaging electronics and people. Compounds: FEP, LSZH PVC, or specialty thermoplastics." }],
  [/tdr|time[- ]?domain|impedance.*test/i, { title: "TDR (Time-Domain Reflectometry)", body: "Sends a fast-rising step pulse into the cable; measures reflections vs time. Detects impedance discontinuities, damage, connector quality, and cable length. Production QC for every reel. A healthy 50 Ω cable shows a flat trace at 50 Ω ±1-2 Ω along its length." }],
  [/capacit.*(test|check)|\btest.*capacit|\bcap\b.*test/i, { title: "Capacitance test", body: "Measures capacitance per unit length (pF/m). Verifies dielectric geometry and material consistency. Typical for 50Ω: 100 pF/m (solid PE), 80 pF/m (foam PE). Deviation → off-center conductor or voids in dielectric → impedance variations." }],
  [/hi[- ]?pot|high[- ]?pot|voltage\s+test|impulse.*voltage/i, { title: "High-voltage (hi-pot) test", body: "Applies 2-10 kV between conductor and shield for a set time (e.g. 1 minute). Verifies dielectric has no voids, no moisture, no defects that would arc-over in service. Impulse variant uses a fast lightning-simulation pulse. Failure = arc = reject reel." }],
  [/sweep|\bvswr\b|\bvna\b|insertion[- ]?loss|return[- ]?loss|\brl\b\s*<|s[- ]?param/i, { title: "VSWR / loss sweep / return loss test", body: "Sweeps frequency across the cable's spec range, measuring VSWR (reflection) and insertion loss. Verifies impedance consistency and attenuation spec. Typical pass: VSWR < 1.3 across full band. Production: automated sweep. Precision instrument cables: full VNA characterization (S-parameters: magnitude + phase of S11/S21). Spec 'VSWR < 1.3 to 12.4 GHz' = reflection coefficient < 13% over entire rated bandwidth." }],
  [/military|mil[- ]?spec|airborne\s+qualif|\bm17[\/-]|def[- ]stan|mil[- ]std|aerospace\s+qualif|defense\s+qualif|\bnavy\b|\barmy\b|\bair\s*force\b|\bradar\b\s+(qualif|spec)/i, { title: "Military / aerospace qualification", body: "Cable certified to specific defense or aerospace standards (MIL-C-17, MIL-STD-188, DEF-STAN, AS9100). Testing covers temperature cycling -65 to +200 °C, vibration, shock, humidity, altitude, fungus, salt spray, EMI/EMC. Qualification costs 3-10× a commercial cable but guarantees reliability for airborne radar, satellite, submarine, avionics. Look for M17/XX designations or specific aircraft platform approvals." }],
  [/\d+\s*[ΩΩohm]\b\s*(unusual|unique|rare|historical|legacy|obsolete)|unusual\s+impedance|legacy\s+(data|system|equip)|historical\s+(data|system)|obsolete\s+system|\b(93|125|35)\s*[ΩΩohm]\b/i, { title: "Unusual / legacy impedance", body: "Most modern RF uses 50 Ω (power / wireless) or 75 Ω (video / CATV). Other impedances exist in legacy systems: 93 Ω for IBM 3270 terminals and ARCnet (1970s-80s data), 125 Ω for some industrial, 35 Ω for power RF. Using a non-standard cable with 50/75 Ω equipment causes VSWR mismatch, reflection, and reduced efficiency — it still works but carries a ~0.5-1 dB penalty plus standing-wave issues at high freq." }],
  [/\bgost\b|\bgb[\/-]?t?\s*\d|\bjis\b|\bbs\s*\d|\bdin\s+\d|\biec\s*\d{4}|\b(national|regional|domestic|russian|chinese|japanese|german|british|italian|korean|cis)\s+(standard|spec|market|class|system)|standard\s+gost|gb\/t/i, { title: "National / regional standard", body: "Cable meets a country- or region-specific RF standard: GOST (Russia / CIS), GB/T (China), JIS (Japan), IEC (international), DIN (Germany), BS (UK), MIL (US). Standards often parallel each other but differ in test rigor, jacket rating, and naming. Equivalence: RG-58 ≈ SYV-50-3 (China) ≈ RK-50-2 (Russia). Important for cross-border sourcing, customs compliance, and regulatory certification." }],
  [/compromise\s+between|between\s+rg[- ]?\d|bridges?\s+the\s+gap|middle\s+ground|between.*rg|equivalent\s+to|alternative\s+to|replacement\s+for|competitor\s+(to|of)|rg[- ]?\d+\s*(equivalent|class)|roughly\s+rg/i, { title: "Positioning / substitution note", body: "This note positions the cable relative to other cables in the catalog — showing it as a middle-ground option, direct equivalent, or competitor. E.g., 'compromise between RG-58 and RG-213' means it sits in the middle on loss, OD, and power. Useful when cross-referencing for substitution in existing designs or specifying based on availability." }],
  [/draw|die|pull/i, { title: "Wire drawing", body: "Copper rod (~8mm) is pulled through a series of progressively smaller hardened-steel or diamond dies. Each die reduces diameter ~20%. Annealing (heat-softening) between passes keeps the metal ductile. End product: precise Cu wire at target diameter." }],
  [/jacket/i, { title: "Jacket extrusion", body: "Outermost protective layer — extruded over the shield. Material choice sets the cable's environment rating: PVC (indoor), PE (outdoor UV), FEP (high-temp), LSZH (fire-safety zones). Wall thickness affects impact/abrasion resistance and cable OD." }],
];

function explainStep(text) {
  const t = text || "";
  for (const [pattern, info] of STEP_PATTERNS) {
    if (pattern.test(t)) return info;
  }
  return null;
}

function interpAtten(atten, freqMHz) {
  if (!atten || atten.length === 0) return 0;
  if (freqMHz <= atten[0][0]) return atten[0][1];
  if (freqMHz >= atten[atten.length - 1][0]) return atten[atten.length - 1][1];
  for (let i = 0; i < atten.length - 1; i++) {
    const [f1, a1] = atten[i], [f2, a2] = atten[i + 1];
    if (freqMHz >= f1 && freqMHz <= f2) {
      const lf1 = Math.log(f1), lf2 = Math.log(f2), lf = Math.log(freqMHz);
      const la1 = Math.log(a1), la2 = Math.log(a2);
      return Math.exp(la1 + (lf - lf1) / (lf2 - lf1) * (la2 - la1));
    }
  }
  return atten[atten.length - 1][1];
}

function SignalFlow({ cable, compact = false }) {
  const [length, setLength] = useState(10);
  const [freq, setFreq] = useState(900);
  const [txPower, setTxPower] = useState(20);
  const [rxSens, setRxSens] = useState(-85);

  const attenPer100m = interpAtten(cable.atten, freq);
  const totalLoss = attenPer100m * length / 100;
  const rxPower = txPower - totalLoss;
  const margin = rxPower - rxSens;
  const ok = margin > 0;

  const Ctrl = ({ label, val, set, min, max, step = 1, unit }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 9, letterSpacing: 1, color: "#a8a29e", textTransform: "uppercase", display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span style={{ color: "#fbbf24" }}>{val}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => set(Number(e.target.value))} style={{ width: "100%", accentColor: "#d97706" }} onClick={(e) => e.stopPropagation()} />
    </div>
  );

  return (
    <div>
      <div style={compact ? S.signalControlsCompact : { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }} onClick={(e) => e.stopPropagation()}>
        <Ctrl label="TX power" val={txPower} set={setTxPower} min={0} max={40} unit=" dBm" />
        <Ctrl label="Length" val={length} set={setLength} min={1} max={100} unit=" m" />
        <Ctrl label="Frequency" val={freq} set={setFreq} min={10} max={Math.round(cable.fMax * 1000)} unit=" MHz" />
        <Ctrl label="RX sensitivity" val={rxSens} set={setRxSens} min={-120} max={-30} unit=" dBm" />
      </div>
      <LinkBudgetTheater3D
        cable={cable}
        length={length}
        freq={freq}
        txPower={txPower}
        rxPower={rxPower}
        rxSens={rxSens}
        attenPer100m={attenPer100m}
        totalLoss={totalLoss}
        margin={margin}
        ok={ok}
        compact={compact}
      />
      <PowerSummary txPower={txPower} rxPower={rxPower} totalLoss={totalLoss} margin={margin} cable={cable} length={length} freq={freq} compact={compact} />
    </div>
  );
}

function LinkBudgetTheater3D({
  cable,
  length,
  freq,
  txPower,
  rxPower,
  rxSens,
  attenPer100m,
  totalLoss,
  margin,
  ok,
  eyebrow = "Blender GLB link theater",
  title,
  statusText,
  lossLabel = "Cable loss",
  lossValue,
  lossSub,
  txSub,
  rxSub,
  children,
  compact = false,
}) {
  const mountRef = useRef(null);
  const metricsRef = useRef({ cable, length, freq, txPower, rxPower, rxSens, attenPer100m, totalLoss, margin, ok });
  const [status, setStatus] = useState("Loading Blender scene");

  useEffect(() => {
    metricsRef.current = { cable, length, freq, txPower, rxPower, rxSens, attenPer100m, totalLoss, margin, ok };
  }, [cable, length, freq, txPower, rxPower, rxSens, attenPer100m, totalLoss, margin, ok]);

  useEffect(() => {
    let alive = true;
    let renderer = null;
    let scene = null;
    let camera = null;
    let root = null;
    let frameId = 0;
    let resizeObserver = null;
    const disposables = [];
    const pulses = [];
    const pointer = { down: false, x: 0, y: 0, rx: -0.05, ry: 0.02 };

    const disposeMaterial = (material) => {
      if (!material) return;
      for (const value of Object.values(material)) {
        if (value && typeof value === "object" && value.isTexture) value.dispose();
      }
      material.dispose?.();
    };

    const disposeObject = (object) => {
      object?.traverse?.((node) => {
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) node.material.forEach(disposeMaterial);
        else disposeMaterial(node.material);
      });
    };

    const run = async () => {
      try {
        const [THREE, { GLTFLoader }] = await Promise.all([
          import("three"),
          import("three/examples/jsm/loaders/GLTFLoader.js"),
        ]);
        if (!alive || !mountRef.current) return;

        const mount = mountRef.current;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.dataset.testid = "rf-link-budget-theater-canvas";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        mount.appendChild(renderer.domElement);

        scene = new THREE.Scene();
        root = new THREE.Group();
        root.rotation.set(pointer.rx, pointer.ry, 0);
        scene.add(root);

        camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
        camera.position.set(0, 2.0, 7.0);
        camera.lookAt(0, 0, 0);
        scene.add(camera);

        const ambient = new THREE.HemisphereLight(0xf4eadc, 0x091111, 1.75);
        const key = new THREE.DirectionalLight(0xffffff, 2.65);
        key.position.set(-3.4, 4.6, 5.3);
        const txRim = new THREE.PointLight(0xff9c1a, 1.6, 7);
        txRim.position.set(-3.8, -0.5, 1.0);
        const rxRim = new THREE.PointLight(0x48ffd4, 1.35, 7);
        rxRim.position.set(3.8, 0.5, 1.0);
        scene.add(ambient, key, txRim, rxRim);

        const loader = new GLTFLoader();
        const gltf = await new Promise((resolve, reject) => {
          loader.load("/models/rf-link-budget-theater.glb", resolve, undefined, reject);
        });
        if (!alive) return;
        const model = gltf.scene;
        model.traverse((node) => {
          if (node.isMesh && node.material) {
            node.castShadow = true;
            node.receiveShadow = true;
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach((mat) => {
              if (/transparent|energy guide/i.test(mat.name || "")) {
                mat.transparent = true;
                mat.depthWrite = false;
                mat.opacity = Math.min(mat.opacity ?? 0.3, 0.32);
              }
              mat.needsUpdate = true;
            });
          }
        });
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        model.scale.setScalar(0.93);
        root.add(model);

        const pathMat = new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const pathCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-3.12, 0.02, 0.02),
          new THREE.Vector3(-1.45, 0.03, 0.02),
          new THREE.Vector3(0, 0.05, 0.02),
          new THREE.Vector3(1.45, 0.03, 0.02),
          new THREE.Vector3(3.12, 0.02, 0.02),
        ]);
        const path = new THREE.Mesh(new THREE.TubeGeometry(pathCurve, 96, 0.018, 10, false), pathMat);
        path.name = "live signal rail";
        root.add(path);
        disposables.push(path);

        const pulseGeometry = new THREE.SphereGeometry(0.12, 32, 20);
        const haloGeometry = new THREE.SphereGeometry(0.28, 32, 20);
        for (let i = 0; i < 3; i += 1) {
          const material = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false });
          const haloMaterial = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
          const pulse = new THREE.Mesh(pulseGeometry, material);
          const halo = new THREE.Mesh(haloGeometry, haloMaterial);
          const light = new THREE.PointLight(0xfbbf24, 0.55, 2.4);
          const group = new THREE.Group();
          group.add(halo, pulse, light);
          root.add(group);
          pulses.push({ group, pulse, halo, light, material, haloMaterial });
        }
        disposables.push(pulseGeometry, haloGeometry, pathMat);

        const resize = () => {
          if (!mount || !renderer || !camera) return;
          const rect = mount.getBoundingClientRect();
          const width = Math.max(320, Math.floor(rect.width || 900));
          const height = Math.max(300, Math.floor(rect.height || 420));
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.position.z = width < 680 ? 8.4 : 7.0;
          camera.updateProjectionMatrix();
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(mount);
        resize();

        const onPointerDown = (e) => {
          pointer.down = true;
          pointer.x = e.clientX;
          pointer.y = e.clientY;
          renderer.domElement.setPointerCapture?.(e.pointerId);
        };
        const onPointerMove = (e) => {
          if (!pointer.down || !root) return;
          const dx = e.clientX - pointer.x;
          const dy = e.clientY - pointer.y;
          pointer.x = e.clientX;
          pointer.y = e.clientY;
          pointer.ry = clampValue(pointer.ry + dx * 0.006, -0.55, 0.55);
          pointer.rx = clampValue(pointer.rx + dy * 0.004, -0.48, 0.22);
          root.rotation.set(pointer.rx, pointer.ry, 0);
        };
        const onPointerUp = () => { pointer.down = false; };
        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        disposables.push({
          dispose: () => {
            renderer?.domElement?.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
          },
        });

        setStatus("");
        const start = performance.now();
        const animate = (now) => {
          if (!alive || !renderer || !scene || !camera) return;
          const m = metricsRef.current;
          const statusColor = m.margin < 0 ? new THREE.Color(0xef4444) : m.margin < 6 ? new THREE.Color(0xfbbf24) : new THREE.Color(0x34d399);
          const startColor = new THREE.Color(0xffb21a);
          const endAmp = clampValue(Math.pow(10, -(m.totalLoss || 0) / 28), 0.18, 1);
          const speed = clampValue(1.25 + (m.length || 10) / 46, 1.3, 4.0);
          pulses.forEach((p, i) => {
            const t = (((now - start) / 1000) / speed + i / pulses.length) % 1;
            const x = -3.02 + 6.04 * t;
            const y = 0.055 + Math.sin(t * Math.PI * 2) * 0.012;
            const scale = 1.15 - (1.0 - endAmp) * t;
            const opacity = clampValue(0.95 - (0.74 * (1 - endAmp) * t), 0.12, 0.96);
            const color = startColor.clone().lerp(statusColor, t);
            p.group.position.set(x, y, 0.02);
            p.group.scale.setScalar(scale);
            p.material.color.copy(color);
            p.haloMaterial.color.copy(color);
            p.light.color.copy(color);
            p.material.opacity = opacity;
            p.haloMaterial.opacity = opacity * 0.22;
            p.light.intensity = 0.35 + opacity * 0.75;
          });
          pathMat.color.copy(statusColor);
          pathMat.opacity = 0.12 + endAmp * 0.18;
          renderer.render(scene, camera);
          frameId = requestAnimationFrame(animate);
        };
        frameId = requestAnimationFrame(animate);
      } catch {
        if (alive) setStatus("3D scene unavailable");
      }
    };

    run();

    return () => {
      alive = false;
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect?.();
      disposables.forEach((item) => item.dispose?.());
      if (root) disposeObject(root);
      renderer?.dispose?.();
      renderer?.domElement?.remove?.();
    };
  }, []);

  const marginColor = margin < 0 ? "#ef4444" : margin < 6 ? "#fbbf24" : "#34d399";
  const signalKept = Math.pow(10, -totalLoss / 10) * 100;

  return (
    <div style={{ ...S.linkTheaterFrame, ...(compact ? S.linkTheaterFrameCompact : {}) }} data-testid="rf-link-budget-theater">
      <div ref={mountRef} style={S.linkTheaterCanvas} />
      <div style={S.linkTheaterScrim} />
      <div style={S.linkTheaterTopHud}>
        <div>
          <div style={S.linkTheaterEyebrow}>{eyebrow}</div>
          <div style={S.linkTheaterTitle}>{title || `${cable.name} · ${length} m · ${freq < 1000 ? `${freq} MHz` : `${(freq / 1000).toFixed(2)} GHz`}`}</div>
        </div>
        <div style={{ ...S.linkTheaterPill, borderColor: marginColor, color: marginColor }}>
          {statusText || `${ok ? "Link alive" : "Below sensitivity"} · ${margin > 0 ? "+" : ""}${margin.toFixed(1)} dB`}
        </div>
      </div>
      {children && <div style={S.linkTheaterStageOverlay}>{children}</div>}
      <div style={S.linkTheaterStats}>
        <div style={{ ...S.linkTheaterMetric, borderColor: "rgba(251,191,36,0.45)" }}>
          <span style={S.linkTheaterMetricLabel}>TX power</span>
          <strong style={{ ...S.linkTheaterMetricValue, color: "#fbbf24" }}>{txPower.toFixed(0)} dBm</strong>
          <small style={S.linkTheaterMetricSub}>{txSub || dbmToPower(txPower)}</small>
        </div>
        <div style={{ ...S.linkTheaterMetric, borderColor: "rgba(239,68,68,0.45)" }}>
          <span style={S.linkTheaterMetricLabel}>{lossLabel}</span>
          <strong style={{ ...S.linkTheaterMetricValue, color: "#f97316" }}>{lossValue || `${totalLoss.toFixed(2)} dB`}</strong>
          <small style={S.linkTheaterMetricSub}>{lossSub || `${attenPer100m.toFixed(2)} dB/100m · ${signalKept.toFixed(signalKept < 10 ? 1 : 0)}% survives`}</small>
        </div>
        <div style={{ ...S.linkTheaterMetric, borderColor: `${marginColor}88` }}>
          <span style={S.linkTheaterMetricLabel}>RX power</span>
          <strong style={{ ...S.linkTheaterMetricValue, color: marginColor }}>{rxPower.toFixed(1)} dBm</strong>
          <small style={S.linkTheaterMetricSub}>{rxSub || `sens ${rxSens} dBm`}</small>
        </div>
      </div>
      {status && <div style={S.linkTheaterStatus}>{status}</div>}
    </div>
  );
}

function dbmToPower(dbm) {
  const mW = Math.pow(10, dbm / 10);
  if (mW >= 1000) return `${(mW / 1000).toFixed(1)} W`;
  if (mW >= 1) return `${mW.toFixed(mW >= 100 ? 0 : 1)} mW`;
  if (mW >= 0.001) return `${(mW * 1000).toFixed(mW >= 0.1 ? 0 : 1)} µW`;
  if (mW >= 1e-6) return `${(mW * 1e6).toFixed(1)} nW`;
  if (mW >= 1e-9) return `${(mW * 1e9).toFixed(1)} pW`;
  if (mW >= 1e-12) return `${(mW * 1e12).toFixed(1)} fW`;
  return `${mW.toExponential(2)} mW`;
}

function powerAnalogy(dbm) {
  if (dbm >= 60) return "broadcast TV / FM transmitter";
  if (dbm >= 45) return "cell tower / high-power radio";
  if (dbm >= 28) return "amateur radio / LoRa gateway";
  if (dbm >= 18) return "WiFi router transmit";
  if (dbm >= 8) return "Bluetooth class 1 / small IoT";
  if (dbm >= -10) return "signal close to an antenna";
  if (dbm >= -40) return "signal a few meters away";
  if (dbm >= -70) return "moderate WiFi signal";
  if (dbm >= -90) return "weak-but-usable WiFi / cellular";
  if (dbm >= -110) return "edge of cellular coverage";
  if (dbm >= -135) return "GPS from satellite";
  return "near thermal noise floor";
}

function linkVerdict(margin) {
  if (margin < 0) return { icon: "❌", title: "BROKEN", color: "#ef4444", desc: "RX power is below the receiver's sensitivity. Signal won't decode — no link." };
  if (margin < 3) return { icon: "⚠️", title: "MARGINAL", color: "#f97316", desc: "Barely works. Rain, cable aging, or minor interference will break it." };
  if (margin < 10) return { icon: "⚠", title: "TIGHT", color: "#fbbf24", desc: "Works most of the time. Risky for mission-critical systems." };
  if (margin < 20) return { icon: "✓", title: "GOOD", color: "#34d399", desc: "Healthy margin. Link should be reliable in normal conditions." };
  if (margin < 40) return { icon: "✓", title: "EXCELLENT", color: "#34d399", desc: "Plenty of headroom for weather, aging, interference." };
  return { icon: "🚀", title: "OVERKILL", color: "#34d399", desc: "Massive margin. You could use lower TX power or cheaper cable." };
}

function PowerSummary({ txPower, rxPower, totalLoss, margin, cable, length, freq, compact = false }) {
  const v = linkVerdict(margin);
  const txPw = dbmToPower(txPower);
  const rxPw = dbmToPower(rxPower);
  const txAnalogy = powerAnalogy(txPower);
  const rxAnalogy = powerAnalogy(rxPower);
  const pctKept = Math.pow(10, -totalLoss / 10) * 100;
  const marginRatio = Math.pow(10, margin / 10);
  const marginTxt = marginRatio >= 1000000 ? `${(marginRatio / 1e6).toFixed(0)} million×` : marginRatio >= 1000 ? `${(marginRatio / 1000).toFixed(0)}k×` : `${marginRatio.toFixed(1)}×`;

  const Row = ({ icon, color, title, body }) => (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
      <div style={{ fontSize: 18, flexShrink: 0, width: 24, textAlign: "center" }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11, color: "#d6cfc4", lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  );

  if (compact) {
    return (
      <div style={S.powerSummaryCompact}>
        <div style={S.powerSummaryCompactHead}>
          <span style={S.powerSummaryCompactKicker}>Engineering read</span>
          <strong style={{ color: v.color }}>{v.title} · {margin > 0 ? "+" : ""}{margin.toFixed(1)} dB</strong>
        </div>
        <div style={S.powerSummaryCompactGrid}>
          <div style={S.powerSummaryTile}>
            <span style={S.powerSummaryTileLabel}>TX</span>
            <strong style={S.powerSummaryTileValue}>{txPw}</strong>
            <small style={S.powerSummaryTileSub}>{txPower.toFixed(0)} dBm</small>
          </div>
          <div style={S.powerSummaryTile}>
            <span style={S.powerSummaryTileLabel}>Cable loss</span>
            <strong style={{ ...S.powerSummaryTileValue, color: "#f97316" }}>{totalLoss.toFixed(2)} dB</strong>
            <small style={S.powerSummaryTileSub}>{pctKept.toFixed(pctKept < 10 ? 2 : 0)}% survives</small>
          </div>
          <div style={S.powerSummaryTile}>
            <span style={S.powerSummaryTileLabel}>RX</span>
            <strong style={{ ...S.powerSummaryTileValue, color: v.color }}>{rxPw}</strong>
            <small style={S.powerSummaryTileSub}>{rxPower.toFixed(1)} dBm</small>
          </div>
          <div style={S.powerSummaryTileWide}>
            <span style={S.powerSummaryTileLabel}>Plain English</span>
            <strong style={{ ...S.powerSummaryTileValue, fontSize: 12, lineHeight: 1.35 }}>{v.desc}</strong>
            <small style={S.powerSummaryTileSub}>{cable.name} · {length} m · {freq < 1000 ? `${freq} MHz` : `${(freq / 1000).toFixed(2)} GHz`}</small>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14, padding: "14px 16px", background: "rgba(15,10,5,0.5)", borderRadius: 4, border: "1px solid rgba(217,119,6,0.15)" }}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#a8a29e", textTransform: "uppercase", marginBottom: 12, textAlign: "center" }}>What this means in plain English</div>

      <Row icon="📡" color="#fbbf24" title="TX — what you transmit" body={<>
        <strong style={{ color: "#fbbf24" }}>{txPw}</strong> <span style={{ color: "#78716c" }}>({txPower.toFixed(0)} dBm)</span> — like a {txAnalogy}.
      </>} />

      <Row icon="📏" color="#a8a29e" title={`Cable — ${cable.name}, ${length} m @ ${freq < 1000 ? `${freq} MHz` : `${(freq / 1000).toFixed(2)} GHz`}`} body={<>
        Eats <strong style={{ color: "#ef4444" }}>{totalLoss.toFixed(2)} dB</strong> → <strong style={{ color: "#fbbf24" }}>{pctKept.toFixed(pctKept < 10 ? 2 : 0)}%</strong> of TX power survives. {totalLoss < 1 ? "Negligible — short/low-freq." : totalLoss < 5 ? "Small loss — typical for most setups." : totalLoss < 15 ? "Moderate loss — noticeable but OK." : totalLoss < 30 ? "Heavy loss — link is losing a lot." : "Severe loss — consider a bigger cable or shorter run."}
      </>} />

      <Row icon="🎯" color="#34d399" title="RX — what arrives at receiver" body={<>
        <strong style={{ color: "#34d399" }}>{rxPw}</strong> <span style={{ color: "#78716c" }}>({rxPower.toFixed(1)} dBm)</span> — like {rxAnalogy}.
      </>} />

      <div style={{ padding: "10px 12px", background: `${v.color}15`, borderLeft: `3px solid ${v.color}`, borderRadius: 3, marginTop: 4 }}>
        <div style={{ fontSize: 11, color: v.color, fontWeight: 700, letterSpacing: 0.5 }}>{v.icon} {v.title} · margin {margin > 0 ? "+" : ""}{margin.toFixed(1)} dB {margin > 0 && `(≈ ${marginTxt} stronger than minimum)`}</div>
        <div style={{ fontSize: 10.5, color: "#d6cfc4", marginTop: 4, lineHeight: 1.5 }}>{v.desc}</div>
      </div>

      <div style={{ fontSize: 10, color: "#78716c", marginTop: 10, paddingTop: 8, borderTop: "1px dashed rgba(217,119,6,0.1)", lineHeight: 1.5 }}>
        💡 <strong style={{ color: "#a8a29e" }}>dBm</strong> is a logarithmic power scale. +10 dB = 10× more power, −3 dB ≈ half. 0 dBm = 1 mW reference. Common targets: rule of thumb wants <strong style={{ color: "#a8a29e" }}>10-20 dB margin</strong> above RX sensitivity for a robust link.
      </div>
    </div>
  );
}


function shortMat(s) {
  if (!s) return null;
  const before = s.split(",")[0].trim();
  return before.replace(/^(\d+[- ]?strand(ed)?|solid|bare|single|double|triple|quad)\s+/i, "").replace(/\s+(each|wire)$/i, "");
}

const SHIELD_LAYER_TYPES = {
  foil: { name: "Foil shield", color: "#cbd5e1", fill: "url(#foil-p)" },
  braid: { name: "Braid shield", color: "#9ca3af", fill: "url(#braid-p)" },
  tube: { name: "Corrugated Cu tube", color: "#c7793d", fill: "url(#corrugated-cu-p)" },
  shield: { name: "Shield", color: "#9ca3af", fill: "url(#braid-p)" },
};

function makeShieldLayer(type, index, desc, name) {
  const meta = SHIELD_LAYER_TYPES[type] || SHIELD_LAYER_TYPES.shield;
  return {
    ...meta,
    key: `shield-${type}-${index + 1}`,
    type,
    name: name || meta.name,
    desc: desc || meta.name,
  };
}

function getShieldLayers(cons) {
  const desc = cons?.shield || "Shield";
  const text = desc.toLowerCase();
  const layers = [];
  const push = (type, name) => layers.push(makeShieldLayer(type, layers.length, desc, name));

  if (/corrugat|annular|seam[- ]?weld|solid\s+(cu|copper)\s+tube|\b(cu|copper)\s+tube|\btube\b/.test(text)) {
    push("tube", /annular/.test(text) ? "Annular corrugated Cu tube" : "Corrugated Cu tube");
    return layers;
  }

  if (/foil\s*\+\s*braid\s*\+\s*foil\s*\+\s*braid|quad/.test(text)) {
    push("foil", "Inner foil shield");
    push("braid", "Inner braid shield");
    push("foil", "Outer foil shield");
    push("braid", "Outer braid shield");
    return layers;
  }

  if (/tri[- ]?shield|triple[- ]?shield/.test(text)) {
    push("foil", "Inner foil shield");
    push("braid", "Braid shield");
    push("foil", "Outer foil shield");
    return layers;
  }

  const hasFoil = /foil|duobond|bonded|al[- ]?polymer|aluminum/.test(text);
  const hasBraid = /braid|serve|woven/.test(text);
  const foilCount = hasFoil && /dual[- ]?foil|double[- ]?foil/.test(text) ? 2 : hasFoil ? 1 : 0;
  const braidCount = hasBraid && /double.*braid|dual.*braid/.test(text) ? 2 : hasBraid ? 1 : 0;

  if (foilCount && braidCount) {
    const foilFirst = text.indexOf("foil") === -1 || (text.indexOf("braid") !== -1 && text.indexOf("foil") < text.indexOf("braid"));
    const max = Math.max(foilCount, braidCount);
    for (let i = 0; i < max; i++) {
      if (foilFirst) {
        if (i < foilCount) push("foil", foilCount > 1 ? `${i ? "Outer" : "Inner"} foil shield` : "Foil shield");
        if (i < braidCount) push("braid", braidCount > 1 ? `${i ? "Outer" : "Inner"} braid shield` : "Braid shield");
      } else {
        if (i < braidCount) push("braid", braidCount > 1 ? `${i ? "Outer" : "Inner"} braid shield` : "Braid shield");
        if (i < foilCount) push("foil", foilCount > 1 ? `${i ? "Outer" : "Inner"} foil shield` : "Foil shield");
      }
    }
  } else {
    for (let i = 0; i < foilCount; i++) push("foil", foilCount > 1 ? `${i ? "Outer" : "Inner"} foil shield` : "Foil shield");
    for (let i = 0; i < braidCount; i++) push("braid", braidCount > 1 ? `${i ? "Outer" : "Inner"} braid shield` : "Braid shield");
  }

  if (!layers.length && /(dual|double).*(shield|screen)/.test(text)) {
    push("shield", "Inner shield");
    push("shield", "Outer shield");
  }
  if (!layers.length) push("shield", "Shield");
  return layers;
}

function compactShieldCalloutName(layer) {
  if (layer.type === "tube") return "Shield tube";
  return layer.name.replace(/\s+shield$/i, "");
}

function getStrands(n, totalR) {
  if (n <= 1) return null;
  if (n === 7) {
    const r = totalR / 3;
    return { strandR: r, positions: [[0, 0], ...Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3 - Math.PI / 2; return [Math.cos(a) * r * 2, Math.sin(a) * r * 2]; })] };
  }
  if (n === 19) {
    const r = totalR / 5;
    const positions = [[0, 0]];
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2; positions.push([Math.cos(a) * r * 2, Math.sin(a) * r * 2]); }
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2; positions.push([Math.cos(a) * r * 4, Math.sin(a) * r * 4]); }
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 6; positions.push([Math.cos(a) * r * 3.464, Math.sin(a) * r * 3.464]); }
    return { strandR: r, positions };
  }
  const r = totalR / Math.max(3, Math.sqrt(n));
  const positions = [[0, 0]];
  for (let i = 1; i < Math.min(n, 12); i++) { const a = (i - 1) * 2 * Math.PI / Math.max(6, n - 1); positions.push([Math.cos(a) * (totalR - r), Math.sin(a) * (totalR - r)]); }
  return { strandR: r, positions };
}

function CrossSection({ d, D, shield, jacket, units, cons, shieldLayers, buildStep = 4, selectedLayer, hoveredLayer, onLayerClick, onLayerHover }) {
  const size = 300, cx = size / 2, cy = size / 2, maxR = size * 0.26;
  const interactive = !!onLayerClick;
  const layerStyle = (key, step) => {
    const visible = buildStep >= step;
    const isHov = hoveredLayer === key;
    const isSel = selectedLayer === key;
    const dim = selectedLayer && selectedLayer !== key;
    return {
      opacity: visible ? (dim ? 0.35 : 1) : 0,
      transition: "opacity 0.55s ease",
      cursor: interactive ? "pointer" : "default",
      filter: isHov || isSel ? "brightness(1.2) drop-shadow(0 0 4px currentColor)" : "none",
    };
  };
  const handlers = (key) => interactive ? {
    onClick: () => onLayerClick(key === selectedLayer ? null : key),
    onMouseEnter: () => onLayerHover && onLayerHover(key),
    onMouseLeave: () => onLayerHover && onLayerHover(null),
  } : {};
  const scale = maxR / (jacket / 2);
  const r_in = (d / 2) * scale, r_dx = (D / 2) * scale, r_jk = (jacket / 2) * scale;
  const parsedShieldLayers = shieldLayers?.length ? shieldLayers : getShieldLayers(cons);
  const shieldSpan = Math.max(0.5, shield - D);
  const shieldRings = parsedShieldLayers.map((layer, i) => {
    const outerMm = D + shieldSpan * ((i + 1) / parsedShieldLayers.length);
    return {
      ...layer,
      outerMm,
      outerR: (outerMm / 2) * scale,
    };
  });

  const compact = (mm) => {
    const inch = (mm / 25.4).toFixed(3);
    if (units === "imperial") return `${inch}"`;
    if (units === "both") return `${fmt(mm, 2)}mm · ${inch}"`;
    return `${fmt(mm, 2)}mm`;
  };

  const strandMatch = cons?.conductor?.match(/(\d+)[- ]?strand/i);
  const strands = strandMatch ? parseInt(strandMatch[1]) : 1;
  const strandData = strands > 1 ? getStrands(strands, r_in) : null;

  const shieldCallouts = shieldRings.map((layer, i) => ({
    angle: shieldRings.length === 1 ? 40 : 18 + i * 24,
    r: layer.outerR,
    name: compactShieldCalloutName(layer),
    value: compact(layer.outerMm),
    mat: shortMat(layer.desc),
    color: layer.color,
  }));

  const callouts = [
    { angle: -140, r: r_in, name: "Conductor", value: compact(d), mat: shortMat(cons?.conductor), color: "#fbbf24" },
    { angle: -40,  r: r_dx, name: "Dielectric", value: compact(D), mat: shortMat(cons?.dielectric), color: "#fde68a" },
    ...shieldCallouts,
    { angle: 140,  r: r_jk, name: "Jacket",    value: compact(jacket), mat: shortMat(cons?.jacket), color: "#a8a29e" },
  ];

  const drawCallout = ({ angle, r, name, value, mat, color }, i) => {
    const rad = angle * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const x1 = cx + cos * r, y1 = cy + sin * r;
    const elbowR = maxR + 18;
    const x2 = cx + cos * elbowR, y2 = cy + sin * elbowR;
    const textX = cos < 0 ? x2 - 6 : x2 + 6;
    const anchor = cos < 0 ? "end" : "start";
    const topY = y2 - (mat ? 12 : 4);
    return (
      <g key={i}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.7" strokeDasharray="2,2" opacity="0.7" />
        <circle cx={x1} cy={y1} r="1.6" fill={color} />
        <text x={textX} y={topY} fill={color} fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor={anchor} fontWeight="600" letterSpacing="0.5">{name.toUpperCase()}</text>
        {mat && <text x={textX} y={topY + 10} fill={color} fontSize="8" fontFamily="JetBrains Mono, monospace" textAnchor={anchor} opacity="0.7" fontStyle="italic">{mat}</text>}
        <text x={textX} y={topY + (mat ? 20 : 10)} fill={color} fontSize="9" fontFamily="JetBrains Mono, monospace" textAnchor={anchor} opacity="0.9">{value}</text>
      </g>
    );
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", margin: "0 auto" }}>
      <defs>
        <radialGradient id="cu-grad" cx="35%" cy="35%"><stop offset="0%" stopColor="#fde68a" /><stop offset="35%" stopColor="#fbbf24" /><stop offset="75%" stopColor="#b45309" /><stop offset="100%" stopColor="#451a03" /></radialGradient>
        <pattern id="braid-p" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#4b5563" />
          <path d="M0 3h6M3 0v6" stroke="#9ca3af" strokeWidth="0.7" />
          <animateTransform attributeName="patternTransform" type="rotate" from="45" to="405" dur="60s" repeatCount="indefinite" />
        </pattern>
        <pattern id="foil-p" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(18)">
          <rect width="8" height="8" fill="#cbd5e1" />
          <path d="M0 4h8" stroke="#f8fafc" strokeWidth="1" opacity="0.5" />
        </pattern>
        <pattern id="corrugated-cu-p" patternUnits="userSpaceOnUse" width="9" height="9">
          <rect width="9" height="9" fill="#8a3f18" />
          <path d="M0 1.5h9M0 6h9" stroke="#f59e0b" strokeWidth="0.8" opacity="0.75" />
          <path d="M0 3.75h9" stroke="#451a03" strokeWidth="0.6" opacity="0.7" />
        </pattern>
        <radialGradient id="dielectric-grad" cx="45%" cy="40%"><stop offset="0%" stopColor="#fff7ed" stopOpacity="0.9" /><stop offset="70%" stopColor="#d6d3d1" stopOpacity="0.78" /><stop offset="100%" stopColor="#a8a29e" stopOpacity="0.68" /></radialGradient>
        <radialGradient id="jk-grad" cx="50%" cy="50%"><stop offset="70%" stopColor="#0a0705" /><stop offset="100%" stopColor="#1f1611" /></radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r_jk} fill="url(#jk-grad)" stroke={hoveredLayer === "jacket" || selectedLayer === "jacket" ? "#a8a29e" : "#2a1f15"} strokeWidth={hoveredLayer === "jacket" || selectedLayer === "jacket" ? 2 : 1} style={{ color: "#a8a29e", ...layerStyle("jacket", 4) }} {...handlers("jacket")} />
      {shieldRings.slice().reverse().map((layer) => {
        const active = hoveredLayer === layer.key || selectedLayer === layer.key;
        return (
          <circle key={layer.key} cx={cx} cy={cy} r={layer.outerR} fill={layer.fill} stroke={active ? layer.color : `${layer.color}99`} strokeWidth={active ? 1.7 : 0.45} style={{ color: layer.color, ...layerStyle(layer.key, 3) }} {...handlers(layer.key)} />
        );
      })}
      <circle cx={cx} cy={cy} r={r_dx} fill="url(#dielectric-grad)" stroke={hoveredLayer === "dielectric" || selectedLayer === "dielectric" ? "#fde68a" : "rgba(217,119,6,0.4)"} strokeWidth={hoveredLayer === "dielectric" || selectedLayer === "dielectric" ? 1.5 : 0.5} style={{ color: "#fde68a", ...layerStyle("dielectric", 2) }} {...handlers("dielectric")} />

      {strandData ? (
        <g transform={`translate(${cx}, ${cy})`} style={{ color: "#fbbf24", ...layerStyle("conductor", 1) }} {...handlers("conductor")}>
          <g>
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="40s" repeatCount="indefinite" />
            {strandData.positions.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={strandData.strandR * 0.92} fill="url(#cu-grad)" stroke="#451a03" strokeWidth="0.3" />
            ))}
          </g>
        </g>
      ) : (
        <circle cx={cx} cy={cy} r={r_in} fill="url(#cu-grad)" stroke={hoveredLayer === "conductor" || selectedLayer === "conductor" ? "#fbbf24" : "none"} strokeWidth={hoveredLayer === "conductor" || selectedLayer === "conductor" ? 1.5 : 0} style={{ color: "#fbbf24", ...layerStyle("conductor", 1) }} {...handlers("conductor")} />
      )}

      {callouts.map(drawCallout)}
    </svg>
  );
}

function StepIcon({ text }) {
  const t = (text || "").toLowerCase();
  let color = "#a8a29e", content = null;
  if (/draw|strand|bunch|twist|lay/.test(t)) {
    color = "#fbbf24";
    content = <g><rect x="2" y="11" width="13" height="2" fill="currentColor" /><polygon points="15,7 21,12 15,17" fill="currentColor" /></g>;
  } else if (/silver[- ]?plat|tin[- ]?plat|plate|plating/.test(t)) {
    color = "#d1d5db";
    content = <g><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.55" /></g>;
  } else if (/extrud|foam|ptfe|pe\b|polyeth|dielectric|sinter|co[- ]?extrud/.test(t)) {
    color = "#fde68a";
    content = <g><rect x="4" y="9" width="11" height="6" rx="1" fill="currentColor" /><line x1="15" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" /><circle cx="20" cy="12" r="1.8" fill="currentColor" /></g>;
  } else if (/braid|coverage|weave/.test(t)) {
    color = "#9ca3af";
    content = <g><path d="M2,8 C6,8 6,16 10,16 C14,16 14,8 18,8 C22,8 22,16 26,16" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M2,16 C6,16 6,8 10,8 C14,8 14,16 18,16 C22,16 22,8 26,8" fill="none" stroke="currentColor" strokeWidth="1.6" /></g>;
  } else if (/foil|tape|bond|duobond|al[- ]?polymer/.test(t)) {
    color = "#cbd5e1";
    content = <rect x="2" y="9" width="20" height="6" rx="1" fill="currentColor" opacity="0.75" />;
  } else if (/jacket/.test(t)) {
    color = "#a8a29e";
    content = <g><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" /><circle cx="12" cy="12" r="3" fill="currentColor" /></g>;
  } else if (/tube|corrugat|seam[- ]?weld|heliax|rigid/.test(t)) {
    color = "#9ca3af";
    content = <g><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="2,1.5" /></g>;
  } else if (/test|sweep|capacit|vswr|tdr|impulse|hi[- ]?pot|measure|qc|voltage/.test(t)) {
    color = "#34d399";
    content = <polyline points="2,12 6,12 8,6 12,18 14,6 18,18 20,12 22,12" fill="none" stroke="currentColor" strokeWidth="2" />;
  } else {
    content = <circle cx="12" cy="12" r="3" fill="currentColor" />;
  }
  return <svg width="26" height="26" viewBox="0 0 24 24" style={{ color, flexShrink: 0 }}>{content}</svg>;
}

function MiniCrossSection({ c }) {
  const size = 48, cx = size / 2, cy = size / 2, maxR = size * 0.42;
  const scale = maxR / (c.OD / 2);
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={(c.OD / 2) * scale} fill="#0a0705" stroke="#2a1f15" />
      <circle cx={cx} cy={cy} r={(c.shield / 2) * scale} fill="#4b5563" />
      <circle cx={cx} cy={cy} r={(c.D / 2) * scale} fill="rgba(255,250,235,0.1)" />
      <circle cx={cx} cy={cy} r={(c.d / 2) * scale} fill="#b45309" />
    </svg>
  );
}

function UnitInput({ mm, onChange, units, step = 0.01, min, max }) {
  const isImperial = units === "imperial";
  const displayValue = isImperial ? (mm / MM_PER_IN).toFixed(4) : mm;
  const displayStep = isImperial ? (step / MM_PER_IN).toFixed(5) : step;
  const displayMin = isImperial && min ? min / MM_PER_IN : min;
  const displayMax = isImperial && max ? max / MM_PER_IN : max;
  return (
    <input type="number" className="num-input"
      value={displayValue} step={displayStep} min={displayMin} max={displayMax}
      onChange={(e) => { const v = Number(e.target.value); onChange(isImperial ? v * MM_PER_IN : v); }}
      style={S.input} />
  );
}

const Section = ({ title, children }) => (<div style={S.section}><div style={S.sectionTitle}>{title}</div>{children}</div>);
const GridInputs = ({ children }) => (<div style={S.gridInputs}>{children}</div>);
const ResultGrid = ({ children }) => (<div style={S.resultGrid}>{children}</div>);
const Field = ({ label, children }) => (<div><div style={S.fieldLabel}>{label}</div>{children}</div>);
const NumInput = (p) => (<input type="number" className="num-input" value={p.value} step={p.step ?? 0.01} min={p.min} max={p.max} onChange={(e) => p.onChange(Number(e.target.value))} style={S.input} />);
const R = ({ label, value, big }) => (<div style={{ ...S.result, ...(big ? S.resultBig : {}) }}><div style={S.resultLabel}>{label}</div><div style={{ ...S.resultValue, ...(big ? { color: "#fbbf24", fontSize: 13 } : {}) }}>{value}</div></div>);
const Headline = ({ label, value, match }) => (<div style={S.headline}><div style={S.headlineLabel}>{label}</div><div style={{ ...S.headlineValue, ...(match ? { color: "#34d399" } : {}) }}>{value}</div></div>);
const QS = ({ label, v, wide }) => (<div style={{ ...S.qs, ...(wide ? S.qsWide : {}) }}><div style={S.qsLabel}>{label}</div><div style={S.qsValue}>{v}</div></div>);
const DS = ({ title, children }) => (<div style={{ marginBottom: 18 }}><div style={S.dsTitle}>{title}</div>{children}</div>);
const DR = ({ label, v }) => (<div style={S.dr}><span style={{ color: "#a89d8e" }}>{label}</span><span style={{ color: "#fbbf24", textAlign: "right" }}>{v}</span></div>);
const Layer = ({ n, name, color, desc }) => (<div style={S.layer}><div style={{ ...S.layerDot, background: color }}>{n}</div><div style={{ flex: 1 }}><div style={S.layerName}>{name}</div><div style={S.layerDesc}>{wrapTerms(desc)}</div></div></div>);

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const S = {
  root: { minHeight: "100vh", background: "radial-gradient(ellipse at top, #1a1410 0%, #0a0705 60%, #050302 100%)", color: "#e7e2dc", fontFamily: "'JetBrains Mono', monospace", padding: "20px", boxSizing: "border-box" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #2a1f15", flexWrap: "wrap", gap: 14 },
  eyebrow: { fontSize: 9, letterSpacing: "0.25em", color: "#d97706", textTransform: "uppercase", marginBottom: 4 },
  title: { fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 600, margin: 0, letterSpacing: "-0.02em", color: "#fef3c7" },
  headerRight: { display: "flex", gap: 8, alignItems: "center" },
  nav: { display: "flex", gap: 4, background: "rgba(10,7,5,0.4)", padding: 3, borderRadius: 4, border: "1px solid #2a1f15" },
  navBtn: { padding: "8px 18px", background: "transparent", color: "#78716c", border: "none", borderRadius: 3, fontFamily: "inherit", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s", fontWeight: 500 },
  navBtnActive: { background: "#d97706", color: "#0a0705", fontWeight: 600 },
  settingsBtn: { padding: "8px 10px", background: "rgba(10,7,5,0.4)", border: "1px solid #2a1f15", borderRadius: 4, color: "#a89d8e", cursor: "pointer", display: "flex", alignItems: "center", transition: "all 0.15s" },
  settingsBtnActive: { borderColor: "#d97706", color: "#fbbf24" },

  settingsPanel: { background: "rgba(20,14,9,0.8)", border: "1px solid #3a2e1f", borderRadius: 4, padding: 16, marginBottom: 14, overflow: "hidden" },
  settingsRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 },
  settingsLabel: { fontSize: 11, color: "#d6cfc4", letterSpacing: "0.1em", textTransform: "uppercase" },
  segControl: { display: "flex", background: "rgba(10,7,5,0.6)", padding: 2, borderRadius: 3, border: "1px solid #2a1f15" },
  segBtn: { padding: "5px 14px", background: "transparent", border: "none", color: "#78716c", fontFamily: "inherit", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer", borderRadius: 2, transition: "all 0.15s" },
  segBtnActive: { background: "#d97706", color: "#0a0705", fontWeight: 600 },
  settingsHint: { fontSize: 10, color: "#78716c", fontStyle: "italic", marginTop: 6, lineHeight: 1.5 },

  activeCableBar: { display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "rgba(217,119,6,0.08)", border: "1px solid #d97706", borderRadius: 3, marginBottom: 14, flexWrap: "wrap" },
  activeLabel: { fontSize: 9, letterSpacing: "0.2em", color: "#d97706", textTransform: "uppercase" },
  activeName: { fontSize: 13, color: "#fef3c7", fontWeight: 500 },
  activeCat: { fontSize: 10, padding: "2px 8px", border: "1px solid", borderRadius: 10 },
  clearBtn: { marginLeft: "auto", padding: "4px 10px", background: "transparent", border: "1px solid #3a2e1f", color: "#a89d8e", fontFamily: "inherit", fontSize: 10, cursor: "pointer", borderRadius: 2 },

  main: { background: "rgba(20,14,9,0.5)", border: "1px solid #2a1f15", borderRadius: 4, overflow: "hidden" },
  viewInner: { padding: 20 },
  viewIntro: { padding: 12, background: "rgba(217,119,6,0.04)", border: "1px solid #3a2e1f", borderRadius: 3, fontSize: 11, color: "#a89d8e", marginBottom: 16, lineHeight: 1.6 },
  viewIntroStrong: { color: "#fbbf24", letterSpacing: "0.05em" },
  inlineLink: { background: "transparent", border: "none", color: "#d97706", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", padding: 0 },

  chatArea: { minHeight: 300, maxHeight: "60vh", overflowY: "auto", padding: "10px 4px", marginBottom: 14 },
  starterLabel: { fontSize: 10, letterSpacing: "0.2em", color: "#78716c", textTransform: "uppercase", marginBottom: 10 },
  starters: { display: "flex", flexDirection: "column", gap: 6 },
  starter: { padding: "10px 14px", background: "rgba(10,7,5,0.6)", border: "1px solid #2a1f15", borderRadius: 2, color: "#d6cfc4", fontFamily: "inherit", fontSize: 12, textAlign: "left", cursor: "pointer", transition: "all 0.15s" },
  userMsg: { display: "flex", justifyContent: "flex-end", marginBottom: 12 },
  userBubble: { maxWidth: "85%", padding: "9px 13px", background: "rgba(217,119,6,0.15)", border: "1px solid #d97706", borderRadius: 3, fontSize: 12, color: "#fef3c7", lineHeight: 1.5 },
  assistantMsg: { marginBottom: 12, maxWidth: "92%" },
  assistantText: { padding: "9px 13px", background: "rgba(10,7,5,0.6)", border: "1px solid #2a1f15", borderRadius: 3, fontSize: 12, color: "#e7e2dc", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 6 },
  toolCall: { padding: "5px 10px", background: "rgba(0,0,0,0.4)", border: "1px dashed #3a2e1f", borderRadius: 2, fontSize: 10, marginBottom: 6, display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%" },
  toolIcon: { color: "#d97706" }, toolName: { color: "#fbbf24", fontWeight: 500 }, toolArgs: { color: "#78716c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  quickChipsRow: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 8, marginTop: 4 },
  quickChipGroup: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "4px 0" },
  quickChipName: { fontSize: 10, color: "#78716c" },
  quickChip: { padding: "3px 8px", background: "transparent", border: "1px solid #3a2e1f", color: "#fbbf24", fontFamily: "inherit", fontSize: 9, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer", borderRadius: 2 },
  loadingMsg: { display: "flex", alignItems: "center", padding: "8px 14px", background: "rgba(10,7,5,0.4)", border: "1px dashed #3a2e1f", borderRadius: 3 },
  errorBox: { padding: 10, background: "rgba(239,68,68,0.08)", border: "1px solid #7f1d1d", borderRadius: 2 },
  inputBar: { display: "flex", gap: 8, alignItems: "stretch" },
  textarea: { flex: 1, padding: "10px 12px", background: "#0a0705", border: "1px solid #3a2e1f", borderRadius: 3, color: "#fbbf24", fontFamily: "inherit", fontSize: 12, resize: "none", outline: "none", lineHeight: 1.4 },
  sendBtn: { padding: "0 20px", background: "#d97706", color: "#0a0705", border: "none", borderRadius: 3, fontFamily: "inherit", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", fontWeight: 600 },

  designGrid: { display: "grid", gridTemplateColumns: "280px 1fr", gap: 18 },
  sidePanel: { position: "sticky", top: 18, alignSelf: "start", padding: 16, background: "rgba(10,7,5,0.5)", border: "1px solid #2a1f15", borderRadius: 3 },
  mainPanel: { minWidth: 0 },
  headlineGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 },
  headline: { padding: 8, background: "rgba(217,119,6,0.05)", border: "1px solid #3a2e1f", borderRadius: 2, textAlign: "center" },
  headlineLabel: { fontSize: 8, letterSpacing: "0.15em", color: "#78716c", textTransform: "uppercase", marginBottom: 2 },
  headlineValue: { fontSize: 12, color: "#fbbf24", fontWeight: 500 },

  section: { marginBottom: 18, padding: 16, background: "rgba(10,7,5,0.4)", border: "1px solid #2a1f15", borderRadius: 3 },
  sectionTitle: { fontSize: 10, letterSpacing: "0.2em", color: "#d97706", textTransform: "uppercase", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid #2a1f15" },
  gridInputs: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 },
  fieldLabel: { fontSize: 10, color: "#d6cfc4", marginBottom: 4, letterSpacing: "0.05em" },
  input: { width: "100%", padding: "8px 11px", background: "#0a0705", border: "1px solid #3a2e1f", borderRadius: 2, color: "#fbbf24", fontFamily: "inherit", fontSize: 12, boxSizing: "border-box", outline: "none" },
  select: { width: "100%", padding: "8px 11px", background: "#0a0705", border: "1px solid #3a2e1f", borderRadius: 2, color: "#fbbf24", fontFamily: "inherit", fontSize: 11, boxSizing: "border-box", outline: "none", cursor: "pointer" },
  solveBox: { padding: 10, background: "rgba(16,185,129,0.08)", border: "1px solid #10b981", borderRadius: 2, marginBottom: 12, display: "flex", justifyContent: "space-between" },
  solveLabel: { fontSize: 10, color: "#10b981", letterSpacing: "0.15em", textTransform: "uppercase" },
  solveVal: { fontSize: 13, color: "#34d399", fontWeight: 500 },
  resultGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  result: { display: "flex", justifyContent: "space-between", padding: "7px 10px", background: "rgba(0,0,0,0.2)", borderRadius: 2, alignItems: "center", gap: 10 },
  resultBig: { background: "rgba(217,119,6,0.08)", border: "1px solid #3a2e1f" },
  resultLabel: { fontSize: 10, color: "#d6cfc4", flexShrink: 0 },
  resultValue: { fontSize: 11, color: "#fbbf24", fontWeight: 500, textAlign: "right" },

  // ── Compact library header (replacement for libraryHero) ──
  libHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 24,
    flexWrap: "wrap",
    padding: "16px 0 14px",
    marginBottom: 14,
    borderBottom: "1px solid rgba(168,162,158,0.14)",
  },
  libHeaderMain: { minWidth: 0, flex: "1 1 320px" },
  libEyebrow: {
    color: "#d97706",
    fontSize: 9,
    letterSpacing: "0.24em",
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: 6,
  },
  libTitleRow: { display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 6 },
  libTitle: {
    margin: 0,
    color: "#fef3c7",
    fontFamily: "'Fraunces', serif",
    fontSize: 28,
    lineHeight: 1.05,
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  libCounter: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: 4,
    fontFamily: "'JetBrains Mono', monospace",
  },
  libCounterValue: { color: "#fbbf24", fontSize: 16, fontWeight: 700 },
  libCounterDivider: { color: "#5a4525", fontSize: 14 },
  libCounterTotal: { color: "#a89d8e", fontSize: 13 },
  libCounterLabel: {
    color: "#78716c",
    fontSize: 9,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    marginLeft: 4,
  },
  libSubcopy: { margin: 0, color: "#a8a29e", fontSize: 12, lineHeight: 1.55, maxWidth: 540 },
  libHeaderStats: { display: "flex", gap: 8, alignItems: "stretch", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" },
  libQuickStat: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-end",
    minWidth: 70,
    padding: "8px 12px",
    background: "rgba(8,8,8,0.5)",
    border: "1px solid rgba(168,162,158,0.12)",
    borderRadius: 4,
  },
  libQuickStatValue: {
    color: "#fef3c7",
    fontFamily: "'Fraunces', serif",
    fontSize: 19,
    fontWeight: 700,
    lineHeight: 1,
  },
  libQuickStatLabel: {
    color: "#78716c",
    fontSize: 8.5,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    marginTop: 4,
    fontFamily: "'JetBrains Mono', monospace",
  },

  // ── Single-row toolbar (search + filters + sort) ──
  libToolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    padding: "10px 12px",
    marginBottom: 10,
    background: "rgba(8,8,8,0.5)",
    border: "1px solid rgba(168,162,158,0.12)",
    borderRadius: 4,
  },
  libToolbarSearchWrap: {
    position: "relative",
    flex: "1 1 240px",
    minWidth: 200,
    display: "flex",
    alignItems: "center",
  },
  libToolbarSearchIcon: {
    position: "absolute",
    left: 10,
    color: "#78716c",
    fontSize: 14,
    pointerEvents: "none",
    fontFamily: "'JetBrains Mono', monospace",
  },
  libToolbarSearch: {
    width: "100%",
    padding: "7px 30px 7px 28px",
    background: "#0a0705",
    border: "1px solid #2a1f15",
    borderRadius: 3,
    color: "#fbbf24",
    fontFamily: "inherit",
    fontSize: 12,
    boxSizing: "border-box",
    outline: "none",
  },
  libToolbarClearBtn: {
    position: "absolute",
    right: 8,
    background: "transparent",
    border: "none",
    color: "#78716c",
    cursor: "pointer",
    fontSize: 16,
    padding: "0 4px",
    fontFamily: "inherit",
    lineHeight: 1,
  },
  libToolbarFilter: { display: "flex", alignItems: "center", gap: 6 },
  libToolbarFilterLabel: {
    color: "#78716c",
    fontSize: 9,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: "nowrap",
  },
  libToolbarPillRow: { display: "flex", gap: 0, border: "1px solid #2a1f15", borderRadius: 3, overflow: "hidden" },
  libToolbarPill: {
    padding: "5px 10px",
    background: "#0a0705",
    border: "none",
    borderRight: "1px solid #2a1f15",
    color: "#a89d8e",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "all 0.12s",
  },
  libToolbarPillActive: {
    background: "rgba(217,119,6,0.18)",
    color: "#fbbf24",
  },
  libToolbarSelect: {
    padding: "5px 9px",
    background: "#0a0705",
    border: "1px solid #2a1f15",
    borderRadius: 3,
    color: "#fbbf24",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    cursor: "pointer",
    outline: "none",
  },
  libToolbarRangeWrap: { display: "flex", alignItems: "center", gap: 6, minWidth: 160 },
  libToolbarRange: { flex: 1, accentColor: "#d97706" },
  libToolbarRangeValue: {
    color: "#fbbf24",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    minWidth: 44,
    textAlign: "right",
  },
  libToolbarReset: {
    padding: "5px 12px",
    background: "transparent",
    border: "1px solid rgba(217,119,6,0.45)",
    borderRadius: 3,
    color: "#fbbf24",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    cursor: "pointer",
    marginLeft: "auto",
  },
  libToolbarToggle: {
    padding: "6px 11px",
    background: "#0a0705",
    border: "1px solid rgba(94,234,212,0.28)",
    borderRadius: 3,
    color: "#a8a29e",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "all 0.12s",
  },
  libToolbarToggleActive: {
    background: "rgba(94,234,212,0.12)",
    color: "#5eead4",
    borderColor: "rgba(94,234,212,0.58)",
  },

  // ── Category strip ──
  libCatStrip: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 12,
    padding: "2px 0",
  },
  libCatStripLabel: {
    color: "#78716c",
    fontSize: 9,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
    flexShrink: 0,
  },
  libCatStripPills: { display: "flex", gap: 5, flexWrap: "wrap" },
  libCatPill: {
    padding: "5px 10px",
    background: "rgba(5,5,5,0.4)",
    border: "1px solid rgba(168,162,158,0.16)",
    borderRadius: 3,
    color: "#a89d8e",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "all 0.12s",
  },
  libCatPillActive: {
    background: "rgba(217,119,6,0.12)",
  },

  renderCoveragePanel: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    alignItems: "stretch",
    marginBottom: 14,
    padding: 12,
    background: "linear-gradient(135deg, rgba(6,12,13,0.72), rgba(16,11,6,0.68))",
    border: "1px solid rgba(94,234,212,0.18)",
    borderRadius: 5,
    boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
  },
  renderCoverageSummary: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "2px 4px",
  },
  renderCoverageEyebrow: {
    color: "#5eead4",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  renderCoverageHeadline: {
    display: "flex",
    alignItems: "baseline",
    gap: 5,
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: 4,
  },
  renderCoverageBig: { color: "#fef3c7", fontSize: 25, fontWeight: 800, lineHeight: 1 },
  renderCoverageSlash: { color: "#48615f", fontSize: 16 },
  renderCoverageTotal: { color: "#a8a29e", fontSize: 16, fontWeight: 700 },
  renderCoverageUnit: {
    color: "#78716c",
    fontSize: 9,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    marginLeft: 4,
  },
  renderCoverageCopy: { color: "#a8a29e", fontSize: 11.5, lineHeight: 1.45, maxWidth: 410 },
  renderCoverageMetrics: {
    display: "grid",
    gridTemplateRows: "1fr auto auto",
    gap: 8,
    minWidth: 0,
  },
  renderCoverageMetric: {
    minHeight: 76,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "10px 12px",
    background: "rgba(3,7,8,0.58)",
    border: "1px solid rgba(168,162,158,0.12)",
    borderRadius: 4,
  },
  renderCoverageMetricLabel: {
    color: "#78716c",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 8.5,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    marginBottom: 5,
  },
  renderCoverageMetricValue: {
    color: "#5eead4",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1.1,
  },
  renderCoverageMetricSub: {
    color: "#a8a29e",
    fontSize: 10,
    lineHeight: 1.35,
    marginTop: 4,
  },
  renderCoverageMiniStat: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    padding: "6px 9px",
    background: "rgba(0,0,0,0.22)",
    border: "1px solid rgba(168,162,158,0.1)",
    borderRadius: 3,
    color: "#fbbf24",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    fontWeight: 800,
  },
  renderCoverageMiniStatLabel: {
    color: "#78716c",
    fontSize: 8,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    fontWeight: 700,
  },
  renderCoverageButton: {
    width: "100%",
    padding: "7px 10px",
    background: "rgba(94,234,212,0.08)",
    border: "1px solid rgba(94,234,212,0.42)",
    borderRadius: 3,
    color: "#5eead4",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    cursor: "pointer",
  },
  renderCoverageReel: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))",
    gap: 8,
    minWidth: 0,
  },
  renderCoverageTile: {
    position: "relative",
    minHeight: 82,
    overflow: "hidden",
    border: "1px solid rgba(168,162,158,0.14)",
    borderRadius: 4,
    background: "rgba(0,0,0,0.35)",
    padding: 0,
    cursor: "pointer",
  },
  renderCoverageTileImg: {
    width: "100%",
    height: "100%",
    minHeight: 82,
    objectFit: "cover",
    display: "block",
    filter: "contrast(1.06) saturate(1.04)",
  },
  renderCoverageTileName: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 5,
    color: "#fef3c7",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 8.5,
    lineHeight: 1.2,
    textShadow: "0 1px 7px #000",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  renderModalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    background: "rgba(0,0,0,0.78)",
    backdropFilter: "blur(8px)",
  },
  renderModalCard: {
    width: "min(1380px, 96vw)",
    maxHeight: "92vh",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    overflow: "hidden",
    background: "linear-gradient(135deg, rgba(7,10,11,0.98), rgba(20,12,5,0.96))",
    border: "1px solid rgba(94,234,212,0.28)",
    borderRadius: 6,
    boxShadow: "0 30px 90px rgba(0,0,0,0.58)",
  },
  renderModalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderBottom: "1px solid rgba(168,162,158,0.14)",
  },
  renderModalHeaderTools: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    flex: "0 0 auto",
  },
  renderModeSwitch: {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    padding: 3,
    background: "rgba(3,7,8,0.72)",
    border: "1px solid rgba(168,162,158,0.16)",
    borderRadius: 4,
  },
  renderModeButton: {
    minHeight: 28,
    padding: "6px 10px",
    border: "1px solid transparent",
    background: "transparent",
    color: "#a8a29e",
    borderRadius: 3,
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  renderModeButtonActive: {
    color: "#050505",
    background: "linear-gradient(135deg, #5eead4, #f59e0b)",
    borderColor: "rgba(255,255,255,0.16)",
  },
  renderModalEyebrow: {
    color: "#5eead4",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    marginBottom: 5,
  },
  renderModalTitle: {
    color: "#fef3c7",
    fontFamily: "'Fraunces', serif",
    fontSize: 26,
    lineHeight: 1.08,
    fontWeight: 700,
  },
  renderModalClose: {
    width: 34,
    height: 34,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(8,8,8,0.68)",
    border: "1px solid rgba(168,162,158,0.18)",
    borderRadius: 4,
    color: "#fef3c7",
    cursor: "pointer",
    flex: "0 0 auto",
  },
  renderModalBody: {
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: "minmax(520px, 1fr) minmax(330px, 0.43fr)",
    gap: 0,
    overflow: "auto",
  },
  renderModalViewerPane: {
    minWidth: 0,
    display: "grid",
    gridTemplateRows: "minmax(360px, 1fr) auto",
    borderRight: "1px solid rgba(168,162,158,0.12)",
  },
  renderModalStats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
    padding: 14,
    borderTop: "1px solid rgba(168,162,158,0.14)",
    background: "rgba(0,0,0,0.16)",
  },
  renderInspectorPanel: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 12,
    background: "linear-gradient(180deg, rgba(2,6,7,0.72), rgba(17,10,5,0.58))",
    overflow: "auto",
  },
  renderInspectorCard: {
    border: "1px solid rgba(168,162,158,0.15)",
    borderRadius: 5,
    background: "rgba(3,7,8,0.66)",
    padding: 12,
    boxShadow: "0 10px 26px rgba(0,0,0,0.2)",
  },
  renderInspectorHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  renderInspectorKicker: {
    color: "#fb923c",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
  },
  renderInspectorValue: {
    color: "#5eead4",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    fontWeight: 900,
  },
  renderLayerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
    gap: 8,
  },
  renderLayerButton: {
    minHeight: 58,
    display: "grid",
    gridTemplateColumns: "12px minmax(0, 1fr)",
    alignItems: "start",
    gap: 8,
    padding: "9px 10px",
    border: "1px solid rgba(168,162,158,0.16)",
    borderRadius: 4,
    color: "#f5f5f4",
    cursor: "pointer",
    textAlign: "left",
    transition: "border-color 0.12s ease, background 0.12s ease, color 0.12s ease",
  },
  renderLayerSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
    marginTop: 2,
    boxShadow: "0 0 14px currentColor",
  },
  renderLayerCopy: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  renderLayerName: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    fontWeight: 900,
  },
  renderLayerSub: {
    color: "#8b9499",
    fontSize: 10,
    lineHeight: 1.35,
  },
  renderConnectorList: {
    display: "grid",
    gap: 8,
  },
  renderConnectorRow: {
    padding: "9px 10px",
    border: "1px solid rgba(168,162,158,0.12)",
    borderRadius: 4,
    background: "rgba(0,0,0,0.2)",
  },
  renderConnectorTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  renderConnectorName: {
    color: "#fef3c7",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
  },
  renderFitBadge: {
    border: "1px solid rgba(94,234,212,0.45)",
    borderRadius: 999,
    padding: "2px 7px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    fontWeight: 900,
  },
  renderConnectorFlags: {
    display: "flex",
    flexWrap: "wrap",
    gap: 7,
    color: "#a8a29e",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
  },
  renderRiskMeter: {
    height: 8,
    overflow: "hidden",
    borderRadius: 999,
    background: "rgba(168,162,158,0.14)",
    marginBottom: 9,
  },
  renderRiskFill: {
    height: "100%",
    borderRadius: 999,
    boxShadow: "0 0 18px rgba(251,191,36,0.28)",
  },
  renderBendReadout: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    color: "#a8a29e",
    fontSize: 11,
    marginBottom: 8,
  },
  renderSlider: {
    width: "100%",
    accentColor: "#d97706",
  },
  renderFinePrint: {
    color: "#78716c",
    fontSize: 10,
    lineHeight: 1.45,
    marginTop: 7,
  },
  renderCoverageBar: {
    height: 10,
    overflow: "hidden",
    borderRadius: 999,
    background: "rgba(168,162,158,0.12)",
    border: "1px solid rgba(168,162,158,0.1)",
    marginBottom: 9,
  },
  renderCoverageFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #f59e0b, #5eead4)",
  },
  renderShieldStats: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    color: "#a8a29e",
    fontSize: 11,
    marginBottom: 9,
  },
  renderFreqPills: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 6,
  },
  renderFreqPill: {
    padding: "6px 5px",
    background: "rgba(0,0,0,0.24)",
    border: "1px solid rgba(168,162,158,0.14)",
    borderRadius: 3,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    fontWeight: 800,
    cursor: "pointer",
  },
  glbViewerStage: {
    position: "relative",
    minHeight: 420,
    width: "100%",
    overflow: "hidden",
    background: "radial-gradient(circle at 54% 42%, rgba(94,234,212,0.14), transparent 34%), linear-gradient(135deg, #030506, #11181b 58%, #070403)",
  },
  glbCanvasMount: {
    position: "absolute",
    inset: 0,
  },
  glbLayerBadge: {
    position: "absolute",
    left: 14,
    top: 14,
    padding: "7px 10px",
    border: "1px solid rgba(94,234,212,0.4)",
    borderRadius: 4,
    background: "rgba(3,7,8,0.72)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    pointerEvents: "none",
    boxShadow: "0 10px 24px rgba(0,0,0,0.28)",
  },
  glbViewerStatus: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#5eead4",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    pointerEvents: "none",
  },

  emptyStateBtn: {
    background: "transparent",
    border: "1px solid #d97706",
    color: "#fbbf24",
    padding: "5px 12px",
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    cursor: "pointer",
    borderRadius: 2,
    fontFamily: "inherit",
    marginLeft: 8,
  },

  libraryHero: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18, alignItems: "stretch", marginBottom: 16, padding: 20, background: "linear-gradient(135deg, rgba(7,9,10,0.96), rgba(19,15,11,0.9))", border: "1px solid rgba(168,162,158,0.18)", borderRadius: 6, boxShadow: "0 18px 48px rgba(0,0,0,0.28)" },
  libraryHeroCopy: { minWidth: 0 },
  libraryEyebrow: { color: "#d97706", fontSize: 9, letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 8 },
  libraryTitleRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 },
  libraryTitle: { margin: 0, color: "#fef3c7", fontFamily: "'Fraunces', serif", fontSize: 40, lineHeight: 1, fontWeight: 700 },
  libraryCountPill: { color: "#fbbf24", border: "1px solid rgba(251,191,36,0.42)", borderRadius: 999, padding: "5px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", background: "rgba(217,119,6,0.08)" },
  librarySubcopy: { margin: 0, color: "#a8a29e", fontSize: 13, lineHeight: 1.65, maxWidth: 680 },
  libraryStatGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1, border: "1px solid rgba(168,162,158,0.14)", background: "rgba(168,162,158,0.1)" },
  libraryStat: { minHeight: 80, padding: "13px 14px", background: "rgba(5,5,5,0.58)", display: "flex", flexDirection: "column", justifyContent: "space-between" },
  libraryStatValue: { color: "#f5f5f4", fontFamily: "'Fraunces', serif", fontSize: 27, lineHeight: 1, fontWeight: 600 },
  libraryStatLabel: { color: "#a8a29e", fontSize: 9.5, lineHeight: 1.35, letterSpacing: "0.09em", textTransform: "uppercase" },
  filterGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12, padding: 14, background: "rgba(8,8,8,0.56)", border: "1px solid rgba(168,162,158,0.16)", borderRadius: 5 },
  librarySearchCell: { minWidth: 0 },
  filterLabel: { fontSize: 9, letterSpacing: "0.15em", color: "#78716c", textTransform: "uppercase", marginBottom: 4, display: "block" },
  searchInput: { width: "100%", padding: "8px 11px", background: "#0a0705", border: "1px solid #3a2e1f", borderRadius: 2, color: "#fbbf24", fontFamily: "inherit", fontSize: 12, boxSizing: "border-box", outline: "none" },
  catChips: { display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 },
  catChip: { padding: "7px 12px", background: "rgba(5,5,5,0.38)", border: "1px solid rgba(168,162,158,0.18)", borderRadius: 999, color: "#a89d8e", fontFamily: "inherit", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" },
  catChipActive: { borderColor: "#d97706", color: "#fbbf24", background: "rgba(217,119,6,0.1)" },
  libraryResultBar: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10, padding: "8px 2px", color: "#78716c", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" },

  cableList: { display: "flex", flexDirection: "column", gap: 8 },
  cableCard: { background: "linear-gradient(135deg, rgba(8,8,8,0.74), rgba(15,11,8,0.58))", border: "1px solid rgba(168,162,158,0.13)", borderRadius: 5, transition: "all 0.15s", overflow: "hidden", boxShadow: "0 8px 26px rgba(0,0,0,0.18)" },
  cableCardExpanded: { borderColor: "rgba(217,119,6,0.72)", background: "linear-gradient(135deg, rgba(20,14,9,0.92), rgba(9,8,7,0.94))", boxShadow: "0 18px 52px rgba(0,0,0,0.34)" },
  cableHead: { padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, cursor: "pointer", flexWrap: "wrap" },
  cableIdentity: { display: "flex", alignItems: "center", gap: 14, flex: "1 1 460px", minWidth: 0 },
  cableThumbDesktop: { width: 88, height: 56 },
  cableThumbMobile: { width: 66, height: 46 },
  cableThumb: {
    position: "relative",
    flex: "0 0 auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 5,
    border: "1px solid rgba(168,162,158,0.18)",
    background: "linear-gradient(135deg, rgba(3,3,3,0.92), rgba(22,18,14,0.74))",
    boxShadow: "inset 0 0 0 1px rgba(251,191,36,0.04), 0 8px 18px rgba(0,0,0,0.26)",
  },
  cableThumbFallback: {
    borderRadius: 999,
    width: 50,
    height: 50,
  },
  cableThumbImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center",
    display: "block",
    filter: "contrast(1.05) saturate(1.05)",
  },
  cableThumbFlag: {
    position: "absolute",
    right: 4,
    bottom: 4,
    padding: "2px 4px",
    borderRadius: 2,
    background: "rgba(2,6,7,0.78)",
    border: "1px solid rgba(94,234,212,0.38)",
    color: "#5eead4",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 8,
    fontWeight: 800,
    letterSpacing: "0.08em",
    lineHeight: 1,
  },
  connectorThumb: {
    flex: "0 0 auto",
    width: 92,
    height: 58,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 5,
    border: "1px solid rgba(168,162,158,0.18)",
    background: "linear-gradient(135deg, rgba(3,3,3,0.92), rgba(18,18,18,0.7))",
    boxShadow: "inset 0 0 0 1px rgba(56,189,248,0.04), 0 8px 18px rgba(0,0,0,0.26)",
  },
  connectorThumbImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center",
    display: "block",
    filter: "contrast(1.05) saturate(1.04)",
  },
  connectorThumbFallback: {
    flex: "0 0 auto",
    width: 58,
    height: 58,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cableNameRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 },
  cableName: { fontFamily: "'Fraunces', serif", fontSize: 17, color: "#fef3c7", fontWeight: 650, lineHeight: 1.05 },
  catBadge: { fontSize: 8, padding: "3px 8px", border: "1px solid", borderRadius: 999, letterSpacing: "0.12em", textTransform: "uppercase", background: "rgba(0,0,0,0.25)" },
  cxBadge: { fontSize: 8, padding: "3px 8px", border: "1px solid", borderRadius: 999, letterSpacing: "0.05em" },
  sourceBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 8px",
    border: "1px solid",
    borderRadius: 999,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 8.5,
    fontWeight: 800,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  sourceBadgeCompact: {
    fontSize: 8,
    padding: "3px 7px",
  },
  cableAlias: { fontSize: 9.5, color: "#78716c", fontStyle: "italic", marginBottom: 3 },
  cableApps: { fontSize: 10.5, color: "#b8afa3", lineHeight: 1.4 },
  cableMeta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    fontSize: 10.5,
    color: "#a89d8e",
    lineHeight: 1.4,
    marginBottom: 6,
  },
  cableAliasInline: { color: "#78716c", fontStyle: "italic" },
  cableAppsInline: { color: "#b8afa3" },
  cableMetaSep: { color: "#3a2e1f" },
  cableInlineStats: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10.5,
    color: "#fbbf24",
    lineHeight: 1.4,
    paddingTop: 4,
    borderTop: "1px solid rgba(168,162,158,0.08)",
  },
  cableInlineStat: { display: "inline-flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap" },
  cableInlineStatLbl: {
    color: "#78716c",
    fontSize: 9,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  cableInlineStatSep: { color: "#3a2e1f", fontSize: 11 },

  // ── Library card → button styling so the whole card is tappable ──
  cableCardClickable: {
    display: "block",
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
    color: "inherit",
    padding: 0,
  },
  cableCardCompared: { borderColor: "rgba(52,211,153,0.5)" },
  cableCardOpenIcon: {
    color: "#d97706",
    fontSize: 26,
    lineHeight: 1,
    marginLeft: 8,
    alignSelf: "center",
    opacity: 0.7,
    transition: "transform 0.15s, opacity 0.15s",
  },
  cableCardActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginLeft: 8,
    alignSelf: "center",
  },
  cableRenderBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 26,
    padding: "6px 9px",
    background: "linear-gradient(135deg, rgba(94,234,212,0.18), rgba(217,119,6,0.10))",
    border: "1px solid rgba(94,234,212,0.7)",
    borderRadius: 4,
    color: "#d9fff8",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 0 0 1px rgba(94,234,212,0.08), 0 8px 20px rgba(0,0,0,0.26)",
  },
  cableMacroBtn: {
    borderColor: "rgba(251,191,36,0.72)",
    color: "#fff7d6",
    background: "linear-gradient(135deg, rgba(251,191,36,0.22), rgba(94,234,212,0.10))",
  },
  compareDot: {
    color: "#34d399",
    fontSize: 10,
    marginLeft: 4,
  },

  // ── Detail view (full-page cable spec) ──
  cableDetailBreadcrumb: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    paddingBottom: 0,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "#78716c",
    letterSpacing: "0.04em",
  },
  cableDetailBackBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "transparent",
    border: "1px solid rgba(217,119,6,0.45)",
    borderRadius: 3,
    color: "#fbbf24",
    fontFamily: "inherit",
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    padding: "6px 12px",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  cableDetailCrumbSep: { color: "#3a2e1f", fontSize: 12 },
  cableDetailCrumbCurrent: { color: "#fef3c7", fontSize: 11, fontWeight: 600 },
  cableDetailActionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
    padding: "10px 14px",
    marginBottom: 14,
    background: "rgba(8,8,8,0.55)",
    border: "1px solid rgba(168,162,158,0.14)",
    borderRadius: 4,
  },
  cableDetailHeading: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cableDetailActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  cableDetailBody: { display: "flex", flexDirection: "column" },
  cableDetailHero: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 24,
    alignItems: "center",
    padding: "18px 20px",
    marginBottom: 16,
    background: "linear-gradient(135deg, rgba(7,9,10,0.96), rgba(19,15,11,0.9))",
    border: "1px solid rgba(168,162,158,0.18)",
    borderRadius: 5,
  },
  cableDetailHeroCopy: { minWidth: 0 },
  cableDetailHeroTitle: {
    margin: "4px 0 4px",
    color: "#fef3c7",
    fontFamily: "'Fraunces', serif",
    fontSize: 32,
    lineHeight: 1.05,
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  cableDetailHeroAlias: { color: "#a8a29e", fontSize: 13, fontStyle: "italic", marginBottom: 8 },
  cableDetailHeroApps: { margin: 0, color: "#d6cfc4", fontSize: 13, lineHeight: 1.55, maxWidth: 540 },
  cableDetailHeroVisual: { display: "flex", alignItems: "center", justifyContent: "center" },

  // ── Detail-view (cd*) — tab-based layout ──
  cdHero: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
    gap: 18,
    alignItems: "stretch",
    padding: 16,
    marginBottom: 14,
    background: "linear-gradient(135deg, rgba(7,9,10,0.96), rgba(19,15,11,0.9))",
    border: "1px solid rgba(168,162,158,0.18)",
    borderRadius: 5,
  },
  cdHeroCopy: { minWidth: 0, display: "flex", flexDirection: "column" },
  cdHeroTitle: {
    margin: "4px 0 4px",
    color: "#fef3c7",
    fontFamily: "'Fraunces', serif",
    fontSize: 31,
    lineHeight: 1.05,
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  cdHeroAlias: { color: "#a8a29e", fontSize: 13, fontStyle: "italic", marginBottom: 10 },
  cdHeroDescription: {
    margin: "0 0 14px",
    color: "#d6cfc4",
    fontSize: 13,
    lineHeight: 1.6,
    maxWidth: 580,
  },
  cdSourceStrip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    margin: "0 0 14px",
    padding: "9px 10px",
    border: "1px solid rgba(168,162,158,0.14)",
    borderRadius: 4,
    background: "rgba(3,7,8,0.45)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    lineHeight: 1.45,
  },
  cdSourceLabel: {
    color: "#78716c",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    fontSize: 8.5,
  },
  cdSourceValue: {
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  cdSourceDetail: {
    color: "#a8a29e",
    flex: "1 1 260px",
    minWidth: 0,
  },
  cdHeroMetrics: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 1,
    marginTop: "auto",
    border: "1px solid rgba(168,162,158,0.16)",
    background: "rgba(168,162,158,0.08)",
  },
  cdHeroMetric: {
    display: "grid",
    gridTemplateColumns: "20px 1fr",
    gap: 8,
    alignItems: "start",
    padding: "9px 11px",
    minHeight: 60,
    background: "rgba(5,5,5,0.6)",
  },
  cdHeroMetricLabel: {
    color: "#a8a29e",
    fontSize: 8.5,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: 3,
  },
  cdHeroMetricValue: {
    color: "#fef3c7",
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    lineHeight: 1.15,
  },
  cdHeroMetricSub: {
    color: "#78716c",
    fontSize: 9,
    lineHeight: 1.3,
    marginTop: 2,
    fontFamily: "'JetBrains Mono', monospace",
  },
  cdHeroVisual: {
    position: "relative",
    minHeight: 238,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "radial-gradient(circle at 52% 50%, rgba(217,119,6,0.14), transparent 55%)",
    borderRadius: 4,
  },
  cdHeroImage: {
    width: "100%",
    maxHeight: 360,
    objectFit: "contain",
    display: "block",
    filter: "drop-shadow(0 24px 32px rgba(0,0,0,0.65))",
  },
  cdHeroVisualMeta: {
    position: "absolute",
    left: 14, right: 14, bottom: 10,
    display: "flex",
    justifyContent: "space-between",
    color: "#78716c",
    fontSize: 8.5,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
  },
  cdHeroVisualFallback: { padding: 20 },
  cdHeroBlueprint: {
    position: "relative",
    width: "100%",
    minHeight: 238,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cdHeroBlueprintLabel: {
    position: "absolute",
    top: 12,
    left: 12,
    color: "#5eead4",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    fontWeight: 800,
  },
  cdHeroBlueprintSvg: {
    transform: "scale(0.78)",
    transformOrigin: "center",
    filter: "drop-shadow(0 22px 32px rgba(0,0,0,0.62))",
  },
  cdHeroBlueprintStats: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "#a8a29e",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },

  // Tab strip
  cdTabs: {
    display: "flex",
    gap: 0,
    marginBottom: 0,
    borderBottom: "1px solid rgba(168,162,158,0.18)",
    overflowX: "auto",
    flexWrap: "nowrap",
  },
  cdTab: {
    padding: "11px 20px",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#a89d8e",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
    marginBottom: -1,
    fontWeight: 500,
  },
  cdTabActive: {
    color: "#fbbf24",
    borderBottomColor: "#d97706",
    fontWeight: 700,
  },
  cdTabPanel: {
    padding: "20px 0 6px",
    minHeight: 280,
  },

  // Tab content shared
  cdSectionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 18,
  },
  cdSectionStack: { display: "flex", flexDirection: "column", gap: 28 },
  cdSectionTitle: {
    color: "#f59e0b",
    fontSize: 9.5,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    marginBottom: 12,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    paddingBottom: 6,
    borderBottom: "1px solid rgba(168,162,158,0.12)",
  },

  // Overview tab
  cdLayerList: { display: "flex", flexDirection: "column" },
  cdLayer: {
    display: "grid",
    gridTemplateColumns: "36px 1fr",
    gap: 12,
    alignItems: "start",
    padding: "12px 0",
    borderBottom: "1px solid rgba(168,162,158,0.1)",
  },
  cdLayerNum: {
    width: 28,
    height: 28,
    borderRadius: 999,
    border: "1px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 9,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
  },
  cdLayerName: { color: "#fef3c7", fontSize: 13, fontWeight: 600, marginBottom: 3 },
  cdLayerDesc: { color: "#a8a29e", fontSize: 11.5, lineHeight: 1.5 },
  cdAttenGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
    gap: 1,
    background: "rgba(168,162,158,0.12)",
    border: "1px solid rgba(168,162,158,0.16)",
  },
  cdAttenCell: { padding: "10px 12px", background: "rgba(5,5,5,0.6)", minHeight: 70 },
  cdAttenFreq: {
    color: "#a8a29e",
    fontSize: 9.5,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: 5,
  },
  cdAttenLoss: {
    color: "#fef3c7",
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
  },
  cdAttenUnit: { color: "#78716c", fontSize: 9, fontWeight: 400, marginLeft: 4 },
  cdAttenSub: {
    color: "#78716c",
    fontSize: 9.5,
    marginTop: 4,
    fontFamily: "'JetBrains Mono', monospace",
  },
  cdBenefitList: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 },
  cdBenefitItem: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    fontSize: 12,
    color: "#d6cfc4",
    lineHeight: 1.55,
  },
  cdBenefitBullet: { color: "#d97706", fontSize: 10, lineHeight: 1.6, flexShrink: 0 },

  // Performance tab — atten table
  cdTableWrap: {
    border: "1px solid rgba(168,162,158,0.16)",
    borderRadius: 3,
    overflow: "hidden",
    background: "rgba(5,5,5,0.5)",
  },
  cdAttenTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11.5,
  },
  cdAttenTh: {
    color: "#a8a29e",
    fontSize: 9,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    textAlign: "left",
    padding: "10px 14px",
    borderBottom: "1px solid rgba(168,162,158,0.18)",
    background: "rgba(168,162,158,0.06)",
    fontWeight: 600,
  },
  cdAttenTd: {
    color: "#d6cfc4",
    padding: "8px 14px",
    borderBottom: "1px solid rgba(168,162,158,0.06)",
  },
  cdAttenRowAlt: { background: "rgba(168,162,158,0.03)" },
  cdTableFootnote: {
    fontSize: 10,
    color: "#78716c",
    marginTop: 8,
    lineHeight: 1.55,
    fontStyle: "italic",
  },
  linkTheaterFrame: {
    position: "relative",
    minHeight: 420,
    border: "1px solid rgba(94,234,212,0.28)",
    borderRadius: 5,
    overflow: "hidden",
    background: "radial-gradient(circle at 50% 18%, rgba(20,83,77,0.28), rgba(5,10,10,0.98) 62%)",
    boxShadow: "inset 0 0 80px rgba(94,234,212,0.07), 0 22px 58px rgba(0,0,0,0.32)",
    marginTop: 10,
  },
  linkTheaterFrameCompact: {
    minHeight: 360,
    marginTop: 0,
  },
  linkTheaterCanvas: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    cursor: "grab",
  },
  linkTheaterScrim: {
    position: "absolute",
    inset: 0,
    zIndex: 2,
    pointerEvents: "none",
    background: "linear-gradient(180deg, rgba(0,0,0,0.34), transparent 32%, rgba(0,0,0,0.54) 100%)",
  },
  linkTheaterTopHud: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    zIndex: 3,
    pointerEvents: "none",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  linkTheaterEyebrow: {
    color: "#5eead4",
    fontSize: 9,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 800,
    marginBottom: 6,
  },
  linkTheaterTitle: {
    color: "#fff7ed",
    fontSize: 17,
    lineHeight: 1.2,
    fontFamily: "'JetBrains Mono', monospace",
    textShadow: "0 2px 16px rgba(0,0,0,0.75)",
  },
  linkTheaterPill: {
    padding: "7px 10px",
    background: "rgba(2,6,8,0.72)",
    border: "1px solid",
    borderRadius: 3,
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 800,
    boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
  },
  linkTheaterStats: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 3,
    pointerEvents: "none",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 10,
  },
  linkTheaterStageOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 112,
    zIndex: 3,
    pointerEvents: "none",
  },
  linkChainTheaterWrap: {
    marginBottom: 16,
  },
  linkChainCaption: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    border: "1px solid rgba(94,234,212,0.18)",
    borderTop: "none",
    borderRadius: "0 0 4px 4px",
    background: "rgba(3,9,10,0.58)",
    color: "#d6cfc4",
    fontSize: 10,
    lineHeight: 1.45,
    fontFamily: "'JetBrains Mono', monospace",
  },
  linkChainCaptionLabel: {
    color: "#5eead4",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  linkTheaterStageRail: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  linkTheaterStageChip: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    minWidth: 112,
    maxWidth: 168,
    padding: "7px 8px",
    background: "rgba(2,6,8,0.72)",
    border: "1px solid",
    borderRadius: 4,
    boxShadow: "0 14px 32px rgba(0,0,0,0.26)",
  },
  linkTheaterStageIcon: {
    width: 26,
    height: 22,
    border: "1px solid",
    borderRadius: 3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 900,
  },
  linkTheaterStageText: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9.5,
    lineHeight: 1.15,
    fontWeight: 800,
  },
  linkTheaterStageGap: {
    padding: "5px 8px",
    color: "#94a3b8",
    background: "rgba(2,6,8,0.72)",
    border: "1px dashed rgba(148,163,184,0.38)",
    borderRadius: 3,
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
  },
  linkTheaterMetric: {
    padding: "11px 12px",
    background: "rgba(2,6,8,0.76)",
    border: "1px solid",
    borderRadius: 4,
    fontFamily: "'JetBrains Mono', monospace",
    boxShadow: "0 16px 36px rgba(0,0,0,0.28)",
  },
  linkTheaterMetricLabel: {
    display: "block",
    color: "#94a3b8",
    fontSize: 8.5,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    marginBottom: 5,
  },
  linkTheaterMetricValue: {
    display: "block",
    fontSize: 18,
    lineHeight: 1.1,
    fontWeight: 800,
    marginBottom: 5,
  },
  linkTheaterMetricSub: {
    display: "block",
    color: "#d6cfc4",
    fontSize: 10,
    lineHeight: 1.25,
  },
  signalControlsCompact: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    padding: "11px 12px",
    marginBottom: 10,
    background: "rgba(3,7,8,0.55)",
    border: "1px solid rgba(94,234,212,0.16)",
    borderRadius: 4,
  },
  powerSummaryCompact: {
    marginTop: 10,
    border: "1px solid rgba(217,119,6,0.16)",
    borderRadius: 4,
    background: "rgba(8,8,8,0.58)",
    overflow: "hidden",
  },
  powerSummaryCompactHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    borderBottom: "1px solid rgba(168,162,158,0.12)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
  },
  powerSummaryCompactKicker: {
    color: "#f59e0b",
    fontSize: 9,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    fontWeight: 800,
  },
  powerSummaryCompactGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 1,
    background: "rgba(168,162,158,0.08)",
  },
  powerSummaryTile: {
    minHeight: 72,
    padding: "10px 12px",
    background: "rgba(5,5,5,0.62)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontFamily: "'JetBrains Mono', monospace",
  },
  powerSummaryTileWide: {
    minHeight: 72,
    padding: "10px 12px",
    background: "rgba(5,5,5,0.62)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontFamily: "'JetBrains Mono', monospace",
  },
  powerSummaryTileLabel: {
    color: "#94a3b8",
    fontSize: 8.5,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  powerSummaryTileValue: {
    color: "#fbbf24",
    fontSize: 15,
    lineHeight: 1.1,
  },
  powerSummaryTileSub: {
    color: "#a8a29e",
    fontSize: 9.5,
    lineHeight: 1.3,
  },
  linkTheaterStatus: {
    position: "absolute",
    inset: 0,
    zIndex: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#5eead4",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    background: "rgba(2,6,8,0.52)",
  },

  // Engineering tab
  cdSpecList: { display: "flex", flexDirection: "column" },
  cdSpecRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "9px 0",
    borderBottom: "1px solid rgba(168,162,158,0.1)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11.5,
  },
  cdSpecLabel: { color: "#a8a29e" },
  cdSpecValue: { color: "#fbbf24", fontWeight: 600 },
  cdSuppliers: {
    color: "#d6cfc4",
    fontSize: 12,
    lineHeight: 1.6,
    padding: "9px 0",
    fontFamily: "'JetBrains Mono', monospace",
  },
  cdProcList: { display: "flex", flexDirection: "column", gap: 2 },
  cdProcStep: {
    display: "grid",
    gridTemplateColumns: "26px 22px 1fr 14px",
    gap: 10,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 3,
    transition: "background 0.12s",
  },
  cdProcNum: {
    width: 22,
    height: 22,
    borderRadius: 999,
    border: "1px solid #d97706",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 9.5,
    fontWeight: 700,
    color: "#fbbf24",
    fontFamily: "'JetBrains Mono', monospace",
  },
  cdProcText: { color: "#d6cfc4", fontSize: 11.5, lineHeight: 1.45 },
  cdProcInfo: {
    background: "rgba(217,119,6,0.06)",
    padding: "10px 14px 12px",
    margin: "2px 0 6px 36px",
    borderLeft: "2px solid #d97706",
    fontSize: 11,
    lineHeight: 1.6,
    color: "#d6cfc4",
    borderRadius: "0 3px 3px 0",
  },
  cdProcInfoTitle: {
    fontWeight: 700,
    color: "#fbbf24",
    marginBottom: 5,
    letterSpacing: "0.06em",
    fontSize: 10.5,
  },

  // ── Single-scroll section blocks (replaces tabs) ──
  cdAllSections: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    paddingTop: 14,
  },
  cdSection: { display: "flex", flexDirection: "column" },
  cdSectionHeader: {
    paddingBottom: 10,
    marginBottom: 12,
    borderBottom: "1px solid rgba(168,162,158,0.18)",
  },
  cdSectionEyebrow: {
    color: "#d97706",
    fontSize: 9,
    letterSpacing: "0.28em",
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
  },
  cdSectionH: {
    margin: "5px 0 3px",
    color: "#fef3c7",
    fontFamily: "'Fraunces', serif",
    fontSize: 19,
    fontWeight: 600,
    letterSpacing: "-0.005em",
    lineHeight: 1.15,
  },
  cdSectionSub: {
    margin: 0,
    color: "#a8a29e",
    fontSize: 11,
    lineHeight: 1.55,
  },
  cdSectionContent: {},
  cdConstructionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
    gap: 12,
    alignItems: "stretch",
  },
  cdCompactPanel: {
    padding: 12,
    background: "rgba(3,7,8,0.48)",
    border: "1px solid rgba(168,162,158,0.14)",
    borderRadius: 4,
    minWidth: 0,
  },
  cdCompactPanelHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 9,
    marginBottom: 10,
    borderBottom: "1px solid rgba(168,162,158,0.12)",
    color: "#5eead4",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    fontWeight: 800,
  },
  cdCompactPanelHeadLabel: {
    color: "#5eead4",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    fontWeight: 800,
  },
  cdInspectorCompact: {
    minWidth: 0,
  },
  cdInspectorHeadCompact: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 9,
    marginBottom: 8,
    borderBottom: "1px solid rgba(168,162,158,0.12)",
  },
  cdReplayBtnCompact: {
    background: "rgba(94,234,212,0.09)",
    color: "#5eead4",
    border: "1px solid rgba(94,234,212,0.32)",
    padding: "4px 9px",
    fontSize: 8.5,
    letterSpacing: 1,
    cursor: "pointer",
    borderRadius: 3,
    textTransform: "uppercase",
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
  },
  cdInspectorBodyCompact: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    minHeight: 300,
  },
  cdDisclosureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
    gap: 10,
  },
  cdDisclosure: {
    background: "rgba(8,8,8,0.52)",
    border: "1px solid rgba(168,162,158,0.14)",
    borderRadius: 4,
    overflow: "hidden",
  },
  cdDisclosureSummary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    background: "linear-gradient(135deg, rgba(15,10,5,0.72), rgba(3,7,8,0.48))",
  },
  cdDisclosureTitleWrap: {
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: "2px 10px",
    alignItems: "baseline",
  },
  cdDisclosureEyebrow: {
    color: "#d97706",
    fontSize: 8.5,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 800,
  },
  cdDisclosureTitle: {
    color: "#fef3c7",
    fontSize: 13,
    fontWeight: 800,
    fontFamily: "'JetBrains Mono', monospace",
  },
  cdDisclosureSub: {
    gridColumn: "2",
    color: "#78716c",
    fontSize: 10,
    lineHeight: 1.35,
  },
  cdDisclosureBody: {
    padding: 14,
    borderTop: "1px solid rgba(168,162,158,0.12)",
  },
  cdSubsectionTitle: {
    color: "#f59e0b",
    fontSize: 9.5,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    marginBottom: 10,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
  },
  cdEmptyHint: {
    color: "#78716c",
    fontSize: 11,
    fontStyle: "italic",
    padding: "12px 0",
  },

  // Layer-stack as horizontal card grid (more visual than vertical list)
  cdLayerCardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  cdLayerCard: {
    padding: "14px 16px",
    background: "rgba(8,8,8,0.55)",
    border: "1px solid rgba(168,162,158,0.14)",
    borderRadius: 4,
    minHeight: 100,
    display: "flex",
    flexDirection: "column",
  },
  cdLayerCardNum: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.18em",
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: 6,
  },
  cdLayerCardName: {
    color: "#fef3c7",
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 6,
  },
  cdLayerCardDesc: {
    color: "#a8a29e",
    fontSize: 11.5,
    lineHeight: 1.55,
  },
  quickStats: { display: "flex", gap: 1, alignItems: "stretch", flex: "0 1 auto", minWidth: 0, background: "rgba(168,162,158,0.1)", border: "1px solid rgba(168,162,158,0.12)" },
  qs: { minWidth: 54, padding: "8px 10px", textAlign: "left", background: "rgba(5,5,5,0.52)" },
  qsWide: { minWidth: 104 },
  qsLabel: { fontSize: 8, color: "#78716c", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 3 },
  qsValue: { fontSize: 11, color: "#fbbf24", lineHeight: 1.2, whiteSpace: "nowrap" },
  expandIcon: { color: "#d97706", fontSize: 20, marginLeft: 8, alignSelf: "center" },

  cableDetails: { borderTop: "1px solid #2a1f15", background: "rgba(0,0,0,0.3)", padding: 18 },
  connectorDetailVisual: {
    marginBottom: 16,
    padding: 10,
    background: "linear-gradient(135deg, rgba(5,5,5,0.74), rgba(16,14,12,0.58))",
    border: "1px solid rgba(168,162,158,0.16)",
    borderRadius: 4,
    boxShadow: "0 14px 34px rgba(0,0,0,0.28)",
  },
  connectorDetailImage: {
    width: "100%",
    maxHeight: 250,
    objectFit: "contain",
    display: "block",
    borderRadius: 3,
    background: "#050302",
  },
  actionRow: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  actionBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 14px", background: "#d97706", color: "#0a0705", border: "none", borderRadius: 2, fontFamily: "inherit", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", fontWeight: 600 },
  actionBtn3d: { background: "linear-gradient(135deg, #5eead4, #f59e0b)", color: "#050505", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 12px 24px rgba(0,0,0,0.28)" },
  actionBtnMacro: { background: "linear-gradient(135deg, #fbbf24, #5eead4)", color: "#050505", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 12px 24px rgba(0,0,0,0.28)" },
  actionBtnSecondary: { background: "transparent", border: "1px solid #d97706", color: "#fbbf24" },
  sectionFrame: { padding: "14px 0 18px", borderBottom: "1px solid rgba(217,119,6,0.12)", marginBottom: 14 },
  libraryDisclosure: { borderTop: "1px solid rgba(168,162,158,0.14)" },
  libraryDisclosureHead: { width: "100%", border: "none", background: "transparent", color: "#f5f5f4", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 2px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" },
  libraryDisclosureEyebrow: { display: "block", color: "#d97706", fontSize: 8.5, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 2 },
  libraryDisclosureTitle: { display: "block", color: "#e7e5e4", fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase" },
  libraryDisclosureBody: { padding: "0 0 18px" },
  profilePanel: { margin: "0 0 10px", padding: 22, background: "linear-gradient(135deg, rgba(11,10,8,0.98), rgba(18,15,11,0.94) 55%, rgba(7,7,7,0.98))", border: "1px solid rgba(168,162,158,0.22)", borderRadius: 4, boxShadow: "0 18px 54px rgba(0,0,0,0.36)", overflow: "hidden" },
  profileHero: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 26, alignItems: "center" },
  profileCopy: { minWidth: 0 },
  profileKicker: { color: "#d97706", fontSize: 9, letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 7 },
  profileTitleRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 },
  profileTitle: { margin: 0, color: "#fef3c7", fontFamily: "'Fraunces', serif", fontSize: 42, lineHeight: 1, fontWeight: 700 },
  profileBadge: { padding: "6px 11px", border: "1px solid", borderRadius: 999, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, background: "rgba(0,0,0,0.28)" },
  profileAlias: { color: "#a8a29e", fontSize: 13, fontStyle: "italic", marginBottom: 12 },
  profileDescription: { color: "#e7e5e4", fontSize: 14, lineHeight: 1.65, margin: "0 0 18px", maxWidth: 610 },
  profileMetricGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 1, border: "1px solid rgba(168,162,158,0.16)", background: "rgba(168,162,158,0.08)" },
  profileMetric: { display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, alignItems: "start", minHeight: 72, padding: "12px 13px", background: "rgba(5,5,5,0.6)" },
  profileMetricLabel: { color: "#a8a29e", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 },
  profileMetricValue: { color: "#f5f5f4", fontSize: 15, lineHeight: 1.25, fontWeight: 700 },
  profileMetricSub: { color: "#78716c", fontSize: 10, lineHeight: 1.35, marginTop: 2 },
  profileVisual: { position: "relative", minHeight: 360, display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 52% 50%, rgba(217,119,6,0.16), transparent 55%)" },
  profileImage: { width: "100%", maxHeight: 430, objectFit: "contain", display: "block", filter: "drop-shadow(0 30px 38px rgba(0,0,0,0.7))" },
  profileVisualMeta: { position: "absolute", left: 18, right: 18, bottom: 10, display: "flex", justifyContent: "space-between", gap: 12, color: "#a8a29e", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" },
  profileSplit: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 22, marginTop: 22, paddingTop: 18, borderTop: "1px solid rgba(168,162,158,0.18)" },
  profileSectionTitle: { color: "#f59e0b", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10, fontWeight: 800 },
  profileLayerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 },
  profileLayer: { display: "grid", gridTemplateColumns: "38px 1fr", gap: 10, alignItems: "start", padding: "10px 0", borderTop: "1px solid rgba(168,162,158,0.12)" },
  profileLayerNum: { width: 28, height: 28, borderRadius: 999, border: "1px solid", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800 },
  profileLayerName: { color: "#f5f5f4", fontSize: 12.5, fontWeight: 700, marginBottom: 3 },
  profileLayerDesc: { color: "#a8a29e", fontSize: 11, lineHeight: 1.45 },
  profileAttenGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 1, background: "rgba(168,162,158,0.12)", border: "1px solid rgba(168,162,158,0.16)" },
  profileAttenCell: { padding: "11px 12px", background: "rgba(5,5,5,0.62)", minHeight: 74 },
  profileAttenFreq: { color: "#d6d3d1", fontSize: 12, marginBottom: 6 },
  profileAttenLoss: { color: "#f5f5f4", fontSize: 14, fontWeight: 700 },
  profileAttenSub: { color: "#78716c", fontSize: 10.5, marginTop: 4 },
  generatedRender: { width: 340, maxWidth: "100%", padding: 10, background: "rgba(15,10,5,0.55)", border: "1px solid rgba(217,119,6,0.22)", borderRadius: 4, boxSizing: "border-box" },
  generatedRenderLabel: { fontSize: 9, letterSpacing: "0.18em", color: "#d97706", textTransform: "uppercase", marginBottom: 8 },
  generatedRenderImg: { width: "100%", aspectRatio: "1 / 1", objectFit: "contain", display: "block", background: "#050302", border: "1px solid #2a1f15", borderRadius: 3 },
  sheetPanel: { margin: "0 0 22px", padding: 22, background: "linear-gradient(135deg, rgba(10,10,10,0.96), rgba(19,16,13,0.94) 45%, rgba(7,7,7,0.98))", border: "1px solid rgba(168,162,158,0.26)", borderRadius: 4, boxShadow: "0 22px 70px rgba(0,0,0,0.42)", overflow: "hidden" },
  sheetHeader: { display: "flex", gap: 20, alignItems: "center", paddingBottom: 18, borderBottom: "1px solid rgba(168,162,158,0.35)", marginBottom: 20 },
  sheetKicker: { fontSize: 9, letterSpacing: "0.24em", color: "#d97706", textTransform: "uppercase", marginBottom: 4 },
  sheetTitleRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  sheetTitle: { fontFamily: "'Fraunces', serif", fontSize: 38, lineHeight: 1, color: "#fef3c7", fontWeight: 700 },
  sheetBadge: { padding: "7px 14px", border: "1px solid", borderRadius: 999, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, background: "rgba(0,0,0,0.35)" },
  sheetAlias: { marginTop: 8, fontSize: 15, color: "#a8a29e", fontStyle: "italic" },
  sheetApps: { marginTop: 8, fontSize: 17, color: "#e7e5e4", lineHeight: 1.45 },
  sheetBody: { display: "grid", gridTemplateColumns: "minmax(260px, 0.66fr) minmax(560px, 1.34fr)", gap: 22, alignItems: "stretch" },
  sheetCopy: { minWidth: 0, paddingRight: 4 },
  sheetSectionLabel: { color: "#f59e0b", fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 800, marginBottom: 10, marginTop: 4 },
  sheetDescription: { color: "#f5f5f4", fontSize: 14.5, lineHeight: 1.68, marginBottom: 22, maxWidth: 440 },
  sheetBenefits: { display: "grid", gap: 9 },
  sheetBenefit: { display: "flex", gap: 10, alignItems: "flex-start", color: "#d6d3d1", fontSize: 13.5, lineHeight: 1.45 },
  sheetBullet: { width: 7, height: 7, borderRadius: 999, background: "#fb923c", marginTop: 6, flexShrink: 0, boxShadow: "0 0 12px rgba(251,146,60,0.55)" },
  sheetVisual: { position: "relative", minHeight: 390, borderLeft: "1px solid rgba(168,162,158,0.18)", overflow: "hidden", background: "radial-gradient(circle at 66% 58%, rgba(217,119,6,0.10), transparent 42%)" },
  sheetImage: { position: "absolute", left: "24%", bottom: "2%", width: "73%", height: "72%", objectFit: "contain", filter: "drop-shadow(0 26px 34px rgba(0,0,0,0.65))", opacity: 0.98, zIndex: 1 },
  sheetCalloutLeader: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2, overflow: "visible" },
  sheetCallout: { position: "absolute", maxWidth: 210, padding: "9px 11px", background: "rgba(5,5,5,0.62)", border: "1px solid rgba(231,229,228,0.32)", borderRadius: 3, color: "#e7e5e4", textShadow: "0 2px 8px rgba(0,0,0,0.9)", zIndex: 3, boxShadow: "0 10px 24px rgba(0,0,0,0.32)" },
  sheetCalloutTitle: { color: "#f59e0b", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 800, lineHeight: 1.3 },
  sheetCalloutNum: { fontSize: 16, color: "#fbbf24", marginRight: 8 },
  sheetCalloutDesc: { marginTop: 5, color: "#f5f5f4", fontSize: 12, lineHeight: 1.35 },
  sheetSpecGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 0, marginTop: 22, paddingTop: 18, borderTop: "1px solid rgba(168,162,158,0.32)" },
  sheetSpecTile: { minHeight: 106, padding: "0 14px", borderRight: "1px solid rgba(168,162,158,0.24)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  sheetSpecIcon: { color: "#a8a29e", marginBottom: 8 },
  sheetSpecLabel: { color: "#d6d3d1", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1.25 },
  sheetSpecValue: { color: "#f5f5f4", fontSize: 15, lineHeight: 1.35, marginTop: 7 },
  sheetSpecSub: { color: "#a8a29e", fontSize: 10.5, lineHeight: 1.3, marginTop: 3 },
  sheetAtten: { marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(168,162,158,0.32)" },
  sheetAttenLabel: { color: "#f59e0b", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 800, marginBottom: 10 },
  sheetAttenRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 0, border: "1px solid rgba(168,162,158,0.16)", borderLeft: "none" },
  sheetAttenCell: { padding: "10px 12px", borderLeft: "1px solid rgba(168,162,158,0.22)", textAlign: "center", background: "rgba(255,255,255,0.015)" },
  sheetAttenFreq: { color: "#d6d3d1", fontSize: 12.5, marginBottom: 6 },
  sheetAttenLoss: { color: "#f5f5f4", fontSize: 13.5 },
  sheetAttenSub: { color: "#a8a29e", fontSize: 10.5, marginTop: 3 },
  detailsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 },
  dsTitle: { fontSize: 9, letterSpacing: "0.2em", color: "#d97706", textTransform: "uppercase", marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid #2a1f15" },
  dr: { display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px dashed #2a1f15", fontSize: 10, gap: 10 },
  attenTable: { width: "100%", borderCollapse: "collapse", fontSize: 10 },
  attenTh: { padding: "5px 8px", borderBottom: "1px solid #3a2e1f", textAlign: "left", color: "#78716c", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 400 },
  attenTd: { padding: "4px 8px", borderBottom: "1px dashed #1a1410", color: "#d6cfc4" },
  layer: { display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px dashed #2a1f15" },
  layerDot: { width: 20, height: 20, flexShrink: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#0a0705", fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 10 },
  layerName: { fontSize: 10, color: "#fef3c7", fontWeight: 500, marginBottom: 2 },
  layerDesc: { fontSize: 10, color: "#a89d8e", lineHeight: 1.5 },
  procStep: { display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px dashed #2a1f15", alignItems: "center" },
  procNum: { width: 18, height: 18, flexShrink: 0, background: "#d97706", color: "#0a0705", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 },
  procText: { fontSize: 10, color: "#d6cfc4", lineHeight: 1.5, paddingTop: 1 },
  emptyState: { padding: 40, textAlign: "center", fontSize: 11, color: "#78716c", fontStyle: "italic", background: "rgba(20,14,9,0.4)", border: "1px dashed #2a1f15", borderRadius: 3 },
};
