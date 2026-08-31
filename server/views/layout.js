/**
 * The page shell.
 *
 * The header is the LAKA four-element contract (GET /v1/nav-contract): the canonical Bow Tie
 * seal, the uppercase site name with the second word in accent, one MENU pill, one CTA pill.
 * Nothing else goes in the bar; every destination lives in the mega menu, which is a native
 * <details> disclosure so it works with no JavaScript.
 */

import { corpus } from '../corpus.js'

const BRAND = 'https://designsystem.bowtiekreative.com/brand'
export const ORIGIN = process.env.PUBLIC_ORIGIN ?? 'https://writingsystem.bowtiekreative.com'

export const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export const attr = (v) => esc(v)

/** Icons: one stroke weight, one metaphor per concept. */
const ICON_PATHS = {
  levels: '<path d="M3 20h18M6 20V9m6 11V4m6 16v-7"/>',
  grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
  logic: '<path d="M4 6h4l4 6-4 6H4M12 12h8m0 0-3-3m3 3-3 3"/>',
  engine: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4M4.9 4.9l2.8 2.8m8.6 8.6 2.8 2.8M19.1 4.9l-2.8 2.8m-8.6 8.6-2.8 2.8"/>',
  rules: '<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>',
  template: '<path d="M4 4h16v4H4zM4 12h7v8H4zM15 12h5v8h-5z"/>',
  pipeline: '<path d="M3 7h6l3 5 3-5h6M3 17h6l3-5"/><circle cx="19" cy="17" r="2"/>',
  metric: '<path d="M4 20V10m5 10V4m5 16v-7m5 7V8"/>',
  source: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h7M9 14h7"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  api: '<path d="m9 16-4-4 4-4m6 0 4 4-4 4"/>',
  profile: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  glossary: '<path d="M5 5a2 2 0 0 1 2-2h12v18H7a2 2 0 0 1-2-2z"/><path d="M9 3v18"/>',
  test: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>'
}

