// Timing-deviation engine.
// Answers the questions that come up on the floor every day:
//   "The trough was drawn 90 minutes early — what's the real trough?"
//   "Nursing gave the 22:00 dose at 01:00 — what does that do to the level?"
//   "We held a dose. How low does he get, and when is he back in range?"
//   "Level is 32. When can I restart?"
//
// All of it is one-compartment superposition with EXPLICIT dose administration
// times, rather than the idealized i*tau schedule used elsewhere. That is the
// whole trick: feed real clock times in, and mistimed doses fall out naturally.

import type { PKParams, SimulationPoint } from "./types";

export interface DoseEvent {
  /** Hours from t=0 when the infusion actually STARTED. */
  time: number;
  dose: number;          // mg
  infusionTime: number;  // hr
  /** Scheduled time, for deviation reporting. */
  scheduledTime: number;
  given: boolean;        // false = missed / held
}

/**
 * Concentration contributed by a single dose at `elapsed` hours after its
 * infusion START. Zero before the dose is given.
 */
export function singleDoseConc(
  dose: number,
  tInf: number,
  elapsed: number,
  pk: PKParams
): number {
  if (elapsed <= 0) return 0;
  const factor = dose / tInf / (pk.vd * pk.ke);
  if (elapsed < tInf) {
    return factor * (1 - Math.exp(-pk.ke * elapsed));
  }
  const cEnd = factor * (1 - Math.exp(-pk.ke * tInf));
  return cEnd * Math.exp(-pk.ke * (elapsed - tInf));
}

/** Concentration at an exact time from an arbitrary list of dose events. */
export function concentrationAt(t: number, doses: DoseEvent[], pk: PKParams): number {
  let c = 0;
  for (const d of doses) {
    if (!d.given || d.time > t) continue;
    c += singleDoseConc(d.dose, d.infusionTime, t - d.time, pk);
  }
  return c;
}

/** Full curve from an arbitrary dose schedule. */
export function simulateSchedule(
  doses: DoseEvent[],
  pk: PKParams,
  hoursTotal = 96,
  stepHours = 0.25
): SimulationPoint[] {
  const pts: SimulationPoint[] = [];
  for (let t = 0; t <= hoursTotal + 1e-9; t += stepHours) {
    pts.push({
      t: Number(t.toFixed(2)),
      c: Number(concentrationAt(t, doses, pk).toFixed(2)),
    });
  }
  return pts;
}

