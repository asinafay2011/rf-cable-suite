import React, { useMemo, useState } from 'react'
import { Database, Layers, Search } from 'lucide-react'
import {
  MATERIAL_FAMILIES,
  FOIL_TAPE_MATERIALS,
  PTFE_TAPE_MATERIALS,
  SPC_FLATWIRE_MATERIALS,
  formatFoilTapeLabel,
  formatPtfeTapeLabel,
  formatSpcFlatwireLabel,
} from '../data/materialLibrary.js'

const C = {
  bg: '#090d0e',
  panel: '#101619',
  panelHi: '#141d20',
  border: '#243138',
  borderHi: '#3a4a52',
  text: '#f0ebe2',
  dim: '#a7b0b6',
  muted: '#6f7a80',
  amber: '#fbbf24',
  orange: '#fb923c',
  teal: '#5eead4',
  sky: '#7dd3fc',
}

const unique = (items, key) => Array.from(new Set(items.map((item) => item[key]).filter((value) => value != null)))

const stats = {
  ptfeCount: PTFE_TAPE_MATERIALS.length,
  spcCount: SPC_FLATWIRE_MATERIALS.length,
  foilCount: FOIL_TAPE_MATERIALS.length,
  thicknesses: unique(PTFE_TAPE_MATERIALS, 'thicknessMil').sort((a, b) => a - b),
  widths: unique(PTFE_TAPE_MATERIALS, 'widthIn').sort((a, b) => a - b),
  foilWidths: unique(FOIL_TAPE_MATERIALS, 'widthIn').sort((a, b) => a - b),
  spcWidths: unique(SPC_FLATWIRE_MATERIALS, 'widthIn').sort((a, b) => a - b),
  spcThicknesses: unique(SPC_FLATWIRE_MATERIALS, 'thicknessMil').sort((a, b) => a - b),
  density: {
    H: PTFE_TAPE_MATERIALS.filter((item) => item.densityCode === 'H').length,
    L: PTFE_TAPE_MATERIALS.filter((item) => item.densityCode === 'L').length,
  },
  shieldUse: {
    spiral: SPC_FLATWIRE_MATERIALS.filter((item) => item.shieldUse === 'spiral').length,
    helical: SPC_FLATWIRE_MATERIALS.filter((item) => item.shieldUse === 'helical').length,
  },
}

function inRangeSummary(values, unit) {
  if (!values.length) return 'none'
  const min = values[0]
  const max = values[values.length - 1]
  return `${min} - ${max} ${unit}`
}

function densityBadge(code) {
  const isHigh = code === 'H'
  return (
    <span style={{ ...S.badge, borderColor: isHigh ? '#fb923c88' : '#5eead488', color: isHigh ? C.orange : C.teal }}>
      {isHigh ? 'High density' : 'Low density'}
    </span>
  )
}

function shieldUseBadge(use) {
  const isSpiral = use === 'spiral'
  return (
    <span style={{ ...S.badge, borderColor: isSpiral ? '#fbbf2488' : '#7dd3fc88', color: isSpiral ? C.amber : C.sky }}>
      {isSpiral ? 'Spiral' : 'Helical'}
    </span>
  )
}

function laminateBadge(code) {
  return (
    <span style={{ ...S.badge, borderColor: '#fbbf2488', color: C.amber }}>
      {code}
    </span>
  )
}

