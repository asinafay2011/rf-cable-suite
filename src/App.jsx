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

  rg8: { name: "RG-8/U", cat: "rg-50", alias: "Belden 8237, M17/164",
    z: 50, vp: 66, cap: 101, mass: 145, fMax: 1.0, vMax: 5000,
    d: 2.17, D: 7.24, shield: 8.13, OD: 10.29, flex: "low", outdoor: false, power: "high", complexity: "medium",
    atten: [[30, 1.8], [100, 3.3], [400, 7.2], [1000, 12.2]],
    cons: { conductor: "7-strand bare Cu, 0.92mm", dielectric: "Solid PE, εr 2.30", shield: "Bare Cu braid, 95% coverage", jacket: "Non-contaminating PVC, indoor" },
    proc: ["Strand 7 bare Cu wires", "PE extrusion at 7.24mm", "Cu braid 95% coverage", "PVC jacket extrusion", "Classic ham-radio construction — indoor PVC"],
    apps: "Legacy ham radio, HF/VHF commercial, fixed station", makers: "Belden, M&P" },
  rg141: { name: "RG-141/U", cat: "rg-50", alias: "M17/60",
    z: 50, vp: 70, cap: 96, mass: 32, fMax: 12.0, vMax: 1400,
    d: 0.94, D: 2.95, shield: 3.56, OD: 4.83, flex: "medium", outdoor: false, power: "low", complexity: "high",
    atten: [[100, 13.0], [400, 26.0], [1000, 42.0], [3000, 73.0], [10000, 140.0]],
    cons: { conductor: "Solid SPC, 0.94mm", dielectric: "Solid PTFE, εr 2.10", shield: "Silver-plated Cu braid", jacket: "FEP, brown" },
    proc: ["SPC solid inner conductor", "PTFE paste-extrude + sinter at 370°C", "SPC braid for low RF loss", "FEP jacket, 200°C rating", "Aerospace / high-temp qualification"],
    apps: "Aerospace, instrumentation, high-temp RF", makers: "Times, Harbour, Carlisle" },
  rg393: { name: "RG-393/U", cat: "rg-50", alias: "M17/127",
    z: 50, vp: 70, cap: 97, mass: 180, fMax: 10.0, vMax: 5000,
    d: 2.62, D: 7.26, shield: 8.50, OD: 9.91, flex: "low", outdoor: true, power: "high", complexity: "high",
    atten: [[100, 3.3], [400, 6.9], [1000, 11.8], [3000, 21.3], [10000, 42.0]],
    cons: { conductor: "7-strand SPC, 0.87mm", dielectric: "Solid PTFE", shield: "Double silver-plated Cu braid", jacket: "FEP, high-temp" },
    proc: ["SPC stranded core for flexibility", "PTFE dielectric for high-power + temp", "Double SPC braid for EMI + power", "FEP jacket, 200°C", "Military airborne qualification"],
    apps: "Airborne radar, high-power military RF", makers: "Times, Harbour, Carlisle" },
  lmr1200: { name: "LMR-1200", cat: "lmr", alias: "Times LMR-1200",
    z: 50, vp: 88, cap: 76, mass: 780, fMax: 3.1, vMax: 6000,
    d: 8.86, D: 25.4, shield: 27.2, OD: 30.9, flex: "low", outdoor: true, power: "high", complexity: "medium",
    atten: [[100, 0.84], [450, 1.87], [900, 2.72], [1800, 3.95], [2400, 4.63], [3000, 5.30]],
    cons: { conductor: "Solid bare Cu, 8.86mm", dielectric: "Gas-injection foam PE, εr 1.41", shield: "Al foil 100% + tinned Cu braid 88%", jacket: "Black UV-stable PE, 2.4mm" },
    proc: ["Large Cu draw ±0.05mm", "Gas-foam PE, VP 88%", "Al-polymer foil 100%", "Tinned Cu braid 88%", "Sweep to 3 GHz VSWR < 1.18"],
    apps: "High-power tower feeds, cellular low-loss, broadcast trunk", makers: "Times" },
  ldf1: { name: "LDF1-50", cat: "heliax", alias: "Andrew 1/4\" Heliax",
    z: 50, vp: 88, cap: 73, mass: 80, fMax: 21.0, vMax: 1600,
    d: 2.30, D: 6.90, shield: 7.40, OD: 7.87, flex: "medium", outdoor: true, power: "medium", complexity: "medium",
    atten: [[100, 4.30], [450, 9.15], [900, 13.2], [2000, 20.5], [5800, 36.5]],
    cons: { conductor: "Solid Cu, 2.30mm", dielectric: "Foam PE, low density", shield: "Corrugated solid Cu tube", jacket: "Black UV PE, 0.5mm" },
    proc: ["Cu inner draw", "Foam PE extrusion", "Seam-weld small Cu tape into tube", "Thin PE jacket UV-stable", "Bend radius ~2 cm"],
    apps: "Short jumpers, indoor DAS, small flexible feeders", makers: "CommScope (Andrew), RFS" },
  ldf2: { name: "LDF2-50", cat: "heliax", alias: "Andrew 3/8\" Heliax",
    z: 50, vp: 88, cap: 73, mass: 130, fMax: 13.5, vMax: 2500,
    d: 3.40, D: 10.7, shield: 11.2, OD: 12.2, flex: "medium", outdoor: true, power: "medium", complexity: "medium",
    atten: [[100, 2.68], [450, 5.75], [900, 8.35], [2000, 12.9], [5000, 21.2]],
    cons: { conductor: "Solid Cu, 3.40mm", dielectric: "Foam PE", shield: "Corrugated solid Cu tube", jacket: "Black UV PE, 0.6mm" },
    proc: ["Cu draw to 3.40mm", "Foam PE VP 88%", "Corrugated Cu tube seam-welded", "PE jacket", "Medium jumpers / mid-length feeders"],
    apps: "Indoor DAS jumpers, short tower feeders, 2-5 GHz", makers: "CommScope, RFS" },
  ldf6: { name: "LDF6-50", cat: "heliax", alias: "Andrew 1-1/4\" Heliax",
    z: 50, vp: 88, cap: 73, mass: 580, fMax: 2.7, vMax: 6500,
    d: 13.8, D: 38.1, shield: 40.0, OD: 42.0, flex: "low", outdoor: true, power: "high", complexity: "medium",
    atten: [[100, 0.61], [450, 1.33], [900, 1.96], [2000, 3.06], [2700, 3.64]],
    cons: { conductor: "Solid Cu, 13.8mm", dielectric: "Foam PE, very low density", shield: "Corrugated solid Cu tube", jacket: "Black UV PE, 2.0mm" },
    proc: ["Very large Cu draw", "Low-density foam PE VP 88%", "Large Cu tube, seam-weld", "Thick PE jacket", "Tower feeder for high-power"],
    apps: "Tall tower feeds, VHF/UHF broadcast, high-power cellular", makers: "CommScope, RFS" },
  ldf7: { name: "LDF7-50", cat: "heliax", alias: "Andrew 1-5/8\" Heliax",
    z: 50, vp: 88, cap: 73, mass: 850, fMax: 2.3, vMax: 7500,
    d: 17.3, D: 45.0, shield: 47.5, OD: 50.0, flex: "low", outdoor: true, power: "high", complexity: "medium",
    atten: [[100, 0.51], [450, 1.15], [900, 1.66], [2000, 2.58], [2300, 2.81]],
    cons: { conductor: "Solid Cu, 17.3mm", dielectric: "Foam PE", shield: "Corrugated solid Cu tube", jacket: "Black UV PE, 2.5mm" },
    proc: ["Specialized large Cu draw", "Foam PE VP 88%", "Large-diameter Cu tube seam-weld", "Heavy PE jacket", "Very high-power broadcast"],
    apps: "High-power broadcast, large tower feeds 100m+", makers: "CommScope, RFS" },
  hj5: { name: "HJ5-50", cat: "heliax", alias: "Andrew 7/8\" air-dielectric",
    z: 50, vp: 92, cap: 70, mass: 390, fMax: 5.9, vMax: 4500,
    d: 9.40, D: 24.5, shield: 25.5, OD: 28.0, flex: "low", outdoor: true, power: "high", complexity: "high",
    atten: [[100, 0.80], [450, 1.73], [900, 2.55], [2000, 3.97], [2400, 4.42], [5000, 6.85]],
    cons: { conductor: "Solid Cu with PE helical spacer", dielectric: "Air + spiral PE spacer, εr ~1.10", shield: "Annular corrugated solid Cu tube", jacket: "Black UV PE, 1.8mm" },
    proc: ["Cu inner + spiral PE spacer", "Annular corrugated Cu tube", "Precision centered spacer", "PE jacket UV-stable", "Pressurized with dry N2 gas for moisture control"],
    apps: "Low-PIM cellular feeders, broadcast — better loss than foam", makers: "CommScope, RFS" },
  hj7: { name: "HJ7-50", cat: "heliax", alias: "Andrew 1-5/8\" air-dielectric",
    z: 50, vp: 92, cap: 70, mass: 940, fMax: 2.9, vMax: 10000,
    d: 17.5, D: 44.0, shield: 47.5, OD: 52.0, flex: "low", outdoor: true, power: "high", complexity: "high",
    atten: [[100, 0.52], [450, 1.15], [900, 1.66], [2000, 2.58], [2900, 3.14]],
    cons: { conductor: "Large solid Cu + PE spacer", dielectric: "Air + spiral PE spacer", shield: "Annular corrugated Cu tube", jacket: "Black UV PE, thick" },
    proc: ["Large Cu + precision PE spacer", "Annular Cu tube, centered alignment", "Dry-gas N2 pressurization fittings", "Heavy PE jacket", "VHF/UHF very-high-power broadcast"],
    apps: "Very high-power broadcast, large tower feeds", makers: "CommScope, RFS" },
  ava5: { name: "AVA5-50", cat: "heliax", alias: "Andrew AVA low-PIM 7/8\"",
    z: 50, vp: 91, cap: 70, mass: 400, fMax: 5.9, vMax: 4500,
    d: 9.40, D: 23.5, shield: 25.4, OD: 28.0, flex: "low", outdoor: true, power: "high", complexity: "high",
    atten: [[100, 0.79], [450, 1.73], [900, 2.55], [2000, 3.97], [2400, 4.40], [5000, 6.80]],
    cons: { conductor: "Solid Cu + low-loss PE spacer", dielectric: "Air + low-loss PE spacer", shield: "Annular corrugated Cu tube", jacket: "Low-halogen PE, black" },
    proc: ["Low-PIM assembly process", "Annular Cu tube + centered spacer", "Dry-gas N2 pressurized", "Low-halogen PE jacket", "PIM tested < -160 dBc at 2 x 43 dBm"],
    apps: "Low-PIM cellular, LTE/5G high-power feeders", makers: "CommScope (Andrew)" },
  lcf12: { name: "LCF12-50", cat: "heliax", alias: "RFS 1/2\" Cellflex",
    z: 50, vp: 88, cap: 75, mass: 170, fMax: 10.2, vMax: 2800,
    d: 4.60, D: 13.1, shield: 14.0, OD: 16.0, flex: "medium", outdoor: true, power: "medium", complexity: "medium",
    atten: [[100, 2.00], [450, 4.32], [900, 6.22], [2000, 9.61], [2400, 10.6], [6000, 18.7]],
    cons: { conductor: "Solid Cu, 4.60mm", dielectric: "Foam PE, εr 1.45", shield: "Corrugated solid Cu tube", jacket: "Black UV PE" },
    proc: ["Cu draw to 4.60mm", "Foam PE VP 88%", "Cu tube corrugated seam-weld", "UV PE jacket", "Competitor to LDF4 (same 1/2\" class)"],
    apps: "Cellular feeders, mid-size broadcast, LDF4 alternative", makers: "RFS (Radio Frequency Systems)" },
  lcf78: { name: "LCF78-50", cat: "heliax", alias: "RFS 7/8\" Cellflex",
    z: 50, vp: 88, cap: 75, mass: 390, fMax: 5.0, vMax: 4200,
    d: 9.20, D: 24.0, shield: 25.5, OD: 28.0, flex: "low", outdoor: true, power: "high", complexity: "medium",
    atten: [[100, 1.08], [450, 2.35], [900, 3.40], [2000, 5.28], [2400, 5.87], [5000, 8.89]],
    cons: { conductor: "Solid Cu, 9.20mm", dielectric: "Foam PE", shield: "Corrugated solid Cu tube", jacket: "Black UV PE" },
    proc: ["Large Cu draw", "Foam PE VP 88%", "Large Cu tube corrugated", "UV PE jacket", "Cellular tower feeder — LDF5 competitor"],
    apps: "Cellular backhaul, broadcast, tower feeders", makers: "RFS" },
  lcf114: { name: "LCF114-50", cat: "heliax", alias: "RFS 1-1/4\" Cellflex",
    z: 50, vp: 88, cap: 75, mass: 560, fMax: 3.1, vMax: 6000,
    d: 13.2, D: 34.0, shield: 37.0, OD: 40.0, flex: "low", outdoor: true, power: "high", complexity: "medium",
    atten: [[100, 0.72], [450, 1.59], [900, 2.32], [2000, 3.63], [3100, 4.60]],
    cons: { conductor: "Solid Cu, 13.2mm", dielectric: "Foam PE", shield: "Corrugated solid Cu tube", jacket: "Black UV PE, thick" },
    proc: ["Very large Cu draw", "Foam PE VP 88%", "Large Cu tube corrugated", "Heavy UV PE jacket", "VHF/UHF tower feeder, LDF6 competitor"],
    apps: "Broadcast, high-power cellular, tall tower feeders", makers: "RFS" },
  syv505: { name: "SYV-50-5", cat: "rg-50", alias: "Chinese GB/T 14864 50Ω",
    z: 50, vp: 66, cap: 100, mass: 52, fMax: 1.0, vMax: 2000,
    d: 0.90, D: 3.00, shield: 3.70, OD: 5.00, flex: "medium", outdoor: false, power: "medium", complexity: "low",
    atten: [[100, 14.0], [400, 30.0], [900, 48.0], [1000, 52.0]],
    cons: { conductor: "7-strand tinned Cu, 0.30mm", dielectric: "Solid PE", shield: "Single tinned Cu braid, 85%", jacket: "Black PVC" },
    proc: ["7-strand tinned Cu bunch", "PE extrusion 3.00mm", "Tinned Cu braid 85%", "PVC jacket", "Chinese RG-58 equivalent — cost-focused"],
    apps: "Generic RF, antenna lead-ins, Asian / VN domestic market", makers: "Chinese domestic (various)" },
  syv507: { name: "SYV-50-7", cat: "rg-50", alias: "Chinese GB/T 14864 50Ω medium",
    z: 50, vp: 66, cap: 100, mass: 90, fMax: 1.0, vMax: 3000,
    d: 1.37, D: 4.70, shield: 5.60, OD: 7.30, flex: "medium", outdoor: false, power: "medium", complexity: "low",
    atten: [[100, 8.0], [400, 17.0], [900, 27.0], [1000, 29.0]],
    cons: { conductor: "7-strand bare Cu, 0.46mm", dielectric: "Solid PE", shield: "Bare Cu braid, 95%", jacket: "Black PVC" },
    proc: ["7-strand Cu bunch", "Solid PE to 4.70mm", "Cu braid 95%", "PVC jacket", "Chinese RG-8X class"],
    apps: "Mid-loss RF, HF/VHF, antenna feeds, VN domestic", makers: "Chinese domestic" },
  syv755: { name: "SYV-75-5", cat: "rg-75", alias: "Chinese GB/T CCTV 75Ω",
    z: 75, vp: 66, cap: 67, mass: 50, fMax: 0.8, vMax: 1500,
    d: 0.78, D: 4.60, shield: 5.20, OD: 7.00, flex: "medium", outdoor: false, power: "low", complexity: "low",
    atten: [[100, 12.0], [400, 24.0], [900, 38.0]],
    cons: { conductor: "Solid CCS, 0.78mm", dielectric: "Solid PE", shield: "Al-Mg braid, 48+ picks", jacket: "White or black PVC" },
    proc: ["CCS wire prep", "PE extrusion", "Al-Mg braid — cost-effective shield", "PVC jacket", "Chinese CCTV/CATV standard"],
    apps: "CCTV surveillance, CATV, Asian/VN video systems", makers: "Chinese domestic" },
  belden1855a: { name: "Belden 1855A", cat: "video", alias: "Mini HD-SDI 75Ω",
    z: 75, vp: 82, cap: 54, mass: 28, fMax: 3.0, vMax: 300,
    d: 0.47, D: 2.32, shield: 2.80, OD: 3.70, flex: "high", outdoor: false, power: "low", complexity: "medium",
    atten: [[100, 8.2], [400, 15.5], [1000, 24.9], [3000, 44.0]],
    cons: { conductor: "Solid bare Cu, 0.47mm (25 AWG)", dielectric: "Gas-injected foam HDPE", shield: "Duobond foil 100% + tinned Cu braid 95%", jacket: "Matte black PVC, 0.5mm" },
    proc: ["Fine Cu wire ±0.01mm", "Gas-foam HDPE with skin co-extrusion", "Duobond foil + 95% braid", "Thin matte PVC jacket", "Sweep test to 3 GHz HD-SDI"],
    apps: "Studio HD-SDI jumpers, broadcast truck patch panels", makers: "Belden" },
  belden4694r: { name: "Belden 4694R", cat: "video", alias: "Precision 12G-SDI 75Ω",
    z: 75, vp: 85, cap: 53, mass: 74, fMax: 12.0, vMax: 500,
    d: 1.02, D: 4.80, shield: 5.60, OD: 7.70, flex: "medium", outdoor: false, power: "low", complexity: "high",
    atten: [[100, 4.4], [400, 8.6], [1000, 13.9], [3000, 24.8], [6000, 36.8], [12000, 55.0]],
    cons: { conductor: "Solid bare Cu, 1.02mm (18 AWG)", dielectric: "Gas-injected foam HDPE", shield: "Duobond foil + tinned Cu braid, 95%", jacket: "Matte black PVC, non-contaminating" },
    proc: ["18 AWG Cu precision draw", "Gas-foam HDPE for VP 85%", "Dual-shield for 12 GHz performance", "PVC jacket non-contaminating", "Full 12 GHz qualification (4K 12G-SDI)"],
    apps: "4K / UHD / 12G-SDI broadcast, 8K studio infrastructure", makers: "Belden" },
  ecoflex10: { name: "Ecoflex-10", cat: "lmr", alias: "SSB Electronics low-loss (EU)",
    z: 50, vp: 86, cap: 82, mass: 150, fMax: 6.0, vMax: 3000,
    d: 2.75, D: 7.30, shield: 8.20, OD: 10.2, flex: "medium", outdoor: true, power: "high", complexity: "medium",
    atten: [[100, 2.0], [450, 4.3], [900, 7.0], [2400, 12.0], [5800, 20.0]],
    cons: { conductor: "Solid Cu, 2.75mm", dielectric: "Foam PE, εr 1.55", shield: "Al foil 100% + tinned Cu braid, 90%", jacket: "Black UV-stable PE" },
    proc: ["Cu wire to 2.75mm", "Foam PE extrude, VP 86%", "Al-polymer foil 100% + braid 90%", "UV PE jacket", "German / EU alternative to LMR-400"],
    apps: "EU cellular, amateur radio, Wi-Fi outdoor", makers: "SSB Electronics (Germany)" },
  h155: { name: "H155", cat: "lmr", alias: "Messi & Paoloni Italian",
    z: 50, vp: 81, cap: 80, mass: 55, fMax: 6.0, vMax: 2000,
    d: 1.45, D: 4.30, shield: 4.80, OD: 5.40, flex: "high", outdoor: true, power: "medium", complexity: "medium",
    atten: [[100, 4.9], [450, 10.8], [900, 16.5], [2400, 27.5], [5800, 46.0]],
    cons: { conductor: "Solid CCS, 1.45mm", dielectric: "Foam PE", shield: "Al foil + tinned Cu braid", jacket: "Black UV PE" },
    proc: ["CCS wire for cost", "Foam PE VP 81%", "Foil + braid shield", "PE jacket UV stable", "Italian / EU budget low-loss"],
    apps: "EU amateur, small cellular jumpers, Wi-Fi antenna feeds", makers: "Messi & Paoloni (Italy)" },
  multiflex141: { name: "MultiFlex-141", cat: "phase", alias: "H+S flexible RG-402 alt",
    z: 50, vp: 70, cap: 95, mass: 48, fMax: 18.0, vMax: 1000,
    d: 0.92, D: 2.95, shield: 3.58, OD: 4.00, flex: "high", outdoor: false, power: "low", complexity: "high",
    atten: [[1000, 30.0], [3000, 55.0], [10000, 105.0], [18000, 145.0]],
    cons: { conductor: "SPC, 0.92mm", dielectric: "Solid PTFE", shield: "SPC braid + flexible Cu tape", jacket: "FEP, flexible" },
    proc: ["SPC solid inner", "PTFE paste-extrude + sinter", "Flexible Cu tape + SPC braid", "FEP jacket", "Flexible alternative to rigid semi-rigid UT-141"],
    apps: "Bench test cables replacing semi-rigid where flex needed", makers: "Huber+Suhner" },
  sucoflex501: { name: "SUCOFLEX 501", cat: "phase", alias: "H+S precision 40 GHz",
    z: 50, vp: 82, cap: 80, mass: 65, fMax: 40.0, vMax: 500,
    d: 0.93, D: 3.20, shield: 4.20, OD: 5.30, flex: "high", outdoor: false, power: "low", complexity: "high",
    atten: [[1000, 21.0], [10000, 70.0], [20000, 103.0], [40000, 155.0]],
    cons: { conductor: "SPC stranded", dielectric: "PTFE tape wrap + air", shield: "Double SPC braid, >95 dB", jacket: "FEP" },
    proc: ["SPC stranded, low skin loss", "PTFE helical tape + sintering", "Double SPC braid >95 dB shielding", "FEP jacket -55 to +125°C", "Phase-matched pairs available"],
    apps: "VNA test, mmWave development, 5G FR2 instrumentation", makers: "Huber+Suhner" },

  lmr240uf: { name: "LMR-240-UltraFlex", cat: "lmr", alias: "Times ultra-flex 240",
    z: 50, vp: 84, cap: 82, mass: 50, fMax: 5.8, vMax: 1800,
    d: 1.42, D: 3.80, shield: 4.45, OD: 6.10, flex: "high", outdoor: true, power: "medium", complexity: "medium",
    atten: [[100, 5.1], [450, 11.3], [900, 16.9], [2400, 28.5], [5800, 46.5]],
    cons: { conductor: "Stranded bare Cu, multi-strand", dielectric: "Gas-injected foam PE", shield: "Al foil + tinned Cu braid, 95%", jacket: "Black flexible PE" },
    proc: ["Multi-strand Cu for repeated flex", "Foam PE extrusion", "Foil + braid shield", "Flexible PE jacket", "Rated for 1000+ flex cycles"],
    apps: "Antenna jumpers, pan-tilt units, cable drums, robotics", makers: "Times" },
  lmr400uf: { name: "LMR-400-UltraFlex", cat: "lmr", alias: "Times ultra-flex 400",
    z: 50, vp: 84, cap: 81, mass: 140, fMax: 5.8, vMax: 3500,
    d: 2.74, D: 7.24, shield: 8.26, OD: 10.29, flex: "high", outdoor: true, power: "high", complexity: "medium",
    atten: [[100, 2.3], [450, 5.2], [900, 7.4], [2400, 12.6], [5800, 21.5]],
    cons: { conductor: "Stranded bare Cu, multi-strand", dielectric: "Gas-injected foam PE", shield: "Al foil 100% + tinned Cu braid, 92%", jacket: "Black flexible PE" },
    proc: ["Stranded Cu core for 1000+ bend cycles", "Foam PE, VP 84%", "Al-polymer foil + braid", "Flexible PE jacket", "Tested for drum reeling, robot arms"],
    apps: "Mobile antennas, cable reels, robotics, frequent repositioning", makers: "Times" },
  lmr600uf: { name: "LMR-600-UltraFlex", cat: "lmr", alias: "Times ultra-flex 600",
    z: 50, vp: 84, cap: 80, mass: 300, fMax: 4.0, vMax: 4000,
    d: 4.47, D: 11.43, shield: 12.70, OD: 14.99, flex: "medium", outdoor: true, power: "high", complexity: "medium",
    atten: [[100, 1.5], [450, 3.2], [900, 5.0], [2400, 8.5], [4000, 11.8]],
    cons: { conductor: "Stranded bare Cu", dielectric: "Gas-injection foam PE", shield: "Al foil + tinned Cu braid", jacket: "Flexible black PE" },
    proc: ["Multi-strand Cu 4.47mm", "Foam PE VP 84%", "Foil + braid shield", "Flexible PE jacket", "Repeated-flex qualified large size"],
    apps: "Large mobile / portable antennas, broadcast trucks, flex runs", makers: "Times" },
  sucoflex106: { name: "SUCOFLEX 106", cat: "phase", alias: "H+S 50 GHz precision",
    z: 50, vp: 77, cap: 85, mass: 75, fMax: 50.0, vMax: 500,
    d: 1.10, D: 3.70, shield: 4.60, OD: 5.60, flex: "high", outdoor: false, power: "low", complexity: "high",
    atten: [[1000, 22.0], [10000, 78.0], [20000, 120.0], [40000, 180.0], [50000, 220.0]],
    cons: { conductor: "SPC stranded", dielectric: "PTFE tape + air", shield: "Double SPC braid", jacket: "FEP" },
    proc: ["SPC stranded", "PTFE tape helical + sintering", "Double SPC braid", "FEP jacket", "50 GHz qualified, phase-match pairs available"],
    apps: "VNA testing, mmWave dev, precision 5G FR2 characterization", makers: "Huber+Suhner" },
  sucoflex550s: { name: "SUCOFLEX 550S", cat: "phase", alias: "H+S 67 GHz mmWave",
    z: 50, vp: 79, cap: 82, mass: 55, fMax: 67.0, vMax: 300,
    d: 0.80, D: 3.20, shield: 4.20, OD: 5.00, flex: "high", outdoor: false, power: "low", complexity: "high",
    atten: [[10000, 85.0], [20000, 125.0], [40000, 200.0], [67000, 280.0]],
    cons: { conductor: "SPC stranded, miniature", dielectric: "PTFE tape + low-density air", shield: "Double SPC braid + outer tape", jacket: "FEP" },
    proc: ["Miniature SPC stranded", "PTFE helical tape, thin layer", "Double SPC braid", "FEP jacket", "67 GHz qualified (5G FR2, V / W-band test)"],
    apps: "mmWave / V-band / W-band VNA test, 5G FR2 production test", makers: "Huber+Suhner" },
  gorephaseflex024: { name: "Gore PhaseFlex 024", cat: "phase", alias: "Gore miniature VNA",
    z: 50, vp: 80, cap: 85, mass: 20, fMax: 40.0, vMax: 300,
    d: 0.40, D: 1.90, shield: 2.20, OD: 2.40, flex: "high", outdoor: false, power: "low", complexity: "high",
    atten: [[1000, 50.0], [10000, 170.0], [20000, 235.0], [40000, 350.0]],
    cons: { conductor: "SPC stranded, very fine", dielectric: "ePTFE, low density", shield: "SPC braid + conductive tape", jacket: "FEP" },
    proc: ["Fine SPC stranded", "ePTFE stretched for low εr", "SPC braid + spiral tape", "FEP jacket", "Miniature phase-stable for dense arrays / probes"],
    apps: "Mini VNA cables, phase-matched dense arrays, test probes", makers: "W.L. Gore" },
  belden1505a: { name: "Belden 1505A", cat: "video", alias: "HD-SDI precision 18 AWG",
    z: 75, vp: 83, cap: 53, mass: 75, fMax: 6.0, vMax: 500,
    d: 1.02, D: 4.80, shield: 5.60, OD: 6.15, flex: "medium", outdoor: false, power: "low", complexity: "high",
    atten: [[100, 5.5], [400, 10.2], [1000, 17.5], [3000, 31.0], [6000, 46.0]],
    cons: { conductor: "Solid bare Cu, 1.02mm (18 AWG)", dielectric: "Gas-injected foam HDPE", shield: "Duobond foil + tinned Cu braid, 95%", jacket: "Matte black PVC, non-contaminating" },
    proc: ["18 AWG Cu precision draw", "Gas-foam HDPE skin-foam co-extrude", "Duobond foil + 95% braid", "PVC non-contaminating", "Sweep to 6 GHz (6G-SDI)"],
    apps: "Broadcast HD-SDI / 3G-SDI / 6G-SDI precision long runs", makers: "Belden" },
  belden9913f: { name: "Belden 9913F", cat: "lmr", alias: "Flexible 9913 variant",
    z: 50, vp: 84, cap: 81, mass: 140, fMax: 2.0, vMax: 3500,
    d: 2.84, D: 7.24, shield: 8.13, OD: 10.29, flex: "high", outdoor: true, power: "high", complexity: "medium",
    atten: [[100, 3.3], [450, 7.5], [900, 9.6], [1000, 10.1], [2000, 14.7]],
    cons: { conductor: "7-strand bare Cu, 1.02mm", dielectric: "Semi-solid foam PE", shield: "Al foil + tinned Cu braid", jacket: "Black UV PE" },
    proc: ["Stranded Cu for flexibility", "Semi-foam PE", "Al foil 100% + tinned Cu braid", "UV PE jacket", "Flexible variant of 9913 for jumper use"],
    apps: "Ham / commercial antenna jumpers, flexible runs, 1-2 GHz", makers: "Belden" },
  canareL5CFB: { name: "Canare L-5CFB", cat: "video", alias: "Japanese 75Ω studio",
    z: 75, vp: 83, cap: 53, mass: 75, fMax: 3.0, vMax: 450,
    d: 1.02, D: 4.80, shield: 5.60, OD: 7.70, flex: "medium", outdoor: false, power: "low", complexity: "high",
    atten: [[100, 5.0], [400, 9.5], [1000, 15.5], [3000, 28.0]],
    cons: { conductor: "Solid bare Cu, 1.02mm", dielectric: "Foam PE", shield: "Al foil + tinned Cu braid, 95%", jacket: "Black PVC" },
    proc: ["Cu precision draw", "Foam PE extrusion", "Foil + braid for HD-SDI", "PVC jacket", "Japanese studio broadcast standard"],
    apps: "HD-SDI / 3G-SDI Japanese / Asian studios, OB vans", makers: "Canare (Japan)" },
  cnt400: { name: "CNT-400", cat: "lmr", alias: "CommScope LMR-400 equivalent",
    z: 50, vp: 85, cap: 78, mass: 140, fMax: 5.8, vMax: 3500,
    d: 2.74, D: 7.24, shield: 8.13, OD: 10.29, flex: "medium", outdoor: true, power: "high", complexity: "medium",
    atten: [[100, 2.2], [450, 4.9], [900, 6.8], [2400, 11.5], [5800, 19.5]],
    cons: { conductor: "Solid bare Cu, 2.74mm", dielectric: "Foam PE", shield: "Al foil + tinned Cu braid, 90%", jacket: "Black UV PE" },
    proc: ["Cu wire 2.74mm", "Foam PE VP 85%", "Al foil + braid", "UV PE jacket", "CommScope / Andrew version of LMR-400"],
    apps: "Cellular jumpers, Wi-Fi outdoor, general low-loss 50Ω", makers: "CommScope" },
  ut034: { name: "UT-034 Micro", cat: "semi", alias: "Micro-Coax UT-034",
    z: 50, vp: 70, cap: 98, mass: 3, fMax: 65.0, vMax: 200,
    d: 0.20, D: 0.66, shield: 0.78, OD: 0.86, flex: "low", outdoor: false, power: "low", complexity: "high",
    atten: [[1000, 110.0], [10000, 380.0], [18000, 500.0], [40000, 800.0]],
    cons: { conductor: "Solid SPC, 0.20mm", dielectric: "Solid PTFE, εr 2.05", shield: "Solid tin-plated Cu tube", jacket: "None" },
    proc: ["Micro SPC draw", "Very thin PTFE dielectric", "Solid Cu tube swaged / drawn", "No jacket — bare copper", "Very high-freq mmWave interconnect"],
    apps: "MMIC packaging, chip-to-chip mmWave, phased-array modules", makers: "Micro-Coax, Carlisle" },
  ut141c: { name: "UT-141-C Conformable", cat: "semi", alias: "Hand-formable semi-rigid",
    z: 50, vp: 70, cap: 95, mass: 35, fMax: 20.0, vMax: 1000,
    d: 0.92, D: 2.95, shield: 3.50, OD: 3.58, flex: "medium", outdoor: false, power: "low", complexity: "high",
    atten: [[1000, 45.0], [10000, 150.0], [18000, 210.0]],
    cons: { conductor: "Solid SPC, 0.92mm", dielectric: "Solid PTFE, εr 2.05", shield: "Corrugated Cu tape + SPC braid (hand-formable)", jacket: "Optional thin FEP" },
    proc: ["SPC inner", "PTFE dielectric", "Corrugated Cu tape — hand-bendable", "Optional FEP jacket", "Prototype alternative to rigid UT-141"],
    apps: "Prototype chassis routing, field-adjustable semi-rigid", makers: "Micro-Coax, Carlisle, Harbour" },
  ava7: { name: "AVA7-50", cat: "heliax", alias: "Andrew AVA low-PIM 1-5/8\"",
    z: 50, vp: 92, cap: 70, mass: 950, fMax: 2.9, vMax: 10000,
    d: 17.5, D: 44.0, shield: 47.5, OD: 52.0, flex: "low", outdoor: true, power: "high", complexity: "high",
    atten: [[100, 0.52], [450, 1.15], [900, 1.66], [2000, 2.58], [2900, 3.14]],
    cons: { conductor: "Large solid Cu + PE spacer", dielectric: "Air + low-loss PE spacer", shield: "Annular corrugated Cu tube", jacket: "Low-halogen PE, black" },
    proc: ["Low-PIM assembly", "Annular Cu tube + centered spacer", "Dry-gas pressurized", "Halogen-free PE jacket", "PIM < -160 dBc at 2 x 43 dBm"],
    apps: "Very high-power low-PIM broadcast / macro cellular feeders", makers: "CommScope (Andrew)" },
  hj4: { name: "HJ4-50", cat: "heliax", alias: "Andrew 3/8\" air-dielectric",
    z: 50, vp: 92, cap: 70, mass: 135, fMax: 13.5, vMax: 2500,
    d: 3.40, D: 10.7, shield: 11.2, OD: 12.2, flex: "medium", outdoor: true, power: "medium", complexity: "high",
    atten: [[100, 2.30], [450, 4.96], [900, 7.22], [2000, 11.20], [5000, 18.50]],
    cons: { conductor: "Solid Cu + PE spacer", dielectric: "Air + spiral PE spacer", shield: "Annular corrugated Cu tube", jacket: "Black UV PE" },
    proc: ["Cu inner + precision PE spacer", "Annular Cu tube, centered alignment", "N2 gas-pressurized", "PE jacket UV-stable", "Lower loss than foam LDF2"],
    apps: "Indoor DAS / short tower feeders where air-dielectric beats foam LDF2", makers: "CommScope (Andrew)" },
  rg303: { name: "RG-303/U", cat: "rg-50", alias: "M17/111",
    z: 50, vp: 70, cap: 95, mass: 12, fMax: 12.0, vMax: 900,
    d: 0.58, D: 1.68, shield: 2.16, OD: 2.50, flex: "medium", outdoor: false, power: "low", complexity: "high",
    atten: [[100, 18.0], [400, 36.0], [1000, 60.0], [3000, 108.0]],
    cons: { conductor: "Solid SPC, 0.58mm", dielectric: "Solid PTFE", shield: "SPC braid", jacket: "FEP, brown" },
    proc: ["SPC solid inner", "PTFE dielectric", "SPC braid", "FEP jacket 200°C", "Thin mil-spec high-temp"],
    apps: "Aerospace / military small high-temp RF", makers: "Times, Harbour" },

  ldf15: { name: "LDF1.5-50", cat: "heliax", alias: "Andrew 5/16\" Heliax",
    z: 50, vp: 88, cap: 73, mass: 110, fMax: 14.0, vMax: 1900,
    d: 3.10, D: 8.80, shield: 9.40, OD: 9.90, flex: "medium", outdoor: true, power: "medium", complexity: "medium",
    atten: [[100, 3.40], [450, 7.35], [900, 10.6], [2000, 16.2], [5000, 26.5]],
    cons: { conductor: "Solid Cu, 3.10mm", dielectric: "Foam PE", shield: "Corrugated solid Cu tube", jacket: "Black UV PE, 0.55mm" },
    proc: ["Cu draw 3.10mm", "Foam PE VP 88%", "Cu tube seam-welded", "PE jacket UV-stable", "Between LDF1 and LDF2 size class"],
    apps: "Short-to-mid feeders, DAS jumpers, 3-10 GHz runs", makers: "CommScope (Andrew), RFS" },
  ldf45: { name: "LDF4.5-50", cat: "heliax", alias: "Andrew 7/16\" Heliax",
    z: 50, vp: 88, cap: 73, mass: 230, fMax: 10.2, vMax: 3000,
    d: 6.70, D: 18.0, shield: 18.8, OD: 19.1, flex: "low", outdoor: true, power: "high", complexity: "medium",
    atten: [[100, 1.57], [450, 3.45], [900, 5.04], [2000, 7.72], [5000, 12.8]],
    cons: { conductor: "Solid Cu, 6.70mm", dielectric: "Foam PE", shield: "Corrugated solid Cu tube", jacket: "Black UV PE, 0.55mm" },
    proc: ["Medium Cu draw", "Foam PE VP 88%", "Cu tube corrugated", "UV PE jacket", "Between LDF4 and LDF5 size class"],
    apps: "Cellular backhaul mid-length, broadcast, general feeders", makers: "CommScope (Andrew)" },
  fsj2: { name: "FSJ2-50A", cat: "heliax", alias: "Andrew 3/8\" SuperFlex",
    z: 50, vp: 81, cap: 86, mass: 135, fMax: 10.2, vMax: 1800,
    d: 3.30, D: 6.80, shield: 7.70, OD: 11.1, flex: "high", outdoor: true, power: "medium", complexity: "medium",
    atten: [[100, 2.55], [450, 5.70], [900, 8.38], [2000, 13.0], [5000, 21.5]],
    cons: { conductor: "Solid Cu inner", dielectric: "Foam PE spacer", shield: "Corrugated solid Cu tube", jacket: "Flexible black PE jacket" },
    proc: ["Cu draw", "Foam PE extrude", "Flexible corrugated Cu tube", "Flexible PE jacket", "SuperFlex — tighter bend radius than LDF"],
    apps: "Short jumpers, flexible tower feeders, equipment room connections", makers: "CommScope (Andrew)" },
  fsj4: { name: "FSJ4-50B", cat: "heliax", alias: "Andrew 1/2\" SuperFlex",
    z: 50, vp: 81, cap: 86, mass: 220, fMax: 8.8, vMax: 2500,
    d: 4.80, D: 10.2, shield: 11.5, OD: 16.0, flex: "high", outdoor: true, power: "high", complexity: "medium",
    atten: [[100, 1.80], [450, 4.00], [900, 5.90], [2000, 9.05], [5000, 15.0]],
    cons: { conductor: "Solid Cu inner", dielectric: "Foam PE spacer", shield: "Corrugated solid Cu tube", jacket: "Flexible black PE jacket" },
    proc: ["Cu draw 4.80mm", "Foam PE", "Flexible Cu tube", "Flexible PE jacket", "Larger SuperFlex class"],
    apps: "Flexible mid-feeders, antenna jumpers needing tight bends", makers: "CommScope (Andrew)" },
  lmr1700: { name: "LMR-1700", cat: "lmr", alias: "Times LMR-1700 (largest)",
    z: 50, vp: 89, cap: 75, mass: 1200, fMax: 2.2, vMax: 7500,
    d: 13.0, D: 34.8, shield: 36.5, OD: 44.45, flex: "low", outdoor: true, power: "high", complexity: "high",
    atten: [[100, 0.57], [450, 1.28], [900, 1.86], [1800, 2.72], [2200, 3.02]],
    cons: { conductor: "Solid bare Cu, 13.0mm", dielectric: "Gas-injection foam PE, εr 1.38", shield: "Al foil 100% + tinned Cu braid", jacket: "Black UV PE, 3.0mm" },
    proc: ["Very large Cu draw ±0.05mm", "Gas-foam PE VP 89%", "Al-polymer foil 100%", "Tinned Cu braid", "Sweep to 2.2 GHz VSWR < 1.15"],
    apps: "Very high-power broadcast, long tower feeds 200m+, competitor to LDF7", makers: "Times" },
  lmr240llpl: { name: "LMR-240-LLPL", cat: "lmr", alias: "Times low-loss plenum",
    z: 50, vp: 84, cap: 82, mass: 55, fMax: 5.8, vMax: 1800,
    d: 1.42, D: 3.80, shield: 4.45, OD: 6.10, flex: "medium", outdoor: false, power: "medium", complexity: "medium",
    atten: [[100, 4.6], [450, 10.2], [900, 14.9], [2400, 25.5], [5800, 43.0]],
    cons: { conductor: "Solid bare Cu, 1.42mm", dielectric: "Foam FEP (plenum-rated)", shield: "Al foil + tinned Cu braid", jacket: "White FEP / LSZH, UL 910 plenum" },
    proc: ["Cu wire 1.42mm", "Foam FEP dielectric — plenum spec", "Foil + braid shield", "FEP jacket UL 910 certified", "Fire-safe for air-handling spaces"],
    apps: "Indoor plenum cable runs (air-return), commercial buildings, LEED certified", makers: "Times" },
  syv503: { name: "SYV-50-3", cat: "rg-50", alias: "Chinese GB/T 50Ω thin",
    z: 50, vp: 66, cap: 100, mass: 20, fMax: 1.0, vMax: 1500,
    d: 0.40, D: 2.10, shield: 2.60, OD: 3.00, flex: "high", outdoor: false, power: "low", complexity: "low",
    atten: [[100, 22.0], [400, 45.0], [900, 72.0]],
    cons: { conductor: "Solid CCS or Cu, 0.40mm", dielectric: "Solid PE", shield: "Tinned Cu braid, 85%", jacket: "Black PVC, thin" },
    proc: ["Thin CCS / Cu wire", "Solid PE extrude", "Single Cu braid", "Thin PVC jacket", "Chinese RG-174 class — VN antenna pigtails"],
    apps: "Antenna pigtails, internal jumpers, Asian / VN domestic", makers: "Chinese domestic" },
  syv509: { name: "SYV-50-9", cat: "rg-50", alias: "Chinese GB/T 50Ω large",
    z: 50, vp: 66, cap: 100, mass: 150, fMax: 1.0, vMax: 5000,
    d: 1.78, D: 6.40, shield: 7.20, OD: 9.00, flex: "low", outdoor: false, power: "high", complexity: "medium",
    atten: [[100, 5.0], [400, 11.0], [900, 17.5], [1000, 18.5]],
    cons: { conductor: "7-strand bare Cu, 0.60mm", dielectric: "Solid PE", shield: "Bare Cu braid, 95%", jacket: "Black PVC" },
    proc: ["Stranded Cu core", "Solid PE 6.40mm", "Cu braid 95%", "PVC jacket 9mm", "Chinese RG-213 class — broadcast antenna feeds"],
    apps: "HF/VHF antenna feeds, Asian / VN broadcast, high-power fixed station", makers: "Chinese domestic" },
  syv753: { name: "SYV-75-3", cat: "rg-75", alias: "Chinese GB/T CCTV 75Ω thin",
    z: 75, vp: 66, cap: 67, mass: 25, fMax: 0.6, vMax: 1000,
    d: 0.50, D: 3.00, shield: 3.40, OD: 4.00, flex: "high", outdoor: false, power: "low", complexity: "low",
    atten: [[100, 18.0], [400, 34.0], [900, 52.0]],
    cons: { conductor: "Solid CCS, 0.50mm", dielectric: "Solid PE", shield: "Al-Mg braid, 48 picks", jacket: "White PVC" },
    proc: ["CCS wire", "PE extrusion", "Al-Mg braid budget shield", "PVC jacket thin", "Chinese CCTV smallest size"],
    apps: "Indoor CCTV short runs, Asian / VN surveillance", makers: "Chinese domestic" },
  syv757: { name: "SYV-75-7", cat: "rg-75", alias: "Chinese GB/T CCTV 75Ω large",
    z: 75, vp: 66, cap: 67, mass: 110, fMax: 1.0, vMax: 2000,
    d: 1.20, D: 7.30, shield: 8.20, OD: 10.0, flex: "medium", outdoor: true, power: "low", complexity: "medium",
    atten: [[100, 6.5], [400, 14.0], [900, 23.0]],
    cons: { conductor: "Solid Cu, 1.20mm", dielectric: "Solid PE", shield: "Tinned Cu braid, 95%", jacket: "Black UV PVC" },
    proc: ["Cu draw 1.20mm", "PE extrusion", "Tinned Cu braid 95%", "UV PVC jacket", "Chinese large CATV / CCTV trunk"],
    apps: "CCTV trunk runs, Asian CATV distribution, outdoor video", makers: "Chinese domestic" },
  canareL4CFB: { name: "Canare L-4CFB", cat: "video", alias: "Japanese 75Ω studio thin",
    z: 75, vp: 83, cap: 54, mass: 30, fMax: 3.0, vMax: 300,
    d: 0.65, D: 2.80, shield: 3.30, OD: 4.50, flex: "high", outdoor: false, power: "low", complexity: "medium",
    atten: [[100, 7.5], [400, 14.2], [1000, 22.0], [3000, 38.0]],
    cons: { conductor: "Solid bare Cu, 0.65mm", dielectric: "Gas-injected foam HDPE", shield: "Al foil + tinned Cu braid, 95%", jacket: "Matte black PVC" },
    proc: ["Fine Cu draw", "Gas-foam HDPE", "Foil + braid dual-shield", "Thin matte PVC", "Japanese studio thin jumper standard"],
    apps: "Studio patch panels, short HD-SDI jumpers, Asian broadcast", makers: "Canare (Japan)" },
  rg62: { name: "RG-62/U", cat: "rg-50", alias: "IBM 3270, ARCnet (93 Ω)",
    z: 93, vp: 84, cap: 44, mass: 37, fMax: 0.4, vMax: 750,
    d: 0.64, D: 3.71, shield: 4.14, OD: 6.10, flex: "medium", outdoor: false, power: "low", complexity: "medium",
    atten: [[30, 3.6], [100, 9.8], [400, 20.0], [900, 33.0]],
    cons: { conductor: "Solid CCS, 0.64mm", dielectric: "Air + semi-solid PE helical spacer, εr 1.40", shield: "Bare Cu braid, 95%", jacket: "Non-contaminating PVC" },
    proc: ["CCS wire prep", "Air-PE helical dielectric (unique)", "Cu braid 95%", "PVC jacket", "93 Ω unusual impedance — historical data systems"],
    apps: "IBM 3270 terminals, ARCnet, legacy data / teletype networks", makers: "Belden, CommScope (legacy)" },
  rg188: { name: "RG-188/U", cat: "rg-50", alias: "M17/84, thin high-temp",
    z: 50, vp: 70, cap: 95, mass: 10, fMax: 12.0, vMax: 1200,
    d: 0.51, D: 1.52, shield: 1.90, OD: 2.69, flex: "high", outdoor: false, power: "low", complexity: "high",
    atten: [[100, 17.0], [400, 34.0], [1000, 58.0], [3000, 108.0]],
    cons: { conductor: "7-strand SPC, 0.17mm", dielectric: "Solid PTFE, εr 2.10", shield: "Silver-plated Cu braid", jacket: "Brown FEP fluoropolymer" },
    proc: ["SPC stranded", "PTFE paste-extrude + sinter", "SPC braid for low loss", "FEP jacket 200°C", "Thinner mil-spec alternative to RG-178"],
    apps: "Miniature high-temp RF, aerospace, instrumentation wiring", makers: "Harbour, Times, Micro-Coax" },
  rk5022: { name: "RK-50-2-11", cat: "rg-50", alias: "Russian GOST 11326 standard",
    z: 50, vp: 67, cap: 101, mass: 22, fMax: 1.0, vMax: 1800,
    d: 0.68, D: 2.20, shield: 2.80, OD: 4.00, flex: "medium", outdoor: false, power: "low", complexity: "medium",
    atten: [[100, 15.0], [400, 30.0], [900, 46.0], [1000, 48.0]],
    cons: { conductor: "7-strand Cu, 0.26mm", dielectric: "Solid PE", shield: "Tinned Cu braid", jacket: "Black PVC" },
    proc: ["Cu stranded bunch", "PE extrusion", "Tinned Cu braid", "PVC jacket", "Russian / CIS standard GOST 11326 — roughly RG-58 class"],
    apps: "Russian / CIS / Eastern European RF, legacy Soviet equipment", makers: "Kirskabel, Russkabel (RU), domestic" },
  hca158: { name: "HCA158-50", cat: "heliax", alias: "Andrew Hyperbend 1-5/8\"",
    z: 50, vp: 88, cap: 75, mass: 870, fMax: 2.3, vMax: 7500,
    d: 17.3, D: 45.0, shield: 47.5, OD: 50.0, flex: "medium", outdoor: true, power: "high", complexity: "high",
    atten: [[100, 0.51], [450, 1.15], [900, 1.66], [2000, 2.58], [2300, 2.81]],
    cons: { conductor: "Solid Cu, 17.3mm", dielectric: "Foam PE", shield: "Corrugated Cu tube (hyperbend geometry)", jacket: "Black UV PE" },
    proc: ["Large Cu draw", "Foam PE VP 88%", "Hyperbend corrugated Cu tube — tighter bend radius than LDF7", "Heavy PE jacket", "For tight installation spaces"],
    apps: "LDF7 replacement where bend radius is limited, urban rooftop cellular", makers: "CommScope (Andrew)" },
};

