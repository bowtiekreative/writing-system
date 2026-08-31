/**
 * The rule engine.
 *
 * Implements the ten execution steps declared in 23-rule-engine.json against the 228 base
 * rules, using the three-valued AST evaluator. Rules are evaluated once per unit of their
 * declared layer: a sentence rule runs against every sentence, a document rule once.
 */

import { corpus } from '../corpus.js'
import { analyze } from './analyze.js'
import { evaluateCondition, conditionPaths, TRUE, FALSE, UNKNOWN } from './ast.js'

/**
 * The 25-verb action vocabulary of 04-logic-operators.json, grouped by what a caller has to
 * do about it. A rule that fires with only `check` or `request` actions is not a defect in
 * the text — it is a step the writer owes the process — so it never enters the blocking set.
 */
const ACTION_KIND = {
  retain: 'no_op',
  verify: 'check', select: 'check', measure: 'check', test_with_reader: 'check',
  cite: 'check', define: 'check',
  request_evidence: 'request', request_context: 'request', select_template: 'request',
  escalate_review: 'request', route: 'request',
  replace: 'change', delete: 'change', insert: 'change', move: 'change', split: 'change',
  merge: 'change', reorder: 'change', align: 'change', convert: 'change', expand: 'change',
  compress: 'change', qualify: 'change', annotate: 'change', flag: 'change',
  promote: 'change', restructure: 'change', complete: 'change', apply_policy: 'change',
  block_publication: 'change'
}

const kindOf = (action) => ACTION_KIND[action] ?? 'change'

/** The strongest demand a set of actions makes. */
function actionDemand (actions = []) {
  const kinds = new Set(actions.map((a) => kindOf(a.action)))
  if (kinds.has('change')) return 'change'
  if (kinds.has('request')) return 'request'
  if (kinds.has('check')) return 'check'
  return 'no_op'
}

/** Rank order from 23-rule-engine.json step 7. */
const LAKA_AXIS_WEIGHT = { magnitude: 1, scope: 2, depth: 3, reversibility: 4 }

const STRENGTH_ORDER = { hard_constraint: 0, context_default: 1, heuristic: 2, creative_option: 3 }

/** Which text_model layers a rule layer maps onto. */
const LAYER_SCOPE = {
  signal: 'document',
  word: 'sentence',
  phrase: 'sentence',
  clause: 'sentence',
  sentence: 'sentence',
  paragraph: 'paragraph',
  section: 'section',
  document: 'document',
  content_system: 'document'
}

function deepMerge (base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return base
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const [k, v] of Object.entries(extra)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])
      ? deepMerge(out[k], v)
      : v
  }
  return out
}

/**
 * Build the fact scopes a rule of the given layer runs against.
 * Each scope is one evaluation: a unit label plus the fact object visible to it.
 */
function scopesFor (layer, model, supplied) {
  const scope = LAYER_SCOPE[layer] ?? 'document'
  const base = { context: model.context, document: model.document }

  if (scope === 'sentence') {
    return model.sentences.map((s) => ({
      unit: { type: 'sentence', index: s.index, excerpt: excerpt(s.text) },
      facts: deepMerge({
        ...base,
        abbreviation: model.abbreviation,
        paragraph: model.paragraphs[s.paragraph_index] ?? null,
        sentence: s,
        series: s.series?.item_count ? s.series : undefined,
        // A single-clause sentence IS its clause, so clause-layer facts are safe to set.
        // In a multi-clause sentence they are not, and stay unresolved.
        clause: s.independent_clause_count === 1
          ? { voice: s.voice, nominalization_count: s.nominalisation_count }
          : undefined
      }, supplied)
    }))
  }
  if (scope === 'paragraph') {
    return model.paragraphs.map((p) => ({
      unit: { type: 'paragraph', index: p.index, excerpt: excerpt(p.text) },
      facts: deepMerge({ ...base, paragraph: p }, supplied)
    }))
  }
  if (scope === 'section') {
    const sections = model.sections?.length ? model.sections : []
    if (!sections.length) return [] // no sections asserted — the layer is not present
    return sections.map((s, i) => ({
      unit: { type: 'section', index: i, excerpt: excerpt(s.text ?? s.title ?? '') },
      facts: deepMerge({ ...base, section: s }, supplied)
    }))
  }
  return [{
    unit: { type: 'document', index: 0, excerpt: excerpt(model.text) },
    facts: deepMerge({ ...base, abbreviation: model.abbreviation }, supplied)
  }]
}

