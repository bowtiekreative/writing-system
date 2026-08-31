/**
 * Server-rendered pages.
 *
 * Everything works with JavaScript switched off: the menu is a native <details>, the rule
 * filters are a GET form, and the engine is a POST form whose result is rendered server-side.
 * That is the LAKA semantic-web stack adapter's requirement, and it is also what makes the
 * pages indexable.
 */

import { corpus } from '../corpus.js'
import { layout, MENU, ORIGIN } from '../views/layout.js'
import { home, rulesIndex, ruleDetail, enginePage, principles, lakaGrid } from '../views/pages.js'
import {
  logicPage, primitivesPage, templatesPage, pipelinesPage, profilesPage, metricsPage,
  sourcesPage, glossaryPage, testsPage, filesPage, filePage, searchPage, apiPage
} from '../views/reference.js'
import { filterRules, search } from './api.js'
import { evaluate, runCorpusTests } from '../engine/evaluate.js'

const SAMPLE = 'The committee reviewed the report, it was approved without discussion. There is a requirement that the implementation of the recommendations be considered before the end of the quarter. We tested the API, the UI, and the docs.'

/** Send a rendered page. */
function page (reply, built, { status = 200, cache = 'public, max-age=300, stale-while-revalidate=86400' } = {}) {
  return reply.code(status).type('text/html; charset=utf-8').header('cache-control', cache).send(layout(built))
}

export default async function siteRoutes (app) {
  app.get('/', async (req, reply) => page(reply, home()))

  // ---- rules ----------------------------------------------------------------
  app.get('/rules', async (req, reply) => {
    const query = {
      q: req.query.q ?? '',
      domain: req.query.domain ?? '',
      layer: req.query.layer ?? '',
      strength: req.query.strength ?? '',
      source: req.query.source ?? ''
    }
    const limit = 25
    const offset = Math.max(parseInt(req.query.offset ?? '0', 10) || 0, 0)
    const rules = filterRules(query)
    return page(reply, rulesIndex({ rules, query, limit, offset }))
  })

  app.get('/rules/:id', async (req, reply) => {
    const rule = corpus.rulesById.get(String(req.params.id).toUpperCase())
    if (!rule) return notFound(reply, `No rule with the id ${req.params.id}.`)
    return page(reply, ruleDetail(rule))
  })

  // ---- engine ---------------------------------------------------------------
  app.get('/engine', async (req, reply) =>
    page(reply, enginePage({ submitted: false, result: null, form: {}, error: null }), { cache: 'public, max-age=300' }))

  app.post('/engine', async (req, reply) => {
    const b = req.body ?? {}
    const usedSample = b.sample === '1'
    const text = usedSample ? SAMPLE : String(b.text ?? '')
    const axes = corpus.axes.axes ?? {}
    const form = { text, profile: String(b.profile ?? '') }
    for (const axis of Object.keys(axes)) form[axis] = String(b[axis] ?? '')

    if (!text.trim()) {
      return page(reply, enginePage({ submitted: true, result: null, form, error: 'Enter some text to evaluate, or use the sample.' }), { status: 400, cache: 'no-store' })
    }
    if (text.length > 200_000) {
      return page(reply, enginePage({ submitted: true, result: null, form, error: 'That text is over the 200,000 character limit.' }), { status: 413, cache: 'no-store' })
    }

    // Only accept values the corpus actually declares for each axis.
    const context = {}
    for (const [axis, values] of Object.entries(axes)) {
      const v = form[axis]
      if (v && Array.isArray(values) && values.includes(v)) context[axis] = v
    }

    const result = evaluate({ text, context, profile: form.profile || null })
    return page(reply, enginePage({ submitted: true, result, form, error: null }), { cache: 'no-store' })
  })

  // ---- model ----------------------------------------------------------------
  app.get('/principles', async (req, reply) => page(reply, principles()))
  app.get('/laka', async (req, reply) => page(reply, lakaGrid()))
  app.get('/logic', async (req, reply) => page(reply, logicPage()))
  app.get('/primitives', async (req, reply) => page(reply, primitivesPage()))

  // ---- applying it ----------------------------------------------------------
  app.get('/templates', async (req, reply) => page(reply, templatesPage()))
  app.get('/pipelines', async (req, reply) => page(reply, pipelinesPage()))
  app.get('/profiles', async (req, reply) => page(reply, profilesPage()))
  app.get('/metrics', async (req, reply) => page(reply, metricsPage()))

  // ---- reference ------------------------------------------------------------
  app.get('/api', async (req, reply) => page(reply, apiPage()))
  app.get('/glossary', async (req, reply) => page(reply, glossaryPage()))
  app.get('/sources', async (req, reply) => page(reply, sourcesPage()))
  app.get('/tests', async (req, reply) => page(reply, testsPage(runCorpusTests())))
  app.get('/files', async (req, reply) => page(reply, filesPage()))

  app.get('/files/:slug', async (req, reply) => {
    const key = String(req.params.slug)
    const entry = corpus.bySlug.get(key) ?? corpus.byNum.get(key)
    if (!entry) return notFound(reply, `No source file called ${key}.`)
    return page(reply, filePage(entry))
  })

  app.get('/search', async (req, reply) => {
    const q = String(req.query.q ?? '').trim()
    return page(reply, searchPage({ q, results: q ? search(q, { limit: 60 }) : [] }), { cache: q ? 'no-store' : 'public, max-age=300' })
  })

  // ---- machine files --------------------------------------------------------
  app.get('/robots.txt', async (req, reply) => reply
    .type('text/plain; charset=utf-8')
    .header('cache-control', 'public, max-age=86400')
    .send(`User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`))

  app.get('/sitemap.xml', async (req, reply) => {
    const paths = [
      '/', '/principles', '/laka', '/logic', '/primitives', '/rules', '/engine', '/templates',
      '/pipelines', '/profiles', '/metrics', '/api', '/glossary', '/sources', '/tests', '/files', '/search',
      ...corpus.files.map((f) => `/files/${f.slug}`),
      ...corpus.rules.map((r) => `/rules/${r.id}`)
    ]
    const lastmod = corpus.manifest.generated_at ?? new Date().toISOString().slice(0, 10)
    const urls = paths.map((p) => `  <url><loc>${ORIGIN}${p}</loc><lastmod>${lastmod}</lastmod>${p === '/' ? '<priority>1.0</priority>' : ''}</url>`).join('\n')
    return reply
      .type('application/xml; charset=utf-8')
      .header('cache-control', 'public, max-age=86400')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
  })

  app.get('/llms.txt', async (req, reply) => reply
    .type('text/plain; charset=utf-8')
    .header('cache-control', 'public, max-age=3600')
    .send(llmsTxt()))

  // ---- 404 ------------------------------------------------------------------
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/v1/')) {
      return reply.code(404).send({ error: 'not_found', path: req.url })
    }
    return notFound(reply, 'That page does not exist.')
  })
}

