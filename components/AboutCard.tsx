"use client";

interface Props {
  onLoadExample: () => void;
}

export function AboutCard({ onLoadExample }: Props) {
  return (
    <div className="card p-5 lg:col-span-4">
      <h3 className="card-title mb-4 border-b-2 border-ink-300 dark:border-ink-700 pb-2 inline-block">About</h3>
      <p className="text-sm text-ink-700 dark:text-ink-300 leading-relaxed">
        VancoCalc Pro estimates an empiric vancomycin dosing schedule using
        first-order, one-compartment population pharmacokinetics aligned with
        the 2020 ASHP/IDSA consensus guideline.
      </p>
      <p className="text-xs text-ink-500 dark:text-ink-400 mt-3">
        v0.1 · Bayesian level-feedback module is in development.
      </p>
      <button onClick={onLoadExample} className="btn-primary mt-4 text-xs">
        Load example
      </button>
    </div>
  );
}
