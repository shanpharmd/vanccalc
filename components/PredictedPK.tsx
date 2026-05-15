"use client";

import { useMemo } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { simulateConcentration } from "@/lib/vancoMath";
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
          <div className="text-xs text-ink-500 dark:text-ink-400">
            {result.regimen.dose} mg q{result.regimen.frequency}h ·{" "}
            {result.regimen.infusionTime}h infusion · 96h simulation
          </div>
        )}
      </div>

      <div className="h-72 w-full">
        {data.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-ink-400">
            Awaiting patient input.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="vancoFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="t"
                type="number"
                domain={[0, 96]}
                ticks={[0, 12, 24, 36, 48, 60, 72, 84, 96]}
                label={{
                  value: "Time (h)",
                  position: "insideBottom",
                  offset: -4,
                  fill: "var(--muted)",
                  fontSize: 11,
                }}
                stroke="var(--muted)"
              />
              <YAxis
                stroke="var(--muted)"
                width={40}
                label={{
                  value: "Conc (mcg/mL)",
                  angle: -90,
                  position: "insideLeft",
                  offset: 18,
                  fill: "var(--muted)",
                  fontSize: 11,
                }}
              />
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
              <Area
                type="monotone"
                dataKey="c"
                stroke="#0891b2"
                strokeWidth={2}
                fill="url(#vancoFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-2">
        ASHP/IDSA 2020 targets AUC₂₄/MIC rather than trough concentration. Trough values are
        shown in the dose card for reference only and are not the primary monitoring parameter.
      </p>
    </div>
  );
}
