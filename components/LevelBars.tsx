"use client";

// Target-band bars for a regimen's predicted exposure.
//
// Honest labelling matters here. AUC24 is the only metric with a guideline
// target (ASHP/IDSA 2020: 400-600 mg·h/L at MIC 1). The trough band is a
// reference range carried over from pre-2020 practice and is marked as such.
// Peak has no established target, so it gets a value and a scale, no band.

interface BandBarProps {
  label: string;
  value: number;
  unit: string;
  /** Scale bounds for the track. */
  min: number;
  max: number;
  /** Optional target band drawn on the track. */
  bandLow?: number;
  bandHigh?: number;
  bandNote?: string;
  digits?: number;
  /** Values above this read as a hard danger, not just out of range. */
  dangerAbove?: number;
}

type Status = "in" | "out" | "danger" | "none";

function statusOf(p: BandBarProps): Status {
  if (p.dangerAbove !== undefined && p.value > p.dangerAbove) return "danger";
  if (p.bandLow === undefined || p.bandHigh === undefined) return "none";
  return p.value >= p.bandLow && p.value <= p.bandHigh ? "in" : "out";
}

const TEXT: Record<Status, string> = {
  in: "text-accent-600 dark:text-accent-400",
  out: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
  none: "text-ink-900 dark:text-ink-100",
};

const FILL: Record<Status, string> = {
  in: "bg-accent-500",
  out: "bg-amber-500",
  danger: "bg-red-500",
  none: "bg-brand-500",
};

export function BandBar(props: BandBarProps) {
  const { label, value, unit, min, max, bandLow, bandHigh, bandNote, digits = 1 } = props;
  const status = statusOf(props);
  const span = max - min || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));

  const hasBand = bandLow !== undefined && bandHigh !== undefined;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
          {label}
        </span>
        <span className={`text-lg font-semibold tabular-nums ${TEXT[status]}`}>
          {value.toFixed(digits)}
          <span className="text-[11px] font-normal text-ink-500 dark:text-ink-400 ml-1">
            {unit}
          </span>
        </span>
      </div>

      <div className="relative h-7 rounded-md bg-ink-100 dark:bg-ink-900 overflow-hidden">
        {/* target band */}
        {hasBand && (
          <div
            className="absolute inset-y-0 bg-accent-500/15 border-x border-accent-500/40"
            style={{ left: `${pct(bandLow!)}%`, width: `${pct(bandHigh!) - pct(bandLow!)}%` }}
          />
        )}
        {/* value fill */}
        <div
          className={`absolute inset-y-0 left-0 ${FILL[status]} opacity-70`}
          style={{ width: `${pct(value)}%` }}
        />
        {/* value marker */}
        <div
          className="absolute inset-y-0 w-0.5 bg-ink-900 dark:bg-ink-100"
          style={{ left: `${pct(value)}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-ink-400 dark:text-ink-500 tabular-nums">{min}</span>
        {hasBand && (
          <span className="text-[10px] text-ink-500 dark:text-ink-400 tabular-nums">
            target {bandLow}
            {"–"}
            {bandHigh}
            {bandNote ? ` (${bandNote})` : ""}
          </span>
        )}
        {!hasBand && bandNote && (
          <span className="text-[10px] text-ink-400 dark:text-ink-500">{bandNote}</span>
        )}
        <span className="text-[10px] text-ink-400 dark:text-ink-500 tabular-nums">{max}</span>
      </div>
    </div>
  );
}

export function LevelBars({
  peak,
  trough,
  auc24,
  aucMin,
  aucMax,
}: {
  peak: number;
  trough: number;
  auc24: number;
  aucMin: number;
  aucMax: number;
}) {
  // Scale the AUC track so the target band sits mid-track at typical values.
  const aucScaleMax = Math.max(1000, Math.ceil((auc24 * 1.25) / 100) * 100);
  const peakScaleMax = Math.max(60, Math.ceil((peak * 1.25) / 10) * 10);
  const troughScaleMax = Math.max(40, Math.ceil((trough * 1.25) / 5) * 5);

  return (
    <div className="space-y-4">
      <BandBar
        label="AUC24 / MIC"
        value={auc24}
        unit="mg·h/L"
        min={0}
        max={aucScaleMax}
        bandLow={aucMin}
        bandHigh={aucMax}
        bandNote="ASHP/IDSA 2020"
        digits={0}
      />
      <BandBar
        label="Predicted trough"
        value={trough}
        unit="mcg/mL"
        min={0}
        max={troughScaleMax}
        bandLow={10}
        bandHigh={20}
        bandNote="reference range"
        dangerAbove={20}
      />
      <BandBar
        label="Predicted peak"
        value={peak}
        unit="mcg/mL"
        min={0}
        max={peakScaleMax}
        bandNote="no guideline target"
      />
    </div>
  );
}
