// Domain types for the vancomycin calculator

export type Sex = "male" | "female";
export type WeightUnit = "kg" | "lb";
export type HeightUnit = "in" | "cm";
export type CrUnit = "mg/dL" | "umol/L";
export type VdMethod = "ambrose-winter" | "population" | "manual";

/**
 * Fractional limb-weight correction used to estimate pre-amputation body weight
 * for Cockcroft-Gault and Salazar-Corcoran CrCl calculations.
 * Source: Wurtz et al.; published limb-weight fraction estimates.
 */
export type AmputationType =
  | "none"
  | "bka_one"    // below-knee, one leg — ~5.9% TBW
  | "aka_one"    // above-knee, one leg — ~11% TBW
  | "full_leg"   // entire leg — ~16% TBW
  | "bea_one"    // below-elbow, one arm — ~2.3% TBW
  | "full_arm";  // entire arm — ~5% TBW

export interface PatientInput {
  age: number;               // years
  weight: number;
  weightUnit: WeightUnit;
  sex: Sex;
  height: number;
  heightUnit: HeightUnit;
  creatinine: number;
  creatinineUnit: CrUnit;
  criticallyIll: boolean;
  noRenalReplacement: boolean;
  amputationType?: AmputationType;  // optional; adjusts CrCl weight only
  empiricVdLPerKg?: number;         // optional Vd override (L/kg) for empiric dosing
}

export interface NormalizedPatient {
  age: number;
  weightKg: number;             // actual measured weight — used for dosing and Vd
  correctedWeightKg: number;    // amputation-adjusted weight — used for CrCl only
  amputationFactor: number;     // fraction applied (0 = none; e.g. 0.059 = BKA)
  heightCm: number;
  sex: Sex;
  scrMgDl: number;              // SCr after applying floor; use this for all PK math
  criticallyIll: boolean;
  noRenalReplacement: boolean;
  empiricVdLPerKg?: number;     // if set, overrides auto Vd selection in pkParams
}

export interface PKParams {
  crCl: number;                              // mL/min
  crClMethod: "cockcroft-gault" | "salazar-corcoran";
  amputationCorrectionPct?: number;          // e.g. 5.9 for BKA; undefined when none
  vd: number;                                // L (total)
  vdPerKg: number;                           // L/kg
  ke: number;                                // 1/hr
  halfLife: number;                          // hr
  cl: number;                                // L/hr
  ibw: number;                               // kg
  adjBw: number;                             // kg
  bmi: number;
}

export interface DoseRegimen {
  dose: number;              // mg
  frequency: number;         // hours (tau)
  infusionTime: number;      // hours
  doseCapped: boolean;       // true when dose was limited by the 3500 mg absolute ceiling
}

export interface RegimenResult {
  regimen: DoseRegimen;
  auc24: number;
  peak: number;
  trough: number;
  aucMicRatio: number;
}

export interface TargetRange {
  aucMin: number;            // 400 default
  aucMax: number;            // 600 default
  mic: number;               // 1.0 default
}

export interface SimulationPoint {
  t: number;                 // hr from first dose
  c: number;                 // mcg/mL
}

export interface ValidationResult {
  errors: string[];          // physiologically impossible — calculator blocked
  warnings: string[];        // clinically notable — results shown but flagged
}

// ---------- Two-level analysis types ----------

/**
 * Two serum levels drawn at known times after a dose.
 * Both levels must be post-infusion (in the elimination phase).
 * Level 1 = earlier (higher concentration); Level 2 = later (lower concentration).
 * Timing is measured from the START of the infusion for the same dose.
 */
export interface TwoLevelInput {
  currentDose: number;           // mg — dose patient is currently receiving
  currentTau: number;            // hrs — current dosing interval
  currentInfusionTime: number;   // hrs
  afterOneDoseOnly: boolean;     // true = levels drawn after the very first dose
  level1Conc: number;            // mcg/mL — earlier (higher) level
  level1TimeFromDose: number;    // hrs from START of infusion when level 1 was drawn
  level2Conc: number;            // mcg/mL — later (lower) level
  level2TimeFromDose: number;    // hrs from START of infusion when level 2 was drawn
}

export interface TwoLevelResult {
  ke: number;                    // /hr — patient-specific, back-calculated
  halfLife: number;              // hr
  vdOneDose: number;             // L — Vd extrapolated from single-dose kinetics
  vdSteadyState: number;         // L — Vd calculated from steady-state equation
  cl: number;                    // L/hr — using selected Vd
  estimatedCrCl: number;         // mL/min — back-calculated from Matzke inverse
  cmax: number;                  // mcg/mL — SS Cmax on current regimen
  cmin: number;                  // mcg/mL — SS Cmin on current regimen
  auc24Current: number;          // mg·h/L — AUC24 on current regimen
  currentRegimen: DoseRegimen;   // for simulation chart
  patientPk: PKParams;
  populationPk: PKParams;
  recommendedRegimen: DoseRegimen;
  recommendedResult: RegimenResult;
  hoursUntil15: number | null;   // hrs from level 2 draw until conc reaches 15 mcg/mL
}

// ---------- Single-level analysis types ----------

export interface SingleLevelInput {
  currentDose: number;           // mg
  currentFrequency: number;      // hrs (tau)
  currentInfusionTime: number;   // hrs
  measuredTrough: number;        // mcg/mL
  hoursBeforeNextDose: number;   // hrs; 0.08 ≈ 5 min before next dose (true trough)
  vdMethod: VdMethod;
  manualVdLPerKg?: number;       // only used when vdMethod === "manual"
}

export interface SingleLevelResult {
  // Patient-specific PK derived from measured level
  vd: number;                // L
  vdPerKg: number;           // L/kg
  ke: number;                // 1/hr (patient-specific, back-calculated)
  halfLife: number;          // hr
  cl: number;                // L/hr
  patientPk: PKParams;       // full PK object for downstream calcs
  populationPk: PKParams;    // population PK for comparison display
  // Level interpretation
  trueTrough: number;        // extrapolated true trough (just before next dose)
  estimatedPeak: number;     // estimated Cmax on current regimen
  currentAuc24: number;      // AUC24 on current regimen with patient-specific CL
  currentRegimen: DoseRegimen; // current regimen (for chart)
  // Recommendation
  recommendedRegimen: DoseRegimen;
  recommendedResult: RegimenResult;
}
