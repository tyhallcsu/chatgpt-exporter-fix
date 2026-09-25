// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'
import {
    findThreadContainer,
    getConversationTurns,
    hasRenderedConversation,
} from '../src/utils/threadDom'

/** Current shell: turns are keyed by `data-turn-key` inside a marked thread. */
const CURRENT_THREAD = `
<main>
  <div data-app-action-timeline-scroll>
    <div data-thread-find-target="conversation" data-chatgpt-conversation-selection-target="true">
      <div data-turn-key="turn-1">
        <div data-user-message-bubble></div>
        <div data-conversation-role="assistant" data-chatgpt-selection-message-id="m-1"></div>
      </div>
      <div data-turn-key="turn-2">
        <div data-user-message-bubble></div>
        <div data-conversation-role="assistant" data-chatgpt-selection-message-id="m-2"></div>
      </div>
    </div>
  </div>
</main>`

/** Retired shell: `data-testid` turn hooks inside `#thread`. */
const LEGACY_THREAD = `
<main>
  <div data-scroll-root>
    <div id="thread">
      <div data-testid="conversation-turn-1"><div data-message-id="m-1"></div></div>
      <div data-testid="conversation-turn-2"><div data-message-id="m-2"></div></div>
    </div>
  </div>
</main>`

/**
 * A staged rollout can serve both generations of markup at once. Counting the
 * union would double every turn, so detection must settle on one generation.
 */
const MIXED_THREAD = `
<main>
  <div data-thread-find-target="conversation">
    <div data-turn-key="turn-1" data-testid="conversation-turn-1"></div>
    <div data-turn-key="turn-2" data-testid="conversation-turn-2"></div>
  </div>
</main>`

const EMPTY_PAGE = `<main><div data-app-action-timeline-scroll></div></main>`

beforeEach(() => {
    document.body.innerHTML = ''
})

describe('getConversationTurns', () => {
    it('finds turns in the current shell', () => {
        document.body.innerHTML = CURRENT_THREAD
        expect(getConversationTurns(document)).toHaveLength(2)
    })

    it('still finds turns in the retired shell', () => {
        document.body.innerHTML = LEGACY_THREAD
        expect(getConversationTurns(document)).toHaveLength(2)
    })

    it('counts each turn once when both generations are present', () => {
        document.body.innerHTML = MIXED_THREAD
        expect(getConversationTurns(document)).toHaveLength(2)
    })

    it('returns nothing on a page with no conversation', () => {
        document.body.innerHTML = EMPTY_PAGE
        expect(getConversationTurns(document)).toHaveLength(0)
    })
})

describe('hasRenderedConversation', () => {
    it('gates exports on the current shell', () => {
        document.body.innerHTML = CURRENT_THREAD
        expect(hasRenderedConversation(document)).toBe(true)
    })

    it('gates exports on the retired shell', () => {
        document.body.innerHTML = LEGACY_THREAD
        expect(hasRenderedConversation(document)).toBe(true)
    })

    it('is false before a conversation is started', () => {
        document.body.innerHTML = EMPTY_PAGE
        expect(hasRenderedConversation(document)).toBe(false)
    })
})

describe('findThreadContainer', () => {
    it('prefers the element ChatGPT marks as the conversation', () => {
        document.body.innerHTML = CURRENT_THREAD
        const turns = getConversationTurns(document)
        const thread = findThreadContainer(turns, document)

        expect(thread).toBe(document.querySelector('[data-thread-find-target="conversation"]'))
    })

    it('uses the retired #thread container when that is what is rendered', () => {
        document.body.innerHTML = LEGACY_THREAD
        const turns = getConversationTurns(document)

        expect(findThreadContainer(turns, document)).toBe(document.querySelector('#thread'))
    })

    it('falls back to the common ancestor when no container is marked', () => {
        document.body.innerHTML = `
          <main><div class="plain-wrapper">
            <div data-turn-key="a"></div>
            <div data-turn-key="b"></div>
          </div></main>`
        const turns = getConversationTurns(document)

        expect(findThreadContainer(turns, document)).toBe(document.querySelector('.plain-wrapper'))
    })

    it('ignores a marked container that does not actually hold the turns', () => {
        document.body.innerHTML = `
          <main>
            <div data-thread-find-target="conversation"></div>
            <div class="real-thread">
              <div data-turn-key="a"></div>
              <div data-turn-key="b"></div>
            </div>
          </main>`
        const turns = getConversationTurns(document)

        expect(findThreadContainer(turns, document)).toBe(document.querySelector('.real-thread'))
    })
})
