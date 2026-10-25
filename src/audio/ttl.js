// A parser for the subset of Turtle that jigdaw's generated profiles use:
//
//   @prefix / @base, subject blocks with `;` and `,` lists, IRIs, prefixed
//   names, `a`, string literals (with escapes, @lang and ^^datatype), numbers,
//   booleans and # comments.
//
// Blank nodes ([ ]), collections ( ) and long strings are NOT supported. They
// are a parse error with a line number rather than being skipped, because a
// profile that silently loses a digest is how unverified code gets run.

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const XSD = 'http://www.w3.org/2001/XMLSchema#'

export class TurtleError extends Error {
  constructor (message, line) {
    super(`line ${line}: ${message}`)
    this.name = 'TurtleError'
    this.line = line
  }
}

const NAME = '[A-Za-z0-9_\\-]'
const PNAME = new RegExp(`^([A-Za-z][A-Za-z0-9_\\-]*)?:(${NAME}+(?:\\.${NAME}+)*)?`)
const NUMBER = /^[+-]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?/
const WORD = /^[A-Za-z][A-Za-z0-9_-]*/

function unescape (raw, line) {
  return raw.replace(/\\(u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|.)/g, (_, code) => {
    switch (code[0]) {
      case 'n': return '\n'
      case 't': return '\t'
      case 'r': return '\r'
      case 'b': return '\b'
      case 'f': return '\f'
      case '"': return '"'
      case "'": return "'"
      case '\\': return '\\'
      case 'u': case 'U': return String.fromCodePoint(parseInt(code.slice(1), 16))
      default: throw new TurtleError(`unknown escape \\${code}`, line)
    }
  })
}

