import { corpus, slugify } from '../corpus.js'
import { esc, attr, icon, lattice, ORIGIN } from './layout.js'
import { chip, conditionTree, jsonBlock, renderValue, pageHead, strengthBadge, ruleRow } from './components.js'
import { ENDPOINTS } from '../routes/api.js'
import { DERIVED_PATHS } from '../engine/analyze.js'
import { conditionPaths } from '../engine/ast.js'

const wrap = (inner) => `<section><div class="wrap stack">${inner}</div></section>`

/**
 * Publishers that refuse direct requests, so a hyperlink to them is dead for readers and
 * crawlers alike. The citation and its address are still shown in full — as text.
 */
const UNLINKABLE_HOSTS = new Set(['www.iso.org', 'iso.org'])

function linkOrText (source) {
  if (!source.url) return esc(source.title)
  let host = ''
  try { host = new URL(source.url).host } catch { /* not a parseable URL */ }
  if (UNLINKABLE_HOSTS.has(host)) {
    return `${esc(source.title)}<br><span class="muted t-13">${esc(source.url)} — the publisher blocks direct requests, so this is printed rather than linked.</span>`
  }
  return `<a href="${attr(source.url)}" rel="noopener">${esc(source.title)}</a>`
}

/* ----------------------------------------------------------------- logic -- */

export function logicPage () {
  const o = corpus.operators
  const body = wrap(`
    ${pageHead({ eyebrow: 'The model', title: esc(o.title ?? 'Rule logic'), lede: 'Conditions are Boolean trees over named facts. Branches are explicit. Exceptions are declared, not implied.' })}

    <h2 class="mt-9">Condition trees</h2>
    <div class="card">${renderValue(o.condition_ast)}</div>

    <h2 class="mt-9">Decision shape</h2>
    <div class="card">${renderValue(o.decision_shape)}</div>

    <h2 class="mt-9">Action vocabulary</h2>
    <p class="tight muted">The ${(o.action_vocabulary ?? []).length} verbs a rule may call for. The engine groups them by what they demand of you: change the text, check something, or ask for context.</p>
    <ul class="chips">${(o.action_vocabulary ?? []).map((a) => `<li>${chip(a)}</li>`).join('')}</ul>

    <h2 class="mt-9">Evaluation order</h2>
    <ol class="steps">${(o.evaluation_order ?? []).map((s) => `<li><div>${renderValue(s)}</div></li>`).join('')}</ol>

    <h2 class="mt-9">Conflict resolution</h2>
    <p class="tight muted">When two rules disagree, these decide which wins.</p>
    ${(o.conflict_resolution ?? []).map((c) => `
      <div class="card">
        <p class="eyebrow mb-3">If</p>
        ${conditionTree(c.if)}
        <p class="eyebrow label-gap-4">Then</p>
        <p class="m-0 ink">${esc(typeof c.then === 'string' ? c.then : JSON.stringify(c.then))}</p>
      </div>`).join('')}

    <h2 class="mt-9">The rule schema</h2>
    <p class="tight muted">Every rule record validates against this JSON Schema (Draft 2020-12).</p>
    ${jsonBlock(corpus.ruleSchema, '05-rule-schema.json')}
  `)

  return {
    title: 'Rule logic',
    description: 'How a LAKA writing rule is built: Boolean condition trees, explicit then and else branches, declared exceptions, and a 25-verb action vocabulary.',
    path: '/logic',
    body
  }
}

/* ------------------------------------------------------------ primitives -- */

