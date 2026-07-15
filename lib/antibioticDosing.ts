// Renal-dose antibiotic engine.
// Ported faithfully from Shan's "Antibiotic Dosing Chart" workbook (Dosing Sheet).
// All dosing is driven by a single creatinine clearance value (mL/min) or "HD".
//
// Two layers:
//   1. Beta-lactam / fluoroquinolone / carbapenem CrCl-threshold lookups
//      (Cefepime, Levofloxacin, Meropenem, Piperacillin-tazobactam).
//   2. Aminoglycoside one-compartment PK engine (Amikacin, Tobramycin/Gentamicin):
//        ke = CrCl*0.00293 + 0.014
//        loading  = (Vd*Peak*ke*tInf)/(1-e^(-ke*tInf)) * AdjBW
//        interval = ln(Peak/Trough)/ke + tInf + 0.5, then a rounding nomogram
//        maint    = Vd*Peak*ke*tInf * (1-e^(-ke*int))/(1-e^(-ke*tInf)) * AdjBW
//
// NOT a substitute for clinical judgment. Intervals for the beta-lactam lookups
// follow institutional protocol; the workbook returns the dose amount only.

export type CrClValue = number | "HD";

const mround = (x: number, m: number) => Math.round(x / m) * m;

// ─────────────────────────────────────────────────────────────
//  Beta-lactam / FQ / carbapenem lookups
// ─────────────────────────────────────────────────────────────

export interface DoseRow {
  indication: string;
  dose: string;
}

export interface DrugLookup {
  drug: string;
  note?: string;
  rows: DoseRow[];
}

const isHD = (c: CrClValue): c is "HD" => c === "HD";

export function cefepime(c: CrClValue): DrugLookup {
  const standard = (): string => {
    if (isHD(c)) return "1 g";
    if (c < 11) return "1 g on day 1, then 0.5 g";
    if (c < 30) return "1 g";
    return "2 g";
  };
  const febrileNeutropenia = (): string => {
    if (isHD(c)) return "1 g";
    if (c < 11) return "1 g";
    return "2 g";
  };
  return {
    drug: "Cefepime (Maxipime)",
    note: "Interval per protocol (commonly q8–12h). Febrile neutropenia typically q8h.",
    rows: [
      { indication: "Standard / ANC ≥ 1,500", dose: standard() },
      { indication: "Febrile neutropenia / ANC < 1,500", dose: febrileNeutropenia() },
    ],
  };
}

export function levofloxacin(c: CrClValue): DrugLookup {
  const high = (): string => {
    if (isHD(c)) return "750 mg on day 1, then 500 mg";
    if (c <= 19) return "750 mg on day 1, then 500 mg";
    return "750 mg";
  };
  const low = (): string => {
    if (isHD(c)) return "500 mg on day 1, then 250 mg";
    if (c <= 49) return "500 mg on day 1, then 250 mg";
    return "500 mg";
  };
  return {
    drug: "Levofloxacin (Levaquin)",
    note: "Dosed once daily.",
    rows: [
      {
        indication:
          "Intra-abdominal, HCAP, cellulitis, UTI/pyelonephritis, CAP/COPD, unknown",
        dose: high(),
      },
      { indication: "Bronchitis, prostatitis, urethritis", dose: low() },
    ],
  };
}

export function meropenem(c: CrClValue): DrugLookup {
  const standard = (): string => "500 mg"; // workbook holds dose flat; renal adjust by interval
  const meningitis = (): string => {
    if (isHD(c)) return "1 g";
    if (c <= 25) return "1 g";
    return "2 g";
  };
  return {
    drug: "Meropenem (Merrem)",
    note: "Interval per protocol (commonly q8h; extend for reduced CrCl).",
    rows: [
      { indication: "Standard / all other indications", dose: standard() },
      { indication: "Meningitis", dose: meningitis() },
    ],
  };
}

export function pipTazo(c: CrClValue): DrugLookup {
  const pseudomonal = (): string => {
    if (isHD(c)) return "2.25 g";
    if (c < 20) return "2.25 g";
    if (c <= 40) return "3.375 g";
    return "4.5 g";
  };
  const other = (): string => {
    if (isHD(c)) return "2.25 g";
    if (c < 20) return "2.25 g";
    if (c <= 40) return "2.25 g";
    return "3.375 g";
  };
  return {
    drug: "Piperacillin-tazobactam (Zosyn)",
    note: "Extended-infusion q8h per protocol.",
    rows: [
      { indication: "HCAP / pseudomonal coverage / unknown", dose: pseudomonal() },
      { indication: "All other indications", dose: other() },
    ],
  };
}

export function betaLactamDosing(c: CrClValue): DrugLookup[] {
  return [cefepime(c), levofloxacin(c), meropenem(c), pipTazo(c)];
}

// ─────────────────────────────────────────────────────────────
//  Aminoglycoside PK engine
// ─────────────────────────────────────────────────────────────

export interface AminoglycosideGoal {
  label: string;
  peak: number;   // target peak (mcg/mL)
  trough: number; // target trough (mcg/mL)
  vd: number;     // volume of distribution (L/kg)
  tInf: number;   // infusion time (hr)
}

export interface TraditionalResult {
  label: string;
  peak: number;
  trough: number;
  ke: number;
  halfLife: number;
  loadingDose: number;
  calcInterval: number;
  roundedInterval: number | null; // null = beyond nomogram → redose by level
  maintDose: number | null;
  finalDose: string;
}

export interface ExtendedResult {
  label: string;
  dose: number;
}

