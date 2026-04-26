// Touchstone (.s1p / .s2p) parser per IEEE specification.
// Returns { format, freqs (Hz), refZ, ports, s } where s[i] is { s11, s12, s21, s22 } (complex).
//
// Header line: # <freq_unit> S <format> R <refZ>
//   freq_unit: Hz | KHz | MHz | GHz
//   format:    RI (real, imag) | MA (mag, angle°) | DB (dB, angle°)
//   refZ:      reference impedance, typically 50
// Comment lines begin with !
// .s1p: 1 freq + 1 complex (3 values per line)
// .s2p: 1 freq + 4 complex in order S11 S21 S12 S22 (9 values per line)

const FREQ_MULT = { HZ: 1, KHZ: 1e3, MHZ: 1e6, GHZ: 1e9 }

export function parseTouchstone(text, opts = {}) {
  const explicitPorts = opts.ports // 1 or 2 (from filename hint)
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  let format = 'MA'
  let freqMult = 1e9 // default GHz
  let refZ = 50

  // Find header line (#)
  const headerLine = lines.find((l) => l.startsWith('#'))
  if (headerLine) {
    const parts = headerLine.replace(/^#/, '').trim().split(/\s+/)
    // Tokens may include freq unit, parameter type (S/Y/Z), format, R refZ
    let i = 0
    while (i < parts.length) {
      const tok = parts[i].toUpperCase()
      if (FREQ_MULT[tok] != null) freqMult = FREQ_MULT[tok]
      else if (tok === 'RI' || tok === 'MA' || tok === 'DB') format = tok
      else if (tok === 'R' && parts[i + 1]) { refZ = parseFloat(parts[i + 1]); i++ }
      // S/Y/Z param type — we only handle S, ignore
      i++
    }
  }

  // Data lines
  const dataLines = lines.filter((l) => !l.startsWith('!') && !l.startsWith('#'))

  // Sniff number of values per row to detect ports if not given
  const firstRow = dataLines[0]?.split(/\s+/).filter(Boolean).map(Number)
  if (!firstRow || firstRow.length < 3) throw new Error('Touchstone: no data rows')

  let ports
  if (explicitPorts) {
    ports = explicitPorts
  } else if (firstRow.length === 3) ports = 1
  else if (firstRow.length === 9) ports = 2
  else if (firstRow.length === 5) ports = 2 // some 2-port files split across multiple lines (rare)
  else throw new Error(`Touchstone: unexpected ${firstRow.length} values per row`)

  const freqs = []
  const s = []

  for (const line of dataLines) {
    const v = line.split(/\s+/).filter(Boolean).map(Number)
    if (v.some(Number.isNaN)) continue
    if (ports === 1 && v.length >= 3) {
      const f = v[0] * freqMult
      const s11 = parsePair(v[1], v[2], format)
      freqs.push(f)
      s.push({ s11 })
    } else if (ports === 2 && v.length >= 9) {
      const f = v[0] * freqMult
      const s11 = parsePair(v[1], v[2], format)
      const s21 = parsePair(v[3], v[4], format)
      const s12 = parsePair(v[5], v[6], format)
      const s22 = parsePair(v[7], v[8], format)
      freqs.push(f)
      s.push({ s11, s21, s12, s22 })
    }
  }

  if (freqs.length === 0) throw new Error('Touchstone: no valid data rows')
  return { format, freqs, refZ, ports, s }
}

function parsePair(a, b, format) {
  if (format === 'RI') return { re: a, im: b }
  if (format === 'MA') {
    const mag = a, ang = (b * Math.PI) / 180
    return { re: mag * Math.cos(ang), im: mag * Math.sin(ang) }
  }
  if (format === 'DB') {
    const mag = Math.pow(10, a / 20)
    const ang = (b * Math.PI) / 180
    return { re: mag * Math.cos(ang), im: mag * Math.sin(ang) }
  }
  return { re: a, im: b }
}

// ── derived metrics ─────────────────────────────────────
export const cAbs = (z) => Math.sqrt(z.re * z.re + z.im * z.im)
export const cPhase = (z) => Math.atan2(z.im, z.re)

export function returnLossDb(s11) {
  const m = cAbs(s11)
  return m === 0 ? 100 : -20 * Math.log10(m)
}

export function vswr(s11) {
  const m = Math.min(0.999, cAbs(s11))
  return (1 + m) / (1 - m)
}

export function insertionLossDb(s21) {
  const m = cAbs(s21)
  return m === 0 ? 100 : -20 * Math.log10(m)
}

// Group delay τg = -dφ/dω. Unwrap phase first to avoid 2π jumps.
export function groupDelayNs(sArr, freqs, key = 's21') {
  const n = sArr.length
  const phase = new Array(n)
  for (let i = 0; i < n; i++) phase[i] = cPhase(sArr[i][key])
  // unwrap
  for (let i = 1; i < n; i++) {
    const dp = phase[i] - phase[i - 1]
    if (dp > Math.PI) phase[i] -= 2 * Math.PI
    else if (dp < -Math.PI) phase[i] += 2 * Math.PI
  }
  const tau = new Array(n)
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1)
    const i1 = Math.min(n - 1, i + 1)
    const dphi = phase[i1] - phase[i0]
    const domega = 2 * Math.PI * (freqs[i1] - freqs[i0])
    tau[i] = domega === 0 ? 0 : (-dphi / domega) * 1e9 // ns
  }
  return tau
}

// Peak return-loss point + a heuristic location estimate (crude — TDR is the proper tool).
export function s11Summary(s, freqs) {
  let worstRLDb = Infinity
  let worstFreq = 0
  let worstS11 = { re: 0, im: 0 }
  for (let i = 0; i < s.length; i++) {
    const rl = returnLossDb(s[i].s11)
    if (rl < worstRLDb) { worstRLDb = rl; worstFreq = freqs[i]; worstS11 = s[i].s11 }
  }
  const meanRL =
    s.reduce((acc, b) => acc + returnLossDb(b.s11), 0) / s.length
  return { worstRLDb, worstFreq, worstS11, meanRL }
}
