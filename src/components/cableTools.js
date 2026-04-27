// Tools exposed to the Cable agent. Pure-math + small DB, client-side dispatch.
import { getCustomCableCables, addCustomCableCable, deleteCustomCableCable } from './customCableStore.js'
import { getCompanyDefaults, setCompanyDefaults, resetCompanyDefaults } from './companyDefaults.js'
import { addDefectEntry, getDefectLog } from './defectLog.js'

// ── Compact cable database (key high-speed / RF coax + datacable specs) ────
// Sources: Belden / Times Microwave / CommScope datasheets, Glenair Series 963.
// Atten[freq_mhz, dB_per_100ft]; vf as fraction; impedance Ω; capacitance pF/ft.
// `datasheet` is an optional URL to the manufacturer datasheet PDF.
export const CABLE_DB = {
  'rg-58':   { name: 'RG-58/U',     family: 'RG · 50 Ω', z0: 50, vf: 0.66, cap_pf_ft: 30.8, od_mm: 4.95,
    atten_db_per_100ft: { 100: 4.4, 400: 9.4, 900: 14.8, 1000: 16.0, 2400: 26.0 },
    notes: 'General-purpose RF jumper. Stranded center, single tinned-Cu braid. Solid PE dielectric.',
    datasheet: 'https://www.belden.com/products/cable/coaxial/rg58' },
  'rg-174':  { name: 'RG-174/U',    family: 'RG · 50 Ω', z0: 50, vf: 0.66, cap_pf_ft: 30.8, od_mm: 2.79,
    atten_db_per_100ft: { 100: 8.8, 400: 18.0, 900: 28.5, 1000: 30.0, 2400: 50.0 },
    notes: 'Miniature RF, low power. Used for pigtails and intra-equipment.',
    datasheet: 'https://www.belden.com/products/cable/coaxial/rg174' },
  'rg-178':  { name: 'RG-178B/U',   family: 'RG · 50 Ω · Mini', z0: 50, vf: 0.69, cap_pf_ft: 29.0, od_mm: 1.83,
    atten_db_per_100ft: { 100: 14.0, 400: 29.0, 1000: 46.0, 3000: 84.0 },
    notes: 'Sub-miniature, FEP/PFA dielectric. Rated to 3 GHz, used in dense module wiring.',
    datasheet: 'https://www.pasternack.com/images/ProductPDF/RG178B-U.pdf' },
  'rg-213':  { name: 'RG-213/U',    family: 'RG · 50 Ω', z0: 50, vf: 0.66, cap_pf_ft: 30.8, od_mm: 10.3,
    atten_db_per_100ft: { 100: 1.9, 400: 4.1, 900: 6.4, 1000: 6.9, 2400: 11.5 },
    notes: 'Higher-power RG-class. 7-strand center, double braid. Replaces RG-8.',
    datasheet: 'https://www.belden.com/products/cable/coaxial/rg213' },
  'rg-316':  { name: 'RG-316/U',    family: 'RG · 50 Ω · Mini', z0: 50, vf: 0.69, cap_pf_ft: 29.0, od_mm: 2.49,
    atten_db_per_100ft: { 100: 9.0, 400: 18.5, 1000: 31.0, 3000: 60.0 },
    notes: 'FEP-insulated mini coax. High-temp version of RG-174. Common test-bench jumper.',
    datasheet: 'https://www.pasternack.com/images/ProductPDF/RG316-U.pdf' },
  'lmr-100': { name: 'LMR-100A',    family: 'LMR · Wireless', z0: 50, vf: 0.66, cap_pf_ft: 25.0, od_mm: 2.79,
    atten_db_per_100ft: { 100: 7.4, 400: 15.6, 900: 24.1, 1000: 25.5, 2400: 39.5 },
    notes: 'Low-loss flexible 100 series. Better than RG-174 in same form factor.',
    datasheet: 'https://timesmicrowave.com/DataSheets/CableProducts/LMR-100A.pdf' },
  'lmr-200': { name: 'LMR-200',     family: 'LMR · Wireless', z0: 50, vf: 0.83, cap_pf_ft: 24.5, od_mm: 4.95,
    atten_db_per_100ft: { 100: 3.9, 400: 8.0, 900: 12.0, 1000: 12.7, 2400: 20.5 },
    notes: 'Replaces RG-58 in WiFi/cellular jumpers. Foam-PE.',
    datasheet: 'https://timesmicrowave.com/DataSheets/CableProducts/LMR-200.pdf' },
  'lmr-240': { name: 'LMR-240',     family: 'LMR · Wireless', z0: 50, vf: 0.84, cap_pf_ft: 24.2, od_mm: 6.10,
    atten_db_per_100ft: { 100: 3.0, 400: 6.4, 900: 9.9, 1000: 10.5, 2400: 16.5 },
    notes: 'Lower-loss alternative to RG-58. Solid foam-PE, foil + braid.',
    datasheet: 'https://timesmicrowave.com/DataSheets/CableProducts/LMR-240.pdf' },
  'lmr-400': { name: 'LMR-400',     family: 'LMR · Wireless', z0: 50, vf: 0.85, cap_pf_ft: 23.9, od_mm: 10.29,
    atten_db_per_100ft: { 100: 1.5, 400: 3.0, 900: 4.6, 1000: 4.8, 2400: 7.6 },
    notes: 'Industry-standard low-loss outdoor cable. Foam-PE dielectric, Al foil + tinned-Cu braid.',
    datasheet: 'https://timesmicrowave.com/DataSheets/CableProducts/LMR-400.pdf' },
  'lmr-600': { name: 'LMR-600',     family: 'LMR · Wireless', z0: 50, vf: 0.87, cap_pf_ft: 23.0, od_mm: 14.99,
    atten_db_per_100ft: { 100: 0.96, 400: 1.96, 900: 3.0, 1000: 3.1, 2400: 5.0 },
    notes: 'Long-run low-loss for tower-top installs.',
    datasheet: 'https://timesmicrowave.com/DataSheets/CableProducts/LMR-600.pdf' },
  'lmr-900': { name: 'LMR-900',     family: 'LMR · Wireless', z0: 50, vf: 0.87, cap_pf_ft: 22.7, od_mm: 22.10,
    atten_db_per_100ft: { 100: 0.66, 400: 1.36, 1000: 2.16, 2400: 3.6 },
    notes: 'Heavy backbone feedline. Used for distributed antenna systems (DAS).',
    datasheet: 'https://timesmicrowave.com/DataSheets/CableProducts/LMR-900.pdf' },
  'heliax-ldf4-50a': { name: 'Heliax LDF4-50A (1/2")', family: 'Heliax · Rigid', z0: 50, vf: 0.88, cap_pf_ft: 22.8, od_mm: 12.7,
    atten_db_per_100ft: { 100: 0.66, 400: 1.36, 900: 2.07, 1000: 2.18, 2400: 3.5 },
    notes: 'Foam-PE, corrugated Cu outer. Industry workhorse for 1/2" feedline.',
    datasheet: 'https://www.commscope.com/globalassets/digizuite/2719-ldf4-50a-external.pdf' },
  'heliax-ldf5-50a': { name: 'Heliax LDF5-50A (7/8")', family: 'Heliax · Rigid', z0: 50, vf: 0.89, cap_pf_ft: 22.4, od_mm: 22.0,
    atten_db_per_100ft: { 100: 0.36, 400: 0.74, 1000: 1.20, 2400: 1.94 },
    notes: '7/8" hardline. Used for cellular base-station feedline runs >50 m.',
    datasheet: 'https://www.commscope.com/globalassets/digizuite/2723-ldf5-50a-external.pdf' },
  'rg-59':   { name: 'RG-59/U',     family: 'RG · 75 Ω · Video', z0: 75, vf: 0.66, cap_pf_ft: 20.5, od_mm: 6.15,
    atten_db_per_100ft: { 100: 3.6, 400: 7.5, 900: 11.4, 1000: 12.0, 2400: 19.5 },
    notes: 'Video / CATV / CCTV. Solid PE.',
    datasheet: 'https://www.belden.com/products/cable/coaxial/rg59' },
  'rg-6':    { name: 'RG-6/U (CATV)', family: 'RG · 75 Ω · CATV', z0: 75, vf: 0.83, cap_pf_ft: 16.2, od_mm: 6.86,
    atten_db_per_100ft: { 100: 2.0, 400: 4.0, 900: 5.7, 1000: 6.0, 2400: 9.8 },
    notes: 'Standard residential satellite / CATV drop. Foam-PE, Al foil + braid.',
    datasheet: 'https://www.belden.com/products/cable/coaxial/rg6' },
  'rg-11':   { name: 'RG-11/U',     family: 'RG · 75 Ω · CATV', z0: 75, vf: 0.84, cap_pf_ft: 16.5, od_mm: 10.30,
    atten_db_per_100ft: { 100: 1.4, 400: 3.0, 1000: 5.5, 2400: 9.5 },
    notes: 'Trunk/distribution version of RG-6 — lower loss, longer runs.',
    datasheet: 'https://www.belden.com/products/cable/coaxial/rg11' },
  'cat6a-sftp': { name: 'Cat 6A S/FTP', family: 'Datacable · 100 Ω diff', z0: 100, vf: 0.65, cap_pf_ft: 16.0, od_mm: 7.5,
    atten_db_per_100ft: { 100: 5.5, 250: 9.6, 500: 13.5 },
    notes: '4-pair shielded twisted pair. 26-23 AWG. PoE++ capable. Foil-shielded pairs + outer braid.',
    datasheet: 'https://www.belden.com/products/cable/copper/category/category-6a' },
  'cat8':    { name: 'Cat 8 S/FTP', family: 'Datacable · 100 Ω diff', z0: 100, vf: 0.71, cap_pf_ft: 14.0, od_mm: 8.0,
    atten_db_per_100ft: { 100: 4.7, 500: 11.5, 1000: 17.0, 2000: 25.5 },
    notes: '40 GBASE-T, 30 m max. 22 AWG, foil per pair + overall braid.',
    datasheet: 'https://www.belden.com/products/cable/copper/category/category-8' },
  'cat5e':   { name: 'Cat 5e UTP',  family: 'Datacable · 100 Ω diff', z0: 100, vf: 0.65, cap_pf_ft: 17.0, od_mm: 5.6,
    atten_db_per_100ft: { 100: 6.5, 250: 11.0 },
    notes: 'Legacy 1 GbE workhorse. 24 AWG UTP. Cheap, not for >100 MHz channels.',
    datasheet: 'https://www.belden.com/products/cable/copper/category/category-5e' },
  'cat6':    { name: 'Cat 6 UTP',   family: 'Datacable · 100 Ω diff', z0: 100, vf: 0.65, cap_pf_ft: 16.5, od_mm: 6.5,
    atten_db_per_100ft: { 100: 5.7, 250: 9.4 },
    notes: '23 AWG UTP, suitable for 1 GbE up to 100 m and 10 GbE to ~37 m.',
    datasheet: 'https://www.belden.com/products/cable/copper/category/category-6' },
  'usb4-passive': { name: 'USB4 / TB4 Passive', family: 'Datacable · 100 Ω diff (× 2)', z0: 100, vf: 0.78, cap_pf_ft: 13.5, od_mm: 4.6,
    atten_db_per_100ft: { 5000: 60.0, 10000: 95.0, 20000: 145.0 },
    notes: '40 Gbps, 2 differential pairs + DP/sideband. Passive cable max ~0.8 m at 40 G.',
    datasheet: 'https://www.usb.org/document-library/usb4-specification' },
  'usb32-gen2x2': { name: 'USB 3.2 Gen 2×2', family: 'Datacable · 90 Ω diff (× 2)', z0: 90, vf: 0.75, cap_pf_ft: 14.0, od_mm: 4.4,
    atten_db_per_100ft: { 2500: 35.0, 5000: 58.0, 10000: 95.0 },
    notes: '20 Gbps over 2 SuperSpeed+ pairs. 90 Ω differential. Common short USB-C cables ≤ 1 m.',
    datasheet: 'https://www.usb.org/document-library/usb-32-specification' },
  'usb32-gen1':   { name: 'USB 3.2 Gen 1 (5 Gbps)', family: 'Datacable · 90 Ω diff', z0: 90, vf: 0.72, cap_pf_ft: 15.0, od_mm: 4.0,
    atten_db_per_100ft: { 1250: 18.0, 2500: 28.0, 5000: 45.0 },
    notes: 'Legacy USB 3.0/3.1 Gen 1, single SuperSpeed pair, 5 Gbps. Up to 3 m passive.',
    datasheet: 'https://www.usb.org/document-library/usb-32-specification' },
  'tb3-passive':  { name: 'Thunderbolt 3 Passive', family: 'Datacable · 100 Ω diff (× 4)', z0: 100, vf: 0.78, cap_pf_ft: 13.5, od_mm: 5.2,
    atten_db_per_100ft: { 5000: 65.0, 10000: 100.0, 20000: 155.0 },
    notes: '40 Gbps, 4 lanes. Distinct from USB4 in protocol but similar cable construction. Passive ≤ 0.8 m.',
    datasheet: 'https://thunderbolttechnology.net/sites/default/files/Thunderbolt3-Cable.pdf' },
  'hdmi-21-uhs':  { name: 'HDMI 2.1 Ultra High Speed', family: 'Datacable · 100 Ω diff (× 4)', z0: 100, vf: 0.70, cap_pf_ft: 14.0, od_mm: 7.5,
    atten_db_per_100ft: { 3000: 35.0, 6000: 55.0, 12000: 90.0 },
    notes: '48 Gbps total over 4 TMDS-like pairs (FRL signalling). Supports 8K60 / 4K120. Max 3 m passive.',
    datasheet: 'https://www.hdmi.org/spec21' },
  'dp-21-uhbr20': { name: 'DisplayPort 2.1 UHBR 20', family: 'Datacable · 100 Ω diff (× 4)', z0: 100, vf: 0.72, cap_pf_ft: 13.8, od_mm: 6.8,
    atten_db_per_100ft: { 5000: 55.0, 10000: 90.0, 20000: 145.0 },
    notes: '80 Gbps aggregate (4 × 20 Gbps UHBR 20). Drives 16K30 / 8K60. Passive ≤ 1 m, active longer.',
    datasheet: 'https://vesa.org/displayport-2/' },
  'qsfp28-dac':   { name: 'QSFP28 100G DAC (passive)', family: 'Datacable · 100 Ω twinax (× 4)', z0: 100, vf: 0.78, cap_pf_ft: 13.5, od_mm: 5.5,
    atten_db_per_100ft: { 12890: 110.0, 14000: 115.0 },
    notes: '4 × 25 Gbps NRZ twinax pairs. Datacenter ToR-to-leaf staple. AWG 26-30, lengths 0.5–5 m.',
    datasheet: 'https://www.nvidia.com/en-us/networking/ethernet/connectx/' },
  'qsfp-dd-dac':  { name: 'QSFP-DD 400G DAC (passive)', family: 'Datacable · 100 Ω twinax (× 8)', z0: 100, vf: 0.80, cap_pf_ft: 13.0, od_mm: 7.2,
    atten_db_per_100ft: { 13280: 130.0, 26560: 200.0 },
    notes: '8 × 50 Gbps PAM4 twinax pairs. Passive 26 AWG ≤ 2 m, 30 AWG ≤ 1 m. Used in 400G Ethernet.',
    datasheet: 'https://www.qsfp-dd.com/specification/' },
  'sfp28-dac':    { name: 'SFP28 25G DAC (passive)', family: 'Datacable · 100 Ω twinax', z0: 100, vf: 0.78, cap_pf_ft: 13.5, od_mm: 4.0,
    atten_db_per_100ft: { 12890: 95.0, 14000: 100.0 },
    notes: 'Single twinax pair, 25 Gbps NRZ. Server NIC ↔ ToR switch. AWG 26-30, lengths 0.5–5 m.',
    datasheet: 'https://www.snia.org/sff/specifications/SFF-8402.PDF' },
  'sfp-plus-dac': { name: 'SFP+ 10G DAC (passive)', family: 'Datacable · 100 Ω twinax', z0: 100, vf: 0.75, cap_pf_ft: 14.0, od_mm: 4.3,
    atten_db_per_100ft: { 5156: 50.0, 10000: 75.0 },
    notes: 'Single twinax pair, 10 Gbps NRZ. Huge install base for 10GbE. AWG 24-30, up to 7 m passive.',
    datasheet: 'https://www.snia.org/sff/specifications/SFF-8431.PDF' },
  'ib-hdr-dac':   { name: 'InfiniBand HDR 200G DAC', family: 'Datacable · 100 Ω twinax (× 4)', z0: 100, vf: 0.80, cap_pf_ft: 13.0, od_mm: 5.6,
    atten_db_per_100ft: { 13280: 105.0, 26560: 165.0 },
    notes: '4 × 50 Gbps PAM4 twinax. HPC interconnect. Passive ≤ 2 m, AOC for longer reaches.',
    datasheet: 'https://www.nvidia.com/en-us/networking/infiniband-adapters/' },
  'ib-ndr-dac':   { name: 'InfiniBand NDR 400G DAC', family: 'Datacable · 100 Ω twinax (× 4)', z0: 100, vf: 0.80, cap_pf_ft: 13.0, od_mm: 6.0,
    atten_db_per_100ft: { 26562: 165.0, 53125: 250.0 },
    notes: '4 × 100 Gbps PAM4 twinax (OSFP form-factor). Latest HPC / AI cluster interconnect. Passive ≤ 1.5 m.',
    datasheet: 'https://www.nvidia.com/en-us/networking/infiniband-adapters/' },
  'pcie-slimsas': { name: 'PCIe Gen5 SlimSAS 8i', family: 'Datacable · 85 Ω diff (× 8)', z0: 85, vf: 0.78, cap_pf_ft: 13.5, od_mm: 6.0,
    atten_db_per_100ft: { 8000: 65.0, 16000: 105.0, 32000: 175.0 },
    notes: '8 differential pairs, 32 Gbps NRZ each (256 Gbps aggregate). Server backplane / AIC-to-host.',
    datasheet: 'https://www.snia.org/sff/specifications/SFF-8654.PDF' },
  'oculink-4i':   { name: 'OCuLink 4i (Gen4)', family: 'Datacable · 85 Ω diff (× 4)', z0: 85, vf: 0.78, cap_pf_ft: 13.5, od_mm: 4.5,
    atten_db_per_100ft: { 4000: 35.0, 8000: 60.0, 16000: 100.0 },
    notes: '4 lanes PCIe Gen4 (16 Gbps each, 64 Gbps aggregate). External GPU / fast NVMe.',
    datasheet: 'https://pcisig.com/specifications' },
  'sas-4-24g':    { name: 'SAS-4 24G Internal', family: 'Datacable · 100 Ω diff (× 8)', z0: 100, vf: 0.78, cap_pf_ft: 14.0, od_mm: 6.5,
    atten_db_per_100ft: { 12000: 90.0, 24000: 145.0 },
    notes: '8 × 24 Gbps PAM4 differential. Storage backplane to HBA. Replaces SAS-3 (12 Gb/s NRZ).',
    datasheet: 'https://www.t10.org/cgi-bin/ac.pl?t=f&f=sas4r17.pdf' },
  'mipi-d-phy':   { name: 'MIPI D-PHY (CSI/DSI)', family: 'Datacable · 100 Ω diff (× 4)', z0: 100, vf: 0.70, cap_pf_ft: 15.0, od_mm: 3.5,
    atten_db_per_100ft: { 1250: 22.0, 2500: 35.0, 4500: 55.0 },
    notes: 'Camera / display serial interconnect. Up to 4.5 Gbps per lane (D-PHY v2.5). 4 data + 1 clock pair.',
    datasheet: 'https://www.mipi.org/specifications/d-phy' },
  'sma-141': { name: 'UT-141 Semi-Rigid', family: 'Semi-rigid', z0: 50, vf: 0.70, cap_pf_ft: 28.0, od_mm: 3.58,
    atten_db_per_100ft: { 1000: 14.0, 6000: 36.0, 18000: 67.0 },
    notes: 'Solid Cu outer conductor. Used for SMA jumpers up to 18 GHz.',
    datasheet: 'https://www.minicircuits.com/pdfs/UT141.pdf' },
  'sma-085': { name: 'UT-085 Semi-Rigid', family: 'Semi-rigid', z0: 50, vf: 0.70, cap_pf_ft: 28.0, od_mm: 2.20,
    atten_db_per_100ft: { 1000: 22.0, 6000: 56.0, 18000: 100.0, 33000: 138.0 },
    notes: 'Smaller semi-rigid for K-connector / 2.92 mm assemblies. To 33 GHz.',
    datasheet: 'https://www.minicircuits.com/pdfs/UT085.pdf' },
}

