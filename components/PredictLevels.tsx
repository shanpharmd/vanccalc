"use client";

import { useMemo, useState } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine,
} from "recharts";
import { Sliders, AlertTriangle } from "lucide-react";
import {
  ssPeak,
  ssTrough,
  auc24FromDose,
  simulateConcentration,
  fmt,
} from "@/lib/vancoMath";
import type { PKParams, TargetRange, DoseRegimen } from "@/lib/types";

interface Props {
  pk: PKParams | null;
  target: TargetRange;
  complete: boolean;
}

const FREQ_CHIPS = [6, 8, 12, 18, 24, 36, 48];

export function PredictLevels({ pk, target, complete }: Props) {
  const [dose, setDose] = useState<number | undefined>(1000);
  const [freq, setFreq] = useState<number | undefined>(12);
  const [tInf, setTInf] = useState<number | undefined>(1.5);

  const valid =
    !!pk &&
    dose !== undefined && dose > 0 &&
    freq !== undefined && freq > 0 &&
    tInf !== undefined && tInf > 0 &&
    tInf < freq;

  const regimen: DoseRegimen | null = useMemo(
    () =>
      valid
        ? { dose: dose!, frequency: freq!, infusionTime: tInf!, doseCapped: false }
        : null,
    [valid, dose, freq, tInf]
  );

  const result = useMemo(() => {
    if (!pk || !regimen) return null;
    const cmax = ssPeak(regimen.dose, regimen.infusionTime, regimen.frequency, pk);
    const cmin = ssTrough(cmax, regimen.infusionTime, regimen.frequency, pk);
    const auc24 = auc24FromDose(regimen.dose, regimen.frequency, pk);
    return {
      cmax,
      cmin,
      auc24,
      aucMic: auc24 / target.mic,
      dailyDose: regimen.dose * (24 / regimen.frequency),
      infusionRate: regimen.dose / regimen.infusionTime,
    };
  }, [pk, regimen, target.mic]);

  const curve = useMemo(
    () => (pk && regimen ? simulateConcentration(regimen, pk, 96, 0.25) : []),
    [pk, regimen]
  );

  const aucStatus =
    result === null
      ? null
      : result.auc24 < target.aucMin
      ? "low"
      : result.auc24 > target.aucMax
      ? "high"
      : "in";

  const aucColor =
    aucStatus === "in"
      ? "text-emerald-600 dark:text-emerald-400"
      : aucStatus === null
      ? "text-ink-900 dark:text-ink-100"
      : "text-amber-600 dark:text-amber-400";

  const rateHigh = result !== null && result.infusionRate > 1000;

  if (!complete || !pk) {
    return (
      <div className="card p-8 text-center text-sm text-ink-500 dark:text-ink-400">
        Complete patient demographics in the sidebar to predict kinetics for a regimen.
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-4">
      {/* ── Regimen input ── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sliders className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          <h2 className="card-title">Enter a Regimen</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="field-label">Dose (mg)</label>
            <input
              type="number"
              inputMode="decimal"
              step="250"
              value={dose ?? ""}
              placeholder="1000"
              onChange={(e) => setDose(e.target.value === "" ? undefined : Number(e.target.value))}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Frequency (h)</label>
            <input
              type="number"
              inputMode="decimal"
              value={freq ?? ""}
              placeholder="12"
              onChange={(e) => setFreq(e.target.value === "" ? undefined : Number(e.target.value))}
              className="field-input"
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {FREQ_CHIPS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFreq(f)}
                  className={`px-2 py-0.5 text-[11px] rounded-md transition ${
                    freq === f
                      ? "bg-brand-600 text-white"
                      : "bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:bg-ink-200 dark:hover:bg-ink-700"
                  }`}
                >
                  q{f}h
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label">Infusion time (h)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={tInf ?? ""}
              placeholder="1.5"
              onChange={(e) => setTInf(e.target.value === "" ? undefined : Number(e.target.value))}
              className="field-input"
            />
            <p className="text-[10px] text-ink-500 dark:text-ink-400 mt-1.5 leading-snug">
              Set to your institution&apos;s protocol. Peak is measured at end of infusion, so this
              shifts the reported peak.
            </p>
          </div>
        </div>

        {tInf !== undefined && freq !== undefined && tInf >= freq && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-3">
            Infusion time must be shorter than the dosing interval.
          </p>
        )}
        {rateHigh && (
          <div className="flex items-start gap-2 mt-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
              Infusion rate {Math.round(result!.infusionRate)} mg/h exceeds the ASHP maximum of
              1000 mg/h. Lengthen the infusion time.
            </p>
          </div>
        )}
      </div>

      {result && (
        <>
          {/* ── Predicted kinetics ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric
              label="AUC₂₄"
              value={fmt.auc(result.auc24)}
              unit="mg·h/L"
              valueClass={aucColor}
              foot={
                aucStatus === "in"
                  ? `In target ${target.aucMin}–${target.aucMax}`
                  : aucStatus === "low"
                  ? `Below target ${target.aucMin}–${target.aucMax}`
                  : `Above target ${target.aucMin}–${target.aucMax}`
              }
            />
            <Metric label="AUC₂₄ / MIC" value={fmt.auc(result.aucMic)} unit={`MIC ${target.mic}`} />
            <Metric label="Predicted peak" value={fmt.conc(result.cmax)} unit="mcg/mL" />
            <Metric label="Predicted trough" value={fmt.conc(result.cmin)} unit="mcg/mL" />
          </div>

          {/* ── PK parameters ── */}
          <div className="card p-5">
            <h3 className="card-title mb-3">Pharmacokinetic Parameters</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <Param label="CrCl" value={`${Math.round(pk.crCl)}`} unit="mL/min" />
              <Param label="Ke" value={pk.ke.toFixed(4)} unit="/h" />
              <Param label="Half-life" value={pk.halfLife.toFixed(1)} unit="h" />
              <Param label="Vd" value={pk.vd.toFixed(1)} unit="L" />
              <Param label="Clearance" value={pk.cl.toFixed(2)} unit="L/h" />
              <Param label="Daily dose" value={`${Math.round(result.dailyDose)}`} unit="mg/day" />
            </div>
            <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-3 leading-snug">
              Steady-state, one-compartment model. Ke from CrCl ({pk.crClMethod}); Vd ={" "}
              {pk.vdPerKg.toFixed(2)} L/kg. Peak = end of infusion; trough = end of interval.
            </p>
          </div>

          {/* ── Concentration–time curve ── */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="card-title">Predicted Concentration–Time Curve</h3>
              <div className="text-xs text-ink-500 dark:text-ink-400 tabular-nums">
                {regimen!.dose} mg q{regimen!.frequency}h · {regimen!.infusionTime}h infusion
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="predFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={[0, 96]}
                    ticks={[0, 12, 24, 36, 48, 60, 72, 84, 96]}
                    stroke="var(--muted)"
                  />
                  <YAxis stroke="var(--muted)" width={40} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${v.toFixed(1)} mcg/mL`, "Concentration"]}
                    labelFormatter={(t: number) => `t = ${t} h`}
                  />
                  <ReferenceLine
                    y={result.cmax}
                    stroke="var(--muted)"
                    strokeDasharray="4 4"
                    label={{
                      value: `peak ${fmt.conc(result.cmax)}`,
                      fill: "var(--muted)",
                      fontSize: 10,
                      position: "insideTopRight",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="c"
                    stroke="#0891b2"
                    strokeWidth={2}
                    fill="url(#predFill)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <p className="text-[11px] text-ink-400 dark:text-ink-500 leading-relaxed px-1">
            Predictions use population PK estimates from patient demographics, not measured levels.
            Confirm with a measured level before acting. ASHP/IDSA 2020 targets AUC₂₄/MIC 400–600.
          </p>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  valueClass = "text-ink-900 dark:text-ink-100",
  foot,
}: {
  label: string;
  value: string;
  unit?: string;
  valueClass?: string;
  foot?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
        {label}
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className={`text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</span>
        {unit && <span className="text-xs text-ink-500 dark:text-ink-400">{unit}</span>}
      </div>
      {foot && <div className={`text-[11px] mt-1 ${valueClass}`}>{foot}</div>}
    </div>
  );
}

function Param({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="text-base font-semibold text-ink-900 dark:text-ink-100 tabular-nums">
        {value}
        {unit && <span className="text-[11px] font-normal text-ink-500 dark:text-ink-400 ml-1">{unit}</span>}
      </div>
    </div>
  );
}
