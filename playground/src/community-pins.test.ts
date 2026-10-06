import { describe, expect, it } from 'vitest'
import { communityPins } from '../../app/published-pins'

const G = 'a'.repeat(64)
const row = (id: string, landmark: string, extra: Partial<Parameters<typeof communityPins>[0][number]> = {}) => ({
  id, landmark_id: landmark, label: landmark, latin_name: null, description: null, geometry: G,
  triangle: 1, u: 0.2, v: 0.3, author_id: null, pg_profiles: null, ...extra,
})

describe('communityPins (homepage)', () => {
  it('shows one pin per feature: the best-voted, newest on a tie', () => {
    // Rows arrive newest first, as the homepage asks for them.
    const rows = [row('new', 'f1'), row('old', 'f1'), row('voted', 'f2'), row('plain', 'f2')]
    const totals = [{ proposal_id: 'voted', upvotes: 2, downvotes: 0 }, { proposal_id: 'plain', upvotes: 1, downvotes: 1 }]
    const pins = communityPins(rows, totals, new Set(), G)
    expect(pins.map((p) => [p.id, p.proposal, p.upvotes])).toEqual([['f1', 'new', 0], ['f2', 'voted', 2]])
  })

  it('leaves out published features, other geometry and malformed anchors', () => {
    const rows = [row('a', 'published'), row('b', 'other', { geometry: 'b'.repeat(64) }), row('c', 'bad', { u: 0.8, v: 0.4 }), row('d', 'ok')]
    expect(communityPins(rows, [], new Set(['published']), G).map((p) => p.id)).toEqual(['ok'])
  })

  it('names the contributor, or marks a starter pin', () => {
    const rows = [row('a', 'starter'), row('b', 'named', { author_id: 'u1', pg_profiles: { display_name: 'Asha' } }), row('c', 'unnamed', { author_id: 'u2' })]
    const by = Object.fromEntries(communityPins(rows, [], new Set(), G).map((p) => [p.id, p.by]))
    expect(by).toEqual({ starter: null, named: 'Asha', unnamed: '' })
  })
})
