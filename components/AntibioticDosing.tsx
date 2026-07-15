"use client";

import { useMemo, useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
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
    effective === "HD" ? "HD" : effective !== null ? `${Math.round(effective)}` : "—";

  return (
    <div className="max-w-5xl space-y-5">
      {/* ── Renal function control bar ── */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex items-center gap-3.5">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-2.5 ring-1 ring-emerald-100 dark:ring-emerald-900/50">
              <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Creatinine clearance
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[28px] leading-none font-semibold text-ink-900 dark:text-ink-100 tabular-nums">
                  {crclLabel}
                </span>
                {effective !== "HD" && effective !== null && (
                  <span className="text-xs text-ink-500 dark:text-ink-400">mL/min</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 sm:ml-auto">
            <div>
              <div className="field-label">Source</div>
              <Toggle
                value={mode}
                onChange={(v) => setMode(v)}
                options={[
                  { label: "Patient", value: "auto" },
                  { label: "Manual", value: "manual" },
                  { label: "HD", value: "hd" },
                ]}
              />
            </div>
            {mode === "manual" && (
              <div>
                <div className="field-label">mL/min</div>
                <input
                  type="number"
                  inputMode="decimal"
                  value={manual ?? ""}
                  placeholder="45"
                  onChange={(e) =>
                    setManual(e.target.value === "" ? undefined : Number(e.target.value))
                  }
                  className="field-input w-24"
                />
              </div>
            )}
          </div>
        </div>

        {mode === "auto" && crCl === null && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
            Complete patient demographics in the sidebar, or switch to Manual / HD.
          </p>
        )}
        {adjBw !== null && ibw !== null && (
          <div className="mt-4 pt-3 border-t border-ink-100 dark:border-ink-800 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-ink-500 dark:text-ink-400">
            <span>
              Aminoglycoside dosing weight (AdjBW){" "}
              <strong className="text-ink-800 dark:text-ink-100 tabular-nums font-mono">
                {Math.round(adjBw)} kg
              </strong>
            </span>
            <span>
              IBW{" "}
              <strong className="text-ink-700 dark:text-ink-200 tabular-nums font-mono">
                {Math.round(ibw)} kg
              </strong>
            </span>
          </div>
        )}
      </div>

      {effective === null ? (
        <div className="card p-8 text-center text-sm text-ink-500 dark:text-ink-400">
          Enter a creatinine clearance (patient data, manual, or HD) to see antibiotic dosing.
        </div>
      ) : (
        <>
          {/* ── Beta-lactam / FQ / carbapenem lookups ── */}
          <Section title="Renal-adjusted dosing" subtitle="Beta-lactams · fluoroquinolone · carbapenem" defaultOpen>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {betaLactams!.map((d) => (
                <div
                  key={d.drug}
                  className="rounded-xl border border-ink-200 dark:border-ink-800 bg-ink-50/40 dark:bg-ink-950/30 p-4"
                >
                  <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100 mb-3">
                    {d.drug}
                  </h3>
                  <div className="space-y-2.5">
                    {d.rows.map((r, i) => (
                      <div key={i} className="flex items-baseline justify-between gap-4">
                        <span className="text-xs text-ink-600 dark:text-ink-400 leading-snug flex-1">
                          {r.indication}
                        </span>
                        <span className="text-sm font-semibold font-mono text-emerald-700 dark:text-emerald-400 text-right whitespace-nowrap">
                          {r.dose}
                        </span>
                      </div>
                    ))}
                  </div>
                  {d.note && (
                    <p className="text-[10px] text-ink-400 dark:text-ink-500 mt-3 pt-2.5 border-t border-ink-100 dark:border-ink-800/70 leading-snug">
                      {d.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* ── Aminoglycosides ── */}
          <Section
            title="Aminoglycoside dosing"
            subtitle="Traditional peak / trough · extended interval"
            defaultOpen
          >
            {aminoglycosides === null ? (
              <div className="rounded-xl border border-dashed border-ink-200 dark:border-ink-800 p-6 text-center text-sm text-ink-500 dark:text-ink-400">
                Complete patient sex, height, and weight in the sidebar to compute aminoglycoside
                dosing (requires adjusted body weight).
              </div>
            ) : (
              <div className="space-y-3">
                {aminoglycosides.map((a) => (
                  <AminoglycosideCard key={a.drug} data={a} />
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      {/* ── Disclaimer ── */}
      <p className="text-[11px] text-ink-400 dark:text-ink-500 leading-relaxed px-1">
        Adults only (≥18 yr). Not for pediatric or renal-replacement (CRRT/PD) dosing unless
        noted. Aminoglycoside PK is a population estimate; confirm with measured levels.
        Beta-lactam intervals follow institutional protocol. Verify every dose before prescribing.
      </p>
    </div>
  );
}

/* ── Collapsible section (native <details>) ── */
function Section({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group card overflow-hidden">
      <summary className="cursor-pointer list-none flex items-center justify-between px-5 py-3.5 hover:bg-ink-50/60 dark:hover:bg-ink-800/30 transition">
        <div>
          <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-100">{title}</h2>
          {subtitle && (
            <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <ChevronDown className="w-4 h-4 text-ink-400 group-open:rotate-180 transition" />
      </summary>
      <div className="px-5 pb-5 pt-1">{children}</div>
    </details>
  );
}

function AminoglycosideCard({ data }: { data: AminoglycosideResult }) {
  if (data.hd) {
    return (
      <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-ink-50/40 dark:bg-ink-950/30 p-4">
        <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100 mb-1">{data.drug}</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Hemodialysis: dose by measured levels per protocol. PK estimation is not applied.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-ink-50/40 dark:bg-ink-950/30 p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-1">
        <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100">{data.drug}</h3>
        <span className="text-[11px] text-ink-500 dark:text-ink-400">
          AdjBW{" "}
          <span className="font-mono text-ink-700 dark:text-ink-200">
            {Math.round(data.adjBwKg)} kg
          </span>{" "}
          · t½{" "}
          <span className="font-mono text-ink-700 dark:text-ink-200">
            {data.traditional[0].halfLife.toFixed(1)} h
          </span>
        </span>
      </div>

      {/* Scenario → final dose, one clean row each */}
      <div className="divide-y divide-ink-100 dark:divide-ink-800/70">
        {data.traditional.map((t, i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-ink-700 dark:text-ink-200 leading-snug">{t.label}</div>
              <div className="text-[10px] text-ink-400 dark:text-ink-500 mt-0.5">
                peak {t.peak} · trough {t.trough}
              </div>
            </div>
            <div className="text-sm font-semibold font-mono text-emerald-700 dark:text-emerald-400 text-right whitespace-nowrap">
              {t.finalDose}
            </div>
          </div>
        ))}
      </div>

      {/* Extended interval chips */}
      <div className="mt-3 pt-3 border-t border-ink-100 dark:border-ink-800/70">
        <div className="text-[10px] uppercase tracking-wider text-ink-400 dark:text-ink-500 mb-2">
          Extended interval (once-daily)
        </div>
        <div className="flex flex-wrap gap-2">
          {data.extended.map((e, i) => (
            <span
              key={i}
              className="inline-flex items-baseline gap-1.5 rounded-lg bg-white dark:bg-ink-900 ring-1 ring-ink-200 dark:ring-ink-700 px-2.5 py-1 text-xs text-ink-600 dark:text-ink-300"
            >
              {e.label}
              <strong className="font-mono text-emerald-700 dark:text-emerald-400">
                {e.dose} mg
              </strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
