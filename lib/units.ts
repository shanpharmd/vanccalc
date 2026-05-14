import type { PatientInput, NormalizedPatient } from "./types";

export const lbToKg = (lb: number) => lb * 0.453592;
export const kgToLb = (kg: number) => kg / 0.453592;
export const inToCm = (i: number) => i * 2.54;
export const cmToIn = (c: number) => c / 2.54;
export const umolToMgDl = (u: number) => u / 88.4;     // SCr conversion
export const mgDlToUmol = (m: number) => m * 88.4;

export function normalizePatient(p: PatientInput): NormalizedPatient {
  return {
    age: p.age,
    weightKg: p.weightUnit === "kg" ? p.weight : lbToKg(p.weight),
    heightCm: p.heightUnit === "cm" ? p.height : inToCm(p.height),
    sex: p.sex,
    scrMgDl: p.creatinineUnit === "mg/dL" ? p.creatinine : umolToMgDl(p.creatinine),
    criticallyIll: p.criticallyIll,
  };
}

export function isPatientComplete(p: Partial<PatientInput>): p is PatientInput {
  return (
    typeof p.age === "number" && p.age > 0 &&
    typeof p.weight === "number" && p.weight > 0 &&
    !!p.weightUnit &&
    !!p.sex &&
    typeof p.height === "number" && p.height > 0 &&
    !!p.heightUnit &&
    typeof p.creatinine === "number" && p.creatinine > 0 &&
    !!p.creatinineUnit
  );
}
