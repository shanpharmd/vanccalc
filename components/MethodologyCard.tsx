"use client";

import type { NormalizedPatient, PKParams } from "@/lib/types";

interface Props {
  pk: PKParams | null;
  normalized: NormalizedPatient | null;
}

// ── sub-components ──────────────────────────────────────────────────────────

/** Patient-supplied value — cyan */
function V({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-brand-600 dark:text-brand-400 font-medium">{children}</span>
  );
}

/** Computed result — green */
function R({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-accent-500 dark:text-accent-400 font-semibold">{children}</span>
  );
}

/** Greyed-out placeholder when no patient data */
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-ink-400 dark:text-ink-500 italic">{children}</span>
  );
}

/** Small inline badge */
function Badge({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: "cyan" | "amber" | "purple" | "red";
}) {
  const cls = {
    cyan:   "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
    amber:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    red:    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  }[variant];
  return (
    <span className={`ml-1.5 inline-block text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${cls}`}>
      {children}
    </span>
  );
}

/** Shaded formula block */
function FormulaBlock({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-ink-50 dark:bg-ink-800/40 p-3">
      <div className="text-[10px] uppercase tracking-wider font-medium text-ink-400 dark:text-ink-500 mb-2 leading-snug">
        {label}
      </div>
      <div className="font-mono text-[11px] text-ink-700 dark:text-ink-300 leading-relaxed space-y-0.5">
        {children}
      </div>
    </div>
  );
}

// ── reference data ───────────────────────────────────────────────────────────

const REFS: { authors: string; title: string; citation: string; note: string }[] = [
  {
    authors: "Rybak MJ, Le J, Lodise TP, et al.",
    title: "Therapeutic monitoring of vancomycin for serious MRSA infections: a revised consensus guideline.",
    citation: "Am J Health Syst Pharm. 2020;77(11):835–864.",
    note: "Primary guideline — AUC24-guided dosing",
  },
  {
    authors: "Matzke GR, McGory RW, Halstenson CE, Keane WF.",
    title: "Pharmacokinetics of vancomycin in patients with various degrees of renal function.",
    citation: "Antimicrob Agents Chemother. 1984;25(4):433–437.",
    note: "kₑ = 0.00083 × CrCl + 0.0044",
  },
  {
    authors: "Cockcroft DW, Gault MH.",
    title: "Prediction of creatinine clearance from serum creatinine.",
    citation: "Nephron. 1976;16(1):31–41.",
    note: "CrCl formula used when BMI < 40",
  },
  {
    authors: "Salazar DE, Corcoran GB.",
    title: "Predicting creatinine clearance and renal drug clearance in obese patients from estimated fat-free body mass.",
    citation: "Am J Med. 1988;84(6):1053–1060.",
    note: "CrCl formula used when BMI ≥ 40",
  },
  {
    authors: "Devine BJ.",
    title: "Gentamicin therapy.",
    citation: "Drug Intell Clin Pharm. 1974;8:650–655.",
    note: "Ideal body weight formula",
  },
  {
    authors: "Ambrose PJ, Winter ME.",
    title: "Vancomycin. In: Basic Clinical Pharmacokinetics, 4th ed.",
    citation: "Lippincott Williams & Wilkins; 2004:451–476.",
    note: "Single-level back-calculation (Ambrose-Winter)",
  },
  {
    authors: "Wurtz R, Itokazu G, Rodvold K.",
    title: "Antimicrobial dosing in obese patients.",
    citation: "Clin Infect Dis. 1997;25(1):112–118.",
    note: "Limb-weight fraction estimates for amputation correction",
  },
];

// ── main component ───────────────────────────────────────────────────────────

