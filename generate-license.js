// ============================================================
// LICENSE GENERATOR — Admin-only tool. DO NOT ship with the app.
// ============================================================
// Usage:
//   node generate-license.js <licensee> <machineId> [validityDays]
//
// Examples:
//   node generate-license.js "ABC Industries" "a1b2c3d4e5f67890"
//   node generate-license.js "ABC Industries" "a1b2c3d4e5f67890" 730
//
// The customer gives you their machine ID (shown on the
// activation screen). You put it here, and the generated
// token will ONLY work on that specific machine.
//
// Flow:
//   1. Customer installs the app → sees activation screen
//   2. Activation screen shows their Machine ID
//   3. Customer tells you: "My machine ID is a1b2c3d4..."
//   4. You run: node generate-license.js "Customer Name" "a1b2c3d4..."
//   5. You send them the token
//   6. They paste it → app verifies signature + machine ID → unlocked
// ============================================================

const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('./license-private.pem');

// Read arguments from command line
const licensee = process.argv[2];
const machineId = process.argv[3];
const validityDays = process.argv[4] || '365';

if (!licensee || !machineId) {
  console.log('\nUsage: node generate-license.js <licensee> <machineId> [validityDays]\n');
  console.log('  licensee      Customer/organization name');
  console.log('  machineId     Machine ID shown on the customer\'s activation screen');
  console.log('  validityDays  License validity in days (default: 365)\n');
  console.log('Example:');
  console.log('  node generate-license.js "ABC Industries" "a1b2c3d4e5f67890" 365\n');
  process.exit(1);
}

const license = jwt.sign(
  {
    licensee,
    machineId,       // Locked to this specific machine
    type: 'full',
  },
  privateKey,
  {
    algorithm: 'RS256',
    expiresIn: validityDays + 'd',
    issuer: 'KNGIAS'
  }
);

console.log('\n========== LICENSE TOKEN ==========\n');
console.log(license);
console.log('\n===================================\n');

const decoded = jwt.decode(license);
console.log('Licensee   :', decoded.licensee);
console.log('Machine ID :', decoded.machineId);
console.log('Type       :', decoded.type);
console.log('Issued     :', new Date(decoded.iat * 1000).toLocaleDateString());
console.log('Expires    :', new Date(decoded.exp * 1000).toLocaleDateString());
