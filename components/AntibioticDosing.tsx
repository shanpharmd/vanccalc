"use client";

import { useMemo, useState } from "react";
import { Pill, Droplet, Activity, AlertTriangle } from "lucide-react";
import { Toggle } from "./Toggle";
import type { NormalizedPatient } from "@/lib/types";
import {
  betaLactamDosing,
  amikacin,
  tobramycin,
  adjustedBodyWeightKg,
  idealBodyWeightKg,
  type CrClValue,
  type AminoglycosideResult,
} from "@/lib/antibioticDosing";

interface Props {
  crCl: number | null; // CrCl computed from the sidebar patient (mL/min)
  normalized: NormalizedPatient | null;
}

type Mode = "auto" | "manual" | "hd";

export function AntibioticDosing({ crCl, normalized }: Props) {
  const [mode, setMode] = useState<Mode>("auto");
  const [manual, setManual] = useState<number | undefined>(undefined);

  // Effective CrCl driving all dosing (mirrors workbook cell B9).
  const effective: CrClValue | null = useMemo(() => {
    if (mode === "hd") return "HD";
    if (mode === "manual") return manual !== undefined && manual > 0 ? manual : null;
    return crCl !== null ? crCl : null;
  }, [mode, manual, crCl]);

  const adjBw = useMemo(
    () =>
      normalized
        ? adjustedBodyWeightKg(normalized.sex, normalized.heightCm, normalized.weightKg)
        : null,
    [normalized]
  );
  const ibw = useMemo(
    () => (normalized ? idealBodyWeightKg(normalized.sex, normalized.heightCm) : null),
    [normalized]
  );

  const betaLactams = useMemo(
    () => (effective !== null ? betaLactamDosing(effective) : null),
    [effective]
  );
  const aminoglycosides = useMemo(() => {
    if (effective === null || adjBw === null) return null;
    return [amikacin(effective, adjBw), tobramycin(effective, adjBw)];
  }, [effective, adjBw]);

  const crclLabel =
    effective === "HD" ? "HD" : effective !== null ? `${Math.round(effective)} mL/min` : "—";

  return (
    <div className="space-y-4">
      {/* ── Renal function control bar ── */}
      <div className="card p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 p-2.5">
              <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="stat-label">Creatinine clearance used</div>
              <div className="text-2xl font-bold text-ink-900 dark:text-ink-100 tabular-nums">
                {crclLabel}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
            <div>
              <div className="field-label">Source</div>
              <Toggle
                value={mode}
                onChange={(v) => setMode(v)}
                options={[
                  { label: "Patient CrCl", value: "auto" },
                  { label: "Manual", value: "manual" },
                  { label: "HD", value: "hd" },
                ]}
              />
            </div>
            {mode === "manual" && (
              <div>
                <div className="field-label">CrCl (mL/min)</div>
                <input
                  type="number"
                  inputMode="decimal"
                  value={manual ?? ""}
                  placeholder="e.g. 45"
                  onChange={(e) =>
                    setManual(e.target.value === "" ? undefined : Number(e.target.value))
                  }
                  className="field-input w-32"
                />
              </div>
            )}
          </div>
        </div>

        {mode === "auto" && crCl === null && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
            Complete the patient demographics in the sidebar, or switch to Manual / HD.
          </p>
        )}
        {adjBw !== null && ibw !== null && (
          <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-3">
            Dosing weight for aminoglycosides: adjusted body weight{" "}
            <strong className="text-ink-700 dark:text-ink-200">
              {Math.round(adjBw)} kg
            </strong>{" "}
            (IBW {Math.round(ibw)} kg). Aminoglycoside doses use adjusted body weight; beta-lactam
            dosing depends on CrCl only.
          </p>
        )}
      </div>

      {effective === null ? (
        <div className="card p-8 text-center text-sm text-ink-500 dark:text-ink-400">
          Enter a creatinine clearance (patient data, manual, or HD) to see antibiotic dosing.
        </div>
      ) : (
        <>
          {/* ── Beta-lactam / FQ / carbapenem lookups ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Pill className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <h2 className="card-title">Renal-Adjusted Dosing</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {betaLactams!.map((d) => (
                <div key={d.drug} className="card p-5">
                  <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100 mb-3">
                    {d.drug}
                  </h3>
                  <div className="space-y-2.5">
                    {d.rows.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-start justify-between gap-3 pb-2.5 border-b border-ink-100 dark:border-ink-800 last:border-0 last:pb-0"
                      >
                        <span className="text-xs text-ink-600 dark:text-ink-300 leading-snug flex-1">
                          {r.indication}
                        </span>
                        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 text-right whitespace-nowrap tabular-nums">
                          {r.dose}
                        </span>
                      </div>
                    ))}
                  </div>
                  {d.note && (
                    <p className="text-[10px] text-ink-500 dark:text-ink-500 mt-3 leading-snug">
                      {d.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Aminoglycosides ── */}
          <div>
            <div className="flex items-center gap-2 mb-3 mt-2">
              <Droplet className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <h2 className="card-title">Aminoglycoside PK Dosing (Traditional)</h2>
            </div>
            {aminoglycosides === null ? (
              <div className="card p-6 text-center text-sm text-ink-500 dark:text-ink-400">
                Complete patient sex, height, and weight in the sidebar to compute
                aminoglycoside dosing (requires adjusted body weight).
              </div>
            ) : (
              <div className="space-y-4">
                {aminoglycosides.map((a) => (
                  <AminoglycosideCard key={a.drug} data={a} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Disclaimer ── */}
      <div className="card p-4 border-amber-200 dark:border-amber-900/60">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-ink-600 dark:text-ink-400 leading-relaxed">
            Adult patients only (≥18 years). Not for pediatric or renal-replacement (CRRT/PD)
            dosing unless noted. Aminoglycoside PK is a population estimate: confirm with measured
            levels. Beta-lactam intervals follow institutional protocol. Verify every dose against
            current references and clinical judgment before prescribing.
          </p>
        </div>
      </div>
    </div>
  );
}

function AminoglycosideCard({ data }: { data: AminoglycosideResult }) {
  if (data.hd) {
    return (
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100 mb-2">{data.drug}</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Hemodialysis: dose by measured levels per protocol. PK estimation is not applied for HD.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-1">
        <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100">{data.drug}</h3>
        <span className="text-[11px] text-ink-500 dark:text-ink-400">
          Adjusted body weight {Math.round(data.adjBwKg)} kg
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-ink-500 dark:text-ink-400 text-left">
              <th className="font-medium pb-2 pr-3">Scenario (peak / trough)</th>
              <th className="font-medium pb-2 pr-3 whitespace-nowrap">Load</th>
              <th className="font-medium pb-2 pr-3 whitespace-nowrap">Maint.</th>
              <th className="font-medium pb-2 pr-3 whitespace-nowrap">Interval</th>
              <th className="font-medium pb-2 whitespace-nowrap">Final dose</th>
            </tr>
          </thead>
          <tbody>
            {data.traditional.map((t, i) => (
              <tr
                key={i}
                className="border-t border-ink-100 dark:border-ink-800 align-top"
              >
                <td className="py-2 pr-3 text-ink-600 dark:text-ink-300 leading-snug">
                  {t.label}
                </td>
                <td className="py-2 pr-3 tabular-nums text-ink-700 dark:text-ink-200 whitespace-nowrap">
                  {t.loadingDose} mg
                </td>
                <td className="py-2 pr-3 tabular-nums text-ink-700 dark:text-ink-200 whitespace-nowrap">
                  {t.maintDose !== null ? `${t.maintDose} mg` : "—"}
                </td>
                <td className="py-2 pr-3 tabular-nums text-ink-700 dark:text-ink-200 whitespace-nowrap">
                  {t.roundedInterval !== null ? `q${t.roundedInterval}h` : "by level"}
                </td>
                <td className="py-2 font-semibold text-emerald-700 dark:text-emerald-400 leading-snug min-w-[9rem]">
                  {t.finalDose}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 pt-3 border-t border-ink-100 dark:border-ink-800">
        <div className="stat-label mb-1.5">Extended interval (once-daily) options</div>
        <div className="flex flex-wrap gap-2">
          {data.extended.map((e, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 dark:bg-ink-800 px-2.5 py-1 text-xs text-ink-700 dark:text-ink-200"
            >
              {e.label}:
              <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
                {e.dose} mg
              </strong>
            </span>
          ))}
        </div>
        <p className="text-[10px] text-ink-500 dark:text-ink-500 mt-2 leading-snug">
          Ke = CrCl × 0.00293 + 0.014. Extended-interval interval set by nomogram/levels per
          protocol.
        </p>
      </div>
    </div>
  );
}
