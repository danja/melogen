// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { createInteractView, ROWS } from '../../src/ui/interact-view.js'

function vm (overrides = {}) {
  return {
    settings: { loop: false },
    generation: 0, round: 1, populationSize: 20, ratedCount: 0, duration: 16,
    canMore: true, canEvolve: false,
    rows: Array.from({ length: ROWS }, (_, position) => ({
      position, id: `g0-${position}`, rating: null, carried: false, origin: 'random', parents: [], playing: false
    })),
    ...overrides
  }
}

function setup () {
  const handlers = {
    onPlay: vi.fn(), onVote: vi.fn(), onDownload: vi.fn(), onMore: vi.fn(), onEvolve: vi.fn(), onNew: vi.fn()
  }
  const view = createInteractView(handlers)
  document.body.replaceChildren(view.el)
  view.render(vm())
  return { view, handlers, rows: () => [...view.el.querySelectorAll('.row')] }
}

describe('interact view', () => {
  it('draws five rows, each with play, - 0 + and download', () => {
    const { rows } = setup()
    expect(rows()).toHaveLength(5)
    for (const row of rows()) {
      expect(row.querySelector('.play')).not.toBeNull()
      expect([...row.querySelectorAll('.vote')].map(b => b.textContent)).toEqual(['−', '0', '+'])
      expect(row.querySelector('.download')).not.toBeNull()
    }
  })

  it('reports the position and rating of a vote', () => {
    const { rows, handlers } = setup()
    rows()[2].querySelector('.vote-up').click()
    rows()[3].querySelector('.vote-down').click()
    rows()[0].querySelector('.vote-zero').click()
    expect(handlers.onVote.mock.calls).toEqual([[2, 1], [3, -1], [0, 0]])
  })

  it('reports play and download by position', () => {
    const { rows, handlers } = setup()
    rows()[4].querySelector('.play').click()
    rows()[1].querySelector('.download').click()
    expect(handlers.onPlay).toHaveBeenCalledWith(4)
    expect(handlers.onDownload).toHaveBeenCalledWith(1)
  })

  it('shows the chosen vote as pressed', () => {
    const { view, rows } = setup()
    const data = vm()
    data.rows[1].rating = -1
    view.render(data)
    const pressed = [...rows()[1].querySelectorAll('.vote')].map(b => b.getAttribute('aria-pressed'))
    expect(pressed).toEqual(['true', 'false', 'false'])
    const none = [...rows()[0].querySelectorAll('.vote')].map(b => b.getAttribute('aria-pressed'))
    expect(none).toEqual(['false', 'false', 'false'])
  })

  it('shows a stop button and the playing state for the row that plays', () => {
    const { view, rows } = setup()
    const data = vm()
    data.rows[2].playing = true
    view.render(data)
    expect(rows()[2].classList.contains('playing')).toBe(true)
    expect(rows()[2].querySelector('.play').getAttribute('aria-label')).toBe('Stop melody 3')
    expect(rows()[1].querySelector('.play').getAttribute('aria-label')).toBe('Play melody 2')
  })

  it('does not rebuild the play icon when nothing changed, so a press in progress keeps its click', () => {
    const { view, rows } = setup()
    const button = rows()[0].querySelector('.play')
    const icon = button.firstChild
    view.render(vm())
    view.render(vm({ ratedCount: 1 }))
    view.render(vm(), { state: 'loading', message: 'x', error: null })
    expect(button.firstChild).toBe(icon)
    const data = vm()
    data.rows[0].playing = true
    view.render(data)
    expect(button.firstChild).not.toBe(icon)
    const stopIcon = button.firstChild
    view.render(data)
    expect(button.firstChild).toBe(stopIcon)
  })

  it('a click survives a re-render between pointer down and up', () => {
    const { view, rows, handlers } = setup()
    const button = rows()[0].querySelector('.play')
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    view.render(vm(), { state: 'loading', message: 'Loading', error: null }) // what the first touch causes
    button.click()
    expect(handlers.onPlay).toHaveBeenCalledWith(0)
  })

  it('hides rows that have no melody (the last round can be short)', () => {
    const { view, rows } = setup()
    view.render(vm({ rows: vm().rows.slice(0, 2) }))
    expect(rows().map(r => r.hidden)).toEqual([false, false, true, true, true])
  })

  it('enables More and Evolve from the view model', () => {
    const { view } = setup()
    const buttons = () => Object.fromEntries([...view.el.querySelectorAll('.action')].map(b => [b.textContent, b.disabled]))
    expect(buttons().More).toBe(false)
    expect(buttons().Evolve).toBe(true)
    view.render(vm({ canMore: false, canEvolve: true }))
    expect(buttons().More).toBe(true)
    expect(buttons().Evolve).toBe(false)
  })

  it('shows the generation and progress', () => {
    const { view } = setup()
    view.render(vm({ generation: 3, round: 2, ratedCount: 7 }))
    expect(view.el.querySelector('.run-title').textContent).toBe('Generation 4')
    expect(view.el.querySelector('.run-progress').textContent).toBe('Round 2 · 7 of 20 rated')
  })

  it('marks a carried elite as kept', () => {
    const { view, rows } = setup()
    const data = vm()
    data.rows[0].carried = true
    data.rows[0].rating = 1
    view.render(data)
    expect(rows()[0].querySelector('.origin').textContent).toBe('carried over')
    expect(rows()[0].querySelector('.origin').title).toMatch(/carried over unchanged/)
    expect(rows()[0].querySelector('.vote-up').getAttribute('aria-pressed')).toBe('true')
    expect(rows()[0].classList.contains('carried')).toBe(true)
  })

  it('the status line is never removed from the layout, so loading cannot shift the rows', () => {
    const { view } = setup()
    const notice = view.el.querySelector('.notice')
    for (const audio of [undefined, { state: 'loading', message: '', error: null }, { state: 'ready', message: 'x', error: 'bad' }, { state: 'idle', message: '', error: null }]) {
      view.render(vm(), audio)
      expect(notice.hidden).toBe(false)
      expect(notice.hasAttribute('hidden')).toBe(false)
    }
  })

  it('reports audio loading and errors', () => {
    const { view } = setup()
    const notice = view.el.querySelector('.notice')
    expect(notice.classList.contains('idle')).toBe(true)
    view.render(vm(), { state: 'loading', message: '', error: null })
    expect(notice.classList.contains('idle')).toBe(false)
    expect(notice.textContent).toMatch(/Loading the instrument/)
    view.render(vm(), { state: 'ready', message: 'x', error: 'could not load' })
    expect(notice.textContent).toBe('could not load')
    expect(notice.classList.contains('error')).toBe(true)
  })

  it('asks before throwing a run away', () => {
    vi.useFakeTimers()
    const { view, handlers } = setup()
    const fresh = [...view.el.querySelectorAll('.action')].find(b => b.textContent === 'New population')
    fresh.click()
    expect(handlers.onNew).not.toHaveBeenCalled()
    expect(fresh.textContent).toBe('Discard this run?')
    fresh.click()
    expect(handlers.onNew).toHaveBeenCalledTimes(1)
    fresh.click()
    vi.advanceTimersByTime(3500)
    expect(fresh.textContent).toBe('New population')
    expect(handlers.onNew).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
