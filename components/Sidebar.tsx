"use client";

import { CheckCircle2, Circle, Sliders, Trash2, User } from "lucide-react";
import { Toggle } from "./Toggle";
import type { PatientInput, TargetRange } from "@/lib/types";
import Image from "next/image";

interface SidebarProps {
  patient: Partial<PatientInput>;
  setPatient: (p: Partial<PatientInput>) => void;
  target: TargetRange;
  setTarget: (t: TargetRange) => void;
  complete: boolean;
  onClear: () => void;
  onLoadExample: () => void;
}

export function Sidebar({
  patient,
  setPatient,
  target,
  setTarget,
  complete,
  onClear,
  onLoadExample,
}: SidebarProps) {
  // Typed update — avoids `as any` by using `unknown` with a controlled call surface
  const update = (k: keyof PatientInput, v: unknown) =>
    setPatient({ ...patient, [k]: v });

  const numField = (
    field: keyof PatientInput & ("age" | "weight" | "height" | "creatinine"),
    placeholder = ""
  ) => (
    <input
      type="number"
      inputMode="decimal"
      value={(patient[field] as number | undefined) ?? ""}
      placeholder={placeholder}
      onChange={(e) =>
        update(field, e.target.value === "" ? undefined : Number(e.target.value))
      }
      className="field-input"
    />
  );

  return (
    <aside className="w-full lg:w-80 lg:min-h-screen bg-gradient-to-b from-ink-900 to-ink-950 text-ink-100 p-6 lg:sticky lg:top-0 lg:overflow-y-auto lg:max-h-screen">
      {/* Brand */}
      <div className="mb-6">
        <div className="mb-3">
          <Image
            src="/logo2.png"
            alt="TheraIntel"
            width={160}
            height={36}
            className="object-contain"
            priority
          />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          VancoCalc <span className="text-brand-400">Pro</span>
        </h1>
        <p className="text-xs text-ink-400 mt-1">
          Vancomycin AUC Dosing · ASHP/IDSA 2020
        </p>
      </div>

      {/* Patient status indicator */}
      <div className="flex items-center gap-2 mb-6 text-xs">
        {complete ? (
          <CheckCircle2 className="w-4 h-4 text-accent-400" />
        ) : (
          <Circle className="w-4 h-4 text-brand-400" />
        )}
        <span className="uppercase tracking-wider text-ink-200">
          Patient Data{complete ? " Complete" : " — Fill All Fields"}
        </span>
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
              (CRRT, HD, PD)
            </span>
          </label>
        </div>
      </Section>

      {/* Dosing Target */}
      <Section icon={<Sliders className="w-4 h-4" />} title="Dosing Target">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="AUC₂₄ min">
              <input
                type="number"
                inputMode="decimal"
                value={target.aucMin}
                onChange={(e) =>
                  setTarget({ ...target, aucMin: Number(e.target.value) || 400 })
                }
                className="field-input"
              />
            </Field>
            <Field label="AUC₂₄ max">
              <input
                type="number"
                inputMode="decimal"
                value={target.aucMax}
                onChange={(e) =>
                  setTarget({ ...target, aucMax: Number(e.target.value) || 600 })
                }
                className="field-input"
              />
            </Field>
          </div>
          <Field label="MIC (mcg/mL)">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={target.mic}
              onChange={(e) =>
                setTarget({ ...target, mic: Number(e.target.value) || 1 })
              }
              className="field-input"
            />
          </Field>
          <p className="text-[11px] text-ink-500 leading-snug">
            Default: AUC₂₄ 400–600 · MIC 1.0 (ASHP/IDSA 2020). Adjust only if
            your institution protocol or susceptibility data differs.
          </p>
          <button
            onClick={() => setTarget({ aucMin: 400, aucMax: 600, mic: 1 })}
            className="text-[11px] text-brand-400 hover:text-brand-300 transition"
          >
            Reset to defaults
          </button>
        </div>
      </Section>

      <div className="mt-6 space-y-2">
        <button
          onClick={onLoadExample}
          className="btn-ghost w-full justify-center bg-ink-800/60 hover:bg-ink-800"
        >
          Load example patient
        </button>
        <button
          onClick={onClear}
          className="btn-ghost w-full justify-center text-rose-400 hover:bg-rose-500/10"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear all
        </button>
      </div>
    </aside>
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
    <details
      className="group mb-3 rounded-xl border border-ink-800 bg-ink-900/50 open:bg-ink-900/70"
      open={defaultOpen}
    >
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
