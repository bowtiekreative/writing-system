import { corpus, slugify } from '../corpus.js'
import { esc, attr, icon, lattice, ORIGIN } from './layout.js'
import {
  strengthBadge, chip, conditionTree, actionList, ruleRow, jsonBlock, statGrid, renderValue, pageHead
} from './components.js'
import { ENDPOINTS } from '../routes/api.js'
import { conditionPaths } from '../engine/ast.js'
import { DERIVED_PATHS } from '../engine/analyze.js'

const inv = corpus.manifest.inventory ?? {}

// iso.org refuses direct requests, so a hyperlink there is dead for readers and crawlers
// alike. The address is still shown — as text.
const UNLINKABLE_HOSTS = new Set(['www.iso.org', 'iso.org'])

function sourceLink (source) {
  if (!source.url) return ''
  let host = ''
  try { host = new URL(source.url).host } catch { /* not a parseable URL */ }
  if (UNLINKABLE_HOSTS.has(host)) return ` <span class="muted t-13">${esc(source.url)}</span>`
  return ` <a href="${attr(source.url)}" rel="noopener">link</a>`
}

/* ------------------------------------------------------------------ home -- */

export function home () {
  const levels = corpus.firstPrinciples.primitives ?? []

  const body = `
  <section class="hero">
    ${lattice()}
    <div class="wrap hero__content">
      <p class="eyebrow">${esc(corpus.manifest.short_name ?? 'LVWGS')} · version ${esc(corpus.manifest.version)}</p>
      <h1>Writing, taken apart to first principles.</h1>
      <p class="lede mt-7">
        This is a decision system, not a style guide. It breaks writing into eleven levels — from a
        perceivable mark to a governed content system — and states what happens at each level as
        machine-readable logic: if this condition holds, do that; otherwise, do this instead.
      </p>
      <p class="lede muted">
        Every rule is labelled with how hard it binds. Hard constraints must pass or the text is blocked.
        Context defaults apply unless you can name the exception. Heuristics are ranked, never forced.
      </p>
      <div class="actions">
        <a class="pill pill--solid" href="/engine">Run the engine on a text</a>
        <a class="pill" href="/rules">Browse ${corpus.rules.length} rules</a>
        <a class="pill" href="/api">Read the API</a>
      </div>
    </div>
  </section>

  <section>
    <div class="wrap stack">
      <h2>What is in the corpus</h2>
      ${statGrid([
        { value: inv.total_operational_rule_records ?? corpus.rules.length, label: 'Operational rule records' },
        { value: corpus.rules.length, label: 'Base rules' },
        { value: corpus.transformations.length, label: 'LAKA transformation states' },
        { value: corpus.files.length, label: 'Source files' }
      ])}
      <p class="muted" style="font-size:14px;margin-top:var(--space-4)">
        Counts derive from the corpus itself at load time, not from the manifest's declarations.
        Source: the ${corpus.files.length} JSON files served at <a href="/v1/files">/v1/files</a>, version ${esc(corpus.manifest.version)},
        generated ${esc(corpus.manifest.generated_at ?? 'unknown')}.
      </p>
    </div>
  </section>

  <section>
    <div class="wrap stack">
      <p class="eyebrow">The spine</p>
      <h2>Eleven levels, each with one job</h2>
      <p class="tight">
        ${esc(corpus.manifest.architecture?.first_principles ?? '')}
      </p>
      <div class="grid grid--3 mt-7">
        ${levels.map((l) => `
        <article class="card feature">
          <span class="feature__icon">${icon('levels')}</span>
          <div>
            <p class="eyebrow mb-2">Level ${esc(l.level)}</p>
            <h3 style="font-size:22px">${esc(l.id.replace(/_/g, ' '))}</h3>
          </div>
          <p class="m-0"><strong class="ink">${esc(l.formula)}</strong></p>
          <p class="m-0">${esc(l.job)}</p>
          <p class="muted" style="margin:0;font-size:14px">Fails when: ${esc(l.failure)}</p>
        </article>`).join('')}
      </div>
      <p class="mt-7"><a href="/principles">Read the first principles in full →</a></p>
    </div>
  </section>

  <section>
    <div class="wrap stack">
      <p class="eyebrow">How it decides</p>
      <h2>Three ways in</h2>
      <div class="grid grid--3">
        <article class="card feature">
          <span class="feature__icon">${icon('rules')}</span>
          <h3 class="t-24">Look up a rule</h3>
          <p class="m-0">Filter ${corpus.rules.length} rules by domain, layer or how hard they bind. Each one shows its condition tree, both branches, its exceptions, and the sources behind it.</p>
          <p class="m-0"><a href="/rules">Browse the rules →</a></p>
        </article>
        <article class="card feature">
          <span class="feature__icon">${icon('engine')}</span>
          <h3 class="t-24">Run the engine</h3>
          <p class="m-0">Paste a draft. The engine analyses it, selects the rules that apply, evaluates each one, and separates what blocks from what is merely ranked.</p>
          <p class="m-0"><a href="/engine">Open the engine →</a></p>
        </article>
        <article class="card feature">
          <span class="feature__icon">${icon('api')}</span>
          <h3 class="t-24">Call the API</h3>
          <p class="m-0">Every endpoint is public JSON. Read the corpus, resolve a rule set for a context, or evaluate text from your own tooling.</p>
          <p class="m-0"><a href="/api">Read the API reference →</a></p>
        </article>
      </div>
    </div>
  </section>

  <section>
    <div class="wrap">
      <div class="panel stack">
        <p class="eyebrow">Read this before you use it</p>
        <h2 style="max-width:20ch">The system decides how hard a rule binds — not that everything should be plain.</h2>
        <p class="tight">${esc(corpus.manifest.usage_note)}</p>
        <div class="grid grid--2 mt-6">
          ${Object.entries(corpus.engineSpec.strength_behavior ?? {}).map(([k, v]) => `
          <div class="card">
            <p style="margin:0 0 var(--space-3)">${strengthBadge(k)}</p>
            <p class="m-0">${esc(v)}</p>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </section>`

  return {
    title: 'A decision system for writing',
    description: `${corpus.rules.length} machine-readable writing rules across grammar, structure, clarity, narrative, argument, technical writing, copy, accessibility and ethics — with an engine that runs them over your text.`,
    path: '/',
    body,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: corpus.manifest.title,
      version: corpus.manifest.version,
      description: corpus.manifest.purpose,
      url: ORIGIN,
      creator: { '@type': 'Organization', name: 'Bow Tie Kreative', url: 'https://bowtiekreative.com' },
      distribution: { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${ORIGIN}/v1/files` }
    }
  }
}

