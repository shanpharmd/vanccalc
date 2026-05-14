// Domain types for the vancomycin calculator

export type Sex = "male" | "female";
export type WeightUnit = "kg" | "lb";
export type HeightUnit = "in" | "cm";
export type CrUnit = "mg/dL" | "umol/L";

export interface PatientInput {
  age: number; // years
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
  scrMgDl: number;
  criticallyIll: boolean;
}

export interface PKParams {
  crCl: number;          // mL/min (Cockcroft-Gault)
  vd: number;            // L (total)
  vdPerKg: number;       // L/kg
  ke: number;            // 1/hr
  halfLife: number;      // hr
  cl: number;            // L/hr
  ibw: number;           // kg
  adjBw: number;         // kg
  bmi: number;
}

export interface DoseRegimen {
  dose: number;          // mg
  frequency: number;     // hours (tau)
  infusionTime: number;  // hours
}

export interface RegimenResult {
  regimen: DoseRegimen;
  auc24: number;
  peak: number;
  trough: number;
  aucMicRatio: number; // assuming MIC
}

export interface TargetRange {
  aucMin: number;       // 400 default
  aucMax: number;       // 600 default
  mic: number;          // 1.0 default
}

export interface SimulationPoint {
  t: number;     // hr from first dose
  c: number;     // mcg/mL
}