const CABLE_IDS = Object.keys(CABLES);

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
};

const CONNECTORS = {
  nType: { name: "N-type", cat: "rugged", alias: "MIL-C-39012, IEC 61169-16",
    z: 50, fMax: 11, maxPower: 1500, precisionFMax: 18,
    mate: "threaded", thread: "5/8-24 UNEF-2A", weatherproof: "variant (N-Wp)",
    sizeMm: 17, lengthMm: 32, massG: 25, cableOD: [5, 13],
    typicalIL: "<0.15 dB @ 11 GHz", typicalVSWR: "<1.2 @ 6 GHz",
    apps: "Cellular, broadcast, test, general outdoor 50Ω RF",
    pros: "Rugged, weatherproof variants, good power, ubiquitous",
    cons: "Larger than SMA, slow mate vs BNC, unsuitable for mmWave",
    typicalLoss: 0.15 },
  nType75: { name: "N-type 75Ω", cat: "rugged", alias: "N 75Ω variant",
    z: 75, fMax: 1.5, maxPower: 500, precisionFMax: 3,
    mate: "threaded", thread: "5/8-24 UNEF-2A", weatherproof: "variant",
    sizeMm: 17, lengthMm: 32, massG: 25, cableOD: [5, 13],
    typicalIL: "<0.2 dB @ 1 GHz", typicalVSWR: "<1.2 @ 1 GHz",
    apps: "Broadcast video, CATV trunk, satellite uplink",
    pros: "Rugged 75Ω option for long-run video",
    cons: "Mechanically identical to 50Ω N — easy to confuse",
    typicalLoss: 0.2 },
  tnc: { name: "TNC", cat: "rugged", alias: "Threaded Neill-Concelman",
    z: 50, fMax: 11, maxPower: 500,
    mate: "threaded", thread: "7/16-28 UNEF-2A", weatherproof: "variant",
    sizeMm: 12, lengthMm: 26, massG: 15, cableOD: [2.5, 6.5],
    typicalIL: "<0.15 dB @ 11 GHz", typicalVSWR: "<1.3 @ 6 GHz",
    apps: "GPS antenna, vibration-prone applications, handheld radios",
    pros: "Vibration-resistant (threaded BNC), smaller than N",
    cons: "Slower mate than BNC, less common than SMA/N",
    typicalLoss: 0.15 },
  sma: { name: "SMA", cat: "precision", alias: "SubMiniature A, MIL-C-39012",
    z: 50, fMax: 18, maxPower: 100, precisionFMax: 26.5,
    mate: "threaded", thread: "1/4-36 UNS-2A", weatherproof: "no",
    sizeMm: 8, lengthMm: 20, massG: 5, cableOD: [2, 7],
    typicalIL: "<0.2 dB @ 18 GHz", typicalVSWR: "<1.3 @ 18 GHz",
    apps: "Bench test, RF modules, small boards, GPS receivers",
    pros: "Compact, widely available, good freq range, precision variants to 26.5 GHz",
    cons: "Low power (<100W), requires torque wrench for repeatability, wears after ~500 cycles",
    typicalLoss: 0.2 },
  smaR: { name: "RP-SMA", cat: "precision", alias: "Reverse Polarity SMA",
    z: 50, fMax: 18, maxPower: 100,
    mate: "threaded", thread: "1/4-36 UNS-2A", weatherproof: "no",
    sizeMm: 8, lengthMm: 20, massG: 5, cableOD: [2, 7],
    typicalIL: "<0.2 dB @ 18 GHz", typicalVSWR: "<1.3 @ 18 GHz",
    apps: "Wi-Fi consumer gear (FCC Part 15 anti-swap)",
    pros: "Mandated for consumer Wi-Fi to prevent high-gain antenna swap",
    cons: "Gender is reversed (male has socket) — non-interchangeable with SMA",
    typicalLoss: 0.2 },
  bnc: { name: "BNC", cat: "bayonet", alias: "Bayonet Neill-Concelman",
    z: 50, fMax: 4, maxPower: 500,
    mate: "bayonet", thread: "none (quarter-turn bayonet lock)", weatherproof: "no",
    sizeMm: 14, lengthMm: 28, massG: 15, cableOD: [3, 7],
    typicalIL: "<0.2 dB @ 4 GHz", typicalVSWR: "<1.3 @ 1 GHz",
    apps: "Test / oscilloscope probes, video (75Ω variant), legacy Ethernet (10Base2)",
    pros: "Fast quarter-turn mate, ubiquitous on lab equipment",
    cons: "Limited to ~4 GHz, bayonet lock loosens with vibration, both 50Ω and 75Ω exist (confusing)",
    typicalLoss: 0.2 },
  bnc75: { name: "BNC 75Ω", cat: "bayonet", alias: "75Ω video BNC",
    z: 75, fMax: 4, maxPower: 300,
    mate: "bayonet", thread: "none (bayonet)", weatherproof: "no",
    sizeMm: 14, lengthMm: 28, massG: 15, cableOD: [3, 7],
    typicalIL: "<0.2 dB @ 3 GHz", typicalVSWR: "<1.3 @ 1 GHz",
    apps: "HD-SDI broadcast, precision 75Ω video",
    pros: "Same mechanical shape as 50Ω BNC but matched to 75Ω",
    cons: "Visually identical to 50Ω BNC — check impedance marking; mating with wrong impedance → reflections",
    typicalLoss: 0.2 },
  fType: { name: "F-type", cat: "consumer", alias: "CATV F connector",
    z: 75, fMax: 3, maxPower: 100,
    mate: "threaded", thread: "7/16-28 UNEF-2A", weatherproof: "poor",
    sizeMm: 10, lengthMm: 18, massG: 5, cableOD: [5, 7.5],
    typicalIL: "<0.3 dB @ 1 GHz", typicalVSWR: "<1.4 @ 1 GHz",
    apps: "Cable TV drop, satellite LNB, home consumer RF",
    pros: "Cheap, uses cable's center conductor as pin — no pin to damage",
    cons: "Limited freq + power, mediocre weatherproofing, ~1.4 VSWR typical",
    typicalLoss: 0.3 },
  uhf: { name: "UHF (PL-259)", cat: "consumer", alias: "SO-239 / PL-259, misnomer",
    z: 50, fMax: 0.3, maxPower: 2000,
    mate: "threaded", thread: "5/8-24 UNEF-2A", weatherproof: "poor",
    sizeMm: 20, lengthMm: 40, massG: 35, cableOD: [5, 12],
    typicalIL: "<0.2 dB @ 300 MHz", typicalVSWR: "typically >1.5 above 300 MHz",
    apps: "Ham radio HF/VHF (1.8-300 MHz), CB, marine",
    pros: "Rugged mechanical, cheap, handles high power",
    cons: "NOT actually UHF — impedance discontinuity, poor VSWR >300 MHz, name is historical misnomer",
    typicalLoss: 0.3 },
  din716: { name: "7/16 DIN", cat: "din", alias: "Low-PIM cellular tower",
    z: 50, fMax: 7.5, maxPower: 2500,
    mate: "threaded", thread: "M29 × 1.5", weatherproof: "yes (IP67)",
    sizeMm: 28, lengthMm: 53, massG: 150, cableOD: [9, 16],
    typicalIL: "<0.1 dB @ 6 GHz", typicalVSWR: "<1.1 @ 2 GHz", typicalPIM: "-160 dBc (low-PIM)",
    apps: "Cellular base stations (2G/3G/4G), broadcast, high-power low-PIM",
    pros: "Excellent low-PIM (<-160 dBc), high power, weatherproof, precision",
    cons: "Large and heavy, expensive, being replaced by 4.3-10 for new installs",
    typicalLoss: 0.1 },
  din43: { name: "4.3-10", cat: "din", alias: "Compact low-PIM",
    z: 50, fMax: 6, maxPower: 1500,
    mate: "screw / push-pull / hand-screw", thread: "M13 × 0.75 or push-pull", weatherproof: "yes (IP68)",
    sizeMm: 13, lengthMm: 28, massG: 40, cableOD: [5, 12],
    typicalIL: "<0.1 dB @ 4 GHz", typicalVSWR: "<1.15 @ 2 GHz", typicalPIM: "-165 dBc",
    apps: "New 4G/5G base station deployments, small-cell, replacing 7/16 DIN",
    pros: "Smaller + lighter than 7/16 DIN, same low-PIM performance, multiple mating options (screw/push-pull)",
    cons: "Newer ecosystem — less second-source availability than 7/16 DIN",
    typicalLoss: 0.1 },
  k292: { name: "2.92mm (K)", cat: "precision", alias: "K-type, Anritsu",
    z: 50, fMax: 40, maxPower: 40,
    mate: "threaded", thread: "1/4-36 UNS-2A", weatherproof: "no",
    sizeMm: 8, lengthMm: 20, massG: 5, cableOD: [2, 5],
    typicalIL: "<0.3 dB @ 26 GHz", typicalVSWR: "<1.25 @ 26 GHz",
    apps: "mmWave test (Ka-band), 5G FR2 development, phased-array characterization",
    pros: "Mates with SMA mechanically (not recommended at high freq), 40 GHz bandwidth",
    cons: "Precision only — torque critical, easily damaged by over-tightening, expensive",
    typicalLoss: 0.3 },
  conn24: { name: "2.4mm", cat: "precision", alias: "50 GHz precision",
    z: 50, fMax: 50, maxPower: 20,
    mate: "threaded", thread: "M8 × 0.75", weatherproof: "no",
    sizeMm: 7, lengthMm: 18, massG: 4, cableOD: [2, 4],
    typicalIL: "<0.4 dB @ 40 GHz", typicalVSWR: "<1.25 @ 40 GHz",
    apps: "V-band VNA test, high-end 5G / satellite / radar mmWave",
    pros: "50 GHz bandwidth, mates with 1.85mm, precision lab-grade",
    cons: "Very low power, expensive, delicate — only for test / calibration use",
    typicalLoss: 0.4 },
  conn185: { name: "1.85mm (V)", cat: "precision", alias: "V-connector, Anritsu",
    z: 50, fMax: 67, maxPower: 10,
    mate: "threaded", thread: "M7 × 0.75", weatherproof: "no",
    sizeMm: 6, lengthMm: 16, massG: 3, cableOD: [2, 3.5],
    typicalIL: "<0.5 dB @ 50 GHz", typicalVSWR: "<1.3 @ 50 GHz",
    apps: "W-band VNA test, 67 GHz instrumentation, 5G FR2+ R&D",
    pros: "67 GHz bandwidth, mates with 2.4mm",
    cons: "Extremely low power (~10W), very delicate, precision torque required",
    typicalLoss: 0.5 },
  conn10: { name: "1.0mm (W)", cat: "precision", alias: "110 GHz precision",
    z: 50, fMax: 110, maxPower: 5,
    mate: "threaded", thread: "M3 × 0.25", weatherproof: "no",
    sizeMm: 4, lengthMm: 10, massG: 2, cableOD: [1, 2.5],
    typicalIL: "<0.8 dB @ 110 GHz", typicalVSWR: "<1.4 @ 110 GHz",
    apps: "Ultra-high-freq research, automotive radar 77-81 GHz, 6G / sub-THz",
    pros: "110 GHz bandwidth — state-of-the-art",
    cons: "Tiny, fragile, ~$500-1000 per connector, short life (~100 cycles)",
    typicalLoss: 0.8 },
  mcx: { name: "MCX", cat: "miniature", alias: "Micro Coax push-on",
    z: 50, fMax: 6, maxPower: 100,
    mate: "push-on snap", thread: "none (snap-lock)", weatherproof: "no",
    sizeMm: 5, lengthMm: 10, massG: 1.5, cableOD: [2, 4],
    typicalIL: "<0.2 dB @ 6 GHz", typicalVSWR: "<1.3 @ 4 GHz",
    apps: "GPS modules, compact board-level RF, handheld devices",
    pros: "Snap-on (no rotation), very small, fast mate",
    cons: "Limited power, loosens with vibration, not for outdoor",
    typicalLoss: 0.2 },
  mmcx: { name: "MMCX", cat: "miniature", alias: "Micro-Miniature Coax",
    z: 50, fMax: 6, maxPower: 50,
    mate: "push-on snap", thread: "none", weatherproof: "no",
    sizeMm: 3.5, lengthMm: 8, massG: 0.8, cableOD: [1.5, 3],
    typicalIL: "<0.2 dB @ 6 GHz", typicalVSWR: "<1.3 @ 4 GHz",
    apps: "Very tight spaces, HDD / SSD antennas, wearables, IoT modules",
    pros: "Tiniest snap connector widely used, 360° rotation after mate",
    cons: "Very low power, fragile, easy to damage during mate",
    typicalLoss: 0.2 },
  smb: { name: "SMB", cat: "miniature", alias: "SubMiniature B",
    z: 50, fMax: 4, maxPower: 100,
    mate: "push-on snap", thread: "none", weatherproof: "no",
    sizeMm: 5, lengthMm: 11, massG: 1.8, cableOD: [2, 4],
    typicalIL: "<0.3 dB @ 4 GHz", typicalVSWR: "<1.4 @ 2 GHz",
    apps: "Automotive (pre-FAKRA), industrial, modems",
    pros: "Push-on snap, cheaper than MCX, reliable mate",
    cons: "Lower freq ceiling than MCX (4 vs 6 GHz), becoming obsolete",
    typicalLoss: 0.3 },
  smp: { name: "SMP (GPO)", cat: "miniature", alias: "Board-level mmWave",
    z: 50, fMax: 40, maxPower: 50,
    mate: "blind-mate push-on", thread: "none (snap)", weatherproof: "no",
    sizeMm: 4, lengthMm: 9, massG: 1, cableOD: [1.5, 3],
    typicalIL: "<0.3 dB @ 40 GHz", typicalVSWR: "<1.3 @ 26 GHz",
    apps: "mmWave modules, T/R modules, phased array board-level interconnect",
    pros: "Blind-mate (PCB-to-PCB), 40 GHz in tiny form factor",
    cons: "Board-level only, not meant for field mate, mechanical tolerance critical",
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

const SYSTEM_PROMPT = `You are a senior RF cable engineer with 15+ years of experience in both design and field troubleshooting. You have access to a ${CABLE_IDS.length}-cable production database and 12 computational tools.

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
  const [comparedCables, setComparedCables] = useState(() => {
    try { const s = localStorage.getItem("rf-compared"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("rf-compared", JSON.stringify(comparedCables)); } catch {} }, [comparedCables]);
  const toggleCompare = (id) => setComparedCables(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev);
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try { return localStorage.getItem("rf-tts") === "1"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem("rf-tts", ttsEnabled ? "1" : "0"); } catch {} }, [ttsEnabled]);
  const [model, setModel] = useState(() => {
    try { return localStorage.getItem("rf-model") || "claude-sonnet-4-6"; } catch { return "claude-sonnet-4-6"; }
  });
  useEffect(() => { try { localStorage.setItem("rf-model", model); } catch {} }, [model]);

  const settingsCtx = { units, setUnits, showTools, setShowTools, ttsEnabled, setTtsEnabled, model, setModel };

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
              {[["ask", "Ask"], ["design", "Design"], ["library", "Library"], ["connectors", "Connectors"], ["wizard", "Wizard"], ["compare", `Compare${comparedCables.length ? ` (${comparedCables.length})` : ""}`]].map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} style={{ ...S.navBtn, ...(tab === k ? S.navBtnActive : {}), ...(k === "compare" && comparedCables.length > 0 ? { borderColor: "#d97706", color: "#fbbf24" } : {}) }}>{label}</button>
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
          {tab === "library" && <LibraryView activeCable={activeCable} loadIntoDesign={loadCableIntoDesign} askAboutCable={askAboutCable} setActiveCable={setActiveCable} comparedCables={comparedCables} toggleCompare={toggleCompare} />}
          {tab === "connectors" && <ConnectorView />}
          {tab === "wizard" && <WizardView openInLibrary={openInLibrary} toggleCompare={toggleCompare} comparedCables={comparedCables} />}
          {tab === "compare" && <CompareView comparedCables={comparedCables} setComparedCables={setComparedCables} openInLibrary={openInLibrary} />}
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

function AskView({ queuedPrompt, clearQueued, openInLibrary, loadIntoDesign }) {
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
    const callApi = async (messagesPayload) => {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 8000, system: SYSTEM_PROMPT, messages: messagesPayload, tools: TOOLS }),
      });
      if (!res.ok) {
        let detail = "";
        try { const body = await res.json(); detail = body?.error?.message || body?.error || JSON.stringify(body); }
        catch { try { detail = await res.text(); } catch {} }
        const err = new Error(`API error ${res.status}: ${detail}`.trim());
        err.status = res.status;
        err.payload = messagesPayload;
        throw err;
      }
      return res.json();
    };
    try {
      let api = sanitizeHistory(newMessages);
      let recoveredFromBadHistory = false;
      for (let i = 0; i < 10; i++) {
        let data;
        try {
          data = await callApi(api);
        } catch (e) {
          if (e.status === 400 && !recoveredFromBadHistory && i === 0) {
            console.warn("[chat] 400 on first turn — retrying with cleared history:", e.message, e.payload);
            recoveredFromBadHistory = true;
            api = [freshUser];
            setMessages([freshUser]);
            data = await callApi(api);
          } else { throw e; }
        }
        api.push({ role: "assistant", content: data.content });
        setMessages(prev => [...prev.filter(m => m.role !== "assistant_pending"), { role: "assistant", content: data.content }]);
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
          <strong style={S.viewIntroStrong}>Ask mode.</strong> Senior RF engineer agent with 12 tools for lookup, calculation, and validation.
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
        {messages.map((m, i) => <ChatMessage key={i} message={m} showTools={showTools} openInLibrary={openInLibrary} loadIntoDesign={loadIntoDesign} />)}
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

function ChatMessage({ message: m, showTools, openInLibrary, loadIntoDesign }) {
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
function LibraryView({ activeCable, loadIntoDesign, askAboutCable, setActiveCable, comparedCables, toggleCompare }) {
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
            onDesign={() => loadIntoDesign(id)} onAsk={() => askAboutCable(id)}
            compared={comparedCables?.includes(id)} toggleCompare={toggleCompare} />
        ))}
        {filtered.length === 0 && <div style={S.emptyState}>No cables match filters. Try relaxing criteria.</div>}
      </div>
    </div>
  );
}

function CableCard({ id, cable: c, expanded, onToggle, onDesign, onAsk, compared, toggleCompare }) {
  const { units } = useContext(SettingsContext);
  const cat = CATEGORIES[c.cat];
  const cxColor = { low: "#34d399", medium: "#fbbf24", high: "#ef4444" }[c.complexity];
  const cxLabel = { low: "Simple", medium: "Moderate", high: "Complex" }[c.complexity];

  const [buildStep, setBuildStep] = useState(4);
  const [selectedLayer, setSelectedLayer] = useState(null);
  const [hoveredLayer, setHoveredLayer] = useState(null);
  const [expandedStep, setExpandedStep] = useState(null);

  useEffect(() => {
    if (expanded) { setBuildStep(0); setSelectedLayer(null); setExpandedStep(null); }
  }, [expanded]);

  useEffect(() => {
    if (expanded && buildStep < 4) {
      const t = setTimeout(() => setBuildStep(s => s + 1), 750);
      return () => clearTimeout(t);
    }
  }, [buildStep, expanded]);

  const replay = (e) => { e.stopPropagation(); setBuildStep(0); setSelectedLayer(null); };

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
            {c.alias && <div style={S.cableAlias}>{wrapTerms(c.alias)}</div>}
            <div style={S.cableApps}>{wrapTerms(c.apps)}</div>
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
            {toggleCompare && <button onClick={(e) => { e.stopPropagation(); toggleCompare(id); }} style={{ ...S.actionBtn, ...(compared ? { background: "rgba(52,211,153,0.15)", color: "#34d399", borderColor: "#10b981" } : S.actionBtnSecondary) }}>{compared ? "✓ In compare" : "+ Add to compare"}</button>}
          </div>
          <div style={{ padding: "14px 0 18px", borderBottom: "1px solid rgba(217,119,6,0.12)", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 8 }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "#a8a29e", textTransform: "uppercase" }}>Cross-Section · Click layer to inspect</div>
              <button onClick={replay} style={{ background: "rgba(217,119,6,0.15)", color: "#fbbf24", border: "1px solid #d97706", padding: "3px 10px", fontSize: 9, letterSpacing: 1, cursor: "pointer", borderRadius: 3, textTransform: "uppercase", fontWeight: 600 }}>↻ Replay build</button>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
              <CrossSection d={c.d} D={c.D} shield={c.shield} jacket={c.OD} units={units} cons={c.cons} buildStep={buildStep} selectedLayer={selectedLayer} hoveredLayer={hoveredLayer} onLayerClick={setSelectedLayer} onLayerHover={setHoveredLayer} />
              {selectedLayer && <LayerDetailPanel layer={selectedLayer} c={c} onClose={() => setSelectedLayer(null)} units={units} />}
            </div>
          </div>
          <div style={{ padding: "4px 0 16px", borderBottom: "1px solid rgba(217,119,6,0.12)", marginBottom: 14 }}>
            <div style={{ textAlign: "center", fontSize: 10, letterSpacing: 2, color: "#a8a29e", marginBottom: 10, textTransform: "uppercase" }}>Signal Flow · Live link-budget simulator</div>
            <SignalFlow cable={c} />
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
                <Layer n="3" name="Shield" color="#9ca3af" desc={c.cons.shield} />
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
        </div>
      )}
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
                  <ConnectorIcon cat={c.cat} color={cat.color} />
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
  const info = LAYER_INFO[layer];
  const dims = {
    conductor: { label: "Inner conductor d", mm: c.d },
    dielectric: { label: "Dielectric OD", mm: c.D },
    shield: { label: "Shield OD", mm: c.shield },
    jacket: { label: "Jacket OD", mm: c.OD },
  }[layer];
  const matColor = { conductor: "#fbbf24", dielectric: "#fde68a", shield: "#9ca3af", jacket: "#a8a29e" }[layer];
  return (
    <div style={{ flex: 1, minWidth: 240, padding: 14, background: "rgba(15,10,5,0.55)", border: `1px solid ${matColor}33`, borderRadius: 4, fontSize: 10.5, lineHeight: 1.55 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${matColor}22` }}>
        <div style={{ color: matColor, fontSize: 10, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase" }}>{layer}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#a8a29e", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ color: "#e7e5e4", fontWeight: 600, marginBottom: 4 }}>{wrapTerms(c.cons[layer])}</div>
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

