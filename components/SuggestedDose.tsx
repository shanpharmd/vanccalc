"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import { fmt } from "@/lib/vancoMath";
import type { PKParams, RegimenResult, TargetRange } from "@/lib/types";

interface Props {
  result: RegimenResult | null;
  loadingDose: number | null;
  target: TargetRange;
  criticallyIll: boolean;
  pk?: PKParams | null;
}

export function SuggestedDose({ result, loadingDose, target, criticallyIll, pk }: Props) {
  return (
    <div className="card p-5 lg:col-span-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-brand-600" />
        <h3 className="card-title">Suggested Maintenance Dose</h3>
      </div>

      {result ? (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Dose" value={fmt.mg(result.regimen.dose)} big />
            <Stat label="Frequency" value={`q${result.regimen.frequency}h`} big />
            <Stat label="Infusion" value={`${result.regimen.infusionTime} h`} big />
          </div>

          {result.regimen.doseCapped && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span className="text-xs text-amber-700 dark:text-amber-300">
                Dose capped at 3,500 mg absolute maximum. Consider individualized
                Bayesian dosing for this patient.
              </span>
            </div>
          )}

          <div className="rounded-lg bg-ink-50 dark:bg-ink-950/50 border border-ink-200 dark:border-ink-800 p-3 space-y-1.5">
            <Row
              label="AUC₂₄"
              value={`${fmt.auc(result.auc24)} mcg·h/mL`}
              inRange={result.auc24 >= target.aucMin && result.auc24 <= target.aucMax}
            />
            <Row label="AUC₂₄ / MIC" value={fmt.auc(result.aucMicRatio)} />
            <Row label="Predicted peak" value={`${fmt.conc(result.peak)} mcg/mL`} />
            <Row label="Predicted trough" value={`${fmt.conc(result.trough)} mcg/mL`} />
          </div>

          {pk && <DoseBasis pk={pk} />}

          {loadingDose !== null && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-accent-500/30 bg-accent-500/5 p-3">
              <div className="text-xs">
                <div className="font-semibold text-accent-600 dark:text-accent-400">
                  Loading dose
                  {!criticallyIll && (
                    <span className="font-normal text-ink-500 dark:text-ink-400">
                      {" "}— consider for serious infections
                    </span>
                  )}
                </div>
                <div className="text-ink-700 dark:text-ink-200 mt-0.5">
                  {fmt.mg(loadingDose)} once, then start maintenance after one dosing
                  interval.
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-3">
      <div className="stat-label">{label}</div>
      <div
        className={
          big
            ? "text-xl font-bold tabular-nums text-ink-900 dark:text-ink-50 mt-1"
            : "stat-value mt-0.5"
        }
      >
        {value}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  inRange,
}: {
  label: string;
  value: string;
  inRange?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-ink-500 dark:text-ink-400">{label}</span>
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
    </div>
  );
}

/** The population PK inputs behind the recommendation, so the weight and SCr basis are visible. */
function DoseBasis({ pk }: { pk: PKParams }) {
  const scrChanged = pk.scrAdjustment === "elderly-round" || pk.scrAdjustment === "floor";
  const vdWeight =
    pk.vdWeightKg != null
      ? `${pk.vdWeightKg.toFixed(1)} kg ${pk.vdWeightBasis === "adjusted" ? "AdjBW" : "actual"}`
      : null;
  return (
    <div className="mt-3 rounded-lg border border-ink-200 dark:border-ink-800 p-3">
      <div className="stat-label mb-1.5">Dose basis</div>
      <div className="space-y-1.5">
        {pk.scrUsedMgDl != null && (
          <Row
            label="SCr used"
            value={
              scrChanged && pk.scrEnteredMgDl != null
                ? `${pk.scrUsedMgDl.toFixed(2)} mg/dL (entered ${pk.scrEnteredMgDl.toFixed(2)})`
                : `${pk.scrUsedMgDl.toFixed(2)} mg/dL`
            }
          />
        )}
        <Row label="CrCl" value={`${pk.crCl.toFixed(0)} mL/min`} />
        <Row label="kₑ" value={`${fmt.num(pk.ke, 4)} /h`} />
        <Row label="Vd" value={`${pk.vd.toFixed(1)} L (${pk.vdPerKg.toFixed(2)} L/kg)`} />
        {vdWeight && <Row label="Vd weight" value={vdWeight} />}
        <Row label="Clearance" value={`${pk.cl.toFixed(2)} L/h`} />
      </div>
      {pk.scrAdjustment === "elderly-round" && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2 leading-snug">
          SCr rounded up to 1.0 mg/dL: age 65 or older with SCr below 1.0.
        </p>
      )}
      {pk.vdWeightBasis === "adjusted" && (
        <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-1 leading-snug">
          Vd uses AdjBW because actual weight exceeds 120% of IBW.
        </p>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-sm text-ink-500 dark:text-ink-400 py-6 text-center">
      Enter patient information to generate a dose recommendation.
    </div>
  );
}
