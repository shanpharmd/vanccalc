"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Clock, FlaskConical, Info } from "lucide-react";
import { VancoChart } from "./VancoChart";
import { twoLevelAnalysis, simulateConcentration, fmt } from "@/lib/vancoMath";
import type {
  NormalizedPatient,
  PKParams,
  TwoLevelInput,
  TwoLevelResult,
  TargetRange,
} from "@/lib/types";

interface Props {
  normalized: NormalizedPatient;
  populationPk: PKParams;
  target: TargetRange;
}

type PartialTL = Partial<TwoLevelInput>;

function isComplete(s: PartialTL): s is TwoLevelInput {
  return (
    typeof s.currentDose === "number" && s.currentDose > 0 &&
    typeof s.currentTau === "number" && s.currentTau > 0 &&
    typeof s.currentInfusionTime === "number" && s.currentInfusionTime > 0 &&
    typeof s.afterOneDoseOnly === "boolean" &&
    typeof s.level1Conc === "number" && s.level1Conc > 0 &&
    typeof s.level1TimeFromDose === "number" && s.level1TimeFromDose > 0 &&
    typeof s.level2Conc === "number" && s.level2Conc > 0 &&
    typeof s.level2TimeFromDose === "number" &&
    s.level2TimeFromDose > s.level1TimeFromDose
  );
}

function inputError(s: PartialTL): string | null {
  if (!isComplete(s)) return null;
  if (s.level1Conc! <= s.level2Conc!) return "Level 1 must be higher than Level 2 (Level 1 is drawn first).";
  if (s.level1TimeFromDose! < s.currentInfusionTime!) return "Level 1 must be drawn after end of infusion (elimination phase only).";
  if (s.level2TimeFromDose! < s.currentInfusionTime!) return "Level 2 must be drawn after end of infusion (elimination phase only).";
  return null;
}

