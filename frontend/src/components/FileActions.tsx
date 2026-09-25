import { useRef, useState } from "react";
import type { RefObject } from "react";
import { Calendar, Download, FileDown, Printer, Upload } from "lucide-react";
import type { AppDesign } from "../services/appDesign";
import type { TripData } from "../api";
import { useI18n } from "../i18n/useI18n";
import { exportTripToIcs } from "../services/icsExport";
import { exportTripToPdf } from "../services/pdfExport";
import { exportTripToFile, importTripFromFile } from "../services/tripFile";

/**
 * Import/export controls (extracted from CloudMenu, which used to render
 * these unconditionally regardless of sign-in state): save the trip to a
 * file, a calendar, a printer, or a PDF, or load one back in. Rendered
 * inside SettingsMenu's ⋮ dropdown now, so it needs its own busy/notice
 * state instead of sharing CloudMenu's (a PDF-export failure used to have
 * nowhere to render while signed out — CloudMenu only showed `notice` inside
 * its signed-in dropdown).
 */
export default function FileActions({
  tripData,
  appDesign,
  printTargetRef,
  onImportTrip,
}: {
  tripData: TripData;
  appDesign: AppDesign;
  printTargetRef: RefObject<HTMLDivElement>;
  onImportTrip: (trip: TripData, appDesign: AppDesign) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { tripData: imported, appDesign: importedAppDesign } = await importTripFromFile(file);
      onImportTrip(imported, importedAppDesign);
      setNotice(t("cloud.importSuccess"));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t("cloud.importFailed"));
    }
  };

  const handleExportPdf = async () => {
    if (!printTargetRef.current) {
      throw new Error("printTargetRef is not attached to a rendered element");
    }
    setBusy(true);
    setNotice(null);
    try {
      await exportTripToPdf(printTargetRef.current, tripData.title);
    } catch (err) {
      console.error(err);
      setNotice(t("cloud.exportPdfFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleImportFile}
        className="hidden"
      />
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => exportTripToFile(tripData, appDesign)}
          className="flex items-center gap-2 text-sm text-ink hover:bg-surface-container px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <Download size={16} />
          {t("cloud.export")}
        </button>
        <button
          onClick={() => exportTripToIcs(tripData)}
          disabled={tripData.days.length === 0}
          className="flex items-center gap-2 text-sm text-ink hover:bg-surface-container disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <Calendar size={16} />
          {t("cloud.exportIcs")}
        </button>
        <button
          onClick={() => window.print()}
          disabled={tripData.days.length === 0}
          className="flex items-center gap-2 text-sm text-ink hover:bg-surface-container disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <Printer size={16} />
          {t("cloud.print")}
        </button>
        <button
          onClick={handleExportPdf}
          disabled={tripData.days.length === 0 || busy}
          className="flex items-center gap-2 text-sm text-ink hover:bg-surface-container disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <FileDown size={16} />
          {t("cloud.exportPdf")}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 text-sm text-ink hover:bg-surface-container px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <Upload size={16} />
          {t("cloud.import")}
        </button>
      </div>
      {notice && <p className="mt-2 text-xs text-amber-700">{notice}</p>}
    </div>
  );
}
