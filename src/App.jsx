import React, { useState, useMemo, useRef, useEffect, createContext, useContext } from "react";

// ═══════════════════════════════════════════════════════════════
// RF CABLE ENGINEERING SUITE · v2
// Unit-aware (mm/inch), clean UI, advanced agent
// ═══════════════════════════════════════════════════════════════

const CATEGORIES = {
  "rg-50":     { label: "RG · 50 Ω",        color: "#fbbf24" },
  "rg-75":     { label: "RG · 75 Ω",        color: "#fde68a" },
  "lmr":       { label: "LMR · Wireless",   color: "#f97316" },
  "heliax":    { label: "Heliax · Rigid",   color: "#34d399" },
  "semi":      { label: "Semi-Rigid",       color: "#9ca3af" },
  "video":     { label: "Video / Broadcast",color: "#60a5fa" },
  "phase":     { label: "Phase-Stable",     color: "#a78bfa" },
};

const CABLES = {
  rg58: { name: "RG-58/U", cat: "rg-50", alias: "M17/28, Belden 8259",
    z: 50, vp: 66, cap: 101, mass: 37, fMax: 1.0, vMax: 1900,
    d: 0.91, D: 2.95, shield: 3.60, OD: 4.95, flex: "medium", outdoor: false, power: "medium", complexity: "low",
    atten: [[30, 7.3], [100, 14.4], [450, 32.8], [900, 48.9], [1000, 52.5]],
    cons: { conductor: "19-strand tinned copper, 0.18mm each", dielectric: "Solid polyethylene, εr 2.30", shield: "Single tinned copper braid, 95% coverage", jacket: "Black PVC, 0.68mm wall" },
    proc: ["Draw and bunch 19 copper strands", "Extrude solid PE at 180–200°C to 2.95mm OD", "Braid tinned copper at 95% coverage", "Extrude PVC jacket to 4.95mm final OD", "Test: TDR, capacitance, high-pot 3kV"],
    apps: "General RF, amateur radio, test leads, CCTV", makers: "Belden, Times, CommScope" },
  rg174: { name: "RG-174/U", cat: "rg-50", alias: "M17/119, Belden 7805R",
    z: 50, vp: 66, cap: 101, mass: 11, fMax: 1.0, vMax: 1500,
    d: 0.48, D: 1.52, shield: 1.90, OD: 2.79, flex: "high", outdoor: false, power: "low", complexity: "low",
    atten: [[30, 13.8], [100, 27.6], [450, 65.6], [900, 95.1], [1000, 98.4]],
    cons: { conductor: "7-strand CCS, 0.16mm", dielectric: "Solid PE, εr 2.30", shield: "Single tinned copper braid, 90%", jacket: "Black PVC, 0.64mm" },
    proc: ["Draw copper-clad steel wire", "Bunch 7 strands for flexibility", "PE extrusion to 1.52mm OD ±0.05mm", "Tinned Cu braid 90% coverage", "Thin PVC jacket extrusion"],
    apps: "Mobile equipment, pigtails, internal jumpers", makers: "Belden, Harbour, Alpha" },
  rg178: { name: "RG-178B/U", cat: "rg-50", alias: "M17/93",
    z: 50, vp: 69, cap: 95, mass: 9, fMax: 3.0, vMax: 1000,
    d: 0.31, D: 0.84, shield: 1.22, OD: 1.83, flex: "high", outdoor: false, power: "low", complexity: "high",
    atten: [[100, 46.0], [400, 95.1], [1000, 151.0], [3000, 275.0]],
    cons: { conductor: "7-strand silver-plated CCS, 0.10mm", dielectric: "Solid PTFE, εr 2.10", shield: "Silver-plated copper braid", jacket: "Brown FEP fluoropolymer" },
    proc: ["Silver-plate CCS strands", "Bunch 7 strands with tight concentricity", "Paste-extrude PTFE, sinter at 370°C", "Silver-plated Cu braid for low RF loss", "FEP jacket at 320°C for high-temp operation"],
    apps: "Miniature high-temp, aerospace, instrument wiring", makers: "Harbour, Micro-Coax" },
  rg213: { name: "RG-213/U", cat: "rg-50", alias: "M17/163, Belden 8267",
    z: 50, vp: 66, cap: 101, mass: 150, fMax: 1.0, vMax: 5000,
    d: 2.26, D: 7.24, shield: 8.23, OD: 10.29, flex: "low", outdoor: true, power: "high", complexity: "medium",
    atten: [[30, 2.5], [100, 4.6], [450, 10.5], [1000, 16.1]],
    cons: { conductor: "7-strand bare copper, 0.75mm", dielectric: "Solid PE, εr 2.30", shield: "Bare copper braid, 97% coverage", jacket: "Non-contaminating PVC, 1.03mm" },
    proc: ["Strand 7 bare Cu wires in concentric lay", "PE extrusion to 7.24mm OD", "High-coverage Cu braid 97%", "Non-contaminating PVC jacket", "Impulse voltage test 10kV"],
    apps: "High-power HF/VHF, amateur radio, marine", makers: "Belden, Times, CommScope" },
  rg214: { name: "RG-214/U", cat: "rg-50", alias: "M17/75, Belden 8268",
    z: 50, vp: 66, cap: 101, mass: 185, fMax: 1.0, vMax: 5000,
    d: 2.26, D: 7.24, shield: 9.14, OD: 10.80, flex: "low", outdoor: true, power: "high", complexity: "medium",
    atten: [[30, 2.5], [100, 4.6], [450, 10.5], [1000, 16.1]],
    cons: { conductor: "7-strand silver-plated copper, 0.75mm", dielectric: "Solid PE", shield: "Double silver-plated copper braid", jacket: "Non-contaminating PVC" },
    proc: ["Silver-plated Cu stranding", "PE dielectric extrusion", "First SPC braid 95%", "Second SPC braid opposite direction", "PVC jacket — >100dB shielding"],
    apps: "EMI-sensitive interconnect, precision Tx/Rx", makers: "Belden, Times" },
  rg223: { name: "RG-223/U", cat: "rg-50", alias: "M17/84",
    z: 50, vp: 66, cap: 101, mass: 70, fMax: 3.0, vMax: 1900,
    d: 0.89, D: 2.95, shield: 4.00, OD: 5.38, flex: "medium", outdoor: false, power: "medium", complexity: "medium",
    atten: [[100, 15.1], [400, 31.5], [1000, 52.5], [3000, 101.7]],
    cons: { conductor: "Solid silver-plated copper, 0.89mm", dielectric: "Solid PE", shield: "Double silver-plated copper braid", jacket: "Black PVC" },
    proc: ["SPC solid Cu conductor", "PE extrusion to 2.95mm", "First SPC braid 95%", "Second SPC braid", "PVC jacket — EMI leak <20dB vs single"],
    apps: "Precision measurement, EMI-sensitive instrumentation", makers: "Belden, Harbour" },
  rg316: { name: "RG-316/U", cat: "rg-50", alias: "M17/113",
    z: 50, vp: 69, cap: 96, mass: 15, fMax: 3.0, vMax: 900,
    d: 0.51, D: 1.52, shield: 1.94, OD: 2.49, flex: "high", outdoor: false, power: "low", complexity: "high",
    atten: [[100, 26.2], [400, 55.8], [1000, 90.5], [3000, 170.6]],
    cons: { conductor: "7-strand silver-plated CCS", dielectric: "Solid PTFE, εr 2.10", shield: "Silver-plated copper braid", jacket: "Brown FEP" },
    proc: ["SPC-CCS strand prep", "PTFE paste extrusion, sinter 370°C+", "SPC braid 90% coverage", "FEP jacket 320°C+", "VSWR 3GHz, thermal cycling"],
    apps: "High-temp assemblies, miniature RF, avionics", makers: "Harbour, Micro-Coax, Carlisle" },
  rg400: { name: "RG-400/U", cat: "rg-50", alias: "M17/128",
    z: 50, vp: 70, cap: 96, mass: 60, fMax: 12.4, vMax: 1900,
    d: 0.94, D: 2.95, shield: 3.56, OD: 4.95, flex: "medium", outdoor: false, power: "medium", complexity: "high",
    atten: [[400, 21.3], [1000, 34.5], [3000, 63.0], [10000, 124.7]],
    cons: { conductor: "19-strand silver-plated copper", dielectric: "Solid PTFE", shield: "Double silver-plated copper braid", jacket: "Tan FEP" },
    proc: ["Silver-plate 19 Cu strands", "Paste-extrude and sinter PTFE", "Double SPC braid", "FEP jacket -65°C to +200°C", "VSWR <1.3 to 12.4 GHz"],
    apps: "Microwave test, military, high-temp double-shielded", makers: "Harbour, Times, Micro-Coax" },
  rg8x: { name: "RG-8X (Mini-8)", cat: "rg-50", alias: "Belden 9258",
    z: 50, vp: 82, cap: 78, mass: 50, fMax: 1.0, vMax: 600,
    d: 1.02, D: 2.95, shield: 3.56, OD: 6.10, flex: "medium", outdoor: true, power: "medium", complexity: "low",
    atten: [[30, 3.3], [100, 6.2], [450, 14.1], [900, 21.0], [1000, 22.3]],
    cons: { conductor: "19-strand bare Cu, 0.25mm", dielectric: "Foam PE", shield: "Single tinned Cu braid", jacket: "Non-contaminating PVC" },
    proc: ["Stranded Cu for flexibility", "Foam PE at 2.95mm", "Single tinned Cu braid 95%", "PVC jacket", "Compromise between RG-58 and RG-213"],
    apps: "Amateur radio, CB, medium-length general RF", makers: "Belden, Times" },
  rg142: { name: "RG-142B/U", cat: "rg-50", alias: "M17/60",
    z: 50, vp: 70, cap: 96, mass: 45, fMax: 12.4, vMax: 1900,
    d: 0.94, D: 2.95, shield: 3.30, OD: 4.95, flex: "medium", outdoor: false, power: "medium", complexity: "high",
    atten: [[400, 21.7], [1000, 34.8], [3000, 63.6], [10000, 125.0]],
    cons: { conductor: "19-strand SPC, 0.18mm", dielectric: "Solid PTFE", shield: "Double SPC braid", jacket: "Tan FEP" },
    proc: ["Silver-plate 19 Cu strands", "PTFE paste-extrude+sinter", "First SPC braid 95%", "Second SPC braid", "FEP jacket, -65°C to +200°C"],
    apps: "Military high-temp microwave, aerospace", makers: "Harbour, Times, Micro-Coax" },
  rg59: { name: "RG-59/U", cat: "rg-75", alias: "M17/29, Belden 8241",
    z: 75, vp: 66, cap: 68, mass: 42, fMax: 1.0, vMax: 2300,
    d: 0.58, D: 3.71, shield: 4.35, OD: 6.15, flex: "medium", outdoor: false, power: "medium", complexity: "low",
    atten: [[50, 7.5], [100, 11.2], [400, 22.6], [900, 35.1]],
    cons: { conductor: "Solid CCS or Cu, 0.58mm", dielectric: "Solid PE", shield: "Bare/tinned Cu braid 95%", jacket: "Black PVC, 1.22mm" },
    proc: ["CCS or pure Cu prep", "PE extrusion at 3.71mm", "Single Cu braid 95%", "Thick PVC jacket", "Capacitance test 68 pF/m ±2%"],
    apps: "CCTV, composite video, analog baseband", makers: "Belden, CommScope, Gepco" },
  rg6: { name: "RG-6/U", cat: "rg-75", alias: "Series 6, F6",
    z: 75, vp: 82, cap: 55, mass: 42, fMax: 3.0, vMax: 2700,
    d: 1.02, D: 4.57, shield: 5.38, OD: 6.86, flex: "medium", outdoor: true, power: "medium", complexity: "medium",
    atten: [[100, 6.0], [400, 13.2], [900, 19.7], [1500, 26.2], [3000, 38.4]],
    cons: { conductor: "Solid CCS or Cu, 1.02mm", dielectric: "Foam PE, εr ~1.5", shield: "Al foil + tinned Cu braid", jacket: "Black UV-resistant PE" },
    proc: ["Precise CCS or Cu draw", "Gas-foam PE at ~0.30 g/cc", "Al-polyester foil tape 100%", "Tinned Cu braid 60-80%", "PE jacket for outdoor"],
    apps: "Satellite TV, cable modem, broadband, CATV", makers: "Belden, CommScope, PPC" },
  rg6quad: { name: "RG-6 Quad Shield", cat: "rg-75", alias: "RG-6/U QS",
    z: 75, vp: 82, cap: 55, mass: 56, fMax: 3.0, vMax: 2700,
    d: 1.02, D: 4.57, shield: 5.97, OD: 7.75, flex: "medium", outdoor: true, power: "medium", complexity: "medium",
    atten: [[100, 6.0], [400, 13.2], [900, 19.7], [1500, 26.2], [3000, 38.4]],
    cons: { conductor: "Solid CCS, 1.02mm", dielectric: "Foam PE", shield: "Foil+braid+foil+braid (4 layers)", jacket: "Black UV PE" },
    proc: ["RG-6 inner construction", "Inner Al-Mylar foil 100%", "First tinned Cu braid 60%", "Second Al-Mylar foil", "Second Cu braid 40%, >100dB EMI"],
    apps: "High-interference installs, commercial CATV", makers: "PerfectVision, PPC, CommScope" },
  rg11: { name: "RG-11/U", cat: "rg-75", alias: "Long-run 75Ω",
    z: 75, vp: 78, cap: 54, mass: 120, fMax: 3.0, vMax: 4000,
    d: 1.63, D: 7.24, shield: 8.13, OD: 10.30, flex: "medium", outdoor: true, power: "high", complexity: "medium",
    atten: [[100, 4.6], [400, 9.8], [900, 14.8], [1500, 19.7]],
    cons: { conductor: "Solid CCS or Cu, 1.63mm", dielectric: "Foam or semi-foam PE", shield: "Duofoil + tinned Cu braid", jacket: "Black UV-stable PE" },
    proc: ["Large conductor for long-run loss", "Foam PE at 7.24mm", "Foil-braid composite shield", "PE jacket for burial", "For runs >150m"],
    apps: "Long CATV, trunk distribution, satellite long", makers: "CommScope, Times Fiber, Belden" },
  lmr100: { name: "LMR-100", cat: "lmr", alias: "LMR-100A",
    z: 50, vp: 66, cap: 101, mass: 13, fMax: 5.8, vMax: 300,
    d: 0.46, D: 1.52, shield: 1.85, OD: 2.79, flex: "high", outdoor: true, power: "low", complexity: "medium",
    atten: [[100, 26.2], [450, 55.8], [900, 82.0], [2400, 137.8], [5800, 226.4]],
    cons: { conductor: "Solid bare Cu, 0.46mm", dielectric: "Foam PE with PE skin", shield: "Al-polymer foil + tinned Cu braid", jacket: "Flexible black PE" },
    proc: ["Cu wire to 0.46mm ±1%", "Foam PE with PE skin co-extrude", "Longitudinal Al-polymer tape", "Tinned Cu braid", "Foam density tuned for VP"],
    apps: "GPS antennas, Wi-Fi pigtails, embedded wireless", makers: "Times Microwave, Radiall" },
  lmr195: { name: "LMR-195", cat: "lmr", alias: "LMR-195A",
    z: 50, vp: 80, cap: 82, mass: 23, fMax: 5.8, vMax: 600,
    d: 0.94, D: 2.79, shield: 3.40, OD: 4.95, flex: "high", outdoor: true, power: "low", complexity: "medium",
    atten: [[100, 16.7], [450, 35.8], [900, 51.2], [2400, 85.3], [5800, 137.8]],
    cons: { conductor: "Solid bare Cu, 0.94mm", dielectric: "Foam PE ~30% density", shield: "Al-polymer foil + tinned Cu braid", jacket: "Black UV PE" },
    proc: ["Solid Cu for low DC R", "Gas-foam PE for VP 80%", "Bonded foil-braid composite", "UV PE jacket", "TDR 50Ω ±2%"],
    apps: "WLAN jumpers, mobile antenna, GPS timing", makers: "Times Microwave, Radiall" },
  lmr240: { name: "LMR-240", cat: "lmr", alias: "LMR-240A, -UF, -DB",
    z: 50, vp: 84, cap: 78, mass: 40, fMax: 5.8, vMax: 1400,
    d: 1.42, D: 3.81, shield: 4.50, OD: 6.10, flex: "high", outdoor: true, power: "medium", complexity: "medium",
    atten: [[100, 12.8], [450, 27.9], [900, 39.4], [2400, 65.3], [5800, 105.0]],
    cons: { conductor: "Solid bare Cu, 1.42mm", dielectric: "Gas-injection foam PE", shield: "Al-polymer foil 100% + tinned Cu braid 85%", jacket: "UV-stabilized PE, 1.15mm" },
    proc: ["Cu wire ±0.01mm", "Gas-foam PE, VP 84%", "Bonded Al-polymer 100%", "Tinned Cu braid 85%", "Multi-f sweep test"],
    apps: "Cellular jumpers, Wi-Fi outdoor, GPS timing", makers: "Times, Radiall, CommScope" },
  lmr400: { name: "LMR-400", cat: "lmr", alias: "LMR-400-UF/FR/DB, Belden 9913F7",
    z: 50, vp: 85, cap: 78, mass: 68, fMax: 5.8, vMax: 2500,
    d: 2.74, D: 7.24, shield: 8.13, OD: 10.29, flex: "medium", outdoor: true, power: "high", complexity: "medium",
    atten: [[30, 2.2], [150, 5.1], [450, 8.9], [900, 12.8], [1800, 18.5], [2400, 21.6], [5800, 35.1]],
    cons: { conductor: "Solid bare Cu, 2.74mm", dielectric: "Foam PE with PE skin, gas-foamed", shield: "Al foil 100% + tinned Cu braid 92%", jacket: "Black UV PE, 1.45mm" },
    proc: ["Cu to 2.74mm ±0.01mm", "Co-extrude foam PE + skin, ~0.30 g/cc", "Al-polymer foil 100%", "Tinned Cu braid 92%", "Sweep to 6GHz VSWR <1.15"],
    apps: "Cellular base station, outdoor Wi-Fi, 5G, GPS", makers: "Times, Belden, CommScope" },
  lmr600: { name: "LMR-600", cat: "lmr", alias: "LMR-600-UF/FR",
    z: 50, vp: 87, cap: 76, mass: 130, fMax: 5.8, vMax: 4000,
    d: 4.47, D: 11.4, shield: 12.3, OD: 14.99, flex: "low", outdoor: true, power: "high", complexity: "medium",
    atten: [[30, 1.5], [150, 3.5], [450, 6.2], [900, 8.9], [1800, 12.8], [2400, 14.8], [5800, 24.0]],
    cons: { conductor: "Solid bare Cu, 4.47mm", dielectric: "Low-density foam PE", shield: "Al foil + tinned Cu braid", jacket: "Black UV PE, 1.8mm" },
    proc: ["Large Cu for lowest R", "Foam PE 11.4mm, VP 87%", "Foil-braid shield", "Thick PE jacket", "<24 dB/100m at 5.8 GHz"],
    apps: "Long outdoor cellular, broadcast, 5G backhaul", makers: "Times, Andrew, CommScope" },
  lmr900: { name: "LMR-900", cat: "lmr", alias: "",
    z: 50, vp: 87, cap: 76, mass: 260, fMax: 3.0, vMax: 4500,
    d: 6.65, D: 17.3, shield: 18.4, OD: 22.1, flex: "low", outdoor: true, power: "high", complexity: "high",
    atten: [[30, 1.0], [150, 2.4], [450, 4.3], [900, 6.2], [1800, 9.0], [2400, 10.5]],
    cons: { conductor: "Solid bare Cu, 6.65mm (heavy)", dielectric: "Foam PE, gas-injection", shield: "Al foil + tinned Cu braid", jacket: "Black UV PE, 2.4mm" },
    proc: ["Large Cu core", "Foam PE shrink control", "Reinforced shield/jacket", "Large bend radius"],
    apps: "Very long cellular, broadcast, tactical", makers: "Times Microwave" },
  fsj1: { name: "FSJ1-50A", cat: "heliax", alias: "SuperFlex 1/4\"",
    z: 50, vp: 84, cap: 76, mass: 60, fMax: 20.4, vMax: 2200,
    d: 1.80, D: 4.83, shield: 5.71, OD: 6.40, flex: "medium", outdoor: true, power: "high", complexity: "high",
    atten: [[150, 5.2], [450, 9.3], [900, 13.5], [1800, 19.5], [2400, 22.7], [5800, 37.4]],
    cons: { conductor: "Solid copper, 1.80mm", dielectric: "Foam PE spacer", shield: "Corrugated solid copper tube", jacket: "Black PE, FR options" },
    proc: ["Solid Cu inner", "Foam PE dielectric extrusion", "Cu tape seam-weld longitudinal", "Corrugate via rotary rollers", "PE jacket, >120dB shielding"],
    apps: "Cellular jumpers short, indoor DAS", makers: "Andrew/CommScope, RFS" },
  ldf4: { name: "LDF4-50A", cat: "heliax", alias: "1/2\" Heliax",
    z: 50, vp: 88, cap: 76, mass: 215, fMax: 8.8, vMax: 4500,
    d: 4.83, D: 12.7, shield: 13.8, OD: 16.0, flex: "low", outdoor: true, power: "high", complexity: "high",
    atten: [[150, 2.6], [450, 4.7], [900, 6.8], [1800, 10.0], [2400, 11.7], [5800, 19.8]],
    cons: { conductor: "Solid Cu inner, 4.83mm", dielectric: "Foam PE, low density VP 88%", shield: "Corrugated solid Cu tube", jacket: "Black UV PE, 1.6mm" },
    proc: ["Solid Cu drawing+annealing", "Foam PE density for VP 88%", "Cu tape seam-weld continuous", "Corrugation without kinking", "PE jacket bonded"],
    apps: "Cellular backhaul, broadcast, long feeds", makers: "CommScope (Andrew), RFS" },
  ldf5: { name: "LDF5-50A", cat: "heliax", alias: "7/8\" Heliax",
    z: 50, vp: 89, cap: 75, mass: 510, fMax: 5.5, vMax: 7000,
    d: 9.14, D: 22.9, shield: 24.9, OD: 28.0, flex: "low", outdoor: true, power: "high", complexity: "high",
    atten: [[150, 1.4], [450, 2.6], [900, 3.7], [1800, 5.5], [2400, 6.5], [5500, 10.4]],
    cons: { conductor: "Solid Cu, 9.14mm", dielectric: "Foam PE, very low density", shield: "Corrugated solid Cu tube", jacket: "Black UV PE, 2.1mm" },
    proc: ["Large Cu specialized draw", "Foam PE at 22.9mm", "Seam-weld large Cu tape", "Bend radius ~25cm"],
    apps: "Tower feeds 100m+, high-power broadcast", makers: "CommScope, RFS" },
  ut086: { name: "UT-086 (RG-405)", cat: "semi", alias: "0.086\" semi-rigid",
    z: 50, vp: 70, cap: 96, mass: 10, fMax: 50.0, vMax: 2500,
    d: 0.51, D: 1.68, shield: 2.20, OD: 2.20, flex: "none", outdoor: false, power: "medium", complexity: "high",
    atten: [[1000, 56.4], [3000, 98.4], [10000, 180.5], [18000, 242.8], [50000, 430.5]],
    cons: { conductor: "Solid SPC-CCS, 0.51mm", dielectric: "Solid PTFE, εr 2.05", shield: "Solid tin-plated Cu or SS tube", jacket: "None" },
    proc: ["SPC-CCS inner conductor", "PTFE paste extrude or wrap+sinter", "Draw Cu/SS tube to fit", "Swage outer tube against dielectric", "Manual/tool bending, holds shape"],
    apps: "Internal chassis microwave, mmWave, cal", makers: "Micro-Coax, Carlisle, Harbour" },
  ut141: { name: "UT-141 (RG-402)", cat: "semi", alias: "0.141\" semi-rigid",
    z: 50, vp: 70, cap: 96, mass: 26, fMax: 40.0, vMax: 2500,
    d: 0.92, D: 2.99, shield: 3.58, OD: 3.58, flex: "none", outdoor: false, power: "medium", complexity: "high",
    atten: [[1000, 31.5], [3000, 55.8], [10000, 101.7], [18000, 137.8], [40000, 209.9]],
    cons: { conductor: "Solid SPC, 0.92mm", dielectric: "Solid PTFE", shield: "Solid Cu outer tube, 3.58mm", jacket: "Optional FEP" },
    proc: ["Silver-plate solid Cu", "PTFE paste-extrude+sinter 370°C+", "Cu tube precision drawn", "Swage mechanical bond", "Field-formable with bender"],
    apps: "Chassis microwave, VNA fixtures, aerospace", makers: "Micro-Coax, Carlisle, Harbour" },
  ut250: { name: "UT-250 (RG-401)", cat: "semi", alias: "0.250\" semi-rigid",
    z: 50, vp: 70, cap: 96, mass: 80, fMax: 18.0, vMax: 3000,
    d: 1.63, D: 5.33, shield: 6.35, OD: 6.35, flex: "none", outdoor: false, power: "high", complexity: "high",
    atten: [[1000, 16.5], [3000, 29.5], [10000, 54.0], [18000, 73.0]],
    cons: { conductor: "Solid SPC, 1.63mm", dielectric: "Solid PTFE, εr 2.05", shield: "Solid Cu outer tube, 6.35mm", jacket: "None or FEP" },
    proc: ["Large SPC inner", "PTFE dielectric", "Cu tube 6.35mm drawn+swaged", "Higher power than UT-141", "Fixed rigid routing"],
    apps: "High-power microwave, radar, fixed chassis", makers: "Micro-Coax, Carlisle" },
  belden1694a: { name: "Belden 1694A", cat: "video", alias: "Precision HD-SDI",
    z: 75, vp: 83, cap: 54, mass: 63, fMax: 3.0, vMax: 300,
    d: 1.02, D: 4.60, shield: 5.46, OD: 6.99, flex: "medium", outdoor: false, power: "low", complexity: "medium",
    atten: [[135, 4.6], [540, 9.5], [1485, 16.4], [2970, 23.6]],
    cons: { conductor: "Solid bare Cu, 18 AWG", dielectric: "Gas-injected foam HDPE", shield: "Duobond II foil 100% + tinned Cu braid 95%", jacket: "Matte black PVC, 0.76mm" },
    proc: ["Annealed solid Cu", "Gas-foam HDPE with tight VP", "Duobond II foil 100%", "Tinned Cu braid 95%", "Matte PVC, sweep 3GHz"],
    apps: "HD-SDI, 3G-SDI, 4K 12G-SDI broadcast", makers: "Belden, Canare, Mogami" },
  belden9913: { name: "Belden 9913", cat: "lmr", alias: "9913F7, like LMR-400",
    z: 50, vp: 84, cap: 78, mass: 67, fMax: 4.0, vMax: 2700,
    d: 2.74, D: 7.24, shield: 8.13, OD: 10.29, flex: "medium", outdoor: true, power: "high", complexity: "medium",
    atten: [[30, 2.5], [150, 5.6], [450, 9.8], [900, 14.1], [1800, 20.3], [2400, 23.6]],
    cons: { conductor: "Solid bare Cu, 10 AWG", dielectric: "Air-spaced PE / foam (F7)", shield: "Duofoil + tinned Cu braid", jacket: "Black UV-stable PE" },
    proc: ["10 AWG solid Cu", "Air-spaced or foam PE dielectric", "Duofoil 100% bonded", "Tinned Cu braid", "9913F7 truly flexible"],
    apps: "Amateur radio, cellular jumpers, Wi-Fi outdoor", makers: "Belden, Wireman" },
  gore_pf: { name: "Gore PhaseFlex", cat: "phase", alias: "Phase-stable test",
    z: 50, vp: 77, cap: 86, mass: 55, fMax: 40.0, vMax: 500,
    d: 1.00, D: 3.30, shield: 4.10, OD: 5.30, flex: "high", outdoor: false, power: "low", complexity: "high",
    atten: [[1000, 24.0], [10000, 85.3], [20000, 131.2], [40000, 203.4]],
    cons: { conductor: "Stranded silver-plated Cu", dielectric: "ePTFE (expanded PTFE)", shield: "SPC braid + optional spiral", jacket: "FEP, PUR, or custom" },
    proc: ["SPC stranded conductor", "ePTFE formed by PTFE stretching", "Phase <3 ppm/°C", "SPC + spiral for 100k flex cycles", "Phase <5°/cycle at 18 GHz"],
    apps: "VNA test, ATE, phase-matched arrays", makers: "W.L. Gore" },
  sucoflex104: { name: "SUCOFLEX 104", cat: "phase", alias: "H+S precision",
    z: 50, vp: 77, cap: 85, mass: 75, fMax: 46.0, vMax: 500,
    d: 1.10, D: 3.70, shield: 4.60, OD: 5.60, flex: "high", outdoor: false, power: "low", complexity: "high",
    atten: [[1000, 22.0], [10000, 76.0], [20000, 115.0], [40000, 175.0], [46000, 195.0]],
    cons: { conductor: "Stranded SPC", dielectric: "PTFE tape wrap", shield: "Double SPC braid", jacket: "FEP" },
    proc: ["SPC stranded, low skin loss", "PTFE helical tape + sintering", "Double SPC braid >90dB", "FEP jacket -55 to +125°C", "Phase pairs <3ps delay"],
    apps: "Precision VNA, 5G/mmWave, phased arrays", makers: "Huber+Suhner" },
};