export interface AminoglycosideResult {
  drug: string;
  hd: boolean;
  adjBwKg: number;
  traditional: TraditionalResult[];
  extended: ExtendedResult[];
}

type IntervalNomogram = (calc: number) => number | null;

// Amikacin: <10→8, <15→12, <20→18, <30→24, <42→36, <50→48, else redose by level
const amikacinNomogram: IntervalNomogram = (v) =>
  v < 10 ? 8 : v < 15 ? 12 : v < 20 ? 18 : v < 30 ? 24 : v < 42 ? 36 : v < 50 ? 48 : null;

// Tobramycin/Gentamicin: <7→6, <10→8, <16→12, <20→18, <30→24, <42→36, <50→48, else level
const tobramycinNomogram: IntervalNomogram = (v) =>
  v < 7 ? 6 : v < 10 ? 8 : v < 16 ? 12 : v < 20 ? 18 : v < 30 ? 24 : v < 42 ? 36 : v < 50 ? 48 : null;

function traditionalDose(
  crcl: number,
  adjBw: number,
  goal: AminoglycosideGoal,
  roundStep: number,
  nomogram: IntervalNomogram
): TraditionalResult {
  const ke = crcl * 0.00293 + 0.014;
  const halfLife = 0.693 / ke;
  const loadingRaw =
    ((goal.vd * goal.peak * ke * goal.tInf) / (1 - Math.exp(-ke * goal.tInf))) * adjBw;
  const loadingDose = mround(loadingRaw, roundStep);
  const calcInterval = Math.log(goal.peak / goal.trough) / ke + goal.tInf + 0.5;
  const roundedInterval = nomogram(calcInterval);

  let maintDose: number | null = null;
  let finalDose: string;
  if (roundedInterval !== null) {
    const maintRaw =
      goal.vd *
      goal.peak *
      ke *
      goal.tInf *
      ((1 - Math.exp(-ke * roundedInterval)) / (1 - Math.exp(-ke * goal.tInf))) *
      adjBw;
    maintDose = mround(maintRaw, roundStep);
    finalDose =
      maintDose + 5 >= loadingDose
        ? `${maintDose} mg every ${roundedInterval} h`
        : `${loadingDose} mg x1, then ${maintDose} mg every ${roundedInterval} h`;
  } else {
    finalDose = `${loadingDose} mg x1, then redose by level`;
  }

  return {
    label: goal.label,
    peak: goal.peak,
    trough: goal.trough,
    ke,
    halfLife,
    loadingDose,
    calcInterval,
    roundedInterval,
    maintDose,
    finalDose,
  };
}

const AMIKACIN_GOALS: AminoglycosideGoal[] = [
  { label: "Standard", peak: 35, trough: 6, vd: 0.25, tInf: 1 },
  { label: "Pregnancy", peak: 25, trough: 4, vd: 0.35, tInf: 1 },
];

const TOBRAMYCIN_GOALS: AminoglycosideGoal[] = [
  { label: "GNR endocarditis, meningitis, pseudomonal pneumonia", peak: 10, trough: 1, vd: 0.28, tInf: 1 },
  { label: "Neutropenia, intra-abdominal, bacteremia, cellulitis, pneumonia", peak: 8, trough: 1, vd: 0.28, tInf: 1 },
  { label: "UTI", peak: 6, trough: 1, vd: 0.28, tInf: 1 },
  { label: "Synergy", peak: 5, trough: 1, vd: 0.28, tInf: 1 },
  { label: "Pregnancy", peak: 8, trough: 1, vd: 0.35, tInf: 1 },
];

export function amikacin(c: CrClValue, adjBw: number): AminoglycosideResult {
  if (isHD(c)) {
    return { drug: "Amikacin", hd: true, adjBwKg: adjBw, traditional: [], extended: [] };
  }
  return {
    drug: "Amikacin",
    hd: false,
    adjBwKg: adjBw,
    traditional: AMIKACIN_GOALS.map((g) => traditionalDose(c, adjBw, g, 25, amikacinNomogram)),
    extended: [
      { label: "Extended interval 7.5 mg/kg", dose: mround(adjBw * 7.5, 25) },
      { label: "Extended interval 15 mg/kg", dose: mround(adjBw * 15, 25) },
    ],
  };
}

export function tobramycin(c: CrClValue, adjBw: number): AminoglycosideResult {
  if (isHD(c)) {
    return {
      drug: "Tobramycin / Gentamicin",
      hd: true,
      adjBwKg: adjBw,
      traditional: [],
      extended: [],
    };
  }
  return {
    drug: "Tobramycin / Gentamicin",
    hd: false,
    adjBwKg: adjBw,
    traditional: TOBRAMYCIN_GOALS.map((g) => traditionalDose(c, adjBw, g, 5, tobramycinNomogram)),
    extended: [
      { label: "Extended interval 5 mg/kg", dose: mround(adjBw * 5, 10) },
      { label: "Extended interval 7 mg/kg", dose: mround(adjBw * 7, 10) },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
//  Weight helpers (matches workbook: AdjBW = IBW + 0.4*(TBW-IBW),
//  or TBW when IBW exceeds TBW)
// ─────────────────────────────────────────────────────────────

export function idealBodyWeightKg(sex: "male" | "female", heightCm: number): number {
  const heightIn = heightCm / 2.54;
  return (sex === "male" ? 50 : 45.5) + 2.3 * (heightIn - 60);
}

export function adjustedBodyWeightKg(
  sex: "male" | "female",
  heightCm: number,
  weightKg: number
): number {
  const ibw = idealBodyWeightKg(sex, heightCm);
  return ibw > weightKg ? weightKg : ibw + 0.4 * (weightKg - ibw);
}