export function TwoLevelAnalysis({ normalized, populationPk, target }: Props) {
  const [tl, setTl] = useState<PartialTL>({
    currentInfusionTime: 1.5,
    afterOneDoseOnly: false,
  });

  const update = (k: keyof TwoLevelInput, v: unknown) =>
    setTl((prev) => ({ ...prev, [k]: v }));

  const numInput = (
    field: keyof TwoLevelInput & (
      "currentDose" | "currentTau" | "currentInfusionTime" |
      "level1Conc" | "level1TimeFromDose" | "level2Conc" | "level2TimeFromDose"
    ),
    placeholder = "",
    step?: number
  ) => (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={(tl[field] as number | undefined) ?? ""}
      placeholder={placeholder}
      onChange={(e) =>
        update(field, e.target.value === "" ? undefined : Number(e.target.value))
      }
      className="field-input bg-white dark:bg-ink-950"
    />
  );

  const complete = isComplete(tl);
  const inputErr = inputError(tl);

  const result = useMemo<TwoLevelResult | null>(() => {
    if (!complete || inputErr) return null;
    return twoLevelAnalysis(tl as TwoLevelInput, normalized, target);
  }, [tl, normalized, target, complete, inputErr]);

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
          <h3 className="card-title">Current Regimen + Two Levels</h3>
        </div>

        <div className="space-y-3">
          {/* Current regimen */}
          <div className="grid grid-cols-3 gap-2">
            <Field label="Dose (mg)">
              {numInput("currentDose", "1000")}
            </Field>
            <Field label="Interval (h)">
              {numInput("currentTau", "12")}
            </Field>
            <Field label="Infusion (h)">
              {numInput("currentInfusionTime", "1.5", 0.5)}
            </Field>
          </div>

          {/* Steady-state toggle */}
          <div className="border-t border-ink-100 dark:border-ink-800 pt-3">
            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={tl.afterOneDoseOnly ?? false}
                onChange={(e) => update("afterOneDoseOnly", e.target.checked)}
                className="w-4 h-4 rounded border-ink-300 accent-brand-600"
              />
              <span className="text-xs font-medium text-ink-600 dark:text-ink-300 group-hover:text-ink-900 dark:group-hover:text-ink-100">
                Levels drawn after first dose only (not at steady state)
              </span>
            </label>
            <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-1 ml-6">
              {tl.afterOneDoseOnly
                ? "Using single-dose Vd — no accumulation assumed."
                : "Using steady-state Vd (recommended for most clinical situations)."}
            </p>
          </div>

          {/* Level 1 */}
          <div className="border-t border-ink-100 dark:border-ink-800 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 dark:text-ink-500 mb-2">
              Level 1 — Earlier (higher)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Concentration (mcg/mL)">
                {numInput("level1Conc", "e.g. 28.4", 0.1)}
              </Field>
              <Field label="Hours from START of infusion">
                {numInput("level1TimeFromDose", "e.g. 2.0", 0.25)}
              </Field>
            </div>
          </div>

          {/* Level 2 */}
          <div className="border-t border-ink-100 dark:border-ink-800 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 dark:text-ink-500 mb-2">
              Level 2 — Later (lower)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Concentration (mcg/mL)">
                {numInput("level2Conc", "e.g. 18.1", 0.1)}
              </Field>
              <Field label="Hours from START of infusion">
                {numInput("level2TimeFromDose", "e.g. 6.0", 0.25)}
              </Field>
            </div>
          </div>

          {/* Timing guidance */}
          <div className="rounded-lg border border-ink-100 dark:border-ink-800 bg-ink-50 dark:bg-ink-950/40 px-3 py-2">
            <p className="text-[11px] text-ink-500 dark:text-ink-400 leading-relaxed">
              Both levels must be drawn <strong>after</strong> the infusion ends (elimination phase).
              Timing is measured from the <strong>start</strong> of the infusion for the same dose.
              Levels must be drawn at least 2–4 h apart for reliable ke estimation.
            </p>
          </div>
        </div>

        {/* Validation error */}
        {inputErr && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <span className="text-xs text-red-700 dark:text-red-300">{inputErr}</span>
          </div>
        )}

        {!complete && !inputErr && (
          <p className="text-xs text-ink-400 dark:text-ink-500 mt-4 text-center">
            Fill all fields above to compute adjustment.
          </p>
        )}
      </div>

      {/* ── Patient PK vs Population ── */}
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
                  <PKRow label="kₑ (1/hr)" pop={result.populationPk.ke} pt={result.ke} decimals={4} />
                  <PKRow label="t½ (hr)" pop={result.populationPk.halfLife} pt={result.halfLife} decimals={1} />
                  <PKRow label="CL (L/hr)" pop={result.populationPk.cl} pt={result.cl} decimals={2} />
                  <PKRow
                    label={tl.afterOneDoseOnly ? "Vd — one dose (L)" : "Vd — SS (L)"}
                    pop={result.populationPk.vd}
                    pt={result.patientPk.vd}
                    decimals={1}
                  />
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-lg bg-ink-50 dark:bg-ink-950/50 border border-ink-200 dark:border-ink-800 p-3 space-y-1.5">
              <PKDetailRow
                label="Estimated CrCl (Matzke inverse)"
                value={`${result.estimatedCrCl.toFixed(0)} mL/min`}
                note={`vs population ${result.populationPk.crCl.toFixed(0)} mL/min`}
              />
              <PKDetailRow
                label="Vd from single-dose kinetics"
                value={`${result.vdOneDose.toFixed(1)} L (${(result.vdOneDose / normalized.weightKg).toFixed(2)} L/kg)`}
              />
              <PKDetailRow
                label="Vd at steady state"
                value={`${result.vdSteadyState.toFixed(1)} L (${(result.vdSteadyState / normalized.weightKg).toFixed(2)} L/kg)`}
              />
              <div className="border-t border-ink-200 dark:border-ink-700 pt-1.5 mt-1.5">
                <PKDetailRow
                  label="SS Cmax on current regimen"
                  value={`${fmt.conc(result.cmax)} mcg/mL`}
                />
                <PKDetailRow
                  label="SS Cmin on current regimen"
                  value={`${fmt.conc(result.cmin)} mcg/mL`}
                />
                <PKDetailRow
                  label="AUC₂₄ on current regimen"
                  value={`${fmt.auc(result.auc24Current)} mcg·h/mL`}
                  inRange={result.auc24Current >= target.aucMin && result.auc24Current <= target.aucMax}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="py-10 text-center text-sm text-ink-400 dark:text-ink-500">
            Enter regimen and both levels to see patient-specific PK.
          </div>
        )}
      </div>

      {/* ── Recommended adjustment ── */}
      {result && (
        <div className="card p-5 lg:col-span-5">
          <h3 className="card-title mb-4">Recommended Adjustment</h3>

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

      {/* ── AUC comparison ── */}
      {result && (
        <div className="card p-5 lg:col-span-7">
          <h3 className="card-title mb-4 border-b-2 border-accent-500 pb-2 inline-block">
            AUC₂₄ Comparison
          </h3>
          <div className="space-y-3">
            <AucBar label="Current regimen" auc={result.auc24Current} target={target} color="amber" />
            <AucBar label="Recommended regimen" auc={result.recommendedResult.auc24} target={target} color="cyan" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-ink-200 dark:border-ink-800 p-2.5">
              <div className="text-ink-500 dark:text-ink-400 mb-0.5">Vd used for dosing</div>
              <div className="font-semibold tabular-nums">
                {result.patientPk.vd.toFixed(1)} L ({result.patientPk.vdPerKg.toFixed(2)} L/kg)
              </div>
              <div className="text-ink-400 dark:text-ink-500 mt-0.5">
                {tl.afterOneDoseOnly ? "Single-dose method" : "Steady-state method"}
              </div>
            </div>
            <div className="rounded-lg border border-ink-200 dark:border-ink-800 p-2.5">
              <div className="text-ink-500 dark:text-ink-400 mb-0.5">Patient t½</div>
              <div className="font-semibold tabular-nums">{result.halfLife.toFixed(1)} h</div>
              <div className="text-ink-400 dark:text-ink-500 mt-0.5">
                vs population {result.populationPk.halfLife.toFixed(1)} h
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Supratherapeutic guidance ── */}
      {result && result.hoursUntil15 !== null && (
        <div className="card p-5 lg:col-span-12 border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <span className="font-semibold">Level 2 is above 15 mcg/mL.</span>{" "}
              Based on patient-specific ke ({result.ke.toFixed(4)} /hr), the concentration is estimated
              to reach 15 mcg/mL approximately{" "}
              <span className="font-bold">{result.hoursUntil15.toFixed(1)} hours</span> after the
              Level 2 draw. Hold the next dose until that window has passed, then reassess timing
              before restarting. Apply clinical judgment — distribution and assay variability affect
              this estimate.
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
            Both curves use patient-specific ke and CL back-calculated from the two measured levels.
            Simulation assumes steady-state conditions on the displayed regimen.
          </p>
        </div>
      )}

      {/* ── Method note ── */}
      <div className="card p-5 lg:col-span-12 border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed space-y-1">
            <p>
              <strong>Method:</strong> Two-level pharmacokinetic back-calculation. Patient-specific ke
              is derived directly from the slope of the two concentrations in the elimination phase.
              Vd is calculated algebraically using the post-infusion one-compartment equation; the
              steady-state form accounts for drug accumulation and is preferred when levels are drawn
              at steady state. CL = ke × Vd. CrCl is estimated via inverse Matzke for reference only.
            </p>
            <p>
              <strong>Accuracy requires:</strong> Both levels drawn post-infusion (at least 1–2 h
              after end of infusion); levels at least 2–4 h apart; levels from the same dosing
              interval; and if using steady-state Vd, patient should be at pharmacokinetic
              steady state (typically 3–5 half-lives into therapy).
            </p>
            <p>
              References: Matzke GR et al. DICP 1984;18(2):153-60 · Murphy JE. Clinical
              Pharmacokinetics, 6th ed. · ASHP/IDSA/SIDP Vancomycin Monitoring Guideline 2020.
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
        <div
          className="absolute top-0 h-full bg-accent-100 dark:bg-accent-900/30"
          style={{ left: `${targetMinPct}%`, width: `${targetMaxPct - targetMinPct}%` }}
        />
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
