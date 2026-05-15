"use client";

import { fmt } from "@/lib/vancoMath";
import type { PKParams } from "@/lib/types";

interface Props {
  pk: PKParams | null;
}

export function KineticParams({ pk }: Props) {
  const crClLabel =
    pk?.crClMethod === "salazar-corcoran"
      ? "CrCl (Salazar-Corcoran)"
      : "CrCl (Cockcroft-Gault)";

  return (
    <div className="card p-5 lg:col-span-4">
      <h3 className="card-title mb-4 border-b-2 border-accent-500 pb-2 inline-block">Kinetic Parameters</h3>
      <div className="space-y-2 text-sm">
        <Row label={crClLabel} value={pk ? `${pk.crCl.toFixed(0)} mL/min` : "—"} />
        {pk?.crClMethod === "salazar-corcoran" && (
          <p className="text-[10px] text-brand-400 leading-snug -mt-1">
            BMI ≥40 — Salazar-Corcoran used (more accurate in morbid obesity)
          </p>
        )}
        {pk?.amputationCorrectionPct != null && (
          <p className="text-[10px] text-amber-400 leading-snug -mt-1">
            {pk.amputationCorrectionPct.toFixed(1)}% amputation correction applied to CrCl weight
          </p>
        )}
        <Row label="Elimination rate (kₑ)" value={pk ? `${fmt.num(pk.ke, 4)} /h` : "—"} />
        <Row label="Volume of distribution (Vd)" value={pk ? `${pk.vd.toFixed(1)} L (${pk.vdPerKg.toFixed(2)} L/kg)` : "—"} />
        <Row label="Clearance (CLᵥₐₙ꜀ₒ)" value={pk ? `${pk.cl.toFixed(2)} L/h` : "—"} />
        <Row label="Half-life (t½)" value={pk ? `${pk.halfLife.toFixed(1)} h` : "—"} />
        <Row label="IBW · AdjBW" value={pk ? `${pk.ibw.toFixed(1)} · ${pk.adjBw.toFixed(1)} kg` : "—"} />
        <Row label="BMI" value={pk ? pk.bmi.toFixed(1) : "—"} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-500 dark:text-ink-400 text-xs">{label}</span>
      <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">{value}</span>
    </div>
  );
}