export function icon (name, { size = 22 } = {}) {
  const path = ICON_PATHS[name]
  if (!path) return ''
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`
}

/** Every destination on the site. The bar carries none of these — the mega menu does. */
export const MENU = [
  {
    label: 'The model',
    items: [
      { href: '/principles', title: 'First principles', note: 'Eleven levels, signal to content system' },
      { href: '/laka', title: 'The LAKA grid', note: '6 × 6 × 6, and 14 dynamics × 4 states' },
      { href: '/logic', title: 'Rule logic', note: 'Conditions, branches, exceptions' },
      { href: '/primitives', title: 'Linguistic primitives', note: 'Parts of speech, dependencies, discourse' }
    ]
  },
  {
    label: 'The rules',
    items: [
      { href: '/rules', title: 'Browse all rules', note: `${corpus.rules.length} base rules, filterable` },
      { href: '/rules?strength=hard_constraint', title: 'Hard constraints', note: 'What must pass or block' },
      { href: '/tests', title: 'Test cases', note: 'Minimal pairs, before and after' },
      { href: '/files', title: 'Source files', note: 'All 30 JSON files, verbatim' }
    ]
  },
  {
    label: 'Applying it',
    items: [
      { href: '/engine', title: 'Run the engine', note: 'Evaluate a text against the rules' },
      { href: '/templates', title: 'Composition templates', note: `${corpus.templates.length} conditional structures` },
      { href: '/pipelines', title: 'Writing pipelines', note: `${corpus.pipelines.length} end-to-end sequences` },
      { href: '/profiles', title: 'Application profiles', note: 'Which domains switch on where' },
      { href: '/metrics', title: 'Quality metrics', note: 'Twelve measures and four gates' }
    ]
  },
  {
    label: 'Reference',
    items: [
      { href: '/api', title: 'API reference', note: 'Every endpoint, with examples' },
      { href: '/glossary', title: 'Glossary', note: `${corpus.glossary.length} terms` },
      { href: '/sources', title: 'Bibliography', note: `${corpus.sources.length} sources and influences` },
      { href: '/search', title: 'Search', note: 'Rules, terms, templates, sources' }
    ]
  }
]

function header () {
  const groups = MENU.map((g) => `
        <div class="mega__group">
          <h2>${esc(g.label)}</h2>
          <ul>${g.items.map((i) => `
            <li><a href="${attr(i.href)}">${esc(i.title)}<span>${esc(i.note)}</span></a></li>`).join('')}
          </ul>
        </div>`).join('')

  return `
  <header class="bar">
    <div class="wrap bar__inner">
      <a class="bar__left" href="/">
        <img class="bar__seal" src="${BRAND}/btk-seal-white.png" alt="Bow Tie Kreative" width="34" height="34">
        <span class="bar__name">Writing <b>System</b></span>
      </a>
      <div class="bar__right">
        <details class="menu" id="menu">
          <summary class="pill" aria-label="Menu">
            <svg class="menu__icon menu__icon--open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
            <svg class="menu__icon menu__icon--close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
            <span>MENU</span>
          </summary>
          <nav class="mega" aria-label="All pages">
            <div class="wrap mega__grid">${groups}
            </div>
          </nav>
        </details>
        <a class="pill pill--solid" href="/engine">Run the engine</a>
      </div>
    </div>
  </header>`
}

function footer () {
  const cols = MENU.map((g) => `
        <div>
          <h2>${esc(g.label)}</h2>
          <ul>${g.items.map((i) => `<li><a href="${attr(i.href)}">${esc(i.title)}</a></li>`).join('')}</ul>
        </div>`).join('')

  return `
  <footer class="foot">
    <div class="wrap">
      <div class="foot__grid">${cols}
      </div>
      <div class="foot__legal">
        <p style="margin:0">${esc(corpus.manifest.title)} v${esc(corpus.manifest.version)} · ${corpus.rules.length} base rules · ${corpus.manifest.inventory?.total_operational_rule_records ?? ''} operational records</p>
        <p style="margin:0">Powered by <a href="https://bowtiekreative.com">Bow Tie Kreative</a></p>
      </div>
      <p class="muted" style="margin-top:var(--space-6);font-size:13px;max-width:100ch">${esc(corpus.manifest.copyright_note)}</p>
    </div>
  </footer>`
}

/**
 * @param {object} page
 * @param {string} page.title      the <title>, without the site suffix
 * @param {string} page.description meta description
 * @param {string} page.path       canonical path
 * @param {string} page.body       page markup, starting with its single <h1>
 * @param {object} [page.jsonLd]   structured data describing content visible on the page
 */
export function layout (page) {
  const title = `${page.title} · Writing System`
  const canonical = `${ORIGIN}${page.path}`
  const jsonLd = page.jsonLd
    ? `\n  <script type="application/ld+json">${JSON.stringify(page.jsonLd).replace(/</g, '\\u003c')}</script>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${attr(page.description)}">
  <link rel="canonical" href="${attr(canonical)}">
  <meta name="robots" content="index, follow">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="LAKA Volumetric Writing Grammar System">
  <meta property="og:title" content="${attr(title)}">
  <meta property="og:description" content="${attr(page.description)}">
  <meta property="og:url" content="${attr(canonical)}">
  <meta property="og:image" content="${BRAND}/btk-seal.png">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${attr(title)}">
  <meta name="twitter:description" content="${attr(page.description)}">
  <meta name="theme-color" content="#07090D">
  <link rel="icon" href="${BRAND}/favicon-32.png" sizes="32x32">
  <link rel="icon" href="${BRAND}/favicon-48.png" sizes="48x48">
  <link rel="apple-touch-icon" href="${BRAND}/apple-touch-icon-180.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap">
  <link rel="stylesheet" href="/laka.css">
  <link rel="alternate" type="application/json" href="${ORIGIN}/v1">${jsonLd}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
${header()}
  <main id="main" tabindex="-1">
${page.body}
  </main>
${footer()}
  <script src="/site.js" defer></script>
</body>
</html>`
}

/** The environmental-motion anchor for hero sections. */
export function lattice () {
  const cols = 14
  const rows = 7
  let lines = ''
  let dots = ''
  for (let r = 0; r <= rows; r++) {
    lines += `<line x1="0" y1="${r * 60}" x2="1400" y2="${r * 60 - 120}" stroke-width="1" opacity="0.16"/>`
  }
  for (let c = 0; c <= cols; c++) {
    lines += `<line x1="${c * 100}" y1="0" x2="${c * 100 - 140}" y2="420" stroke-width="1" opacity="0.16"/>`
  }
  for (let r = 1; r < rows; r += 2) {
    for (let c = 1; c < cols; c += 3) {
      dots += `<circle class="pulse" cx="${c * 100}" cy="${r * 60}" r="3" fill="currentColor" stroke="none" opacity="0.4"/>`
    }
  }
  return `<div class="lattice" aria-hidden="true"><svg viewBox="0 0 1400 420" preserveAspectRatio="xMidYMid slice" style="color:var(--rp-accent)"><g class="drift">${lines}${dots}</g></svg></div>`
}
