import * as THREE from 'three'
import { DEGENERATE_AREA2 } from './constants'
import { anchorPoint, intersectTriangle, normaliseWeights, windingNormal, type MeshBuffers, type Vec3 } from './geometry'

/** Hits this close along the ray are the same surface point (shared edges/vertices); metres. */
export const TIE_EPSILON = 1e-9
/** A context surface must be at least this much nearer than the host to block a click; metres. */
export const OCCLUSION_EPSILON = 1e-6

export interface Host {
  meshId: string
  object: THREE.Object3D
  buffers: MeshBuffers
}

export type PickFailure = 'miss' | 'occluded' | 'back_face' | 'degenerate'

export type PickResult =
  | { ok: true; triangle: number; u: number; v: number; local: Vec3; world: THREE.Vector3; distance: number; facing: 'front' | 'back' }
  | { ok: false; reason: PickFailure; occluder?: string }

export const PICK_MESSAGES: Record<PickFailure, string> = {
  miss: 'That click did not land on the selected structure.',
  occluded: 'Another structure is in front of that point. Hide the context or rotate.',
  back_face: 'That point is on the inside or reverse of the surface. Rotate to face it.',
  degenerate: 'That triangle has no usable area. Click slightly to one side.',
}

/**
 * Picks only the active attachment mesh, in its own (model) coordinates, so the scene transform never leaks into
 * the stored anchor. Nearest hit wins; ties prefer front-facing triangles, then the lowest triangle index.
 * Context meshes are never placement targets, but a nearer context surface blocks the click.
 */
export function pick(ray: THREE.Ray, host: Host, occluders: THREE.Object3D[] = [], allowReverse = false): PickResult {
  host.object.updateWorldMatrix(true, false)
  const inverse = host.object.matrixWorld.clone().invert()
  const origin = ray.origin.clone().applyMatrix4(inverse)
  const direction = ray.direction.clone().transformDirection(inverse)
  const o: Vec3 = [origin.x, origin.y, origin.z]
  const d: Vec3 = [direction.x, direction.y, direction.z]
  const { positions, indices } = host.buffers
  const hits: { t: number; distance: number; u: number; v: number; front: boolean }[] = []
  for (let t = 0; t < indices.length / 3; t++) {
    const hit = intersectTriangle(positions, indices, t, o, d)
    if (!hit) continue
    const n = windingNormal(positions, indices, t)
    hits.push({ t, ...hit, front: n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0 })
  }
  if (!hits.length) return { ok: false, reason: 'miss' }
  const nearest = Math.min(...hits.map((h) => h.distance))
  const tied = hits.filter((h) => h.distance <= nearest + TIE_EPSILON)
    .sort((a, b) => Number(b.front) - Number(a.front) || a.t - b.t)
  const chosen = tied[0]
  if (!chosen.front && !allowReverse) return { ok: false, reason: 'back_face' }

  if (occluders.length) {
    // Distances are comparable: viewer transforms are rigid, so local and world lengths agree.
    const blockers = new THREE.Raycaster(ray.origin, ray.direction).intersectObjects(occluders, true)
    const blocker = blockers.find((b) => b.distance < nearest - OCCLUSION_EPSILON)
    if (blocker) return { ok: false, reason: 'occluded', occluder: blocker.object.userData.meshId }
  }
  const n = windingNormal(positions, indices, chosen.t)
  if (n[0] * n[0] + n[1] * n[1] + n[2] * n[2] <= DEGENERATE_AREA2 * DEGENERATE_AREA2) return { ok: false, reason: 'degenerate' }
  const weights = normaliseWeights(chosen.u, chosen.v)
  if (!weights) return { ok: false, reason: 'miss' }
  const local = anchorPoint(positions, indices, chosen.t, weights[0], weights[1])
  const world = new THREE.Vector3(...local).applyMatrix4(host.object.matrixWorld)
  return { ok: true, triangle: chosen.t, u: weights[0], v: weights[1], local, world, distance: nearest,
           facing: chosen.front ? 'front' : 'back' }
}
