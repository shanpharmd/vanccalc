"use client";

import { useMemo, useState } from "react";
import { Activity, Copy, Check, Info } from "lucide-react";
import { Toggle } from "./Toggle";
import { lbToKg, kgToLb, inToCm, umolToMgDl } from "@/lib/units";

// Standalone Cockcroft-Gault creatinine clearance calculator.
// Mirrors MDCalc (calc/43) and GlobalRPh adult CrCl:
//   CrCl (mL/min) = (140 − age) × weight(kg) × (0.85 if female) / (72 × SCr)
//   IBW (Devine):  male 50 + 2.3×(height_in − 60); female 45.5 + 2.3×(height_in − 60)
//   AdjBW = IBW + 0.4 × (actual − IBW)
// Weight selection by BMI (Brown 2013 / Winter 2012):
//   BMI <18.5  → actual body weight (no adjustment)
//   BMI 18.5–24.9 → ideal body weight; range spans ideal↔actual
//   BMI ≥25    → adjusted body weight; range spans ideal↔adjusted

type Sex = "male" | "female";
type WeightUnit = "kg" | "lb";
type HeightUnit = "cm" | "in";
type ScrUnit = "mg/dL" | "umol/L";

interface CrClFields {
  sex: Sex;
  age?: number;
  weight?: number;
  weightUnit: WeightUnit;
  scr?: number;
  scrUnit: ScrUnit;
  height?: number;
  heightUnit: HeightUnit;
}

const EXAMPLE: CrClFields = {
  sex: "female",
  age: 64,
  weight: 94.7,
  weightUnit: "kg",
  scr: 2.4,
  scrUnit: "mg/dL",
  height: 170.18,
  heightUnit: "cm",
};

interface CrClResult {
  cgActual: number;
  ibwKg?: number;
  adjBwKg?: number;
  bmi?: number;
  category?: "underweight" | "normal" | "overweight";
  modified?: number;         // CrCl using the category-selected weight
  modifiedWeightKg?: number; // the weight used for the modified estimate
  modifiedWeightLabel?: string;
  rangeLow?: number;
  rangeHigh?: number;
  rangeNote?: string;
}

function computeCrCl(f: CrClFields): CrClResult | null {
  if (
    f.age === undefined || f.age <= 0 ||
    f.weight === undefined || f.weight <= 0 ||
    f.scr === undefined || f.scr <= 0
  ) {
    return null;
  }

  const wtKg = f.weightUnit === "kg" ? f.weight : lbToKg(f.weight);
  const scrMgDl = f.scrUnit === "mg/dL" ? f.scr : umolToMgDl(f.scr);
  const sexFactor = f.sex === "female" ? 0.85 : 1;

  const cg = (w: number) => ((140 - f.age!) * w * sexFactor) / (72 * scrMgDl);
  const cgActual = cg(wtKg);

  // Height is optional. Without it we can only report the actual-weight CG.
  if (f.height === undefined || f.height <= 0) {
    return { cgActual };
  }

  const heightCm = f.heightUnit === "cm" ? f.height : inToCm(f.height);
  const heightIn = heightCm / 2.54;
  const ibwKg = (f.sex === "female" ? 45.5 : 50) + 2.3 * (heightIn - 60);
  const adjBwKg = ibwKg + 0.4 * (wtKg - ibwKg);
  const bmi = wtKg / Math.pow(heightCm / 100, 2);

  const cgIbw = cg(ibwKg);
  const cgAdj = cg(adjBwKg);

  let category: CrClResult["category"];
  let modified: number;
  let modifiedWeightKg: number;
  let modifiedWeightLabel: string;
  let rangeLow: number;
  let rangeHigh: number;
  let rangeNote: string;

  if (bmi < 18.5) {
    category = "underweight";
    modified = cgActual;
    modifiedWeightKg = wtKg;
    modifiedWeightLabel = "actual body weight (no adjustment)";
    rangeLow = cgActual;
    rangeHigh = cgActual;
    rangeNote = "Underweight (BMI <18.5): actual/total body weight is used, no adjustment.";
  } else if (bmi < 25) {
    category = "normal";
    // If actual weight is below IBW, standard practice uses actual weight.
    const useWeight = wtKg < ibwKg ? wtKg : ibwKg;
    modified = cg(useWeight);
    modifiedWeightKg = useWeight;
    modifiedWeightLabel = wtKg < ibwKg
      ? "actual body weight (below IBW)"
      : "ideal body weight";
    rangeLow = Math.min(cgIbw, cgActual);
    rangeHigh = Math.max(cgIbw, cgActual);
    rangeNote = "Normal weight (BMI 18.5–24.9): estimate uses ideal body weight; range spans ideal and actual body weight.";
  } else {
    category = "overweight";
    modified = cgAdj;
    modifiedWeightKg = adjBwKg;
    modifiedWeightLabel = "adjusted body weight";
    rangeLow = Math.min(cgIbw, cgAdj);
    rangeHigh = Math.max(cgIbw, cgAdj);
    rangeNote = "Overweight/obese (BMI ≥25): estimate uses adjusted body weight; range spans IBW and adjusted body weight. Controversy exists over which weight to use.";
  }

  return {
    cgActual,
    ibwKg,
    adjBwKg,
    bmi,
    category,
    modified,
    modifiedWeightKg,
    modifiedWeightLabel,
    rangeLow,
    rangeHigh,
    rangeNote,
  };
}

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => n.toFixed(1);

