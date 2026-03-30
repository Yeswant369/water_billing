// ============================================================
// LICENSE VERIFICATION MODULE
// ============================================================
// This module ships with the app. It contains:
//   - The PUBLIC key (can only verify, not forge tokens)
//   - Machine ID generation (hardware fingerprint)
//   - Functions to save/load/verify license tokens
//
// Flow when a customer activates:
//   1. App displays the machine ID on the activation screen
//   2. Customer tells you (admin) their machine ID
//   3. You generate a token locked to that machine ID
//   4. Customer pastes the token into the app
//   5. App verifies:
//      a) Signature valid? (signed by our private key)
//      b) Expired? (exp claim)
//      c) Issuer correct? (iss claim)
//      d) Machine ID matches? (machineId claim vs this machine)
//   6. If all pass → app unlocks
//
// Machine ID binding prevents token sharing:
//   - Token generated for Machine A won't work on Machine B
//   - The machine ID is baked into the signed payload
//   - Changing it would break the signature
// ============================================================

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Public key — embedded in the app, safe to distribute
const publicKey = fs.readFileSync(path.join(__dirname, 'license-public.pem'));

// License token stored locally next to the database
const LICENSE_FILE = path.join(__dirname, 'license.key');

/**
 * Generate a unique machine ID based on hardware characteristics.
 *
 * Uses a combination of:
 *   - OS hostname (unique name of the computer)
 *   - CPU model (e.g., "Intel Core i7-10700")
 *   - Number of CPU cores
 *   - Total system memory
 *   - OS platform (darwin, win32, linux)
 *
 * These values are concatenated and hashed with SHA-256,
 * then truncated to 16 hex characters for readability.
 *
 * Why this works:
 *   - Two different machines will almost certainly produce different IDs
 *   - The same machine always produces the same ID (deterministic)
 *   - The hash is one-way — you can't reverse it to learn about the machine
 *
 * Limitation:
 *   - If a user changes their hostname, the ID changes
 *   - Hardware upgrades (RAM change) would change the ID
 *   - In those cases, you'd issue a new license
 */
function getMachineId() {
  const cpus = os.cpus();
  const raw = [
    os.hostname(),
    cpus.length > 0 ? cpus[0].model : 'unknown',
    cpus.length,
    os.totalmem(),
    os.platform()
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

/**
 * Save a license token to disk.
 */
function saveLicense(token) {
  fs.writeFileSync(LICENSE_FILE, token.trim());
}

/**
 * Load the saved license token from disk.
 * Returns null if no license has been activated yet.
 */
function loadLicense() {
  if (!fs.existsSync(LICENSE_FILE)) return null;
  return fs.readFileSync(LICENSE_FILE, 'utf-8').trim();
}

/**
 * Verify a license token using the public key + machine ID check.
 *
 * Two-step verification:
 *   1. jwt.verify() — checks signature, expiry, issuer (cryptographic)
 *   2. Machine ID comparison — checks the token was issued for THIS machine
 *
 * Both must pass for the license to be valid.
 */
function verifyLicense(token) {
  try {
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'KNGIAS'
    });

    // Check machine ID — the token must be for THIS specific machine
    const currentMachineId = getMachineId();
    if (decoded.machineId && decoded.machineId !== currentMachineId) {
      return { valid: false, error: 'License is not valid for this machine' };
    }

    return { valid: true, data: decoded };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

module.exports = { saveLicense, loadLicense, verifyLicense, getMachineId };
