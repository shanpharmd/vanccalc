// Non-steady-state / random level analysis.
//
// The case this exists for: 1 to 3 doses in, someone drew a level that is NOT a
// true trough. Trough equations do not apply. Two things have to be handled that
// a steady-state trough calculation ignores:
//
//   1. WHERE in the interval the sample sits (time from the start of the last dose),
//      which also determines whether distribution was complete.
//   2. HOW FAR into accumulation the patient is (time from the FIRST dose), because
//      a pre-steady-state level understates eventual exposure.
//
// Method: superposition over the doses actually given, solving for patient-specific
// ke by bisection. Vd is held fixed (population, Ambrose-Winter, or manual) because
// a single concentration can only resolve a single unknown.
//
// Validated numerically: the solver recovers a known ke exactly, superposition
// converges to the analytic steady-state trough as dose count grows, and the
// fraction-of-steady-state matches the closed form 1 − e^(−ke·t).

import {
  ambrosWinterVd,
  pkParams,
  recommendRegimen,
  ssPeak,
  ssTrough,
} from "./vancoMath";
import type {
  DoseRegimen,
  NormalizedPatient,
  PKParams,
  RegimenResult,
  TargetRange,
  VdMethod,
} from "./types";

/** Vancomycin distribution (alpha) phase duration after end of infusion, hours. */
export const DISTRIBUTION_HOURS = 1.0;

export interface RandomLevelInput {
  currentDose: number;          // mg per dose
  currentTau: number;           // h, scheduled interval
  currentInfusionTime: number;  // h
  /** How many doses the patient had received when the level was drawn (>= 1). */
  dosesGiven: number;
  /** Hours from the START of the most recent infusion to the blood draw. */
  timeFromLastDoseStart: number;
  measuredLevel: number;        // mcg/mL
  vdMethod: VdMethod;
  manualVdLPerKg?: number;
}

export interface RandomLevelResult {
  // Patient-specific PK
  ke: number;
  halfLife: number;
  vd: number;
  vdPerKg: number;
  cl: number;
  patientPk: PKParams;
  populationPk: PKParams;

  // Where the sample sits
  hoursFromFirstDose: number;
  timeFromEndOfInfusion: number;   // negative = drawn during the infusion
  drawnDuringInfusion: boolean;
  inDistributionPhase: boolean;

  // Accumulation state
  fractionOfSteadyState: number;   // 0-1
  atSteadyState: boolean;          // >= 0.90 by convention

  /** True trough at the end of the CURRENT interval, given doses actually received. */
  trueTroughThisInterval: number;
  /** Trough this regimen will settle at once steady state is reached. */
  steadyStateTrough: number;
  steadyStatePeak: number;
  /** AUC24 the current regimen delivers at steady state. */
  auc24AtSteadyState: number;

  currentRegimen: DoseRegimen;
  recommendedRegimen: DoseRegimen;
  recommendedResult: RegimenResult;

  /** True when the measured level could not be fit within plausible ke bounds. */
  outOfRange: boolean;
  warnings: string[];
}

const KE_MIN = 0.0005;
const KE_MAX = 1.0;

/** Concentration from one dose, `elapsed` hours after its infusion started. */
export function singleDoseConc(
  dose: number,
  tInf: number,
  vd: number,
  ke: number,
  elapsed: number
): number {
  if (elapsed <= 0) return 0;
  const factor = dose / (tInf * vd * ke);
  if (elapsed < tInf) {
    return factor * (1 - Math.exp(-ke * elapsed));
  }
  return factor * (1 - Math.exp(-ke * tInf)) * Math.exp(-ke * (elapsed - tInf));
}

/**
 * Predicted concentration `tAfterLast` hours after the start of dose `n`,
 * assuming `n` on-schedule doses of `dose` every `tau` hours.
 */
export function predictConc(
  dose: number,
  tau: number,
  tInf: number,
  vd: number,
  ke: number,
  n: number,
  tAfterLast: number
): number {
  let c = 0;
  for (let i = 1; i <= n; i++) {
    c += singleDoseConc(dose, tInf, vd, ke, (n - i) * tau + tAfterLast);
  }
  return c;
}

/**
 * Solve for ke by bisection. Concentration at a fixed sampling time is
 * monotonically decreasing in ke, so bisection is stable and needs no derivative.
 */
export function solveKeFromLevel(
  dose: number,
  tau: number,
  tInf: number,
  vd: number,
  n: number,
  tAfterLast: number,
  measured: number
): { ke: number; outOfRange: boolean } {
  const at = (ke: number) => predictConc(dose, tau, tInf, vd, ke, n, tAfterLast);
  if (at(KE_MIN) < measured) return { ke: KE_MIN, outOfRange: true };
  if (at(KE_MAX) > measured) return { ke: KE_MAX, outOfRange: true };
  let lo = KE_MIN;
  let hi = KE_MAX;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) > measured) lo = mid;
    else hi = mid;
  }
  return { ke: (lo + hi) / 2, outOfRange: false };
}

