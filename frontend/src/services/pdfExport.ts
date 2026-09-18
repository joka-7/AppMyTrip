function slugify(title: string): string {
  const slug = title
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "trip";
}

/**
 * Renders `element` into a downloadable PDF. html2canvas (used internally by
 * html2pdf.js) rasterizes the live DOM and never evaluates `@media print`, so
 * the `pdf-export-mode` class stands in for it — index.css mirrors the same
 * show-everything/expand-to-full-height rules under that class that the
 * `@media print` block already applies for the Print button.
 */
export async function exportTripToPdf(element: HTMLElement, tripTitle: string): Promise<void> {
  // html2pdf.js bundles jsPDF + html2canvas and is only needed once someone
  // actually exports — dynamic import keeps it out of the main bundle, same
  // reasoning as AppFrame's lazy-loaded MapView (Leaflet).
  const { default: html2pdf } = await import("html2pdf.js");
  document.documentElement.classList.add("pdf-export-mode");
  try {
    await html2pdf()
      .set({
        filename: `${slugify(tripTitle)}.pdf`,
        margin: 0,
        html2canvas: { useCORS: true, scale: 2 },
        jsPDF: { unit: "pt", format: "a4" },
      })
      .from(element)
      .save();
  } finally {
    document.documentElement.classList.remove("pdf-export-mode");
  }
}
