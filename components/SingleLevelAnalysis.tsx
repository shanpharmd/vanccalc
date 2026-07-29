"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FlaskConical, Info } from "lucide-react";
import { Toggle } from "./Toggle";
import { VancoChart } from "./VancoChart";
import { singleLevelAnalysis, simulateConcentration, fmt } from "@/lib/vancoMath";
import type {
  NormalizedPatient,
  PKParams,
  SingleLevelInput,
  SingleLevelResult,
  TargetRange,
  VdMethod,
} from "@/lib/types";

interface Props {
  normalized: NormalizedPatient;
  populationPk: PKParams;
  target: TargetRange;
}

type PartialSL = Partial<SingleLevelInput>;

function isComplete(s: PartialSL): s is SingleLevelInput {
  return (
    typeof s.currentDose === "number" && s.currentDose > 0 &&
    typeof s.currentFrequency === "number" && s.currentFrequency > 0 &&
    typeof s.currentInfusionTime === "number" && s.currentInfusionTime > 0 &&
    typeof s.measuredTrough === "number" && s.measuredTrough > 0 &&
    typeof s.hoursBeforeNextDose === "number" && s.hoursBeforeNextDose >= 0 &&
    !!s.vdMethod
  );
}

export function SingleLevelAnalysis({ normalized, populationPk, target }: Props) {
  const [sl, setSl] = useState<PartialSL>({
    vdMethod: "ambrose-winter",
    currentInfusionTime: 1.5,
    hoursBeforeNextDose: 0.08,
  });

  const update = (k: keyof SingleLevelInput, v: unknown) =>
    setSl((prev) => ({ ...prev, [k]: v }));

  const numInput = (
    field: keyof SingleLevelInput & (
      "currentDose" | "currentFrequency" | "currentInfusionTime" |
      "measuredTrough" | "hoursBeforeNextDose" | "manualVdLPerKg"
    ),
    placeholder = "",
    step?: number
  ) => (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={(sl[field] as number | undefined) ?? ""}
      placeholder={placeholder}
      onChange={(e) =>
        update(field, e.target.value === "" ? undefined : Number(e.target.value))
      }
      className="field-input bg-white dark:bg-ink-950"
    />
  );

  const complete = isComplete(sl);

  const result = useMemo<SingleLevelResult | null>(() => {
    if (!complete) return null;
    return singleLevelAnalysis(sl as SingleLevelInput, normalized, target);
  }, [sl, normalized, target, complete]);

  const currentSim = useMemo(
    () =>
      result ? simulateConcentration(result.currentRegimen, result.patientPk, 96, 0.25) : [],
    [result]
  );
  const recommendedSim = useMemo(
    () =>
      result
        ? simulateConcentration(result.recommendedRegimen, result.patientPk, 96, 0.25)
        : [],
    [result]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">

      {/* ── Input card ── */}
      <div className="card p-5 lg:col-span-5">
        <div className="flex items-center gap-2 mb-4">
          <FlaskConical className="w-4 h-4 text-brand-600" />
          <h3 className="card-title">Current Regimen + Measured Level</h3>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Dose (mg)">
              {numInput("currentDose", "1000")}
            </Field>
            <Field label="Interval (h)">
              {numInput("currentFrequency", "12")}
            </Field>
            <Field label="Infusion (h)">
              {numInput("currentInfusionTime", "1.5", 0.5)}
            </Field>
          </div>

          <div className="border-t border-ink-100 dark:border-ink-800 pt-3">
            <Field label="Measured trough (mcg/mL)">
              {numInput("measuredTrough", "e.g. 12.5")}
            </Field>
          </div>

          <Field label="Hours before next dose when drawn">
            {numInput("hoursBeforeNextDose", "0.08", 0.01)}
            <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-1">
              0.08 ≈ 5 min (true trough) · 1.0 = drawn 1 h early
            </p>
          </Field>

          <div className="border-t border-ink-100 dark:border-ink-800 pt-3">
            <Field label="Vd method">
              <Toggle
                value={sl.vdMethod ?? "ambrose-winter"}
                onChange={(v) => update("vdMethod", v as VdMethod)}
                options={[
                  { label: "A-W", value: "ambrose-winter" },
                  { label: "Population", value: "population" },
                  { label: "Manual", value: "manual" },
                ]}
              />
            </Field>

            {sl.vdMethod === "ambrose-winter" && (
              <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-2">
                Vd = (0.17 × age) + (0.22 × TBW) + 15 &nbsp;·&nbsp; Ambrose &amp; Winter, 2004
              </p>
            )}
            {sl.vdMethod === "population" && (
              <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-2">
                Using {normalized.criticallyIll ? "0.8" : "0.7"} L/kg × TBW from patient demographics
              </p>
            )}
            {sl.vdMethod === "manual" && (
              <Field label="Vd (L/kg)" className="mt-2">
                {numInput("manualVdLPerKg", "0.7", 0.05)}
              </Field>
            )}
          </div>
        </div>

        {!complete && (
          <p className="text-xs text-ink-400 dark:text-ink-500 mt-4 text-center">
            Fill all fields above to compute adjustment.
          </p>
        )}
      </div>

      {/* ── Patient-specific PK vs Population ── */}
      <div className="card p-5 lg:col-span-7">
        <h3 className="card-title mb-4 border-b-2 border-brand-500 pb-2 inline-block">
          Patient-Specific vs Population PK
        </h3>

        {result ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 border-b border-ink-200 dark:border-ink-800">
                    <th className="text-left font-medium py-2 pr-4">Parameter</th>
                    <th className="text-right font-medium py-2 px-3">Population</th>
                    <th className="text-right font-medium py-2 px-3 text-brand-600 dark:text-brand-400">
                      Patient-Specific
                    </th>
                    <th className="text-right font-medium py-2 pl-3">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  <PKRow
                    label="kₑ (1/hr)"
                    pop={result.populationPk.ke}
                    pt={result.ke}
                    decimals={4}
                  />
                  <PKRow
                    label="t½ (hr)"
                    pop={result.populationPk.halfLife}
                    pt={result.halfLife}
                    decimals={1}
                  />
                  <PKRow
                    label="CL (L/hr)"
                    pop={result.populationPk.cl}
                    pt={result.cl}
                    decimals={2}
                  />
                  <PKRow
                    label="Vd (L)"
                    pop={result.populationPk.vd}
                    pt={result.vd}
                    decimals={1}
                  />
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-lg bg-ink-50 dark:bg-ink-950/50 border border-ink-200 dark:border-ink-800 p-3 space-y-1.5">
              <PKDetailRow
                label="Measured trough"
                value={`${fmt.conc(result.patientPk.crCl === result.populationPk.crCl ? sl.measuredTrough ?? 0 : sl.measuredTrough ?? 0)} mcg/mL`}
              />
              <PKDetailRow
                label="Extrapolated true trough"
                value={`${fmt.conc(result.trueTrough)} mcg/mL`}
                note={
                  (sl.hoursBeforeNextDose ?? 0) > 0.1
                    ? `(corrected for ${sl.hoursBeforeNextDose}h early draw)`
                    : "(drawn at true trough time)"
                }
              />
              <PKDetailRow
                label="Estimated Cmax"
                value={`${fmt.conc(result.estimatedPeak)} mcg/mL`}
              />
              <PKDetailRow
                label="AUC₂₄ on current regimen"
                value={`${fmt.auc(result.currentAuc24)} mcg·h/mL`}
                inRange={result.currentAuc24 >= target.aucMin && result.currentAuc24 <= target.aucMax}
              />
            </div>
          </>
        ) : (
          <div className="py-10 text-center text-sm text-ink-400 dark:text-ink-500">
            Enter regimen and level to see patient-specific PK.
          </div>
        )}
      </div>

      {/* ── Recommended adjustment ── */}
      {result && (
        <div className="card p-5 lg:col-span-5">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="card-title">Recommended Adjustment</h3>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <BigStat label="Dose" value={fmt.mg(result.recommendedRegimen.dose)} />
            <BigStat label="Frequency" value={`q${result.recommendedRegimen.frequency}h`} />
            <BigStat label="Infusion" value={`${result.recommendedRegimen.infusionTime} h`} />
          </div>

          {result.recommendedRegimen.doseCapped && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span className="text-xs text-amber-700 dark:text-amber-300">
                Dose capped at 3,500 mg. Consider individualized Bayesian dosing.
              </span>
            </div>
          )}

          <div className="rounded-lg bg-ink-50 dark:bg-ink-950/50 border border-ink-200 dark:border-ink-800 p-3 space-y-1.5">
            <PKDetailRow
              label="AUC₂₄"
              value={`${fmt.auc(result.recommendedResult.auc24)} mcg·h/mL`}
              inRange={
                result.recommendedResult.auc24 >= target.aucMin &&
                result.recommendedResult.auc24 <= target.aucMax
              }
            />
            <PKDetailRow
              label="AUC₂₄ / MIC"
              value={fmt.auc(result.recommendedResult.aucMicRatio)}
            />
            <PKDetailRow
              label="Predicted peak"
              value={`${fmt.conc(result.recommendedResult.peak)} mcg/mL`}
            />
            <PKDetailRow
              label="Predicted trough"
              value={`${fmt.conc(result.recommendedResult.trough)} mcg/mL`}
            />
          </div>
        </div>
      )}

      {/* ── AUC comparison card ── */}
      {result && (
        <div className="card p-5 lg:col-span-7">
          <h3 className="card-title mb-4 border-b-2 border-accent-500 pb-2 inline-block">
            AUC₂₄ Comparison
          </h3>
          <div className="space-y-3">
            <AucBar
              label="Current regimen"
              auc={result.currentAuc24}
              target={target}
              color="amber"
            />
            <AucBar
              label="Recommended regimen"
              auc={result.recommendedResult.auc24}
              target={target}
              color="cyan"
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-ink-200 dark:border-ink-800 p-2.5">
              <div className="text-ink-500 dark:text-ink-400 mb-0.5">Current Vd</div>
              <div className="font-semibold tabular-nums">
                {result.vd.toFixed(1)} L ({result.vdPerKg.toFixed(2)} L/kg)
              </div>
              <div className="text-ink-400 dark:text-ink-500 mt-0.5 capitalize">
                {sl.vdMethod === "ambrose-winter" ? "Ambrose-Winter" : sl.vdMethod} method
              </div>
            </div>
            <div className="rounded-lg border border-ink-200 dark:border-ink-800 p-2.5">
              <div className="text-ink-500 dark:text-ink-400 mb-0.5">Patient t½</div>
              <div className="font-semibold tabular-nums">
                {result.halfLife.toFixed(1)} h
              </div>
              <div className="text-ink-400 dark:text-ink-500 mt-0.5">
                vs population {result.populationPk.halfLife.toFixed(1)} h
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Dual-series PK chart ── */}
      {result && recommendedSim.length > 0 && (
        <div className="card p-5 lg:col-span-12">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="card-title">Predicted Concentration–Time Curve</h3>
            <div className="flex items-center gap-4 text-xs text-ink-500 dark:text-ink-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-6 h-0.5 border-t-2 border-dashed border-amber-500" />
                Current ({result.currentRegimen.dose} mg q{result.currentRegimen.frequency}h)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-6 h-0.5 bg-brand-600" />
                Recommended ({result.recommendedRegimen.dose} mg q{result.recommendedRegimen.frequency}h)
              </span>
            </div>
          </div>

          <VancoChart
            data={recommendedSim}
            ghost={currentSim}
            frequency={result.recommendedRegimen.frequency}
            infusionTime={result.recommendedRegimen.infusionTime}
            hoursTotal={96}
            peak={result.recommendedResult.peak}
            trough={result.recommendedResult.trough}
          />
          <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-2">
            Both curves use patient-specific ke and CL derived from the measured trough. Simulation assumes steady state.
          </p>
        </div>
      )}

      {/* ── Method note ── */}
      <div className="card p-5 lg:col-span-12 border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed space-y-1">
            <p>
              <strong>Method:</strong> Ambrose-Winter single-trough back-calculation. Uses a
              population Vd estimate (A-W formula, population, or manual) and one measured trough
              to derive patient-specific ke and CL. Two iterations are used to stabilize the
              trough extrapolation.
            </p>
            <p>
              <strong>Limitation:</strong> ASHP/IDSA 2020 recommends two-level Bayesian adjustment
              when feasible, as it is more accurate than single-trough methods. Use single-level
              results as a guide and apply clinical judgment — particularly when the trough was
              drawn significantly before the next dose or at non-steady-state conditions.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}

