#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const engine = require(path.join(__dirname, '..', 'core', 'phyparts-engine.js'));

if (process.argv.length !== 4) {
  process.stderr.write('usage: phyparts_cli.cjs INPUT.json OUTPUT.json\n');
  process.exit(2);
}

try {
  const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const result = engine.analyze(payload);
  fs.writeFileSync(process.argv[3], JSON.stringify(result), { encoding: 'utf8', mode: 0o600 });
} catch (error) {
  process.stderr.write(`${error.code || 'PHYPARTS_FAILED'}: ${error.message}\n`);
  process.exit(1);
}
