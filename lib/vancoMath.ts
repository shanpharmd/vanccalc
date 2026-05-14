// Vancomycin population PK engine.
// References: ASHP/IDSA 2020 Vancomycin Guideline; Matzke et al.; Crass et al.
// Method: one-compartment, first-order elimination, intermittent infusion at steady state.
// AUC24-based dosing is the consensus target (AUC24/MIC 400-600, MIC=1).

import type {
  NormalizedPatient,
  PKParams,
  DoseRegimen,
  RegimenResult,
  TargetRange,
  SimulationPoint,
} from "./types";

// ---------- body size ----------

export function ibwKg(p: NormalizedPatient): number {
  // Devine formula. Use height in inches.
  const heightIn = p.heightCm / 2.54;
  const base = p.sex === "male" ? 50 : 45.5;
  const above60 = Math.max(0, heightIn - 60);
  return base + 2.3 * above60;
}

export function adjBwKg(p: NormalizedPatient): number {
  const ibw = ibwKg(p);
  // If TBW > 120% IBW use AdjBW = IBW + 0.4 × (TBW - IBW)
  return p.weightKg > 1.2 * ibw ? ibw + 0.4 * (p.weightKg - ibw) : p.weightKg;
}

export function bmi(p: NormalizedPatient): number {
  const m = p.heightCm / 100;
  return p.weightKg / (m * m);
}

// ---------- renal function ----------

export function crClCockcroftGault(p: NormalizedPatient): number {
  // Use IBW if TBW > IBW, else TBW (avoid overestimating CrCl in underweight)
  const ibw = ibwKg(p);
  const weightForCG = p.weightKg > 1.2 * ibw ? adjBwKg(p) : Math.min(p.weightKg, ibw);
  const sexFactor = p.sex === "female" ? 0.85 : 1;
  const crCl = ((140 - p.age) * weightForCG) / (72 * p.scrMgDl) * sexFactor;
  return Math.max(crCl, 5); // floor to avoid div-by-zero in downstream calcs
}

// ---------- PK params ----------

export function pkParams(p: NormalizedPatient): PKParams {
  const crCl = crClCockcroftGault(p);
  // Matzke et al. ke (1/hr) from CrCl (mL/min)
  // ke = 0.00083 × CrCl + 0.0044
  const ke = 0.00083 * crCl + 0.0044;
  const vdPerKg = p.criticallyIll ? 0.8 : 0.7; // ICU patients have larger Vd
  const vd = vdPerKg * p.weightKg;
  const cl = ke * vd;
  const halfLife = 0.693 / ke;

  return {
    crCl,
    vd,
    vdPerKg,
    ke,
    halfLife,
    cl,
    ibw: ibwKg(p),
    adjBw: adjBwKg(p),
    bmi: bmi(p),
  };
}

// ---------- concentration math (intermittent infusion, steady state) ----------

export function ssPeak(dose: number, tInf: number, tau: number, pk: PKParams): number {
  // Cmax,ss at end of infusion
  // Cmax = (D / (tInf × CL)) × (1 − e^(−ke·tInf)) / (1 − e^(−ke·tau))
  const num = 1 - Math.exp(-pk.ke * tInf);
  const den = 1 - Math.exp(-pk.ke * tau);
  return (dose / (tInf * pk.cl)) * (num / den);
}

export function ssTrough(cmax: number, tInf: number, tau: number, pk: PKParams): number {
  return cmax * Math.exp(-pk.ke * (tau - tInf));
}

// AUC24 at steady state for intermittent infusion = daily dose / CL
export function auc24FromDose(dose: number, tau: number, pk: PKParams): number {
  const dosesPerDay = 24 / tau;
  return (dose * dosesPerDay) / pk.cl;
}

// ---------- dose recommendation ----------

export interface RecommendOpts {
  target: TargetRange;
  frequency?: number;       // hours; if omitted we pick based on t1/2
  infusionTime?: number;    // hours; default 1.5h (or 2h if dose ≥ 1500mg per max rate)
  roundTo?: number;         // mg; default 250
  loadingDoseCapMg?: number; // default 3000
}

const DEFAULT_TARGET: TargetRange = { aucMin: 400, aucMax: 600, mic: 1 };

export function pickFrequency(pk: PKParams): number {
  // Heuristic by t1/2: shorter half-life → more frequent
  if (pk.halfLife < 6) return 8;
  if (pk.halfLife < 10) return 12;
  if (pk.halfLife < 18) return 24;
  if (pk.halfLife < 30) return 36;
  return 48;
}

