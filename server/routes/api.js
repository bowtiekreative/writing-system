/**
 * The /v1 JSON API.
 *
 * Read endpoints expose the corpus; the POST endpoints run the engine. Everything is
 * public and cacheable — the corpus is a static, versioned body of rules.
 */

import { corpus, slugify } from '../corpus.js'
import { evaluate, resolveRules, runCorpusTests } from '../engine/evaluate.js'
import { analyze, DERIVED_PATHS } from '../engine/analyze.js'
import { score } from '../engine/score.js'
import { conditionPaths } from '../engine/ast.js'
import { buildOpenApi } from '../openapi.js'

const CACHE = 'public, max-age=300, stale-while-revalidate=86400'

const list = (arr, { limit, offset }) => ({
  count: arr.length,
  limit,
  offset,
  results: arr.slice(offset, offset + limit)
})

function paging (q) {
  const limit = Math.min(Math.max(parseInt(q.limit ?? '50', 10) || 50, 1), 500)
  const offset = Math.max(parseInt(q.offset ?? '0', 10) || 0, 0)
  return { limit, offset }
}

const csv = (v) => (v == null || v === '' ? null : String(v).split(',').map((s) => s.trim()).filter(Boolean))

/** Shared rule filter used by both the API and the site. */
export function filterRules (q = {}) {
  const domains = csv(q.domain)
  const layers = csv(q.layer)
  const strengths = csv(q.strength)
  const ids = csv(q.id)
  const query = (q.q ?? '').trim().toLowerCase()
  const source = q.source ? String(q.source).trim() : null
  const axis = q.axis ? String(q.axis).trim() : null

  return corpus.rules.filter((r) => {
    if (domains && !domains.includes(r.domain)) return false
    if (layers && !layers.includes(r.layer)) return false
    if (strengths && !strengths.includes(r.strength)) return false
    if (ids && !ids.includes(r.id)) return false
    if (source && !(r.source_ids ?? []).includes(source)) return false
    if (axis && !(r.laka?.primary_axes ?? []).includes(axis)) return false
    if (query) {
      const hay = `${r.id} ${r.name} ${r.human_logic} ${r.because} ${(r.diagnostics ?? []).join(' ')}`.toLowerCase()
      if (!hay.includes(query)) return false
    }
    return true
  })
}

/** A rule with everything the corpus knows related to it. */
export function expandRule (rule) {
  const file = corpus.ruleFileOf.get(rule.id)
  return {
    ...rule,
    requires_facts: conditionPaths(rule.when),
    tests: corpus.testsByRule.get(rule.id) ?? [],
    sources: (rule.source_ids ?? []).map((id) => corpus.sourcesById.get(id) ?? { id, unresolved: true }),
    defined_in: file ? { file: file.filename, title: file.title, slug: file.slug } : null
  }
}

export function search (query, { limit = 25, types = null } = {}) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return []
  const wanted = types ? new Set(types) : null
  const terms = q.split(/\s+/)
  return corpus.searchIndex
    .filter((e) => (!wanted || wanted.has(e.type)) && terms.every((t) => e.hay.includes(t)))
    .map((e) => ({
      type: e.type,
      id: e.id,
      title: e.title,
      href: e.href,
      // Rank: an id or title hit beats a body hit.
      rank: (e.id.toLowerCase().includes(q) ? 0 : 10) + (e.title.toLowerCase().includes(q) ? 0 : 5) + e.hay.indexOf(q) / 1e6
    }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ rank, ...rest }) => rest)
}