function SignalFlow({ cable }) {
  const [length, setLength] = useState(10);
  const [freq, setFreq] = useState(900);
  const [txPower, setTxPower] = useState(20);
  const [rxSens, setRxSens] = useState(-85);

  const attenPer100m = interpAtten(cable.atten, freq);
  const totalLoss = attenPer100m * length / 100;
  const rxPower = txPower - totalLoss;
  const margin = rxPower - rxSens;
  const ok = margin > 0;

  const W = 720, H = 150;
  const cableX1 = 80, cableX2 = W - 80;
  const cableY = H / 2;
  const pulseDur = Math.max(1.5, Math.min(4, length / 3));

  const Pulse = ({ delay }) => (
    <g>
      <circle cy={cableY} r="9" fill="#fbbf24">
        <animate attributeName="cx" values={`${cableX1};${cableX2}`} dur={`${pulseDur}s`} repeatCount="indefinite" begin={`${delay}s`} />
        <animate attributeName="r" values={`10;${ok ? 4 : 2}`} dur={`${pulseDur}s`} repeatCount="indefinite" begin={`${delay}s`} />
        <animate attributeName="opacity" values={`0.95;${ok ? 0.35 : 0.1}`} dur={`${pulseDur}s`} repeatCount="indefinite" begin={`${delay}s`} />
      </circle>
      <circle cy={cableY} r="14" fill="none" stroke="#fbbf24" strokeWidth="1" opacity="0.5">
        <animate attributeName="cx" values={`${cableX1};${cableX2}`} dur={`${pulseDur}s`} repeatCount="indefinite" begin={`${delay}s`} />
        <animate attributeName="r" values={`16;${ok ? 6 : 3}`} dur={`${pulseDur}s`} repeatCount="indefinite" begin={`${delay}s`} />
        <animate attributeName="opacity" values={`0.6;0`} dur={`${pulseDur}s`} repeatCount="indefinite" begin={`${delay}s`} />
      </circle>
    </g>
  );

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
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }} onClick={(e) => e.stopPropagation()}>
        <Ctrl label="TX power" val={txPower} set={setTxPower} min={0} max={40} unit=" dBm" />
        <Ctrl label="Length" val={length} set={setLength} min={1} max={100} unit=" m" />
        <Ctrl label="Frequency" val={freq} set={setFreq} min={10} max={Math.round(cable.fMax * 1000)} unit=" MHz" />
        <Ctrl label="RX sensitivity" val={rxSens} set={setRxSens} min={-120} max={-30} unit=" dBm" />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", background: "rgba(15,10,5,0.35)", borderRadius: 3 }}>
        <defs>
          <linearGradient id="cable-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity={ok ? 0.3 : 0.1} />
          </linearGradient>
        </defs>
        <rect x={10} y={cableY - 28} width={70} height={56} fill="#1f1611" stroke="#d97706" strokeWidth="1.5" rx="3" />
        <text x={45} y={cableY - 10} fontSize="10" fill="#fbbf24" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight="700">TX</text>
        <text x={45} y={cableY + 5} fontSize="8.5" fill="#fbbf24" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{txPower.toFixed(0)} dBm</text>
        <text x={45} y={cableY + 18} fontSize="7" fill="#a8a29e" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{(10 ** (txPower / 10)).toFixed(0)} mW</text>

        <line x1={cableX1} y1={cableY} x2={cableX2} y2={cableY} stroke="#2a2520" strokeWidth="10" strokeLinecap="round" />
        <line x1={cableX1} y1={cableY} x2={cableX2} y2={cableY} stroke="url(#cable-grad)" strokeWidth="4" strokeLinecap="round" />

        <Pulse delay={0} />
        <Pulse delay={pulseDur * 0.33} />
        <Pulse delay={pulseDur * 0.66} />

        <rect x={W - 80} y={cableY - 28} width={70} height={56} fill="#1f1611" stroke={ok ? "#34d399" : "#ef4444"} strokeWidth="1.5" rx="3" />
        <text x={W - 45} y={cableY - 10} fontSize="10" fill={ok ? "#34d399" : "#ef4444"} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight="700">RX</text>
        <text x={W - 45} y={cableY + 5} fontSize="8.5" fill={ok ? "#34d399" : "#ef4444"} textAnchor="middle" fontFamily="JetBrains Mono, monospace">{rxPower.toFixed(1)} dBm</text>
        <text x={W - 45} y={cableY + 18} fontSize="7" fill="#a8a29e" textAnchor="middle" fontFamily="JetBrains Mono, monospace">sens: {rxSens} dBm</text>

        <text x={W / 2} y={cableY - 22} fontSize="9" fill="#a8a29e" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{cable.name} · {length} m · {freq < 1000 ? `${freq} MHz` : `${(freq / 1000).toFixed(2)} GHz`}</text>
        <text x={W / 2} y={cableY + 28} fontSize="10" fill="#fbbf24" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight="700">Loss: {totalLoss.toFixed(2)} dB ({attenPer100m.toFixed(2)} dB/100m)</text>
      </svg>
      <PowerSummary txPower={txPower} rxPower={rxPower} totalLoss={totalLoss} margin={margin} cable={cable} length={length} freq={freq} />
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

