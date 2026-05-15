import type { PatientInput, NormalizedPatient, ValidationResult } from "./types";

export const lbToKg = (lb: number) => lb * 0.453592;
export const kgToLb = (kg: number) => kg / 0.453592;
export const inToCm = (i: number) => i * 2.54;
export const cmToIn = (c: number) => c / 2.54;
export const umolToMgDl = (u: number) => u / 88.4;
export const mgDlToUmol = (m: number) => m * 88.4;

/**
 * Minimum SCr applied in CrCl calculation to avoid overestimating renal function
 * in cachectic, frail, or low-muscle-mass patients. Institutional practice varies;
 * 0.6 mg/dL is a common conservative floor.
 */
export const SCR_FLOOR_MG_DL = 0.6;

export function normalizePatient(p: PatientInput): NormalizedPatient {
  const rawScr =
    p.creatinineUnit === "mg/dL" ? p.creatinine : umolToMgDl(p.creatinine);
  return {
    age: p.age,
    weightKg: p.weightUnit === "kg" ? p.weight : lbToKg(p.weight),
    heightCm: p.heightUnit === "cm" ? p.height : inToCm(p.height),
    sex: p.sex,
    scrMgDl: Math.max(rawScr, SCR_FLOOR_MG_DL),
    criticallyIll: p.criticallyIll,
    noRenalReplacement: p.noRenalReplacement ?? false,
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

/**
 * Validates physiological plausibility and flags clinical edge cases.
 * Errors block PK calculation. Warnings are surfaced alongside results.
 */
export function validatePatient(
  input: PatientInput,
  normalized: NormalizedPatient
): ValidationResult {
  const rawScr =
    input.creatinineUnit === "mg/dL"
      ? input.creatinine
      : umolToMgDl(input.creatinine);

  const errors: string[] = [];
  const warnings: string[] = [];

  // Hard errors — physiologically impossible values
  if (normalized.age < 1 || normalized.age > 120)
    errors.push("Age must be between 1 and 120 years.");
  if (normalized.weightKg < 10 || normalized.weightKg > 400)
    errors.push("Weight is outside the supported range (10–400 kg).");
  if (normalized.heightCm < 50 || normalized.heightCm > 250)
    errors.push("Height is outside the supported range (50–250 cm).");
  if (rawScr < 0.1 || rawScr > 25)
    errors.push(
      "Serum creatinine is outside the supported range (0.1–25 mg/dL equivalent)."
    );

  // Clinical warnings — results still shown, but flagged
  if (!input.noRenalReplacement)
    warnings.push(
      "Renal replacement therapy (CRRT, HD, PD) not excluded. This calculator uses native-kidney PK parameters and is not validated for RRT patients. Confirm patient status before acting on these results."
    );
  if (rawScr < SCR_FLOOR_MG_DL)
    warnings.push(
      `Entered SCr of ${rawScr.toFixed(2)} mg/dL is below the CrCl calculation floor of ${SCR_FLOOR_MG_DL} mg/dL. A minimum of ${SCR_FLOOR_MG_DL} mg/dL has been applied to prevent overestimating renal function.`
    );
  if (normalized.age >= 75)
    warnings.push(
      "Patients ≥75 years: Cockcroft-Gault frequently overestimates GFR in the very elderly. Apply clinical judgment and consider a measured 24-hour urine CrCl if available."
    );

  return { errors, warnings };
}
