/**
 * Surface text analyser.
 *
 * Produces the `text_model` named in 23-rule-engine.json step 1. It derives ONLY features
 * that surface analysis can support honestly; every derived path is registered in
 * DERIVED_PATHS so the API can tell callers exactly what is automatic and what they must
 * assert themselves. Semantic facts (claim types, intent, evidence sufficiency) are never
 * invented — they arrive from the caller, or the rule evaluates to `unknown`.
 */

const DOT = '' // stands in for a period that does not end a sentence

const BE = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'get', 'gets', 'got', 'gotten'])
const IRREGULAR_PARTICIPLES = new Set([
  'begun', 'blown', 'broken', 'brought', 'built', 'bought', 'caught', 'chosen', 'come', 'done', 'drawn',
  'driven', 'eaten', 'fallen', 'felt', 'found', 'given', 'gone', 'grown', 'heard', 'held', 'hidden', 'kept',
  'known', 'laid', 'led', 'left', 'lost', 'made', 'meant', 'met', 'paid', 'put', 'read', 'run', 'said',
  'seen', 'sent', 'set', 'shown', 'sold', 'spoken', 'spent', 'taken', 'taught', 'told', 'thought', 'thrown',
  'understood', 'won', 'written'
])
const SUBORDINATORS = new Set([
  'after', 'although', 'as', 'because', 'before', 'if', 'once', 'since', 'than', 'that', 'though',
  'unless', 'until', 'when', 'whenever', 'where', 'whereas', 'wherever', 'whether', 'while'
])
const COORDINATORS = new Set(['and', 'but', 'or', 'nor', 'for', 'so', 'yet'])
const CONJUNCTIVE_ADVERBS = new Set([
  'however', 'therefore', 'moreover', 'consequently', 'furthermore', 'nevertheless', 'nonetheless',
  'meanwhile', 'otherwise', 'thus', 'hence', 'accordingly', 'besides', 'instead'
])
const HEDGES = new Set([
  'may', 'might', 'could', 'possibly', 'perhaps', 'somewhat', 'fairly', 'rather', 'arguably', 'seemingly',
  'apparently', 'generally', 'usually', 'often', 'sometimes', 'likely', 'probably', 'roughly',
  'basically', 'essentially', 'virtually', 'relatively', 'quite', 'presumably'
])
const INTENSIFIERS = new Set(['very', 'really', 'extremely', 'incredibly', 'highly', 'totally', 'absolutely', 'completely', 'utterly'])
const NEGATIONS = new Set(['not', 'no', 'never', 'none', 'nothing', 'neither', 'nor', 'cannot', 'without', 'nobody', 'nowhere'])
const MODALS = new Set(['can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would'])
const NOMINALISATION_SUFFIX = /(tion|sion|ment|ance|ence|ity|ness|ism|isation|ization)s?$/i
const PRONOUNS = new Set(['it', 'this', 'that', 'these', 'those', 'they', 'them', 'he', 'she', 'we', 'you', 'i', 'him', 'her', 'us'])
const ABSTRACT_SUBJECTS = new Set(['it', 'there'])
const FINITE_VERBS = new Set([
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'do', 'does', 'did',
  'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would', 'says', 'said', 'makes',
  'made', 'gives', 'gave', 'takes', 'took', 'goes', 'went', 'comes', 'came', 'gets', 'got', 'needs',
  'means', 'shows', 'seems', 'becomes', 'remains', 'requires', 'includes', 'provides'
])
// A subject pronoun/determiner followed by a finite verb marks a second independent clause.
const FINITE_AFTER_SUBJECT = /\s(is|are|was|were|has|have|had|will|would|can|could|should|must|may|might|does|do|did|makes|made|gives|gave|takes|took|means|shows|seems|becomes|remains|requires|includes|provides|needs)\b/i