function notFound (reply, message) {
  const body = `
  <section>
    <div class="wrap stack">
      <p class="eyebrow">404</p>
      <h1>Not found</h1>
      <p class="lede">${message}</p>
      <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;margin-top:var(--space-6)">
        <a class="pill pill--solid" href="/">Home</a>
        <a class="pill" href="/rules">Browse the rules</a>
        <a class="pill" href="/search">Search</a>
      </div>
    </div>
  </section>`
  return reply.code(404).type('text/html; charset=utf-8').header('cache-control', 'no-store').send(layout({
    title: 'Not found', description: 'That page does not exist.', path: '/404', body
  }))
}

function llmsTxt () {
  const m = corpus.manifest
  return `# ${m.title}

> ${m.purpose}

Version ${m.version}. ${corpus.rules.length} base rules, ${corpus.transformations.length} LAKA transformation states, ${corpus.crossAxis.length} cross-axis rules — ${m.inventory?.total_operational_rule_records ?? ''} operational records across ${corpus.files.length} JSON files.

This is a decision system, not a style guide. Every rule declares how hard it binds:
${Object.entries(corpus.engineSpec.strength_behavior ?? {}).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Start here
${(m.start_here ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

## API
Base URL: ${ORIGIN}
OpenAPI: ${ORIGIN}/v1/openapi.json
Index: ${ORIGIN}/v1

Read:
- ${ORIGIN}/v1/rules?domain=clarity — filter rules by domain, layer, strength, source or free text
- ${ORIGIN}/v1/rules/{id} — one rule with its condition tree, branches, tests and sources
- ${ORIGIN}/v1/files/{slug} — any of the ${corpus.files.length} source files, verbatim
- ${ORIGIN}/v1/search?q= — search rules, terms, templates, pipelines and sources

Run:
- POST ${ORIGIN}/v1/evaluate — run the rules over a text
- POST ${ORIGIN}/v1/resolve — which rules govern a context, before drafting
- POST ${ORIGIN}/v1/score — score against the twelve quality metrics
- POST ${ORIGIN}/v1/analyze — surface analysis only

## How the engine handles what it cannot know
Rule conditions read named facts. The analyser derives surface facts from raw text. Semantic
facts — whether a claim is causal, whether evidence suffices, what a sentence intends — are not
derivable and are never guessed. Such conditions evaluate to \`unknown\`, and the rule is
returned under \`needs_input\` with the exact fact paths required. Supply them under \`facts\`.

See ${ORIGIN}/v1/engine/facts for the full list of derived versus required paths.

## Domains
${corpus.domains.map((d) => `- ${d.value} (${d.count} rules): ${ORIGIN}/v1/rules?domain=${d.value}`).join('\n')}

## Application profiles
${corpus.profiles.map((p) => `- ${p.id} — ${p.name}: ${(p.active_domains ?? []).join(', ')}`).join('\n')}

## Pages
${MENU.flatMap((g) => g.items.map((i) => `- ${ORIGIN}${i.href} — ${i.title}: ${i.note}`)).join('\n')}

## Usage note
${m.usage_note}

## Copyright
${m.copyright_note}
`
}
