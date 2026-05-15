// Vancomycin population PK engine.
// References: ASHP/IDSA 2020 Vancomycin Guideline; Matzke et al.; Crass et al.
//             Ambrose PJ, Winter ME. Basic Clinical Pharmacokinetics, 4th ed. 2004.
// Method: one-compartment, first-order elimination, intermittent infusion at steady state.
// AUC24-based dosing is the consensus target (AUC24/MIC 400-600, MIC=1).

import type {
  NormalizedPatient,
  PKParams,
  DoseRegimen,
  RegimenResult,
  TargetRange,
  SimulationPoint,
  SingleLevelInput,
  SingleLevelResult,
} from "./types";

// Absolute per-dose ceiling (mg). Clinical doses above this warrant extra verification
// and individualized Bayesian dosing. ASHP recommends max infusion rate 1000 mg/hr.
export const MAX_DOSE_MG = 3500;

// ---------- body size ----------

export function ibwKg(p: NormalizedPatient): number {
  // Devine formula. Height in inches.
  const heightIn = p.heightCm / 2.54;
  const base = p.sex === "male" ? 50 : 45.5;
  const above60 = Math.max(0, heightIn - 60);
  return base + 2.3 * above60;
}

export function adjBwKg(p: NormalizedPatient): number {
  const ibw = ibwKg(p);
  // AdjBW uses actual measured weight (weightKg) — for display and dosing weight decisions.
  return p.weightKg > 1.2 * ibw ? ibw + 0.4 * (p.weightKg - ibw) : p.weightKg;
}

export function bmi(p: NormalizedPatient): number {
  const m = p.heightCm / 100;
  // correctedWeightKg = estimated full-body weight; used for obesity classification.
  return p.correctedWeightKg / (m * m);
}

// ---------- renal function ----------

export function crClCockcroftGault(p: NormalizedPatient): number {
  const ibw = ibwKg(p);
  // Use correctedWeightKg (amputation-adjusted) for weight selection and CG formula.
  // TBW ≤ 1.2×IBW → use correctedTBW; TBW > 1.2×IBW (obese) → use AdjBW of correctedTBW.
  const cw = p.correctedWeightKg;
  const adjBwForCrCl = cw > 1.2 * ibw ? ibw + 0.4 * (cw - ibw) : cw;
  const weightForCG = cw > 1.2 * ibw ? adjBwForCrCl : cw;
  const sexFactor = p.sex === "female" ? 0.85 : 1;
  return Math.max(((140 - p.age) * weightForCG) / (72 * p.scrMgDl) * sexFactor, 5);
}

/**
 * Salazar-Corcoran CrCl — preferred for BMI ≥40 (morbidly obese patients).
 * Incorporates height directly, avoiding the IBW/AdjBW approximation that CG requires.
 * Reference: Salazar DE, Corcoran GB. Am J Med 1988;84(6):1053-60.
 * Uses correctedWeightKg (amputation-adjusted TBW) to match the original derivation population.
 */
export function salazarCorcoranCrCl(p: NormalizedPatient): number {
  const heightM = p.heightCm / 100;
  const h2 = heightM * heightM;
  const cw = p.correctedWeightKg;
  if (p.sex === "male") {
    return Math.max(((137 - p.age) * (0.285 * cw + 12.1 * h2)) / (51 * p.scrMgDl), 5);
  }
  return Math.max(((146 - p.age) * (0.287 * cw + 9.74 * h2)) / (60 * p.scrMgDl), 5);
}

// ---------- PK params ----------