export default async function apiRoutes (app) {
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.method === 'GET' && !reply.getHeader('cache-control')) reply.header('cache-control', CACHE)
    return payload
  })

  // ---- index, health, spec -------------------------------------------------
  app.get('/v1', async () => ({
    service: 'laka-writing-system-api',
    title: corpus.manifest.title,
    version: corpus.manifest.version,
    documentation: 'https://writingsystem.bowtiekreative.com/',
    agent_guide: 'https://writingsystem.bowtiekreative.com/llms.txt',
    openapi: 'https://writingsystem.bowtiekreative.com/v1/openapi.json',
    design_system: 'https://api.designsystem.bowtiekreative.com/v1',
    inventory: corpus.manifest.inventory,
    endpoints: ENDPOINTS,
    usage_note: corpus.manifest.usage_note,
    copyright_note: corpus.manifest.copyright_note
  }))

  app.get('/v1/health', async () => ({
    status: 'ok',
    version: corpus.manifest.version,
    files: corpus.files.length,
    rules: corpus.rules.length,
    transformation_rules: corpus.transformations.length,
    uptime_s: Math.round(process.uptime())
  }))

  app.get('/v1/openapi.json', async () => buildOpenApi())

  // ---- corpus ---------------------------------------------------------------
  app.get('/v1/manifest', async () => corpus.manifest)

  app.get('/v1/files', async () => ({
    count: corpus.files.length,
    load_order: corpus.manifest.load_order ?? [],
    results: corpus.files.map((f) => ({
      number: f.num, slug: f.slug, filename: f.filename, title: f.title,
      role: (corpus.manifest.files ?? []).find((x) => x.name === f.filename)?.role ?? null,
      href: `/v1/files/${f.slug}`
    }))
  }))

  app.get('/v1/files/:slug', async (req, reply) => {
    const key = String(req.params.slug).replace(/\.json$/, '')
    const entry = corpus.bySlug.get(key) ?? corpus.byNum.get(key) ?? corpus.raw.get(key)
    if (!entry) return reply.code(404).send({ error: 'not_found', slug: key })
    return entry.json
  })

  app.get('/v1/principles', async () => corpus.firstPrinciples)
  app.get('/v1/primitives', async () => corpus.primitives)
  app.get('/v1/grid', async () => corpus.grid)
  app.get('/v1/axes', async () => corpus.axes)
  app.get('/v1/operators', async () => corpus.operators)
  app.get('/v1/schema', async () => corpus.ruleSchema)
  app.get('/v1/engine-spec', async () => corpus.engineSpec)

  // ---- rules ----------------------------------------------------------------
  app.get('/v1/rules', async (req) => {
    const { limit, offset } = paging(req.query)
    const rules = filterRules(req.query)
    const expand = req.query.expand === 'true' || req.query.expand === '1'
    const page = rules.slice(offset, offset + limit)
    return {
      count: rules.length,
      limit,
      offset,
      facets: { domain: corpus.domains, layer: corpus.layers, strength: corpus.strengths },
      results: page.map((r) => (expand
        ? expandRule(r)
        : {
            id: r.id, name: r.name, domain: r.domain, layer: r.layer, strength: r.strength,
            human_logic: r.human_logic, href: `/v1/rules/${r.id}`
          }))
    }
  })

  app.get('/v1/rules/:id', async (req, reply) => {
    const rule = corpus.rulesById.get(String(req.params.id).toUpperCase())
    if (!rule) return reply.code(404).send({ error: 'not_found', id: req.params.id })
    return expandRule(rule)
  })

  app.get('/v1/domains', async () => ({
    count: corpus.domains.length,
    results: corpus.domains.map((d) => ({ ...d, href: `/v1/rules?domain=${d.value}` }))
  }))
  app.get('/v1/layers', async () => ({ count: corpus.layers.length, results: corpus.layers }))
  app.get('/v1/strengths', async () => ({
    count: corpus.strengths.length,
    behavior: corpus.engineSpec.strength_behavior ?? {},
    results: corpus.strengths
  }))

  // ---- LAKA grid ------------------------------------------------------------
  app.get('/v1/transformations', async (req) => {
    const { limit, offset } = paging({ limit: req.query.limit ?? '100', offset: req.query.offset })
    const axis = req.query.axis ? String(req.query.axis) : null
    const rows = axis ? corpus.transformations.filter((t) => t.axis === axis) : corpus.transformations
    return { ...list(rows, { limit, offset }), cross_axis_rules: corpus.crossAxis }
  })

  app.get('/v1/transformations/:id', async (req, reply) => {
    const t = corpus.transformationsById.get(String(req.params.id))
    if (!t) return reply.code(404).send({ error: 'not_found', id: req.params.id })
    return t
  })

  // ---- collections ----------------------------------------------------------
  const collection = (path, rows, keyFn = (x) => x.id) => {
    app.get(`/v1/${path}`, async (req) => list(rows, paging(req.query)))
    app.get(`/v1/${path}/:id`, async (req, reply) => {
      const wanted = String(req.params.id)
      const found = rows.find((r) => String(keyFn(r)) === wanted || slugify(keyFn(r)) === slugify(wanted))
      if (!found) return reply.code(404).send({ error: 'not_found', id: wanted })
      return found
    })
  }
  collection('templates', corpus.templates)
  collection('pipelines', corpus.pipelines)
  collection('profiles', corpus.profiles)
  collection('recipes', corpus.recipes)
  collection('tests', corpus.tests)
  collection('sources', corpus.sources)
  collection('glossary', corpus.glossary, (t) => t.term)

  app.get('/v1/metrics', async () => corpus.qualityModel)

  // ---- search ---------------------------------------------------------------
  app.get('/v1/search', async (req) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '25', 10) || 25, 1), 200)
    const results = search(req.query.q, { limit, types: csv(req.query.type) })
    return { query: req.query.q ?? '', count: results.length, results }
  })

  // ---- graph ----------------------------------------------------------------
  app.get('/v1/graph', async () => {
    const nodes = [
      ...corpus.domains.map((d) => ({ id: `domain:${d.value}`, type: 'domain', label: d.value, weight: d.count })),
      ...corpus.rules.map((r) => ({ id: `rule:${r.id}`, type: 'rule', label: r.name, strength: r.strength, layer: r.layer })),
      ...corpus.sources.map((s) => ({ id: `source:${s.id}`, type: 'source', label: s.title, kind: s.type }))
    ]
    const edges = []
    for (const r of corpus.rules) {
      edges.push({ from: `rule:${r.id}`, to: `domain:${r.domain}`, rel: 'in_domain' })
      for (const sid of r.source_ids ?? []) edges.push({ from: `rule:${r.id}`, to: `source:${sid}`, rel: 'cites' })
    }
    return { node_count: nodes.length, edge_count: edges.length, nodes, edges }
  })

  app.get('/v1/backlinks/:id', async (req, reply) => {
    const id = String(req.params.id)
    const asSource = corpus.rulesBySource.get(id)
    if (asSource) {
      return { id, kind: 'source', cited_by: asSource, count: asSource.length, source: corpus.sourcesById.get(id) ?? null }
    }
    const rule = corpus.rulesById.get(id.toUpperCase())
    if (rule) {
      return {
        id: rule.id,
        kind: 'rule',
        cites: rule.source_ids ?? [],
        tested_by: (corpus.testsByRule.get(rule.id) ?? []).map((t) => t.id),
        shares_domain_with: corpus.rules.filter((r) => r.domain === rule.domain && r.id !== rule.id).map((r) => r.id),
        shares_layer_with: corpus.rules.filter((r) => r.layer === rule.layer && r.id !== rule.id).map((r) => r.id).slice(0, 50)
      }
    }
    return reply.code(404).send({ error: 'not_found', id })
  })

  // ---- engine ---------------------------------------------------------------
  app.get('/v1/engine/facts', async () => ({
    note: 'Paths the analyser derives from raw text. Everything else a rule reads must be supplied under `facts` on POST /v1/evaluate, or the rule reports as needs_input rather than being guessed.',
    derived: DERIVED_PATHS,
    derived_count: Object.values(DERIVED_PATHS).flat().length,
    all_paths_read_by_rules: [...new Set(corpus.rules.flatMap((r) => conditionPaths(r.when)))].sort(),
    safe_failure: corpus.engineSpec.safe_failure ?? null
  }))

  app.post('/v1/analyze', async (req, reply) => {
    const body = req.body ?? {}
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return reply.code(400).send({ error: 'bad_request', message: '`text` is required and must be a non-empty string.' })
    }
    reply.header('cache-control', 'no-store')
    return analyze(body.text, { context: body.context ?? {} })
  })

  app.post('/v1/evaluate', async (req, reply) => {
    const body = req.body ?? {}
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return reply.code(400).send({ error: 'bad_request', message: '`text` is required and must be a non-empty string.' })
    }
    if (body.text.length > 200_000) {
      return reply.code(413).send({ error: 'payload_too_large', message: '`text` is limited to 200,000 characters.' })
    }
    reply.header('cache-control', 'no-store')
    return evaluate(body)
  })

  app.post('/v1/resolve', async (req, reply) => {
    reply.header('cache-control', 'no-store')
    return resolveRules(req.body ?? {})
  })

  app.post('/v1/score', async (req, reply) => {
    reply.header('cache-control', 'no-store')
    return score(req.body ?? {})
  })

  app.get('/v1/tests/run', async (req, reply) => {
    reply.header('cache-control', CACHE)
    return runCorpusTests()
  })
}

