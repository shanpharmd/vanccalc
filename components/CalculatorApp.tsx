"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Moon, Sun, AlertTriangle, AlertCircle } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { SuggestedDose } from "./SuggestedDose";
import { CompareDosing } from "./CompareDosing";
import { PredictedPK } from "./PredictedPK";
import { KineticParams } from "./KineticParams";
import { MethodologyCard } from "./MethodologyCard";
import { SingleLevelAnalysis } from "./SingleLevelAnalysis";
import { TwoLevelAnalysis } from "./TwoLevelAnalysis";
import { isPatientComplete, normalizePatient, validatePatient } from "@/lib/units";
import {
  pkParams,
  recommendRegimen,
  compareFrequencies,
  recommendLoadingDose,
} from "@/lib/vancoMath";
import type { PatientInput, RegimenResult, TargetRange } from "@/lib/types";

type Tab = "empiric" | "single-level" | "two-level";

const DEFAULT_TARGET: TargetRange = { aucMin: 400, aucMax: 600, mic: 1 };

const EXAMPLE_PATIENT: PatientInput = {
  age: 65,
  weight: 80,
  weightUnit: "kg",
  sex: "male",
  height: 175,
  heightUnit: "cm",
  creatinine: 1.1,
  creatinineUnit: "mg/dL",
  criticallyIll: false,
  noRenalReplacement: true,
};

