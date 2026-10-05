import * as THREE from 'three'

/** Wire layout from GET /api/v1/meshes/{id} (see CONTRACTS.md). */
export interface Layout {
  positions: { offset: number; bytes: number }
  normals: { offset: number; bytes: number }
  indices: { offset: number; bytes: number }
  vertexCount: number
  triangleCount: number
}

export type Vec3 = [number, number, number]

/** Same normalisation window as the server (geometry.BARYCENTRIC_EPSILON). */
export const BARYCENTRIC_EPSILON = 1e-6

if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) throw new Error('A little-endian platform is required')

export interface MeshBuffers {
  positions: Float32Array
  normals: Int16Array
  indices: Uint32Array
}

/** Views over the exact wire bytes. No welding, reordering or recomputed normals. */
export function buffersFromWire(buffer: ArrayBuffer, layout: Layout): MeshBuffers {
  const positions = new Float32Array(buffer, layout.positions.offset, layout.positions.bytes / 4)
  const normals = new Int16Array(buffer, layout.normals.offset, layout.normals.bytes / 2)
  const indices = new Uint32Array(buffer, layout.indices.offset, layout.indices.bytes / 4)
  if (positions.length !== layout.vertexCount * 3 || normals.length !== layout.vertexCount * 3 ||
      indices.length !== layout.triangleCount * 3) throw new Error('Mesh buffers do not match their layout')
  for (const i of indices) if (i >= layout.vertexCount) throw new Error('Mesh index is out of range')
  return { positions, normals, indices }
}

export function geometryFromBuffers({ positions, normals, indices }: MeshBuffers): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3, true))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function corner(positions: Float32Array, indices: Uint32Array, t: number, k: number): Vec3 {
  const i = indices[t * 3 + k] * 3
  return [positions[i], positions[i + 1], positions[i + 2]]
}

export function triangle(positions: Float32Array, indices: Uint32Array, t: number): [Vec3, Vec3, Vec3] {
  return [corner(positions, indices, t, 0), corner(positions, indices, t, 1), corner(positions, indices, t, 2)]
}

/** P = A*(1-u-v) + B*u + C*v, in float64 from the float32 vertices (as the server computes it). */
export function anchorPoint(positions: Float32Array, indices: Uint32Array, t: number, u: number, v: number): Vec3 {
  const [a, b, c] = triangle(positions, indices, t)
  const w = 1 - u - v
  return [a[0] * w + b[0] * u + c[0] * v, a[1] * w + b[1] * u + c[1] * v, a[2] * w + b[2] * u + c[2] * v]
}

/** Unnormalised winding normal (B-A) x (C-A); its length is twice the triangle area. */
export function windingNormal(positions: Float32Array, indices: Uint32Array, t: number): Vec3 {
  const [a, b, c] = triangle(positions, indices, t)
  const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const f = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  return [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]]
}

/** Clamp tiny drift exactly as the server does; null when genuinely outside the triangle. */
export function normaliseWeights(u: number, v: number): [number, number] | null {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null
  if (u < -BARYCENTRIC_EPSILON || v < -BARYCENTRIC_EPSILON || u + v > 1 + BARYCENTRIC_EPSILON) return null
  u = Math.max(u, 0)
  v = Math.max(v, 0)
  if (u + v > 1) {
    const total = u + v
    u /= total
    v /= total
    if (u + v > 1) v = 1 - u
  }
  return [u, v]
}

/** Double-sided Möller–Trumbore in float64; u and v are the weights of B and C, as stored in anchors. */
export function intersectTriangle(positions: Float32Array, indices: Uint32Array, t: number, origin: Vec3, dir: Vec3):
    { distance: number; u: number; v: number } | null {
  const [a, b, c] = triangle(positions, indices, t)
  const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2]
  const fx = c[0] - a[0], fy = c[1] - a[1], fz = c[2] - a[2]
  const px = dir[1] * fz - dir[2] * fy, py = dir[2] * fx - dir[0] * fz, pz = dir[0] * fy - dir[1] * fx
  const det = ex * px + ey * py + ez * pz
  if (Math.abs(det) < 1e-15) return null
  const tx = origin[0] - a[0], ty = origin[1] - a[1], tz = origin[2] - a[2]
  const u = (tx * px + ty * py + tz * pz) / det
  if (u < -BARYCENTRIC_EPSILON || u > 1 + BARYCENTRIC_EPSILON) return null
  const qx = ty * ez - tz * ey, qy = tz * ex - tx * ez, qz = tx * ey - ty * ex
  const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) / det
  if (v < -BARYCENTRIC_EPSILON || u + v > 1 + BARYCENTRIC_EPSILON) return null
  const distance = (fx * qx + fy * qy + fz * qz) / det
  return distance > 0 ? { distance, u, v } : null
}

/** SHA-256 hex of the exact bytes of one typed array (matches the server's mesh digest parts). */
export async function sha256Hex(...views: ArrayBufferView[]): Promise<string> {
  const total = views.reduce((n, view) => n + view.byteLength, 0)
  const joined = new Uint8Array(total)
  let offset = 0
  for (const view of views) {
    joined.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), offset)
    offset += view.byteLength
  }
  const digest = await crypto.subtle.digest('SHA-256', joined)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