function PowerSummary({ txPower, rxPower, totalLoss, margin, cable, length, freq }) {
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

function CrossSection({ d, D, shield, jacket, units, cons, buildStep = 4, selectedLayer, hoveredLayer, onLayerClick, onLayerHover }) {
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
      <circle cx={cx} cy={cy} r={r_jk} fill="url(#jk-grad)" stroke={hoveredLayer === "jacket" || selectedLayer === "jacket" ? "#a8a29e" : "#2a1f15"} strokeWidth={hoveredLayer === "jacket" || selectedLayer === "jacket" ? 2 : 1} style={{ color: "#a8a29e", ...layerStyle("jacket", 4) }} {...handlers("jacket")} />
      <circle cx={cx} cy={cy} r={r_sh} fill="url(#braid-p)" stroke={hoveredLayer === "shield" || selectedLayer === "shield" ? "#d1d5db" : "#6b7280"} strokeWidth={hoveredLayer === "shield" || selectedLayer === "shield" ? 1.5 : 0.4} style={{ color: "#9ca3af", ...layerStyle("shield", 3) }} {...handlers("shield")} />
      <circle cx={cx} cy={cy} r={r_dx} fill="rgba(255,250,235,0.14)" stroke={hoveredLayer === "dielectric" || selectedLayer === "dielectric" ? "#fde68a" : "rgba(217,119,6,0.4)"} strokeWidth={hoveredLayer === "dielectric" || selectedLayer === "dielectric" ? 1.5 : 0.5} style={{ color: "#fde68a", ...layerStyle("dielectric", 2) }} {...handlers("dielectric")} />

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
const QS = ({ label, v }) => (<div style={{ textAlign: "right", minWidth: 40 }}><div style={{ fontSize: 8, color: "#78716c", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div><div style={{ fontSize: 11, color: "#fbbf24" }}>{v}</div></div>);
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
