/**
 * Reliable HTML print for Tauri WebView2 / Chromium.
 * Uses document.write (not blob URLs — production CSP default-src blocks blob iframes).
 * Keeps a real off-screen viewport so CSS layout applies when printing.
 */
export function printHtmlDocument(html: string): void {
  const existing = document.querySelectorAll("iframe[data-invora-print]");
  existing.forEach((node) => node.remove());

  const frame = document.createElement("iframe");
  frame.setAttribute("data-invora-print", "1");
  frame.setAttribute("title", "Print");
  // Off-screen but sized: zero-size iframes often print without CSS in WebView2.
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      window.setTimeout(() => frame.remove(), 1500);
    }
  };

  // Wait for layout/styles to settle before the system print dialog.
  requestAnimationFrame(() => {
    window.setTimeout(triggerPrint, 300);
  });
}

export const REPORT_PRINT_STYLES = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    line-height: 1.45;
    color: #0f172a;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { padding: 0; }
  .document-page + .document-page { page-break-before: always; }
  .report-header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
  .business-name { margin: 0 0 4px; font-size: 16px; font-weight: 700; }
  .business-line, .business-tax { margin: 0 0 2px; color: #475569; }
  .report-meta { text-align: right; min-width: 200px; }
  .report-title { margin: 0 0 4px; font-size: 18px; font-weight: 700; color: #0f172a; }
  .report-subtitle { margin: 0; color: #64748b; font-size: 12px; }
  .meta-line { margin: 4px 0 0; color: #475569; }
  .notice-banner { margin: 12px 0 16px; padding: 10px 12px; border-radius: 6px; font-size: 11px; background: #eff6ff; border: 1px solid #93c5fd; color: #1e40af; }
  .supporting-banner { margin: 0 0 12px; padding: 8px 12px; border-radius: 6px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; background: #f8fafc; border: 1px solid #cbd5e1; color: #475569; }
  .close-banner, .draft-banner { margin: 12px 0 16px; padding: 10px 12px; border-radius: 6px; font-size: 11px; }
  .close-banner { background: #ecfdf5; border: 1px solid #86efac; color: #166534; }
  .draft-banner { background: #fff7ed; border: 1px solid #fdba74; color: #9a3412; }
  .section { margin-bottom: 18px; page-break-inside: avoid; }
  .section h2 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .section h3.subheading { margin: 12px 0 6px; font-size: 11px; font-weight: 600; color: #475569; }
  .section-note { margin: 0 0 8px; color: #64748b; font-size: 10px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 4px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; background: #f8fafc; }
  .kpi-label { margin: 0; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
  .kpi-value { margin: 4px 0 0; font-size: 13px; font-weight: 700; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; }
  .data-table th, .data-table td { border: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; }
  .data-table th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; text-align: left; }
  .summary-table td:first-child { width: 70%; }
  .amount { text-align: right; white-space: nowrap; }
  tr.bold td { font-weight: 700; background: #f8fafc; }
  tr.indent td:first-child { padding-left: 18px; color: #475569; }
  tr.negative td.amount { color: #ea580c; }
  .row-note { margin-top: 2px; font-size: 9px; font-weight: 400; color: #64748b; }
  tr.total-row td { font-weight: 700; background: #f8fafc; }
  td.empty { text-align: center; color: #94a3b8; font-style: italic; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; }
  .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 28px; }
  .signature-line { border-top: 1px solid #cbd5e1; margin-top: 36px; padding-top: 4px; font-size: 10px; color: #64748b; }
  .supporting-index-list { margin: 8px 0 0; padding-left: 18px; color: #475569; }
  @media print {
    .section { page-break-inside: avoid; }
    .detail-table { page-break-inside: auto; }
    .document-page { page-break-before: always; }
    .document-page:first-child { page-break-before: auto; }
  }
`;