export default function MaterialLibrary() {
  const [query, setQuery] = useState('')
  const [density, setDensity] = useState('all')
  const [family, setFamily] = useState('ptfe_tape')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (family === 'spc_flatwire') {
      return SPC_FLATWIRE_MATERIALS.filter((item) => {
        const useOk = density === 'all' || item.shieldUse === density
        const hay = [
          item.partNumber,
          item.basePart,
          item.plating,
          item.shieldUse,
          `${item.thicknessMil ?? ''}mil`,
          `${item.widthIn.toFixed(4)}`,
          `${item.widthMm.toFixed(3)}mm`,
        ].join(' ').toLowerCase()
        return useOk && (!q || hay.includes(q))
      })
    }
    if (family === 'foil_tape') {
      return FOIL_TAPE_MATERIALS.filter((item) => {
        const hay = [
          item.partNumber,
          item.sourcePartNumber,
          ...(item.aliases || []),
          item.laminate,
          item.laminateLabel,
          `${item.thicknessMil}mil`,
          `${item.widthIn.toFixed(4)}`,
          `${item.widthMm.toFixed(3)}mm`,
        ].join(' ').toLowerCase()
        return !q || hay.includes(q)
      })
    }
    return PTFE_TAPE_MATERIALS.filter((item) => {
      const densityOk = density === 'all' || item.densityCode === density
      const hay = [
        item.partNumber,
        item.densityCode,
        item.densityLabel,
        `${item.thicknessMil}mil`,
        `${item.widthIn}`,
        `${item.widthMm.toFixed(2)}mm`,
      ].join(' ').toLowerCase()
      return densityOk && (!q || hay.includes(q))
    })
  }, [density, family, query])

  const modeOptions = family === 'spc_flatwire' ? ['all', 'spiral', 'helical']
    : family === 'foil_tape' ? ['all']
      : ['all', 'H', 'L']

  return (
    <section style={S.wrap}>
      <header style={S.hero}>
        <div style={S.heroIcon}><Database size={18} /></div>
        <div>
          <p style={S.eyebrow}>RF material library</p>
          <h1 style={S.title}>Factory materials for cable builds</h1>
          <p style={S.subtitle}>PTFE tape, SPC flatwire, and ALK foil shields are catalog-driven, so Stack Lab and the RF agent can pick real part numbers instead of loose thickness and width guesses.</p>
        </div>
      </header>

      <div style={S.summaryGrid}>
        <div style={S.statPanel}>
          <p style={S.eyebrow}>PTFE tape</p>
          <strong style={S.statValue}>{stats.ptfeCount}</strong>
          <span style={S.statSub}>active part numbers</span>
        </div>
        <div style={S.statPanel}>
          <p style={S.eyebrow}>SPC flatwire</p>
          <strong style={S.statValue}>{stats.spcCount}</strong>
          <span style={S.statSub}>spiral {stats.shieldUse.spiral} / helical {stats.shieldUse.helical}</span>
        </div>
        <div style={S.statPanel}>
          <p style={S.eyebrow}>Foil tape</p>
          <strong style={S.statValue}>{stats.foilCount}</strong>
          <span style={S.statSub}>ALK aluminum/Kapton foil</span>
        </div>
        <div style={S.statPanel}>
          <p style={S.eyebrow}>Fine width</p>
          <strong style={S.statValue}>{inRangeSummary(stats.foilWidths.map((v) => v.toFixed(4)), 'in')}</strong>
          <span style={S.statSub}>foil/SPC code 0311 = 0.0311 in</span>
        </div>
      </div>

      <div style={S.mainGrid}>
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div>
              <p style={S.eyebrow}>Part decoder</p>
              <h2 style={S.panelTitle}>PTFE + SPC + Foil</h2>
            </div>
            <Layers size={18} color={C.teal} />
          </div>
          <div style={S.decoderGrid}>
            <div style={S.decoderCell}>
              <span>962-96000</span>
              <strong>PTFE family</strong>
            </div>
            <div style={S.decoderCell}>
              <span>05</span>
              <strong>5 mil thickness</strong>
            </div>
            <div style={S.decoderCell}>
              <span>L / H</span>
              <strong>Low / high density</strong>
            </div>
            <div style={S.decoderCell}>
              <span>0750</span>
              <strong>0.750 in width</strong>
            </div>
            <div style={S.decoderCell}>
              <span>962-96001</span>
              <strong>SPC spiral stock</strong>
            </div>
            <div style={S.decoderCell}>
              <span>962-96004</span>
              <strong>SPC helical spool</strong>
            </div>
            <div style={S.decoderCell}>
              <span>SPC-2.5</span>
              <strong>Silver plated Cu · 2.5 mil</strong>
            </div>
            <div style={S.decoderCell}>
              <span>0500</span>
              <strong>0.0050 in width</strong>
            </div>
            <div style={S.decoderCell}>
              <span>962-96003</span>
              <strong>Foil tape</strong>
            </div>
            <div style={S.decoderCell}>
              <span>ALK</span>
              <strong>Aluminum/Kapton</strong>
            </div>
            <div style={S.decoderCell}>
              <span>1.4</span>
              <strong>1.4 mil foil</strong>
            </div>
            <div style={S.decoderCell}>
              <span>0311</span>
              <strong>0.0311 in width</strong>
            </div>
          </div>
        </div>

        <div style={S.panel}>
          <div style={S.panelHead}>
            <div>
              <p style={S.eyebrow}>Agent build rule</p>
              <h2 style={S.panelTitle}>Material-first stack recipes</h2>
            </div>
          </div>
          <p style={S.body}>
            The dielectric-stack tool snaps PTFE to stocked tape. Shield layers now use 962-96001 for spiral flatwire, 962-96004 for helical spool stock, and 962-96003 for ALK foil tape.
          </p>
          <div style={S.familyGrid}>
            {MATERIAL_FAMILIES.map((family) => (
              <div key={family.id} style={{ ...S.familyItem, opacity: family.status === 'active' ? 1 : 0.55 }}>
                <span>{family.label}</span>
                <strong>{family.status === 'active' ? 'active' : 'next'}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={S.panel}>
        <div style={S.toolbar}>
          <div>
            <p style={S.eyebrow}>{family === 'spc_flatwire' ? 'SPC flatwire catalog' : family === 'foil_tape' ? 'Foil tape catalog' : 'PTFE tape catalog'}</p>
            <h2 style={S.panelTitle}>{filtered.length} visible</h2>
          </div>
          <div style={S.controls}>
            <div style={S.segment}>
              {[
                ['ptfe_tape', 'PTFE'],
                ['spc_flatwire', 'SPC'],
                ['foil_tape', 'Foil'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setFamily(value)
                    setDensity('all')
                  }}
                  style={{
                    ...S.segmentBtn,
                    ...(family === value ? S.segmentBtnActive : {}),
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <label style={S.searchBox}>
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search part, mil, width..."
                style={S.searchInput}
              />
            </label>
            <div style={S.segment}>
              {modeOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDensity(option)}
                  style={{
                    ...S.segmentBtn,
                    ...(density === option ? S.segmentBtnActive : {}),
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              {family === 'spc_flatwire' ? (
                <tr>
                  <th style={S.th}>Part number</th>
                  <th style={S.th}>Use</th>
                  <th style={S.th}>Plating</th>
                  <th style={S.th}>Thickness</th>
                  <th style={S.th}>Width</th>
                  <th style={S.th}>Stack label</th>
                </tr>
              ) : family === 'foil_tape' ? (
                <tr>
                  <th style={S.th}>Part number</th>
                  <th style={S.th}>Laminate</th>
                  <th style={S.th}>Thickness</th>
                  <th style={S.th}>Width</th>
                  <th style={S.th}>Alias</th>
                  <th style={S.th}>Stack label</th>
                </tr>
              ) : (
                <tr>
                  <th style={S.th}>Part number</th>
                  <th style={S.th}>Density</th>
                  <th style={S.th}>Thickness</th>
                  <th style={S.th}>Width</th>
                  <th style={S.th}>Stack label</th>
                </tr>
              )}
            </thead>
            <tbody>
              {filtered.map((item) => family === 'spc_flatwire' ? (
                <tr key={item.partNumber} style={S.tr}>
                  <td style={S.td}><strong style={S.part}>{item.partNumber}</strong></td>
                  <td style={S.td}>{shieldUseBadge(item.shieldUse)}</td>
                  <td style={S.td}>{item.platingLabel}</td>
                  <td style={S.td}>{item.thicknessMil == null ? 'TBD' : `${item.thicknessMil} mil`} <span style={S.muted}>{item.thicknessMm == null ? '' : `${item.thicknessMm.toFixed(4)} mm`}</span></td>
                  <td style={S.td}>{item.widthIn.toFixed(4)} in <span style={S.muted}>{item.widthMm.toFixed(3)} mm</span></td>
                  <td style={S.td}><span style={S.muted}>{formatSpcFlatwireLabel(item)}</span></td>
                </tr>
              ) : family === 'foil_tape' ? (
                <tr key={item.partNumber} style={S.tr}>
                  <td style={S.td}><strong style={S.part}>{item.partNumber}</strong></td>
                  <td style={S.td}>{laminateBadge(item.laminate)}</td>
                  <td style={S.td}>{item.thicknessMil} mil <span style={S.muted}>{item.thicknessMm.toFixed(4)} mm</span></td>
                  <td style={S.td}>{item.widthIn.toFixed(4)} in <span style={S.muted}>{item.widthMm.toFixed(3)} mm</span></td>
                  <td style={S.td}><span style={S.muted}>{item.sourcePartNumber !== item.partNumber ? item.sourcePartNumber : 'canonical'}</span></td>
                  <td style={S.td}><span style={S.muted}>{formatFoilTapeLabel(item)}</span></td>
                </tr>
              ) : (
                <tr key={item.partNumber} style={S.tr}>
                  <td style={S.td}><strong style={S.part}>{item.partNumber}</strong></td>
                  <td style={S.td}>{densityBadge(item.densityCode)}</td>
                  <td style={S.td}>{item.thicknessMil} mil <span style={S.muted}>{item.thicknessMm.toFixed(3)} mm</span></td>
                  <td style={S.td}>{item.widthIn.toFixed(3)} in <span style={S.muted}>{item.widthMm.toFixed(2)} mm</span></td>
                  <td style={S.td}><span style={S.muted}>{formatPtfeTapeLabel(item)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

const S = {
  wrap: {
    maxWidth: 1480,
    margin: '0 auto',
    padding: '34px 18px 72px',
    color: C.text,
  },
  hero: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 24,
    borderBottom: `1px solid ${C.border}`,
  },
  heroIcon: {
    width: 44,
    height: 44,
    display: 'grid',
    placeItems: 'center',
    border: `1px solid ${C.borderHi}`,
    color: C.teal,
    background: C.panel,
  },
  eyebrow: {
    margin: 0,
    color: C.orange,
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    fontWeight: 800,
  },
  title: {
    margin: '4px 0 6px',
    fontSize: 34,
    lineHeight: 1.08,
    letterSpacing: 0,
    fontWeight: 700,
  },
  subtitle: {
    margin: 0,
    maxWidth: 760,
    color: C.dim,
    lineHeight: 1.6,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 12,
    margin: '24px 0',
  },
  statPanel: {
    border: `1px solid ${C.border}`,
    background: C.panel,
    padding: 16,
    minHeight: 116,
  },
  statValue: {
    display: 'block',
    marginTop: 10,
    color: C.teal,
    fontSize: 24,
    letterSpacing: 0,
  },
  statSub: {
    display: 'block',
    marginTop: 6,
    color: C.muted,
    fontSize: 12,
    lineHeight: 1.45,
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: 12,
    marginBottom: 12,
  },
  panel: {
    border: `1px solid ${C.border}`,
    background: C.panel,
  },
  panelHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottom: `1px solid ${C.border}`,
  },
  panelTitle: {
    margin: '5px 0 0',
    fontSize: 22,
    lineHeight: 1.1,
    letterSpacing: 0,
  },
  decoderGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  },
  decoderCell: {
    padding: 18,
    borderRight: `1px solid ${C.border}`,
    minHeight: 88,
  },
  body: {
    margin: 0,
    padding: 18,
    color: C.dim,
    lineHeight: 1.55,
  },
  familyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    gap: 8,
    padding: '0 18px 18px',
  },
  familyItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 12,
    border: `1px solid ${C.border}`,
    background: C.bg,
    color: C.dim,
    minHeight: 70,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    padding: 18,
    borderBottom: `1px solid ${C.border}`,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 38,
    padding: '0 12px',
    border: `1px solid ${C.borderHi}`,
    background: C.bg,
    color: C.muted,
  },
  searchInput: {
    width: 240,
    border: 0,
    outline: 0,
    background: 'transparent',
    color: C.text,
    font: 'inherit',
  },
  segment: {
    display: 'flex',
    border: `1px solid ${C.borderHi}`,
    background: C.bg,
  },
  segmentBtn: {
    height: 38,
    minWidth: 46,
    border: 0,
    borderRight: `1px solid ${C.border}`,
    background: 'transparent',
    color: C.dim,
    font: 'inherit',
    fontWeight: 800,
    cursor: 'pointer',
  },
  segmentBtnActive: {
    background: '#132522',
    color: C.teal,
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: 900,
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    color: C.muted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2,
    borderBottom: `1px solid ${C.border}`,
  },
  tr: {
    borderBottom: `1px solid ${C.border}`,
  },
  td: {
    padding: '13px 16px',
    color: C.dim,
    fontSize: 13,
    verticalAlign: 'middle',
  },
  part: {
    color: C.text,
    fontSize: 14,
  },
  muted: {
    color: C.muted,
    marginLeft: 8,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 24,
    padding: '0 9px',
    border: '1px solid',
    background: C.bg,
    fontSize: 11,
    fontWeight: 800,
    textTransform: 'uppercase',
  },
}
