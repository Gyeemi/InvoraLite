/**
 * Issue an INVORA- HMAC licence key for InvoraLite.
 *
 * Usage:
 *   node license/issue-key.cjs <device-id> [valid-for] [customer-name]
 *
 * Env (required for production):
 *   INVORA_LICENSE_SECRET  — must match the secret compiled into the app
 *
 * valid-for examples: "18 Months", "1 Year", "90 Days" (also accepts ISO expiry)
 */
const crypto = require("crypto");

const PREFIX = "INVORA";
const deviceId = process.argv[2];
const validFor = process.argv[3] ?? "18 Months";
const customerName = process.argv[4] ?? "";

if (!deviceId) {
  console.error(
    'Usage: node license/issue-key.cjs <device-id> ["18 Months"] ["Customer Name"]',
  );
  process.exit(1);
}

const secret =
  process.env.INVORA_LICENSE_SECRET?.trim() ||
  "REPLACE-WITH-A-LONG-RANDOM-SECRET-AT-LEAST-32-CHARS";

if (secret.startsWith("REPLACE-WITH")) {
  console.warn(
    "WARNING: Using placeholder INVORA_LICENSE_SECRET. Set a real secret before production keys.",
  );
}

function addValidFor(start, validForText) {
  const parts = validForText.trim().split(/\s+/);
  if (parts.length < 2) {
    throw new Error('Validity must look like "18 Months", "1 Year", or "90 Days".');
  }
  const amount = Number.parseInt(parts[0], 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Validity amount must be a positive number.");
  }
  const unit = parts[1].replace(/s$/i, "").toLowerCase();
  const days =
    unit === "day" ? amount : unit === "month" ? amount * 30 : unit === "year" ? amount * 365 : null;
  if (days == null) {
    throw new Error("Validity unit must be days, months, or years.");
  }
  const end = new Date(start.getTime() + days * 86400000);
  return end.toISOString();
}

function resolveExpiresAt(value) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
    const iso = value.includes("T") ? value : `${value.trim()}T23:59:59.000Z`;
    return new Date(iso).toISOString();
  }
  return addValidFor(new Date(), value);
}

const payload = {
  deviceId,
  expiresAt: resolveExpiresAt(validFor),
  customerName,
};

const payloadJson = JSON.stringify(payload);
const payloadB64 = Buffer.from(payloadJson, "utf8")
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/g, "");

const signature = crypto
  .createHmac("sha256", secret)
  .update(payloadB64)
  .digest("hex");

const key = `${PREFIX}-${payloadB64}-${signature}`;

console.log(key);
console.log(
  JSON.stringify(
    {
      deviceId,
      expiresAt: payload.expiresAt,
      customerName: customerName || undefined,
      keyLength: key.length,
    },
    null,
    2,
  ),
);