export function pkParams(p: NormalizedPatient): PKParams {
  const bmiVal = bmi(p);
  // Auto-select CrCl formula: Salazar-Corcoran at BMI ≥40, Cockcroft-Gault otherwise.
  const useSalazar = bmiVal >= 40;
  const crCl = useSalazar ? salazarCorcoranCrCl(p) : crClCockcroftGault(p);
  const crClMethod = useSalazar ? "salazar-corcoran" as const : "cockcroft-gault" as const;

  // Matzke et al. ke (1/hr) from CrCl (mL/min):
  // ke = 0.00083 × CrCl + 0.0044
  const ke = 0.00083 * crCl + 0.0044;

  // Vd: use manual override if provided, otherwise auto (ICU = 0.8 L/kg, non-ICU = 0.7 L/kg).
  // Vd scales with actual body weight (weightKg), not corrected weight.
  const vdPerKg = p.empiricVdLPerKg ?? (p.criticallyIll ? 0.8 : 0.7);
  const vd = vdPerKg * p.weightKg;
  const cl = ke * vd;
  const halfLife = 0.693 / ke;

  return {
    crCl,
    crClMethod,
    amputationCorrectionPct: p.amputationFactor > 0
      ? Math.round(p.amputationFactor * 1000) / 10
      : undefined,
    vd,
    vdPerKg,
    ke,
    halfLife,
    cl,
    ibw: ibwKg(p),
    adjBw: adjBwKg(p),
    bmi: bmiVal,
  };
}

// ---------- concentration math (intermittent infusion, steady state) ----------

export function ssPeak(dose: number, tInf: number, tau: number, pk: PKParams): number {
  // Cmax,ss at end of infusion:
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

// ---------- dose construction ----------

export function pickFrequency(pk: PKParams): number {
  // Heuristic by t1/2: shorter half-life → more frequent dosing
  if (pk.halfLife < 6) return 8;
  if (pk.halfLife < 10) return 12;
  if (pk.halfLife < 18) return 24;
  if (pk.halfLife < 30) return 36;
  return 48;
}

export function infusionTimeFor(dose: number): number {
  // Max infusion rate 1000 mg/hr per ASHP; baseline 1.5 h, round up to nearest 0.5 h
  const minHours = Math.max(1, dose / 1000);
  return Math.max(1.5, Math.ceil(minHours * 2) / 2);
}

export function roundDose(mg: number, step = 250): number {
  return Math.round(mg / step) * step;
}

/**
 * Internal helper: round, cap at MAX_DOSE_MG, and record whether the ceiling was hit.
 */
function buildRegimen(
  uncappedDose: number,
  tau: number,
  step = 250,
  overrideInfTime?: number
): DoseRegimen {
  const rounded = roundDose(uncappedDose, step);
  const dose = Math.min(rounded, MAX_DOSE_MG);
  const infusionTime = overrideInfTime ?? infusionTimeFor(dose);
  return {
    dose,
    frequency: tau,
    infusionTime,
    doseCapped: rounded > MAX_DOSE_MG,
  };
}

// ---------- dose recommendation ----------

export interface RecommendOpts {
  target: TargetRange;
  frequency?: number;        // hours; if omitted we pick based on t1/2
  infusionTime?: number;     // hours; default derived from dose
  roundTo?: number;          // mg; default 250
}

const DEFAULT_TARGET: TargetRange = { aucMin: 400, aucMax: 600, mic: 1 };

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
  // 35 mg/kg per-dose weight-based cap before rounding
  const weightCapped = Math.min(perDose, 35 * weightKg);
  const regimen = buildRegimen(weightCapped, tau, opts.roundTo ?? 250, opts.infusionTime);
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
    const weightCapped = Math.min(perDose, 35 * weightKg);
    const regimen = buildRegimen(weightCapped, tau);
    return evaluateRegimen(regimen, pk, target.mic);
  });
}

// ---------- Ambrose-Winter single-trough analysis ----------

/**
 * Ambrose-Winter volume of distribution estimate.
 * Vd (L) = (0.17 × age_yrs) + (0.22 × TBW_kg) + 15
 * Reference: Ambrose PJ, Winter ME. Basic Clinical Pharmacokinetics, 4th ed. 2004:451-76.
 * Note: TBW is used even in obese patients per the original published equation.
 */
export function ambrosWinterVd(age: number, weightKg: number): number {
  return 0.17 * age + 0.22 * weightKg + 15;
}

/**
 * Single-level analysis using the Ambrose-Winter back-calculation method.
 *
 * Algorithm (two-iteration):
 *  1. Select Vd (Ambrose-Winter, population, or manual)
 *  2. Use population ke as seed
 *  3. Extrapolate true trough: Cmin_true = Cmeas × e^(−ke × t_before_next)
 *  4. Estimate peak: Cmax ≈ Cmin_true + Dose/Vd  (Ambrose-Winter simplification)
 *  5. Patient-specific ke: ke = ln(Cmax/Cmin_true) / (tau − t_inf)
 *  6. Repeat steps 3-5 once more with updated ke (converges in 2 passes)
 *  7. Recommend new regimen targeting AUC goal using patient-specific CL
 */
