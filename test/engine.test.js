import { test } from 'node:test'
import assert from 'node:assert/strict'

import { corpus } from '../server/corpus.js'
import { evaluateCondition, conditionPaths, readPath, MISSING } from '../server/engine/ast.js'
import { analyze } from '../server/engine/analyze.js'
import { evaluate, resolveRules, runCorpusTests } from '../server/engine/evaluate.js'
import { score } from '../server/engine/score.js'

/* ------------------------------------------------------------------ corpus */

test('the corpus loads every file and the counts match the manifest', () => {
  assert.equal(corpus.files.length, corpus.manifest.inventory.json_file_count)
  assert.equal(corpus.rules.length, corpus.manifest.inventory.base_rule_count)
  assert.equal(corpus.transformations.length, corpus.manifest.inventory.laka_state_rule_count)
  assert.equal(corpus.crossAxis.length, corpus.manifest.inventory.laka_cross_axis_rule_count)
  assert.equal(corpus.templates.length, corpus.manifest.inventory.composition_template_count)
  assert.equal(corpus.pipelines.length, corpus.manifest.inventory.pipeline_count)
  assert.equal(corpus.tests.length, corpus.manifest.inventory.test_case_count)
  assert.equal(corpus.sources.length, corpus.manifest.inventory.source_count)
  assert.equal(corpus.glossary.length, corpus.manifest.inventory.glossary_term_count)
})

test('rule ids are unique and every rule carries its required fields', () => {
  const seen = new Set()
  for (const r of corpus.rules) {
    assert.ok(!seen.has(r.id), `duplicate rule id ${r.id}`)
    seen.add(r.id)
    for (const field of ['id', 'name', 'domain', 'layer', 'strength', 'human_logic', 'when', 'then', 'else', 'because']) {
      assert.ok(r[field] != null, `${r.id} is missing ${field}`)
    }
    assert.ok(Array.isArray(r.then) && r.then.length > 0, `${r.id} has an empty then branch`)
    assert.ok(Array.isArray(r.else) && r.else.length > 0, `${r.id} has an empty else branch`)
  }
})

test('every source id a rule cites resolves to a source record', () => {
  for (const r of corpus.rules) {
    for (const sid of r.source_ids ?? []) {
      assert.ok(corpus.sourcesById.has(sid), `${r.id} cites unknown source ${sid}`)
    }
  }
})

test('domain counts match the manifest', () => {
  const declared = corpus.manifest.inventory.rule_count_by_domain
  for (const { value, count } of corpus.domains) {
    assert.equal(count, declared[value], `domain ${value}`)
  }
})

/* --------------------------------------------------------------------- ast */

test('readPath returns MISSING for absent paths rather than undefined', () => {
  assert.equal(readPath({ a: { b: 1 } }, 'a.b'), 1)
  assert.equal(readPath({ a: { b: 1 } }, 'a.c'), MISSING)
  assert.equal(readPath({ a: null }, 'a.c'), MISSING)
})

test('an absent path yields unknown, not false', () => {
  const r = evaluateCondition({ path: 'claim.type', operator: 'eq', value: 'causal' }, {})
  assert.equal(r.value, 'unknown')
  assert.deepEqual(r.needs, ['claim.type'])
})

test('exists and missing resolve on absence instead of going unknown', () => {
  assert.equal(evaluateCondition({ path: 'a.b', operator: 'exists' }, {}).value, 'false')
  assert.equal(evaluateCondition({ path: 'a.b', operator: 'missing' }, {}).value, 'true')
  assert.equal(evaluateCondition({ path: 'a.b', operator: 'exists' }, { a: { b: 1 } }).value, 'true')
})

test('all is false when any child is false, even with an unknown sibling', () => {
  const facts = { x: 1 }
  const node = { all: [{ path: 'x', operator: 'eq', value: 2 }, { path: 'y', operator: 'eq', value: 3 }] }
  assert.equal(evaluateCondition(node, facts).value, 'false')
})

test('any is true when any child is true, even with an unknown sibling', () => {
  const facts = { x: 1 }
  const node = { any: [{ path: 'x', operator: 'eq', value: 1 }, { path: 'y', operator: 'eq', value: 3 }] }
  assert.equal(evaluateCondition(node, facts).value, 'true')
})

test('not preserves unknown', () => {
  assert.equal(evaluateCondition({ not: { path: 'y', operator: 'eq', value: 1 } }, {}).value, 'unknown')
  assert.equal(evaluateCondition({ not: { path: 'y', operator: 'eq', value: 1 } }, { y: 1 }).value, 'false')
})

