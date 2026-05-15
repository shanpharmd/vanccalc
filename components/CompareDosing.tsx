"use client";

import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import { fmt } from "@/lib/vancoMath";
import type { RegimenResult, TargetRange } from "@/lib/types";

interface Props {
  options: RegimenResult[];
  target: TargetRange;
  onSelect: (r: RegimenResult) => void;
  selectedFrequency?: number;
}

export function CompareDosing({ options, target, onSelect, selectedFrequency }: Props) {
  return (
    <div className="card p-5 lg:col-span-7">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="card-title">Compare Dosing Options</h3>
        <div className="text-xs flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200 font-semibold uppercase tracking-wider">
            Target
          </span>
          <span className="text-ink-600 dark:text-ink-300 font-medium">
            AUC₂₄ {target.aucMin}–{target.aucMax} · MIC {target.mic.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 border-b border-ink-200 dark:border-ink-800">
              <th className="text-left font-medium py-2 pr-3">Freq</th>
              <th className="text-right font-medium py-2 px-3">Dose</th>
              <th className="text-right font-medium py-2 px-3">AUC₂₄</th>
              <th className="text-right font-medium py-2 px-3">Peak</th>
              <th className="text-right font-medium py-2 px-3">Trough</th>
              <th className="text-right font-medium py-2 pl-3"></th>
            </tr>
          </thead>
          <tbody>
            {options.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-ink-400 py-6">
                  —
                </td>
              </tr>
            )}
            {options.map((r) => {
              const inRange =
                r.auc24 >= target.aucMin && r.auc24 <= target.aucMax;
              const isSelected = r.regimen.frequency === selectedFrequency;
              return (
                <tr
                  key={r.regimen.frequency}
                  className={clsx(
                    "border-b border-ink-100 dark:border-ink-800 last:border-0",
                    isSelected && "bg-brand-50/50 dark:bg-brand-900/10"
                  )}
                >
                  <td className="py-2.5 pr-3 font-semibold">
                    q{r.regimen.frequency}h
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    <span className="inline-flex items-center gap-1 justify-end">
                      {fmt.mg(r.regimen.dose)}
                      {r.regimen.doseCapped && (
                        <span title="Dose capped at 3,500 mg absolute maximum">
                          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                        </span>
                      )}
                    </span>
                  </td>
                  <td
                    className={clsx(
                      "py-2.5 px-3 text-right tabular-nums font-medium",
                      inRange
                        ? "text-accent-600 dark:text-accent-400"
                        : "text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {fmt.auc(r.auc24)}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {fmt.conc(r.peak)}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {fmt.conc(r.trough)}
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    <button
                      onClick={() => onSelect(r)}
                      className={clsx(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition",
                        isSelected
                          ? "bg-brand-600 text-white"
                          : "bg-ink-100 text-ink-700 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700"
                      )}
                    >
                      {isSelected ? "Selected" : "Select"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-3">
        Doses rounded to 250 mg · Max infusion rate 1,000 mg/hr ·{" "}
        <AlertTriangle className="inline w-2.5 h-2.5 text-amber-500" /> = 3,500 mg
        absolute ceiling applied
      </p>
    </div>
  );
}
