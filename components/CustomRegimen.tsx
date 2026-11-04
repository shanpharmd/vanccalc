"use client";

import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, Target, AlertTriangle, CornerDownLeft } from "lucide-react";
import { LevelBars } from "./LevelBars";
import { evaluateRegimen, solveFromPeakTrough, fmt } from "@/lib/vancoMath";
import type { PKParams, RegimenResult, TargetRange } from "@/lib/types";

type Mode = "manual" | "solve";

interface Props {
  pk: PKParams | null;
  target: TargetRange;
  /** The regimen currently recommended, for side-by-side comparison. */
  recommended: RegimenResult | null;
}

export function CustomRegimen({ pk, target, recommended }: Props) {
  const [mode, setMode] = useState<Mode>("manual");

  // Manual entry
  const [dose, setDose] = useState<number | undefined>(1000);
  const [freq, setFreq] = useState<number | undefined>(12);
  const [tInf, setTInf] = useState<number | undefined>(1);

  // Peak/trough targeting
  const [desiredPeak, setDesiredPeak] = useState<number | undefined>(35);
  const [desiredTrough, setDesiredTrough] = useState<number | undefined>(15);

  // Seed the manual fields from the recommendation the first time it appears.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!seeded && recommended) {
      setDose(recommended.regimen.dose);
      setFreq(recommended.regimen.frequency);
      setTInf(recommended.regimen.infusionTime);
      setSeeded(true);
    }
  }, [recommended, seeded]);

  const solution = useMemo(() => {
    if (!pk || mode !== "solve" || desiredPeak === undefined || desiredTrough === undefined) {
      return null;
    }
    return solveFromPeakTrough(pk, desiredPeak, desiredTrough, tInf ?? 1, target.mic);
  }, [pk, mode, desiredPeak, desiredTrough, tInf, target.mic]);

  const manualOk =
    !!pk &&
    dose !== undefined && dose > 0 &&
    freq !== undefined && freq > 0 &&
    tInf !== undefined && tInf > 0 && tInf < freq;

  const result = useMemo<RegimenResult | null>(() => {
    if (!pk) return null;
    if (mode === "solve") return solution?.feasible ? solution.rounded : null;
    if (!manualOk) return null;
    return evaluateRegimen(
      { dose: dose!, frequency: freq!, infusionTime: tInf!, doseCapped: false },
      pk,
      target.mic
    );
  }, [pk, mode, solution, manualOk, dose, freq, tInf, target.mic]);

  /** Push the solved regimen into the manual fields so it can be tweaked. */
  const adoptSolution = () => {
    if (!solution?.feasible) return;
    setDose(solution.rounded.regimen.dose);
    setFreq(solution.tauRounded);
    setTInf(solution.infusionTime);
    setMode("manual");
  };

  if (!pk) {
    return (
      <div className="card p-5 lg:col-span-12">
        <h3 className="card-title mb-2">Try Your Own Regimen</h3>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Complete patient demographics in the sidebar to model a custom regimen.
        </p>
      </div>
    );
  }

  const aucOut = result && (result.auc24 < target.aucMin || result.auc24 > target.aucMax);

  return (
    <div className="card p-5 lg:col-span-12">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <h3 className="card-title border-b-2 border-brand-500 pb-2 inline-block">
          Try Your Own Regimen
        </h3>
        <div className="toggle-group">
          <button
            onClick={() => setMode("manual")}
            className={`toggle-btn inline-flex items-center gap-1.5 ${
              mode === "manual" ? "toggle-btn-active" : ""
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            Enter dose and interval
          </button>
          <button
            onClick={() => setMode("solve")}
            className={`toggle-btn inline-flex items-center gap-1.5 ${
              mode === "solve" ? "toggle-btn-active" : ""
            }`}
          >
            <Target className="w-3 h-3" />
            Solve from peak and trough
          </button>
        </div>
      </div>

      <p className="text-xs text-ink-500 dark:text-ink-400 mt-2 mb-4 leading-relaxed">
        {mode === "manual"
          ? "Run any regimen you are considering through this patient's kinetics, including one the recommendation did not offer."
          : "Pick the peak and trough you want, and this solves for the interval and dose. AUC24 stays on screen because that is what ASHP/IDSA 2020 targets; peak and trough targeting constrains the regimen differently, it does not make it more accurate."}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ── Inputs ── */}
        <div className="lg:col-span-4 space-y-4">
          {mode === "manual" ? (
            <div className="grid grid-cols-2 gap-3">
              <Num label="Dose (mg)" value={dose} onChange={setDose} step={250} placeholder="1000" />
              <Num label="Interval (h)" value={freq} onChange={setFreq} placeholder="12" />
              <Num
                label="Infusion (h)"
                value={tInf}
                onChange={setTInf}
                step={0.5}
                placeholder="1"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Num
                label="Desired peak (mcg/mL)"
                value={desiredPeak}
                onChange={setDesiredPeak}
                step={1}
                placeholder="35"
              />
              <Num
                label="Desired trough (mcg/mL)"
                value={desiredTrough}
                onChange={setDesiredTrough}
                step={1}
                placeholder="15"
              />
              <Num
                label="Infusion (h)"
                value={tInf}
                onChange={setTInf}
                step={0.5}
                placeholder="1"
              />
            </div>
          )}

          {mode === "manual" && !manualOk && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Enter a dose, an interval, and an infusion time shorter than the interval.
            </p>
          )}

          {/* Solver output */}
          {mode === "solve" && solution && (
            <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-ink-50/50 dark:bg-ink-950/30 p-3.5">
              {solution.feasible ? (
                <>
                  <div className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
                    Exact solution
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-ink-900 dark:text-ink-100 mt-0.5">
                    {solution.doseExact.toFixed(1)} mg q{solution.tauExact.toFixed(1)}h
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400 mt-3">
                    Rounded to practice
                  </div>
                  <div className="text-xl font-semibold tabular-nums text-accent-600 dark:text-accent-400">
                    {solution.rounded.regimen.dose} mg q{solution.tauRounded}h
                  </div>
                  {solution.note && (
                    <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-2 leading-relaxed">
                      {solution.note}
                    </p>
                  )}
                  <button
                    onClick={adoptSolution}
                    className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    <CornerDownLeft className="w-3 h-3" />
                    Edit this regimen by hand
                  </button>
                </>
              ) : (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                  {solution.note}
                </p>
              )}
            </div>
          )}

          {/* Comparison against the recommendation */}
          {result && recommended && (
            <div className="rounded-xl border border-ink-200 dark:border-ink-800 p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-2">
                vs recommended
              </div>
              <Row
                label={`${recommended.regimen.dose} mg q${recommended.regimen.frequency}h`}
                value={`AUC ${fmt.auc(recommended.auc24)}`}
              />
              <Row
                label={`${result.regimen.dose} mg q${result.regimen.frequency}h`}
                value={`AUC ${fmt.auc(result.auc24)}`}
                delta={result.auc24 - recommended.auc24}
              />
            </div>
          )}
        </div>

        {/* ── Results ── */}
        <div className="lg:col-span-8">
          {result ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <Stat label="Peak" value={fmt.conc(result.peak)} unit="mcg/mL" />
                <Stat
                  label="Trough"
                  value={fmt.conc(result.trough)}
                  unit="mcg/mL"
                  warn={result.trough > 20}
                />
                <Stat
                  label="AUC24"
                  value={fmt.auc(result.auc24)}
                  unit="mg·h/L"
                  accent={!aucOut}
                  warn={!!aucOut}
                />
                <Stat
                  label="AUC / MIC"
                  value={fmt.auc(result.aucMicRatio)}
                  unit={`MIC ${target.mic} mg/L`}
                />
              </div>

              <LevelBars
                peak={result.peak}
                trough={result.trough}
                auc24={result.auc24}
                aucMin={target.aucMin}
                aucMax={target.aucMax}
              />

              {(aucOut || result.trough > 20) && (
                <div className="mt-4 space-y-2">
                  {aucOut && (
                    <Warn>
                      AUC24 of {fmt.auc(result.auc24)} falls{" "}
                      {result.auc24 > target.aucMax ? "above" : "below"} the {target.aucMin} to{" "}
                      {target.aucMax} target. Peak and trough can look acceptable while total
                      exposure is not, which is why the 2020 consensus moved to AUC.
                    </Warn>
                  )}
                  {result.trough > 20 && (
                    <Warn>
                      Predicted trough {fmt.conc(result.trough)} mcg/mL exceeds 20. Troughs above
                      this range carry a higher acute kidney injury risk.
                    </Warn>
                  )}
                </div>
              )}

              <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-4 leading-relaxed">
                Steady-state values using this patient&apos;s Ke{" "}
                <span className="font-mono">{pk.ke.toFixed(4)}</span> /h, t½{" "}
                <span className="font-mono">{pk.halfLife.toFixed(1)} h</span>, Vd{" "}
                <span className="font-mono">{pk.vd.toFixed(1)} L</span>. Peak is at end of infusion,
                trough at end of the interval.
              </p>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-ink-500 dark:text-ink-400 py-10">
              Enter a regimen to see predicted exposure.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── building blocks ── */

function Num({
  label,
  value,
  onChange,
  step,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="field-input"
      />
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  accent,
  warn,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  const color = warn
    ? "text-amber-600 dark:text-amber-400"
    : accent
    ? "text-accent-600 dark:text-accent-400"
    : "text-ink-900 dark:text-ink-100";
  return (
    <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-ink-50/50 dark:bg-ink-950/30 p-3.5">
      <div className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
        {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${color}`}>{value}</div>
      {unit && <div className="text-[11px] text-ink-500 dark:text-ink-400">{unit}</div>}
    </div>
  );
}

function Row({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number;
}) {
  return (
    <div className="flex items-baseline justify-between text-xs py-0.5">
      <span className="text-ink-600 dark:text-ink-300">{label}</span>
      <span className="tabular-nums text-ink-900 dark:text-ink-100">
        {value}
        {delta !== undefined && Math.abs(delta) >= 1 && (
          <span
            className={`ml-1.5 text-[11px] ${
              delta > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-brand-600 dark:text-brand-400"
            }`}
          >
            {delta > 0 ? "+" : ""}
            {Math.round(delta)}
          </span>
        )}
      </span>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/20 p-3">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">{children}</p>
    </div>
  );
}