export function infusionTimeFor(dose: number): number {
  // Max infusion rate 1000 mg/hr per ASHP
  const minHours = Math.max(1, dose / 1000);
  // Round up to nearest 0.5 hr, baseline 1.5
  return Math.max(1.5, Math.ceil(minHours * 2) / 2);
}

export function roundDose(mg: number, step = 250): number {
  return Math.round(mg / step) * step;
}

export function recommendRegimen(
  pk: PKParams,
  weightKg: number,
  opts: Partial<RecommendOpts> = {}
): { regimen: DoseRegimen; result: RegimenResult } {
  const target = opts.target ?? DEFAULT_TARGET;
  const tau = opts.frequency ?? pickFrequency(pk);
  const aucMid = (target.aucMin + target.aucMax) / 2;
  const dailyDose = aucMid * pk.cl;             // mg/day to hit mid-AUC
  const perDose = dailyDose / (24 / tau);
  // mg/kg sanity cap: 15-20 mg/kg per dose typical; 35 mg/kg max for loading
  const capped = Math.min(perDose, 35 * weightKg);
  const dose = roundDose(capped, opts.roundTo ?? 250);
  const tInf = opts.infusionTime ?? infusionTimeFor(dose);

  const regimen: DoseRegimen = { dose, frequency: tau, infusionTime: tInf };
  return { regimen, result: evaluateRegimen(regimen, pk, target.mic) };
}

export function recommendLoadingDose(weightKg: number, criticallyIll: boolean): number {
  const mgPerKg = criticallyIll ? 25 : 20;
  return Math.min(roundDose(mgPerKg * weightKg, 250), 3000);
}

export function evaluateRegimen(
  reg: DoseRegimen,
  pk: PKParams,
  mic = 1
): RegimenResult {
  const peak = ssPeak(reg.dose, reg.infusionTime, reg.frequency, pk);
  const trough = ssTrough(peak, reg.infusionTime, reg.frequency, pk);
  const auc24 = auc24FromDose(reg.dose, reg.frequency, pk);
  return {
    regimen: reg,
    peak,
    trough,
    auc24,
    aucMicRatio: auc24 / mic,
  };
}

// ---------- multi-frequency comparison ----------

export function compareFrequencies(
  pk: PKParams,
  weightKg: number,
  target: TargetRange = DEFAULT_TARGET,
  frequencies: number[] = [8, 12, 24, 36, 48]
): RegimenResult[] {
  return frequencies.map((tau) => {
    const aucMid = (target.aucMin + target.aucMax) / 2;
    const dailyDose = aucMid * pk.cl;
    const perDose = dailyDose / (24 / tau);
    const dose = roundDose(Math.min(perDose, 35 * weightKg), 250);
    const tInf = infusionTimeFor(dose);
    return evaluateRegimen({ dose, frequency: tau, infusionTime: tInf }, pk, target.mic);
  });
}

// ---------- time-concentration simulation (multi-dose, superposition) ----------

/** Concentration contribution from a single dose at time `t` after that dose start. */
function singleDoseConcentration(dose: number, tInf: number, t: number, pk: PKParams): number {
  if (t <= 0) return 0;
  const k0 = dose / tInf; // mg/hr
  const factor = k0 / (pk.vd * pk.ke);
  if (t < tInf) {
    // during infusion
    return factor * (1 - Math.exp(-pk.ke * t));
  }
  // post-infusion: decay from end-of-infusion concentration
  const cEnd = factor * (1 - Math.exp(-pk.ke * tInf));
  return cEnd * Math.exp(-pk.ke * (t - tInf));
}

/** Simulate concentration vs time over N doses. */
export function simulateConcentration(
  reg: DoseRegimen,
  pk: PKParams,
  hoursTotal = 96,
  stepHours = 0.25
): SimulationPoint[] {
  const points: SimulationPoint[] = [];
  const numDoses = Math.ceil(hoursTotal / reg.frequency) + 1;
  const doseStarts = Array.from({ length: numDoses }, (_, i) => i * reg.frequency);
  for (let t = 0; t <= hoursTotal + 1e-9; t += stepHours) {
    let c = 0;
    for (const start of doseStarts) {
      if (start > t) break;
      c += singleDoseConcentration(reg.dose, reg.infusionTime, t - start, pk);
    }
    points.push({ t: Number(t.toFixed(2)), c: Number(c.toFixed(2)) });
  }
  return points;
}

// ---------- formatting helpers ----------

export const fmt = {
  mg: (n: number) => `${Math.round(n)} mg`,
  hr: (n: number) => `${n} h`,
  conc: (n: number) => n.toFixed(1),
  auc: (n: number) => Math.round(n).toString(),
  num: (n: number, d = 2) => n.toFixed(d),
};
