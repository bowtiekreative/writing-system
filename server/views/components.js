import { esc, attr } from './layout.js'

const STRENGTH_META = {
  hard_constraint: { label: 'Hard constraint', cls: 'badge--hard', mark: '!' },
  context_default: { label: 'Context default', cls: 'badge--default', mark: '=' },
  heuristic: { label: 'Heuristic', cls: 'badge--heuristic', mark: '~' },
  creative_option: { label: 'Creative option', cls: 'badge--option', mark: '+' }
}

/** Strength badge. Carries a text label and a mark, so colour is never the only signal. */
export function strengthBadge (strength) {
  const m = STRENGTH_META[strength] ?? { label: strength, cls: '', mark: '·' }
  return `<span class="badge ${m.cls}" data-mark="${attr(m.mark)}">${esc(m.label)}</span>`
}

export function chip (text) {
  return `<span class="badge">${esc(text)}</span>`
}

/** Render a condition AST as a nested, readable tree. */
export function conditionTree (node, depth = 0) {
  if (node == null) return '<p class="muted">No condition — this rule always applies at its layer.</p>'

  const render = (n) => {
    if (n == null) return ''
    for (const combinator of ['all', 'any']) {
      if (Array.isArray(n[combinator])) {
        return `<li><span class="op">${combinator.toUpperCase()}</span><ul>${n[combinator].map(render).join('')}</ul></li>`
      }
    }
    if (n.not != null) {
      return `<li><span class="op">NOT</span><ul>${render(n.not)}</ul></li>`
    }
    if (typeof n.path === 'string') {
      const value = n.value === undefined
        ? ''
        : ` <span class="val">${esc(Array.isArray(n.value) ? `[${n.value.join(', ')}]` : JSON.stringify(n.value))}</span>`
      return `<li><span class="path">${esc(n.path)}</span> <span class="oper">${esc(n.operator ?? '')}</span>${value}</li>`
    }
    return `<li class="muted">${esc(JSON.stringify(n))}</li>`
  }

  return `<ul class="tree">${render(node)}</ul>`
}

/** Render a then/else action list. */
export function actionList (actions, { empty = 'No actions declared.' } = {}) {
  if (!Array.isArray(actions) || actions.length === 0) return `<p class="muted">${esc(empty)}</p>`
  return `<ol class="stack" style="padding-left:var(--space-6);margin:0">${actions.map((a) => {
    if (typeof a === 'string') return `<li>${esc(a)}</li>`
    const bits = []
    if (a.target) bits.push(`target <code>${esc(a.target)}</code>`)
    if (a.value_from) bits.push(`value from <code>${esc(a.value_from)}</code>`)
    if (a.value !== undefined) bits.push(`value <code>${esc(JSON.stringify(a.value))}</code>`)
    if (a.reason) bits.push(esc(a.reason))
    const rest = bits.length ? ` <span class="muted">— ${bits.join(', ')}</span>` : ''
    return `<li><strong style="color:var(--rp-heading)">${esc(a.action ?? 'action')}</strong>${rest}</li>`
  }).join('')}</ol>`
}

/** One row in the rule browser. */
export function ruleRow (rule) {
  return `<li>
    <a class="rule" href="/rules/${attr(rule.id)}">
      <span class="rule__id">${esc(rule.id)}</span>
      <span>
        <span class="rule__name">${esc(rule.name)}</span>
        <span class="rule__logic">${esc(rule.human_logic)}</span>
      </span>
      ${strengthBadge(rule.strength)}
    </a>
  </li>`
}

/** A JSON block with a caption naming where the data came from. */
export function jsonBlock (value, caption) {
  const body = esc(JSON.stringify(value, null, 2))
  return `<figure style="margin:0">
    ${caption ? `<figcaption class="muted" style="font-size:13px;margin-bottom:var(--space-2)">${esc(caption)}</figcaption>` : ''}
    <pre><code>${body}</code></pre>
  </figure>`
}

export function statGrid (stats) {
  return `<div class="grid grid--4">${stats.map((s) => `
    <div class="card stat">
      <span class="stat__value">${esc(s.value)}</span>
      <span class="stat__label">${esc(s.label)}</span>
    </div>`).join('')}</div>`
}

/** Render an arbitrary corpus object as readable HTML rather than raw JSON. */
export function renderValue (value, depth = 0) {
  if (value == null) return '<span class="muted">—</span>'
  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="muted">none</span>'
    const scalar = value.every((v) => typeof v !== 'object' || v === null)
    if (scalar) return `<ul class="chips">${value.map((v) => `<li>${chip(v)}</li>`).join('')}</ul>`
    return `<ol class="stack" style="padding-left:var(--space-6)">${value.map((v) => `<li>${renderValue(v, depth + 1)}</li>`).join('')}</ol>`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
    if (!entries.length) return '<span class="muted">none</span>'
    return `<dl class="deflist">${entries.map(([k, v]) => `
      <dt>${esc(k.replace(/_/g, ' '))}</dt>
      <dd>${renderValue(v, depth + 1)}</dd>`).join('')}</dl>`
  }
  return esc(String(value))
}

export function pageHead ({ eyebrow, title, lede, id = 'top' }) {
  return `<div id="${attr(id)}">
    ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
    <h1>${esc(title)}</h1>
    ${lede ? `<p class="lede" style="margin-top:var(--space-6)">${esc(lede)}</p>` : ''}
  </div>`
}