export function randomLevelAnalysis(
  input: RandomLevelInput,
  normalized: NormalizedPatient,
  target: TargetRange
): RandomLevelResult {
  const popPk = pkParams(normalized);

  // Vd is fixed; one level resolves one unknown (ke).
  let vd: number;
  switch (input.vdMethod) {
    case "ambrose-winter":
      vd = ambrosWinterVd(normalized.age, normalized.weightKg);
      break;
    case "manual":
      vd = (input.manualVdLPerKg ?? 0.7) * normalized.weightKg;
      break;
    default:
      vd = popPk.vd;
  }
  const vdPerKg = vd / normalized.weightKg;

  const n = Math.max(1, Math.round(input.dosesGiven));
  const { ke, outOfRange } = solveKeFromLevel(
    input.currentDose,
    input.currentTau,
    input.currentInfusionTime,
    vd,
    n,
    input.timeFromLastDoseStart,
    input.measuredLevel
  );

  const halfLife = 0.693 / ke;
  const cl = ke * vd;

  const patientPk: PKParams = {
    crCl: popPk.crCl,
    crClMethod: popPk.crClMethod,
    amputationCorrectionPct: popPk.amputationCorrectionPct,
    vd,
    vdPerKg,
    ke,
    halfLife,
    cl,
    ibw: popPk.ibw,
    adjBw: popPk.adjBw,
    bmi: popPk.bmi,
  };

  // Sample placement
  const timeFromEndOfInfusion =
    input.timeFromLastDoseStart - input.currentInfusionTime;
  const drawnDuringInfusion = timeFromEndOfInfusion < 0;
  const inDistributionPhase =
    !drawnDuringInfusion && timeFromEndOfInfusion < DISTRIBUTION_HOURS;

  // Accumulation state, measured from the first dose.
  const hoursFromFirstDose = (n - 1) * input.currentTau + input.timeFromLastDoseStart;
  const fractionOfSteadyState = 1 - Math.exp(-ke * hoursFromFirstDose);
  const atSteadyState = fractionOfSteadyState >= 0.9;

  // True trough at the end of the current interval, from doses actually received.
  const trueTroughThisInterval = predictConc(
    input.currentDose,
    input.currentTau,
    input.currentInfusionTime,
    vd,
    ke,
    n,
    input.currentTau
  );

  // Where this regimen settles once accumulated.
  const steadyStatePeak = ssPeak(
    input.currentDose,
    input.currentInfusionTime,
    input.currentTau,
    patientPk
  );
  const steadyStateTrough = ssTrough(
    steadyStatePeak,
    input.currentInfusionTime,
    input.currentTau,
    patientPk
  );
  const auc24AtSteadyState =
    (input.currentDose * (24 / input.currentTau)) / cl;

  const currentRegimen: DoseRegimen = {
    dose: input.currentDose,
    frequency: input.currentTau,
    infusionTime: input.currentInfusionTime,
    doseCapped: false,
  };

  const { regimen: recommendedRegimen, result: recommendedResult } = recommendRegimen(
    patientPk,
    normalized.weightKg,
    { target }
  );

  // ── Clinical warnings ──
  const warnings: string[] = [];
  if (drawnDuringInfusion) {
    warnings.push(
      `Level was drawn ${Math.abs(timeFromEndOfInfusion).toFixed(1)} h BEFORE the infusion ended. ` +
        `A sample taken mid-infusion cannot be used for kinetic analysis. Redraw.`
    );
  } else if (inDistributionPhase) {
    warnings.push(
      `Level was drawn ${timeFromEndOfInfusion.toFixed(1)} h after the infusion ended, inside the ` +
        `~1 h distribution phase. Vancomycin has not finished distributing, so the value reads ` +
        `falsely high and will underestimate Vd and overestimate clearance. Interpret with caution.`
    );
  }
  if (!atSteadyState) {
    warnings.push(
      `Only ${(fractionOfSteadyState * 100).toFixed(0)}% of steady state at the time of the draw ` +
        `(${hoursFromFirstDose.toFixed(1)} h from the first dose, t½ ${halfLife.toFixed(1)} h). ` +
        `This regimen will keep accumulating to a trough of ${steadyStateTrough.toFixed(1)} mcg/mL. ` +
        `Do not treat the measured value as the final trough.`
    );
  }
  if (outOfRange) {
    warnings.push(
      `The measured level cannot be fit with this dose, interval, and Vd. Check the dose, the ` +
        `number of doses given, and the draw time, or choose a different Vd method.`
    );
  }
  if (n <= 2 && !outOfRange) {
    warnings.push(
      `With ${n} dose${n === 1 ? "" : "s"} given, ke is derived from a single early ` +
        `concentration and a fixed Vd. A second level gives a far more reliable ke. Consider the ` +
        `Two-Level tab.`
    );
  }

  return {
    ke,
    halfLife,
    vd,
    vdPerKg,
    cl,
    patientPk,
    populationPk: popPk,
    hoursFromFirstDose,
    timeFromEndOfInfusion,
    drawnDuringInfusion,
    inDistributionPhase,
    fractionOfSteadyState,
    atSteadyState,
    trueTroughThisInterval,
    steadyStateTrough,
    steadyStatePeak,
    auc24AtSteadyState,
    currentRegimen,
    recommendedRegimen,
    recommendedResult,
    outOfRange,
    warnings,
  };
}

/**
 * Lightweight steady-state check for the ordinary "pre-dose N trough" workflow.
 * Given the interval and a back-calculated ke, how far into accumulation was a
 * trough drawn just before dose N? Used to stay silent when the steady-state
 * assumption is safe and speak up only when it is not.
 */
export function steadyStateCheck(
  ke: number,
  tau: number,
  doseNumber: number
): {
  hoursFromFirstDose: number;
  halfLivesElapsed: number;
  fractionOfSteadyState: number;
  safe: boolean;
} {
  const hoursFromFirstDose = Math.max(0, (doseNumber - 1) * tau);
  const halfLife = 0.693 / ke;
  const fractionOfSteadyState = 1 - Math.exp(-ke * hoursFromFirstDose);
  return {
    hoursFromFirstDose,
    halfLivesElapsed: hoursFromFirstDose / halfLife,
    fractionOfSteadyState,
    safe: fractionOfSteadyState >= 0.9,
  };
}
