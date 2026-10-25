// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createAboutView } from '../../src/ui/about-view.js'
import { JIG_SPEC_URL, REPO_URL } from '../../config.js'

describe('about view', () => {
  const { el } = createAboutView()
  document.body.replaceChildren(el)

  it('links to the Jig plugin specification', () => {
    expect(JIG_SPEC_URL).toBe('https://danja.github.io/jigdaw/')
    const link = [...el.querySelectorAll('a')].find(a => a.href === JIG_SPEC_URL)
    expect(link).toBeDefined()
    expect(link.textContent).toBe('Jig plugin specification')
  })

  it('links to the source', () => {
    expect([...el.querySelectorAll('a')].some(a => a.href === REPO_URL)).toBe(true)
  })

  it('every link is https, opens in a new tab, and cannot reach back to Melogen', () => {
    const links = [...el.querySelectorAll('a')]
    expect(links.length).toBeGreaterThanOrEqual(2)
    for (const a of links) {
      expect(a.href.startsWith('https://')).toBe(true)
      expect(a.target).toBe('_blank')
      expect(a.rel).toContain('noopener')
    }
  })

  it('describes what it is and how it works, with the four steps', () => {
    const headings = [...el.querySelectorAll('h2')].map(h => h.textContent)
    expect(headings).toEqual(['How it works', 'Settings worth knowing', 'The sound', 'Your data', 'Source'])
    const steps = [...el.querySelectorAll('ol > li > strong')].map(s => s.textContent.trim())
    expect(steps).toEqual(['Start.', 'Listen and vote.', 'Evolve.', 'Repeat.'])
    expect(el.querySelector('.lead').textContent).toMatch(/You are the judge/)
  })

  it('what it says matches what the app does', () => {
    const text = el.textContent
    for (const claim of ['Crossover swaps whole bars', 'carried over unchanged', 'did not dislike', 'checksum', 'MIT', 'works offline', 'starts a new population']) {
      expect(text, claim).toContain(claim)
    }
  })
})