/* ----------------------------------------------------------------- rules -- */

export function rulesIndex ({ rules, query, limit, offset }) {
  const facetSelect = (name, label, options, selected) => `
    <div class="field">
      <label for="f-${name}">${esc(label)}</label>
      <select id="f-${name}" name="${name}">
        <option value="">All</option>
        ${options.map((o) => `<option value="${attr(o.value)}"${o.value === selected ? ' selected' : ''}>${esc(o.value.replace(/_/g, ' '))} (${o.count})</option>`).join('')}
      </select>
    </div>`

  const total = rules.length
  const page = rules.slice(offset, offset + limit)
  const qs = (patch) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...query, ...patch })) if (v) p.set(k, v)
    return `/rules${p.toString() ? `?${p}` : ''}`
  }

  const body = `
  <section>
    <div class="wrap stack">
      ${pageHead({
        eyebrow: 'The rules',
        title: 'Every rule, and how hard it binds',
        lede: `${corpus.rules.length} base rules across ${corpus.domains.length} domains and ${corpus.layers.length} structural layers. Filter them, then open one to see its condition tree, both branches, its exceptions and its sources.`
      })}

      <form class="panel" method="get" action="/rules" class="mt-8">
        <div class="filters">
          <div class="field">
            <label for="f-q">Search</label>
            <input type="search" id="f-q" name="q" value="${attr(query.q ?? '')}" placeholder="e.g. passive, comma, claim">
          </div>
          ${facetSelect('domain', 'Domain', corpus.domains, query.domain)}
          ${facetSelect('layer', 'Layer', corpus.layers, query.layer)}
          ${facetSelect('strength', 'Strength', corpus.strengths, query.strength)}
          <div class="field">
            <label for="f-submit" class="visually-hidden">Apply filters</label>
            <button class="pill pill--solid" id="f-submit" type="submit">Filter</button>
          </div>
        </div>
      </form>

      <p class="muted" role="status">
        ${total} rule${total === 1 ? '' : 's'} match.
        ${total > limit ? `Showing ${offset + 1}–${Math.min(offset + limit, total)}.` : ''}
        ${Object.values(query).some(Boolean) ? ` <a href="/rules">Clear filters</a>` : ''}
      </p>

      ${page.length
        ? `<ol class="rules">${page.map(ruleRow).join('')}</ol>`
        : `<div class="card"><p class="m-0">No rule matches those filters. <a href="/rules">Clear them</a> and try a broader search.</p></div>`}

      ${total > limit ? `
      <nav class="pager" aria-label="Pagination">
        ${offset > 0 ? `<a class="pill" href="${attr(qs({ offset: String(Math.max(0, offset - limit)) }))}">← Previous</a>` : '<span></span>'}
        <span class="muted">Page ${Math.floor(offset / limit) + 1} of ${Math.ceil(total / limit)}</span>
        ${offset + limit < total ? `<a class="pill" href="${attr(qs({ offset: String(offset + limit) }))}">Next →</a>` : '<span></span>'}
      </nav>` : ''}
    </div>
  </section>`

  const filterDesc = [query.q && `matching “${query.q}”`, query.domain, query.layer, query.strength].filter(Boolean).join(', ')
  return {
    title: filterDesc ? `Rules — ${filterDesc}` : 'All rules',
    description: `Browse and filter the ${corpus.rules.length} base rules of the LAKA Volumetric Writing Grammar System by domain, structural layer and binding strength.`,
    path: '/rules',
    body
  }
}

