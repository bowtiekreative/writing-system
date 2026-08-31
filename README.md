# Writing System

The API and documentation site for the **LAKA Volumetric Writing Grammar System** —
228 machine-readable writing rules, 56 LAKA transformation states and 5 cross-axis rules
(289 operational records), plus an engine that runs them over text.

Live at **https://writingsystem.bowtiekreative.com**

## What this is

A decision system, not a style guide. Writing is broken into eleven levels — signal, grapheme,
morpheme, word, phrase, clause, sentence, paragraph, section, document, content system — and each
rule states its logic explicitly: a Boolean condition tree, a `then` branch, an `else` branch, and
declared exceptions under `unless`. Every rule is labelled with how hard it binds:

| Strength | Behaviour |
| --- | --- |
| `hard_constraint` | must pass or block |
| `context_default` | apply unless a documented exception improves the intended outcome |
| `heuristic` | score and rank |
| `creative_option` | offer as a controlled alternative |

## Architecture

One Node 22 + Fastify container serves both the JSON API and the documentation site.

```
data/volumetric-writing-grammar-system/   the 30 source JSON files — the single source of truth
server/
  corpus.js        loads and indexes all 30 files at boot; builds facets and search index
  openapi.js       generates the OpenAPI 3.1 document from the corpus
  engine/
    ast.js         three-valued condition-AST evaluator (true / false / unknown)
    analyze.js     surface text analyser; DERIVED_PATHS declares exactly what it derives
    evaluate.js    the rule engine, per the 10 steps in 23-rule-engine.json
    score.js       the 12-metric weighted quality model with its 4 hard gates
  routes/
    api.js         the /v1 JSON API
    site.js        server-rendered pages, robots.txt, sitemap.xml, llms.txt
  views/           the page shell, components and page renderers
public/            laka.css and the progressive-enhancement script
test/              34 tests over the corpus, the AST, the analyser, the engine and scoring
```

Pages are server-rendered. Nothing on the site requires client JavaScript: the menu is a native
`<details>` disclosure, the rule filters are a GET form, and the engine playground is a POST form
whose result is rendered on the server. The script in `public/site.js` only adds reveal animation,
Escape-to-close and submit-on-change.

### Three-valued evaluation

Rule conditions read named facts. The analyser derives surface facts from raw text — sentence
length, voice, clause and boundary counts, punctuation structure, readability. Many rules read
*semantic* facts instead: whether a claim is causal, whether evidence suffices, what effect a
sentence intends. Those cannot be derived, and the engine does not invent them.

An unresolvable condition evaluates to `unknown`, and the rule is returned under `needs_input`
with the exact fact paths required. That is the corpus' own `safe_failure` clause — preserve the
text, ask a focused question, do not invent. `GET /v1/engine/facts` lists every derived path
against every path the rules read.

## Running it

```bash
npm install
npm start            # http://127.0.0.1:3000
npm test             # 34 tests
```

With Docker:

```bash
docker build -t writing-system .
docker run -p 3000:3000 -e PUBLIC_ORIGIN=http://localhost:3000 writing-system
```

Or `docker compose up --build` — the compose file carries the Traefik labels for
`writingsystem.bowtiekreative.com`.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | listen port |
| `HOST` | `0.0.0.0` | listen address |
| `PUBLIC_ORIGIN` | `https://writingsystem.bowtiekreative.com` | canonical URLs, Open Graph, sitemap, llms.txt |
| `LOG_LEVEL` | `info` | pino log level |

No secrets, no database, no external calls at runtime. The corpus is read from disk at boot.

## The API

Public, unauthenticated JSON over HTTPS. CORS open. Read endpoints cache for five minutes; the
engine endpoints are never cached.

- `GET /v1` — index · `GET /v1/openapi.json` — OpenAPI 3.1 · `GET /llms.txt` — agent guide
- `GET /v1/rules?domain=&layer=&strength=&q=&source=&axis=&expand=` — filter the rules
- `GET /v1/rules/{id}` — one rule with its condition tree, branches, tests, sources, required facts
- `GET /v1/files/{slug}` — any of the 30 source files, verbatim
- `GET /v1/search?q=` · `GET /v1/graph` · `GET /v1/backlinks/{id}`
- `POST /v1/evaluate` — run the rules over a text
- `POST /v1/resolve` — which rules govern a context, before drafting
- `POST /v1/score` — the 12-metric quality model
- `POST /v1/analyze` — surface analysis only
- `GET /v1/tests/run` — run the corpus' own minimal pairs through this engine

```bash
curl -X POST https://writingsystem.bowtiekreative.com/v1/evaluate \
  -H 'content-type: application/json' \
  -d '{
    "text": "The committee reviewed the report, it was approved without discussion.",
    "profile": "PROFILE-GENERAL",
    "context": { "genre": "report", "stakes": "high" }
  }'
```

Returns `verdict`, `blocking`, `context_defaults`, `ranked_options`, `checks`, `needs_input`,
`coverage` and a `test_plan`.

## Design

Built on the **Ryan Perez / LAKA design system v4.3**
(`https://api.designsystem.bowtiekreative.com/v1`), following its `build` and `ship` workflows.

- Tokens come from `GET /v1/tokens.css`; no invented colours, spacing or radii.
- The header is the four-element contract from `GET /v1/nav-contract`: canonical Bow Tie seal,
  uppercase site name with the second word in accent, one MENU pill, one CTA pill. No inline nav
  links — every destination lives in the mega menu.
- Every colour pair was measured with `GET /v1/contrast` before use. Accent `#3F6EE9` is 4.38:1
  on canvas, so it is never used for text below 24px normal / 18.66px bold; `#FFFFFF` is used on
  accent (4.55:1), never `#F5F7FA` (4.24:1).
- WCAG 2.2 AA: semantic landmarks, one `h1` per page, skip link, 2px focus ring at 3px offset,
  44px targets, 320px reflow, reduced-motion equivalents that remove movement rather than
  shortening it.
- The vibrancy floor is met by the animated volumetric lattice and the icon system rather than
  photography, which would not earn its place on a rules reference.

## Data

`data/volumetric-writing-grammar-system/` holds the 30 JSON files unmodified. Every page and every
endpoint is rendered from them — nothing is added. Counts shown on the site are derived from the
files at load time, not copied from the manifest, and the test suite asserts the two agree.

The corpus is original synthesis and paraphrased principle. It does not reproduce the source books;
source titles remain the property of their authors and publishers.
