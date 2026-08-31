/**
 * Quality scoring against 24-quality-metrics.json.
 *
 * The corpus scores twelve metrics 0–4 with declared weights, applies four hard gates that
 * fail regardless of the average, and computes a weighted percentage. Only a human or an
 * informed caller can judge accuracy, evidence, ethics and outcome, so those are never
 * invented — an unscored metric is reported as unscored and the gate stays open.
 */

import { corpus } from '../corpus.js'
import { evaluateCondition } from './ast.js'

const GATE_METRICS = ['accuracy', 'evidence', 'accessibility', 'ethics']

export function score ({ scores = {}, notes = {} } = {}) {
  const metrics = corpus.qualityModel.metrics ?? []
  const meanings = corpus.qualityModel.score_meanings ?? {}
  const gates = corpus.qualityModel.hard_gates ?? null

  const rows = metrics.map((m) => {
    const raw = scores[m.id]
    const scored = typeof raw === 'number' && Number.isFinite(raw)
    const value = scored ? clamp(raw, m.score_range?.[0] ?? 0, m.score_range?.[1] ?? 4) : null
    return {
      id: m.id,
      question: m.question,
      weight: m.weight,
      score: value,
      scored,
      meaning: scored ? meanings[String(Math.round(value))] ?? null : null,
      note: notes[m.id] ?? null,
      is_gate: GATE_METRICS.includes(m.id)
    }
  })

  const scoredRows = rows.filter((r) => r.scored)
  const weightSum = scoredRows.reduce((n, r) => n + r.weight, 0)
  const weighted = scoredRows.reduce((n, r) => n + r.score * r.weight, 0)
  const weightedScore = weightSum ? +((weighted / (4 * weightSum)) * 100).toFixed(1) : null

  // Hard gates run on the corpus' own condition AST so the rule stays in the data.
  const gateFacts = Object.fromEntries(scoredRows.map((r) => [r.id, r.score]))
  const gateResult = gates ? evaluateCondition(gates.if, gateFacts) : null
  const failedGates = rows.filter((r) => r.is_gate && r.scored && r.score < 2).map((r) => r.id)
  const openGates = rows.filter((r) => r.is_gate && !r.scored).map((r) => r.id)

  const verdict = failedGates.length
    ? 'fail_regardless_of_average'
    : openGates.length
      ? 'incomplete'
      : weightedScore == null ? 'unscored' : 'calculated'

  return {
    model: { title: corpus.qualityModel.title, version: corpus.qualityModel.version, formula: corpus.qualityModel.formula },
    verdict,
    weighted_score: weightedScore,
    weighted_score_basis: {
      metrics_scored: scoredRows.length,
      metrics_total: rows.length,
      weight_scored: +weightSum.toFixed(2),
      weight_total: +metrics.reduce((n, m) => n + m.weight, 0).toFixed(2),
      note: weightedScore == null
        ? 'No metric was scored.'
        : scoredRows.length < rows.length
          ? 'The percentage covers only the metrics that were scored; it is not a whole-document verdict until all twelve are in.'
          : 'All twelve metrics scored.'
    },
    hard_gates: {
      metrics: GATE_METRICS,
      rule: gates ?? null,
      triggered: gateResult ? gateResult.value === 'true' : null,
      failed: failedGates,
      open: openGates,
      note: 'A gate metric below 2 fails the document regardless of the weighted average. An unscored gate metric leaves the gate open — it is not a pass.'
    },
    score_meanings: meanings,
    metrics: rows,
    outcome_tests: corpus.qualityModel.outcome_tests ?? []
  }
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
