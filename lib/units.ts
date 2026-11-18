import type { AmputationType, PatientInput, NormalizedPatient, ScrAdjustment, ValidationResult } from "./types";

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

/**
 * Elderly SCr rounding. At age >= 65 an SCr below 1.0 mg/dL is rounded up to 1.0
 * before CrCl is calculated, because low creatinine in older adults usually reflects
 * low muscle mass rather than preserved GFR. Matches the Cardinal Health vancomycin
 * calculator's "Adj SCr" field (82 y, SCr 0.88 -> 1). Applies to the vancomycin
 * engine only; the standalone CrCl tab mirrors MDCalc and does not round.
 */
export const ELDERLY_SCR_AGE = 65;
export const ELDERLY_SCR_MIN_MG_DL = 1.0;

export function adjustScr(
  rawScrMgDl: number,
  age: number
): { scrMgDl: number; adjustment: ScrAdjustment } {
  if (age >= ELDERLY_SCR_AGE && rawScrMgDl < ELDERLY_SCR_MIN_MG_DL) {
    return { scrMgDl: ELDERLY_SCR_MIN_MG_DL, adjustment: "elderly-round" };
  }
  if (rawScrMgDl < SCR_FLOOR_MG_DL) {
    return { scrMgDl: SCR_FLOOR_MG_DL, adjustment: "floor" };
  }
  return { scrMgDl: rawScrMgDl, adjustment: "none" };
}

/**
 * Fractional body-weight contribution of each limb segment.
 * Used to estimate pre-amputation weight for CrCl (CG / Salazar-Corcoran).
 * The entered patient weight is actual measured weight; we divide by (1 - factor)
 * to estimate what the patient would weigh with the limb present, since CG was
 * derived on non-amputee populations and uses weight as a creatinine-production proxy.
 * Source: Wurtz et al. Annals of Pharmacotherapy 1997; standard pharmacy references.
 */
export const AMPUTATION_FACTORS: Record<AmputationType, number> = {
  none:     0,
  bka_one:  0.059,   // below-knee, one leg
  aka_one:  0.11,    // above-knee, one leg
  full_leg: 0.16,    // entire leg
  bea_one:  0.023,   // below-elbow, one arm
  full_arm: 0.05,    // entire arm
};

export function normalizePatient(p: PatientInput): NormalizedPatient {
  const rawScr =
    p.creatinineUnit === "mg/dL" ? p.creatinine : umolToMgDl(p.creatinine);
  const weightKg = p.weightUnit === "kg" ? p.weight : lbToKg(p.weight);
  const amputationFactor = AMPUTATION_FACTORS[p.amputationType ?? "none"];
  // correctedWeightKg is the estimated pre-amputation weight for CrCl purposes only.
  // When there is no amputation, correctedWeightKg === weightKg.
  const correctedWeightKg = amputationFactor > 0
    ? weightKg / (1 - amputationFactor)
    : weightKg;
  const scr = adjustScr(rawScr, p.age);
  return {
    age: p.age,
    weightKg,
    correctedWeightKg,
    amputationFactor,
    heightCm: p.heightUnit === "cm" ? p.height : inToCm(p.height),
    sex: p.sex,
    scrMgDl: scr.scrMgDl,
    scrEnteredMgDl: rawScr,
    scrAdjustment: scr.adjustment,
    criticallyIll: p.criticallyIll,
    noRenalReplacement: p.noRenalReplacement ?? false,
    empiricVdLPerKg: p.empiricVdLPerKg,
    crClMethod: p.crClMethod ?? "cockcroft-gault",
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
  if (normalized.scrAdjustment === "elderly-round")
    warnings.push(
      `Entered SCr of ${rawScr.toFixed(2)} mg/dL rounded up to ${ELDERLY_SCR_MIN_MG_DL.toFixed(1)} mg/dL for CrCl (age ${ELDERLY_SCR_AGE} or older with SCr below ${ELDERLY_SCR_MIN_MG_DL.toFixed(1)}). This lowers the estimated clearance and the recommended dose.`
    );
  else if (rawScr < SCR_FLOOR_MG_DL)
    warnings.push(
      `Entered SCr of ${rawScr.toFixed(2)} mg/dL is below the CrCl calculation floor of ${SCR_FLOOR_MG_DL} mg/dL. A minimum of ${SCR_FLOOR_MG_DL} mg/dL has been applied to prevent overestimating renal function.`
    );
  if (normalized.age >= 75)
    warnings.push(
      "Patients ≥75 years: Cockcroft-Gault frequently overestimates GFR in the very elderly. Apply clinical judgment and consider a measured 24-hour urine CrCl if available."
    );
  if (normalized.amputationFactor > 0)
    warnings.push(
      `Amputation correction applied: entered weight of ${normalized.weightKg.toFixed(1)} kg adjusted to ${normalized.correctedWeightKg.toFixed(1)} kg for CrCl calculation (${(normalized.amputationFactor * 100).toFixed(1)}% limb-weight estimate added). Verify the entered weight is the patient's current measured weight.`
    );

  return { errors, warnings };
}
