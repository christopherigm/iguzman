"use client";

import { useEffect, useRef, useState } from "react";
import {
  getApplication,
  type JobApplication,
  type CompanyIntel,
  type CompanyAnalysis,
} from "@/lib/applications";

/**
 * Owns the async-populated company data (description / intel / analysis) and
 * polls the application until the company pipeline reaches a terminal state.
 * Mirrors each poll's fresh application back through `setApp`.
 */
export function useCompanyIntel(
  initialApp: JobApplication,
  setApp: (app: JobApplication) => void,
) {
  const [companyDescription, setCompanyDescription] = useState(
    initialApp.company?.description ?? "",
  );
  const [companyIntel, setCompanyIntel] = useState<CompanyIntel | null>(
    initialApp.company?.intel ?? null,
  );
  const [companyAnalysis, setCompanyAnalysis] =
    useState<CompanyAnalysis | null>(initialApp.company?.analysis ?? null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const status = initialApp.company?.status;
    if (status !== "pending" && status !== "processing") return;

    let errorCount = 0;
    const schedule = () => {
      pollingRef.current = setTimeout(async () => {
        try {
          const data = await getApplication(initialApp.id);
          const company = data.company;
          if (company?.description) setCompanyDescription(company.description);
          if (company?.intel) setCompanyIntel(company.intel);
          if (company?.analysis) setCompanyAnalysis(company.analysis);
          setApp(data);
          if (
            !company ||
            company.status === "complete" ||
            company.status === "failed"
          ) {
            pollingRef.current = null;
            return;
          }
          errorCount = 0;
        } catch {
          errorCount++;
          if (errorCount >= 3) {
            if (pollingRef.current) clearTimeout(pollingRef.current);
            pollingRef.current = null;
            return;
          }
        }
        if (pollingRef.current !== null) schedule();
      }, 5000);
    };
    schedule();

    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { companyDescription, companyIntel, companyAnalysis };
}