test('every rule condition parses into paths without throwing', () => {
  for (const r of corpus.rules) {
    assert.doesNotThrow(() => conditionPaths(r.when), `${r.id}`)
    assert.doesNotThrow(() => evaluateCondition(r.when, {}), `${r.id}`)
  }
})

/* ---------------------------------------------------------------- analyser */

test('passive voice is detected, with and without a named agent', () => {
  const withAgent = analyze('The report was written by the committee.').sentences[0]
  assert.equal(withAgent.voice, 'passive')
  assert.equal(withAgent.passive_has_named_agent, true)

  const noAgent = analyze('The report was approved.').sentences[0]
  assert.equal(noAgent.voice, 'passive')
  assert.equal(noAgent.passive_has_named_agent, false)

  assert.equal(analyze('The committee wrote the report.').sentences[0].voice, 'active')
})

test('a comma splice is separated from correct coordination', () => {
  const splice = analyze('The committee reviewed the report, it was approved without discussion.').sentences[0]
  assert.equal(splice.joiner, 'comma_only')
  assert.ok(splice.independent_clause_count >= 2)
  assert.equal(splice.valid_boundary_count, 0)

  const coordinated = analyze('The committee reviewed the report, and it was approved.').sentences[0]
  assert.equal(coordinated.joiner, 'coordinator')
  assert.equal(coordinated.valid_boundary_count, 1)
})

test('sentence function is classified', () => {
  assert.equal(analyze('Run the migration.').sentences[0].function, 'imperative')
  assert.equal(analyze('Did the migration run?').sentences[0].function, 'interrogative')
  assert.equal(analyze('The migration ran.').sentences[0].function, 'declarative')
})

test('expletive openings are named, not just recorded as a first word', () => {
  assert.equal(analyze('There is a requirement to act.').sentences[0].opening, 'there_is')
  assert.equal(analyze('It is important to act.').sentences[0].opening, 'it_is')
})

test('a comma series of three or more items is counted', () => {
  const s = analyze('We tested the API, the UI, and the docs.').sentences[0]
  assert.ok(s.series.item_count >= 3)
})

test('sentence splitting is not fooled by abbreviations or decimals', () => {
  const m = analyze('Version 1.5 shipped on Mon. The team met Dr. Chen at 9 a.m. and agreed.')
  assert.equal(m.document.sentence_count, 2)
})

test('paragraphs split on blank lines and roll up their sentences', () => {
  const m = analyze('One sentence here. And a second.\n\nA new paragraph.')
  assert.equal(m.document.paragraph_count, 2)
  assert.equal(m.paragraphs[0].sentence_count, 2)
  assert.equal(m.paragraphs[1].sentence_count, 1)
})

test('readability is reported with its threshold, not as a bare verdict', () => {
  const d = analyze('The utilisation of the aforementioned methodology necessitates comprehensive reconsideration.').document
  assert.equal(d.readability_metric.name, 'flesch_kincaid_grade')
  assert.equal(d.readability_metric.threshold, 12)
  assert.equal(typeof d.readability_metric.flag, 'boolean')
})

/* ------------------------------------------------------------------ engine */

test('the engine catches a comma splice as a blocking hard constraint', () => {
  const r = evaluate({ text: 'The committee reviewed the report, it was approved without discussion.', profile: 'PROFILE-GENERAL' })
  assert.equal(r.verdict, 'blocked')
  assert.ok(r.blocking.some((b) => b.rule_id === 'PUN-002'), 'PUN-002 should block')
  assert.ok(r.blocking.every((b) => b.strength === 'hard_constraint'))
})

test('clean prose is not blocked', () => {
  const r = evaluate({ text: 'The team shipped the release on Tuesday. Every test passed.', profile: 'PROFILE-GENERAL' })
  assert.equal(r.verdict, 'clear')
  assert.equal(r.blocking.length, 0)
})

test('rules that only ask you to verify never enter the blocking set', () => {
  const r = evaluate({ text: 'The team shipped the release on Tuesday.', profile: 'PROFILE-GENERAL' })
  for (const c of r.checks) assert.ok(c.demand === 'check' || c.demand === 'request')
  for (const b of r.blocking) assert.equal(b.demand, 'change')
})

test('unresolvable facts are reported, never guessed', () => {
  const r = evaluate({ text: 'Our platform reduces onboarding time.', profile: 'PROFILE-COPY' })
  assert.ok(r.needs_input.count > 0)
  assert.ok(r.needs_input.paths.length > 0)
  for (const p of r.needs_input.paths) assert.equal(typeof p.path, 'string')
  assert.equal(r.coverage.resolved + r.coverage.unresolved, r.coverage.evaluations)
})