// ---------- sub-components ----------

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function PKRow({
  label,
  pop,
  pt,
  decimals,
}: {
  label: string;
  pop: number;
  pt: number;
  decimals: number;
}) {
  const delta = ((pt - pop) / pop) * 100;
  const sign = delta >= 0 ? "+" : "";
  const color =
    Math.abs(delta) > 30
      ? "text-amber-600 dark:text-amber-400"
      : "text-ink-700 dark:text-ink-300";
  return (
    <tr className="border-b border-ink-100 dark:border-ink-800 last:border-0">
      <td className="py-2.5 pr-4 text-xs text-ink-500 dark:text-ink-400">{label}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-ink-700 dark:text-ink-300">
        {pop.toFixed(decimals)}
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-brand-700 dark:text-brand-300">
        {pt.toFixed(decimals)}
      </td>
      <td className={`py-2.5 pl-3 text-right tabular-nums text-xs ${color}`}>
        {sign}{delta.toFixed(0)}%
      </td>
    </tr>
  );
}

function PKDetailRow({
  label,
  value,
  note,
  inRange,
}: {
  label: string;
  value: string;
  note?: string;
  inRange?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-ink-500 dark:text-ink-400 text-xs shrink-0">{label}</span>
      <span className="text-right">
        <span
          className={`font-medium tabular-nums ${
            inRange === undefined
              ? "text-ink-900 dark:text-ink-100"
              : inRange
              ? "text-accent-600 dark:text-accent-400"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {value}
        </span>
        {note && (
          <span className="text-[11px] text-ink-400 dark:text-ink-500 ml-1">{note}</span>
        )}
      </span>
    </div>
  );
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-3">
      <div className="stat-label">{label}</div>
      <div className="text-xl font-bold tabular-nums text-ink-900 dark:text-ink-50 mt-1">
        {value}
      </div>
    </div>
  );
}

function AucBar({
  label,
  auc,
  target,
  color,
}: {
  label: string;
  auc: number;
  target: TargetRange;
  color: "amber" | "cyan";
}) {
  const inRange = auc >= target.aucMin && auc <= target.aucMax;
  // Normalize bar: max display = 800
  const maxDisplay = 800;
  const pct = Math.min((auc / maxDisplay) * 100, 100);
  const targetMinPct = (target.aucMin / maxDisplay) * 100;
  const targetMaxPct = (target.aucMax / maxDisplay) * 100;

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-ink-600 dark:text-ink-300">{label}</span>
        <span
          className={`font-semibold tabular-nums ${
            inRange ? "text-accent-600 dark:text-accent-400" : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {fmt.auc(auc)} mcg·h/mL
        </span>
      </div>
      <div className="relative h-4 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
        {/* Target zone */}
        <div
          className="absolute top-0 h-full bg-accent-100 dark:bg-accent-900/30"
          style={{ left: `${targetMinPct}%`, width: `${targetMaxPct - targetMinPct}%` }}
        />
        {/* AUC bar */}
        <div
          className={`absolute top-0 h-full rounded-full transition-all ${
            color === "amber"
              ? "bg-amber-400 dark:bg-amber-500"
              : "bg-brand-600 dark:bg-brand-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className="text-[10px] text-ink-400 dark:text-ink-500 mt-0.5"
        style={{ paddingLeft: `${targetMinPct}%` }}
      >
        Target {target.aucMin}–{target.aucMax}
      </div>
    </div>
  );
}
