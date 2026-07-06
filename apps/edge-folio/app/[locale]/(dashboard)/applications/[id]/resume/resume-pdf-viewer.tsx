"use client";

import { PDFViewer } from "@react-pdf/renderer";
import { ResumeDocument } from "../_components/resume-pdf";
import type { ResumePDFProps } from "@/lib/resume-export";

/**
 * Thin wrapper around react-pdf's <PDFViewer> rendering the exact same
 * <ResumeDocument> the export uses. Loaded only on the client (ssr:false) since
 * PDFViewer relies on browser APIs.
 */
export default function ResumePdfViewer({
  resumeProps,
}: {
  resumeProps: ResumePDFProps;
}) {
  return (
    <PDFViewer
      style={{ width: "100%", height: "100%", border: "none" }}
      showToolbar
    >
      <ResumeDocument {...resumeProps} />
    </PDFViewer>
  );
}