export function CrClCalculator() {
  const [f, setF] = useState<CrClFields>({
    sex: "male",
    weightUnit: "kg",
    scrUnit: "mg/dL",
    heightUnit: "cm",
  });
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof CrClFields>(k: K, v: CrClFields[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const numOr = (v: string) => (v === "" ? undefined : Number(v));

  const result = useMemo(() => computeCrCl(f), [f]);
  const lowScr = f.scr !== undefined && (f.scrUnit === "mg/dL" ? f.scr : umolToMgDl(f.scr)) < 0.6;

  const copyResults = () => {
    if (!result) return;
    const lines = [
      `Creatinine clearance (Cockcroft-Gault)`,
      `Original (actual body weight): ${r0(result.cgActual)} mL/min`,
    ];
    if (result.category) {
      lines.push(
        `Modified for ${result.category} patient (${result.modifiedWeightLabel}): ${r0(result.modified!)} mL/min`,
        `Adjusted body weight: ${r0(result.adjBwKg!)} kg (${r0(kgToLb(result.adjBwKg!))} lb)`,
        `IBW: ${r0(result.ibwKg!)} kg · BMI: ${r1(result.bmi!)}`,
        `Range: ${r1(result.rangeLow!)}–${r1(result.rangeHigh!)} mL/min`
      );
    }
    navigator.clipboard?.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">
      {/* ── Inputs ── */}
      <div className="lg:col-span-5 card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          <h2 className="card-title">Creatinine Clearance (Cockcroft-Gault)</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="field-label">Sex</label>
            <Toggle
              value={f.sex}
              onChange={(v) => set("sex", v)}
              options={[
                { label: "Female", value: "female" },
                { label: "Male", value: "male" },
              ]}
            />
          </div>

          <div>
            <label className="field-label">Age (years)</label>
            <input
              type="number"
              inputMode="decimal"
              value={f.age ?? ""}
              placeholder="e.g. 65"
              onChange={(e) => set("age", numOr(e.target.value))}
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label">Weight</label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={f.weight ?? ""}
                placeholder="70"
                onChange={(e) => set("weight", numOr(e.target.value))}
                className="field-input"
              />
              <Toggle
                value={f.weightUnit}
                onChange={(v) => set("weightUnit", v)}
                options={[
                  { label: "kg", value: "kg" },
                  { label: "lb", value: "lb" },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="field-label">Serum creatinine</label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={f.scr ?? ""}
                placeholder="1.0"
                onChange={(e) => set("scr", numOr(e.target.value))}
                className="field-input"
              />
              <Toggle
                value={f.scrUnit}
                onChange={(v) => set("scrUnit", v)}
                options={[
                  { label: "mg/dL", value: "mg/dL" },
                  { label: "μmol/L", value: "umol/L" },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="field-label">
              Height <span className="text-ink-400 font-normal">· optional, enables IBW / AdjBW estimate</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={f.height ?? ""}
                placeholder="170"
                onChange={(e) => set("height", numOr(e.target.value))}
                className="field-input"
              />
              <Toggle
                value={f.heightUnit}
                onChange={(v) => set("heightUnit", v)}
                options={[
                  { label: "cm", value: "cm" },
                  { label: "in", value: "in" },
                ]}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setF(EXAMPLE)}
              className="btn-ghost bg-ink-100 dark:bg-ink-800"
            >
              Load example
            </button>
            <button
              onClick={() =>
                setF({ sex: "male", weightUnit: "kg", scrUnit: "mg/dL", heightUnit: "cm" })
              }
              className="btn-ghost text-rose-500 hover:bg-rose-500/10"
            >
              Clear
            </button>
          </div>

          {lowScr && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3">
              <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
                Serum creatinine is below 0.6 mg/dL. Some clinicians round low SCr up to
                0.8–1.0 mg/dL in elderly or low-muscle-mass patients to avoid overestimating
                renal function. This calculator uses the value as entered.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Result banner ── */}
      <div className="lg:col-span-7 space-y-4">
        <div className="rounded-2xl bg-gradient-to-br from-teal-700 via-emerald-700 to-emerald-800 text-white p-6 shadow-card">
          {!result ? (
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">Result</span>
              <span className="text-sm text-emerald-100/90">
                Enter age, weight, and creatinine
              </span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {/* Original */}
                <div className="sm:border-r sm:border-white/20 sm:pr-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight tabular-nums">
                      {r0(result.cgActual)}
                    </span>
                    <span className="text-sm text-emerald-100">mL/min</span>
                  </div>
                  <p className="text-[13px] text-emerald-50 mt-2 leading-snug">
                    Creatinine clearance, original Cockcroft-Gault
                  </p>
                </div>

                {/* Modified */}
                {result.category ? (
                  <div className="sm:border-r sm:border-white/20 sm:pr-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold tracking-tight tabular-nums">
                        {r0(result.modified!)}
                      </span>
                      <span className="text-sm text-emerald-100">mL/min</span>
                    </div>
                    <p className="text-[13px] text-emerald-50 mt-2 leading-snug">
                      Creatinine clearance modified for {result.category} patient, using{" "}
                      {result.modifiedWeightLabel} of {r0(result.modifiedWeightKg!)} kg (
                      {r0(kgToLb(result.modifiedWeightKg!))} lb).
                    </p>
                  </div>
                ) : (
                  <div className="sm:col-span-2 flex items-center">
                    <p className="text-[13px] text-emerald-50 leading-snug">
                      Add height to get the ideal / adjusted body weight estimate and the
                      weight-adjusted range.
                    </p>
                  </div>
                )}

                {/* Range */}
                {result.category && (
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold tracking-tight tabular-nums">
                        {r1(result.rangeLow!)}–{r1(result.rangeHigh!)}
                      </span>
                    </div>
                    <span className="text-sm text-emerald-100">mL/min</span>
                    <p className="text-[13px] text-emerald-50 mt-2 leading-snug">
                      {result.rangeNote}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-4">
                <button
                  onClick={copyResults}
                  className="inline-flex items-center gap-2 rounded-lg bg-white/15 hover:bg-white/25 px-3 py-1.5 text-sm font-medium transition"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy results"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Supporting body-size stats */}
        {result?.category && (
          <div className="card p-5">
            <h3 className="card-title mb-3">Body Size &amp; Weight Used</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Ideal body weight" value={`${r0(result.ibwKg!)} kg`} sub={`${r0(kgToLb(result.ibwKg!))} lb`} />
              <Stat
                label="Adjusted body weight"
                value={`${r0(result.adjBwKg!)} kg`}
                sub={`${r0(kgToLb(result.adjBwKg!))} lb`}
                highlight
              />
              <Stat label="BMI" value={r1(result.bmi!)} sub="kg/m²" />
              <Stat
                label="Weight category"
                value={
                  result.category === "overweight"
                    ? "Overweight/obese"
                    : result.category === "normal"
                    ? "Normal"
                    : "Underweight"
                }
              />
            </div>
          </div>
        )}

        {/* Methodology */}
        <div className="card p-5">
          <h3 className="card-title mb-3">Formula &amp; Method</h3>
          <div className="space-y-2 text-[13px] text-ink-600 dark:text-ink-300 leading-relaxed">
            <p className="font-mono text-xs bg-ink-50 dark:bg-ink-950 rounded-lg p-3 text-ink-800 dark:text-ink-200">
              CrCl (mL/min) = (140 − age) × weight(kg) × (0.85 if female) / (72 × SCr mg/dL)
            </p>
            <p>
              <strong>Ideal body weight (Devine):</strong> male 50 + 2.3 × (height in − 60);
              female 45.5 + 2.3 × (height in − 60).
            </p>
            <p>
              <strong>Adjusted body weight:</strong> IBW + 0.4 × (actual − IBW).
            </p>
            <p>
              Weight selection by BMI (Brown 2013 / Winter 2012): BMI &lt;18.5 uses actual
              weight; 18.5–24.9 uses ideal (range to actual); ≥25 uses adjusted (range to IBW).
              If actual weight is below IBW, actual weight is used.
            </p>
            <p className="text-[11px] text-ink-500 dark:text-ink-400 pt-1 border-t border-ink-200 dark:border-ink-800 mt-2">
              References: Cockcroft DW, Gault MH. Nephron 1976;16(1):31-41 · Winter MA et al.
              Pharmacotherapy 2012;32(7):604-12 · Brown DL et al. Ann Pharmacother
              2013;47(7-8):1039-44. Cockcroft-Gault estimates CrCl and may over-estimate GFR by
              10–20%. For informational use by healthcare professionals; not a substitute for
              clinical judgment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div
        className={`text-lg font-semibold tabular-nums ${
          highlight ? "text-emerald-600 dark:text-emerald-400" : "text-ink-900 dark:text-ink-100"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink-500 dark:text-ink-400">{sub}</div>}
    </div>
  );
}