export function primitivesPage () {
  const p = corpus.primitives
  const table = (rows, cols, caption) => `
    <div class="table-scroll">
      <table>
        <caption class="visually-hidden">${esc(caption)}</caption>
        <thead><tr>${cols.map((c) => `<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td${c.strong ? ' class="strong-ink"' : ''}>${esc(typeof r === 'object' ? r[c.key] ?? '' : r)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`

  const body = wrap(`
    ${pageHead({ eyebrow: 'The model', title: esc(p.title ?? 'Linguistic primitives'), lede: esc(p.model ?? '') })}

    <h2 class="mt-9">Parts of speech</h2>
    ${table(p.parts_of_speech ?? [], [{ key: 'tag', label: 'Tag', strong: true }, { key: 'name', label: 'Name' }, { key: 'function', label: 'Function' }], 'Parts of speech')}

    <h2 class="mt-9">Dependency relations</h2>
    ${table(p.dependency_relations ?? [], [{ key: 'relation', label: 'Relation', strong: true }, { key: 'name', label: 'Meaning' }], 'Dependency relations')}

    <h2 class="mt-9">Morphology features</h2>
    <ul class="chips">${(p.morphology_features ?? []).map((f) => `<li>${chip(f)}</li>`).join('')}</ul>

    <h2 class="mt-9">Clause roles</h2>
    <ul class="chips">${(p.clause_roles ?? []).map((f) => `<li>${chip(f)}</li>`).join('')}</ul>

    <h2 class="mt-9">Information structure</h2>
    <ul class="chips">${(p.information_structure ?? []).map((f) => `<li>${chip(f)}</li>`).join('')}</ul>

    <h2 class="mt-9">Discourse relations</h2>
    <ul class="chips">${(p.discourse_relations ?? []).map((f) => `<li>${chip(f)}</li>`).join('')}</ul>
  `)

  return {
    title: 'Linguistic primitives',
    description: 'The Universal Dependencies-compatible surface model the rules are written against: parts of speech, dependency relations, morphology, clause roles and discourse relations.',
    path: '/primitives',
    body
  }
}

/* ------------------------------------------------------------- templates -- */

export function templatesPage () {
  const body = wrap(`
    ${pageHead({
      eyebrow: 'Applying it',
      title: 'Composition templates',
      lede: `${corpus.templates.length} conditional structures. Each one declares when it applies, the slots it expects in order, and the rules that govern the whole piece.`
    })}
    ${corpus.templates.map((t) => `
      <article class="panel" id="${attr(t.id)}" class="mt-6">
        <p class="mono muted meta-id">${esc(t.id)}</p>
        <h2 class="t-28">${esc(t.name)}</h2>
        <div class="grid grid--2 mt-5">
          <div>
            <p class="eyebrow mb-3">Use when</p>
            ${conditionTree(t.use_when)}
          </div>
          <div>
            <p class="eyebrow mb-3">Global rules</p>
            ${renderValue(t.global_rules)}
          </div>
        </div>
        ${Array.isArray(t.slots) && t.slots.length ? `
        <p class="eyebrow label-gap-6">Slots, in order</p>
        <ol class="steps">${t.slots.map((s) => `<li><div>${renderValue(s)}</div></li>`).join('')}</ol>` : ''}
      </article>`).join('')}
  `)

  return {
    title: 'Composition templates',
    description: `${corpus.templates.length} conditional composition templates: when each structure applies, the slots it expects, and the rules that govern it.`,
    path: '/templates',
    body
  }
}

/* ------------------------------------------------------------- pipelines -- */

export function pipelinesPage () {
  const body = wrap(`
    ${pageHead({
      eyebrow: 'Applying it',
      title: 'Writing pipelines',
      lede: `${corpus.pipelines.length} end-to-end sequences. Each one names its steps in order and the decision that governs whether the work proceeds.`
    })}
    ${corpus.pipelines.map((p) => `
      <article class="panel" id="${attr(p.id)}" class="mt-6">
        <p class="mono muted meta-id">${esc(p.id)}</p>
        <h2 class="t-28">${esc(p.name)}</h2>
        <p class="eyebrow label-gap-6">Steps</p>
        <ol class="steps">${(p.steps ?? []).map((s) => `<li><div>${renderValue(s)}</div></li>`).join('')}</ol>
        ${p.decision ? `
        <p class="eyebrow label-gap-6">Decision</p>
        <div class="card">${renderValue(p.decision)}</div>` : ''}
      </article>`).join('')}
  `)

  return {
    title: 'Writing pipelines',
    description: `${corpus.pipelines.length} end-to-end writing pipelines, each with its ordered steps and the decision that gates it.`,
    path: '/pipelines',
    body
  }
}

/* -------------------------------------------------------------- profiles -- */

export function profilesPage () {
  const body = wrap(`
    ${pageHead({
      eyebrow: 'Applying it',
      title: 'Application profiles',
      lede: 'A profile decides which rule domains switch on and what gets weighted first. Choosing one is how you tell the engine what kind of writing this is.'
    })}
    <div class="grid grid--2 mt-8">
    ${corpus.profiles.map((p) => `
      <article class="card" id="${attr(p.id)}">
        <p class="mono muted meta-id">${esc(p.id)}</p>
        <h2 class="t-24">${esc(p.name)}</h2>
        <p class="eyebrow label-gap-5">Priority order</p>
        <ol class="m-0 indent">${(p.priority ?? []).map((x) => `<li>${esc(x.replace(/_/g, ' '))}</li>`).join('')}</ol>
        <p class="eyebrow label-gap-5">Active domains (${(p.active_domains ?? []).length})</p>
        <ul class="chips">${(p.active_domains ?? []).map((d) => `<li><a href="/rules?domain=${attr(d)}" class="plain">${chip(d.replace(/_/g, ' '))}</a></li>`).join('')}</ul>
        <p class="my-5"><a href="/engine">Run the engine with this profile →</a></p>
      </article>`).join('')}
    </div>
  `)

  return {
    title: 'Application profiles',
    description: 'Seven application profiles — general nonfiction, plain language, technical, narrative, copy, safety-critical and UX microcopy — each switching on a different set of rule domains.',
    path: '/profiles',
    body
  }
}

/* --------------------------------------------------------------- metrics -- */

export function metricsPage () {
  const m = corpus.qualityModel
  const gateIds = ['accuracy', 'evidence', 'accessibility', 'ethics']
  const body = wrap(`
    ${pageHead({
      eyebrow: 'Applying it',
      title: esc(m.title ?? 'Quality metrics'),
      lede: 'Twelve weighted measures, scored nought to four. Four of them are gates: below two, the document fails regardless of the average.'
    })}

    <div class="card"><p class="mono m-0 ink">${esc(m.formula)}</p></div>

    <h2 class="mt-9">The twelve metrics</h2>
    <div class="table-scroll">
      <table>
        <caption class="visually-hidden">The twelve quality metrics, their weights and questions</caption>
        <thead><tr><th scope="col">Metric</th><th scope="col">Weight</th><th scope="col">Gate</th><th scope="col">Question</th></tr></thead>
        <tbody>${(m.metrics ?? []).map((x) => `
          <tr>
            <td class="strong-ink">${esc(x.id.replace(/_/g, ' '))}</td>
            <td class="mono">${esc(x.weight)}</td>
            <td>${gateIds.includes(x.id) ? '<span class="badge badge--hard" data-mark="!">Gate</span>' : '<span class="muted">—</span>'}</td>
            <td>${esc(x.question)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <h2 class="mt-9">What a score means</h2>
    <dl class="deflist">${Object.entries(m.score_meanings ?? {}).map(([k, v]) => `
      <dt>${esc(k)}</dt><dd>${esc(String(v).replace(/_/g, ' '))}</dd>`).join('')}
    </dl>

    <h2 class="mt-9">Hard gates</h2>
    <div class="card">${conditionTree(m.hard_gates?.if)}
      <p class="my-4">Then: <strong class="ink">${esc(String(m.hard_gates?.then ?? '').replace(/_/g, ' '))}</strong></p>
      <p class="my-1 muted">Else: ${esc(String(m.hard_gates?.else ?? '').replace(/_/g, ' '))}</p>
    </div>

    <h2 class="mt-9">Outcome tests</h2>
    <p class="tight muted">The measured outcomes the model treats as evidence that the writing worked.</p>
    <ul class="chips">${(m.outcome_tests ?? []).map((t) => `<li>${chip(t.replace(/_/g, ' '))}</li>`).join('')}</ul>

    <p class="mt-9"><a href="/api#score">Score a document over the API →</a></p>
  `)

  return {
    title: 'Quality metrics',
    description: 'The twelve-metric weighted quality model, its four hard gates, and the outcome tests that count as evidence that a piece of writing worked.',
    path: '/metrics',
    body
  }
}

/* --------------------------------------------------------------- sources -- */

export function sourcesPage () {
  const byType = new Map()
  for (const s of corpus.sources) {
    if (!byType.has(s.type)) byType.set(s.type, [])
    byType.get(s.type).push(s)
  }

  const body = wrap(`
    ${pageHead({
      eyebrow: 'Reference',
      title: 'Bibliography and influence map',
      lede: `${corpus.sources.length} sources. Each rule cites the ones behind it; each source lists the rules that draw on it.`
    })}
    <div class="panel"><p class="m-0">${esc(corpus.byNum.get('29')?.json?.copyright_note ?? '')}</p></div>

    ${[...byType.entries()].map(([type, items]) => `
      <h2 class="mt-9">${esc(String(type).replace(/_/g, ' '))} <span class="muted t-count">${items.length}</span></h2>
      <div class="table-scroll">
        <table>
          <caption class="visually-hidden">${esc(type)} sources</caption>
          <thead><tr><th scope="col">Id</th><th scope="col">Title</th><th scope="col">Creator</th><th scope="col">Domain</th><th scope="col">Cited by</th></tr></thead>
          <tbody>${items.map((s) => {
            const citing = corpus.rulesBySource.get(s.id) ?? []
            return `
            <tr id="${attr(s.id)}">
              <td class="mono">${esc(s.id)}</td>
              <td class="ink">${linkOrText(s)}${s.note ? `<br><span class="muted t-13">${esc(s.note)}</span>` : ''}</td>
              <td>${esc(s.creator ?? '')}</td>
              <td class="muted">${esc(String(s.domain ?? '').replace(/_/g, ' '))}</td>
              <td>${citing.length ? `<a href="/rules?source=${attr(s.id)}">${citing.length} rule${citing.length === 1 ? '' : 's'}</a>` : '<span class="muted">—</span>'}</td>
            </tr>`
          }).join('')}
          </tbody>
        </table>
      </div>`).join('')}
  `)

  return {
    title: 'Bibliography',
    description: `The ${corpus.sources.length} books, standards, style guides and papers behind the rules — grouped by kind, each listed with the rules that cite it, so any rule can be traced back to what it came from.`,
    path: '/sources',
    body
  }
}

/* -------------------------------------------------------------- glossary -- */

export function glossaryPage () {
  const terms = [...corpus.glossary].sort((a, b) => a.term.localeCompare(b.term))
  const body = wrap(`
    ${pageHead({ eyebrow: 'Reference', title: 'Glossary', lede: `${terms.length} terms, defined as this system uses them.` })}
    <dl class="deflist mt-8">${terms.map((t) => `
      <dt id="${attr(slugify(t.term))}" class="term">${esc(t.term)}</dt>
      <dd>${esc(t.definition)}</dd>`).join('')}
    </dl>
  `)

  return {
    title: 'Glossary',
    description: `${terms.length} terms from the LAKA Volumetric Writing Grammar System, defined as the system uses them.`,
    path: '/glossary',
    body
  }
}

/* ----------------------------------------------------------------- tests -- */

export function testsPage (run) {
  const body = wrap(`
    ${pageHead({
      eyebrow: 'The rules',
      title: 'Test cases',
      lede: `${corpus.tests.length} minimal pairs. Each one names a rule, a before, an after, and the assertion that separates them.`
    })}

    ${run ? `
    <div class="panel">
      <p class="eyebrow">Run against this engine</p>
      <div class="grid grid--3">
        <div class="stat"><span class="stat__value">${run.total}</span><span class="stat__label">Cases</span></div>
        <div class="stat"><span class="stat__value">${run.decidable}</span><span class="stat__label">Decidable from text alone</span></div>
        <div class="stat"><span class="stat__value">${run.needs_facts}</span><span class="stat__label">Need asserted facts</span></div>
      </div>
      <p class="muted tight my-6 t-14">${esc(run.note)}</p>
    </div>` : ''}

    <div class="table-scroll mt-8">
      <table>
        <caption class="visually-hidden">Rule test cases with before and after text</caption>
        <thead><tr><th scope="col">Id</th><th scope="col">Rule</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Assertion</th></tr></thead>
        <tbody>${corpus.tests.map((t) => `
          <tr id="${attr(t.id)}">
            <td class="mono">${esc(t.id)}</td>
            <td><a href="/rules/${attr(t.rule_id)}" class="mono">${esc(t.rule_id)}</a></td>
            <td><code>${esc(t.before)}</code></td>
            <td><code>${esc(t.after)}</code></td>
            <td>${esc(t.assertion)}<br><span class="muted t-13">${esc(t.reason)}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `)

  return {
    title: 'Test cases',
    description: `${corpus.tests.length} minimal pairs that pin down what each rule actually asserts, and how many of them this engine can decide from surface text alone.`,
    path: '/tests',
    body
  }
}

/* ----------------------------------------------------------------- files -- */

export function filesPage () {
  const roles = new Map((corpus.manifest.files ?? []).map((f) => [f.name, f.role]))
  const body = wrap(`
    ${pageHead({
      eyebrow: 'The rules',
      title: 'Source files',
      lede: `All ${corpus.files.length} JSON files, in load order. Every page on this site is rendered from these — nothing is added.`
    })}
    <div class="card"><p class="m-0"><strong class="ink">Start here:</strong></p>
      <ol class="my-3 indent">${(corpus.manifest.start_here ?? []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    </div>
    <div class="table-scroll mt-8">
      <table>
        <caption class="visually-hidden">The source files in load order</caption>
        <thead><tr><th scope="col">#</th><th scope="col">File</th><th scope="col">Role</th><th scope="col">JSON</th></tr></thead>
        <tbody>${corpus.files.map((f) => `
          <tr>
            <td class="mono">${esc(f.num ?? '')}</td>
            <td><a href="/files/${attr(f.slug)}" class="strong-ink">${esc(f.title)}</a><br><span class="mono muted meta-id">${esc(f.filename)}</span></td>
            <td>${esc(roles.get(f.filename) ?? '')}</td>
            <td><a href="/v1/files/${attr(f.slug)}">/v1/files/${esc(f.slug)}</a></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `)

  return {
    title: 'Source files',
    description: `The ${corpus.files.length} JSON files that make up the corpus, in load order, each served verbatim over the API.`,
    path: '/files',
    body
  }
}

export function filePage (entry) {
  const role = (corpus.manifest.files ?? []).find((f) => f.name === entry.filename)?.role
  const rulesHere = corpus.rules.filter((r) => corpus.ruleFileOf.get(r.id) === entry)

  const body = wrap(`
    <p class="eyebrow"><a href="/files">Source files</a></p>
    <h1 class="t-32">${esc(entry.title)}</h1>
    <p class="lede">${esc(role ?? '')}</p>
    <p class="mono muted meta-id">${esc(entry.filename)} · version ${esc(entry.json.version ?? corpus.manifest.version)}</p>

    ${rulesHere.length ? `
      <h2 class="mt-9">The ${rulesHere.length} rules in this file</h2>
      <ol class="rules">${rulesHere.map(ruleRow).join('')}</ol>` : ''}

    <h2 class="mt-9">The file</h2>
    <p class="muted">Served verbatim at <a href="/v1/files/${attr(entry.slug)}">/v1/files/${esc(entry.slug)}</a>.</p>
    ${jsonBlock(entry.json)}
  `)

  return {
    title: entry.title,
    description: `${entry.title}: ${role ?? 'part of the LAKA Volumetric Writing Grammar System'}. Read the file rendered in full, browse the rules defined in it, and fetch the same JSON verbatim over the API.`,
    path: `/files/${entry.slug}`,
    body
  }
}

/* ---------------------------------------------------------------- search -- */

export function searchPage ({ q, results }) {
  const body = wrap(`
    ${pageHead({ eyebrow: 'Reference', title: 'Search' })}
    <form method="get" action="/search" class="panel mt-7">
      <div class="field">
        <label for="q">Search the corpus</label>
        <p class="hint" id="q-hint">Rules, glossary terms, templates, pipelines, sources and files. All words must match.</p>
        <input type="search" id="q" name="q" value="${attr(q ?? '')}" aria-describedby="q-hint">
      </div>
      <button class="pill pill--solid" type="submit" class="mt-4">Search</button>
    </form>

    ${q ? `
      <p class="muted" role="status" class="mt-7">${results.length} result${results.length === 1 ? '' : 's'} for “${esc(q)}”.</p>
      ${results.length ? `<ol class="rules">${results.map((r) => `
        <li><a class="rule" href="${attr(r.href)}">
          <span class="rule__id">${esc(r.type)}</span>
          <span><span class="rule__name">${esc(r.title)}</span><span class="rule__logic">${esc(r.id)}</span></span>
          <span></span>
        </a></li>`).join('')}</ol>` : '<div class="card"><p class="m-0">Nothing matched. Try fewer words.</p></div>'}
    ` : ''}
  `)

  return {
    title: q ? `Search — ${q}` : 'Search',
    description: 'Search the rules, glossary, templates, pipelines and bibliography of the LAKA Volumetric Writing Grammar System.',
    path: '/search',
    body
  }
}

/* ------------------------------------------------------------------- api -- */

export function apiPage () {
  const grouped = new Map()
  for (const e of ENDPOINTS) {
    const key = e.path.startsWith('/v1/analyze') || e.path.startsWith('/v1/evaluate') ||
      e.path.startsWith('/v1/resolve') || e.path.startsWith('/v1/score') ||
      e.path.startsWith('/v1/engine') || e.path.startsWith('/v1/tests/run')
      ? 'Engine'
      : e.path === '/v1' || e.path.startsWith('/v1/health') || e.path.startsWith('/v1/openapi')
        ? 'Meta'
        : 'Corpus'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(e)
  }

  const derivedCount = Object.values(DERIVED_PATHS).flat().filter((p) => p.startsWith('document.') || p.startsWith('paragraph.') || p.startsWith('sentence.') || p.startsWith('series.') || p.startsWith('abbreviation.') || p.startsWith('clause.')).length
  const allPaths = new Set(corpus.rules.flatMap((r) => conditionPaths(r.when)))

  const body = `
  <section class="hero pb-9">
    ${lattice()}
    <div class="wrap hero__content">
      ${pageHead({ eyebrow: 'Reference', title: 'API reference' })}
      <p class="lede mt-6">
        Every endpoint is public, unauthenticated JSON over HTTPS. Read endpoints are cacheable for
        five minutes; the engine endpoints are never cached.
      </p>
      <div class="row mt-7">
        <a class="pill pill--solid" href="/v1/openapi.json">OpenAPI 3.1 document</a>
        <a class="pill" href="/v1">API index</a>
        <a class="pill" href="/llms.txt">Agent guide</a>
      </div>
    </div>
  </section>

  <section>
    <div class="wrap stack">
      <h2>Base URL</h2>
      <pre><code>${esc(ORIGIN)}</code></pre>
      <p class="tight">No key, no rate limit headers, CORS open to any origin. If you are building on this, pin the corpus version — <code>${esc(corpus.manifest.version)}</code> — from <a href="/v1/health">/v1/health</a>.</p>
    </div>
  </section>

  <section>
    <div class="wrap stack">
      <h2>Endpoints</h2>
      ${[...grouped.entries()].map(([group, items]) => `
        <h3 class="mt-7 t-24">${esc(group)}</h3>
        <div class="table-scroll">
          <table>
            <caption class="visually-hidden">${esc(group)} endpoints</caption>
            <thead><tr><th scope="col">Method</th><th scope="col">Path</th><th scope="col">What it returns</th></tr></thead>
            <tbody>${items.map((e) => `
              <tr>
                <td class="mono ink">${esc(e.method)}</td>
                <td class="mono">${e.method === 'GET' && !e.path.includes('{') ? `<a href="${attr(e.path)}">${esc(e.path)}</a>` : esc(e.path)}</td>
                <td>${esc(e.summary)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`).join('')}
    </div>
  </section>

  <section id="evaluate">
    <div class="wrap stack">
      <h2>POST /v1/evaluate</h2>
      <p class="tight">Analyses the text, selects the rules that apply, and evaluates each against every unit of its layer.</p>
      <pre><code>curl -X POST ${esc(ORIGIN)}/v1/evaluate \\
  -H 'content-type: application/json' \\
  -d '{
    "text": "The committee reviewed the report, it was approved without discussion.",
    "profile": "PROFILE-GENERAL",
    "context": { "genre": "report", "stakes": "medium" },
    "facts": { "claim": { "type": "causal" } }
  }'</code></pre>

      <h3 class="t-24 mt-7">What comes back</h3>
      <dl class="deflist">
        <dt>verdict</dt><dd><code>blocked</code> when a hard constraint demands a change, otherwise <code>clear</code>.</dd>
        <dt>blocking</dt><dd>Hard constraints that fired and require an edit.</dd>
        <dt>context_defaults</dt><dd>Apply unless you can name the exception.</dd>
        <dt>ranked_options</dt><dd>Heuristics and creative options — scored, never forced.</dd>
        <dt>checks</dt><dd>Rules asking you to verify or supply context rather than edit.</dd>
        <dt>needs_input</dt><dd>Evaluations the engine refused to guess, with the exact fact paths required.</dd>
        <dt>coverage</dt><dd>How many rules were selected, evaluated, resolved and left open.</dd>
        <dt>test_plan</dt><dd>The regression dimensions and corpus cases to re-check after editing.</dd>
      </dl>
    </div>
  </section>

  <section id="facts">
    <div class="wrap stack">
      <h2>Derived facts versus facts you supply</h2>
      <p class="tight">
        Rule conditions read named facts. The analyser derives ${derivedCount} of them from raw text —
        sentence length, voice, clause counts, readability, punctuation structure. The rules read
        ${allPaths.size} distinct paths in total. The rest are semantic: whether a claim is causal,
        whether evidence is sufficient, what effect a sentence intends.
      </p>
      <div class="panel">
        <p class="eyebrow">The engine does not guess them</p>
        <p class="lead-statement">
          An unresolvable condition returns <code>unknown</code> and the rule is reported under
          <code>needs_input</code> with the path it needs. That is the corpus' own safe-failure clause:
          preserve the text, ask a focused question, do not invent.
        </p>
      </div>
      <p><a href="/v1/engine/facts">See every derived and required path →</a></p>
    </div>
  </section>

  <section id="score">
    <div class="wrap stack">
      <h2>POST /v1/score</h2>
      <p class="tight">Scores you supply, 0–4, against the twelve weighted metrics. Four gate metrics fail the document regardless of the average.</p>
      <pre><code>curl -X POST ${esc(ORIGIN)}/v1/score \\
  -H 'content-type: application/json' \\
  -d '{ "scores": { "accuracy": 3, "clarity": 3, "usability": 2, "evidence": 3, "accessibility": 3, "ethics": 4 } }'</code></pre>
      <p><a href="/metrics">The metric model →</a></p>
    </div>
  </section>

  <section id="resolve">
    <div class="wrap stack">
      <h2>POST /v1/resolve</h2>
      <p class="tight">Which rules govern a context, before you write a word. Returns the active set, the precedence order and the selection policy.</p>
      <pre><code>curl -X POST ${esc(ORIGIN)}/v1/resolve \\
  -H 'content-type: application/json' \\
  -d '{ "profile": "PROFILE-TECH" }'</code></pre>
    </div>
  </section>`

  return {
    title: 'API reference',
    description: `Public JSON API for ${corpus.rules.length} writing rules, a rule engine, composition templates, pipelines and a twelve-metric quality model.`,
    path: '/api',
    body
  }
}

/* --------------------------------------------------------------- privacy -- */

export function privacyPage () {
  const body = wrap(`
    ${pageHead({
      eyebrow: 'Reference',
      title: 'Privacy',
      lede: 'This site collects nothing. That is the whole policy, but here is what it means precisely.'
    })}

    <div class="panel">
      <h2 class="t-24">No cookies, no analytics, no tracking</h2>
      <p class="my-4">
        This site sets no cookies and uses no local storage. There is no analytics tag, no tag
        manager, no advertising pixel and no third-party tracker of any kind. Nothing here needs a
        consent banner because there is nothing to consent to.
      </p>
    </div>

    <h2 class="mt-9">Text you send to the engine</h2>
    <p class="tight">
      Text submitted to the engine — through the form at <a href="/engine">/engine</a> or through
      <code>POST /v1/evaluate</code>, <code>POST /v1/analyze</code> or <code>POST /v1/score</code> —
      is evaluated in memory and returned in the response. It is not written to disk, not stored in
      a database, not logged, and not used to train anything. When the response is sent, it is gone.
    </p>

    <h2 class="mt-9">What the server does record</h2>
    <p class="tight">
      Standard HTTP request logs: timestamp, method, path, status code, response time and the
      requesting IP address. These exist so the service can be operated and debugged. Request
      bodies are not logged.
    </p>

    <h2 class="mt-9">What loads from elsewhere</h2>
    <ul class="stack tight indent">
      <li>The Bow Tie Kreative seal and favicons from <code>designsystem.bowtiekreative.com</code>.</li>
      <li>The Inter typeface from Google Fonts (<code>fonts.googleapis.com</code> and <code>fonts.gstatic.com</code>), which receives your IP address as part of serving the font files.</li>
    </ul>
    <p class="tight muted">Nothing else. A Content-Security-Policy header enforces that list.</p>

    <h2 class="mt-9">Contact</h2>
    <p class="tight">
      This service is operated by <a href="https://bowtiekreative.com">Bow Tie Kreative</a>.
      The source is public at
      <a href="https://github.com/bowtiekreative/writing-system" rel="noopener">github.com/bowtiekreative/writing-system</a>,
      so every claim on this page can be checked against the code.
    </p>
  `)

  return {
    title: 'Privacy',
    description: 'This site sets no cookies, runs no analytics, and does not store the text you send to the engine.',
    path: '/privacy',
    body
  }
}
