/**
 * Condition AST evaluator for LAKA writing rules.
 *
 * The corpus (04-logic-operators.json) defines conditions as Boolean ASTs built from
 * `all` / `any` / `not` combinators over `{ path, operator, value }` predicates.
 *
 * Evaluation is deliberately THREE-VALUED. Most rule paths name semantic facts that no
 * surface analyser can derive (`claim.type`, `truth_check`, `sentence.intended_effect`).
 * Guessing them would violate the corpus' own safe_failure clause — "preserve_text,
 * ask_focused_question_or_flag, do_not_invent" (23-rule-engine.json). So an unresolved
 * path yields UNKNOWN and the engine reports exactly which facts it would need.
 */

export const TRUE = 'true'
export const FALSE = 'false'
export const UNKNOWN = 'unknown'

/** Read a dotted path out of a fact object. Returns the sentinel MISSING when absent. */
export const MISSING = Symbol('missing')

export function readPath (facts, path) {
  if (typeof path !== 'string' || path.length === 0) return MISSING
  let cur = facts
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return MISSING
    if (!(key in cur)) return MISSING
    cur = cur[key]
  }
  return cur === undefined ? MISSING : cur
}

const asArray = (v) => (Array.isArray(v) ? v : [v])
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

function compare (operator, actual, expected) {
  switch (operator) {
    case 'eq': return eq(actual, expected) ? TRUE : FALSE
    case 'neq': return eq(actual, expected) ? FALSE : TRUE
    case 'in': return asArray(expected).some((e) => eq(actual, e)) ? TRUE : FALSE
    case 'not_in': return asArray(expected).some((e) => eq(actual, e)) ? FALSE : TRUE
    case 'contains': {
      if (Array.isArray(actual)) return actual.some((a) => eq(a, expected)) ? TRUE : FALSE
      if (typeof actual === 'string') return actual.toLowerCase().includes(String(expected).toLowerCase()) ? TRUE : FALSE
      return UNKNOWN
    }
    case 'gt': return isNum(actual) && isNum(expected) ? (actual > expected ? TRUE : FALSE) : UNKNOWN
    case 'gte': return isNum(actual) && isNum(expected) ? (actual >= expected ? TRUE : FALSE) : UNKNOWN
    case 'lt': return isNum(actual) && isNum(expected) ? (actual < expected ? TRUE : FALSE) : UNKNOWN
    case 'lte': return isNum(actual) && isNum(expected) ? (actual <= expected ? TRUE : FALSE) : UNKNOWN
    case 'count_gte': {
      const n = Array.isArray(actual) ? actual.length : (isNum(actual) ? actual : null)
      return n != null && isNum(expected) ? (n >= expected ? TRUE : FALSE) : UNKNOWN
    }
    case 'present_in': {
      // "rule.layer present_in text_model" — expected is the container to look inside.
      if (Array.isArray(expected)) return expected.some((e) => eq(actual, e)) ? TRUE : FALSE
      if (expected && typeof expected === 'object') return actual in expected ? TRUE : FALSE
      return UNKNOWN
    }
    // Engine-control operators from 23-rule-engine.json. They are assertions about the
    // run itself, not about the text, so they are answered by the caller's fact base.
    case 'compatible_with':
    case 'unknown':
    case 'insufficient':
    case 'unresolved':
      return actual === true || eq(actual, expected) ? TRUE : FALSE
    default:
      return UNKNOWN
  }
}

function eq (a, b) {
  if (a === b) return true
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase()
  if (typeof a === 'boolean' && typeof b === 'string') return String(a) === b.toLowerCase()
  if (typeof b === 'boolean' && typeof a === 'string') return String(b) === a.toLowerCase()
  return false
}

/**
 * Evaluate a condition node.
 * @returns {{ value: 'true'|'false'|'unknown', needs: string[], trace: object }}
 */
export function evaluateCondition (node, facts, needs = new Set()) {
  if (node == null) return { value: TRUE, needs: [...needs], trace: { kind: 'empty', value: TRUE } }

  // Combinators
  if (Array.isArray(node.all)) {
    const kids = node.all.map((n) => evaluateCondition(n, facts, needs))
    const value = kids.some((k) => k.value === FALSE)
      ? FALSE
      : kids.some((k) => k.value === UNKNOWN) ? UNKNOWN : TRUE
    return { value, needs: [...needs], trace: { kind: 'all', value, children: kids.map((k) => k.trace) } }
  }
  if (Array.isArray(node.any)) {
    const kids = node.any.map((n) => evaluateCondition(n, facts, needs))
    const value = kids.some((k) => k.value === TRUE)
      ? TRUE
      : kids.some((k) => k.value === UNKNOWN) ? UNKNOWN : FALSE
    return { value, needs: [...needs], trace: { kind: 'any', value, children: kids.map((k) => k.trace) } }
  }
  if (node.not != null) {
    const kid = evaluateCondition(node.not, facts, needs)
    const value = kid.value === TRUE ? FALSE : kid.value === FALSE ? TRUE : UNKNOWN
    return { value, needs: [...needs], trace: { kind: 'not', value, children: [kid.trace] } }
  }

  // Predicate
  if (typeof node.path === 'string') {
    const actual = readPath(facts, node.path)
    const op = node.operator

    if (op === 'exists') {
      const value = actual !== MISSING && actual !== null ? TRUE : FALSE
      return { value, needs: [...needs], trace: { kind: 'predicate', path: node.path, operator: op, value } }
    }
    if (op === 'missing') {
      const value = actual === MISSING || actual === null ? TRUE : FALSE
      return { value, needs: [...needs], trace: { kind: 'predicate', path: node.path, operator: op, value } }
    }
    if (actual === MISSING) {
      needs.add(node.path)
      return {
        value: UNKNOWN,
        needs: [...needs],
        trace: { kind: 'predicate', path: node.path, operator: op, value: UNKNOWN, reason: 'fact not supplied' }
      }
    }
    const value = compare(op, actual, node.value)
    if (value === UNKNOWN) needs.add(node.path)
    return {
      value,
      needs: [...needs],
      trace: { kind: 'predicate', path: node.path, operator: op, expected: node.value, actual, value }
    }
  }

  return { value: UNKNOWN, needs: [...needs], trace: { kind: 'unrecognised', node, value: UNKNOWN } }
}

/** Collect every path a condition tree reads, without evaluating it. */
export function conditionPaths (node, out = new Set()) {
  if (node == null || typeof node !== 'object') return [...out]
  if (typeof node.path === 'string') out.add(node.path)
  for (const key of ['all', 'any']) if (Array.isArray(node[key])) node[key].forEach((n) => conditionPaths(n, out))
  if (node.not) conditionPaths(node.not, out)
  return [...out]
}