test('supplying a fact resolves a rule that was previously unknown', () => {
  const text = 'Our platform reduces onboarding time.'
  const before = evaluate({ text, rule_ids: ['CLR-006'] })
  const needed = before.needs_input.paths.map((p) => p.path)
  assert.ok(needed.includes('reference_expression.ambiguity'))

  const after = evaluate({ text, rule_ids: ['CLR-006'], facts: { reference_expression: { ambiguity: true } } })
  assert.equal(after.needs_input.count, 0)
  assert.ok(after.applied_rule_ids.includes('CLR-006'))
})

test('a profile restricts the rules to its active domains', () => {
  const plain = evaluate({ text: 'The report was approved, it shipped.', profile: 'PROFILE-PLAIN' })
  const general = evaluate({ text: 'The report was approved, it shipped.', profile: 'PROFILE-GENERAL' })
  const plainProfile = corpus.profiles.find((p) => p.id === 'PROFILE-PLAIN')
  assert.ok(!plainProfile.active_domains.includes('punctuation'))
  assert.ok(plain.coverage.rules_selected < general.coverage.rules_selected)
})

test('sentence rules are evaluated once per sentence', () => {
  const one = evaluate({ text: 'The report was approved.', rule_ids: ['SYN-004'] })
  const three = evaluate({ text: 'The report was approved. The plan was drafted. The memo was sent.', rule_ids: ['SYN-004'] })
  assert.equal(three.coverage.evaluations, 3)
  assert.equal(one.coverage.evaluations, 1)
})

test('repeat firings of one rule are grouped with an occurrence count', () => {
  const r = evaluate({ text: 'The report was approved. The plan was drafted. The memo was sent.', rule_ids: ['SYN-004'] })
  const fired = [...r.blocking, ...r.context_defaults, ...r.ranked_options, ...r.checks]
  const syn = fired.find((f) => f.rule_id === 'SYN-004')
  assert.ok(syn)
  assert.equal(syn.occurrences, 3)
  assert.equal(syn.units.length, 3)
})

test('an empty evaluation is well formed rather than an error', () => {
  const r = evaluate({ text: 'Ship.', rule_ids: ['GRM-001'] })
  assert.ok(['clear', 'blocked'].includes(r.verdict))
  assert.equal(typeof r.coverage.evaluations, 'number')
})

test('resolveRules answers which rules govern a context with no text', () => {
  const r = resolveRules({ profile: 'PROFILE-TECH' })
  const tech = corpus.profiles.find((p) => p.id === 'PROFILE-TECH')
  assert.ok(r.count > 0)
  assert.ok(r.rules.every((x) => tech.active_domains.includes(corpus.rulesById.get(x.id).domain)))
  assert.ok(Array.isArray(r.precedence))
})

test('the corpus test cases run and report decidability honestly', () => {
  const run = runCorpusTests()
  assert.equal(run.total, corpus.tests.length)
  assert.equal(run.decidable + run.needs_facts + run.cross_axis, run.total)
  // TST-025 targets LTX-005, a cross-axis rule: it arbitrates between two rules rather
  // than evaluating text, so it is reported as out of scope, not as a missing rule.
  assert.ok(run.results.every((r) => r.status !== 'no_such_rule'),
    'every test names an id the corpus actually defines')
  assert.equal(run.cross_axis, 1)
})

/* ------------------------------------------------------------------- score */

test('a gate metric below 2 fails regardless of the average', () => {
  const s = score({ scores: { accuracy: 4, clarity: 4, usability: 4, structure: 4, evidence: 1, accessibility: 4, ethics: 4, outcome: 4 } })
  assert.equal(s.verdict, 'fail_regardless_of_average')
  assert.deepEqual(s.hard_gates.failed, ['evidence'])
})

test('an unscored gate metric leaves the gate open rather than passing it', () => {
  const s = score({ scores: { clarity: 4, structure: 4 } })
  assert.equal(s.verdict, 'incomplete')
  assert.deepEqual(s.hard_gates.open.sort(), ['accessibility', 'accuracy', 'ethics', 'evidence'])
})

test('the weighted score follows the declared formula', () => {
  const s = score({ scores: { accuracy: 4, evidence: 4, accessibility: 4, ethics: 4 } })
  // Four metrics, all weight 2, all scored 4 → 32 / (4 × 8) × 100 = 100.
  assert.equal(s.weighted_score, 100)
  assert.equal(s.verdict, 'calculated')
})

test('scoring nothing is reported as unscored, not as zero', () => {
  const s = score({})
  assert.equal(s.weighted_score, null)
  assert.equal(s.verdict, 'incomplete')
})
