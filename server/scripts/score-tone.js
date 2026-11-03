'use strict'
const fs = require('node:fs'), path = require('node:path')
const { reviewSummary } = require('../src/ai/toneReview')
const filename = path.join(__dirname, '../reports/tone-real.json')
if (!fs.existsSync(filename)) { console.error('No real tone report. Configure the model and run scripts/tone.js first.'); process.exitCode = 1 }
else {
  const summary = reviewSummary(JSON.parse(fs.readFileSync(filename, 'utf8')))
  console.log(JSON.stringify(summary, null, 2))
  if (!summary.passed) process.exitCode = 1
}
