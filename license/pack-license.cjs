/**
 * Create a password-protected licence ZIP for InvoraLite.
 *
 * Usage:
 *   node license/pack-license.cjs <device-id> <user-email> "18 Months"
 *
 * Env (required for production):
 *   INVORA_LICENSE_ZIP_PASSWORD — must match the password compiled into the app
 *
 * Output: license/invora-license.zip
 */
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

// archiver-zip-encrypted v2 registers via archiver.registerFormat (not .register())
archiver.registerFormat("zip-encrypted", require("archiver-zip-encrypted"));

function normalizeArg(value) {
  const trimmed = String(value ?? "").trim();
  // Docs often show <DEVICE-ID> — angle brackets must not be included.
  if (trimmed.startsWith("<") && trimmed.endsWith(">") && trimmed.length > 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

const deviceId = normalizeArg(process.argv[2]);
const userEmail = normalizeArg(process.argv[3]);
const validFor = normalizeArg(process.argv[4]) || "18 Months";

if (!deviceId || !userEmail) {
  console.error('Usage: node license/pack-license.cjs <device-id> <user-email> "18 Months"');
  console.error('Do not include the < > characters around the Device ID.');
  process.exit(1);
}

const license = {
  "Device ID": deviceId,
  product: "InvoraLite",
  "user e-mail": userEmail,
  "Vallid for": validFor,
};

const password =
  process.env.INVORA_LICENSE_ZIP_PASSWORD?.trim() || "InvoraLite@2026";

if (password === "InvoraLite@2026") {
  console.warn(
    "WARNING: Using default INVORA_LICENSE_ZIP_PASSWORD. Set a real password before production packs.",
  );
}

const outPath = path.join(__dirname, "invora-license.zip");
const output = fs.createWriteStream(outPath);
const archive = archiver.create("zip-encrypted", {
  zlib: { level: 8 },
  encryptionMethod: "aes256",
  password,
});

output.on("close", () => {
  console.log(`Created ${outPath} (${archive.pointer()} bytes)`);
  console.log(JSON.stringify(license, null, 2));
});

archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);
archive.append(`${JSON.stringify(license, null, 2)}\n`, { name: "license.json" });
archive.finalize();