// Search the DB by partial name / family match (built-in + custom merged)
export function lookupCableDB(query) {
  if (!query) return []
  const q = query.toLowerCase().replace(/\s+/g, '').replace(/-/g, '')
  const merged = { ...CABLE_DB, ...getCustomCableCables() }
  const results = []
  for (const [id, c] of Object.entries(merged)) {
    const haystack = (id + ' ' + (c.name || '') + ' ' + (c.family || '')).toLowerCase().replace(/\s+/g, '').replace(/-/g, '')
    if (haystack.includes(q)) results.push({ id, ...c })
  }
  return results
}

export const CABLE_TOOLS = [
  {
    name: 'calc_z0_coax',
    description:
      'Calculate the characteristic impedance Z₀ of a coaxial cable from inner conductor diameter d, dielectric outer diameter D (over inner conductor), and dielectric permittivity εr. Formula: Z₀ = (138/√εᵣ)·log₁₀(D/d). Use when the user gives geometry/material numbers and wants an impedance, or vice-versa.',
    input_schema: {
      type: 'object',
      properties: {
        D: { type: 'number', description: 'Dielectric outer diameter in mm (the OD of the dielectric, before the shield)' },
        d: { type: 'number', description: 'Inner conductor diameter in mm' },
        er: { type: 'number', description: 'Relative permittivity εr of the dielectric (e.g., solid PE 2.30, foamed PE 1.5–1.7, PTFE 2.10, FEP 2.05)' },
      },
      required: ['D', 'd', 'er'],
    },
  },
  {
    name: 'calc_braid_coverage',
    description:
      'Compute optical coverage K of a single-layer braid per SCTE 51. K = (2F − F²)·100% where F is the fill factor. Returns coverage %, helix angle α, and a verdict band. Use whenever the user asks about braid shielding, coverage, or how many carriers/picks they need.',
    input_schema: {
      type: 'object',
      properties: {
        N: { type: 'number', description: 'Total number of carriers (typical 16, 24, 36, 48)' },
        P: { type: 'number', description: 'Number of ends per carrier (typical 5–8)' },
        d: { type: 'number', description: 'Strand diameter in mm (typical 0.10–0.18 mm; AWG 36–40)' },
        D: { type: 'number', description: 'Cable diameter under braid in mm (the OD that the braid wraps)' },
        PR: { type: 'number', description: 'Picks per inch (typical 8–25)' },
      },
      required: ['N', 'P', 'd', 'D', 'PR'],
    },
  },
  {
    name: 'awg_to_mm',
    description:
      'Convert American Wire Gauge (AWG) to wire diameter in mm and inches. Formula: d_mm = 0.127·92^((36−AWG)/39).',
    input_schema: {
      type: 'object',
      properties: {
        awg: { type: 'number', description: 'AWG value (e.g., 30, 36, 40, 50)' },
      },
      required: ['awg'],
    },
  },
  {
    name: 'mm_to_awg',
    description:
      'Convert a wire diameter in mm to the nearest American Wire Gauge (AWG).',
    input_schema: {
      type: 'object',
      properties: {
        mm: { type: 'number', description: 'Wire diameter in mm' },
      },
      required: ['mm'],
    },
  },
  {
    name: 'velocity_factor',
    description:
      'Compute the velocity factor VF = 1/√εᵣ for a transmission line, and optionally the propagation delay over a given length. Use when the user asks about VF, propagation delay, electrical length, or wants to convert between physical and electrical length.',
    input_schema: {
      type: 'object',
      properties: {
        er: { type: 'number', description: 'Effective relative permittivity εr of the dielectric / line' },
        length_m: { type: 'number', description: 'Optional cable length in meters for delay calculation' },
      },
      required: ['er'],
    },
  },
  {
    name: 'pair_lay_skew',
    description:
      'First-order estimate of intra-pair skew (ps/m) for a twisted differential pair, given the pair lay length and the εr mismatch between the two wires. Use when the user asks about skew, lay length tradeoffs, or matched-impedance pairs.',
    input_schema: {
      type: 'object',
      properties: {
        lay_mm: { type: 'number', description: 'Pair lay length in mm (typical 8–17 mm for high-speed pairs)' },
        delta_er: { type: 'number', description: 'εr difference between the two wires of the pair (typical 0.01–0.05 from foaming or extrusion variation)' },
      },
      required: ['lay_mm', 'delta_er'],
    },
  },
  {
    name: 'lookup_cable',
    description:
      'Search the on-board cable database for a cable by partial name, family, or model number (e.g. "RG-58", "LMR", "Cat 6A", "Heliax", "75 ohm video"). Returns full specs (Z₀, VF, attenuation table, OD, capacitance, application notes) for matching cables. Use this whenever the user asks for specs of a named cable, compares cables, or wants real numbers instead of memorized estimates.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (e.g., "RG-58", "LMR-400", "Cat 8", "75 ohm video")' },
      },
      required: ['query'],
    },
  },
  {
    name: 'compute_attenuation',
    description:
      'Compute insertion loss (dB) over a given length at a given frequency for a known cable. Uses the cable\'s published attenuation table with √f scaling between datapoints. Use when the user asks for IL at a specific frequency / length / cable combination.',
    input_schema: {
      type: 'object',
      properties: {
        cable_id: { type: 'string', description: 'Cable id from the database (e.g., "rg-58", "lmr-400", "cat6a-sftp"). Use lookup_cable first if unsure.' },
        freq_mhz: { type: 'number', description: 'Frequency of interest in MHz' },
        length_ft: { type: 'number', description: 'Cable length in feet' },
      },
      required: ['cable_id', 'freq_mhz', 'length_ft'],
    },
  },
  {
    name: 'geometry_for_z0',
    description:
      'Given a target characteristic impedance Z₀ and dielectric εr, compute the required D/d ratio (and example concrete dimensions) for a coaxial geometry. Inverse of calc_z0_coax. Use when the user asks "what dimensions hit 50 Ω with foamed PE?" etc.',
    input_schema: {
      type: 'object',
      properties: {
        z0_target: { type: 'number', description: 'Target characteristic impedance in Ω (typical 50 or 75)' },
        er: { type: 'number', description: 'Relative permittivity εr of the dielectric' },
        d_mm: { type: 'number', description: 'Optional inner conductor diameter in mm — if provided, returns the matching D' },
      },
      required: ['z0_target', 'er'],
    },
  },
  {
    name: 'add_cable',
    description:
      'Save a new cable spec to the user\'s LOCAL library (browser localStorage). Survives close/reopen on this device. Use when the user gives you a datasheet or spec for a cable you want to remember. Required: id, name, z0; recommended: family, vf, cap_pf_ft, od_mm, atten_db_per_100ft (object: { freq_mhz: dB }), notes.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique slug identifier (e.g., "company-spec-A"). Lowercased automatically.' },
        name: { type: 'string', description: 'Display name (e.g., "Brian Spec Cable A")' },
        family: { type: 'string', description: 'Family / category for grouping (e.g., "RG · 50 Ω", "Datacable · 100 Ω diff")' },
        z0: { type: 'number', description: 'Characteristic impedance in Ω' },
        vf: { type: 'number', description: 'Velocity factor as fraction' },
        cap_pf_ft: { type: 'number', description: 'Capacitance per foot in pF' },
        od_mm: { type: 'number', description: 'Cable outer diameter in mm' },
        atten_db_per_100ft: {
          type: 'object',
          description: 'Object mapping frequency (MHz) to attenuation (dB/100ft). Example: { "100": 4.4, "1000": 16.0 }',
          additionalProperties: { type: 'number' },
        },
        notes: { type: 'string', description: 'Free-form construction / application notes' },
        datasheet: { type: 'string', description: 'Optional URL to the manufacturer datasheet PDF or product page.' },
      },
      required: ['id', 'name', 'z0'],
    },
  },
  {
    name: 'list_custom_cables',
    description: 'List all user-added (local) cables saved on this device.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'delete_cable',
    description: 'Remove a previously-saved custom cable from the local library. Cannot delete built-in cables.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Cable id to delete' } },
      required: ['id'],
    },
  },
  {
    name: 'propose_braid_preset',
    description:
      'Propose a specific braid configuration (N total carriers, P ends/carrier, d strand mm, D cable mm, PR picks/inch) as a one-click apply preset. Computes the resulting coverage K%, helix angle, and fill. The user gets an "Apply" button on this tool pill that pushes the values directly into the Braid tab — no manual slider tweaking. Call this tool once per option when the user asks for braid setting suggestions.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'User-friendly option name (e.g., "Best balance", "Minimal change", "Overkill")' },
        N: { type: 'number', description: 'Total carriers' },
        P: { type: 'number', description: 'Ends per carrier' },
        d_mm: { type: 'number', description: 'Strand diameter in mm' },
        D_mm: { type: 'number', description: 'Cable diameter in mm' },
        PR: { type: 'number', description: 'Picks per inch' },
        material: { type: 'string', description: 'Optional: "TC" | "BC" | "SPC" | "NPC"' },
        rationale: { type: 'string', description: 'One-sentence explanation of the trade-off this option represents' },
      },
      required: ['label', 'N', 'P', 'd_mm', 'D_mm', 'PR'],
    },
  },
  {
    name: 'propose_z0_preset',
    description:
      'Propose a coaxial geometry as a one-click apply preset for the Z₀ Calc tab. Returns Z₀, the inputs, and a flagged preset the user can apply with a button. Call once per option (e.g. Minimal change / Best balance / Overkill) when the user asks to fix or change Z₀ on the Z₀ Calc tab or on the Process Sim insulation stage.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'User-friendly option name (e.g., "Best balance")' },
        mode: { type: 'string', description: 'Geometry mode: "coax" | "twisted" | "starquad" (default coax)' },
        D_mm: { type: 'number', description: 'Outer/spacing diameter in mm (dielectric OD for coax)' },
        d_mm: { type: 'number', description: 'Inner conductor diameter in mm' },
        er: { type: 'number', description: 'Relative permittivity εr of the dielectric' },
        rationale: { type: 'string', description: 'One-sentence trade-off explanation' },
      },
      required: ['label', 'D_mm', 'd_mm', 'er'],
    },
  },
  {
    name: 'propose_pair_preset',
    description:
      'Propose a pair-twisting setting as a one-click apply preset. Pushes lay length / direction / tension into the Lay Design tab or the Process Sim pair stage. Use when the user wants to fix skew, NEXT, or pair geometry.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'User-friendly option name' },
        lay_mm: { type: 'number', description: 'Pair lay length in mm (single-pair scope) or first-pair lay if specifying a Lay Designer set' },
        pair_lays_mm: { type: 'array', items: { type: 'number' }, description: 'Optional 4-pair lay set for the Lay Designer (e.g., [11, 13, 15, 17])' },
        bundle_lay_mm: { type: 'number', description: 'Optional bundle lay (for Lay Designer)' },
        direction: { type: 'string', description: 'S | Z (Process Sim only)' },
        tension_n: { type: 'number', description: 'Tension in N (Process Sim only)' },
        rationale: { type: 'string', description: 'One-sentence trade-off explanation' },
      },
      required: ['label'],
    },
  },
  {
    name: 'sensitivity_analysis',
    description:
      'Sweep one parameter of a coax Z₀ calculation across a range, hold the rest fixed, and return Z₀ at each step. Use to answer "how sensitive is Z₀ to εr / D / d?" or to size manufacturing tolerances.',
    input_schema: {
      type: 'object',
      properties: {
        vary: { type: 'string', description: 'Which parameter to sweep: "D", "d", or "er"' },
        from: { type: 'number', description: 'Sweep start' },
        to: { type: 'number', description: 'Sweep end' },
        steps: { type: 'number', description: 'Number of steps (default 11)' },
        D: { type: 'number', description: 'Fixed D in mm (used if not the swept variable)' },
        d: { type: 'number', description: 'Fixed d in mm' },
        er: { type: 'number', description: 'Fixed εr' },
      },
      required: ['vary', 'from', 'to'],
    },
  },
  {
    name: 'vna_qc_report',
    description:
      'Generate a markdown-formatted QA test report from the VNA Lab summary that the host app provides. Engineers paste the result directly into Confluence / email / Slack. Pass the wireA / wireB summaries (RL, VSWR, peak rho/distance, VFs, skew rate) you already have from the app or from the user.',
    input_schema: {
      type: 'object',
      properties: {
        cable_label: { type: 'string', description: 'Cable / build name (e.g., "Lot 2026-04 RG-58 33 ft sample 1")' },
        operator: { type: 'string', description: 'Test operator name (optional)' },
        wireA: {
          type: 'object',
          description: 'Per-wire summary: { name, mean_rl_db, worst_rl_db, peak_vswr, in_cable_peak_rho, in_cable_peak_ft, vf_percent }',
        },
        wireB: { type: 'object', description: 'Same shape as wireA (optional, for pair tests)' },
        skew: { type: 'object', description: 'Pair skew summary: { skew_per_m, dvf_pp, total_skew_ps }' },
        verdict: { type: 'string', description: 'Overall verdict (PASS / MARGINAL / FAIL)' },
        thresholds: { type: 'object', description: 'Threshold values used (rl, vswr, reflection, skew limits)' },
        notes: { type: 'string', description: 'Free-form operator notes' },
      },
      required: ['cable_label', 'wireA'],
    },
  },
  {
    name: 'bom_generator',
    description:
      'Generate a bill of materials for a cable assembly. Estimates Cu / dielectric / jacket mass per length, multiplies by user-supplied unit prices, sums totals. Returns a markdown table the user can paste into Excel / SAP.',
    input_schema: {
      type: 'object',
      properties: {
        cable_id: { type: 'string', description: 'Cable id from the database' },
        length_m: { type: 'number', description: 'Length in meters' },
        connectors_a: { type: 'string', description: 'Connector at end A (free-form, e.g., "N-male")' },
        connectors_b: { type: 'string', description: 'Connector at end B' },
        cu_price_usd_per_kg: { type: 'number', description: 'Spot Cu price USD/kg (default 9.5)' },
        connector_unit_price_usd: { type: 'number', description: 'Per-connector cost (default 12)' },
        labor_usd: { type: 'number', description: 'Assembly labor (default 25)' },
        qty: { type: 'number', description: 'Number of identical assemblies (default 1)' },
      },
      required: ['cable_id', 'length_m'],
    },
  },
  {
    name: 'lay_for_skew',
    description:
      'Inverse of pair_lay_skew: given a target intra-pair skew (ps/m) and an expected εr mismatch, compute the maximum pair lay length that meets the target. Use when the user asks "what lay length do I need for ≤ X ps/m skew?".',
    input_schema: {
      type: 'object',
      properties: {
        target_skew_ps_per_m: { type: 'number', description: 'Maximum allowed intra-pair skew in ps/m (Cat 6A ~25, Cat 8 ~7, USB4 ~5)' },
        delta_er: { type: 'number', description: 'εr difference between the two wires of the pair (typical 0.01–0.05)' },
      },
      required: ['target_skew_ps_per_m', 'delta_er'],
    },
  },
  {
    name: 'propose_tdr_scenario',
    description:
      "Propose a TDR Sim defect pattern (8 segments). Each segment is 'ideal' | 'kink' | 'crush' | 'conn' | 'splice'. The user clicks Apply on the resulting tool pill and the TDR Sim tab loads the pattern for visualisation. Use when the user wants to *see* what a kind of fault looks like on a TDR trace.",
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Short option name e.g. "Crush at midspan", "Bad connector launches"' },
        defects: { type: 'array', items: { type: 'string' }, description: 'Length-8 array of segment types' },
        rationale: { type: 'string', description: 'One-sentence trade-off explanation' },
      },
      required: ['label', 'defects'],
    },
  },
  {
    name: 'propose_atten_preset',
    description:
      'Propose an Attenuation-plot preset { d (mm), εr, tan δ }. The user clicks Apply on the tool pill and the Atten Plot tab loads the curve. Use when the user wants to compare materials or sizes for a given attenuation target.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Short option name e.g. "Cat 6A solid PE", "USB4 foamed FEP"' },
        d: { type: 'number', description: 'Conductor diameter (mm)' },
        er: { type: 'number', description: 'Dielectric εr' },
        tand: { type: 'number', description: 'Loss tangent (e.g., 3.5e-4 for foamed PE)' },
        rationale: { type: 'string', description: 'One-sentence trade-off explanation' },
      },
      required: ['label', 'd', 'er', 'tand'],
    },
  },
  {
    name: 'propose_eye_preset',
    description:
      'Propose an Eye-diagram preset { bitRate (Gbps), cableBW (GHz), jitter (ps p-p), noise (mV-equivalent ×1000) }. The user clicks Apply on the tool pill and the Eye tab redraws.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Short option name e.g. "10G clean", "USB4 worst-case"' },
        bitRate: { type: 'number', description: 'Bit rate in Gbps (slider range 1–25)' },
        cableBW: { type: 'number', description: 'Effective channel −3 dB bandwidth in GHz' },
        jitter: { type: 'number', description: 'Total jitter in ps peak-peak' },
        noise: { type: 'number', description: 'Noise level scaled (slider range 0–50)' },
        rationale: { type: 'string', description: 'One-sentence trade-off explanation' },
      },
      required: ['label', 'bitRate', 'cableBW'],
    },
  },
  {
    name: 'propose_cost_preset',
    description:
      'Propose a Cost-Calc preset { cable_id, length_m, cu_price_usd_kg, cpk, line_speed_m_min }. The user clicks Apply on the tool pill and the Cost tab refreshes. Pull cu_price from get_company_defaults if you have it.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Short option name e.g. "Cat 6A 1000 m baseline"' },
        cable: { type: 'string', description: 'Cost-tab cable id: cat6a | cat8 | usb32 | spw | starquad' },
        length_m: { type: 'number', description: 'Length in metres' },
        cu_price_usd_kg: { type: 'number', description: 'Copper rod price USD/kg' },
        cpk: { type: 'number', description: 'Process capability index target (1.0–2.0 typical)' },
        line_speed_m_min: { type: 'number', description: 'Line speed assumption m/min' },
        rationale: { type: 'string', description: 'One-sentence trade-off explanation' },
      },
      required: ['label'],
    },
  },
  {
    name: 'get_company_defaults',
    description:
      "Read the engineer's persistent company-wide defaults stored on this device. Includes copper / SPC / FEP price per kg, preferred jacket / conductor / dielectric materials, max line speed and anneal temp, default tolerances, and free-form company name + notes. Call this BEFORE quoting cost, picking materials, or doing process-feasibility checks so your answer matches the engineer's factory.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'set_company_defaults',
    description:
      'Write/merge company-wide defaults to local storage. Only the keys you pass are updated; omit a key to leave it alone. Use when the engineer says "remember Cu is $X/kg here" or "we always use FEP" — capture once, reuse forever. Save only stable factory facts; do not save ephemeral conversation context.',
    input_schema: {
      type: 'object',
      properties: {
        cu_price_usd_kg:        { type: 'number', description: 'Copper rod price USD per kg' },
        spc_price_usd_kg:       { type: 'number', description: 'Silver-plated copper price USD per kg' },
        fep_price_usd_kg:       { type: 'number', description: 'FEP pellet price USD per kg' },
        preferred_jacket:       { type: 'string', description: 'pvc | lszh | tpu | pur | fep_jkt' },
        preferred_conductor:    { type: 'string', description: 'cu | spc | tc | npc' },
        preferred_dielectric:   { type: 'string', description: 'pe_solid | pe_foamed | ptfe | fep | fep_foamed | pfa | eptfe' },
        max_line_speed_m_min:   { type: 'number', description: 'Plant ceiling for extruder line speed (m/min)' },
        max_anneal_c:           { type: 'number', description: 'Plant ceiling for conductor annealing temperature (°C)' },
        z0_tol_pct:             { type: 'number', description: 'Default Z₀ tolerance window (%)' },
        od_tol_mm:              { type: 'number', description: 'Default outer-diameter tolerance (mm)' },
        company_name:           { type: 'string', description: 'Company / brand name' },
        factory_location:       { type: 'string', description: 'Factory location (city / country)' },
        notes:                  { type: 'string', description: 'Free-form notes the agent should remember about this site' },
      },
    },
  },
  {
    name: 'whatif_panel',
    description:
      'Render an interactive "what-if" panel inline in the chat with up to 4 sliders the engineer can drag to see live re-computation of a target quantity (Z₀, IL, NEXT, skew, cost, etc.). Use when a question is exploratory: "how does Z₀ change if εᵣ varies between 1.5-2.3" or "show me the Cu cost vs AWG sweep". The formula is JS-style with the slider variable names available. Returns immediately — the chat renders the interactive panel.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title shown above the panel' },
        // Sliders: each has a variable name available inside formula
        sliders: {
          type: 'array',
          description: 'Up to 4 sliders. Each: { name (var name), label, min, max, step, value (default), unit (optional) }',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              label: { type: 'string' },
              min: { type: 'number' },
              max: { type: 'number' },
              step: { type: 'number' },
              value: { type: 'number' },
              unit: { type: 'string' },
            },
            required: ['name', 'label', 'min', 'max', 'step', 'value'],
          },
        },
        // Output formula(s) — JS expression using slider names. Use Math.* freely.
        // Example: 'Z = 138 / Math.sqrt(er) * Math.log10(D/d)'
        outputs: {
          type: 'array',
          description: 'Output rows. Each: { label, formula (JS expr using slider vars), unit, decimals }',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              formula: { type: 'string' },
              unit: { type: 'string' },
              decimals: { type: 'number' },
            },
            required: ['label', 'formula'],
          },
        },
        annotation: { type: 'string', description: 'One-line note under the panel' },
      },
      required: ['title', 'sliders', 'outputs'],
    },
  },
  {
    name: 'log_defect',
    description:
      'Log a manufacturing defect classified from a shop-floor photo into the persistent defect history. Call this AFTER you have classified a defect from an attached image so the engineer can build a pattern-history of recurring shop-floor issues. Defect history persists in localStorage and is visible in the Library tab.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Defect class: kink | crush | scratch | void | eccentricity | pair-untwist | foil-tear | braid-pigtail | OD-ovality | color-bleed | other',
        },
        stage: {
          type: 'string',
          description: 'Process Sim stage most likely responsible: conductor | stranding | insulation | pair | pair_wrap | pair_foil | bundle | shield | jacket',
        },
        severity: { type: 'string', description: 'low | medium | high — engineering judgement' },
        root_cause: { type: 'string', description: 'One-sentence root cause (e.g., "die gap too tight + take-up tension > 110 N")' },
        suggested_fix: { type: 'string', description: 'Specific machine setting change recommended' },
        recipe_id: { type: 'string', description: 'Optional id linking this defect to a saved recipe annotation' },
        notes: { type: 'string', description: 'Free-form notes (operator initials, line number, batch, etc.)' },
      },
      required: ['type'],
    },
  },
  {
    name: 'list_defect_log',
    description:
      'Read the persistent defect log. Use when the engineer asks "what defects have we seen lately?", "show me Monday-morning failures", or wants to spot recurring patterns. Returns up to 200 most-recent entries.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'generate_diagram',
    description:
      'Render an inline SVG diagram in the chat. Useful for visualising things the engineer asks about that aren\'t already covered by another tool. Supported kinds: smith_chart (with optional impedance points), atten_curve (atten dB vs MHz), cross_section (concentric layers), eye_diagram (synthetic), z_step_chart (TDR Z vs distance), bargraph (categorical comparisons). Returns a tool result with `_inline_svg` so the chat renders the picture inline.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'smith_chart | atten_curve | cross_section | eye_diagram | z_step_chart | bargraph' },
        title: { type: 'string', description: 'Caption shown above the diagram' },
        // Per-kind data fields:
        impedances:    { type: 'array', description: 'For smith_chart: array of { real, imag, label } points (Z normalised to 50 Ω).' },
        atten_table:   { type: 'object', description: 'For atten_curve: { freq_MHz: dB_per_100ft } map.' },
        layers:        { type: 'array', description: 'For cross_section: array of { name, color, t_mm } from inner to outer.' },
        bars:          { type: 'array', description: 'For bargraph: array of { label, value, unit, color }.' },
        z_trace:       { type: 'array', description: 'For z_step_chart: array of { x_m, z_ohm } pairs.' },
        bit_rate_gbps: { type: 'number', description: 'For eye_diagram: bit rate in Gbps' },
        eye_jitter_ps: { type: 'number', description: 'For eye_diagram: total jitter peak-peak in ps' },
        annotation:    { type: 'string', description: 'One-line annotation under the diagram' },
      },
      required: ['kind', 'title'],
    },
  },
];