export function ruleDetail (rule) {
  const file = corpus.ruleFileOf.get(rule.id)
  const tests = corpus.testsByRule.get(rule.id) ?? []
  const sources = (rule.source_ids ?? []).map((id) => corpus.sourcesById.get(id)).filter(Boolean)
  const facts = conditionPaths(rule.when)
  const derived = new Set(Object.values(DERIVED_PATHS).flat())
  const siblings = corpus.rules.filter((r) => r.domain === rule.domain && r.id !== rule.id).slice(0, 8)

  const body = `
  <section>
    <div class="wrap stack">
      <p class="eyebrow"><a href="/rules">Rules</a> / <a href="/rules?domain=${attr(rule.domain)}">${esc(rule.domain.replace(/_/g, ' '))}</a></p>
      <div class="row row--baseline">
        <span class="mono muted" style="font-size:15px">${esc(rule.id)}</span>
        ${strengthBadge(rule.strength)}
        ${chip(`layer: ${rule.layer}`)}
      </div>
      <h1 style="font-size:clamp(32px,5vw,56px);margin-top:var(--space-4)">${esc(rule.name)}</h1>
      <p class="lede">${esc(rule.human_logic)}</p>

      <div class="panel">
        <p class="eyebrow">Why the rule exists</p>
        <p class="lead-statement">${esc(rule.because)}</p>
      </div>

      <h2 class="mt-9">Condition</h2>
      <p class="tight muted">The rule fires when this evaluates true. Paths marked below must be present in the fact base; the engine reports the rest rather than guessing them.</p>
      <div class="card">${conditionTree(rule.when)}</div>

      ${facts.length ? `
      <h3 style="font-size:20px;margin-top:var(--space-7)">Facts this rule reads</h3>
      <div class="table-scroll">
        <table>
          <caption class="visually-hidden">Fact paths read by ${esc(rule.id)} and whether the analyser derives them</caption>
          <thead><tr><th scope="col">Path</th><th scope="col">Source</th></tr></thead>
          <tbody>${facts.map((f) => `
            <tr>
              <td><code>${esc(f)}</code></td>
              <td>${derived.has(f)
                ? '<span class="badge badge--heuristic" data-mark="~">Derived from text</span>'
                : '<span class="badge" data-mark="?">You supply it</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <div class="grid grid--2 mt-9">
        <div class="card">
          <h2 style="font-size:22px;margin-bottom:var(--space-4)">Then</h2>
          ${actionList(rule.then)}
        </div>
        <div class="card">
          <h2 style="font-size:22px;margin-bottom:var(--space-4)">Else</h2>
          ${actionList(rule.else)}
        </div>
      </div>

      ${(rule.unless ?? []).length ? `
      <h2 class="mt-9">Unless</h2>
      <p class="tight muted">Documented exceptions. Any one of these suppresses the rule.</p>
      ${rule.unless.map((u) => `<div class="card">${conditionTree(u)}</div>`).join('')}` : ''}

      ${(rule.diagnostics ?? []).length ? `
      <h2 class="mt-9">Diagnostics</h2>
      <ul class="stack indent">${rule.diagnostics.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}

      ${tests.length ? `
      <h2 class="mt-9">Test cases</h2>
      ${tests.map((t) => `
      <div class="card" style="margin-bottom:var(--space-4)">
        <p class="eyebrow" style="margin-bottom:var(--space-4)">${esc(t.id)} · ${esc(t.assertion)}</p>
        <dl class="deflist">
          <dt>Before</dt><dd><code>${esc(t.before)}</code></dd>
          <dt>After</dt><dd><code>${esc(t.after)}</code></dd>
          <dt>Reason</dt><dd>${esc(t.reason)}</dd>
        </dl>
      </div>`).join('')}` : ''}

      ${rule.laka ? `
      <h2 class="mt-9">LAKA</h2>
      <div class="card">
        <dl class="deflist">
          <dt>Smallest sufficient intervention</dt><dd>${rule.laka.smallest_sufficient_intervention ? 'Yes' : 'No'}</dd>
          <dt>Primary axes</dt><dd><ul class="chips">${(rule.laka.primary_axes ?? []).map((a) => `<li><a href="/laka#${attr(a)}" style="text-decoration:none">${chip(a)}</a></li>`).join('')}</ul></dd>
        </dl>
      </div>` : ''}

      ${sources.length ? `
      <h2 class="mt-9">Sources</h2>
      <ul class="stack indent">${sources.map((s) => `
        <li>
          <strong class="ink">${esc(s.title)}</strong>${s.creator ? ` — ${esc(s.creator)}` : ''}
          ${sourceLink(s)}
          ${s.note ? `<br><span class="muted">${esc(s.note)}</span>` : ''}
        </li>`).join('')}</ul>` : ''}

      <details class="disclose mt-9">
        <summary>The raw rule record</summary>
        <div>
          <p class="muted t-14">Verbatim from <code>${esc(file?.filename ?? 'the corpus')}</code>. Also available at <a href="/v1/rules/${attr(rule.id)}">/v1/rules/${esc(rule.id)}</a>.</p>
          ${jsonBlock(rule)}
        </div>
      </details>

      ${siblings.length ? `
      <h2 class="mt-9">Other ${esc(rule.domain.replace(/_/g, ' '))} rules</h2>
      <ol class="rules">${siblings.map(ruleRow).join('')}</ol>` : ''}
    </div>
  </section>`

  return {
    title: `${rule.id} — ${rule.name}`,
    description: rule.human_logic.slice(0, 300),
    path: `/rules/${rule.id}`,
    body,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: `${rule.id} — ${rule.name}`,
      description: rule.human_logic,
      url: `${ORIGIN}/rules/${rule.id}`,
      isPartOf: { '@type': 'Dataset', name: corpus.manifest.title, url: ORIGIN }
    }
  }
}

/* ---------------------------------------------------------------- engine -- */

export function enginePage ({ submitted, result, form, error }) {
  const profiles = corpus.profiles
  const axes = corpus.axes.axes ?? {}

  // The context selects offer exactly the values 03-context-axes.json declares — no invented options.
  const axisSelect = (axis, label, selected) => {
    const values = Array.isArray(axes[axis]) ? axes[axis] : []
    if (!values.length) return ''
    return `
          <div class="field">
            <label for="${attr(axis)}">${esc(label)}</label>
            <select id="${attr(axis)}" name="${attr(axis)}">
              <option value="">Not stated</option>
              ${values.map((v) => `<option value="${attr(v)}"${selected === v ? ' selected' : ''}>${esc(String(v).replace(/_/g, ' '))}</option>`).join('')}
            </select>
          </div>`
  }

  const sample = 'The committee reviewed the report, it was approved without discussion. There is a requirement that the implementation of the recommendations be considered. We tested the API, the UI, and the docs.'

  const findings = (items, heading, note) => {
    if (!items?.length) return ''
    return `
      <h3 style="margin-top:var(--space-8);font-size:24px">${esc(heading)} <span class="muted" style="font-size:16px;font-weight:400">(${items.length})</span></h3>
      ${note ? `<p class="muted tight t-14">${esc(note)}</p>` : ''}
      ${items.map((f) => `
      <div class="finding">
        <div class="finding__head">
          <a href="/rules/${attr(f.rule_id)}" class="mono t-13">${esc(f.rule_id)}</a>
          ${strengthBadge(f.strength)}
          ${chip(f.domain.replace(/_/g, ' '))}
          ${f.occurrences > 1 ? chip(`${f.occurrences}×`) : ''}
        </div>
        <h4>${esc(f.name)}</h4>
        <p style="margin:var(--space-2) 0 0">${esc(f.human_logic)}</p>
        <p class="muted" style="margin:var(--space-2) 0 0;font-size:14px">${esc(f.because)}</p>
        <p style="margin:var(--space-3) 0 0;font-size:14px"><strong class="ink">Do:</strong> ${(f.actions ?? []).map((a) => esc(a.action)).join(', ') || '—'}</p>
        ${f.units?.length ? `<ul class="finding__units">${f.units.map((u) => `<li>${esc(u.type)} ${u.index + 1}: “${esc(u.excerpt)}”</li>`).join('')}</ul>` : ''}
      </div>`).join('')}`
  }

  const results = !result ? '' : `
    <section id="result">
      <div class="wrap stack">
        <h2>Result</h2>
        <div class="verdict verdict--${result.verdict === 'blocked' ? 'blocked' : 'clear'}">
          <span class="verdict__mark" aria-hidden="true">${result.verdict === 'blocked' ? '!' : '✓'}</span>
          <div>
            <p style="margin:0;font-size:20px;color:var(--rp-heading);font-weight:600">
              ${result.verdict === 'blocked'
                ? `Blocked — ${result.blocking.length} hard constraint${result.blocking.length === 1 ? '' : 's'} demand a change`
                : 'Clear — no hard constraint demands a change'}
            </p>
            <p class="muted" style="margin:var(--space-1) 0 0;font-size:14px">
              ${result.coverage.rules_selected} rules selected · ${result.coverage.evaluations} evaluations ·
              ${result.coverage.resolved} resolved · ${result.coverage.unresolved} awaiting facts ·
              ${result.engine.evaluated_in_ms} ms
            </p>
          </div>
        </div>

        ${statGrid([
          { value: result.text_model.document.word_count, label: 'Words' },
          { value: result.text_model.document.sentence_count, label: 'Sentences' },
          { value: `${Math.round(result.text_model.document.passive_ratio * 100)}%`, label: 'Passive sentences' },
          { value: result.text_model.document.reading_grade_fk ?? '—', label: 'Reading grade (F–K)' }
        ])}

        ${findings(result.blocking, 'Blocking', 'Hard constraints that fired and demand a change to the text. These must pass.')}
        ${findings(result.context_defaults, 'Context defaults', 'Apply these unless you can name the exception that improves the intended outcome.')}
        ${findings(result.ranked_options, 'Ranked options', 'Heuristics and creative options. Scored and offered — never forced.')}
        ${findings(result.checks, 'Checks and prompts', 'Rules that ask you to verify something or supply context rather than edit the text.')}

        ${result.needs_input.count ? `
        <details class="disclose mt-8">
          <summary>${result.needs_input.count} evaluations are waiting on facts</summary>
          <div>
            <p class="tight">${esc(result.coverage.note)}</p>
            <div class="table-scroll">
              <table>
                <caption class="visually-hidden">Fact paths the engine could not resolve</caption>
                <thead><tr><th scope="col">Fact path</th><th scope="col">Rules waiting</th></tr></thead>
                <tbody>${result.needs_input.paths.slice(0, 30).map((p) => `
                  <tr><td><code>${esc(p.path)}</code></td><td>${p.rules_waiting}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
            <p class="muted" style="font-size:14px;margin-top:var(--space-4)">Send these under <code>facts</code> on <code>POST /v1/evaluate</code> to resolve them.</p>
          </div>
        </details>` : ''}

        <details class="disclose mt-5">
          <summary>The full JSON response</summary>
          <div>
            <p class="muted t-14">The same payload <code>POST /v1/evaluate</code> returns.</p>
            ${jsonBlock(result)}
          </div>
        </details>
      </div>
    </section>`

  const body = `
  <section class="hero pb-9">
    ${lattice()}
    <div class="wrap hero__content">
      ${pageHead({ eyebrow: 'The engine', title: 'Run the rules over a text' })}
      <p class="lede mt-6">
        The engine analyses your text, selects the rules whose layer and domain apply, and evaluates
        each one against every sentence, paragraph or document it governs. It separates what blocks
        from what is merely ranked — and tells you which rules it could not decide, instead of guessing.
      </p>
    </div>
  </section>

  <section>
    <div class="wrap">
      <form class="panel stack" method="post" action="/engine#result">
        ${error ? `<p class="verdict verdict--blocked" role="alert"><span class="verdict__mark" aria-hidden="true">!</span> ${esc(error)}</p>` : ''}
        <div class="field">
          <label for="text">Your text</label>
          <p class="hint" id="text-hint">Paste a draft. Blank lines separate paragraphs.</p>
          <textarea id="text" name="text" aria-describedby="text-hint" required>${esc(form.text ?? '')}</textarea>
        </div>
        <div class="filters">
          <div class="field">
            <label for="profile">Application profile</label>
            <select id="profile" name="profile">
              <option value="">No profile — all domains</option>
              ${profiles.map((p) => `<option value="${attr(p.id)}"${form.profile === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>
          </div>
          ${axisSelect('genre', 'Genre', form.genre)}
          ${axisSelect('audience_role', 'Audience role', form.audience_role)}
          ${axisSelect('stakes', 'Stakes', form.stakes)}
          ${axisSelect('purpose', 'Purpose', form.purpose)}
          ${axisSelect('reading_condition', 'Reading condition', form.reading_condition)}
        </div>
        <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;align-items:center">
          <button class="pill pill--solid" type="submit">Evaluate</button>
          <button class="pill" type="submit" name="sample" value="1">Use the sample text</button>
        </div>
        <p class="muted" style="font-size:14px;margin:0">
          Nothing is stored. The evaluation runs on the server and the response is not cached.
        </p>
      </form>
    </div>
  </section>

  ${results}

  <section>
    <div class="wrap stack">
      <h2>The same thing over HTTP</h2>
      <pre><code>curl -X POST ${esc(ORIGIN)}/v1/evaluate \\
  -H 'content-type: application/json' \\
  -d '{
    "text": ${esc(JSON.stringify(sample.slice(0, 70) + '…'))},
    "profile": "PROFILE-GENERAL",
    "context": { "genre": "report", "stakes": "medium" }
  }'</code></pre>
      <p><a href="/api#evaluate">Full request and response shape →</a></p>
    </div>
  </section>`

  return {
    title: 'Run the engine',
    description: 'Evaluate a text against the LAKA writing rules. The engine separates hard constraints from ranked options, and reports what it could not decide rather than guessing.',
    path: '/engine',
    body
  }
}

/* ------------------------------------------------------------ simple pages */

export function principles () {
  const fp = corpus.firstPrinciples
  const body = `
  <section>
    <div class="wrap stack">
      ${pageHead({ eyebrow: 'The model', title: esc(fp.title ?? 'First principles') })}
      <div class="panel">
        <p class="eyebrow">The zero rule</p>
        <p style="margin:0;font-size:clamp(20px,2.6vw,28px);line-height:1.35;color:var(--rp-heading)">${esc(fp.zero_rule)}</p>
      </div>
      <div class="card">
        <p class="eyebrow">Core equation</p>
        <p class="mono" style="margin:0;font-size:16px;color:var(--rp-heading)">${esc(fp.core_equation)}</p>
      </div>

      <h2 class="mt-9">The eleven levels</h2>
      <div class="table-scroll">
        <table>
          <caption class="visually-hidden">The eleven levels of writing, their formula, job and failure mode</caption>
          <thead><tr><th scope="col">Level</th><th scope="col">Unit</th><th scope="col">Formula</th><th scope="col">Job</th><th scope="col">Failure</th></tr></thead>
          <tbody>${(fp.primitives ?? []).map((p) => `
            <tr>
              <td class="mono">${esc(p.level)}</td>
              <td class="strong-ink">${esc(p.id.replace(/_/g, ' '))}</td>
              <td class="mono">${esc(p.formula)}</td>
              <td>${esc(p.job)}</td>
              <td class="muted">${esc(p.failure)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <h2 class="mt-9">Conservation rules</h2>
      <p class="tight muted">What must survive any edit.</p>
      <ol class="steps">${(fp.conservation_rules ?? []).map((c) => `
        <li><div><p class="m-0"><span class="mono muted meta-id">${esc(c.id)}</span></p><p style="margin:var(--space-1) 0 0;color:var(--rp-heading)">${esc(c.rule)}</p></div></li>`).join('')}</ol>

      <h2 class="mt-9">Universal operations</h2>
      <div class="grid grid--3">${(fp.universal_operations ?? []).map((o) => `
        <div class="card">
          <p class="eyebrow mb-2">${esc(o.id.replace(/_/g, ' '))}</p>
          <p class="m-0">${esc(o.question)}</p>
        </div>`).join('')}</div>

      <h2 class="mt-9">Composition formulas</h2>
      <p class="tight muted">What each kind of piece is made of, at the level above the sentence.</p>
      <div class="table-scroll">
        <table>
          <caption class="visually-hidden">Composition formulas by kind of writing</caption>
          <thead><tr><th scope="col">Kind</th><th scope="col">Formula</th></tr></thead>
          <tbody>${Object.entries(fp.composition_formulas ?? {}).map(([k, v]) => `
            <tr>
              <td style="color:var(--rp-heading);font-weight:600;white-space:nowrap">${esc(k.replace(/_/g, ' '))}</td>
              <td class="mono">${esc(v)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </section>`

  return {
    title: 'First principles',
    description: 'The eleven levels of writing, from signal to content system — each with its formula, its job, and the way it fails.',
    path: '/principles',
    body
  }
}

export function lakaGrid () {
  const g = corpus.grid
  const byAxis = new Map()
  for (const t of corpus.transformations) {
    if (!byAxis.has(t.axis)) byAxis.set(t.axis, [])
    byAxis.get(t.axis).push(t)
  }

  const body = `
  <section class="hero pb-9">
    ${lattice()}
    <div class="wrap hero__content">
      ${pageHead({ eyebrow: 'The model', title: 'The LAKA volumetric grid' })}
      <p class="lede mt-6">${esc(g.purpose)}</p>
      <p class="lede muted">${esc(corpus.manifest.architecture?.LAKA ?? '')}</p>
    </div>
  </section>

  <section>
    <div class="wrap stack">
      <h2>A volumetric address</h2>
      <div class="card"><p class="mono" style="margin:0;color:var(--rp-heading);font-size:15px">${esc(g.volumetric_address)}</p></div>
      <div class="panel">
        <p class="eyebrow">Outcome separation</p>
        <p class="lead-statement">${esc(g.outcome_separation)}</p>
      </div>
    </div>
  </section>

  <section>
    <div class="wrap stack">
      <h2>Fourteen dynamics, four states each</h2>
      <p class="tight muted">Each axis asks one question and answers it in four states. ${corpus.transformations.length} state rules in total, plus ${corpus.crossAxis.length} cross-axis rules.</p>
      ${[...byAxis.entries()].map(([axis, states]) => `
      <article class="panel" id="${attr(axis)}" class="mt-6">
        <h3>${esc(axis.replace(/_/g, ' '))}</h3>
        <p class="muted" style="margin-top:var(--space-2)">${esc(states[0]?.key_question ?? (g.transformation_dynamics ?? []).find((d) => d.id === axis)?.key_question ?? '')}</p>
        <div class="table-scroll mt-5">
          <table>
            <caption class="visually-hidden">States of the ${esc(axis)} axis</caption>
            <thead><tr><th scope="col">Code</th><th scope="col">State</th><th scope="col">In writing</th><th scope="col">Evaluate by</th></tr></thead>
            <tbody>${states.map((s) => `
              <tr id="${attr(s.id)}">
                <td class="mono ink">${esc(s.code ?? '')}</td>
                <td style="white-space:nowrap">${esc(s.state ?? '')}</td>
                <td>${esc(s.writing_application ?? '')}</td>
                <td class="muted">${esc(s.evaluation ?? '')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </article>`).join('')}
    </div>
  </section>

  <section>
    <div class="wrap stack">
      <h2>Cross-axis rules</h2>
      <p class="tight muted">Where two axes interact, these decide.</p>
      ${corpus.crossAxis.map((r) => `
      <div class="card">
        <p class="mono muted" style="font-size:13px;margin:0 0 var(--space-3)">${esc(r.id)}</p>
        <div class="grid grid--2">
          <div><p class="eyebrow mb-2">If</p>${conditionTree(r.if)}</div>
          <div>
            <p class="eyebrow mb-2">Then</p>${renderValue(r.then)}
            <p class="eyebrow" style="margin:var(--space-4) 0 var(--space-2)">Else</p>${renderValue(r.else)}
          </div>
        </div>
      </div>`).join('')}

      <h2 class="mt-9">Diagnostic protocol</h2>
      <ol class="steps">${(g.diagnostic_protocol ?? []).map((s) => `<li><div>${renderValue(s)}</div></li>`).join('')}</ol>
    </div>
  </section>`

  return {
    title: 'The LAKA grid',
    description: 'Six interrogatives, six relational modifiers and six scales, plus fourteen transformation dynamics in four states each — the coordinate system for diagnosing and changing a text.',
    path: '/laka',
    body
  }
}

/** A generic page that renders one corpus file as readable HTML. */
export function dataPage ({ eyebrow, title, lede, path, sections, description, jsonHref }) {
  const body = `
  <section>
    <div class="wrap stack">
      ${pageHead({ eyebrow, title, lede })}
      ${sections}
      ${jsonHref ? `<p class="mt-9 muted">Machine-readable: <a href="${attr(jsonHref)}">${esc(jsonHref)}</a></p>` : ''}
    </div>
  </section>`
  return { title, description, path, body }
}