/** Split text into tokens: { type, value, line }. */
export function tokenize (text) {
  const tokens = []
  let pos = 0
  let line = 1
  const push = (type, value, extra = {}) => tokens.push({ type, value, line, ...extra })

  while (pos < text.length) {
    const c = text[pos]
    if (c === '\n') { line++; pos++; continue }
    if (c === ' ' || c === '\t' || c === '\r') { pos++; continue }
    if (c === '#') {
      while (pos < text.length && text[pos] !== '\n') pos++
      continue
    }
    if (c === '<') {
      const end = text.indexOf('>', pos)
      if (end < 0) throw new TurtleError('unterminated IRI', line)
      const iri = text.slice(pos + 1, end)
      if (/[\s<"{}|^`]/.test(iri)) throw new TurtleError(`illegal character in IRI <${iri}>`, line)
      push('iri', iri)
      pos = end + 1
      continue
    }
    if (c === '"') {
      if (text.startsWith('"""', pos)) throw new TurtleError('long strings are not supported', line)
      let end = pos + 1
      while (end < text.length && text[end] !== '"') {
        if (text[end] === '\n') throw new TurtleError('newline in string', line)
        end += text[end] === '\\' ? 2 : 1
      }
      if (end >= text.length) throw new TurtleError('unterminated string', line)
      push('string', unescape(text.slice(pos + 1, end), line))
      pos = end + 1
      continue
    }
    if (c === '@') {
      const word = WORD.exec(text.slice(pos + 1))
      if (!word) throw new TurtleError('stray @', line)
      push(word[0] === 'prefix' || word[0] === 'base' ? 'directive' : 'lang', word[0])
      pos += 1 + word[0].length
      continue
    }
    if (text.startsWith('^^', pos)) { push('datatype', '^^'); pos += 2; continue }
    if (';,.'.includes(c)) {
      // A '.' directly before a digit belongs to a number such as .5
      if (!(c === '.' && /\d/.test(text[pos + 1] ?? ''))) { push('punct', c); pos++; continue }
    }
    if ('[]()'.includes(c)) {
      throw new TurtleError(`"${c}" (blank nodes and collections) is not supported`, line)
    }
    const number = NUMBER.exec(text.slice(pos))
    if (number && (/[\d+\-.]/.test(c))) {
      push('number', number[0])
      pos += number[0].length
      continue
    }
    const pname = PNAME.exec(text.slice(pos))
    if (pname) {
      push('pname', pname[0], { prefix: pname[1] ?? '', local: pname[2] ?? '' })
      pos += pname[0].length
      continue
    }
    const word = WORD.exec(text.slice(pos))
    if (word) {
      push('word', word[0])
      pos += word[0].length
      continue
    }
    throw new TurtleError(`unexpected character "${c}"`, line)
  }
  return tokens
}

const iri = value => ({ type: 'iri', value })
const literal = (value, datatype, lang) => ({ type: 'literal', value, datatype, lang })

/**
 * @param text Turtle
 * @param options { base } resolves relative IRIs; overrides any @base in the text
 * @returns { triples: [{ s, p, o }], prefixes }
 */
export function parseTurtle (text, { base = null } = {}) {
  const tokens = tokenize(text)
  const prefixes = {}
  let currentBase = base
  let forcedBase = base !== null
  const triples = []
  let at = 0

  const peek = () => tokens[at]
  const lastLine = () => tokens[tokens.length - 1]?.line ?? 1
  const take = () => {
    if (at >= tokens.length) throw new TurtleError('unexpected end of input', lastLine())
    return tokens[at++]
  }
  const expectPunct = (value) => {
    const t = take()
    if (t.type !== 'punct' || t.value !== value) throw new TurtleError(`expected "${value}"`, t.line)
    return t
  }

  const resolve = (relative, line) => {
    try {
      if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(relative)) return relative
      if (!currentBase) throw new Error('no base')
      return new URL(relative, currentBase).href
    } catch {
      throw new TurtleError(`cannot resolve <${relative}>${currentBase ? '' : ' (no @base)'}`, line)
    }
  }

  const expand = (token) => {
    if (token.type === 'iri') return iri(resolve(token.value, token.line))
    if (token.type === 'pname') {
      const namespace = prefixes[token.prefix]
      if (namespace === undefined) throw new TurtleError(`unknown prefix "${token.prefix}:"`, token.line)
      return iri(namespace + token.local)
    }
    throw new TurtleError(`expected an IRI, found ${token.type} "${token.value}"`, token.line)
  }

  const subjectTerm = () => {
    const t = take()
    if (t.type === 'iri' || t.type === 'pname') return expand(t)
    throw new TurtleError(`expected a subject, found ${t.type} "${t.value}"`, t.line)
  }

  const verbTerm = () => {
    const t = take()
    if (t.type === 'word' && t.value === 'a') return iri(RDF_TYPE)
    if (t.type === 'iri' || t.type === 'pname') return expand(t)
    throw new TurtleError(`expected a predicate, found ${t.type} "${t.value}"`, t.line)
  }

  const objectTerm = () => {
    const t = take()
    switch (t.type) {
      case 'iri': case 'pname': return expand(t)
      case 'number': {
        const datatype = /[eE]/.test(t.value) ? 'double' : t.value.includes('.') ? 'decimal' : 'integer'
        return literal(t.value, XSD + datatype)
      }
      case 'word':
        if (t.value === 'true' || t.value === 'false') return literal(t.value, XSD + 'boolean')
        throw new TurtleError(`unexpected "${t.value}"`, t.line)
      case 'string': {
        const next = peek()
        if (next?.type === 'lang') { at++; return literal(t.value, undefined, next.value) }
        if (next?.type === 'datatype') { at++; return literal(t.value, expand(take()).value) }
        return literal(t.value, XSD + 'string')
      }
      default: throw new TurtleError(`expected an object, found ${t.type} "${t.value}"`, t.line)
    }
  }

  while (at < tokens.length) {
    const t = peek()
    if (t.type === 'directive') {
      at++
      if (t.value === 'prefix') {
        const name = take()
        if (name.type !== 'pname' || name.local !== '') throw new TurtleError('expected a prefix name such as "ex:"', name.line)
        const target = take()
        if (target.type !== 'iri') throw new TurtleError('expected an IRI after the prefix name', target.line)
        prefixes[name.prefix] = resolve(target.value, target.line)
      } else {
        const target = take()
        if (target.type !== 'iri') throw new TurtleError('expected an IRI after @base', target.line)
        if (!forcedBase) currentBase = resolve(target.value, target.line)
      }
      expectPunct('.')
      continue
    }

    const s = subjectTerm()
    for (;;) {
      const p = verbTerm()
      for (;;) {
        triples.push({ s, p, o: objectTerm() })
        const next = peek()
        if (next?.type === 'punct' && next.value === ',') { at++; continue }
        break
      }
      const next = take()
      if (next.type === 'punct' && next.value === ';') {
        // Turtle allows repeated or trailing semicolons.
        while (peek()?.type === 'punct' && peek().value === ';') at++
        if (peek()?.type === 'punct' && peek().value === '.') { at++; break }
        continue
      }
      if (next.type === 'punct' && next.value === '.') break
      throw new TurtleError(`expected ";" or "." but found ${next.type} "${next.value}"`, next.line)
    }
  }
  return { triples, prefixes }
}

/** Index triples for lookup: graph.objects(subjectIri, predicateIri). */
export function indexTriples (triples) {
  const bySubject = new Map()
  for (const { s, p, o } of triples) {
    let predicates = bySubject.get(s.value)
    if (!predicates) bySubject.set(s.value, predicates = new Map())
    const list = predicates.get(p.value)
    if (list) list.push(o)
    else predicates.set(p.value, [o])
  }
  return {
    objects: (subject, predicate) => bySubject.get(subject)?.get(predicate) ?? [],
    first (subject, predicate) { return this.objects(subject, predicate)[0] },
    has: subject => bySubject.has(subject),
    /** Subjects that have at least one statement with this predicate. */
    subjectsWith: predicate => [...bySubject].filter(([, predicates]) => predicates.has(predicate)).map(([subject]) => subject)
  }
}
