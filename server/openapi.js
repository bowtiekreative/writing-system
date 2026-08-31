import { corpus } from './corpus.js'

const BASE = process.env.PUBLIC_ORIGIN ?? 'https://writingsystem.bowtiekreative.com'

const ok = (description, example) => ({
  description,
  content: { 'application/json': { schema: { type: 'object' }, ...(example ? { example } : {}) } }
})

const pathParam = (name, description) => ({
  name, in: 'path', required: true, description, schema: { type: 'string' }
})

const queryParam = (name, description, schema = { type: 'string' }) => ({
  name, in: 'query', required: false, description, schema
})

const paging = [
  queryParam('limit', 'Page size, 1–500.', { type: 'integer', default: 50, minimum: 1, maximum: 500 }),
  queryParam('offset', 'Rows to skip.', { type: 'integer', default: 0, minimum: 0 })
]

export function buildOpenApi () {
  const domains = corpus.domains.map((d) => d.value)
  const layers = corpus.layers.map((d) => d.value)
  const strengths = corpus.strengths.map((d) => d.value)
  const profiles = corpus.profiles.map((p) => p.id)

  const collection = (name, summary) => ({
    [`/v1/${name}`]: { get: { tags: ['Corpus'], summary, parameters: paging, responses: { 200: ok(summary) } } },
    [`/v1/${name}/{id}`]: {
      get: {
        tags: ['Corpus'],
        summary: `${summary} — one record`,
        parameters: [pathParam('id', 'Record id.')],
        responses: { 200: ok('The record'), 404: ok('No such record') }
      }
    }
  })

  return {
    openapi: '3.1.0',
    info: {
      title: 'LAKA Volumetric Writing Grammar System API',
      version: corpus.manifest.version ?? '1.0.0',
      summary: 'Machine-readable writing rules, and an engine that runs them over text.',
      description: [
        corpus.manifest.purpose,
        '',
        `The corpus holds ${corpus.manifest.inventory?.total_operational_rule_records ?? 289} operational rule records across ${corpus.rules.length} base rules, ${corpus.transformations.length} LAKA transformation states and ${corpus.crossAxis.length} cross-axis rules.`,
        '',
        'Rule conditions are Boolean ASTs over named facts. Many of those facts are semantic and cannot be derived from raw text. The engine evaluates in three-valued logic and reports unresolved facts under `needs_input` rather than guessing them.',
        '',
        corpus.manifest.usage_note ?? ''
      ].join('\n'),
      license: { name: 'Original synthesis. Source titles remain the property of their authors and publishers.' },
      contact: { name: 'Bow Tie Kreative', url: 'https://bowtiekreative.com' }
    },
    servers: [{ url: BASE, description: 'Production' }],
    tags: [
      { name: 'Meta', description: 'Index, health and specification.' },
      { name: 'Corpus', description: 'The rule corpus, verbatim and indexed.' },
      { name: 'Engine', description: 'Running the rules over text.' }
    ],
    paths: {
      '/v1': { get: { tags: ['Meta'], summary: 'API index', responses: { 200: ok('The index') } } },
      '/v1/health': { get: { tags: ['Meta'], summary: 'Liveness and corpus counts', responses: { 200: ok('Health') } } },
      '/v1/openapi.json': { get: { tags: ['Meta'], summary: 'This document', responses: { 200: ok('OpenAPI document') } } },
      '/v1/manifest': { get: { tags: ['Corpus'], summary: 'Manifest, inventory and load order', responses: { 200: ok('Manifest') } } },
      '/v1/files': { get: { tags: ['Corpus'], summary: 'The 30 source files', responses: { 200: ok('File list') } } },
      '/v1/files/{slug}': {
        get: {
          tags: ['Corpus'],
          summary: 'One source file, verbatim',
          parameters: [pathParam('slug', 'File slug or two-digit number, e.g. `core-grammar-rules` or `07`.')],
          responses: { 200: ok('The file'), 404: ok('No such file') }
        }
      },
      '/v1/principles': { get: { tags: ['Corpus'], summary: 'Writing from first principles', responses: { 200: ok('Principles') } } },
      '/v1/primitives': { get: { tags: ['Corpus'], summary: 'Linguistic primitives', responses: { 200: ok('Primitives') } } },
      '/v1/grid': { get: { tags: ['Corpus'], summary: 'The LAKA volumetric grid', responses: { 200: ok('Grid') } } },
      '/v1/axes': { get: { tags: ['Corpus'], summary: 'Context axes and precedence', responses: { 200: ok('Axes') } } },
      '/v1/operators': { get: { tags: ['Corpus'], summary: 'Boolean and decision logic', responses: { 200: ok('Operators') } } },
      '/v1/schema': { get: { tags: ['Corpus'], summary: 'JSON Schema for a rule', responses: { 200: ok('Schema') } } },
      '/v1/engine-spec': { get: { tags: ['Corpus'], summary: 'Reference rule-engine specification', responses: { 200: ok('Engine spec') } } },
      '/v1/rules': {
        get: {
          tags: ['Corpus'],
          summary: 'Search and filter the base rules',
          parameters: [
            queryParam('q', 'Free-text match against id, name, logic, rationale and diagnostics.'),
            queryParam('domain', `Comma-separated domains: ${domains.join(', ')}.`),
            queryParam('layer', `Comma-separated layers: ${layers.join(', ')}.`),
            queryParam('strength', `Comma-separated strengths: ${strengths.join(', ')}.`),
            queryParam('source', 'Only rules citing this source id, e.g. `BK-002`.'),
            queryParam('axis', 'Only rules whose LAKA primary_axes include this axis.'),
            queryParam('expand', 'Return full rule records with tests and sources.', { type: 'boolean' }),
            ...paging
          ],
          responses: { 200: ok('Matching rules with facet counts') }
        }
      },
      '/v1/rules/{id}': {
        get: {
          tags: ['Corpus'],
          summary: 'One rule, expanded',
          parameters: [pathParam('id', 'Rule id, e.g. `GRM-001`.')],
          responses: { 200: ok('The rule with its tests, sources and required facts'), 404: ok('No such rule') }
        }
      },
      '/v1/domains': { get: { tags: ['Corpus'], summary: 'Rule counts by domain', responses: { 200: ok('Domains') } } },
      '/v1/layers': { get: { tags: ['Corpus'], summary: 'Rule counts by layer', responses: { 200: ok('Layers') } } },
      '/v1/strengths': { get: { tags: ['Corpus'], summary: 'Rule counts by strength', responses: { 200: ok('Strengths') } } },
      '/v1/transformations': {
        get: {
          tags: ['Corpus'],
          summary: 'LAKA transformation-state rules',
          parameters: [queryParam('axis', 'Restrict to one dynamic axis, e.g. `magnitude`.'), ...paging],
          responses: { 200: ok('Transformation states') }
        }
      },
      '/v1/transformations/{id}': {
        get: {
          tags: ['Corpus'],
          summary: 'One transformation state',
          parameters: [pathParam('id', 'State id.')],
          responses: { 200: ok('The state'), 404: ok('No such state') }
        }
      },
      ...collection('templates', 'Conditional composition templates'),
      ...collection('pipelines', 'End-to-end writing pipelines'),
      ...collection('profiles', 'Application profiles'),
      ...collection('recipes', 'Volumetric generation recipes'),
      ...collection('tests', 'Rule test cases and minimal pairs'),
      ...collection('sources', 'Source bibliography'),
      ...collection('glossary', 'Glossary terms'),
      '/v1/metrics': { get: { tags: ['Corpus'], summary: 'Quality measurement model', responses: { 200: ok('Metrics') } } },
      '/v1/search': {
        get: {
          tags: ['Corpus'],
          summary: 'Search the whole corpus',
          parameters: [
            queryParam('q', 'Query string. All terms must match.'),
            queryParam('type', 'Comma-separated types: rule, transformation, template, pipeline, term, source, file.'),
            queryParam('limit', 'Maximum results.', { type: 'integer', default: 25, maximum: 200 })
          ],
          responses: { 200: ok('Search results') }
        }
      },
      '/v1/graph': { get: { tags: ['Corpus'], summary: 'The corpus as nodes and edges', responses: { 200: ok('Graph') } } },
      '/v1/backlinks/{id}': {
        get: {
          tags: ['Corpus'],
          summary: 'What cites, tests or neighbours an id',
          parameters: [pathParam('id', 'A rule id or a source id.')],
          responses: { 200: ok('Backlinks'), 404: ok('No such id') }
        }
      },
      '/v1/engine/facts': {
        get: {
          tags: ['Engine'],
          summary: 'Derived vs supplied facts',
          description: 'Every fact path the analyser derives from raw text, and every path the rules read. The difference is what you must supply.',
          responses: { 200: ok('Fact paths') }
        }
      },
      '/v1/analyze': {
        post: {
          tags: ['Engine'],
          summary: 'Surface analysis of a text',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['text'],
                  properties: {
                    text: { type: 'string', description: 'The text to analyse.' },
                    context: { type: 'object', description: 'Rhetorical situation, merged into the model.' }
                  }
                },
                example: { text: 'The report was written by the committee. It was approved without discussion.' }
              }
            }
          },
          responses: { 200: ok('Document, paragraph and sentence measurements'), 400: ok('Missing text') }
        }
      },
      '/v1/evaluate': {
        post: {
          tags: ['Engine'],
          summary: 'Run the rule engine over a text',
          description: [
            'Analyses the text, selects the rules that apply, and evaluates each one against every unit of its layer.',
            '',
            'Results split four ways: `blocking` (hard constraints demanding a change), `context_defaults`, `ranked_options` (heuristics and creative options), and `checks` (rules that ask you to verify or supply context rather than edit).',
            '',
            'Rules whose conditions read facts the analyser cannot derive appear under `needs_input` with the exact paths required. Supply them under `facts` to resolve them.'
          ].join('\n'),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['text'],
                  properties: {
                    text: { type: 'string', maxLength: 200000 },
                    context: {
                      type: 'object',
                      description: 'The rhetorical situation. Each axis takes one of the values declared in 03-context-axes.json.',
                      properties: Object.fromEntries(
                        Object.entries(corpus.axes.axes ?? {}).map(([axis, values]) => [
                          axis,
                          Array.isArray(values) ? { type: 'string', enum: values } : { type: 'string' }
                        ])
                      )
                    },
                    facts: {
                      type: 'object',
                      description: 'Semantic facts you assert, deep-merged over the derived ones. See GET /v1/engine/facts.'
                    },
                    profile: { type: 'string', enum: profiles, description: 'Application profile; selects the active domains.' },
                    domains: { type: 'array', items: { type: 'string', enum: domains } },
                    layers: { type: 'array', items: { type: 'string', enum: layers } },
                    strengths: { type: 'array', items: { type: 'string', enum: strengths } },
                    rule_ids: { type: 'array', items: { type: 'string' }, description: 'Evaluate exactly these rules.' },
                    include_trace: { type: 'boolean', description: 'Include the per-condition evaluation trace.' }
                  }
                },
                example: {
                  text: 'The committee reviewed the report, it was approved without discussion.',
                  profile: 'PROFILE-GENERAL',
                  context: { genre: 'report', stakes: 'medium' }
                }
              }
            }
          },
          responses: { 200: ok('Engine result'), 400: ok('Missing text'), 413: ok('Text too large') }
        }
      },
      '/v1/resolve': {
        post: {
          tags: ['Engine'],
          summary: 'Which rules govern a context, before you draft',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    profile: { type: 'string', enum: profiles },
                    domains: { type: 'array', items: { type: 'string', enum: domains } },
                    layers: { type: 'array', items: { type: 'string', enum: layers } },
                    strengths: { type: 'array', items: { type: 'string', enum: strengths } },
                    context: { type: 'object' }
                  }
                },
                example: { profile: 'PROFILE-TECH' }
              }
            }
          },
          responses: { 200: ok('The active rule set, its precedence and selection policy') }
        }
      },
      '/v1/score': {
        post: {
          tags: ['Engine'],
          summary: 'Score a text against the twelve quality metrics',
          description: 'Scores are supplied by you, 0–4. Four gate metrics — accuracy, evidence, accessibility, ethics — fail the document regardless of the average when they fall below 2. An unscored gate metric leaves the gate open; it is not a pass.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    scores: {
                      type: 'object',
                      additionalProperties: { type: 'number', minimum: 0, maximum: 4 },
                      description: 'Metric id to score. Ids: ' + corpus.metrics.map((m) => m.id).join(', ') + '.'
                    },
                    notes: { type: 'object', additionalProperties: { type: 'string' } }
                  }
                },
                example: { scores: { accuracy: 3, clarity: 3, usability: 2, evidence: 3, accessibility: 3, ethics: 4 } }
              }
            }
          },
          responses: { 200: ok('Weighted score, gate verdict and per-metric detail') }
        }
      },
      '/v1/tests/run': {
        get: {
          tags: ['Engine'],
          summary: 'Run the corpus test cases through this engine',
          description: 'Executes the corpus\' own minimal pairs. A case is decidable when the analyser can derive every fact its rule reads; the rest are reported as needing asserted facts.',
          responses: { 200: ok('Test results') }
        }
      }
    }
  }
}
