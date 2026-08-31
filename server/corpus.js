import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = join(here, '..', 'data', 'volumetric-writing-grammar-system')

/** Slug for a data file: "07-core-grammar-rules.json" -> { num: "07", slug: "core-grammar-rules" } */
function parseName (filename) {
  const base = filename.replace(/\.json$/, '')
  const m = base.match(/^(\d{2})-(.+)$/)
  return m ? { num: m[1], slug: m[2], base } : { num: null, slug: base, base }
}

function load () {
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')).sort()
  const byNum = new Map()
  const bySlug = new Map()
  const raw = new Map()

  for (const f of files) {
    const { num, slug, base } = parseName(f)
    const json = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8'))
    const entry = { num, slug, base, filename: f, title: json.title || base, json }
    raw.set(base, entry)
    if (num) byNum.set(num, entry)
    bySlug.set(slug, entry)
  }

  // ---- Rules: every file that carries a `rules` array of full rule records ----
  const rules = []
  const ruleFileOf = new Map()
  for (const entry of raw.values()) {
    const arr = entry.json.rules
    if (!Array.isArray(arr)) continue
    for (const r of arr) {
      if (!r || typeof r !== 'object' || !r.id) continue
      // Transformation-state records (file 20) have a different shape; keep them separate.
      if (!('when' in r) && !('then' in r)) continue
      rules.push(r)
      ruleFileOf.set(r.id, entry)
    }
  }
  const rulesById = new Map(rules.map((r) => [r.id, r]))

  // ---- Transformation state rules (file 20) ----
  const t20 = byNum.get('20')?.json ?? {}
  const transformations = Array.isArray(t20.rules) ? t20.rules : []
  const crossAxis = Array.isArray(t20.cross_axis_rules) ? t20.cross_axis_rules : []
  const crossAxisById = new Map(crossAxis.map((t) => [t.id, t]))
  // Cross-axis rules are addressable alongside the state rules; both live in file 20.
  const transformationsById = new Map([...transformations, ...crossAxis].map((t) => [t.id, t]))

  // ---- Simple collections ----
  const templates = byNum.get('21')?.json?.templates ?? []
  const pipelines = byNum.get('22')?.json?.pipelines ?? []
  const metrics = byNum.get('24')?.json?.metrics ?? []
  const recipes = byNum.get('25')?.json?.recipes ?? []
  const tests = byNum.get('26')?.json?.tests ?? []
  const profiles = byNum.get('27')?.json?.profiles ?? []
  const glossary = byNum.get('28')?.json?.terms ?? []
  const sources = byNum.get('29')?.json?.sources ?? []
  const sourcesById = new Map(sources.map((s) => [s.id, s]))

  // ---- Reverse index: source id -> rule ids that cite it ----
  const rulesBySource = new Map()
  for (const r of rules) {
    for (const sid of r.source_ids ?? []) {
      if (!rulesBySource.has(sid)) rulesBySource.set(sid, [])
      rulesBySource.get(sid).push(r.id)
    }
  }

  // ---- Reverse index: rule id -> test cases ----
  const testsByRule = new Map()
  for (const t of tests) {
    const rid = t.rule_id
    if (!rid) continue
    if (!testsByRule.has(rid)) testsByRule.set(rid, [])
    testsByRule.get(rid).push(t)
  }

  // ---- Facets ----
  const facet = (key) => {
    const counts = new Map()
    for (const r of rules) {
      const v = r[key]
      if (v == null) continue
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }))
  }
  const domains = facet('domain')
  const layers = facet('layer')
  const strengths = facet('strength')

  // ---- Search index (rules + glossary + templates + pipelines + sources) ----
  const searchIndex = []
  const push = (type, id, title, body, href) =>
    searchIndex.push({ type, id, title, href, hay: `${id} ${title} ${body}`.toLowerCase() })
  for (const r of rules) {
    push('rule', r.id, r.name ?? r.id,
      flat([r.human_logic, r.because, r.domain, r.layer, r.strength, r.diagnostics]),
      `/rules/${r.id}`)
  }
  for (const t of transformations) push('transformation', t.id, `${t.axis} · ${t.state}`, flat([t.writing_application, t.evaluation, t.interrogative_prompts]), `/laka#${t.id}`)
  for (const t of templates) push('template', t.id, t.name ?? t.id, flat(t.use_when) + ' ' + flat(t.slots), `/templates/${t.id}`)
  for (const p of pipelines) push('pipeline', p.id, p.name ?? p.id, flat(p.steps) + ' ' + flat(p.decision), `/pipelines/${p.id}`)
  for (const g of glossary) push('term', g.term, g.term, g.definition ?? '', `/glossary#${slugify(g.term)}`)
  for (const s of sources) push('source', s.id, s.title ?? s.id, [s.creator, s.note, s.domain].join(' '), `/sources#${s.id}`)
  for (const e of raw.values()) push('file', e.base, e.title, JSON.stringify(e.json).slice(0, 4000), `/files/${e.slug}`)

  return {
    files: [...raw.values()].sort((a, b) => a.base.localeCompare(b.base)),
    byNum, bySlug, raw,
    manifest: byNum.get('00')?.json ?? {},
    firstPrinciples: byNum.get('01')?.json ?? {},
    grid: byNum.get('02')?.json ?? {},
    axes: byNum.get('03')?.json ?? {},
    operators: byNum.get('04')?.json ?? {},
    ruleSchema: byNum.get('05')?.json ?? {},
    primitives: byNum.get('06')?.json ?? {},
    engineSpec: byNum.get('23')?.json ?? {},
    qualityModel: byNum.get('24')?.json ?? {},
    rules, rulesById, ruleFileOf,
    transformations, transformationsById, crossAxis, crossAxisById,
    templates, pipelines, metrics, recipes, tests, profiles, glossary, sources, sourcesById,
    rulesBySource, testsByRule,
    domains, layers, strengths,
    searchIndex
  }
}

/** Flatten any JSON value into a searchable string of its leaf values. */
export function flat (value, out = []) {
  if (value == null) return out.join(' ')
  if (Array.isArray(value)) { for (const v of value) flat(v, out); return out.join(' ') }
  if (typeof value === 'object') { for (const v of Object.values(value)) flat(v, out); return out.join(' ') }
  out.push(String(value))
  return out.join(' ')
}

export function slugify (s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export const corpus = load()
