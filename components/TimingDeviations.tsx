"use client";

import { useMemo, useState } from "react";
import { Clock, FlaskConical, CalendarClock, RotateCcw, AlertTriangle } from "lucide-react";
import { VancoChart } from "./VancoChart";
import { Toggle } from "./Toggle";
import {
  buildSchedule,
  simulateSchedule,
  correctLevelTiming,
  deviationImpact,
  timeToThreshold,
  concentrationAt,
  type DoseEvent,
} from "@/lib/timingMath";
import type { PKParams, TargetRange } from "@/lib/types";

interface Props {
  pk: PKParams | null;
  target: TargetRange;
  complete: boolean;
}

type Scenario = "level" | "dose" | "missed" | "restart";
const HOURS = 96;

export function TimingDeviations({ pk, complete }: Props) {
  const [scenario, setScenario] = useState<Scenario>("level");

  // Regimen
  const [dose, setDose] = useState<number | undefined>(1000);
  const [freq, setFreq] = useState<number | undefined>(12);
  const [tInf, setTInf] = useState<number | undefined>(1.5);

  // Level-timing scenario
  const [measured, setMeasured] = useState<number | undefined>(15);
  const [devHours, setDevHours] = useState<number | undefined>(-1.5);

  // Dose-timing / missed scenario
  const [doseIndex, setDoseIndex] = useState(4);
  const [shiftHours, setShiftHours] = useState<number | undefined>(3);

  // Restart scenario
  const [currentLevel, setCurrentLevel] = useState<number | undefined>(32);
  const [threshold, setThreshold] = useState<number | undefined>(15);

  // Chart marker (hours) for the level draw
  const [marker, setMarker] = useState<number | null>(null);

  const regimenOk =
    !!pk &&
    dose !== undefined && dose > 0 &&
    freq !== undefined && freq > 0 &&
    tInf !== undefined && tInf > 0 && tInf < freq;

  const scheduled: DoseEvent[] = useMemo(
    () => (regimenOk ? buildSchedule(dose!, freq!, tInf!, HOURS) : []),
    [regimenOk, dose, freq, tInf]
  );

  const actual: DoseEvent[] = useMemo(() => {
    if (!scheduled.length) return [];
    if (scenario === "dose") {
      return scheduled.map((d, i) =>
        i === doseIndex ? { ...d, time: Math.max(0, d.time + (shiftHours ?? 0)) } : d
      );
    }
    if (scenario === "missed") {
      return scheduled.map((d, i) => (i === doseIndex ? { ...d, given: false } : d));
    }
    return scheduled;
  }, [scheduled, scenario, doseIndex, shiftHours]);

  const curveActual = useMemo(
    () => (pk && actual.length ? simulateSchedule(actual, pk, HOURS, 0.25) : []),
    [actual, pk]
  );
  const curveScheduled = useMemo(
    () => (pk && scheduled.length ? simulateSchedule(scheduled, pk, HOURS, 0.25) : []),
    [scheduled, pk]
  );

  const showGhost = scenario === "dose" || scenario === "missed";

  const impact = useMemo(() => {
    if (!pk || !scheduled.length || !actual.length || !showGhost) return null;
    if (doseIndex >= scheduled.length - 1) return null;
    return deviationImpact(scheduled, actual, doseIndex, freq!, pk);
  }, [pk, scheduled, actual, doseIndex, freq, showGhost]);

  const levelResult = useMemo(() => {
    if (!pk || measured === undefined || devHours === undefined) return null;
    return correctLevelTiming({ measured, deviationHours: devHours }, pk);
  }, [pk, measured, devHours]);

  const restart = useMemo(() => {
    if (!pk || currentLevel === undefined || threshold === undefined) return null;
    return timeToThreshold(currentLevel, threshold, pk);
  }, [pk, currentLevel, threshold]);

  // Concentration at the dragged marker, on the actual curve
  const markerConc = useMemo(() => {
    if (marker === null || !pk || !actual.length) return null;
    return concentrationAt(marker, actual, pk);
  }, [marker, pk, actual]);

  if (!complete || !pk) {
    return (
      <div className="card p-8 text-center text-sm text-ink-500 dark:text-ink-400">
        Complete patient demographics in the sidebar to model timing deviations.
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-4">
      {/* ── Scenario picker ── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          <h2 className="card-title">What Went Wrong?</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <ScenarioBtn active={scenario === "level"} onClick={() => setScenario("level")} icon={<FlaskConical className="w-3.5 h-3.5" />}>
            Level drawn off-time
          </ScenarioBtn>
          <ScenarioBtn active={scenario === "dose"} onClick={() => setScenario("dose")} icon={<CalendarClock className="w-3.5 h-3.5" />}>
            Dose given early / late
          </ScenarioBtn>
          <ScenarioBtn active={scenario === "missed"} onClick={() => setScenario("missed")} icon={<AlertTriangle className="w-3.5 h-3.5" />}>
            Missed / held dose
          </ScenarioBtn>
          <ScenarioBtn active={scenario === "restart"} onClick={() => setScenario("restart")} icon={<RotateCcw className="w-3.5 h-3.5" />}>
            When to restart
          </ScenarioBtn>
        </div>

        {/* Regimen inputs (not needed for restart) */}
        {scenario !== "restart" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-4 border-t border-ink-100 dark:border-ink-800">
            <Num label="Dose (mg)" value={dose} onChange={setDose} step={250} placeholder="1000" />
            <Num label="Frequency (h)" value={freq} onChange={setFreq} placeholder="12" />
            <Num label="Infusion (h)" value={tInf} onChange={setTInf} step={0.5} placeholder="1.5" />
          </div>
        )}
      </div>

      {/* ── Scenario-specific controls + results ── */}
      {scenario === "level" && (
        <div className="card p-5">
          <h3 className="card-title mb-4">Trough Draw Timing</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Num
              label="Reported level (mcg/mL)"
              value={measured}
              onChange={setMeasured}
              step={0.1}
              placeholder="15.0"
            />
            <div>
              <label className="field-label">Draw timing</label>
              <div className="flex gap-2 items-center">
                <Toggle
                  value={(devHours ?? 0) <= 0 ? "early" : "late"}
                  onChange={(v) =>
                    setDevHours(
                      v === "early" ? -Math.abs(devHours ?? 1) : Math.abs(devHours ?? 1)
                    )
                  }
                  options={[
                    { label: "Early", value: "early" },
                    { label: "Late", value: "late" },
                  ]}
                />
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.25"
                  value={devHours === undefined ? "" : Math.abs(devHours)}
                  onChange={(e) => {
                    const mag = e.target.value === "" ? undefined : Math.abs(Number(e.target.value));
                    if (mag === undefined) return setDevHours(undefined);
                    setDevHours((devHours ?? 0) <= 0 ? -mag : mag);
                  }}
                  className="field-input w-24"
                />
                <span className="text-xs text-ink-500 dark:text-ink-400">h</span>
              </div>
              <p className="text-[10px] text-ink-500 dark:text-ink-400 mt-1.5 leading-snug">
                Early = drawn before the dose was due. Late = drawn after it was due but
                before it ran.
              </p>
            </div>
          </div>

          {levelResult && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                <Stat label="Reported" value={levelResult.measured.toFixed(1)} unit="mcg/mL" />
                <Stat
                  label="True trough"
                  value={levelResult.trueTrough.toFixed(1)}
                  unit="mcg/mL"
                  accent
                />
                <Stat
                  label="Error if uncorrected"
                  value={`${levelResult.deltaPct > 0 ? "+" : ""}${levelResult.deltaPct.toFixed(0)}%`}
                  unit={`${levelResult.deltaAbs > 0 ? "+" : ""}${levelResult.deltaAbs.toFixed(1)} mcg/mL`}
                  warn={Math.abs(levelResult.deltaPct) >= 10}
                />
              </div>
              <div className="mt-4 rounded-xl border border-ink-200 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-950/40 p-3.5">
                <p className="text-xs text-ink-700 dark:text-ink-300 leading-relaxed">
                  {levelResult.interpretation}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {(scenario === "dose" || scenario === "missed") && (
        <div className="card p-5">
          <h3 className="card-title mb-4">
            {scenario === "dose" ? "Dose Administration Timing" : "Missed / Held Dose"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Which dose</label>
              <select
                value={doseIndex}
                onChange={(e) => setDoseIndex(Number(e.target.value))}
                className="field-input"
              >
                {scheduled.slice(0, -1).map((d, i) => (
                  <option key={i} value={i}>
                    Dose #{i + 1} (scheduled t = {d.scheduledTime} h)
                  </option>
                ))}
              </select>
            </div>
            {scenario === "dose" && (
              <div>
                <label className="field-label">Given (± hours from scheduled)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  value={shiftHours ?? ""}
                  onChange={(e) =>
                    setShiftHours(e.target.value === "" ? undefined : Number(e.target.value))
                  }
                  className="field-input"
                />
                <p className="text-[10px] text-ink-500 dark:text-ink-400 mt-1.5">
                  Negative = given early. Positive = given late.
                </p>
              </div>
            )}
          </div>

          {impact && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
              <Delta
                label="Trough before this dose"
                scheduled={impact.troughBeforeScheduled}
                actual={impact.troughBeforeActual}
                unit="mcg/mL"
              />
              <Delta
                label="Trough before next dose"
                scheduled={impact.troughScheduled}
                actual={impact.troughActual}
                unit="mcg/mL"
              />
              <Delta
                label="Peak this dose"
                scheduled={impact.peakScheduled}
                actual={impact.peakActual}
                unit="mcg/mL"
              />
              <Delta
                label="AUC₂₄ this window"
                scheduled={impact.auc24Scheduled}
                actual={impact.auc24Actual}
                unit="mg·h/L"
                digits={0}
              />
            </div>
          )}

          {impact && scenario === "missed" && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3.5">
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                Holding dose #{doseIndex + 1} drops the nadir to{" "}
                <strong className="font-mono">{impact.nadir.toFixed(1)} mcg/mL</strong> at t ={" "}
                {impact.nadirTime.toFixed(1)} h, and cuts AUC₂₄ over that window by{" "}
                <strong className="font-mono">
                  {Math.abs(impact.auc24DeltaPct).toFixed(0)}%
                </strong>
                . Sustained sub-target exposure is the main risk here.
              </p>
            </div>
          )}
        </div>
      )}

      {scenario === "restart" && (
        <div className="card p-5">
          <h3 className="card-title mb-4">Restart Timing After a High Level</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Num
              label="Current level (mcg/mL)"
              value={currentLevel}
              onChange={setCurrentLevel}
              step={0.1}
              placeholder="32"
            />
            <Num
              label="Restart threshold (mcg/mL)"
              value={threshold}
              onChange={setThreshold}
              step={0.5}
              placeholder="15"
            />
          </div>
          {restart && (
            <div className="mt-5">
              {restart.hoursToThreshold !== null ? (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-4xl font-semibold tabular-nums text-accent-600 dark:text-accent-400">
                    {restart.hoursToThreshold.toFixed(1)}
                  </span>
                  <span className="text-sm text-ink-500 dark:text-ink-400">hours from the draw</span>
                </div>
              ) : null}
              <p className="text-xs text-ink-600 dark:text-ink-300 mt-2 leading-relaxed">
                {restart.clockNote} Based on this patient&apos;s elimination rate constant (Ke ={" "}
                <span className="font-mono">{pk.ke.toFixed(4)}</span> /h, t½ ={" "}
                <span className="font-mono">{pk.halfLife.toFixed(1)} h</span>). Redraw a level to
                confirm before resuming.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Chart ── */}
      {scenario !== "restart" && regimenOk && curveActual.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="card-title">Concentration–Time</h3>
            <div className="flex items-center gap-3 text-[11px] text-ink-500 dark:text-ink-400">
              {showGhost && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-4 border-t-2 border-dashed border-ink-400" />
                  Scheduled
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-brand-500" />
                Actual
              </span>
            </div>
          </div>

          <VancoChart
            data={curveActual}
            ghost={showGhost ? curveScheduled : undefined}
            frequency={freq!}
            infusionTime={tInf!}
            hoursTotal={HOURS}
            doseTimes={actual.filter((d) => d.given).map((d) => d.time)}
            marker={marker}
            onMarkerChange={setMarker}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
            <p className="text-[11px] text-ink-400 dark:text-ink-500">
              Click or drag on the chart to place a level-draw marker.
            </p>
            {marker !== null && markerConc !== null && (
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-ink-500 dark:text-ink-400">
                  Draw at t = <span className="font-mono">{marker.toFixed(2)} h</span> reads{" "}
                  <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                    {markerConc.toFixed(1)} mcg/mL
                  </span>
                </span>
                <button
                  onClick={() => setMarker(null)}
                  className="text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 transition"
                >
                  clear
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="text-[11px] text-ink-400 dark:text-ink-500 leading-relaxed px-1">
        Corrections use this patient&apos;s population Ke, not a measured elimination rate. With
        two levels, the Two-Level tab gives a patient-specific Ke and a more reliable
        extrapolation. Confirm clinically before changing therapy.
      </p>
    </div>
  );
}

/* ── small building blocks ── */

function ScenarioBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:bg-ink-200 dark:hover:bg-ink-700"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

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

function Delta({
  label,
  scheduled,
  actual,
  unit,
  digits = 1,
}: {
  label: string;
  scheduled: number;
  actual: number;
  unit: string;
  digits?: number;
}) {
  const d = actual - scheduled;
  const pct = scheduled > 0 ? (d / scheduled) * 100 : 0;
  const meaningful = Math.abs(pct) >= 5;
  return (
    <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-ink-50/50 dark:bg-ink-950/30 p-3.5">
      <div className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400 leading-tight">
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums mt-1.5 text-ink-900 dark:text-ink-100">
        {actual.toFixed(digits)}
      </div>
      <div className="text-[11px] text-ink-500 dark:text-ink-400">
        vs <span className="font-mono">{scheduled.toFixed(digits)}</span> {unit}
      </div>
      <div
        className={`text-[11px] font-medium mt-1 ${
          meaningful
            ? d > 0
              ? "text-amber-600 dark:text-amber-400"
              : "text-brand-600 dark:text-brand-400"
            : "text-ink-400 dark:text-ink-500"
        }`}
      >
        {d > 0 ? "+" : ""}
        {d.toFixed(digits)} ({pct > 0 ? "+" : ""}
        {pct.toFixed(0)}%)
      </div>
    </div>
  );
}
