import { describe, expect, it } from 'vitest'
import { MAX_PRIMITIVES, hexToRgb, majorAxis, packFeatureShape, parseFeatureShape, primitiveCount, type FeatureShape } from '../../lib/feature-shape'

// One right triangle in the z = 0 plane (normal +z), 10 cm legs.
const positions = new Float32Array([0, 0, 0, 0.1, 0, 0, 0, 0.1, 0])
const indices = new Uint32Array([0, 1, 2])
const at = (u: number, v: number) => ({ triangle: 0, u, v })
const shape: FeatureShape = { v: 1, role: 'feature', shapes: [
  { type: 'oval', at: at(0.2, 0.2), rx: 6, ry: 3, angle: 0 },
  { type: 'line', points: [at(0.1, 0.1), at(0.5, 0.1), at(0.5, 0.3)], width: 2 },
] }

describe('feature shapes', () => {
  it('accepts a well-formed shape and rejects malformed ones', () => {
    expect(parseFeatureShape(shape, 1)).toBe(shape)
    expect(parseFeatureShape(null)).toBeNull()
    expect(parseFeatureShape({ ...shape, v: 2 })).toBeNull()
    expect(parseFeatureShape({ ...shape, role: 'muscle' })).toBeNull()
    expect(parseFeatureShape({ ...shape, shapes: [] })).toBeNull()
    expect(parseFeatureShape(shape, 0)).toBeNull()                                                        // triangle outside the mesh
    expect(parseFeatureShape({ ...shape, shapes: [{ type: 'oval', at: at(0.7, 0.7), rx: 5, ry: 5, angle: 0 }] })).toBeNull()   // u + v > 1
    expect(parseFeatureShape({ ...shape, shapes: [{ type: 'oval', at: at(0.2, 0.2), rx: 90, ry: 5, angle: 0 }] })).toBeNull()  // too large
    expect(parseFeatureShape({ ...shape, shapes: [{ type: 'line', points: [at(0.1, 0.1)], width: 2 }] })).toBeNull()          // a line needs 2 points
    const long = { v: 1, role: 'origin', shapes: Array.from({ length: 2 }, () => ({ type: 'line', points: Array.from({ length: 40 }, () => at(0.1, 0.1)), width: 1 })) }
    expect(parseFeatureShape(long)).toBeNull()                                                            // 78 segments > 64
  })

  it('packs ovals and line segments in metres', () => {
    expect(primitiveCount(shape)).toBe(3)
    const p = packFeatureShape(positions, indices, shape)
    expect(p.count).toBe(3)
    expect([...p.p0.slice(0, 4)].map((x) => +x.toFixed(4))).toEqual([0.02, 0.02, 0, 0])                // oval centre, flag 0
    expect(+p.p1[3].toFixed(4)).toBe(0.006)                                                              // rx 6 mm
    expect([...p.p2.slice(0, 4)].map((x) => +x.toFixed(4))).toEqual([0, 0, 1, 0.003])                   // normal, ry 3 mm
    expect([...p.p0.slice(4, 8)].map((x) => +x.toFixed(4))).toEqual([0.01, 0.01, 0, 1])                 // first segment start, flag 1
    expect(+p.p2[7].toFixed(4)).toBe(0.001)                                                              // half of 2 mm
    expect(packFeatureShape(positions, indices, null).count).toBe(0)
    expect(MAX_PRIMITIVES).toBe(64)
  })

  it('measures oval angles from model +Y on the surface', () => {
    const a0 = majorAxis([0, 0, 1], 0), a90 = majorAxis([0, 0, 1], 90)
    expect(a0.map((x) => +x.toFixed(6))).toEqual([0, 1, 0])
    expect(a90.map((x) => Math.abs(+x.toFixed(6)))).toEqual([1, 0, 0])
    expect(hexToRgb('#ff8000').map((x) => +x.toFixed(3))).toEqual([1, 0.502, 0])
  })
})