const excerpt = (s, n = 120) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

function lakaCost (rule) {
  const axes = rule.laka?.primary_axes ?? []
  const weight = axes.reduce((n, a) => n + (LAKA_AXIS_WEIGHT[a] ?? 0), 0)
  // Rules that declare the smallest sufficient intervention rank ahead of those that do not.
  return (rule.laka?.smallest_sufficient_intervention ? 0 : 10) + weight
}

/** Which rules are in play for this run: profile / domain filter, then layer presence. */
function filterRules (options) {
  const { profile, domains, layers, strengths, ruleIds } = options
  let rules = corpus.rules

  if (ruleIds?.length) {
    const want = new Set(ruleIds)
    return rules.filter((r) => want.has(r.id))
  }
  if (profile) {
    const p = corpus.profiles.find((x) => x.id === profile)
    if (p?.active_domains?.length) {
      const active = new Set(p.active_domains)
      rules = rules.filter((r) => active.has(r.domain))
    }
  }
  if (domains?.length) {
    const want = new Set(domains)
    rules = rules.filter((r) => want.has(r.domain))
  }
  if (layers?.length) {
    const want = new Set(layers)
    rules = rules.filter((r) => want.has(r.layer))
  }
  if (strengths?.length) {
    const want = new Set(strengths)
    rules = rules.filter((r) => want.has(r.strength))
  }
  return rules
}

/**
 * Run the engine.
 *
 * @param {object} input
 * @param {string} input.text            the text under evaluation
 * @param {object} [input.context]       rhetorical situation (genre, audience, stakes, ...)
 * @param {object} [input.facts]         semantic facts the caller asserts, merged over derived ones
 * @param {string} [input.profile]       application profile id from 27-application-profiles.json
 * @param {string[]} [input.domains]     restrict to these rule domains
 * @param {string[]} [input.layers]      restrict to these rule layers
 * @param {string[]} [input.strengths]   restrict to these rule strengths
 * @param {string[]} [input.rule_ids]    evaluate exactly these rules
 * @param {boolean} [input.include_trace] include the per-condition evaluation trace
 */
