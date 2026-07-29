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
  /** Dashed "what was supposed to happen" curve drawn behind the actual one. */
  ghost?: SimulationPoint[];
  /** Horizontal threshold line (e.g. restart-dosing target). */
  threshold?: number;
  thresholdLabel?: string;
  /** Explicit dose administration times; falls back to every `frequency` hours. */
  doseTimes?: number[];
  /** Draggable level-draw marker (hours). Enables drag when onMarkerChange is set. */
  marker?: number | null;
  onMarkerChange?: (t: number) => void;
}

export function VancoChart({
  data,
  frequency,
  infusionTime,
  hoursTotal = 96,
  peak,
  trough,
  ghost,
  threshold,
  thresholdLabel,
  doseTimes,
  marker = null,
  onMarkerChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const yMax = useMemo(() => {
    if (!data.length) return 10;
    const m = Math.max(
      ...data.map((d) => d.c),
      ...(ghost?.map((d) => d.c) ?? []),
      threshold ?? 0,
      1
    );
    return Math.max(5, Math.ceil((m * 1.18) / 5) * 5);
  }, [data, ghost, threshold]);

  const x = useCallback((t: number) => PAD.left + (t / hoursTotal) * PLOT_W, [hoursTotal]);
  const y = useCallback((c: number) => PAD.top + PLOT_H - (c / yMax) * PLOT_H, [yMax]);

  const linePath = useMemo(() => {
    if (!data.length) return "";
    return data
      .map((d, i) => `${i === 0 ? "M" : "L"}${x(d.t).toFixed(2)},${y(d.c).toFixed(2)}`)
      .join(" ");
  }, [data, x, y]);

  const ghostPath = useMemo(() => {
    if (!ghost?.length) return "";
    return ghost
      .map((d, i) => `${i === 0 ? "M" : "L"}${x(d.t).toFixed(2)},${y(d.c).toFixed(2)}`)
      .join(" ");
  }, [ghost, x, y]);

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

  // ── Pointer scrubbing / marker dragging ──
  const [dragging, setDragging] = useState(false);

  /** Convert a pointer event to a clamped time in hours. */
  const timeFromEvent = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): number | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (VIEW_W / rect.width);
      const t = ((sx - PAD.left) / PLOT_W) * hoursTotal;
      return Math.max(0, Math.min(hoursTotal, t));
    },
    [hoursTotal]
  );

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (data.length < 2) return;
    const t = timeFromEvent(e);
    if (t === null) return;
    const step = data[1].t - data[0].t || 0.25;
    setHoverIdx(Math.max(0, Math.min(data.length - 1, Math.round(t / step))));
    if (dragging && onMarkerChange) onMarkerChange(Number(t.toFixed(2)));
  };

  const handleDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (onMarkerChange) {
      const t = timeFromEvent(e);
      if (t !== null) {
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        onMarkerChange(Number(t.toFixed(2)));
      }
    }
    handleMove(e);
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragging) {
      setDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    }
  };

  /** Concentration on the actual curve at an arbitrary time (for the marker). */
  const concAt = useCallback(
    (t: number) => {
      if (data.length < 2) return 0;
      const step = data[1].t - data[0].t || 0.25;
      const i = Math.max(0, Math.min(data.length - 1, Math.round(t / step)));
      return data[i].c;
    },
    [data]
  );

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
    if (doseTimes?.length) return doseTimes.filter((t) => t >= 0 && t <= hoursTotal);
    const out: number[] = [];
    for (let t = 0; t <= hoursTotal; t += frequency) out.push(t);
    return out;
  }, [doseTimes, frequency, hoursTotal]);

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
        className={`w-full h-auto touch-none ${onMarkerChange ? "cursor-crosshair" : ""}`}
        onPointerMove={handleMove}
        onPointerDown={handleDown}
        onPointerUp={endDrag}
        onPointerLeave={(e) => {
          endDrag(e);
          setHoverIdx(null);
        }}
      >
        <defs>
          <linearGradient id="vcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2b5480" stopOpacity="0.38" />
            <stop offset="55%" stopColor="#2b5480" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#2b5480" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="vcStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3e6c9c" />
            <stop offset="100%" stopColor="#1f4066" />
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

        {/* threshold line */}
        {threshold !== undefined && threshold > 0 && threshold < yMax && (
          <g>
            <line
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={y(threshold)}
              y2={y(threshold)}
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              opacity="0.9"
            />
            <text
              x={VIEW_W - PAD.right - 4}
              y={y(threshold) - 6}
              textAnchor="end"
              fontSize="10"
              fill="#f59e0b"
            >
              {thresholdLabel ?? `${threshold} mcg/mL`}
            </text>
          </g>
        )}

        {/* ghost (scheduled) curve */}
        {ghostPath && (
          <path
            d={ghostPath}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="1.5"
            strokeDasharray="5 5"
            opacity="0.55"
          />
        )}

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

        {/* draggable level-draw marker */}
        {marker !== null && marker !== undefined && (
          <g pointerEvents="none">
            <line
              x1={x(marker)}
              x2={x(marker)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="#c0713f"
              strokeWidth="1.5"
            />
            <circle
              cx={x(marker)}
              cy={y(concAt(marker))}
              r="6"
              fill="#c0713f"
              stroke="var(--surface)"
              strokeWidth="2"
            />
            <g transform={`translate(${x(marker)}, ${PAD.top - 8})`}>
              <rect x="-26" y="-14" width="52" height="17" rx="4" fill="#c0713f" />
              <text
                x="0"
                y="-1.5"
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="#fff"
              >
                DRAW
              </text>
            </g>
          </g>
        )}

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
              fill="#c0713f"
              opacity="0.18"
              className="vc-pulse"
            />
            <circle
              cx={x(hover.t)}
              cy={y(hover.c)}
              r="4.5"
              fill="#c0713f"
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
