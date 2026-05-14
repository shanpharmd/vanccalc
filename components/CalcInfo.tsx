"use client";

interface Props {
  hasResult: boolean;
}

export function CalcInfo({ hasResult }: Props) {
  return (
    <div className="card p-5 lg:col-span-4">
      <h3 className="card-title mb-4 border-b-2 border-brand-500 pb-2 inline-block">Calculation Information</h3>
      <div className="space-y-2 text-sm">
        <Row label="Method" value={hasResult ? "Population PK (one-compartment)" : "—"} />
        <Row label="PK model" value={hasResult ? "ASHP/IDSA 2020 · Matzke ke" : "—"} />
        <Row label="Dosing target" value="AUC₂₄/MIC 400–600" />
        <Row label="Vd assumption" value="0.7 L/kg (0.8 if ICU)" />
        <Row label="Rounding" value="250 mg increments" />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-500 dark:text-ink-400 text-xs">{label}</span>
      <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100 text-right">{value}</span>
    </div>
  );
}