// ── helpers ─────────────────────────────────────────────
const num = (v, digits = 2) => (typeof v === 'number' && isFinite(v) ? Number(v.toFixed(digits)) : v);

// ── dispatcher ──────────────────────────────────────────
export function dispatchCableTool(name, input) {
  try {
    switch (name) {
      case 'calc_z0_coax': {
        const { D, d, er } = input;
        if (!(D > 0 && d > 0 && er > 0)) throw new Error('D, d, er must be positive');
        if (D <= d) throw new Error('D (dielectric OD) must be greater than d (inner conductor OD)');
        const z0 = (138 / Math.sqrt(er)) * Math.log10(D / d);
        return {
          z0_ohm: num(z0, 2),
          formula: 'Z₀ = (138/√εᵣ) · log₁₀(D/d)',
          inputs: { D_mm: D, d_mm: d, er },
          notes: z0 < 30 || z0 > 200 ? 'Outside typical 30–200 Ω range; check units (mm vs in).' : undefined,
        };
      }
      case 'calc_braid_coverage': {
        const { N, P, d, D, PR } = input;
        if (!(N > 0 && P > 0 && d > 0 && D > 0 && PR > 0)) throw new Error('All inputs must be positive');
        const Cdir = N / 2;
        const R_in = (D + 2 * d) / 2 / 25.4;
        const d_in = d / 25.4;
        const alphaRad = Math.atan((2 * Math.PI * R_in * PR) / Cdir);
        const F = (P * PR * d_in) / Math.sin(alphaRad);
        const Fc = Math.max(0, Math.min(1, F));
        const K = (2 * Fc - Fc * Fc) * 100;
        const alpha_deg = (alphaRad * 180) / Math.PI;
        const verdict =
          K >= 95 ? 'EMI critical grade (aerospace, MIL, SpaceWire)' :
          K >= 85 ? 'High performance (Cat 6A, instrumentation)' :
          K >= 65 ? 'General purpose (low-EMI installs)' :
          'Insufficient — under-spec for most data cable';
        return {
          K_percent: num(K, 1),
          helix_angle_deg: num(alpha_deg, 1),
          fill_factor_F: num(Fc, 3),
          verdict,
          inputs: { N, P, d_mm: d, D_mm: D, PR },
        };
      }
      case 'awg_to_mm': {
        const { awg } = input;
        if (typeof awg !== 'number') throw new Error('awg required');
        const mm = 0.127 * Math.pow(92, (36 - awg) / 39);
        return { awg, mm: num(mm, 4), inch: num(mm / 25.4, 5) };
      }
      case 'mm_to_awg': {
        const { mm } = input;
        if (!(mm > 0)) throw new Error('mm must be positive');
        const awg = 36 - (39 * Math.log(mm / 0.127)) / Math.log(92);
        return { mm, awg_exact: num(awg, 2), awg_nearest: Math.round(awg) };
      }
      case 'velocity_factor': {
        const { er, length_m } = input;
        if (!(er > 0)) throw new Error('er must be positive');
        const vf = 1 / Math.sqrt(er);
        const c = 299792458; // m/s
        const result = { vf: num(vf, 4), vf_percent: num(vf * 100, 1), er };
        if (typeof length_m === 'number' && length_m > 0) {
          const delay_s = length_m / (vf * c);
          result.length_m = length_m;
          result.delay_ns = num(delay_s * 1e9, 2);
          result.delay_per_m_ns = num(1e9 / (vf * c), 3);
        }
        return result;
      }
      case 'pair_lay_skew': {
        const { lay_mm, delta_er } = input;
        if (!(lay_mm > 0 && delta_er >= 0)) throw new Error('lay_mm > 0 and delta_er >= 0 required');
        // First-order: skew (ps/m) ≈ lay_mm × delta_er × 50
        // Wire seeing higher εr propagates slower; over many turns, skew accumulates.
        const skew_ps_per_m = lay_mm * delta_er * 50;
        return {
          skew_ps_per_m: num(skew_ps_per_m, 1),
          skew_ps_per_ft: num(skew_ps_per_m * 0.3048, 1),
          inputs: { lay_mm, delta_er },
          notes: 'First-order estimate. Real skew depends on conductor orientation, twist symmetry, and material homogeneity. Cat 6A target ≤25 ps/m, USB4 / 25G+ targets ≤5 ps/m.',
        };
      }
      case 'lookup_cable': {
        const { query } = input;
        const matches = lookupCableDB(query);
        if (matches.length === 0) {
          return {
            matches: [],
            available_ids: Object.keys(CABLE_DB),
            note: `No match for "${query}". Try one of the available_ids above.`,
          };
        }
        return { matches: matches.slice(0, 6) };
      }
      case 'add_cable': {
        const { id, name, z0, family, vf, cap_pf_ft, od_mm, atten_db_per_100ft, notes, datasheet } = input;
        if (!id || !name || !(z0 > 0)) throw new Error('id, name, and z0 (>0) are required');
        const result = addCustomCableCable({ id, name, z0, family, vf, cap_pf_ft, od_mm, atten_db_per_100ft, notes, datasheet });
        return {
          ok: true,
          id: result.id,
          stored_at: 'browser localStorage (this device only)',
          note: 'Searchable via lookup_cable. Survives close/reopen on this device.',
        };
      }
      case 'list_custom_cables': {
        const map = getCustomCableCables();
        const list = Object.values(map);
        return { count: list.length, cables: list };
      }
      case 'delete_cable': {
        if (!input.id) throw new Error('id required');
        const ok = deleteCustomCableCable(input.id);
        return ok ? { ok: true, deleted: input.id } : { ok: false, error: `No custom cable with id "${input.id}". Use list_custom_cables to see what's saved.` };
      }
      case 'compute_attenuation': {
        const { cable_id, freq_mhz, length_ft } = input;
        // Combined DB so attenuation works for custom cables too
        const merged = { ...CABLE_DB, ...getCustomCableCables() };
        const cable = merged[cable_id];
        if (!cable) throw new Error(`Unknown cable_id "${cable_id}". Use lookup_cable first.`);
        if (!(freq_mhz > 0 && length_ft > 0)) throw new Error('freq_mhz and length_ft must be positive');
        // Interpolate dB/100ft using √f scaling between adjacent data points.
        const tbl = Object.entries(cable.atten_db_per_100ft)
          .map(([f, db]) => [parseFloat(f), db])
          .sort((a, b) => a[0] - b[0]);
        const fLo = tbl[0][0], fHi = tbl[tbl.length - 1][0];
        let db_per_100ft;
        if (freq_mhz <= fLo) {
          db_per_100ft = tbl[0][1] * Math.sqrt(freq_mhz / fLo);
        } else if (freq_mhz >= fHi) {
          db_per_100ft = tbl[tbl.length - 1][1] * Math.sqrt(freq_mhz / fHi);
        } else {
          for (let i = 0; i < tbl.length - 1; i++) {
            const [f1, a1] = tbl[i];
            const [f2, a2] = tbl[i + 1];
            if (freq_mhz >= f1 && freq_mhz <= f2) {
              const t = (Math.sqrt(freq_mhz) - Math.sqrt(f1)) / (Math.sqrt(f2) - Math.sqrt(f1));
              db_per_100ft = a1 + t * (a2 - a1);
              break;
            }
          }
        }
        const total_db = (db_per_100ft / 100) * length_ft;
        return {
          cable: cable.name,
          freq_mhz, length_ft,
          attenuation_db_per_100ft: num(db_per_100ft, 2),
          attenuation_db_total: num(total_db, 2),
          power_lost_percent: num((1 - Math.pow(10, -total_db / 10)) * 100, 1),
          notes: freq_mhz > fHi ? `Extrapolated above table (max ${fHi} MHz). Real loss may exceed estimate at higher freq due to dielectric losses.` : undefined,
        };
      }
      case 'geometry_for_z0': {
        const { z0_target, er, d_mm } = input;
        if (!(z0_target > 0 && er > 0)) throw new Error('z0_target and er must be positive');
        // Z₀ = (138/√εᵣ)·log10(D/d) → D/d = 10^(Z₀·√εᵣ/138)
        const Dd_ratio = Math.pow(10, (z0_target * Math.sqrt(er)) / 138);
        const result = {
          z0_target,
          er,
          D_over_d_ratio: num(Dd_ratio, 3),
          formula: 'D/d = 10^(Z₀·√εᵣ / 138)',
        };
        if (d_mm > 0) {
          result.d_mm = d_mm;
          result.D_mm = num(d_mm * Dd_ratio, 3);
        } else {
          // Provide example geometry for typical d values
          result.examples = [0.5, 0.91, 1.0, 1.63].map((d) => ({
            d_mm: d,
            D_mm: num(d * Dd_ratio, 3),
          }));
        }
        return result;
      }
      case 'propose_braid_preset': {
        const { label, N, P, d_mm, D_mm, PR, material, rationale } = input;
        if (!(N > 0 && P > 0 && d_mm > 0 && D_mm > 0 && PR > 0)) throw new Error('All braid params must be positive');
        const Cdir = N / 2;
        const R_in = (D_mm + 2 * d_mm) / 2 / 25.4;
        const d_in = d_mm / 25.4;
        const alphaRad = Math.atan((2 * Math.PI * R_in * PR) / Cdir);
        const F = (P * PR * d_in) / Math.sin(alphaRad);
        const Fc = Math.max(0, Math.min(1, F));
        const K = (2 * Fc - Fc * Fc) * 100;
        const alpha_deg = (alphaRad * 180) / Math.PI;
        const verdict = K >= 95 ? 'EMI critical' : K >= 85 ? 'High performance' : K >= 65 ? 'General purpose' : 'Insufficient';
        return {
          label,
          predicted_K_pct: num(K, 1),
          helix_angle_deg: num(alpha_deg, 1),
          fill_factor_F: num(Fc, 3),
          verdict,
          rationale: rationale || undefined,
          inputs: { N, P, d_mm, D_mm, PR, material },
          // Magic fields the FloatingAgent UI looks for to render an Apply button:
          _apply_preset: { N, P, d: d_mm, D: D_mm, PR, material },
          _section: 'braid',
        };
      }
      case 'propose_z0_preset': {
        const { label, mode = 'coax', D_mm, d_mm, er, rationale } = input;
        if (!(D_mm > 0 && d_mm > 0 && er > 0)) throw new Error('D_mm, d_mm, er must be positive');
        if (D_mm <= d_mm) throw new Error('D must be greater than d');
        let z0;
        if (mode === 'coax') z0 = (138 / Math.sqrt(er)) * Math.log10(D_mm / d_mm);
        else {
          const erEff = 0.4 + 0.55 * er;
          z0 = (276 / Math.sqrt(erEff)) * Math.log10(2 * D_mm / d_mm);
        }
        return {
          label,
          predicted_z0_ohm: num(z0, 1),
          mode,
          inputs: { D_mm, d_mm, er },
          rationale: rationale || undefined,
          _apply_preset: { mode, D: D_mm, d: d_mm, er },
          _section: 'calc',
        };
      }
      case 'propose_pair_preset': {
        const { label, lay_mm, pair_lays_mm, bundle_lay_mm, direction, tension_n, rationale } = input;
        if (!label) throw new Error('label required');
        if (lay_mm == null && (!pair_lays_mm || pair_lays_mm.length === 0)) {
          throw new Error('Provide lay_mm (single value) or pair_lays_mm (array)');
        }
        return {
          label,
          inputs: { lay_mm, pair_lays_mm, bundle_lay_mm, direction, tension_n },
          rationale: rationale || undefined,
          _apply_preset: { lay_mm, pair_lays_mm, bundle_lay_mm, direction, tension_n },
          _section: 'lay',
        };
      }
      case 'propose_tdr_scenario': {
        const { label, defects, rationale } = input;
        if (!Array.isArray(defects)) throw new Error('defects must be an array');
        const allowed = ['ideal', 'kink', 'crush', 'conn', 'splice'];
        const cleaned = defects.slice(0, 8).map((s) => allowed.includes(s) ? s : 'ideal');
        while (cleaned.length < 8) cleaned.push('ideal');
        return {
          label,
          inputs: { defects: cleaned },
          rationale: rationale || undefined,
          _apply_preset: { defects: cleaned },
          _section: 'tdr',
        };
      }
      case 'propose_atten_preset': {
        const { label, d, er, tand, rationale } = input;
        if (!(d > 0 && er > 0 && tand >= 0)) throw new Error('d, er must be positive; tand non-negative');
        return {
          label,
          inputs: { d, er, tand },
          rationale: rationale || undefined,
          _apply_preset: { d, er, tand },
          _section: 'atten',
        };
      }
      case 'propose_eye_preset': {
        const { label, bitRate, cableBW, jitter, noise, rationale } = input;
        if (!(bitRate > 0 && cableBW > 0)) throw new Error('bitRate and cableBW must be positive');
        return {
          label,
          inputs: { bitRate, cableBW, jitter, noise },
          rationale: rationale || undefined,
          _apply_preset: { bitRate, cableBW, jitter, noise },
          _section: 'eye',
        };
      }
      case 'propose_cost_preset': {
        const { label, cable, length_m, cu_price_usd_kg, cpk, line_speed_m_min, rationale } = input;
        if (!label) throw new Error('label required');
        return {
          label,
          inputs: { cable, length_m, cu_price_usd_kg, cpk, line_speed_m_min },
          rationale: rationale || undefined,
          _apply_preset: { cable, length_m, cu_price_usd_kg, cpk, line_speed_m_min },
          _section: 'cost',
        };
      }
      case 'sensitivity_analysis': {
        const { vary, from, to, steps = 11, D, d, er } = input;
        if (!['D', 'd', 'er'].includes(vary)) throw new Error('vary must be "D", "d", or "er"');
        if (!(from > 0 && to > 0 && to !== from)) throw new Error('from and to must be positive and different');
        const N = Math.max(2, Math.min(101, Math.floor(steps)));
        const sweep = [];
        for (let i = 0; i < N; i++) {
          const x = from + ((to - from) * i) / (N - 1);
          const D_ = vary === 'D' ? x : D;
          const d_ = vary === 'd' ? x : d;
          const er_ = vary === 'er' ? x : er;
          if (!(D_ > 0 && d_ > 0 && er_ > 0 && D_ > d_)) {
            sweep.push({ [vary]: num(x, 4), z0_ohm: null, error: 'invalid combo' });
            continue;
          }
          const z0 = (138 / Math.sqrt(er_)) * Math.log10(D_ / d_);
          sweep.push({ [vary]: num(x, 4), z0_ohm: num(z0, 2) });
        }
        // Identify which value of vary hits 50 / 75 Ω closest
        const valid = sweep.filter((s) => s.z0_ohm != null);
        const closest = (target) => {
          let best = null;
          for (const s of valid) {
            if (best == null || Math.abs(s.z0_ohm - target) < Math.abs(best.z0_ohm - target)) best = s;
          }
          return best;
        };
        return {
          vary, from, to, fixed: { D, d, er },
          sweep,
          closest_to_50: closest(50),
          closest_to_75: closest(75),
        };
      }
      case 'vna_qc_report': {
        const { cable_label, operator, wireA, wireB, skew, verdict, thresholds, notes } = input;
        if (!cable_label || !wireA) throw new Error('cable_label and wireA are required');
        const ts = new Date().toISOString();
        const lines = [];
        lines.push(`# VNA Lab QC Report — ${cable_label}`);
        lines.push('');
        lines.push(`- **Test date**: ${ts}`);
        if (operator) lines.push(`- **Operator**: ${operator}`);
        if (verdict) lines.push(`- **Verdict**: **${verdict}**`);
        lines.push('');
        const renderWire = (label, w) => {
          if (!w) return;
          lines.push(`## ${label} — ${w.name || 'unnamed'}`);
          lines.push('');
          lines.push('| Metric | Value |');
          lines.push('|---|---|');
          if (w.mean_rl_db != null)         lines.push(`| Mean RL | ${w.mean_rl_db} dB |`);
          if (w.worst_rl_db != null)        lines.push(`| Worst RL | ${w.worst_rl_db} dB |`);
          if (w.peak_vswr != null)          lines.push(`| Peak VSWR | ${w.peak_vswr} |`);
          if (w.in_cable_peak_rho != null)  lines.push(`| In-cable peak \\|ρ\\| | ${w.in_cable_peak_rho} |`);
          if (w.in_cable_peak_ft != null)   lines.push(`| In-cable peak distance | ${w.in_cable_peak_ft} ft |`);
          if (w.vf_percent != null)         lines.push(`| Velocity Factor | ${w.vf_percent}% |`);
          lines.push('');
        };
        renderWire('Wire A', wireA);
        renderWire('Wire B', wireB);
        if (skew) {
          lines.push(`## Pair Skew`);
          lines.push('');
          lines.push('| Metric | Value |');
          lines.push('|---|---|');
          if (skew.skew_per_m != null)    lines.push(`| Skew rate | ${skew.skew_per_m} ps/m |`);
          if (skew.dvf_pp != null)        lines.push(`| ΔVF | ${skew.dvf_pp} pp |`);
          if (skew.total_skew_ps != null) lines.push(`| Total skew | ${skew.total_skew_ps} ps |`);
          lines.push('');
        }
        if (thresholds) {
          lines.push(`## Thresholds`);
          lines.push('');
          lines.push('```json');
          lines.push(JSON.stringify(thresholds, null, 2));
          lines.push('```');
          lines.push('');
        }
        if (notes) {
          lines.push(`## Notes`);
          lines.push('');
          lines.push(notes);
          lines.push('');
        }
        lines.push(`---`);
        lines.push(`Generated by VNA Lab agent · brian-coax-lab.vercel.app`);
        return { markdown: lines.join('\n'), bytes: lines.join('\n').length };
      }
      case 'bom_generator': {
        const { cable_id, length_m, connectors_a, connectors_b, cu_price_usd_per_kg = 9.5, connector_unit_price_usd = 12, labor_usd = 25, qty = 1 } = input;
        const merged = { ...CABLE_DB, ...getCustomCableCables() };
        const c = merged[cable_id];
        if (!c) throw new Error(`Unknown cable_id "${cable_id}". Use lookup_cable.`);
        if (!(length_m > 0)) throw new Error('length_m must be positive');
        // Crude Cu mass estimate: 0.6× of OD-area × density × length (very rough; user can adjust)
        const od_mm = c.od_mm || 5;
        const cu_volume_cm3 = Math.PI * Math.pow((od_mm * 0.3) / 10 / 2, 2) * (length_m * 100); // ≈ 30% of OD diameter is Cu
        const cu_mass_kg = (cu_volume_cm3 * 8.96) / 1000;
        const cable_cost = cu_mass_kg * cu_price_usd_per_kg;
        const conn_count = (connectors_a ? 1 : 0) + (connectors_b ? 1 : 0);
        const conn_cost = conn_count * connector_unit_price_usd;
        const total_per_unit = cable_cost + conn_cost + labor_usd;
        const total = total_per_unit * qty;
        const lines = [];
        lines.push(`# Bill of Materials — ${c.name} assembly`);
        lines.push('');
        lines.push('| Item | Detail | Qty | Unit | Subtotal |');
        lines.push('|---|---|---|---|---|');
        lines.push(`| Cable | ${c.name} (Z₀=${c.z0} Ω, ${od_mm} mm OD) | ${num(length_m, 2)} m | $${num(cu_price_usd_per_kg, 2)}/kg Cu | $${num(cable_cost, 2)} |`);
        if (connectors_a) lines.push(`| Connector A | ${connectors_a} | 1 | $${num(connector_unit_price_usd, 2)} | $${num(connector_unit_price_usd, 2)} |`);
        if (connectors_b) lines.push(`| Connector B | ${connectors_b} | 1 | $${num(connector_unit_price_usd, 2)} | $${num(connector_unit_price_usd, 2)} |`);
        lines.push(`| Labor | Termination + test | 1 | $${num(labor_usd, 2)} | $${num(labor_usd, 2)} |`);
        lines.push(`| **Per assembly** |  |  |  | **$${num(total_per_unit, 2)}** |`);
        if (qty > 1) lines.push(`| **Total (×${qty})** |  |  |  | **$${num(total, 2)}** |`);
        return { markdown: lines.join('\n'), per_unit_usd: num(total_per_unit, 2), total_usd: num(total, 2) };
      }
      case 'lay_for_skew': {
        const { target_skew_ps_per_m, delta_er } = input;
        if (!(target_skew_ps_per_m > 0)) throw new Error('target_skew_ps_per_m must be positive');
        if (!(delta_er > 0)) throw new Error('delta_er must be positive');
        // Inverse of pair_lay_skew: skew = lay_mm × delta_er × 50  →  lay_mm = skew / (delta_er × 50)
        const lay_mm = target_skew_ps_per_m / (delta_er * 50);
        return {
          target_skew_ps_per_m,
          delta_er,
          max_lay_mm: num(lay_mm, 2),
          max_lay_inch: num(lay_mm / 25.4, 4),
          notes: lay_mm < 5 ? 'Required lay is shorter than 5 mm — consider tighter εr control instead of tighter lay.' : (lay_mm > 25 ? 'Lay > 25 mm is unusually loose; check manufacturability.' : 'Within typical lay-length range (5–25 mm).'),
        };
      }
      case 'get_company_defaults': {
        return { defaults: getCompanyDefaults(), stored_at: 'browser localStorage (this device only)' };
      }
      case 'set_company_defaults': {
        const updated = setCompanyDefaults(input || {});
        return { ok: true, defaults: updated, note: 'Saved to browser localStorage. Future sessions will see these values.' };
      }
      case 'log_defect': {
        const entry = addDefectEntry(input || {});
        return { ok: true, entry, note: 'Defect logged to persistent history. Visible in Library tab.' };
      }
      case 'whatif_panel': {
        const { title, sliders, outputs, annotation } = input || {};
        if (!title || !Array.isArray(sliders) || !Array.isArray(outputs)) {
          throw new Error('title, sliders[], outputs[] required');
        }
        if (sliders.length > 4) throw new Error('max 4 sliders');
        if (outputs.length > 4) throw new Error('max 4 output rows');
        return {
          ok: true,
          title,
          annotation: annotation || '',
          spec: { title, sliders, outputs, annotation },
          _whatif_panel: { title, sliders, outputs, annotation },
        };
      }
      case 'list_defect_log': {
        const list = getDefectLog();
        return { count: list.length, entries: list };
      }
      case 'generate_diagram': {
        // Validation per kind. The actual SVG is built by the FloatingAgent
        // ToolPill renderer when it sees `_inline_svg` in the result, so here
        // we just pass through the structured spec it needs to render.
        const { kind, title } = input || {};
        if (!kind || !title) throw new Error('kind and title are required');
        const allowed = ['smith_chart', 'atten_curve', 'cross_section', 'eye_diagram', 'z_step_chart', 'bargraph'];
        if (!allowed.includes(kind)) throw new Error(`Unsupported diagram kind "${kind}". Use one of: ${allowed.join(', ')}`);
        return {
          ok: true,
          kind,
          title,
          annotation: input.annotation || '',
          spec: input,
          _inline_svg: input,  // Magic flag — ToolPill renders this as a diagram
        };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message || 'Tool execution failed' };
  }
}
