#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const lbfgs = require(path.join(__dirname, '..', 'core', 'lbfgs-solver.js'));
const aligner = require(path.join(__dirname, '..', 'core', 'pl-aligner.js')).create({ lbfgs });

if (process.argv.length !== 4) {
  process.stderr.write('usage: pl_align_cli.cjs INPUT.json OUTPUT.json\n');
  process.exit(2);
}

try {
  const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const result = aligner.alignBatch(payload);
  fs.writeFileSync(process.argv[3], JSON.stringify(result), { encoding: 'utf8', mode: 0o600 });
} catch (error) {
  process.stderr.write(`${error.code || 'PL_ALIGN_FAILED'}: ${error.message}\n`);
  process.exit(1);
}
