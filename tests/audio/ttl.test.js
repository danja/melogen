import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseTurtle, tokenize, indexTriples, TurtleError } from '../../src/audio/ttl.js'

const parse = (text, base = 'https://x.test/p/') => parseTurtle(text, { base }).triples
const XSD = 'http://www.w3.org/2001/XMLSchema#'

describe('turtle subset parser', () => {
  it('parses prefixes, a, lists and literals', () => {
    const triples = parse(`
      @prefix ex: <http://e.test/> .
      <> a ex:Thing , ex:Other ;
         ex:name "A \\"quoted\\" name\\n" ;
         ex:n 3 , -2.5 , 1e3 ;
         ex:flag true .
    `)
    expect(triples).toHaveLength(7)
    expect(triples[0]).toEqual({
      s: { type: 'iri', value: 'https://x.test/p/' },
      p: { type: 'iri', value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' },
      o: { type: 'iri', value: 'http://e.test/Thing' }
    })
    expect(triples[2].o).toEqual({ type: 'literal', value: 'A "quoted" name\n', datatype: XSD + 'string', lang: undefined })
    expect(triples.slice(3, 6).map(t => [t.o.value, t.o.datatype])).toEqual([
      ['3', XSD + 'integer'], ['-2.5', XSD + 'decimal'], ['1e3', XSD + 'double']])
    expect(triples[6].o.datatype).toBe(XSD + 'boolean')
  })

  it('resolves relative IRIs and fragments against the base', () => {
    const triples = parse('<#a> <p/q> <file.wasm> .')
    expect(triples[0].s.value).toBe('https://x.test/p/#a')
    expect(triples[0].p.value).toBe('https://x.test/p/p/q')
    expect(triples[0].o.value).toBe('https://x.test/p/file.wasm')
  })

  it('uses the given base over an @base directive', () => {
    const forced = parseTurtle('@base <https://other.test/> .\n<> <p:x> <f> .', { base: 'https://mine.test/d/' })
    expect(forced.triples[0].s.value).toBe('https://mine.test/d/')
    expect(forced.triples[0].o.value).toBe('https://mine.test/d/f')
    const own = parseTurtle('@base <https://other.test/> .\n<> <p:x> <f> .')
    expect(own.triples[0].o.value).toBe('https://other.test/f')
  })

  it('does not treat # inside IRIs or strings as a comment', () => {
    const triples = parse('<#m> <http://e.test/p> "a # b" . # a real comment\n<#n> <http://e.test/p> <#m> .')
    expect(triples).toHaveLength(2)
    expect(triples[0].o.value).toBe('a # b')
    expect(triples[1].o.value).toBe('https://x.test/p/#m')
  })

  it('accepts a trailing semicolon, language tags and datatypes', () => {
    const triples = parse(`@prefix ex: <http://e.test/> . @prefix xsd: <${XSD}> .
      <> ex:a "x"@en ; ex:b "7"^^xsd:integer ; .`)
    expect(triples[0].o.lang).toBe('en')
    expect(triples[1].o.datatype).toBe(XSD + 'integer')
  })

  it('handles a statement ending right after a prefixed name', () => {
    const triples = parse('@prefix ex: <http://e.test/> .\n<> ex:p ex:q.')
    expect(triples[0].o.value).toBe('http://e.test/q')
  })

  it('reports errors with line numbers instead of skipping', () => {
    const cases = [
      ['<> <p:x> [ <p:y> 1 ] .', /line 1.*blank nodes/],
      ['\n\n<> <p:x> ( 1 2 ) .', /line 3/],
      ['<> nope:x 1 .', /unknown prefix "nope:"/],
      ['<> <p:x> """long""" .', /long strings/],
      ['<> <p:x> "open', /unterminated string/],
      ['<> <p:x> 1', /unexpected end of input/],
      ['<> <p:x> 1 2 .', /expected ";" or "\."/],
      ['<a b> <p:x> 1 .', /illegal character in IRI/]
    ]
    for (const [text, pattern] of cases) {
      expect(() => parse(text), text).toThrow(TurtleError)
      expect(() => parse(text), text).toThrow(pattern)
    }
  })

  it('needs a base for relative IRIs', () => {
    expect(() => parseTurtle('<a> <p:x> 1 .')).toThrow(/no @base/)
  })

  it('tokenizes with line numbers', () => {
    const tokens = tokenize('<a>\n<b>\n\n<c>')
    expect(tokens.map(t => t.line)).toEqual([1, 2, 4])
  })

  it('indexes by subject and predicate in order', () => {
    const graph = indexTriples(parse('<#s> <http://e.test/p> 1 , 2 , 3 .'))
    expect(graph.objects('https://x.test/p/#s', 'http://e.test/p').map(o => o.value)).toEqual(['1', '2', '3'])
    expect(graph.first('https://x.test/p/#s', 'http://e.test/nothing')).toBeUndefined()
    expect(graph.has('https://x.test/p/#s')).toBe(true)
  })
})

describe('real profiles', () => {
  const dir = join(import.meta.dirname, '..', 'fixtures')
  for (const file of readdirSync(dir).filter(f => f.endsWith('.ttl'))) {
    it(`parses ${file}`, () => {
      const { triples } = parseTurtle(readFileSync(join(dir, file), 'utf8'), { base: 'https://strandz.it/jigdaw/plugins/x/' })
      expect(triples.length).toBeGreaterThan(40)
    })
  }
})
