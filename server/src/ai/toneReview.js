'use strict'
const dimensions = ['relevance', 'naturalness', 'liveliness', 'restraint', 'reliability']
function reviewSummary(report) {
  if (!report || report.mode !== 'real') return { status: 'not_real_model', passed: false }
  const rows = report.rows || []
  const candidates = rows.filter(r => r.validation === 'pass' && r.validatedOutput?.action === 'comment')
  const rated = candidates.filter(r => dimensions.every(d => Number.isFinite(r.ratings?.[d]) && r.ratings[d] >= 1 && r.ratings[d] <= 5) && typeof r.criticalIssue === 'boolean')
  const attempts = rows.flatMap(r => [r, ...(r.repairHistory || [])])
  const critical = attempts.filter(r => r.criticalIssue === true).length
  const validationErrors = rows.filter(r => !['pass', 'blocked_before_model'].includes(r.validation)).length
  const averages = Object.fromEntries(dimensions.map(d => [d, rated.length ? rated.reduce((n, r) => n + r.ratings[d], 0) / rated.length : null]))
  const overall = rated.length ? dimensions.reduce((n, d) => n + averages[d], 0) / dimensions.length : null
  const complete = candidates.length >= 30 && rated.length === candidates.length && attempts.filter(r => r.validation !== 'blocked_before_model').every(r => typeof r.criticalIssue === 'boolean')
  return { status: critical ? 'critical_failure' : validationErrors ? 'output_validation_failure' : !complete ? 'incomplete_review' : overall >= 4 ? 'passed' : 'below_target',
    passed: complete && critical === 0 && validationErrors === 0 && overall >= 4, realCommentCount: candidates.length, ratedCount: rated.length, criticalIssueCount: critical, validationErrorCount: validationErrors, averages, overall }
}
module.exports = { reviewSummary }