const CABLE_IDS = Object.keys(CABLES);

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
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch (e) { return { error: e.message }; }
}

const SYSTEM_PROMPT = `You are a senior RF cable engineer with 15+ years of experience in both design and field troubleshooting. You have access to a 30-cable production database and 12 computational tools.

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
- For system-level questions (Tx→RX paths), use calculate_link_budget.
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
  const [tab, setTab] = useState("ask");
  const [activeCable, setActiveCable] = useState(null);
  const [queuedPrompt, setQueuedPrompt] = useState(null);

  const [units, setUnits] = useState("both");
  const [showTools, setShowTools] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const settingsCtx = { units, setUnits, showTools, setShowTools };

  const loadCableIntoDesign = (id) => { setActiveCable(id); setTab("design"); };
  const askAboutCable = (id) => {
    const c = CABLES[id];
    setQueuedPrompt(`Analyze ${c.name}: construction highlights, ideal applications, and closest alternatives to consider.`);
    setTab("ask");
  };
  const openInLibrary = (id) => { setActiveCable(id); setTab("library"); };

  return (
    <SettingsContext.Provider value={settingsCtx}>
      <div style={S.root}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap');
          @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
          @keyframes slideIn { from{opacity:0; transform:translateY(6px)} to{opacity:1; transform:translateY(0)} }
          @keyframes slideDown { from{opacity:0; transform:translateY(-10px); max-height:0} to{opacity:1; transform:translateY(0); max-height:200px} }
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

        <header style={S.header}>
          <div>
            <div style={S.eyebrow}>RF Engineering Suite</div>
            <h1 style={S.title}>Coaxial Cable Workbench</h1>
          </div>
          <div style={S.headerRight}>
            <nav style={S.nav}>
              {[["ask", "Ask"], ["design", "Design"], ["library", "Library"]].map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} style={{ ...S.navBtn, ...(tab === k ? S.navBtnActive : {}) }}>{label}</button>
              ))}
            </nav>
            <button onClick={() => setSettingsOpen(!settingsOpen)} style={{ ...S.settingsBtn, ...(settingsOpen ? S.settingsBtnActive : {}) }} title="Settings">
              <SettingsIcon />
            </button>
          </div>
        </header>

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
            <div style={S.settingsHint}>Hidden tool calls keep the chat clean for non-technical viewers. Agent still runs tools — you just don't see the internals.</div>
          </div>
        )}

        {activeCable && (
          <div style={S.activeCableBar}>
            <span style={S.activeLabel}>Active cable</span>
            <span style={S.activeName}>{CABLES[activeCable].name}</span>
            <span style={{ ...S.activeCat, color: CATEGORIES[CABLES[activeCable].cat].color }}>{CATEGORIES[CABLES[activeCable].cat].label}</span>
            <button onClick={() => setActiveCable(null)} style={S.clearBtn}>Clear ×</button>
          </div>
        )}

        <main style={S.main}>
          {tab === "ask" && <AskView queuedPrompt={queuedPrompt} clearQueued={() => setQueuedPrompt(null)} openInLibrary={openInLibrary} loadIntoDesign={loadCableIntoDesign} />}
          {tab === "design" && <DesignView activeCable={activeCable} clearCable={() => setActiveCable(null)} openLibrary={() => setTab("library")} />}
          {tab === "library" && <LibraryView activeCable={activeCable} loadIntoDesign={loadCableIntoDesign} askAboutCable={askAboutCable} setActiveCable={setActiveCable} />}
        </main>
      </div>
    </SettingsContext.Provider>
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
function AskView({ queuedPrompt, clearQueued, openInLibrary, loadIntoDesign }) {
  const { showTools } = useContext(SettingsContext);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, loading]);
  useEffect(() => { if (queuedPrompt) { sendMessage(queuedPrompt); clearQueued(); } /* eslint-disable-next-line */ }, [queuedPrompt]);

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    setError(null); setInput("");
    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);
    try {
      let api = newMessages.map(m => ({ role: m.role, content: m.content }));
      for (let i = 0; i < 10; i++) {
        const res = await fetch("/api/claude", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, system: SYSTEM_PROMPT, messages: api, tools: TOOLS }),
        });
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        api.push({ role: "assistant", content: data.content });
        setMessages(prev => [...prev.filter(m => m.role !== "assistant_pending"), { role: "assistant", content: data.content }]);
        if (data.stop_reason !== "tool_use") break;
        const results = data.content.filter(b => b.type === "tool_use").map(b => ({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(executeTool(b.name, b.input)) }));
        api.push({ role: "user", content: results });
      }
    } catch (e) { setError(e.message); }
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
      <div style={S.viewIntro}>
        <strong style={S.viewIntroStrong}>Ask mode.</strong> Senior RF engineer agent with 12 tools for lookup, calculation, and validation.
        Replies are grounded in the database — all numerical claims come from tool calls, not memory.
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
        {messages.map((m, i) => <ChatMessage key={i} message={m} showTools={showTools} openInLibrary={openInLibrary} loadIntoDesign={loadIntoDesign} />)}
        {loading && (
          <div style={S.loadingMsg}>
            <span style={{ fontSize: 11, color: "#a89d8e", letterSpacing: "0.1em" }}>Thinking</span>
            <span className="dots" style={{ color: "#d97706", marginLeft: 8, fontSize: 20, letterSpacing: 3 }}><span>·</span><span>·</span><span>·</span></span>
          </div>
        )}
        {error && <div style={S.errorBox}><div style={{ color: "#fca5a5", fontSize: 11 }}>Error</div><div style={{ fontSize: 12, marginTop: 3 }}>{error}</div></div>}
      </div>

      <div style={S.inputBar}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
          placeholder="Ask about cable selection, design, link budgets, or troubleshooting..."
          style={S.textarea} rows={2} disabled={loading} />
        <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()} style={S.sendBtn}>Send ↵</button>
      </div>
    </div>
  );
}

function ChatMessage({ message: m, showTools, openInLibrary, loadIntoDesign }) {
  if (m.role === "user") return <div className="msg-anim" style={S.userMsg}><div style={S.userBubble}>{m.content}</div></div>;
  if (typeof m.content === "string") return <div className="msg-anim" style={S.assistantMsg}><div style={S.assistantText}>{m.content}</div></div>;

  return (
    <div className="msg-anim" style={S.assistantMsg}>
      {m.content.map((block, i) => {
        if (block.type === "text") {
          const mentioned = CABLE_IDS.filter(id => block.text.toLowerCase().includes(CABLES[id].name.toLowerCase()) || block.text.toLowerCase().includes(`'${id}'`));
          const uniqueMentioned = [...new Set(mentioned)];
          return (
            <div key={i}>
              <div style={S.assistantText}>{block.text}</div>
              {uniqueMentioned.length > 0 && uniqueMentioned.length <= 5 && (
                <div style={S.quickChipsRow}>
                  {uniqueMentioned.map(id => (
                    <div key={id} style={S.quickChipGroup}>
                      <span style={S.quickChipName}>{CABLES[id].name}:</span>
                      <button onClick={() => openInLibrary(id)} style={S.quickChip}>View</button>
                      <button onClick={() => loadIntoDesign(id)} style={S.quickChip}>Design</button>
                    </div>
                  ))}
                </div>
              )}
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
function LibraryView({ activeCable, loadIntoDesign, askAboutCable, setActiveCable }) {
  const [search, setSearch] = useState("");
  const [filterZ, setFilterZ] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [filterFreq, setFilterFreq] = useState(0);
  const [sortBy, setSortBy] = useState("name");
  const [expanded, setExpanded] = useState(activeCable);

  const filtered = useMemo(() => {
    let list = Object.entries(CABLES).filter(([id, c]) => {
      if (filterZ !== "all" && c.z !== Number(filterZ)) return false;
      if (filterCat !== "all" && c.cat !== filterCat) return false;
      if (c.fMax < filterFreq) return false;
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
  }, [search, filterZ, filterCat, filterFreq, sortBy]);

  return (
    <div style={S.viewInner}>
      <div style={S.viewIntro}>
        <strong style={S.viewIntroStrong}>Library mode.</strong> {Object.keys(CABLES).length} reference cables with construction, manufacturing, and trade-off details.
      </div>

      <div style={S.filterGrid}>
        <div style={{ gridColumn: "span 2" }}>
          <label style={S.filterLabel}>Search</label>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, alias, application..." style={S.searchInput} />
        </div>
        <div><label style={S.filterLabel}>Impedance</label><select value={filterZ} onChange={(e) => setFilterZ(e.target.value)} style={S.select}><option value="all">All</option><option value="50">50 Ω</option><option value="75">75 Ω</option></select></div>
        <div><label style={S.filterLabel}>Min freq: {filterFreq} GHz</label><input type="range" min={0} max={50} step={0.5} value={filterFreq} onChange={(e) => setFilterFreq(Number(e.target.value))} style={{ width: "100%" }} /></div>
        <div><label style={S.filterLabel}>Sort</label><select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={S.select}><option value="name">Name</option><option value="z">Impedance</option><option value="od">Diameter</option><option value="freq">Max freq</option><option value="loss">Loss @ 900 MHz</option></select></div>
      </div>

      <div style={S.catChips}>
        <button onClick={() => setFilterCat("all")} className="hover-pill" style={{ ...S.catChip, ...(filterCat === "all" ? S.catChipActive : {}) }}>All</button>
        {Object.entries(CATEGORIES).map(([k, v]) => (
          <button key={k} onClick={() => setFilterCat(k)} className="hover-pill" style={{ ...S.catChip, ...(filterCat === k ? { ...S.catChipActive, borderColor: v.color, color: v.color } : {}), borderLeftColor: v.color, borderLeftWidth: 3 }}>{v.label}</button>
        ))}
      </div>

      <div style={S.cableList}>
        {filtered.map(([id, c]) => (
          <CableCard key={id} id={id} cable={c} expanded={expanded === id}
            onToggle={() => { setExpanded(expanded === id ? null : id); setActiveCable(id); }}
            onDesign={() => loadIntoDesign(id)} onAsk={() => askAboutCable(id)} />
        ))}
        {filtered.length === 0 && <div style={S.emptyState}>No cables match filters. Try relaxing criteria.</div>}
      </div>
    </div>
  );
}

function CableCard({ id, cable: c, expanded, onToggle, onDesign, onAsk }) {
  const { units } = useContext(SettingsContext);
  const cat = CATEGORIES[c.cat];
  const cxColor = { low: "#34d399", medium: "#fbbf24", high: "#ef4444" }[c.complexity];
  const cxLabel = { low: "Simple", medium: "Moderate", high: "Complex" }[c.complexity];

  return (
    <div className="hover-card" style={{ ...S.cableCard, ...(expanded ? S.cableCardExpanded : {}) }}>
      <div onClick={onToggle} style={S.cableHead}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
          <MiniCrossSection c={c} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
              <span style={S.cableName}>{c.name}</span>
              <span style={{ ...S.catBadge, color: cat.color, borderColor: cat.color }}>{cat.label}</span>
              <span style={{ ...S.cxBadge, background: `${cxColor}22`, color: cxColor, borderColor: cxColor }}>{cxLabel}</span>
            </div>
            {c.alias && <div style={S.cableAlias}>{c.alias}</div>}
            <div style={S.cableApps}>{c.apps}</div>
          </div>
        </div>
        <div style={S.quickStats}>
          <QS label="Z" v={`${c.z}Ω`} />
          <QS label="OD" v={fmtLenCompact(c.OD, units, 2)} />
          <QS label="VP" v={`${c.vp}%`} />
          <QS label="f" v={`${c.fMax}G`} />
          <span style={S.expandIcon}>{expanded ? "−" : "+"}</span>
        </div>
      </div>

      {expanded && (
        <div style={S.cableDetails}>
          <div style={S.actionRow}>
            <button onClick={onDesign} style={S.actionBtn}>→ Load into Designer</button>
            <button onClick={onAsk} style={{ ...S.actionBtn, ...S.actionBtnSecondary }}>Ask Agent about this</button>
          </div>
          <div style={{ padding: "14px 0 18px", borderBottom: "1px solid rgba(217,119,6,0.12)", marginBottom: 14 }}>
            <div style={{ textAlign: "center", fontSize: 10, letterSpacing: 2, color: "#a8a29e", marginBottom: 6, textTransform: "uppercase" }}>Cross-Section · Scaled to OD</div>
            <CrossSection d={c.d} D={c.D} shield={c.shield} jacket={c.OD} units={units} cons={c.cons} />
          </div>
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
                  <thead><tr><th style={S.attenTh}>Freq</th><th style={S.attenTh}>{units === "imperial" ? "dB/100ft" : units === "both" ? "dB/100m (dB/100ft)" : "dB/100m"}</th></tr></thead>
                  <tbody>
                    {c.atten.map(([f, a], i) => (
                      <tr key={i}>
                        <td style={S.attenTd}>{f < 1000 ? `${f} MHz` : `${(f / 1000).toFixed(1)} GHz`}</td>
                        <td style={{ ...S.attenTd, color: "#fbbf24" }}>{units === "imperial" ? (a * 0.3048).toFixed(1) : units === "both" ? `${a.toFixed(1)} (${(a * 0.3048).toFixed(1)})` : a.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DS>
            </div>
            <div>
              <DS title="Materials & Layers">
                <Layer n="1" name="Inner Conductor" color="#fbbf24" desc={c.cons.conductor} />
                <Layer n="2" name="Dielectric" color="#fde68a" desc={c.cons.dielectric} />
                <Layer n="3" name="Shield" color="#9ca3af" desc={c.cons.shield} />
                <Layer n="4" name="Jacket" color="#57534e" desc={c.cons.jacket} />
              </DS>
              <DS title="Manufacturing Process">
                {c.proc.map((s, i) => (
                  <div key={i} style={S.procStep}>
                    <div style={S.procNum}>{i + 1}</div>
                    <StepIcon text={s} />
                    <div style={S.procText}>{s}</div>
                  </div>
                ))}
              </DS>
              <DS title="Suppliers"><DR label="Typical makers" v={c.makers} /></DS>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════
function shortMat(s) {
  if (!s) return null;
  const before = s.split(",")[0].trim();
  return before.replace(/^(\d+[- ]?strand(ed)?|solid|bare|single|double|triple|quad)\s+/i, "").replace(/\s+(each|wire)$/i, "");
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

function CrossSection({ d, D, shield, jacket, units, cons }) {
  const size = 300, cx = size / 2, cy = size / 2, maxR = size * 0.26;
  const scale = maxR / (jacket / 2);
  const r_in = (d / 2) * scale, r_dx = (D / 2) * scale, r_sh = (shield / 2) * scale, r_jk = (jacket / 2) * scale;

  const compact = (mm) => {
    const inch = (mm / 25.4).toFixed(3);
    if (units === "imperial") return `${inch}"`;
    if (units === "both") return `${fmt(mm, 2)}mm · ${inch}"`;
    return `${fmt(mm, 2)}mm`;
  };

  const strandMatch = cons?.conductor?.match(/(\d+)[- ]?strand/i);
  const strands = strandMatch ? parseInt(strandMatch[1]) : 1;
  const strandData = strands > 1 ? getStrands(strands, r_in) : null;

  const callouts = [
    { angle: -140, r: r_in, name: "Conductor", value: compact(d), mat: shortMat(cons?.conductor), color: "#fbbf24" },
    { angle: -40,  r: r_dx, name: "Dielectric", value: compact(D), mat: shortMat(cons?.dielectric), color: "#fde68a" },
    { angle:  40,  r: r_sh, name: "Shield",    value: compact(shield), mat: shortMat(cons?.shield), color: "#9ca3af" },
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
        <radialGradient id="jk-grad" cx="50%" cy="50%"><stop offset="70%" stopColor="#0a0705" /><stop offset="100%" stopColor="#1f1611" /></radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r_jk} fill="url(#jk-grad)" stroke="#2a1f15" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={r_sh} fill="url(#braid-p)" stroke="#6b7280" strokeWidth="0.4" />
      <circle cx={cx} cy={cy} r={r_dx} fill="rgba(255,250,235,0.14)" stroke="rgba(217,119,6,0.4)" strokeWidth="0.5" />

      {strandData ? (
        <g transform={`translate(${cx}, ${cy})`}>
          <g>
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="40s" repeatCount="indefinite" />
            {strandData.positions.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={strandData.strandR * 0.92} fill="url(#cu-grad)" stroke="#451a03" strokeWidth="0.3" />
            ))}
          </g>
        </g>
      ) : (
        <circle cx={cx} cy={cy} r={r_in} fill="url(#cu-grad)" />
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
const QS = ({ label, v }) => (<div style={{ textAlign: "right", minWidth: 40 }}><div style={{ fontSize: 8, color: "#78716c", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div><div style={{ fontSize: 11, color: "#fbbf24" }}>{v}</div></div>);
const DS = ({ title, children }) => (<div style={{ marginBottom: 18 }}><div style={S.dsTitle}>{title}</div>{children}</div>);
const DR = ({ label, v }) => (<div style={S.dr}><span style={{ color: "#a89d8e" }}>{label}</span><span style={{ color: "#fbbf24", textAlign: "right" }}>{v}</span></div>);
const Layer = ({ n, name, color, desc }) => (<div style={S.layer}><div style={{ ...S.layerDot, background: color }}>{n}</div><div style={{ flex: 1 }}><div style={S.layerName}>{name}</div><div style={S.layerDesc}>{desc}</div></div></div>);

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

  filterGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 14, padding: 14, background: "rgba(10,7,5,0.4)", border: "1px solid #2a1f15", borderRadius: 3 },
  filterLabel: { fontSize: 9, letterSpacing: "0.15em", color: "#78716c", textTransform: "uppercase", marginBottom: 4, display: "block" },
  searchInput: { width: "100%", padding: "8px 11px", background: "#0a0705", border: "1px solid #3a2e1f", borderRadius: 2, color: "#fbbf24", fontFamily: "inherit", fontSize: 12, boxSizing: "border-box", outline: "none" },
  catChips: { display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 },
  catChip: { padding: "6px 12px", background: "transparent", border: "1px solid #3a2e1f", borderRadius: 2, color: "#a89d8e", fontFamily: "inherit", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" },
  catChipActive: { borderColor: "#d97706", color: "#fbbf24", background: "rgba(217,119,6,0.08)" },

  cableList: { display: "flex", flexDirection: "column", gap: 6 },
  cableCard: { background: "rgba(10,7,5,0.4)", border: "1px solid #2a1f15", borderRadius: 3, transition: "all 0.15s", overflow: "hidden" },
  cableCardExpanded: { borderColor: "#d97706", background: "rgba(20,14,9,0.8)" },
  cableHead: { padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" },
  cableName: { fontFamily: "'Fraunces', serif", fontSize: 15, color: "#fef3c7", fontWeight: 600 },
  catBadge: { fontSize: 8, padding: "2px 7px", border: "1px solid", borderRadius: 8, letterSpacing: "0.1em", textTransform: "uppercase" },
  cxBadge: { fontSize: 8, padding: "2px 7px", border: "1px solid", borderRadius: 8, letterSpacing: "0.05em" },
  cableAlias: { fontSize: 9, color: "#78716c", fontStyle: "italic", marginBottom: 2 },
  cableApps: { fontSize: 10, color: "#a89d8e", lineHeight: 1.4 },
  quickStats: { display: "flex", gap: 12, alignItems: "center", flexShrink: 0 },
  expandIcon: { color: "#d97706", fontSize: 18, marginLeft: 6 },

  cableDetails: { borderTop: "1px solid #2a1f15", background: "rgba(0,0,0,0.3)", padding: 18 },
  actionRow: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  actionBtn: { padding: "8px 14px", background: "#d97706", color: "#0a0705", border: "none", borderRadius: 2, fontFamily: "inherit", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", fontWeight: 600 },
  actionBtnSecondary: { background: "transparent", border: "1px solid #d97706", color: "#fbbf24" },
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