export default function CalculatorApp() {
  const [patient, setPatient] = useState<Partial<PatientInput>>({
    weightUnit: "kg",
    heightUnit: "cm",
    creatinineUnit: "mg/dL",
    sex: "male",
    criticallyIll: false,
  });
  const [target, setTarget] = useState<TargetRange>(DEFAULT_TARGET);
  const [selectedFreq, setSelectedFreq] = useState<number | undefined>(undefined);
  const [dark, setDark] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("empiric");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const complete = isPatientComplete(patient);

  const normalized = useMemo(
    () => (complete ? normalizePatient(patient as PatientInput) : null),
    [patient, complete]
  );

  const validation = useMemo(() => {
    if (!complete || !normalized) return null;
    return validatePatient(patient as PatientInput, normalized);
  }, [patient, normalized, complete]);

  const hasErrors = !!validation && validation.errors.length > 0;

  const pk = useMemo(
    () => (normalized && !hasErrors ? pkParams(normalized) : null),
    [normalized, hasErrors]
  );

  const comparison = useMemo<RegimenResult[]>(() => {
    if (!pk || !normalized) return [];
    return compareFrequencies(pk, normalized.weightKg, target);
  }, [pk, normalized, target]);

  const defaultRecommendation = useMemo<RegimenResult | null>(() => {
    if (!pk || !normalized) return null;
    return recommendRegimen(pk, normalized.weightKg, { target }).result;
  }, [pk, normalized, target]);

  const selectedResult: RegimenResult | null = useMemo(() => {
    if (!pk || !defaultRecommendation) return null;
    if (selectedFreq === undefined) return defaultRecommendation;
    const found = comparison.find((c) => c.regimen.frequency === selectedFreq);
    return found ?? defaultRecommendation;
  }, [pk, defaultRecommendation, comparison, selectedFreq]);

  const loadingDose = useMemo(() => {
    if (!complete || !normalized) return null;
    return recommendLoadingDose(normalized.weightKg, normalized.criticallyIll);
  }, [normalized, complete]);

  const handleSelect = (r: RegimenResult) => setSelectedFreq(r.regimen.frequency);

  const handleClear = () => {
    setPatient({
      weightUnit: "kg",
      heightUnit: "cm",
      creatinineUnit: "mg/dL",
      sex: "male",
      criticallyIll: false,
    });
    setSelectedFreq(undefined);
  };

  const handleLoadExample = () => {
    setPatient(EXAMPLE_PATIENT);
    setSelectedFreq(undefined);
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar
        patient={patient}
        setPatient={setPatient}
        target={target}
        setTarget={setTarget}
        complete={complete}
        onClear={handleClear}
        onLoadExample={handleLoadExample}
      />

      <main className="flex-1 p-4 lg:p-8">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          {/* Tab bar */}
          <div className="flex gap-1 bg-ink-100 dark:bg-ink-900 p-1 rounded-xl">
            <TabBtn active={activeTab === "empiric"} onClick={() => setActiveTab("empiric")}>
              Empiric Dosing
            </TabBtn>
            <TabBtn
              active={activeTab === "single-level"}
              onClick={() => setActiveTab("single-level")}
            >
              Single-Level Adjustment
            </TabBtn>
            <TabBtn
              active={activeTab === "two-level"}
              onClick={() => setActiveTab("two-level")}
            >
              Two-Level Adjustment
            </TabBtn>
          </div>

          <button
            onClick={() => setDark((d) => !d)}
            className="btn-ghost text-ink-500 dark:text-ink-400"
            aria-label="Toggle dark mode"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        {/* Hard errors — block output */}
        {validation && validation.errors.length > 0 && (
          <div className="mb-5 rounded-xl border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                Cannot calculate — please resolve the following:
              </span>
            </div>
            <ul className="space-y-1 ml-6">
              {validation.errors.map((e, i) => (
                <li key={i} className="text-sm text-red-700 dark:text-red-300 list-disc">
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Clinical warnings — results still shown */}
        {validation && validation.warnings.length > 0 && !hasErrors && (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                Clinical notice
              </span>
            </div>
            <ul className="space-y-1 ml-6">
              {validation.warnings.map((w, i) => (
                <li key={i} className="text-sm text-amber-700 dark:text-amber-300 list-disc">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Empiric Dosing tab ── */}
        {activeTab === "empiric" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">
            <SuggestedDose
              result={selectedResult}
              loadingDose={loadingDose}
              target={target}
              criticallyIll={!!patient.criticallyIll}
            />
            <CompareDosing
              options={comparison}
              target={target}
              onSelect={handleSelect}
              selectedFrequency={selectedResult?.regimen.frequency}
            />
            <PredictedPK pk={pk} result={selectedResult} />
            <MethodologyCard pk={pk} normalized={normalized} />
            <KineticParams pk={pk} />
          </div>
        )}

        {/* ── Single-Level Adjustment tab ── */}
        {activeTab === "single-level" && (
          <>
            {!complete || hasErrors ? (
              <div className="card p-8 text-center text-sm text-ink-500 dark:text-ink-400">
                Complete patient demographics in the sidebar to use single-level analysis.
              </div>
            ) : (
              <SingleLevelAnalysis
                normalized={normalized!}
                populationPk={pk!}
                target={target}
              />
            )}
          </>
        )}

        {/* ── Two-Level Adjustment tab ── */}
        {activeTab === "two-level" && (
          <>
            {!complete || hasErrors ? (
              <div className="card p-8 text-center text-sm text-ink-500 dark:text-ink-400">
                Complete patient demographics in the sidebar to use two-level analysis.
              </div>
            ) : (
              <TwoLevelAnalysis
                normalized={normalized!}
                populationPk={pk!}
                target={target}
              />
            )}
          </>
        )}

        <footer className="mt-8 pt-6 border-t border-ink-200 dark:border-ink-800 text-center text-[11px] text-ink-500 dark:text-ink-500 leading-relaxed">
          <strong className="uppercase tracking-wider text-ink-600 dark:text-ink-400">
            Disclaimer:
          </strong>{" "}
          This tool is for informational purposes only and intended for healthcare professionals.
          It is <strong>not</strong> a substitute for professional medical advice, dosing, diagnosis,
          or treatment.
          <div className="mt-2 flex items-center justify-center gap-2 opacity-70">
            <Image
              src="/logo2.png"
              alt="TheraIntel"
              width={80}
              height={18}
              className="object-contain"
            />
            <span>· VancoCalc Pro v0.1</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`tab-btn ${active ? "tab-btn-active" : ""}`}
    >
      {children}
    </button>
  );
}
