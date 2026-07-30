"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FlaskConical, Info } from "lucide-react";
import { Toggle } from "./Toggle";
import { VancoChart } from "./VancoChart";
import {
  singleLevelAnalysis,
  simulateConcentration,
  evaluateRegimen,
  fmt,
} from "@/lib/vancoMath";
import {
  randomLevelAnalysis,
  steadyStateCheck,
  type RandomLevelResult,
} from "@/lib/nonSteadyState";
import type {
  DoseRegimen,
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

type LevelMode = "trough" | "random";

export function SingleLevelAnalysis({ normalized, populationPk, target }: Props) {
  const [mode, setMode] = useState<LevelMode>("trough");

  // Which dose the trough preceded — drives the steady-state sanity check only.
  const [doseNumber, setDoseNumber] = useState<number>(4);

  // Random / non-steady-state level inputs
  const [rDoses, setRDoses] = useState<number | undefined>(2);
  const [rTimeFromStart, setRTimeFromStart] = useState<number | undefined>(6);
  const [rLevel, setRLevel] = useState<number | undefined>(undefined);

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

  const complete = mode === "trough" && isComplete(sl);

  const result = useMemo<SingleLevelResult | null>(() => {
    if (!complete) return null;
    return singleLevelAnalysis(sl as SingleLevelInput, normalized, target);
  }, [sl, normalized, target, complete]);

  // ── Steady-state sanity check for the ordinary trough workflow ──
  // Silent when the assumption is safe; speaks up only on interval/half-life mismatch.
  const ssCheck = useMemo(() => {
    if (!result || !sl.currentFrequency) return null;
    return steadyStateCheck(result.ke, sl.currentFrequency, doseNumber);
  }, [result, sl.currentFrequency, doseNumber]);

  // ── Random / non-steady-state level ──
  const randomComplete =
    mode === "random" &&
    typeof sl.currentDose === "number" && sl.currentDose > 0 &&
    typeof sl.currentFrequency === "number" && sl.currentFrequency > 0 &&
    typeof sl.currentInfusionTime === "number" && sl.currentInfusionTime > 0 &&
    rDoses !== undefined && rDoses >= 1 &&
    rTimeFromStart !== undefined && rTimeFromStart > 0 &&
    rLevel !== undefined && rLevel > 0;

  const randomResult = useMemo<RandomLevelResult | null>(() => {
    if (!randomComplete) return null;
    return randomLevelAnalysis(
      {
        currentDose: sl.currentDose!,
        currentTau: sl.currentFrequency!,
        currentInfusionTime: sl.currentInfusionTime!,
        dosesGiven: rDoses!,
        timeFromLastDoseStart: rTimeFromStart!,
        measuredLevel: rLevel!,
        vdMethod: sl.vdMethod ?? "ambrose-winter",
        manualVdLPerKg: sl.manualVdLPerKg,
      },
      normalized,
      target
    );
  }, [randomComplete, sl, rDoses, rTimeFromStart, rLevel, normalized, target]);

  const randomCurrentSim = useMemo(
    () =>
      randomResult
        ? simulateConcentration(randomResult.currentRegimen, randomResult.patientPk, 96, 0.25)
        : [],
    [randomResult]
  );
  const randomRecSim = useMemo(
    () =>
      randomResult
        ? simulateConcentration(
            randomResult.recommendedRegimen,
            randomResult.patientPk,
            96,
            0.25
          )
        : [],
    [randomResult]
  );

  // ── "What if I dose it differently?" override ──
  // The patient-specific ke / Vd / CL are already back-calculated from the measured
  // level, so any regimen can be scored against them, not just the auto-recommendation.
  const [useCustom, setUseCustom] = useState(false);
  const [cDose, setCDose] = useState<number | undefined>(undefined);
  const [cFreq, setCFreq] = useState<number | undefined>(undefined);
  const [cTInf, setCTInf] = useState<number | undefined>(undefined);

  // Blank custom fields fall back to the recommendation, so the inputs start pre-filled.
  const cDoseVal = cDose ?? result?.recommendedRegimen.dose;
  const cFreqVal = cFreq ?? result?.recommendedRegimen.frequency;
  const cTInfVal = cTInf ?? result?.recommendedRegimen.infusionTime;

  const customRegimen = useMemo<DoseRegimen | null>(() => {
    if (!result) return null;
    if (
      cDoseVal === undefined || cDoseVal <= 0 ||
      cFreqVal === undefined || cFreqVal <= 0 ||
      cTInfVal === undefined || cTInfVal <= 0 ||
      cTInfVal >= cFreqVal
    ) {
      return null;
    }
    return {
      dose: cDoseVal,
      frequency: cFreqVal,
      infusionTime: cTInfVal,
      doseCapped: false,
    };
  }, [result, cDoseVal, cFreqVal, cTInfVal]);

  const customResult = useMemo(
    () =>
      result && customRegimen
        ? evaluateRegimen(customRegimen, result.patientPk, target.mic)
        : null,
    [result, customRegimen, target.mic]
  );

  // Whichever regimen is currently being displayed everywhere downstream.
  const activeRegimen =
    useCustom && customRegimen ? customRegimen : result?.recommendedRegimen ?? null;
  const activeResult =
    useCustom && customResult ? customResult : result?.recommendedResult ?? null;

  const currentSim = useMemo(
    () =>
      result ? simulateConcentration(result.currentRegimen, result.patientPk, 96, 0.25) : [],
    [result]
  );
  const activeSim = useMemo(
    () =>
      result && activeRegimen
        ? simulateConcentration(activeRegimen, result.patientPk, 96, 0.25)
        : [],
    [result, activeRegimen]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">

      {/* ── Input card ── */}
      <div className="card p-5 lg:col-span-5">
        <div className="flex items-center gap-2 mb-3">
          <FlaskConical className="w-4 h-4 text-brand-600" />
          <h3 className="card-title">Current Regimen + Measured Level</h3>
        </div>

        <div className="mb-4">
          <Toggle
            value={mode}
            onChange={(v) => setMode(v)}
            options={[
              { label: "Trough", value: "trough" },
              { label: "Random / early level", value: "random" },
            ]}
          />
          <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-1.5 leading-snug">
            {mode === "trough"
              ? "A true pre-dose trough at (or near) steady state."
              : "A level that is not a trough — drawn mid-interval, often after only 1–3 doses."}
          </p>
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

          {mode === "trough" ? (
            <>
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

              <Field label="Drawn before dose #">
                <select
                  value={doseNumber}
                  onChange={(e) => setDoseNumber(Number(e.target.value))}
                  className="field-input bg-white dark:bg-ink-950"
                >
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n === 6 ? "6 or later" : `dose ${n}`}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-1">
                  Used only to verify the steady-state assumption holds.
                </p>
              </Field>
            </>
          ) : (
            <>
              <div className="border-t border-ink-100 dark:border-ink-800 pt-3">
                <Field label="Measured level (mcg/mL)">
                  <input
                    type="number"
                    inputMode="decimal"
                    step={0.1}
                    value={rLevel ?? ""}
                    placeholder="e.g. 18.4"
                    onChange={(e) =>
                      setRLevel(e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    className="field-input bg-white dark:bg-ink-950"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Doses given">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={rDoses ?? ""}
                    placeholder="2"
                    onChange={(e) =>
                      setRDoses(e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    className="field-input bg-white dark:bg-ink-950"
                  />
                </Field>
                <Field label="Hrs from last dose start">
                  <input
                    type="number"
                    inputMode="decimal"
                    step={0.25}
                    value={rTimeFromStart ?? ""}
                    placeholder="6"
                    onChange={(e) =>
                      setRTimeFromStart(
                        e.target.value === "" ? undefined : Number(e.target.value)
                      )
                    }
                    className="field-input bg-white dark:bg-ink-950"
                  />
                </Field>
              </div>
              <p className="text-[11px] text-ink-400 dark:text-ink-500 leading-snug">
                Measured from the <strong>start</strong> of the most recent infusion, the way it is
                charted. Time from first dose is derived, so accumulation is handled properly.
              </p>
            </>
          )}

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

      {/* ── Patient-specific PK vs Population (trough mode) ── */}
      {mode === "trough" && (
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
      )}

      {/* ── Steady-state assumption check (trough mode) ── */}
      {mode === "trough" && result && ssCheck && !ssCheck.safe && (
        <div className="card p-5 lg:col-span-12 border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              <strong>Steady state not reached.</strong> A trough before dose {doseNumber} on a{" "}
              q{sl.currentFrequency}h interval is {ssCheck.hoursFromFirstDose.toFixed(0)} h from the
              first dose, which is only{" "}
              <strong className="font-mono">{ssCheck.halfLivesElapsed.toFixed(1)}</strong> half-lives
              at this patient&apos;s back-calculated t½ of{" "}
              <strong className="font-mono">{result.halfLife.toFixed(1)} h</strong> —{" "}
              <strong className="font-mono">
                {(ssCheck.fractionOfSteadyState * 100).toFixed(0)}%
              </strong>{" "}
              of steady state. The measured{" "}
              <span className="font-mono">{sl.measuredTrough?.toFixed(1)}</span> will keep climbing
              toward roughly{" "}
              <strong className="font-mono">
                {(result.trueTrough / ssCheck.fractionOfSteadyState).toFixed(1)} mcg/mL
              </strong>{" "}
              on this regimen. The interval is likely too short for this patient&apos;s clearance;
              consider extending it rather than increasing the dose.
            </div>
          </div>
        </div>
      )}

      {/* ── Random / non-steady-state level results ── */}
      {mode === "random" && (
        <div className="lg:col-span-7 space-y-4">
          {!randomResult ? (
            <div className="card p-8 text-center text-sm text-ink-400 dark:text-ink-500">
              Enter the regimen, the measured level, how many doses were given, and how long after
              the last dose started it was drawn.
            </div>
          ) : (
            <>
              {/* Accumulation status */}
              <div className="card p-5">
                <h3 className="card-title mb-4 border-b-2 border-brand-500 pb-2 inline-block">
                  Accumulation Status
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MiniStat
                    label="% of steady state"
                    value={`${(randomResult.fractionOfSteadyState * 100).toFixed(0)}%`}
                    warn={!randomResult.atSteadyState}
                  />
                  <MiniStat
                    label="Hrs from 1st dose"
                    value={randomResult.hoursFromFirstDose.toFixed(1)}
                  />
                  <MiniStat label="Patient t½" value={`${randomResult.halfLife.toFixed(1)} h`} />
                  <MiniStat
                    label="Post-infusion"
                    value={`${randomResult.timeFromEndOfInfusion.toFixed(1)} h`}
                    warn={randomResult.inDistributionPhase || randomResult.drawnDuringInfusion}
                  />
                </div>

                <div className="mt-4 rounded-lg bg-ink-50 dark:bg-ink-950/50 border border-ink-200 dark:border-ink-800 p-3 space-y-1.5">
                  <PKDetailRow
                    label="Measured level"
                    value={`${rLevel?.toFixed(1)} mcg/mL`}
                  />
                  <PKDetailRow
                    label="True trough this interval"
                    value={`${randomResult.trueTroughThisInterval.toFixed(1)} mcg/mL`}
                  />
                  <PKDetailRow
                    label="Trough once at steady state"
                    value={`${randomResult.steadyStateTrough.toFixed(1)} mcg/mL`}
                  />
                  <PKDetailRow
                    label="AUC₂₄ at steady state (current regimen)"
                    value={`${fmt.auc(randomResult.auc24AtSteadyState)} mcg·h/mL`}
                    inRange={
                      randomResult.auc24AtSteadyState >= target.aucMin &&
                      randomResult.auc24AtSteadyState <= target.aucMax
                    }
                  />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg border border-ink-200 dark:border-ink-800 p-2.5">
                    <div className="text-ink-500 dark:text-ink-400 mb-0.5">ke</div>
                    <div className="font-semibold tabular-nums font-mono">
                      {randomResult.ke.toFixed(4)} /h
                    </div>
                  </div>
                  <div className="rounded-lg border border-ink-200 dark:border-ink-800 p-2.5">
                    <div className="text-ink-500 dark:text-ink-400 mb-0.5">Vd (fixed)</div>
                    <div className="font-semibold tabular-nums font-mono">
                      {randomResult.vd.toFixed(1)} L
                    </div>
                  </div>
                  <div className="rounded-lg border border-ink-200 dark:border-ink-800 p-2.5">
                    <div className="text-ink-500 dark:text-ink-400 mb-0.5">CL</div>
                    <div className="font-semibold tabular-nums font-mono">
                      {randomResult.cl.toFixed(2)} L/h
                    </div>
                  </div>
                </div>
              </div>

              {/* Warnings */}
              {randomResult.warnings.length > 0 && (
                <div className="card p-4 border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30">
                  <ul className="space-y-2">
                    {randomResult.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <span className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                          {w}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendation */}
              <div className="card p-5">
                <h3 className="card-title mb-4">Recommended Regimen</h3>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <BigStat label="Dose" value={fmt.mg(randomResult.recommendedRegimen.dose)} />
                  <BigStat
                    label="Frequency"
                    value={`q${randomResult.recommendedRegimen.frequency}h`}
                  />
                  <BigStat
                    label="Infusion"
                    value={`${randomResult.recommendedRegimen.infusionTime} h`}
                  />
                </div>
                <div className="rounded-lg bg-ink-50 dark:bg-ink-950/50 border border-ink-200 dark:border-ink-800 p-3 space-y-1.5">
                  <PKDetailRow
                    label="AUC₂₄"
                    value={`${fmt.auc(randomResult.recommendedResult.auc24)} mcg·h/mL`}
                    inRange={
                      randomResult.recommendedResult.auc24 >= target.aucMin &&
                      randomResult.recommendedResult.auc24 <= target.aucMax
                    }
                  />
                  <PKDetailRow
                    label="Predicted peak"
                    value={`${fmt.conc(randomResult.recommendedResult.peak)} mcg/mL`}
                  />
                  <PKDetailRow
                    label="Predicted trough"
                    value={`${fmt.conc(randomResult.recommendedResult.trough)} mcg/mL`}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Random-mode chart ── */}
      {mode === "random" && randomResult && randomRecSim.length > 0 && (
        <div className="card p-5 lg:col-span-12">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="card-title">Predicted Concentration–Time Curve</h3>
            <div className="flex items-center gap-4 text-xs text-ink-500 dark:text-ink-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-6 h-0.5 border-t-2 border-dashed border-ink-400" />
                Current ({randomResult.currentRegimen.dose} mg q
                {randomResult.currentRegimen.frequency}h)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-6 h-0.5 bg-brand-600" />
                Recommended ({randomResult.recommendedRegimen.dose} mg q
                {randomResult.recommendedRegimen.frequency}h)
              </span>
            </div>
          </div>
          <VancoChart
            data={randomRecSim}
            ghost={randomCurrentSim}
            frequency={randomResult.recommendedRegimen.frequency}
            infusionTime={randomResult.recommendedRegimen.infusionTime}
            hoursTotal={96}
            peak={randomResult.recommendedResult.peak}
            trough={randomResult.recommendedResult.trough}
          />
          <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-2 leading-relaxed">
            Curves use ke solved from your measured level by superposition over the{" "}
            {randomResult.hoursFromFirstDose.toFixed(1)} h of dosing that preceded it, with Vd held
            fixed. A single concentration resolves one parameter, so Vd is not patient-derived here.
          </p>
        </div>
      )}

      {/* ── Adjustment: recommended or your own ── */}
      {result && (
        <div className="card p-5 lg:col-span-5">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <h3 className="card-title">
              {useCustom ? "Your Regimen" : "Recommended Adjustment"}
            </h3>
            <Toggle
              value={useCustom ? "custom" : "rec"}
              onChange={(v) => setUseCustom(v === "custom")}
              options={[
                { label: "Recommended", value: "rec" },
                { label: "Custom", value: "custom" },
              ]}
            />
          </div>

          {useCustom ? (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div>
                  <label className="field-label">Dose (mg)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={250}
                    value={cDoseVal ?? ""}
                    onChange={(e) =>
                      setCDose(e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    className="field-input bg-white dark:bg-ink-950"
                  />
                </div>
                <div>
                  <label className="field-label">Freq (h)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={cFreqVal ?? ""}
                    onChange={(e) =>
                      setCFreq(e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    className="field-input bg-white dark:bg-ink-950"
                  />
                </div>
                <div>
                  <label className="field-label">Infusion (h)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={0.5}
                    value={cTInfVal ?? ""}
                    onChange={(e) =>
                      setCTInf(e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    className="field-input bg-white dark:bg-ink-950"
                  />
                </div>
              </div>

              {!customRegimen && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 p-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-amber-700 dark:text-amber-300">
                    Enter a valid regimen. Infusion time must be shorter than the interval.
                  </span>
                </div>
              )}

              <div className="mb-3 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-ink-500 dark:text-ink-400">
                  Scored against this patient&apos;s CL{" "}
                  <span className="font-mono">{result.cl.toFixed(2)} L/h</span>
                </span>
                <button
                  onClick={() => {
                    setCDose(undefined);
                    setCFreq(undefined);
                    setCTInf(undefined);
                  }}
                  className="text-accent-600 dark:text-accent-400 hover:underline"
                >
                  Reset to recommended
                </button>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <BigStat label="Dose" value={fmt.mg(result.recommendedRegimen.dose)} />
              <BigStat label="Frequency" value={`q${result.recommendedRegimen.frequency}h`} />
              <BigStat label="Infusion" value={`${result.recommendedRegimen.infusionTime} h`} />
            </div>
          )}

          {!useCustom && result.recommendedRegimen.doseCapped && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span className="text-xs text-amber-700 dark:text-amber-300">
                Dose capped at 3,500 mg. Consider individualized Bayesian dosing.
              </span>
            </div>
          )}

          {activeResult && (
            <div className="rounded-lg bg-ink-50 dark:bg-ink-950/50 border border-ink-200 dark:border-ink-800 p-3 space-y-1.5">
              <PKDetailRow
                label="AUC₂₄"
                value={`${fmt.auc(activeResult.auc24)} mcg·h/mL`}
                inRange={
                  activeResult.auc24 >= target.aucMin &&
                  activeResult.auc24 <= target.aucMax
                }
              />
              <PKDetailRow
                label="AUC₂₄ / MIC"
                value={fmt.auc(activeResult.aucMicRatio)}
              />
              <PKDetailRow
                label="Predicted peak"
                value={`${fmt.conc(activeResult.peak)} mcg/mL`}
              />
              <PKDetailRow
                label="Predicted trough"
                value={`${fmt.conc(activeResult.trough)} mcg/mL`}
              />
              <PKDetailRow
                label="Daily dose"
                value={`${Math.round(
                  activeRegimen!.dose * (24 / activeRegimen!.frequency)
                )} mg/day`}
              />
            </div>
          )}
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
            {useCustom && (
              <AucBar
                label="Recommended regimen"
                auc={result.recommendedResult.auc24}
                target={target}
                color="amber"
              />
            )}
            {activeResult && (
              <AucBar
                label={useCustom ? "Your regimen" : "Recommended regimen"}
                auc={activeResult.auc24}
                target={target}
                color="cyan"
              />
            )}
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
      {result && activeSim.length > 0 && activeRegimen && (
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
                {useCustom ? "Your regimen" : "Recommended"} ({activeRegimen.dose} mg q
                {activeRegimen.frequency}h)
              </span>
            </div>
          </div>

          <VancoChart
            data={activeSim}
            ghost={currentSim}
            frequency={activeRegimen.frequency}
            infusionTime={activeRegimen.infusionTime}
            hoursTotal={96}
            peak={activeResult?.peak}
            trough={activeResult?.trough}
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

function MiniStat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        warn
          ? "border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/25"
          : "border-ink-200 dark:border-ink-800"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400 leading-tight">
        {label}
      </div>
      <div
        className={`text-lg font-semibold tabular-nums mt-0.5 ${
          warn
            ? "text-amber-700 dark:text-amber-400"
            : "text-ink-900 dark:text-ink-100"
        }`}
      >
        {value}
      </div>
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