export function evaluate (input = {}) {
  const started = Date.now()
  const {
    text = '',
    context = {},
    facts: supplied = {},
    profile = null,
    domains = null,
    layers = null,
    strengths = null,
    rule_ids: ruleIds = null,
    include_trace: includeTrace = false
  } = input

  // Step 1 — analyze.
  const model = analyze(text, { context: { ...context, ...(profile ? { profile_id: profile } : {}) } })

  // Step 2 — filter rules by profile/domain, then by whether their layer exists in the model.
  const present = new Set(model.layers_present)
  const candidates = filterRules({ profile, domains, layers, strengths, ruleIds })
    .filter((r) => present.has(r.layer))

  const fired = []
  const notTriggered = []
  const needsInput = []
  const neededPaths = new Map()

  // Steps 3–5 — evaluate by strength; every rule is evaluated, then sorted by strength below.
  for (const rule of candidates) {
    const scopes = scopesFor(rule.layer, model, supplied)
    for (const scope of scopes) {
      const when = evaluateCondition(rule.when, scope.facts)

      if (when.value === UNKNOWN) {
        for (const p of when.needs) neededPaths.set(p, (neededPaths.get(p) ?? 0) + 1)
        needsInput.push(record(rule, scope, 'needs_input', { needs: when.needs, trace: includeTrace ? when.trace : undefined }))
        continue
      }

      if (when.value === FALSE) {
        notTriggered.push(record(rule, scope, 'not_triggered', {
          actions: rule.else ?? [],
          trace: includeTrace ? when.trace : undefined
        }))
        continue
      }

      // `unless` holds the documented exceptions; any TRUE exception suppresses the rule.
      const exceptions = (rule.unless ?? []).map((u) => evaluateCondition(u, scope.facts))
      const excepted = exceptions.find((e) => e.value === TRUE)
      if (excepted) {
        notTriggered.push(record(rule, scope, 'excepted', {
          actions: rule.else ?? [],
          trace: includeTrace ? excepted.trace : undefined
        }))
        continue
      }
      const unresolvedException = exceptions.find((e) => e.value === UNKNOWN)

      const actions = rule.then ?? []
      const demand = actionDemand(actions)
      fired.push(record(rule, scope, demand === 'no_op' ? 'satisfied' : 'fired', {
        demand,
        actions,
        exception_unresolved: unresolvedException ? unresolvedException.needs : undefined,
        trace: includeTrace ? when.trace : undefined
      }))
      if (unresolvedException) for (const p of unresolvedException.needs) neededPaths.set(p, (neededPaths.get(p) ?? 0) + 1)
    }
  }

  // Step 7 — rank: outcome first (hard constraints bind hardest), then smallest intervention.
  const actionable = groupByRule(fired.filter((f) => f.status === 'fired'))
  actionable.sort((a, b) =>
    (STRENGTH_ORDER[a.strength] ?? 9) - (STRENGTH_ORDER[b.strength] ?? 9) ||
    lakaCost(corpus.rulesById.get(a.rule_id)) - lakaCost(corpus.rulesById.get(b.rule_id)) ||
    a.rule_id.localeCompare(b.rule_id))

  // Step 3 outcome — a hard constraint that demands a change to the text is what blocks.
  // Hard constraints that only ask you to verify or supply context are surfaced separately.
  const changes = actionable.filter((f) => f.demand === 'change')
  const blocking = changes.filter((f) => f.strength === 'hard_constraint')
  const defaults = changes.filter((f) => f.strength === 'context_default')
  const ranked = changes.filter((f) => f.strength === 'heuristic' || f.strength === 'creative_option')
  const checks = actionable.filter((f) => f.demand === 'check' || f.demand === 'request')

  // Step 10 — emit.
  const needed = [...neededPaths.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([path, rules_waiting]) => ({ path, rules_waiting }))

  return {
    engine: { version: corpus.engineSpec.version ?? '1.0.0', spec: '23-rule-engine.json', evaluated_in_ms: Date.now() - started },
    input: {
      profile,
      context: model.context,
      supplied_fact_paths: flattenPaths(supplied),
      character_count: text.length
    },
    text_model: {
      document: model.document,
      layers_present: model.layers_present,
      paragraph_count: model.paragraphs.length,
      sentence_count: model.sentences.length
    },
    coverage: {
      rules_in_corpus: corpus.rules.length,
      rules_selected: candidates.length,
      evaluations: fired.length + notTriggered.length + needsInput.length,
      resolved: fired.length + notTriggered.length,
      unresolved: needsInput.length,
      note: 'Rules whose conditions name facts no surface analyser can derive stay unresolved rather than being guessed. Supply them under `facts` to resolve them.'
    },
    verdict: blocking.length ? 'blocked' : 'clear',
    blocking,
    context_defaults: defaults,
    ranked_options: ranked,
    checks,
    satisfied: fired.filter((f) => f.status === 'satisfied').map((f) => f.rule_id),
    not_triggered_count: notTriggered.length,
    needs_input: {
      count: needsInput.length,
      paths: needed.slice(0, 60),
      rules: dedupeRules(needsInput).slice(0, 60)
    },
    applied_rule_ids: actionable.map((f) => f.rule_id),
    test_plan: buildTestPlan(actionable),
    safe_failure: corpus.engineSpec.safe_failure ?? null
  }
}

/** One entry per rule, carrying every unit it fired on. */
function groupByRule (records) {
  const byRule = new Map()
  for (const r of records) {
    if (!byRule.has(r.rule_id)) {
      byRule.set(r.rule_id, { ...r, units: [], occurrences: 0 })
      delete byRule.get(r.rule_id).unit
    }
    const g = byRule.get(r.rule_id)
    g.occurrences++
    if (g.units.length < 20) g.units.push(r.unit)
  }
  return [...byRule.values()]
}

function record (rule, scope, status, extra = {}) {
  return {
    rule_id: rule.id,
    name: rule.name,
    domain: rule.domain,
    layer: rule.layer,
    strength: rule.strength,
    status,
    unit: scope.unit,
    human_logic: rule.human_logic,
    because: rule.because,
    diagnostics: rule.diagnostics ?? [],
    source_ids: rule.source_ids ?? [],
    ...extra
  }
}

function dedupeRules (records) {
  const seen = new Map()
  for (const r of records) {
    if (!seen.has(r.rule_id)) seen.set(r.rule_id, { rule_id: r.rule_id, name: r.name, domain: r.domain, needs: r.needs ?? [] })
  }
  return [...seen.values()]
}

