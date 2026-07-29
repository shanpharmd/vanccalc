"use client";

import { useMemo } from "react";
import { simulateConcentration } from "@/lib/vancoMath";
import { VancoChart } from "./VancoChart";
import type { PKParams, RegimenResult } from "@/lib/types";

interface Props {
  pk: PKParams | null;
  result: RegimenResult | null;
}

export function PredictedPK({ pk, result }: Props) {
  const data = useMemo(() => {
    if (!pk || !result) return [];
    return simulateConcentration(result.regimen, pk, 96, 0.25);
  }, [pk, result]);

  return (
    <div className="card p-5 lg:col-span-12">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="card-title">Predicted Concentration–Time Curve</h3>
        {result && (
          <div className="text-xs text-ink-500 dark:text-ink-400 tabular-nums">
            {result.regimen.dose} mg q{result.regimen.frequency}h ·{" "}
            {result.regimen.infusionTime}h infusion · 96h simulation
          </div>
        )}
      </div>

      {data.length === 0 || !result ? (
        <div className="h-72 grid place-items-center text-sm text-ink-400">
          Awaiting patient input.
        </div>
      ) : (
        <VancoChart
          data={data}
          frequency={result.regimen.frequency}
          infusionTime={result.regimen.infusionTime}
          hoursTotal={96}
          peak={result.peak}
          trough={result.trough}
        />
      )}

      <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-2 leading-relaxed">
        Hover or drag across the curve to read the predicted concentration at any moment.
        ASHP/IDSA 2020 targets AUC₂₄/MIC rather than trough concentration; trough values are
        shown for reference only and are not the primary monitoring parameter.
      </p>
    </div>
  );
}