/** Build an on-time schedule. */
export function buildSchedule(
  dose: number,
  tau: number,
  infusionTime: number,
  hoursTotal = 96
): DoseEvent[] {
  const out: DoseEvent[] = [];
  for (let t = 0; t <= hoursTotal; t += tau) {
    out.push({ time: t, scheduledTime: t, dose, infusionTime, given: true });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
//  1. Level drawn early or late
// ─────────────────────────────────────────────────────────────

export interface LevelTimingInput {
  measured: number;        // mcg/mL as reported by the lab
  /**
   * Hours the draw deviated from the true trough (immediately pre-dose).
   * Negative = drawn EARLY (before the trough) → measured reads HIGH.
   * Positive = drawn LATE  (after the dose was due but before it ran) → reads LOW.
   */
  deviationHours: number;
}

export interface LevelTimingResult {
  measured: number;
  trueTrough: number;
  deltaAbs: number;        // trueTrough − measured
  deltaPct: number;        // % error if the measured value were reported as the trough
  direction: "early" | "late" | "on-time";
  interpretation: string;
}

/**
 * Correct a mistimed trough to the true pre-dose trough.
 *
 * Drawn early (deviation < 0): the level still has |dev| hours of elimination
 * left before the dose is due, so extrapolate DOWN:  C_true = C × e^(−ke·|dev|)
 * Drawn late  (deviation > 0): elimination already ran past the scheduled
 * trough, so extrapolate UP:                          C_true = C × e^(+ke·dev)
 */
export function correctLevelTiming(
  input: LevelTimingInput,
  pk: PKParams
): LevelTimingResult {
  const dev = input.deviationHours;
  const trueTrough = input.measured * Math.exp(pk.ke * dev);
  const deltaAbs = trueTrough - input.measured;
  const deltaPct = input.measured > 0 ? (deltaAbs / input.measured) * 100 : 0;

  const direction: LevelTimingResult["direction"] =
    Math.abs(dev) < 0.01 ? "on-time" : dev < 0 ? "early" : "late";

  let interpretation: string;
  if (direction === "on-time") {
    interpretation = "Draw timed at the trough. No correction needed.";
  } else if (direction === "early") {
    interpretation =
      `Drawn ${Math.abs(dev).toFixed(1)} h early, so the reported value overstates the ` +
      `true trough by ${Math.abs(deltaPct).toFixed(0)}%. Acting on the uncorrected number ` +
      `risks an unnecessary dose reduction.`;
  } else {
    interpretation =
      `Drawn ${dev.toFixed(1)} h late, so the reported value understates the true trough ` +
      `by ${Math.abs(deltaPct).toFixed(0)}%. Acting on the uncorrected number risks an ` +
      `unnecessary dose increase.`;
  }

  return { measured: input.measured, trueTrough, deltaAbs, deltaPct, direction, interpretation };
}

// ─────────────────────────────────────────────────────────────
//  2. Dose given early / late, and 3. missed dose
// ─────────────────────────────────────────────────────────────

export interface DeviationImpact {
  /**
   * Trough immediately BEFORE the affected dose. For a delayed dose this is the
   * clinically important one: the gap stretches and this is usually the level
   * that actually gets drawn.
   */
  troughBeforeScheduled: number;
  troughBeforeActual: number;
  troughBeforeDelta: number;
  /** Trough immediately before the next dose after the affected one. */
  troughScheduled: number;
  troughActual: number;
  troughDelta: number;
  /** Peak of the affected dose. */
  peakScheduled: number;
  peakActual: number;
  peakDelta: number;
  /** AUC over the 24 h window containing the deviation. */
  auc24Scheduled: number;
  auc24Actual: number;
  auc24Delta: number;
  auc24DeltaPct: number;
  /** Lowest concentration reached in the affected window (matters for held doses). */
  nadir: number;
  nadirTime: number;
}

/** Trapezoidal AUC between two times for a schedule. */
export function aucBetween(
  from: number,
  to: number,
  doses: DoseEvent[],
  pk: PKParams,
  step = 0.05
): number {
  let auc = 0;
  let prev = concentrationAt(from, doses, pk);
  for (let t = from + step; t <= to + 1e-9; t += step) {
    const cur = concentrationAt(t, doses, pk);
    auc += ((prev + cur) / 2) * step;
    prev = cur;
  }
  return auc;
}

/**
 * Compare an actual (deviated) schedule against the intended one across the
 * window containing the affected dose.
 */
export function deviationImpact(
  scheduled: DoseEvent[],
  actual: DoseEvent[],
  affectedIndex: number,
  tau: number,
  pk: PKParams
): DeviationImpact {
  const sched = scheduled[affectedIndex];
  const act = actual[affectedIndex];

  // Peak of the affected dose = end of its infusion.
  const peakScheduled = concentrationAt(sched.scheduledTime + sched.infusionTime, scheduled, pk);
  const peakActual = act.given
    ? concentrationAt(act.time + act.infusionTime, actual, pk)
    : 0;

  // Trough just before the AFFECTED dose itself (the extended-gap level).
  const troughBeforeScheduled = concentrationAt(sched.scheduledTime - 0.01, scheduled, pk);
  const troughBeforeActual = concentrationAt(
    (act.given ? act.time : sched.scheduledTime) - 0.01,
    actual,
    pk
  );

  // Trough just before the NEXT dose after the affected one.
  const nextSched = scheduled[affectedIndex + 1];
  const nextAct = actual[affectedIndex + 1];
  const tTroughSched = nextSched ? nextSched.scheduledTime : sched.scheduledTime + tau;
  const tTroughAct = nextAct ? nextAct.time : act.time + tau;
  const troughScheduled = concentrationAt(tTroughSched - 0.01, scheduled, pk);
  const troughActual = concentrationAt(tTroughAct - 0.01, actual, pk);

  // 24 h window starting at the affected dose's scheduled time.
  const winStart = sched.scheduledTime;
  const winEnd = winStart + 24;
  const auc24Scheduled = aucBetween(winStart, winEnd, scheduled, pk);
  const auc24Actual = aucBetween(winStart, winEnd, actual, pk);

  // Nadir across the affected window.
  let nadir = Infinity;
  let nadirTime = winStart;
  for (let t = winStart; t <= winEnd; t += 0.1) {
    const c = concentrationAt(t, actual, pk);
    if (c < nadir) {
      nadir = c;
      nadirTime = t;
    }
  }

  return {
    troughBeforeScheduled,
    troughBeforeActual,
    troughBeforeDelta: troughBeforeActual - troughBeforeScheduled,
    troughScheduled,
    troughActual,
    troughDelta: troughActual - troughScheduled,
    peakScheduled,
    peakActual,
    peakDelta: peakActual - peakScheduled,
    auc24Scheduled,
    auc24Actual,
    auc24Delta: auc24Actual - auc24Scheduled,
    auc24DeltaPct:
      auc24Scheduled > 0 ? ((auc24Actual - auc24Scheduled) / auc24Scheduled) * 100 : 0,
    nadir,
    nadirTime,
  };
}

// ─────────────────────────────────────────────────────────────
//  4. Restart timing after a supratherapeutic level
// ─────────────────────────────────────────────────────────────

export interface RestartResult {
  hoursToThreshold: number | null; // null when already at/below threshold
  clockNote: string;
}

/**
 * Hours from a measured level until concentration decays to `threshold`.
 * t = ln(C / threshold) / ke
 */
export function timeToThreshold(
  currentLevel: number,
  threshold: number,
  pk: PKParams
): RestartResult {
  if (threshold <= 0 || currentLevel <= 0) {
    return { hoursToThreshold: null, clockNote: "Enter a level and threshold above zero." };
  }
  if (currentLevel <= threshold) {
    return {
      hoursToThreshold: null,
      clockNote: `Level is already at or below ${threshold} mcg/mL.`,
    };
  }
  const hours = Math.log(currentLevel / threshold) / pk.ke;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return {
    hoursToThreshold: hours,
    clockNote: `About ${h} h ${m} min from the draw (${hours.toFixed(1)} h) to reach ${threshold} mcg/mL.`,
  };
}

// ─────────────────────────────────────────────────────────────
//  5. Hold-and-restart simulation (supratherapeutic level)
// ─────────────────────────────────────────────────────────────
//
// The question this answers: "Trough came back at 29.9. The calculator gave me
// a new regimen. How long do I hold, and what do levels actually do once I
// restart?"
//
// The part that a plain ln(C/target)/ke calculation misses is SUPERPOSITION.
// When the new regimen restarts, residual drug is still decaying. The first
// trough is the sum of the new dose plus whatever is left over:
//
//     C(t) = C_measured·e^(−ke·t)  +  Σ singleDoseConc(new doses)
//
// That gives a clean result worth stating plainly: the ideal restart threshold
// is the NEW regimen's steady-state trough. Restart there and the patient walks
// straight into steady state, with no accumulation overshoot and no gap.
// Restart early and the first trough overshoots; restart late and it dips.

export interface HoldRestartInput {
  /** Measured (supratherapeutic) level, mcg/mL, at the time of the draw. */
  measuredLevel: number;
  /** New regimen. */
  newDose: number;          // mg
  newFrequency: number;     // hr (tau)
  newInfusionTime: number;  // hr
  /**
   * Hours from the draw until the first dose of the new regimen.
   * When undefined, the optimal hold (residual === SS trough) is used.
   */
  restartDelayHours?: number;
  /** Trough above which to flag an overshoot warning. */
  troughCeiling?: number;   // default 20
}

export interface HoldRestartResult {
  // Steady-state reference for the new regimen
  ssPeak: number;
  ssTrough: number;
  ssAuc24: number;
  /** Hold time until residual decays to the SS trough. 0 when already at/below. */
  optimalHoldHours: number;
  // The scenario actually simulated
  restartHours: number;
  residualAtRestart: number;
  firstPeak: number;
  /** Trough immediately before the SECOND new dose. This is the number that matters. */
  firstTrough: number;
  /** firstTrough − ssTrough. Positive = accumulation overshoot. */
  troughDelta: number;
  /**
   * True when the NEW regimen's own steady-state trough exceeds the ceiling.
   * When this is set, "hold until the level reaches the SS trough" is not valid
   * advice: the regimen itself is wrong for this patient's clearance, and no
   * hold duration fixes it. The dose or interval has to change first.
   */
  regimenSupratherapeutic: boolean;
  /** AUC over the first 24 h after restart, residual included. */
  auc24AfterRestart: number;
  /** AUC accrued during the hold itself, from residual decay alone. */
  aucDuringHold: number;
  /** What the new regimen would have delivered over the same window. */
  aucExpectedDuringHold: number;
  status: "optimal" | "early" | "late" | "regimen-unsuitable";
  warnings: string[];
  /** Full curve from the draw (t=0) forward. */
  curve: SimulationPoint[];
  /** t at which the new regimen starts, for shading the hold window. */
  holdEndT: number;
}

/** Steady-state peak, trough and AUC24 for an intermittent infusion. */
function steadyStateRef(
  dose: number,
  tau: number,
  tInf: number,
  pk: PKParams
): { peak: number; trough: number; auc24: number } {
  const cl = pk.ke * pk.vd;
  const peak =
    (dose / (tInf * cl)) *
    ((1 - Math.exp(-pk.ke * tInf)) / (1 - Math.exp(-pk.ke * tau)));
  const trough = peak * Math.exp(-pk.ke * (tau - tInf));
  const auc24 = (dose * (24 / tau)) / cl;
  return { peak, trough, auc24 };
}

/**
 * Full hold-and-restart simulation.
 *
 * Time origin (t = 0) is the moment the level was drawn.
 * References: Rybak MJ et al. ASHP/IDSA/PIDS/SIDP consensus, Am J Health-Syst
 * Pharm 2020;77:835-64. Murphy JE, Clinical Pharmacokinetics, 6th ed.
 */
export function holdRestartAnalysis(
  input: HoldRestartInput,
  pk: PKParams,
  hoursTotal = 72
): HoldRestartResult {
  const {
    measuredLevel,
    newDose,
    newFrequency: tau,
    newInfusionTime: tInf,
    troughCeiling = 20,
  } = input;

  const ss = steadyStateRef(newDose, tau, tInf, pk);

  // Optimal hold: decay residual down to the new regimen's SS trough.
  const optimalHoldHours =
    measuredLevel > ss.trough ? Math.log(measuredLevel / ss.trough) / pk.ke : 0;

  const restartHours =
    input.restartDelayHours !== undefined && input.restartDelayHours >= 0
      ? input.restartDelayHours
      : optimalHoldHours;

  // New regimen dose events, timed from the draw.
  const doses: DoseEvent[] = [];
  for (let t = restartHours; t <= hoursTotal; t += tau) {
    doses.push({
      time: t,
      scheduledTime: t,
      dose: newDose,
      infusionTime: tInf,
      given: true,
    });
  }

  // Residual decay from the measured level, plus the new regimen on top.
  const residual = (t: number) => measuredLevel * Math.exp(-pk.ke * t);
  const total = (t: number) => residual(t) + concentrationAt(t, doses, pk);

  const residualAtRestart = residual(restartHours);
  const firstPeak = total(restartHours + tInf);
  const firstTrough = total(restartHours + tau);
  const troughDelta = firstTrough - ss.trough;

  // AUC during the hold comes from residual decay alone: (C0 − C_end)/ke.
  const aucDuringHold = (measuredLevel - residualAtRestart) / pk.ke;
  const aucExpectedDuringHold = ss.auc24 * (restartHours / 24);

  // AUC over the first 24 h of the new regimen, trapezoidal, residual included.
  let auc24AfterRestart = 0;
  const step = 0.05;
  let prev = total(restartHours);
  for (let t = restartHours + step; t <= restartHours + 24 + 1e-9; t += step) {
    const cur = total(t);
    auc24AfterRestart += ((prev + cur) / 2) * step;
    prev = cur;
  }

  // Curve for plotting.
  const curve: SimulationPoint[] = [];
  for (let t = 0; t <= hoursTotal + 1e-9; t += 0.25) {
    curve.push({ t: Number(t.toFixed(2)), c: Number(total(t).toFixed(2)) });
  }

  // Classify against the optimal restart, with a 1 h grace band.
  let status: "optimal" | "early" | "late" | "regimen-unsuitable" = "optimal";
  if (restartHours < optimalHoldHours - 1) status = "early";
  else if (restartHours > optimalHoldHours + 1) status = "late";

  // Guard: if the new regimen's own steady state is supratherapeutic, the
  // "hold to the SS trough" target is meaningless and would read as reassurance.
  const regimenSupratherapeutic = ss.trough > troughCeiling;
  if (regimenSupratherapeutic) status = "regimen-unsuitable";

  const warnings: string[] = [];
  if (regimenSupratherapeutic) {
    warnings.push(
      `${newDose} mg q${tau}h reaches a steady-state trough of ${ss.trough.toFixed(
        1
      )} mcg/mL in this patient (CrCl ${pk.crCl.toFixed(
        0
      )} mL/min, t½ ${pk.halfLife.toFixed(
        1
      )} h). No hold duration fixes that. Reduce the dose or extend the interval before working out restart timing.`
    );
  }
  if (firstTrough > troughCeiling && !regimenSupratherapeutic) {
    warnings.push(
      `Predicted first trough ${firstTrough.toFixed(1)} mcg/mL exceeds ${troughCeiling}. Residual drug is still accumulating on top of the new regimen. Hold longer or lengthen the interval.`
    );
  }
  if (status === "early") {
    warnings.push(
      `Restarting ${(optimalHoldHours - restartHours).toFixed(1)} h earlier than optimal. First trough runs ${troughDelta.toFixed(1)} mcg/mL above steady state.`
    );
  }
  if (status === "late") {
    warnings.push(
      `Restarting ${(restartHours - optimalHoldHours).toFixed(1)} h later than optimal. First trough dips ${Math.abs(troughDelta).toFixed(1)} mcg/mL below steady state.`
    );
  }
  if (restartHours > 24) {
    warnings.push(
      "Hold exceeds 24 h. Redraw a level before restarting rather than relying on the projection."
    );
  }
  if (measuredLevel >= 30) {
    warnings.push(
      "Level at or above 30 mcg/mL. Assess renal function and nephrotoxicity risk; a single-point projection assumes elimination is unchanged."
    );
  }

  return {
    ssPeak: ss.peak,
    ssTrough: ss.trough,
    ssAuc24: ss.auc24,
    optimalHoldHours,
    restartHours,
    residualAtRestart,
    firstPeak,
    firstTrough,
    troughDelta,
    regimenSupratherapeutic,
    auc24AfterRestart,
    aucDuringHold,
    aucExpectedDuringHold,
    status,
    warnings,
    curve,
    holdEndT: restartHours,
  };
}