export function singleLevelAnalysis(
  input: SingleLevelInput,
  normalized: NormalizedPatient,
  target: TargetRange = DEFAULT_TARGET
): SingleLevelResult {
  const popPk = pkParams(normalized);

  // Step 1: Select Vd
  let vd: number;
  switch (input.vdMethod) {
    case "ambrose-winter":
      vd = ambrosWinterVd(normalized.age, normalized.weightKg);
      break;
    case "manual":
      vd = (input.manualVdLPerKg ?? 0.7) * normalized.weightKg;
      break;
    default: // "population"
      vd = popPk.vd;
  }
  const vdPerKg = vd / normalized.weightKg;

  // Steps 2-5: Iterative ke back-calculation (2 passes converges reliably)
  let ke_pt = popPk.ke;
  let trueTrough = input.measuredTrough;
  let estimatedPeak = input.measuredTrough + input.currentDose / vd;

  for (let iter = 0; iter < 2; iter++) {
    // Extrapolate to true trough just before next dose
    trueTrough =
      input.hoursBeforeNextDose > 0
        ? input.measuredTrough * Math.exp(-ke_pt * input.hoursBeforeNextDose)
        : input.measuredTrough;

    // Ambrose-Winter peak estimate: Cmax ≈ Cmin + Dose/Vd
    estimatedPeak = trueTrough + input.currentDose / vd;

    // Patient-specific ke from ln(peak/trough) / time between peak and trough
    const tPeakToTrough = input.currentFrequency - input.currentInfusionTime;
    if (tPeakToTrough > 0 && estimatedPeak > trueTrough && trueTrough > 0) {
      ke_pt = Math.log(estimatedPeak / trueTrough) / tPeakToTrough;
    }
  }

  // Apply floor to prevent nonsensical values
  ke_pt = Math.max(ke_pt, 0.001);
  const cl = ke_pt * vd;
  const halfLife = 0.693 / ke_pt;

  const patientPk: PKParams = {
    crCl: popPk.crCl,
    crClMethod: popPk.crClMethod,
    amputationCorrectionPct: popPk.amputationCorrectionPct,
    vd,
    vdPerKg,
    ke: ke_pt,
    halfLife,
    cl,
    ibw: popPk.ibw,
    adjBw: popPk.adjBw,
    bmi: popPk.bmi,
  };

  // Current regimen metrics using patient-specific PK
  const currentAuc24 = auc24FromDose(
    input.currentDose,
    input.currentFrequency,
    patientPk
  );

  const currentRegimen: DoseRegimen = {
    dose: input.currentDose,
    frequency: input.currentFrequency,
    infusionTime: input.currentInfusionTime,
    doseCapped: false,
  };

  // Recommend new regimen targeting AUC goal with patient-specific CL
  const { regimen: recommendedRegimen, result: recommendedResult } = recommendRegimen(
    patientPk,
    normalized.weightKg,
    { target }
  );

  return {
    vd,
    vdPerKg,
    ke: ke_pt,
    halfLife,
    cl,
    patientPk,
    populationPk: popPk,
    trueTrough,
    estimatedPeak,
    currentAuc24,
    currentRegimen,
    recommendedRegimen,
    recommendedResult,
  };
}

// ---------- time-concentration simulation (multi-dose, superposition) ----------

function singleDoseConcentration(
  dose: number,
  tInf: number,
  t: number,
  pk: PKParams
): number {
  if (t <= 0) return 0;
  const k0 = dose / tInf; // mg/hr
  const factor = k0 / (pk.vd * pk.ke);
  if (t < tInf) {
    // During infusion
    return factor * (1 - Math.exp(-pk.ke * t));
  }
  // Post-infusion: decay from end-of-infusion concentration
  const cEnd = factor * (1 - Math.exp(-pk.ke * tInf));
  return cEnd * Math.exp(-pk.ke * (t - tInf));
}

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
