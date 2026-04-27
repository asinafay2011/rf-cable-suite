// Declarative stage list for the Cable Builder.
// Each entry describes a stage of cable assembly with the fields the engineer
// configures. The Builder UI renders stage cards from this metadata.
//
// Field types:
//   - 'slider' : numeric range with min/max/step
//   - 'cards'  : mutually exclusive option tiles
//   - 'toggle' : boolean (on/off)
//   - 'select' : dropdown (used for direction)

import { Atom, Layers, GitMerge, ScrollText, Shield, Box, Settings } from 'lucide-react'

export const STAGES = [
  {
    id: 'conductor',
    icon: Atom,
    label: 'Conductor',
    blurb: 'Drawn copper rod becomes a single solid wire. AWG sets the diameter, material sets resistivity.',
    optional: false,
    fields: [
      {
        name: 'target_awg',
        label: 'AWG',
        type: 'slider',
        min: 16, max: 40, step: 1,
        default: 24,
        unit: '',
        help: 'Wire gauge — smaller AWG = thicker wire (lower DCR but more Cu).',
      },
      {
        name: 'material',
        label: 'Material',
        type: 'cards',
        default: 'spc',
        options: [
          { value: 'cu',  label: 'Bare Cu',     desc: '1.68 µΩ·m · cheapest'   },
          { value: 'spc', label: 'SPC',         desc: 'Silver-plated · best HF' },
          { value: 'tc',  label: 'Tinned Cu',   desc: 'Solderable · corrosion'  },
          { value: 'npc', label: 'NPC',         desc: 'Nickel-plated · 250 °C'  },
        ],
      },
      {
        name: 'anneal_c',
        label: 'Anneal °C',
        type: 'slider',
        min: 380, max: 600, step: 10,
        default: 480,
        unit: '°C',
        help: 'Annealing restores ductility after drawing. < 400 °C = brittle.',
      },
      {
        name: 'line_m_min',
        label: 'Line speed',
        type: 'slider',
        min: 200, max: 1500, step: 50,
        default: 800,
        unit: 'm/min',
        help: '> 1000 m/min: drawing tension stress, watch for breaks.',
      },
    ],
  },
  {
    id: 'stranding',
    icon: Layers,
    label: 'Stranding',
    blurb: 'Optional bunched-strand construction for flexibility. Solid wire is fine for most builds.',
    optional: true,
    skipDefault: { enabled: false, strand_count: 1, lay_mm: 0 },
    fields: [
      {
        name: 'enabled',
        label: 'Enable stranding',
        type: 'toggle',
        default: false,
      },
      {
        name: 'strand_count',
        label: 'Strands',
        type: 'cards',
        default: 7,
        options: [
          { value: 7,  label: '7-strand',  desc: 'Common bunch, 7/N' },
          { value: 19, label: '19-strand', desc: 'High-flex, 19/N'   },
          { value: 37, label: '37-strand', desc: 'Ultra-flex, robotic' },
        ],
      },
      {
        name: 'lay_mm',
        label: 'Strand lay',
        type: 'slider',
        min: 6, max: 22, step: 1,
        default: 12,
        unit: 'mm',
        help: '12-18× strand OD typical. < 6 mm = mechanical stress.',
      },
    ],
  },
  {
    id: 'insulation',
    icon: Layers,
    label: 'Insulation',
    blurb: 'Dielectric extruded coaxially over the conductor. εᵣ sets v_p and Z₀ baseline.',
    optional: false,
    fields: [
      {
        name: 'material',
        label: 'Dielectric',
        type: 'cards',
        default: 'fep_foamed',
        options: [
          { value: 'pe_solid',   label: 'Solid PE',   desc: 'εᵣ 2.30 · 80 °C'   },
          { value: 'pe_foamed',  label: 'Foamed PE',  desc: 'εᵣ 1.55 · faster'  },
          { value: 'ptfe',       label: 'PTFE',       desc: 'εᵣ 2.10 · 200 °C'  },
          { value: 'fep',        label: 'FEP',        desc: 'εᵣ 2.05 · easy'    },
          { value: 'fep_foamed', label: 'Foamed FEP', desc: 'εᵣ 1.85 · low IL'  },
          { value: 'pfa',        label: 'PFA',        desc: 'εᵣ 2.05 · 250 °C'  },
          { value: 'eptfe',      label: 'ePTFE',      desc: 'εᵣ 1.30 · ultra-low'},
        ],
      },
      {
        name: 'wall_mm',
        label: 'Wall',
        type: 'slider',
        min: 0.10, max: 1.50, step: 0.01,
        default: 0.24,
        unit: 'mm',
        help: 'Together with εᵣ, sets characteristic Z₀.',
      },
      {
        name: 'line_m_min',
        label: 'Extrusion speed',
        type: 'slider',
        min: 100, max: 400, step: 10,
        default: 200,
        unit: 'm/min',
        help: '> 250 m/min on foamed dielectric → εᵣ drift ±0.05.',
      },
      {
        name: 'melt_c',
        label: 'Melt °C',
        type: 'slider',
        min: 180, max: 400, step: 10,
        default: 320,
        unit: '°C',
        help: '~360 °C for FEP/PTFE, ~210 °C for PE.',
      },
    ],
  },
  {
    id: 'pair',
    icon: GitMerge,
    label: 'Twisted Pair',
    blurb: 'Two insulated wires twisted together. Lay length controls NEXT and skew.',
    optional: false,
    fields: [
      {
        name: 'lay_mm',
        label: 'Pair lay',
        type: 'slider',
        min: 5, max: 25, step: 0.5,
        default: 13,
        unit: 'mm',
        help: 'Cat 6A: 11-17 mm. Cat 8: 6-9 mm. USB4: 6 mm.',
      },
      {
        name: 'direction',
        label: 'Direction',
        type: 'cards',
        default: 'S',
        options: [
          { value: 'S', label: 'S-lay', desc: 'Counter-clockwise rise' },
          { value: 'Z', label: 'Z-lay', desc: 'Clockwise rise'         },
        ],
      },
      {
        name: 'tension_n',
        label: 'Tension',
        type: 'slider',
        min: 4, max: 14, step: 0.5,
        default: 8,
        unit: 'N',
        help: '> 12 N: insulation deformation, εᵣ drift.',
      },
    ],
  },
  {
    id: 'pair_wrap',
    icon: ScrollText,
    label: 'Pair Binder Wrap',
    blurb: 'Optional helical tape around each pair. PTFE for high-temp; polyester for S/FTP underlayers.',
    optional: true,
    skipDefault: { material: 'none', overlap_pct: 0, wall_mm: 0 },
    fields: [
      {
        name: 'material',
        label: 'Tape',
        type: 'cards',
        default: 'ptfe_tape',
        options: [
          { value: 'ptfe_tape',  label: 'PTFE',           desc: 'εᵣ 2.10 · 200 °C' },
          { value: 'eptfe_tape', label: 'ePTFE',          desc: 'εᵣ 1.30 · ultra' },
          { value: 'polyester',  label: 'Polyester',      desc: 'Standard binder' },
          { value: 'paper',      label: 'Paper',          desc: 'Legacy / dry'    },
          { value: 'polyimide',  label: 'Polyimide',      desc: '250 °C aerospace' },
        ],
      },
      {
        name: 'overlap_pct',
        label: 'Overlap',
        type: 'slider',
        min: 10, max: 50, step: 5,
        default: 25,
        unit: '%',
      },
      {
        name: 'wall_mm',
        label: 'Tape thickness',
        type: 'slider',
        min: 0.02, max: 0.10, step: 0.005,
        default: 0.05,
        unit: 'mm',
      },
    ],
  },
  {
    id: 'pair_foil',
    icon: Shield,
    label: 'Per-Pair Foil',
    blurb: 'Optional individual foil shield per pair (S/FTP / U/FTP / USB4 / DAC).',
    optional: true,
    skipDefault: { material: 'none', overlap_pct: 0, drain_wire: false, drain_awg: 0 },
    fields: [
      {
        name: 'material',
        label: 'Foil',
        type: 'cards',
        default: 'al_polyester',
        options: [
          { value: 'al_polyester', label: 'Al / PET',  desc: 'Standard, light' },
          { value: 'cu_polyester', label: 'Cu / PET',  desc: '2× cost, ultra-low Zt' },
          { value: 'al_polyimide', label: 'Al / PI',   desc: '250 °C MIL'      },
        ],
      },
      {
        name: 'overlap_pct',
        label: 'Overlap',
        type: 'slider',
        min: 15, max: 50, step: 5,
        default: 25,
        unit: '%',
      },
      {
        name: 'drain_wire',
        label: 'Drain wire',
        type: 'toggle',
        default: true,
      },
      {
        name: 'drain_awg',
        label: 'Drain AWG',
        type: 'slider',
        min: 24, max: 36, step: 2,
        default: 28,
        unit: '',
      },
    ],
  },
  {
    id: 'bundle',
    icon: Box,
    label: 'Bundle',
    blurb: 'Cable pairs around an X-spline filler. Lay diversity decorrelates pair-to-pair NEXT.',
    optional: false,
    fields: [
      {
        name: 'pair_count',
        label: 'Pair count',
        type: 'cards',
        default: 4,
        options: [
          { value: 1, label: 'Single', desc: 'Coax / phase-stable' },
          { value: 2, label: '2-pair', desc: 'USB / SAS / DP'     },
          { value: 4, label: '4-pair', desc: 'Cat / Ethernet'      },
        ],
      },
      {
        name: 'lay_diversity',
        label: 'Lay diversity',
        type: 'toggle',
        default: true,
      },
      {
        name: 'filler',
        label: 'Filler',
        type: 'cards',
        default: 'x_spline',
        options: [
          { value: 'x_spline', label: 'X-spline', desc: 'Cross filler · best NEXT' },
          { value: 'cross',    label: 'Cross-T',  desc: 'T-shape · simpler tooling' },
          { value: 'none',     label: 'None',     desc: 'Pairs touch · risk crush'  },
        ],
      },
      {
        name: 'bundle_lay_mm',
        label: 'Bundle lay',
        type: 'slider',
        min: 30, max: 120, step: 5,
        default: 80,
        unit: 'mm',
      },
    ],
  },
  {
    id: 'outer_foil',
    icon: Shield,
    label: 'Outer Foil',
    blurb: 'Optional bundle-level foil shield (F/UTP, S/FTP).',
    optional: true,
    skipDefault: { foil: false, foil_overlap: 0 },
    fields: [
      {
        name: 'foil',
        label: 'Enable foil',
        type: 'toggle',
        default: true,
      },
      {
        name: 'foil_overlap',
        label: 'Overlap',
        type: 'slider',
        min: 15, max: 50, step: 5,
        default: 25,
        unit: '%',
      },
    ],
  },
  {
    id: 'shield',
    icon: Shield,
    label: 'Outer Braid',
    blurb: 'Woven shield over the bundle. Coverage K = (2F − F²)·100 % per SCTE 51.',
    optional: false,
    fields: [
      {
        name: 'braid_enabled',
        label: 'Enable braid',
        type: 'toggle',
        default: true,
      },
      {
        name: 'braid_N',
        label: 'Carriers',
        type: 'cards',
        default: 24,
        options: [
          { value: 16, label: '16',  desc: 'Light coverage' },
          { value: 24, label: '24',  desc: 'Common'         },
          { value: 36, label: '36',  desc: 'High coverage'  },
          { value: 48, label: '48',  desc: 'EMI-critical'   },
        ],
      },
      {
        name: 'braid_P',
        label: 'Ends/carrier',
        type: 'slider',
        min: 5, max: 8, step: 1,
        default: 7,
        unit: '',
      },
      {
        name: 'braid_d_mm',
        label: 'Strand Ø',
        type: 'slider',
        min: 0.08, max: 0.25, step: 0.01,
        default: 0.13,
        unit: 'mm',
      },
      {
        name: 'braid_PR',
        label: 'Picks/inch',
        type: 'slider',
        min: 6, max: 25, step: 1,
        default: 14,
        unit: 'PR',
      },
      {
        name: 'braid_material',
        label: 'Material',
        type: 'cards',
        default: 'spc',
        options: [
          { value: 'cu',  label: 'Bare Cu',  desc: 'Cheapest' },
          { value: 'spc', label: 'SPC',      desc: 'Best HF'  },
          { value: 'tc',  label: 'Tinned Cu',desc: 'Standard' },
        ],
      },
    ],
  },
  {
    id: 'jacket',
    icon: Box,
    label: 'Jacket',
    blurb: 'Outer protective layer. Material = environment + flame rating.',
    optional: false,
    fields: [
      {
        name: 'material',
        label: 'Material',
        type: 'cards',
        default: 'lszh',
        options: [
          { value: 'pvc',     label: 'PVC',     desc: 'General · 80 °C · cheap' },
          { value: 'lszh',    label: 'LSZH',    desc: 'Low-smoke · safer'       },
          { value: 'tpu',     label: 'TPU',     desc: 'Drag-chain · flexible'   },
          { value: 'pur',     label: 'PUR',     desc: 'Robotic · rugged'         },
          { value: 'fep_jkt', label: 'FEP',     desc: 'Plenum · 200 °C'         },
        ],
      },
      {
        name: 'wall_mm',
        label: 'Wall',
        type: 'slider',
        min: 0.3, max: 1.2, step: 0.05,
        default: 0.5,
        unit: 'mm',
      },
    ],
  },
]

// Build a "starter" recipe by reading defaults from the stage list.
// The Builder uses this as the initial state.
export function defaultRecipeFromStages() {
  const recipe = {
    product: { target: 'cat6a' },
    test: { length_m: 100, freq_mhz: 500 },
  }
  for (const stage of STAGES) {
    recipe[stage.id] = {}
    for (const f of stage.fields) {
      recipe[stage.id][f.name] = f.default
    }
  }
  return recipe
}

// Get the section of the recipe that corresponds to a stage id.
export function getStageRecipe(recipe, stageId) {
  return recipe[stageId] || {}
}