function flattenPaths (obj, prefix = '', out = []) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flattenPaths(v, path, out)
    else out.push(path)
  }
  return out
}

/** Step 9 — the regression dimensions the corpus asks you to re-test after editing. */
function buildTestPlan (actionable) {
  const dimensions = corpus.engineSpec.execution?.find((s) => s.action === 'regression_test')?.dimensions ?? []
  const touched = new Set(actionable.map((a) => a.domain))
  return {
    dimensions,
    focus: dimensions.filter((d) =>
      (d === 'grammar' && (touched.has('grammar') || touched.has('punctuation') || touched.has('syntax'))) ||
      (d === 'cohesion' && touched.has('structure')) ||
      (d === 'voice' && (touched.has('voice') || touched.has('rhythm'))) ||
      (d === 'accessibility' && touched.has('accessibility')) ||
      (d === 'evidence' && (touched.has('argument') || touched.has('ethics'))) ||
      d === 'meaning' || d === 'accuracy' || d === 'task_success'),
    cases: corpus.tests.filter((t) => actionable.some((a) => a.rule_id === t.rule_id)).map((t) => t.id)
  }
}

/**
 * Resolve the active rule set for a context without supplying any text.
 * This is the "which rules govern me here?" question, answered before drafting.
 */
export function resolveRules ({ profile = null, domains = null, layers = null, strengths = null, context = {} } = {}) {
  const rules = filterRules({ profile, domains, layers, strengths, ruleIds: null })
  const p = profile ? corpus.profiles.find((x) => x.id === profile) ?? null : null
  const byStrength = {}
  for (const r of rules) (byStrength[r.strength] ??= []).push(r.id)
  return {
    context,
    profile: p,
    precedence: corpus.axes.precedence ?? [],
    selection_policy: corpus.manifest.architecture?.selection_policy ?? null,
    strength_behavior: corpus.engineSpec.strength_behavior ?? {},
    count: rules.length,
    by_strength: byStrength,
    rules: rules.map((r) => ({
      id: r.id, name: r.name, domain: r.domain, layer: r.layer, strength: r.strength,
      human_logic: r.human_logic, requires_facts: conditionPaths(r.when)
    }))
  }
}

/** Run the corpus' own 25 minimal-pair test cases through the engine. */
export function runCorpusTests () {
  const results = corpus.tests.map((t) => {
    const rule = corpus.rulesById.get(t.rule_id)
    if (!rule) {
      // Cross-axis rules arbitrate between two other rules; they take rule_a/rule_b as
      // input, not text, so this engine cannot run them over a document.
      const cross = corpus.crossAxisById.get(t.rule_id)
      return {
        id: t.id,
        rule_id: t.rule_id,
        assertion: t.assertion,
        reason: t.reason,
        status: cross ? 'cross_axis_rule' : 'no_such_rule',
        note: cross
          ? 'A cross-axis rule. It arbitrates between two rules rather than evaluating text, so it is out of scope for a document run.'
          : 'This case names an id that is not in the corpus.'
      }
    }
    const before = evaluate({ text: t.before ?? '', rule_ids: [t.rule_id] })
    const after = evaluate({ text: t.after ?? '', rule_ids: [t.rule_id] })
    const decidable = before.coverage.unresolved === 0 && after.coverage.unresolved === 0
    return {
      id: t.id,
      rule_id: t.rule_id,
      assertion: t.assertion,
      reason: t.reason,
      before: t.before,
      after: t.after,
      status: decidable ? 'decidable' : 'needs_facts',
      before_fired: before.applied_rule_ids.includes(t.rule_id),
      after_fired: after.applied_rule_ids.includes(t.rule_id),
      unresolved_paths: [...new Set([...before.needs_input.paths, ...after.needs_input.paths].map((p) => p.path))]
    }
  })
  const decidable = results.filter((r) => r.status === 'decidable')
  const crossAxis = results.filter((r) => r.status === 'cross_axis_rule')
  return {
    total: results.length,
    decidable: decidable.length,
    cross_axis: crossAxis.length,
    needs_facts: results.length - decidable.length - crossAxis.length,
    note: 'A case is decidable when the analyser can derive every fact the rule reads. The rest name semantic facts a caller must assert; they are reported, not guessed.',
    results
  }
}