export function MethodologyCard({ pk, normalized }: Props) {
  const hasData = !!pk && !!normalized;

  // CrCl weight selection (mirrors crClCockcroftGault logic)
  const ibw = pk?.ibw ?? 0;
  const cw  = normalized?.correctedWeightKg ?? 0;
  const cgIsObese = cw > 1.2 * ibw;
  const cgAdjBw   = ibw + 0.4 * (cw - ibw);
  const cgWeight  = cgIsObese ? cgAdjBw : cw;
  const sexFactor = normalized?.sex === "female" ? 0.85 : 1.0;

  // Salazar-Corcoran intermediate
  const heightM = normalized ? normalized.heightCm / 100 : 0;
  const h2      = heightM * heightM;

  const usingSalazar  = pk?.crClMethod === "salazar-corcoran";
  const usingAmpAdjust = (pk?.amputationCorrectionPct ?? 0) > 0;
  const usingManualVd  = !!normalized?.empiricVdLPerKg;

  return (
    <div className="card p-5 lg:col-span-8">
      <h3 className="card-title mb-1 border-b-2 border-brand-500 pb-2 inline-block">
        Methodology
      </h3>

      <p className="text-xs text-ink-400 dark:text-ink-500 mt-3 mb-4">
        {hasData
          ? "Patient values substituted — blue = input, green = computed result."
          : "Enter patient demographics to see values substituted into each formula."}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">

        {/* ── CrCl ── */}
        <FormulaBlock
          label={
            <>
              Creatinine clearance
              {usingSalazar   && <Badge variant="cyan">Salazar-Corcoran · BMI ≥40</Badge>}
              {!usingSalazar  && <Badge variant="cyan">Cockcroft-Gault</Badge>}
              {usingAmpAdjust && <Badge variant="amber">amp {pk!.amputationCorrectionPct!.toFixed(1)}%</Badge>}
            </>
          }
        >
          {hasData && normalized && pk ? (
            usingSalazar ? (
              <>
                <div>
                  [{normalized.sex === "male" ? "137" : "146"} − <V>{normalized.age}</V>] ×
                  ({normalized.sex === "male" ? "0.285" : "0.287"} × <V>{normalized.correctedWeightKg.toFixed(1)}</V>
                  {usingAmpAdjust && (
                    <span className="text-amber-500 dark:text-amber-400 text-[10px]">
                      {" "}(adj from {normalized.weightKg.toFixed(1)} kg)
                    </span>
                  )}
                  {" "}+ {normalized.sex === "male" ? "12.1" : "9.74"} × <V>{h2.toFixed(3)}</V> m²)
                </div>
                <div>÷ ({normalized.sex === "male" ? "51" : "60"} × <V>{normalized.scrMgDl.toFixed(2)}</V>)</div>
                <div>= <R>{pk.crCl.toFixed(0)} mL/min</R></div>
              </>
            ) : (
              <>
                <div>
                  (140 − <V>{normalized.age}</V>) × <V>{cgWeight.toFixed(1)}</V>
                  {" "}
                  <span className="text-ink-400 dark:text-ink-500 text-[10px]">
                    ({cgIsObese ? `AdjBW` : `TBW`}
                    {usingAmpAdjust ? `, adj from ${normalized.weightKg.toFixed(1)} kg` : ""})
                  </span>
                </div>
                <div>
                  ÷ (72 × <V>{normalized.scrMgDl.toFixed(2)}</V>)
                  {normalized.sex === "female" && " × 0.85"}
                </div>
                <div>= <R>{pk.crCl.toFixed(0)} mL/min</R></div>
              </>
            )
          ) : (
            <Empty>
              {usingSalazar
                ? "[(137/146 − age) × (0.285·wt + 12.1·ht²)] / (51/60 × SCr)"
                : "(140 − age) × weight / (72 × SCr) [× 0.85 female]"}
            </Empty>
          )}
        </FormulaBlock>

        {/* ── ke Matzke ── */}
        <FormulaBlock label="Elimination rate kₑ — Matzke">
          {hasData && pk ? (
            <>
              <div>kₑ = 0.00083 × <V>{pk.crCl.toFixed(0)}</V> + 0.0044</div>
              <div>= <R>{pk.ke.toFixed(4)} /hr</R></div>
              <div className="text-ink-400 dark:text-ink-500 text-[10px] mt-1">
                t½ = 0.693 / {pk.ke.toFixed(4)} = <R>{pk.halfLife.toFixed(1)} h</R>
              </div>
            </>
          ) : (
            <Empty>kₑ = 0.00083 × CrCl + 0.0044</Empty>
          )}
        </FormulaBlock>

        {/* ── Vd ── */}
        <FormulaBlock
          label={
            <>
              Volume of distribution
              {usingManualVd && <Badge variant="purple">manual override</Badge>}
              {!usingManualVd && normalized?.criticallyIll && <Badge variant="red">ICU 0.80 L/kg</Badge>}
              {!usingManualVd && !normalized?.criticallyIll && hasData && <Badge variant="cyan">auto 0.70 L/kg</Badge>}
            </>
          }
        >
          {hasData && pk && normalized ? (
            <>
              <div>Vd = <V>{pk.vdPerKg.toFixed(2)}</V> L/kg × <V>{normalized.weightKg.toFixed(1)}</V> kg</div>
              <div>= <R>{pk.vd.toFixed(1)} L</R></div>
              <div className="text-ink-400 dark:text-ink-500 text-[10px] mt-1">
                CL = <V>{pk.ke.toFixed(4)}</V> × <V>{pk.vd.toFixed(1)}</V> = <R>{pk.cl.toFixed(2)} L/hr</R>
              </div>
            </>
          ) : (
            <Empty>Vd = 0.70 L/kg × TBW  (0.80 if critically ill)</Empty>
          )}
        </FormulaBlock>

        {/* ── IBW / AdjBW ── */}
        <FormulaBlock label="IBW — Devine formula">
          {hasData && pk && normalized ? (
            <>
              <div>
                IBW = {normalized.sex === "male" ? "50" : "45.5"} + 2.3 ×
                (<V>{(normalized.heightCm / 2.54).toFixed(1)}</V> in − 60)
              </div>
              <div>= <R>{pk.ibw.toFixed(1)} kg</R></div>
              <div className="text-ink-400 dark:text-ink-500 text-[10px] mt-1">
                AdjBW = {pk.ibw.toFixed(1)} + 0.4 × (<V>{normalized.weightKg.toFixed(1)}</V> − {pk.ibw.toFixed(1)})
                {" "}= <R>{pk.adjBw.toFixed(1)} kg</R>
                {cgIsObese && (
                  <span className="text-amber-500 dark:text-amber-400"> · obese, AdjBW used for CrCl</span>
                )}
              </div>
            </>
          ) : (
            <Empty>
              IBW = 50 (male) / 45.5 (female) + 2.3 × (height_in − 60)
            </Empty>
          )}
        </FormulaBlock>

      </div>

      {/* ── References ── */}
      <details className="group">
        <summary className="cursor-pointer list-none flex items-center gap-1.5 select-none">
          <span className="text-ink-400 dark:text-ink-500 group-open:rotate-180 transition-transform inline-block text-xs">▾</span>
          <span className="text-xs font-medium text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200 transition">
            References ({REFS.length})
          </span>
        </summary>
        <ol className="mt-3 space-y-2 list-none">
          {REFS.map((ref, i) => (
            <li key={i} className="flex gap-2.5 text-[11px] text-ink-500 dark:text-ink-400 leading-relaxed border-b border-ink-100 dark:border-ink-800 pb-2 last:border-0 last:pb-0">
              <span className="text-ink-400 dark:text-ink-500 font-medium shrink-0 w-4 text-right">{i + 1}.</span>
              <span>
                {ref.authors}{" "}
                <span className="italic">{ref.title}</span>{" "}
                {ref.citation}
                <span className="ml-1.5 text-[10px] text-brand-500 dark:text-brand-400 not-italic">
                  [{ref.note}]
                </span>
              </span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
