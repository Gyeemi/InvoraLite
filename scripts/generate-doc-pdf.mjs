import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
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

function findBrowserExecutable() {
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

function printHtmlToPdf(htmlFile, pdfFile) {
  const browser = findBrowserExecutable();
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

async function exportDocPdf({ htmlName, pdfBaseName }) {
  const { file: exportDate, display: displayDate } = formatExportDate();
  const htmlPath = join(docsDir, htmlName);
  const stampedHtmlPath = join(docsDir, `.__pdf_stamp_${htmlName}`);
  const pdfName = `${pdfBaseName} ${exportDate}.pdf`;
  const pdfDocsPath = join(docsDir, pdfName);
  const pdfExportPath = join(exportsDir, pdfName);

  let html = await readFile(htmlPath, "utf8");
  // Stamp every data-export-date node / known placeholder with DD|MM|YYYY.
  html = html.replace(
    /(<span[^>]*data-export-date[^>]*>)([^<]*)(<\/span>)/g,
    `$1${displayDate}$3`,
  );
  html = html.replace(
    /(<div class="date"[^>]*data-export-date[^>]*>)([^<]*)(<\/div>)/g,
    `$1${displayDate}$3`,
  );
  await writeFile(stampedHtmlPath, html, "utf8");

  try {
    printHtmlToPdf(stampedHtmlPath, pdfDocsPath);
  } finally {
    const { unlink } = await import("node:fs/promises");
    await unlink(stampedHtmlPath).catch(() => {});
  }

  const { mkdir } = await import("node:fs/promises");
  await mkdir(exportsDir, { recursive: true });
  await writeFile(pdfExportPath, await readFile(pdfDocsPath));

  console.log(`Exported: ${displayDate}`);
  console.log(`  docs:    ${pdfDocsPath}`);
  console.log(`  exports: ${pdfExportPath}`);
}

const arg = process.argv[2] ?? "product-review";

const targets = {
  "product-review": {
    htmlName: "InvoraLite_Product_Review.html",
    pdfBaseName: "InvoraLite_Product_Review",
  },
  "user-manual": {
    htmlName: "InvoraLite_User_Manual.html",
    pdfBaseName: "InvoraLite_User_Manual",
  },
};

const target = targets[arg];
if (!target) {
  console.error(`Unknown target "${arg}". Use: product-review | user-manual`);
  process.exit(1);
}

exportDocPdf(target).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
