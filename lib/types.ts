// Domain types for the vancomycin calculator

export type Sex = "male" | "female";
export type WeightUnit = "kg" | "lb";
export type HeightUnit = "in" | "cm";
export type CrUnit = "mg/dL" | "umol/L";
export type VdMethod = "ambrose-winter" | "population" | "manual";

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
}

export interface NormalizedPatient {
  age: number;
  weightKg: number;
  heightCm: number;
  sex: Sex;
  scrMgDl: number;           // SCr after applying floor; use this for all PK math
  criticallyIll: boolean;
  noRenalReplacement: boolean;
}

export interface PKParams {
  crCl: number;              // mL/min (Cockcroft-Gault)
  vd: number;                // L (total)
  vdPerKg: number;           // L/kg
  ke: number;                // 1/hr
  halfLife: number;          // hr
  cl: number;                // L/hr
  ibw: number;               // kg
  adjBw: number;             // kg
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
