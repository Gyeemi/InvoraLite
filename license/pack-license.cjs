/**
 * Create a password-protected licence ZIP for InvoraLite.
 *
 * Usage:
 *   node license/pack-license.cjs <device-id> <user-email> "18 Months"
 *
 * Output: license/invora-license.zip
 */
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const archiverZipEncrypted = require("archiver-zip-encrypted");

archiverZipEncrypted.register(archiver);

const deviceId = process.argv[2];
const userEmail = process.argv[3];
const validFor = process.argv[4] ?? "18 Months";

if (!deviceId || !userEmail) {
  console.error('Usage: node license/pack-license.cjs <device-id> <user-email> "18 Months"');
  process.exit(1);
}

const license = {
  "Device ID": deviceId,
  product: "InvoraLite",
  "user e-mail": userEmail,
  "Vallid for": validFor,
};

const password = "InvoraLite@2026";
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