export const ENDPOINTS = [
  { method: 'GET', path: '/v1', summary: 'This index' },
  { method: 'GET', path: '/v1/health', summary: 'Liveness and corpus counts' },
  { method: 'GET', path: '/v1/openapi.json', summary: 'OpenAPI 3.1 description of this API' },
  { method: 'GET', path: '/v1/manifest', summary: 'Corpus manifest, inventory and load order' },
  { method: 'GET', path: '/v1/files', summary: 'The 30 source files' },
  { method: 'GET', path: '/v1/files/{slug}', summary: 'One source file, verbatim' },
  { method: 'GET', path: '/v1/principles', summary: 'Writing from first principles — the eleven levels' },
  { method: 'GET', path: '/v1/primitives', summary: 'Machine-readable linguistic primitives' },
  { method: 'GET', path: '/v1/grid', summary: 'The LAKA volumetric writing grid' },
  { method: 'GET', path: '/v1/axes', summary: 'Rhetorical and production context axes' },
  { method: 'GET', path: '/v1/operators', summary: 'Boolean and decision logic' },
  { method: 'GET', path: '/v1/schema', summary: 'JSON Schema for a rule record' },
  { method: 'GET', path: '/v1/engine-spec', summary: 'The reference rule engine specification' },
  { method: 'GET', path: '/v1/rules', summary: 'Search and filter the 228 base rules' },
  { method: 'GET', path: '/v1/rules/{id}', summary: 'One rule with its tests, sources and required facts' },
  { method: 'GET', path: '/v1/domains', summary: 'Rule counts by domain' },
  { method: 'GET', path: '/v1/layers', summary: 'Rule counts by layer' },
  { method: 'GET', path: '/v1/strengths', summary: 'Rule counts by strength, and what each strength binds' },
  { method: 'GET', path: '/v1/transformations', summary: 'The 56 LAKA transformation-state rules' },
  { method: 'GET', path: '/v1/transformations/{id}', summary: 'One transformation state' },
  { method: 'GET', path: '/v1/templates', summary: 'Conditional composition templates' },
  { method: 'GET', path: '/v1/pipelines', summary: 'End-to-end writing pipelines' },
  { method: 'GET', path: '/v1/profiles', summary: 'Application profiles' },
  { method: 'GET', path: '/v1/recipes', summary: 'Volumetric generation recipes' },
  { method: 'GET', path: '/v1/tests', summary: 'Rule test cases and minimal pairs' },
  { method: 'GET', path: '/v1/tests/run', summary: 'Run the corpus test cases through this engine' },
  { method: 'GET', path: '/v1/sources', summary: 'Source bibliography and influence map' },
  { method: 'GET', path: '/v1/glossary', summary: 'Glossary terms' },
  { method: 'GET', path: '/v1/metrics', summary: 'The writing quality measurement model' },
  { method: 'GET', path: '/v1/search', summary: 'Search rules, terms, templates, pipelines and sources' },
  { method: 'GET', path: '/v1/graph', summary: 'The corpus as nodes and edges' },
  { method: 'GET', path: '/v1/backlinks/{id}', summary: 'What cites, tests or neighbours an id' },
  { method: 'GET', path: '/v1/engine/facts', summary: 'Which facts the analyser derives, and which you must supply' },
  { method: 'POST', path: '/v1/analyze', summary: 'Surface analysis of a text' },
  { method: 'POST', path: '/v1/evaluate', summary: 'Run the rule engine over a text' },
  { method: 'POST', path: '/v1/resolve', summary: 'Which rules govern a context, before you draft' },
  { method: 'POST', path: '/v1/score', summary: 'Score a text against the twelve quality metrics' }
]