const IMPERATIVE_VERBS = /^(add|apply|avoid|build|call|change|check|choose|click|close|configure|confirm|copy|create|delete|do|download|edit|enable|enter|export|fill|find|fix|follow|get|give|go|import|install|keep|list|log|make|move|note|open|paste|pick|press|pull|push|put|read|remove|rename|repeat|replace|restart|review|run|save|scroll|select|send|set|sign|start|stop|submit|switch|tap|test|try|turn|type|update|upload|use|verify|view|wait|write)\b/i

const clean = (s) => String(s ?? '').replace(/\r\n?/g, '\n')
const words = (s) => (s.toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g) ?? [])

function syllables (word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length <= 3) return 1
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

const isParticiple = (w) => IRREGULAR_PARTICIPLES.has(w) || (/ed$/.test(w) && w.length > 3)

/** Split into sentences. Abbreviation-aware enough for prose. */
function splitSentences (text) {
  const guarded = text
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|Inc|Ltd|Co|Fig|No|Vol|approx)\./gi, (m) => m.slice(0, -1) + DOT)
    .replace(/\b([A-Za-z])\./g, (m, c) => c + DOT)
    .replace(/\b(e|i)\.(g|e)\./gi, (m, a, b) => `${a}${DOT}${b}${DOT}`)
    .replace(/(\d)\.(\d)/g, (m, a, b) => `${a}${DOT}${b}`)

  const out = []
  const re = /[^.!?]*[.!?]+["'’”)\]]*\s*|[^.!?]+$/g
  let m
  while ((m = re.exec(guarded)) !== null) {
    const raw = m[0]
    if (!raw.trim()) continue
    out.push({ text: raw.split(DOT).join('.').trim() })
  }
  return out
}

