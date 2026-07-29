"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SimulationPoint } from "@/lib/types";

// Bespoke SVG concentration–time chart.
// Two things recharts can't do cleanly and are the signature of this calculator:
//   1. A scrub cursor that rides the curve with a live clinical readout
//      (concentration, dose number, infusion phase, time to next dose).
//   2. A draw-on animation with a glow, re-triggered whenever the regimen changes.

const VIEW_W = 900;
const VIEW_H = 340;
const PAD = { top: 26, right: 22, bottom: 42, left: 54 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

interface Props {
  data: SimulationPoint[];
  frequency: number;      // tau (h)
  infusionTime: number;   // h
  hoursTotal?: number;
  /** Optional steady-state reference lines */
  peak?: number;
  trough?: number;
}

export function VancoChart({
  data,
  frequency,
  infusionTime,
  hoursTotal = 96,
  peak,
  trough,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const yMax = useMemo(() => {
    if (!data.length) return 10;
    const m = Math.max(...data.map((d) => d.c), 1);
    return Math.max(5, Math.ceil((m * 1.18) / 5) * 5);
  }, [data]);

  const x = useCallback((t: number) => PAD.left + (t / hoursTotal) * PLOT_W, [hoursTotal]);
  const y = useCallback((c: number) => PAD.top + PLOT_H - (c / yMax) * PLOT_H, [yMax]);

  const linePath = useMemo(() => {
    if (!data.length) return "";
    return data
      .map((d, i) => `${i === 0 ? "M" : "L"}${x(d.t).toFixed(2)},${y(d.c).toFixed(2)}`)
      .join(" ");
  }, [data, x, y]);

  const areaPath = useMemo(() => {
    if (!data.length) return "";
    const base = PAD.top + PLOT_H;
    return `${linePath} L${x(data[data.length - 1].t).toFixed(2)},${base} L${x(
      data[0].t
    ).toFixed(2)},${base} Z`;
  }, [linePath, data, x]);

  // ── Draw-on animation, re-triggered on regimen change ──
  useEffect(() => {
    const p = lineRef.current;
    if (!p || !linePath) return;
    const len = p.getTotalLength();
    p.style.transition = "none";
    p.style.strokeDasharray = `${len}`;
    p.style.strokeDashoffset = `${len}`;
    void p.getBoundingClientRect(); // force reflow so the reset applies
    p.style.transition = "stroke-dashoffset 950ms cubic-bezier(0.22, 1, 0.36, 1)";
    p.style.strokeDashoffset = "0";
  }, [linePath]);

  // ── Pointer scrubbing ──
  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || data.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (VIEW_W / rect.width);
    const t = ((sx - PAD.left) / PLOT_W) * hoursTotal;
    const step = data[1].t - data[0].t || 0.25;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round(t / step)));
    setHoverIdx(idx);
  };

  const hover = hoverIdx !== null ? data[hoverIdx] : null;

  // Clinical context at the scrub point
  const readout = useMemo(() => {
    if (!hover) return null;
    const doseNum = Math.floor(hover.t / frequency) + 1;
    const intoInterval = hover.t % frequency;
    const infusing = intoInterval < infusionTime;
    const toNext = frequency - intoInterval;
    return { doseNum, infusing, toNext, intoInterval };
  }, [hover, frequency, infusionTime]);

  const xTicks = useMemo(() => {
    const stepH = hoursTotal <= 48 ? 8 : 12;
    const out: number[] = [];
    for (let t = 0; t <= hoursTotal; t += stepH) out.push(t);
    return out;
  }, [hoursTotal]);

  const yTicks = useMemo(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, i) => (yMax / n) * i);
  }, [yMax]);

  // Dose start markers along the baseline
  const doseMarks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= hoursTotal; t += frequency) out.push(t);
    return out;
  }, [frequency, hoursTotal]);

  if (!data.length) {
    return (
      <div className="h-72 grid place-items-center text-sm text-ink-400">
        Awaiting regimen input.
      </div>
    );
  }

  const hoverPct = hover ? ((x(hover.t) / VIEW_W) * 100) : 0;

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto touch-none"
        onPointerMove={handleMove}
        onPointerDown={handleMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="vcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.38" />
            <stop offset="55%" stopColor="#06b6d4" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="vcStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>
          <filter id="vcGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* horizontal grid + y labels */}
        {yTicks.map((c, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={y(c)}
              y2={y(c)}
              stroke="var(--border)"
              strokeDasharray={i === 0 ? undefined : "3 4"}
              strokeWidth="1"
            />
            <text
              x={PAD.left - 10}
              y={y(c) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--muted)"
            >
              {Math.round(c)}
            </text>
          </g>
        ))}

        {/* x ticks */}
        {xTicks.map((t) => (
          <text
            key={t}
            x={x(t)}
            y={PAD.top + PLOT_H + 20}
            textAnchor="middle"
            fontSize="11"
            fill="var(--muted)"
          >
            {t}
          </text>
        ))}
        <text
          x={PAD.left + PLOT_W / 2}
          y={VIEW_H - 6}
          textAnchor="middle"
          fontSize="11"
          fill="var(--muted)"
        >
          Time (h)
        </text>
        <text
          x={16}
          y={PAD.top + PLOT_H / 2}
          textAnchor="middle"
          fontSize="11"
          fill="var(--muted)"
          transform={`rotate(-90 16 ${PAD.top + PLOT_H / 2})`}
        >
          Concentration (mcg/mL)
        </text>

        {/* steady-state reference lines */}
        {peak !== undefined && peak > 0 && peak < yMax && (
          <line
            x1={PAD.left}
            x2={VIEW_W - PAD.right}
            y1={y(peak)}
            y2={y(peak)}
            stroke="var(--muted)"
            strokeDasharray="5 5"
            strokeWidth="1"
            opacity="0.7"
          />
        )}
        {trough !== undefined && trough > 0 && (
          <line
            x1={PAD.left}
            x2={VIEW_W - PAD.right}
            y1={y(trough)}
            y2={y(trough)}
            stroke="var(--muted)"
            strokeDasharray="5 5"
            strokeWidth="1"
            opacity="0.7"
          />
        )}

        {/* dose start markers */}
        {doseMarks.map((t) => (
          <line
            key={t}
            x1={x(t)}
            x2={x(t)}
            y1={PAD.top + PLOT_H}
            y2={PAD.top + PLOT_H + 5}
            stroke="var(--muted)"
            strokeWidth="1.5"
            opacity="0.55"
          />
        ))}

        {/* area + curve */}
        <path d={areaPath} fill="url(#vcFill)" className="vc-area" />
        <path
          ref={lineRef}
          d={linePath}
          fill="none"
          stroke="url(#vcStroke)"
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
          filter="url(#vcGlow)"
        />

        {/* scrub cursor */}
        {hover && (
          <g pointerEvents="none">
            <line
              x1={x(hover.t)}
              x2={x(hover.t)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="var(--muted)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <circle
              cx={x(hover.t)}
              cy={y(hover.c)}
              r="11"
              fill="#22d3ee"
              opacity="0.18"
              className="vc-pulse"
            />
            <circle
              cx={x(hover.t)}
              cy={y(hover.c)}
              r="4.5"
              fill="#22d3ee"
              stroke="var(--surface)"
              strokeWidth="2"
              filter="url(#vcGlow)"
            />
          </g>
        )}
      </svg>

      {/* live readout */}
      {hover && readout && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 min-w-[10.5rem]"
          style={{ left: `${Math.min(88, Math.max(12, hoverPct))}%` }}
        >
          <div className="rounded-xl border border-ink-200 dark:border-ink-700 bg-white/95 dark:bg-ink-900/95 backdrop-blur px-3 py-2 shadow-card">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                {hover.c.toFixed(1)}
              </span>
              <span className="text-[10px] text-ink-500 dark:text-ink-400">mcg/mL</span>
            </div>
            <div className="mt-1.5 space-y-0.5 text-[10px] text-ink-500 dark:text-ink-400">
              <Row label="Time" value={`${hover.t.toFixed(2)} h`} />
              <Row label="Dose" value={`#${readout.doseNum}`} />
              <Row
                label="Phase"
                value={readout.infusing ? "Infusing" : "Post-infusion"}
                accent={readout.infusing}
              />
              <Row label="Next dose" value={`${readout.toNext.toFixed(1)} h`} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span
        className={`font-mono tabular-nums ${
          accent
            ? "text-brand-600 dark:text-brand-400"
            : "text-ink-700 dark:text-ink-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
