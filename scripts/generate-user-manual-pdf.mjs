import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const mdPath = join(root, "docs", "InvoraLite_User_Manual.md");
const htmlPath = join(root, "docs", "InvoraLite_User_Manual.html");
const docsDir = join(root, "docs");
const exportsDir = join(root, "exports");

function formatExportDate(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return {
    file: `${dd}-${mm}-${yyyy}`,
    display: `${dd}|${mm}|${yyyy}`,
  };
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const parts = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tableHead = true;

  function closeLists() {
    if (inUl) {
      parts.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      parts.push("</ol>");
      inOl = false;
    }
  }

  function closeTable() {
    if (inTable) {
      parts.push("</tbody></table>");
      inTable = false;
      tableHead = true;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith("# ")) {
      closeTable();
      closeLists();
      parts.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith("## ")) {
      closeTable();
      closeLists();
      parts.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("### ")) {
      closeTable();
      closeLists();
      parts.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("---")) {
      closeTable();
      closeLists();
      parts.push('<hr class="section-break" />');
      continue;
    }

    if (line.startsWith("|")) {
      closeLists();
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      if (cells.every((cell) => /^[-:]+$/.test(cell))) {
        continue;
      }
      if (!inTable) {
        parts.push('<table class="data-table"><thead><tr>');
        for (const cell of cells) {
          parts.push(`<th>${inlineMarkdown(cell)}</th>`);
        }
        parts.push("</tr></thead><tbody>");
        inTable = true;
        tableHead = false;
        continue;
      }
      parts.push("<tr>");
      for (const cell of cells) {
        parts.push(`<td>${inlineMarkdown(cell)}</td>`);
      }
      parts.push("</tr>");
      continue;
    }

    closeTable();

    if (line.startsWith("- ")) {
      if (!inUl) {
        closeLists();
        parts.push("<ul>");
        inUl = true;
      }
      parts.push(`<li>${inlineMarkdown(line.slice(2))}</li>`);
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      if (!inOl) {
        closeLists();
        parts.push("<ol>");
        inOl = true;
      }
      parts.push(`<li>${inlineMarkdown(line.replace(/^\d+\.\s/, ""))}</li>`);
      continue;
    }

    if (line.startsWith("> ")) {
      closeLists();
      parts.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`);
      continue;
    }

    if (line === "") {
      closeLists();
      continue;
    }

    closeLists();
    parts.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeTable();
  closeLists();
  return parts.join("\n");
}

async function buildHtml() {
  const markdown = await readFile(mdPath, "utf8");
  const body = markdownToHtml(markdown);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>InvoraLite User Manual</title>
  <style>
    @page { size: A4 portrait; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.55;
      color: #0f172a;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .cover {
      min-height: 240mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      page-break-after: always;
      border-bottom: 4px solid #16a34a;
      margin-bottom: 24px;
      padding: 40px 20px;
    }
    .cover-logo {
      width: 72px;
      height: 72px;
      border-radius: 18px;
      background: linear-gradient(135deg, #16a34a, #059669);
      color: #fff;
      font-size: 28px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
    }
    .cover h1 {
      font-size: 32pt;
      margin: 0 0 8px;
      color: #0f172a;
    }
    .cover .subtitle {
      font-size: 14pt;
      color: #64748b;
      margin: 0 0 24px;
    }
    .cover .meta {
      font-size: 11pt;
      color: #475569;
      line-height: 1.8;
    }
    .content { padding: 0; }
    h1 {
      font-size: 22pt;
      margin: 28px 0 12px;
      color: #0f172a;
      page-break-after: avoid;
    }
    h2 {
      font-size: 15pt;
      margin: 24px 0 10px;
      color: #14532d;
      border-bottom: 2px solid #bbf7d0;
      padding-bottom: 4px;
      page-break-after: avoid;
    }
    h3 {
      font-size: 12pt;
      margin: 18px 0 8px;
      color: #334155;
      page-break-after: avoid;
    }
    p { margin: 0 0 10px; }
    ul, ol { margin: 0 0 12px 20px; padding: 0; }
    li { margin-bottom: 4px; }
    blockquote {
      margin: 10px 0 14px;
      padding: 10px 14px;
      border-left: 4px solid #f59e0b;
      background: #fffbeb;
      color: #92400e;
      font-size: 10pt;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0 16px;
      font-size: 10pt;
      page-break-inside: avoid;
    }
    table.data-table th,
    table.data-table td {
      border: 1px solid #cbd5e1;
      padding: 7px 9px;
      vertical-align: top;
      text-align: left;
    }
    table.data-table th {
      background: #f1f5f9;
      font-weight: 600;
      color: #334155;
    }
    code {
      font-family: Consolas, monospace;
      font-size: 9.5pt;
      background: #f1f5f9;
      padding: 1px 4px;
      border-radius: 3px;
    }
    hr.section-break {
      border: 0;
      border-top: 1px solid #e2e8f0;
      margin: 20px 0;
    }
    .footer-note {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      font-size: 9pt;
      color: #94a3b8;
      text-align: center;
    }
    @media print {
      h2 { page-break-before: auto; }
      .cover { page-break-after: always; }
    }
  </style>
</head>
<body>
  <div class="cover">
    <div class="cover-logo">IL</div>
    <h1>InvoraLite</h1>
    <p class="subtitle">User Manual</p>
    <p class="meta">
      Version 1.0.0<br />
      Offline Inventory &amp; Retail Management<br />
      EDP IT Department
    </p>
  </div>
  <div class="content">
    ${body}
    <p class="footer-note">InvoraLite User Manual v1.0.0 — Generated for offline retail and inventory management on Windows.</p>
  </div>
</body>
</html>`;
  await writeFile(htmlPath, html, "utf8");
  return htmlPath;
}

function findEdgeExecutable() {
  const candidates = [
    process.env.EDGE_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
      if (result.status === 0) return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

function printPdfWithBrowser(htmlFile, pdfFile) {
  const browser = findEdgeExecutable();
  if (!browser) {
    throw new Error("Microsoft Edge or Google Chrome is required to generate the PDF.");
  }

  const fileUrl = `file:///${htmlFile.replace(/\\/g, "/")}`;
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=10000",
    `--print-to-pdf=${pdfFile}`,
    fileUrl,
  ];

  const result = spawnSync(browser, args, { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Browser PDF export failed.");
  }
}

async function main() {
  const { file: exportDate, display: displayDate } = formatExportDate();
  const pdfPath = join(docsDir, "InvoraLite_User_Manual.pdf");
  const datedPdfName = `InvoraLite_User_Manual ${exportDate}.pdf`;
  const datedPdfDocsPath = join(docsDir, datedPdfName);
  const datedPdfExportPath = join(exportsDir, datedPdfName);

  const htmlFile = await buildHtml();
  console.log(`HTML manual written: ${htmlFile}`);
  printPdfWithBrowser(htmlFile, pdfPath);
  printPdfWithBrowser(htmlFile, datedPdfDocsPath);

  const { mkdir } = await import("node:fs/promises");
  await mkdir(exportsDir, { recursive: true });
  await writeFile(datedPdfExportPath, await readFile(datedPdfDocsPath));

  console.log(`Exported: ${displayDate}`);
  console.log(`  docs:    ${pdfPath}`);
  console.log(`  docs:    ${datedPdfDocsPath}`);
  console.log(`  exports: ${datedPdfExportPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
