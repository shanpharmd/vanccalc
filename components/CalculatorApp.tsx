"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Sidebar } from "./Sidebar";
import { SuggestedDose } from "./SuggestedDose";
import { CompareDosing } from "./CompareDosing";
import { PredictedPK } from "./PredictedPK";
import { KineticParams } from "./KineticParams";
import { CalcInfo } from "./CalcInfo";
import { AboutCard } from "./AboutCard";
import { isPatientComplete, normalizePatient } from "@/lib/units";
import {
  pkParams,
  recommendRegimen,
  compareFrequencies,
  recommendLoadingDose,
} from "@/lib/vancoMath";
import type { PatientInput, RegimenResult, TargetRange } from "@/lib/types";

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
  const [target] = useState<TargetRange>(DEFAULT_TARGET);
  const [selectedFreq, setSelectedFreq] = useState<number | undefined>(undefined);

  const complete = isPatientComplete(patient);

  const pk = useMemo(() => (complete ? pkParams(normalizePatient(patient as PatientInput)) : null), [patient, complete]);

  const comparison = useMemo<RegimenResult[]>(() => {
    if (!pk || !complete) return [];
    return compareFrequencies(pk, normalizePatient(patient as PatientInput).weightKg, target);
  }, [pk, patient, complete, target]);

  const defaultRecommendation = useMemo<RegimenResult | null>(() => {
    if (!pk || !complete) return null;
    return recommendRegimen(pk, normalizePatient(patient as PatientInput).weightKg, { target }).result;
  }, [pk, patient, complete, target]);

  // resolve "selected" regimen: user pick > algorithmic recommendation
  const selectedResult: RegimenResult | null = useMemo(() => {
    if (!pk || !defaultRecommendation) return null;
    if (selectedFreq === undefined) return defaultRecommendation;
    const found = comparison.find((c) => c.regimen.frequency === selectedFreq);
    return found ?? defaultRecommendation;
  }, [pk, defaultRecommendation, comparison, selectedFreq]);

  const loadingDose = useMemo(() => {
    if (!complete) return null;
    const p = normalizePatient(patient as PatientInput);
    return recommendLoadingDose(p.weightKg, p.criticallyIll);
  }, [patient, complete]);

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
        complete={complete}
        onClear={handleClear}
        onLoadExample={handleLoadExample}
      />

      <main className="flex-1 p-4 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">
          <SuggestedDose result={selectedResult} loadingDose={loadingDose} target={target} />
          <CompareDosing
            options={comparison}
            target={target}
            onSelect={handleSelect}
            selectedFrequency={selectedResult?.regimen.frequency}
          />
          <PredictedPK pk={pk} result={selectedResult} target={target} />
          <CalcInfo hasResult={!!selectedResult} />
          <KineticParams pk={pk} />
          <AboutCard onLoadExample={handleLoadExample} />
        </div>

        <footer className="mt-8 pt-6 border-t border-ink-200 dark:border-ink-800 text-center text-[11px] text-ink-500 dark:text-ink-500 leading-relaxed">
          <strong className="uppercase tracking-wider text-ink-600 dark:text-ink-400">Disclaimer:</strong>{" "}
          This tool is for informational purposes only and intended for healthcare professionals.
          It is <strong>not</strong> a substitute for professional medical advice, dosing, diagnosis, or treatment.
          <div className="mt-2 flex items-center justify-center gap-2 opacity-70">
            <Image src="/theraintel-logo.png" alt="TheraIntel" width={80} height={18} className="object-contain" />
            <span>· VancoCalc Pro v0.1</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