function analyseSentence (raw, index) {
  const text = raw.text
  const toks = words(text)
  const wc = toks.length
  const commaCount = (text.match(/,/g) ?? []).length
  const semicolonCount = (text.match(/;/g) ?? []).length
  const colonCount = (text.match(/:/g) ?? []).length
  const dashCount = (text.match(/—|--| - /g) ?? []).length
  const parenCount = (text.match(/\(/g) ?? []).length

  // Voice: a form of be/get followed within three tokens by a past participle.
  let passiveHits = 0
  const byAgent = /\bby\s+[a-z]/i.test(text)
  for (let i = 0; i < toks.length - 1; i++) {
    if (!BE.has(toks[i])) continue
    for (let j = i + 1; j <= Math.min(i + 3, toks.length - 1); j++) {
      if (isParticiple(toks[j])) { passiveHits++; break }
      if (!['being', 'been', 'not', 'never', 'also', 'already', 'then', 'now'].includes(toks[j])) break
    }
  }

  // Independent clauses: the base clause, plus comma-coordinated, semicolon-joined, and
  // comma-spliced ones. A splice is a bare comma between two independent clauses.
  const coordinatedJoins = (text.match(/,\s+(and|but|or|nor|for|so|yet)\s+/gi) ?? []).length
  const spliceCount = (text.match(/,\s+(it|he|she|they|we|you|i|this|that|these|those|the|there)\s+\w+/gi) ?? [])
    .filter((m) => FINITE_AFTER_SUBJECT.test(m)).length
  const validBoundaryCount = coordinatedJoins + semicolonCount + colonCount
  const independentClauseCount = 1 + coordinatedJoins + semicolonCount + spliceCount
  const subordinateClauseCount = toks.filter((t) => SUBORDINATORS.has(t)).length
  const relativeClauseCount = (text.match(/\b(which|who|whom|whose)\b/gi) ?? []).length
  const clauseCount = independentClauseCount + subordinateClauseCount
  const hasFiniteVerb = toks.some((t) => FINITE_VERBS.has(t)) || /\b\w+(s|ed)\b/.test(text.toLowerCase())

  // A comma-separated series of three or more items.
  const seriesMatch = text.match(/(?:[^,;:.!?]+,){2,}[^,;:.!?]+/)
  const seriesItems = seriesMatch ? seriesMatch[0].split(',').map((x) => x.trim()).filter(Boolean) : []

  // A leading modifier delays the main clause; measure how far.
  const introMatch = text.match(/^([^,]{1,120}),\s/)
  const introModifierExists = Boolean(introMatch) && !/^\s*(yes|no|well)\b/i.test(text)
  const preMainClauseWordCount = introMatch ? words(introMatch[1]).length : 0
  const introFirstWord = introMatch ? words(introMatch[1])[0] ?? '' : ''
  const introType = introMatch ? (SUBORDINATORS.has(introFirstWord) ? 'clause' : 'phrase') : null

  const firstWord = toks[0] ?? ''
  const nominalisations = toks.filter((t) => NOMINALISATION_SUFFIX.test(t) && t.length > 6)
  const hedgeHits = toks.filter((t) => HEDGES.has(t))
  const intensifierHits = toks.filter((t) => INTENSIFIERS.has(t))
  const negationHits = toks.filter((t) => NEGATIONS.has(t))
  const modalHits = toks.filter((t) => MODALS.has(t))
  const adverbHits = toks.filter((t) => /ly$/.test(t) && t.length > 4)
  const longWords = toks.filter((t) => syllables(t) >= 3)
  const syllableCount = toks.reduce((n, t) => n + syllables(t), 0)

  const trimmed = text.trim()
  const endsQuestion = /\?["'’”)\]]*$/.test(trimmed)
  const endsExclaim = /!["'’”)\]]*$/.test(trimmed)
  const startsImperative = !PRONOUNS.has(firstWord) && !SUBORDINATORS.has(firstWord) && IMPERATIVE_VERBS.test(trimmed)
  const fn = endsQuestion ? 'interrogative' : startsImperative ? 'imperative' : endsExclaim ? 'exclamative' : 'declarative'

  return {
    index,
    text,
    word_count: wc,
    character_count: text.length,
    syllable_count: syllableCount,
    average_word_length: wc ? +(toks.join('').length / wc).toFixed(2) : 0,
    long_word_count: longWords.length,
    function: fn,
    voice: passiveHits > 0 ? 'passive' : 'active',
    passive_construction_count: passiveHits,
    passive_has_named_agent: passiveHits > 0 ? byAgent : null,
    independent_clause_count: independentClauseCount,
    subordinate_clause_count: subordinateClauseCount,
    relative_clause_count: relativeClauseCount,
    clause_count: clauseCount,
    comma_count: commaCount,
    semicolon_count: semicolonCount,
    colon_count: colonCount,
    dash_count: dashCount,
    parenthesis_count: parenCount,
    coordinated_join_count: coordinatedJoins,
    splice_count: spliceCount,
    valid_boundary_count: validBoundaryCount,
    joiner: spliceCount > 0 && coordinatedJoins === 0 && semicolonCount === 0
      ? 'comma_only'
      : coordinatedJoins > 0 ? 'coordinator' : semicolonCount > 0 ? 'semicolon' : null,
    has_finite_verb: hasFiniteVerb,
    complete: hasFiniteVerb || fn === 'imperative',
    fragment: !hasFiniteVerb && fn !== 'imperative',
    presented_as_complete: /[.!?]["'\u2019\u201d)\]]*$/.test(trimmed),
    force: endsQuestion ? 'direct_question' : fn === 'imperative' ? 'command' : 'statement',
    clause_nesting_depth: subordinateClauseCount + relativeClauseCount,
    introduction: introModifierExists
      ? { exists: true, type: introType, word_count: preMainClauseWordCount }
      : { exists: false },
    intro_modifier: { exists: introModifierExists, word_count: preMainClauseWordCount },
    pre_main_clause_word_count: preMainClauseWordCount,
    main_point_delayed: preMainClauseWordCount >= 12,
    opening: /^there\s+(is|are|was|were)\b/i.test(trimmed)
      ? 'there_is'
      : /^it\s+(is|was)\b/i.test(trimmed) ? 'it_is' : firstWord,
    opens_with_pronoun: PRONOUNS.has(firstWord),
    opens_with_abstract_subject: ABSTRACT_SUBJECTS.has(firstWord),
    opens_with_conjunctive_adverb: CONJUNCTIVE_ADVERBS.has(firstWord),
    nominalisation_count: nominalisations.length,
    nominalisations,
    hedge_count: hedgeHits.length,
    hedges: hedgeHits,
    intensifier_count: intensifierHits.length,
    negation_count: negationHits.length,
    polarity_nesting_depth: negationHits.length,
    modal_count: modalHits.length,
    adverb_count: adverbHits.length,
    contains_list: /:\s*.+,.+,/.test(text),
    contains_series: seriesItems.length >= 3,
    series: seriesItems.length >= 3
      ? { item_count: seriesItems.length, items_contain_commas: seriesItems.some((i) => i.includes(',')) }
      : { item_count: 0, items_contain_commas: false },
    quotation_count: (text.match(/["“”]/g) ?? []).length,
    number_count: (text.match(/\b\d[\d,.]*\b/g) ?? []).length,
    tokens: toks
  }
}

function variance (nums) {
  if (nums.length < 2) return 0
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  return +(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length).toFixed(2)
}

function layersPresent (model) {
  const present = []
  if (model.sentences.length) present.push('signal', 'word', 'phrase', 'clause', 'sentence')
  if (model.paragraphs.length) present.push('paragraph')
  if (model.document.word_count) present.push('document')
  if (model.document.heading_count > 0) present.push('section')
  present.push('content_system')
  return [...new Set(present)]
}

export function analyze (input, { context = {} } = {}) {
  const text = clean(input)
  const paragraphTexts = text.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean)

  const sentences = []
  const paragraphs = paragraphTexts.map((ptext, pi) => {
    const local = splitSentences(ptext).map((s, si) => {
      const analysed = analyseSentence(s, sentences.length)
      analysed.paragraph_index = pi
      analysed.index_in_paragraph = si
      sentences.push(analysed)
      return analysed
    })
    const wc = local.reduce((n, s) => n + s.word_count, 0)
    return {
      index: pi,
      text: ptext,
      sentence_count: local.length,
      word_count: wc,
      average_sentence_length: local.length ? +(wc / local.length).toFixed(1) : 0,
      longest_sentence_word_count: local.reduce((n, s) => Math.max(n, s.word_count), 0),
      first_sentence: local[0]?.text ?? null,
      is_heading_like: local.length === 1 && wc <= 12 && !/[.!?]$/.test(ptext),
      passive_sentence_count: local.filter((s) => s.voice === 'passive').length,
      sentence_indexes: local.map((s) => s.index)
    }
  })

  const wordCount = sentences.reduce((n, s) => n + s.word_count, 0)
  const sentenceCount = sentences.length
  const syllableCount = sentences.reduce((n, s) => n + s.syllable_count, 0)
  const longWordCount = sentences.reduce((n, s) => n + s.long_word_count, 0)
  const passiveSentences = sentences.filter((s) => s.voice === 'passive').length

  // Flesch reading ease and Flesch-Kincaid grade (Kincaid et al., 1975).
  const asl = sentenceCount ? wordCount / sentenceCount : 0
  const asw = wordCount ? syllableCount / wordCount : 0
  const fkGrade = sentenceCount && wordCount ? +(0.39 * asl + 11.8 * asw - 15.59).toFixed(1) : null
  const fleschEase = sentenceCount && wordCount ? +(206.835 - 1.015 * asl - 84.6 * asw).toFixed(1) : null

  const document = {
    word_count: wordCount,
    sentence_count: sentenceCount,
    paragraph_count: paragraphs.length,
    average_sentence_length: +asl.toFixed(1),
    longest_sentence_word_count: sentences.reduce((n, s) => Math.max(n, s.word_count), 0),
    passive_sentence_count: passiveSentences,
    passive_ratio: sentenceCount ? +(passiveSentences / sentenceCount).toFixed(3) : 0,
    long_word_ratio: wordCount ? +(longWordCount / wordCount).toFixed(3) : 0,
    nominalisation_count: sentences.reduce((n, s) => n + s.nominalisation_count, 0),
    hedge_count: sentences.reduce((n, s) => n + s.hedge_count, 0),
    reading_grade_fk: fkGrade,
    flesch_reading_ease: fleschEase,
    has_headings: paragraphs.some((p) => p.is_heading_like),
    heading_count: paragraphs.filter((p) => p.is_heading_like).length,
    sentence_length_variance: variance(sentences.map((s) => s.word_count)),
    // CLR-015 reads this flag. The threshold is declared, not hidden: grade 12 is the
    // point at which the corpus' plain-language domain expects a diagnostic look.
    readability_metric: {
      name: 'flesch_kincaid_grade',
      value: fkGrade,
      threshold: 12,
      flag: fkGrade != null ? fkGrade > 12 : null
    }
  }

  const abbreviations = [...new Set((text.match(/\b[A-Z]{2,6}s?\b/g) ?? []).filter((a) => !['I', 'A', 'THE', 'AND'].includes(a)))]

  return {
    text,
    document,
    paragraphs,
    sentences,
    sections: [], // sections are an authoring construct; supplied by the caller when known
    abbreviation: { exists: abbreviations.length > 0, list: abbreviations, count: abbreviations.length },
    context,
    layers_present: layersPresent({ document, paragraphs, sentences })
  }
}

/** Every path this analyser sets, exposed at GET /v1/engine/facts. */
export const DERIVED_PATHS = {
  document: [
    'document.word_count', 'document.sentence_count', 'document.paragraph_count',
    'document.average_sentence_length', 'document.longest_sentence_word_count',
    'document.passive_sentence_count', 'document.passive_ratio', 'document.long_word_ratio',
    'document.nominalisation_count', 'document.hedge_count', 'document.reading_grade_fk',
    'document.flesch_reading_ease', 'document.has_headings', 'document.heading_count',
    'document.sentence_length_variance', 'document.readability_metric.value',
    'document.readability_metric.flag', 'abbreviation.exists', 'abbreviation.count'
  ],
  paragraph: [
    'paragraph.sentence_count', 'paragraph.word_count', 'paragraph.average_sentence_length',
    'paragraph.longest_sentence_word_count', 'paragraph.first_sentence', 'paragraph.is_heading_like',
    'paragraph.passive_sentence_count'
  ],
  sentence: [
    'sentence.word_count', 'sentence.character_count', 'sentence.syllable_count',
    'sentence.average_word_length', 'sentence.long_word_count', 'sentence.function',
    'sentence.voice', 'sentence.passive_construction_count', 'sentence.passive_has_named_agent',
    'sentence.independent_clause_count', 'sentence.subordinate_clause_count',
    'sentence.relative_clause_count', 'sentence.clause_count', 'sentence.comma_count',
    'sentence.semicolon_count', 'sentence.colon_count', 'sentence.dash_count',
    'sentence.parenthesis_count', 'sentence.coordinated_join_count', 'sentence.joiner',
    'sentence.intro_modifier.exists', 'sentence.intro_modifier.word_count',
    'sentence.pre_main_clause_word_count', 'sentence.main_point_delayed', 'sentence.opening',
    'sentence.opens_with_pronoun', 'sentence.opens_with_abstract_subject',
    'sentence.opens_with_conjunctive_adverb', 'sentence.nominalisation_count',
    'sentence.hedge_count', 'sentence.intensifier_count', 'sentence.negation_count',
    'sentence.polarity_nesting_depth', 'sentence.modal_count', 'sentence.adverb_count',
    'sentence.contains_list', 'sentence.contains_series', 'sentence.quotation_count',
    'sentence.number_count', 'sentence.splice_count', 'sentence.valid_boundary_count',
    'sentence.has_finite_verb', 'sentence.complete', 'sentence.fragment',
    'sentence.presented_as_complete', 'sentence.force', 'sentence.clause_nesting_depth',
    'sentence.introduction.exists', 'sentence.introduction.type', 'sentence.introduction.word_count',
    'series.item_count', 'series.items_contain_commas'
  ],
  clause: [
    'clause.voice', 'clause.nominalization_count',
    '(set only for single-clause sentences, where the sentence and the clause coincide)'
  ]
}
