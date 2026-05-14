"use client";

import { CheckCircle2, Circle, Info, Beaker, FlaskConical, User, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Toggle } from "./Toggle";
import type { PatientInput } from "@/lib/types";
import Image from "next/image";

interface SidebarProps {
  patient: Partial<PatientInput>;
  setPatient: (p: Partial<PatientInput>) => void;
  complete: boolean;
  onClear: () => void;
  onLoadExample: () => void;
}

export function Sidebar({ patient, setPatient, complete, onClear, onLoadExample }: SidebarProps) {
  const update = <K extends keyof PatientInput>(k: K, v: PatientInput[K]) =>
    setPatient({ ...patient, [k]: v });

  const numField = (
    field: keyof PatientInput,
    placeholder = ""
  ) => (
    <input
      type="number"
      inputMode="decimal"
      value={(patient[field] as number | undefined) ?? ""}
      placeholder={placeholder}
      onChange={(e) => update(field, (e.target.value === "" ? undefined : Number(e.target.value)) as any)}
      className="field-input"
    />
  );

  return (
    <aside className="w-full lg:w-80 lg:min-h-screen bg-gradient-to-b from-ink-900 to-ink-950 text-ink-100 p-6 lg:sticky lg:top-0">
      {/* Brand */}
      <div className="mb-6">
        <div className="mb-3">
          <Image
            src="/theraintel-logo.png"
            alt="TheraIntel"
            width={160}
            height={36}
            className="object-contain"
            priority
          />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">VancoCalc <span className="text-brand-400">Pro</span></h1>
        <p className="text-xs text-ink-400 mt-1">
          Vancomycin AUC Dosing · ASHP/IDSA 2020
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 text-xs">
        <Step active label="Patient" done={complete} />
        <div className="flex-1 h-px bg-ink-700" />
        <Step active={false} label="History" done={false} />
        <div className="flex-1 h-px bg-ink-700" />
        <Step active={false} label="Levels" done={false} />
      </div>

      {/* Patient Information */}
      <Section icon={<User className="w-4 h-4" />} title="Patient Information" defaultOpen>
        <div className="space-y-3">
          <Field label="Age (years)">{numField("age", "e.g. 65")}</Field>

          <Field label="Weight">
            <div className="flex gap-2">
              {numField("weight", "70")}
              <Toggle
                value={patient.weightUnit ?? "kg"}
                onChange={(v) => update("weightUnit", v)}
                options={[
                  { label: "kg", value: "kg" },
                  { label: "lb", value: "lb" },
                ]}
              />
            </div>
          </Field>

          <Field label="Sex">
            <Toggle
              value={patient.sex ?? "male"}
              onChange={(v) => update("sex", v)}
              options={[
                { label: "Male", value: "male" },
                { label: "Female", value: "female" },
              ]}
            />
          </Field>

          <Field label="Height">
            <div className="flex gap-2">
              {numField("height", "170")}
              <Toggle
                value={patient.heightUnit ?? "cm"}
                onChange={(v) => update("heightUnit", v)}
                options={[
                  { label: "in", value: "in" },
                  { label: "cm", value: "cm" },
                ]}
              />
            </div>
          </Field>

          <Field label="Serum creatinine">
            <div className="flex gap-2">
              {numField("creatinine", "1.0")}
              <Toggle
                value={patient.creatinineUnit ?? "mg/dL"}
                onChange={(v) => update("creatinineUnit", v)}
                options={[
                  { label: "mg/dL", value: "mg/dL" },
                  { label: "μmol/L", value: "umol/L" },
                ]}
              />
            </div>
          </Field>

          <Field label="Critically ill?">
            <Toggle
              value={patient.criticallyIll ? "yes" : "no"}
              onChange={(v) => update("criticallyIll", v === "yes")}
              options={[
                { label: "No", value: "no" },
                { label: "Yes", value: "yes" },
              ]}
            />
          </Field>

          <label className="flex items-start gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!patient.noRenalReplacement}
              onChange={(e) => update("noRenalReplacement", e.target.checked)}
              className="mt-0.5 accent-brand-500"
            />
            <span className="text-xs text-ink-300 leading-snug">
              Confirm patient is <strong>not</strong> on renal replacement therapy
            </span>
          </label>
        </div>
      </Section>

      <Section icon={<Beaker className="w-4 h-4" />} title="Dose History">
        <p className="text-xs text-ink-400">Coming soon — input prior doses to refine the estimate.</p>
      </Section>

      <Section icon={<Info className="w-4 h-4" />} title="Drug Levels">
        <p className="text-xs text-ink-400">Coming soon — Bayesian update from measured levels.</p>
      </Section>

      <div className="mt-6 space-y-2">
        <button onClick={onLoadExample} className="btn-ghost w-full justify-center bg-ink-800/60 hover:bg-ink-800">
          Load example patient
        </button>
        <button onClick={onClear} className="btn-ghost w-full justify-center text-rose-400 hover:bg-rose-500/10">
          <Trash2 className="w-3.5 h-3.5" /> Clear all
        </button>
      </div>
    </aside>
  );
}

function Step({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {done ? (
        <CheckCircle2 className="w-4 h-4 text-accent-400" />
      ) : (
        <Circle className={clsx("w-4 h-4", active ? "text-brand-400" : "text-ink-600")} />
      )}
      <span className={clsx("uppercase tracking-wider", active ? "text-ink-100" : "text-ink-500")}>{label}</span>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group mb-3 rounded-xl border border-ink-800 bg-ink-900/50 open:bg-ink-900/70" open={defaultOpen}>
      <summary className="cursor-pointer list-none flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-100">
          {icon}
          {title}
        </div>
        <span className="text-ink-500 group-open:rotate-180 transition">▾</span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-300 mb-1">{label}</label>
      {children}
    </div>
  );
}
