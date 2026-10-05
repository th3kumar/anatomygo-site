import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { anchorPoint, geometryFromBuffers, windingNormal, type MeshBuffers, type Vec3 } from './geometry'
import { pick, type Host, type PickResult } from './picking'

/** Model axes: +X patient left, +Y superior, +Z anterior (right-side structures sit at negative X). */
export const VIEWS = {
  anterior: { dir: [0, 0, 1], up: [0, 1, 0], label: 'Anterior' },
  posterior: { dir: [0, 0, -1], up: [0, 1, 0], label: 'Posterior' },
  right: { dir: [-1, 0, 0], up: [0, 1, 0], label: 'Right' },
  left: { dir: [1, 0, 0], up: [0, 1, 0], label: 'Left' },
  superior: { dir: [0, 1, 0], up: [0, 0, -1], label: 'Superior' },
  inferior: { dir: [0, -1, 0], up: [0, 0, 1], label: 'Inferior' },
  oblique: { dir: [-0.6, 0.35, 0.72], up: [0, 1, 0], label: 'Oblique' },
} as const
export type ViewName = keyof typeof VIEWS

const AXES: { dir: Vec3; label: string; colour: string }[] = [
  { dir: [0, 1, 0], label: 'S', colour: '#7f97bd' }, { dir: [0, -1, 0], label: 'I', colour: '#7f97bd' },
  { dir: [1, 0, 0], label: 'L', colour: '#c98276' }, { dir: [-1, 0, 0], label: 'R', colour: '#c98276' },
  { dir: [0, 0, 1], label: 'A', colour: '#6fb08f' }, { dir: [0, 0, -1], label: 'P', colour: '#6fb08f' },
]

/** System colours and the light rig from anatomygo.in (app/anatomy.ts, app/lighting.ts), so a structure looks the same. */
const SYSTEM_COLOURS: Record<string, string> = {
  skeletal: '#e2d9ba', muscular: '#a85b50', cardiac: '#b96760', sensory: '#b0c8ce', arterial: '#c05245', venous: '#527c9f',
  nervous: '#d8b565', respiratory: '#b98991', digestive: '#b8916b', urinary: '#b47961', lymphatic: '#879f7c',
  endocrine: '#c5a09a', reproductive: '#bda098', integumentary: '#ba9b7d', connective: '#aec3bb',
}
const RIG = { key: 4.4, fill: 0.4, rim: 2.1, hemisphere: 0.42, environment: 0.08 }
const KEY_DIRECTION: Vec3 = (() => { const h = (0.1993 - 0.5) * 4, v = (0.5 - 0.0957) * 4, l = Math.hypot(h, v, 1); return [h / l, v / l, 1 / l] })()
const FILL_DIRECTION: Vec3 = [0.7, 0.15, 0.9]
const RIM_DIRECTION: Vec3 = [0.6982, 0.5141, -0.4982]
const PALETTES = {
  dark: { pin: '#d6d9de', reviewed: '#8fcaa6', selected: '#7fdcc9', muted: '#6b7078', back: '#4a3b3a', context: '#8c969f' },
  light: { pin: '#536875', reviewed: '#3f8a63', selected: '#1f8a7c', muted: '#a4aeb8', back: '#b8a39e', context: '#7d8892' },
}

export interface ScenePin { id: string; label: string; triangle: number; u: number; v: number; muted?: boolean; reviewed?: boolean }
export interface CameraState { position: Vec3; target: Vec3; up: Vec3 }
export type Mode = 'orbit' | 'place' | 'reposition'

export interface SceneCallbacks {
  onPlace(result: PickResult & { ok: true }): void
  onPickRefused(result: PickResult & { ok: false }): void
  onHover(result: PickResult | null): void
  onPinClick(id: string): void
  onRepositionPreview(result: PickResult & { ok: true }): void
  onRepositionCommit(result: PickResult & { ok: true }): void
  onRepositionCancel(): void
  onCameraChange(state: CameraState): void
}

const CLICK_PIXELS = 4
const CLICK_MS = 400
const PIN_HIT_PIXELS = 14

export class SceneController {
  readonly renderer: THREE.WebGLRenderer
  private resizeObserver: ResizeObserver
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(30, 1, 0.001, 50)
  private controls: OrbitControls
  private root = new THREE.Group()
  private hostGroup = new THREE.Group()
  private host: (Host & { front: THREE.Mesh; back: THREE.Mesh; radius: number }) | null = null
  private context = new Map<string, THREE.Mesh>()
  private pins: (ScenePin & { local: THREE.Vector3; normal: THREE.Vector3 })[] = []
  private pinInput: ScenePin[] = []
  private palette = PALETTES.dark
  private environment: THREE.Texture
  private pinGroup = new THREE.Group()
  private ghost: THREE.Mesh
  private frame = 0
  private down: { x: number; y: number; at: number; onPin: string | null } | null = null
  private dragging: { pinId: string; last: (PickResult & { ok: true }) | null } | null = null
  private visibility = new Map<string, boolean>()
  private visibilityTimer = 0
  private insets = { left: 0, right: 0, top: 0, bottom: 0 }
  private lastFit: ViewName | null = null
  private animation = 0
  mode: Mode = 'orbit'
  allowReverse = false
  contextBlocks = true
  showHidden = false
  showOtherLabels = true
  selected: string | null = null

  constructor(private container: HTMLElement, private labels: HTMLElement, private axes: SVGSVGElement,
              private callbacks: SceneCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)  // The page draws the stage gradient behind the canvas.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    this.environment = pmrem.fromScene(room, 0.04).texture
    this.scene.environment = this.environment
    room.dispose(); pmrem.dispose()
    container.appendChild(this.renderer.domElement)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = false
    this.controls.zoomToCursor = true
    this.controls.addEventListener('change', () => { this.invalidate(); this.scheduleVisibility(); this.emitCamera() })
    this.controls.addEventListener('start', () => { this.lastFit = null; cancelAnimationFrame(this.animation) })
    // Key, fill and rim follow the camera, so every view of the structure is lit the same way.
    for (const [colour, intensity, direction] of [['#fff5e8', RIG.key, KEY_DIRECTION], ['#e6f0ff', RIG.fill, FILL_DIRECTION],
                                                  ['#d9e6ff', RIG.rim, RIM_DIRECTION]] as [string, number, Vec3][]) {
      const light = new THREE.DirectionalLight(colour, intensity)
      light.position.set(...direction)
      this.camera.add(light, light.target)
    }
    this.scene.add(this.camera, new THREE.HemisphereLight('#ffffff', '#6d737a', RIG.hemisphere), this.root)
    this.root.add(this.hostGroup, this.pinGroup)
    this.ghost = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#7fdcc9', depthTest: false, transparent: true, opacity: 0.9, toneMapped: false }))
    this.ghost.renderOrder = 10
    this.ghost.visible = false
    this.root.add(this.ghost)
    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.pointerDown)
    el.addEventListener('pointermove', this.pointerMove)
    el.addEventListener('pointerup', this.pointerUp)
    el.addEventListener('pointerleave', this.pointerLeave)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    ;(window as unknown as { __playgroundStats: () => unknown }).__playgroundStats = () => this.stats()
  }

  dispose() {
    this.resizeObserver.disconnect()
    cancelAnimationFrame(this.frame)
    cancelAnimationFrame(this.animation)
    window.clearTimeout(this.visibilityTimer)
    this.clearHost()
    this.setContext([])
    this.environment.dispose()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  /** Shows one attachment mesh, centred by a scene transform (the source geometry is never changed). */
  setHost(meshId: string, buffers: MeshBuffers, system = 'skeletal') {
    this.clearHost()
    const geometry = geometryFromBuffers(buffers)
    const front = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: SYSTEM_COLOURS[system] ?? SYSTEM_COLOURS.skeletal,
      metalness: 0.08, roughness: 0.53, envMapIntensity: RIG.environment, side: THREE.FrontSide }))
    // The inside of the surface has its own muted tone, so a view through a gap reads as the reverse side.
    const back = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: this.palette.back, roughness: 1, metalness: 0,
      envMapIntensity: 0.04, side: THREE.BackSide }))
    front.userData.meshId = meshId
    this.hostGroup.add(front, back)
    const sphere = geometry.boundingSphere!
    this.root.position.copy(sphere.center).negate()
    this.host = { meshId, object: front, buffers, front, back, radius: sphere.radius }
    this.setPins(this.pinInput)
  }

  private clearHost() {
    if (!this.host) return
    this.host.front.geometry.dispose()
    ;(this.host.front.material as THREE.Material).dispose()
    ;(this.host.back.material as THREE.Material).dispose()
    this.hostGroup.clear()
    this.host = null
  }

  /** Neighbouring meshes: subdued, never placement targets, but they block clicks when visible. */
  setContext(meshes: { meshId: string; buffers: MeshBuffers }[]) {
    const wanted = new Set(meshes.map((m) => m.meshId))
    for (const [id, mesh] of this.context) {
      if (!wanted.has(id)) {
        mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.removeFromParent(); this.context.delete(id)
      }
    }
    for (const m of meshes) {
      if (this.context.has(m.meshId)) continue
      const mesh = new THREE.Mesh(geometryFromBuffers(m.buffers), new THREE.MeshStandardMaterial({
        color: this.palette.context, transparent: true, opacity: 0.2, depthWrite: false, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: RIG.environment }))
      mesh.userData.meshId = m.meshId
      mesh.renderOrder = 2
      this.root.add(mesh)
      this.context.set(m.meshId, mesh)
    }
    this.scheduleVisibility()
    this.invalidate()
  }

  /** Pin, needle and interior colours for the light or dark page. */
  setDark(dark: boolean) {
    this.palette = dark ? PALETTES.dark : PALETTES.light
    if (this.host) (this.host.back.material as THREE.MeshStandardMaterial).color.set(this.palette.back)
    for (const mesh of this.context.values()) (mesh.material as THREE.MeshStandardMaterial).color.set(this.palette.context)
    ;(this.ghost.material as THREE.MeshBasicMaterial).color.set(this.palette.selected)
    this.setPins(this.pinInput)
  }

  setPins(pins: ScenePin[]) {
    this.pinInput = pins
    this.pinGroup.children.forEach((c) => { (c as THREE.Mesh).geometry?.dispose(); ((c as THREE.Mesh).material as THREE.Material)?.dispose() })
    this.pinGroup.clear()
    this.pins = []
    if (!this.host) { this.pins = pins.map((p) => ({ ...p, local: new THREE.Vector3(), normal: new THREE.Vector3() })); return }
    const { positions, indices } = this.host.buffers
    const length = this.needleLength()
    for (const p of pins) {
      if (p.triangle * 3 + 2 >= indices.length) continue
      const local = new THREE.Vector3(...anchorPoint(positions, indices, p.triangle, p.u, p.v))
      const normal = new THREE.Vector3(...windingNormal(positions, indices, p.triangle)).normalize()
      this.pins.push({ ...p, local, normal })
      const selected = p.id === this.selected
      const pal = this.palette
      const colour = selected ? pal.selected : p.muted ? pal.muted : p.reviewed ? pal.reviewed : pal.pin
      const needle = new THREE.Line(new THREE.BufferGeometry().setFromPoints([local, local.clone().addScaledVector(normal, length)]),
        new THREE.LineBasicMaterial({ color: colour, toneMapped: false, transparent: true, opacity: selected ? 1 : 0.8 }))
      const head = new THREE.Mesh(new THREE.SphereGeometry(length * (selected ? 0.15 : 0.1), 20, 14), new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }))
      head.position.copy(local).addScaledVector(normal, length)
      const dot = new THREE.Mesh(new THREE.SphereGeometry(length * 0.045, 12, 8), new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }))
      dot.position.copy(local)
      for (const o of [needle, head, dot]) { o.userData.pinId = p.id; o.renderOrder = selected ? 6 : 5; this.pinGroup.add(o) }
    }
    this.scheduleVisibility(0)
    this.invalidate()
  }

  /** Needle as in the app (1 cm), shortened on very small structures so it stays readable. */
  private needleLength() { return Math.min(0.01, (this.host?.radius ?? 0.05) * 0.35) }

  /** Screen space covered by floating panels. The structure is centred and fitted in the space that is left. */
  setInsets(insets: { left: number; right: number; top: number; bottom: number }) {
    const i = this.insets
    if (i.left === insets.left && i.right === insets.right && i.top === insets.top && i.bottom === insets.bottom) return
    this.insets = insets
    this.applyViewOffset()
    if (this.lastFit) this.fit(this.lastFit)
    this.invalidate()
  }

  private applyViewOffset() {
    const { clientWidth: w, clientHeight: h } = this.container
    if (!w || !h) return
    const dx = (this.insets.left - this.insets.right) / 2, dy = (this.insets.top - this.insets.bottom) / 2
    this.camera.setViewOffset(w, h, -dx, -dy, w, h)
    this.camera.updateProjectionMatrix()
  }

  fit(view: ViewName = 'oblique') {
    if (!this.host) return
    const v = VIEWS[view]
    this.lastFit = view
    const { clientWidth: w, clientHeight: h } = this.container
    const free = Math.max(160, Math.min(w - this.insets.left - this.insets.right, h - this.insets.top - this.insets.bottom))
    const distance = this.host.radius * (h / 2) / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * free * 0.42)
    this.controls.target.set(0, 0, 0)
    this.camera.up.set(...(v.up as unknown as Vec3))
    this.camera.position.set(...(v.dir as unknown as Vec3)).normalize().multiplyScalar(distance)
    this.camera.near = Math.max(this.host.radius / 500, 0.0002)
    this.camera.far = distance + this.host.radius * 20
    this.camera.updateProjectionMatrix()
    this.controls.update()
    this.invalidate()
  }

  getCamera(): CameraState {
    const t = this.controls.target
    return { position: this.camera.position.toArray() as Vec3, target: [t.x, t.y, t.z], up: this.camera.up.toArray() as Vec3 }
  }

  setCamera(state: CameraState) {
    this.camera.position.set(...state.position)
    this.camera.up.set(...state.up)
    this.controls.target.set(...state.target)
    this.controls.update()
    this.invalidate()
  }

  /** Camera framing of the selected pin, keeping the current direction. */
  focusPin(id: string) {
    const pin = this.pins.find((p) => p.id === id)
    if (!pin || !this.host) return
    const world = pin.local.clone().applyMatrix4(this.root.matrixWorld)
    const offset = this.camera.position.clone().sub(this.controls.target)
    this.controls.target.copy(world)
    this.camera.position.copy(world).add(offset)
    this.controls.update()
  }

  /** Turns the camera smoothly to face a pin that is behind the surface or off screen; visible pins leave the view alone. */
  revealPin(id: string) {
    const pin = this.pins.find((p) => p.id === id)
    if (!pin || !this.host) return
    this.root.updateMatrixWorld(true)
    this.updateVisibility()
    const world = pin.local.clone().applyMatrix4(this.root.matrixWorld)
    const screen = world.clone().project(this.camera)
    const onScreen = Math.abs(screen.x) < 0.9 && Math.abs(screen.y) < 0.9 && screen.z < 1
    if (this.visibility.get(id) !== false && onScreen) return
    const target = this.controls.target.clone()
    const distance = this.camera.position.distanceTo(target)
    const normal = pin.normal.clone().transformDirection(this.root.matrixWorld)
    const outward = world.clone().sub(target).normalize()
    const end = normal.add(outward.multiplyScalar(0.6)).normalize()
    const start = this.camera.position.clone().sub(target).normalize()
    const turn = new THREE.Quaternion().setFromUnitVectors(start, end)
    const began = performance.now()
    cancelAnimationFrame(this.animation)
    const stepFrame = () => {
      const t = Math.min(1, (performance.now() - began) / 550)
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      const q = new THREE.Quaternion().slerp(turn, eased)
      this.camera.position.copy(start.clone().applyQuaternion(q).multiplyScalar(distance).add(target))
      this.controls.update()
      if (t < 1) this.animation = requestAnimationFrame(stepFrame)
    }
    this.lastFit = null
    this.animation = requestAnimationFrame(stepFrame)
  }

  invalidate() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render() })
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.applyViewOffset()
    this.invalidate()
  }

  private renderTimes: number[] = []

  /** Rendering and GPU-resource counts, for the P6 checks (window.__playgroundStats). */
  stats() {
    const times = this.renderTimes
    return { renders: times.length, meanRenderMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
             geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
             programs: this.renderer.info.programs?.length ?? 0, triangles: this.renderer.info.render.triangles }
  }

  private render() {
    const started = performance.now()
    this.renderer.render(this.scene, this.camera)
    this.renderTimes.push(performance.now() - started)
    if (this.renderTimes.length > 600) this.renderTimes.splice(0, 300)
    this.drawLabels()
    this.drawAxes()
  }

  private project(world: THREE.Vector3) {
    const p = world.clone().project(this.camera)
    const { clientWidth: w, clientHeight: h } = this.container
    return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, inFront: p.z < 1 && p.z > -1 }
  }

  private drawLabels() {
    const html: string[] = []
    const length = this.needleLength()
    // Selected label first, then visible ones top to bottom; a label that would overlap one already drawn is left out.
    const taken: [number, number, number, number][] = []
    const candidates = this.pins.map((p) => {
      const head = this.project(p.local.clone().addScaledVector(p.normal, length).applyMatrix4(this.root.matrixWorld))
      return { p, head, visible: this.visibility.get(p.id) !== false, selected: p.id === this.selected }
    }).sort((a, b) => Number(b.selected) - Number(a.selected) || Number(b.visible) - Number(a.visible) || a.head.y - b.head.y)
    for (const { p, head, visible, selected } of candidates) {
      if (!visible && !this.showHidden && !selected) continue
      if (!selected && !this.showOtherLabels) continue
      if (!head.inFront) continue
      const box: [number, number, number, number] = [head.x + 8, head.y - 32, head.x + 8 + p.label.length * 6.4 + 22, head.y - 6]
      if (!selected && taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) continue
      taken.push(box)
      const cls = ['pin-label', selected ? 'selected' : '', visible ? '' : 'hidden-pin', p.muted ? 'muted' : ''].join(' ')
      html.push(`<div class="${cls}" style="transform:translate(${head.x.toFixed(1)}px,${head.y.toFixed(1)}px)">${escapeHtml(p.label)}${visible ? '' : ' <em>· behind</em>'}</div>`)
    }
    this.labels.innerHTML = html.join('')
  }

  private drawAxes() {
    const size = 84, c = size / 2, r = 30
    const q = this.camera.quaternion.clone().invert()
    const items = AXES.map((a) => ({ ...a, v: new THREE.Vector3(...a.dir).applyQuaternion(q) })).sort((a, b) => a.v.z - b.v.z)
    this.axes.innerHTML = items.map((a) => {
      const x = c + a.v.x * r, y = c - a.v.y * r, opacity = a.v.z < -0.2 ? 0.45 : 1
      return `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" stroke="${a.colour}" stroke-width="1.5" opacity="${opacity}"/>` +
        `<circle cx="${x}" cy="${y}" r="8" fill="${a.colour}" opacity="${opacity}"/>` +
        `<text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#fff" font-family="Inter, -apple-system, sans-serif">${a.label}</text>`
    }).join('')
  }

  /** Occlusion-aware labels: a pin is hidden when any visible surface lies in front of its anchor. */
  private scheduleVisibility(delay = 120) {
    window.clearTimeout(this.visibilityTimer)
    this.visibilityTimer = window.setTimeout(() => { this.updateVisibility(); this.invalidate() }, delay)
  }

  private updateVisibility() {
    if (!this.host) return
    this.root.updateMatrixWorld(true)
    const eye = this.camera.position
    const occluders = [this.host.front, ...(this.contextBlocks ? this.context.values() : [])]
    const raycaster = new THREE.Raycaster()
    for (const p of this.pins) {
      const world = p.local.clone().applyMatrix4(this.root.matrixWorld)
      const toward = world.clone().sub(eye)
      const distance = toward.length()
      raycaster.set(eye, toward.normalize())
      raycaster.far = distance - Math.max(distance * 1e-4, 1e-5)
      ;(this.host.front.material as THREE.Material).side = THREE.DoubleSide
      const blocked = raycaster.intersectObjects(occluders, false).length > 0
      ;(this.host.front.material as THREE.Material).side = THREE.FrontSide
      this.visibility.set(p.id, !blocked)
    }
  }

  private ray(event: PointerEvent): THREE.Ray {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndc, this.camera)
    return raycaster.ray
  }

  private pickAt(event: PointerEvent): PickResult | null {
    if (!this.host) return null
    this.root.updateMatrixWorld(true)
    return pick(this.ray(event), this.host, this.contextBlocks ? [...this.context.values()] : [], this.allowReverse)
  }

  private pinNear(event: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const x = event.clientX - rect.left, y = event.clientY - rect.top
    let best: string | null = null, bestDistance = PIN_HIT_PIXELS
    const length = this.needleLength()
    for (const p of this.pins) {
      if (this.visibility.get(p.id) === false && !this.showHidden && p.id !== this.selected) continue
      const head = this.project(p.local.clone().addScaledVector(p.normal, length).applyMatrix4(this.root.matrixWorld))
      const d = Math.hypot(head.x - x, head.y - y)
      if (d < bestDistance) { bestDistance = d; best = p.id }
    }
    return best
  }

  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    const onPin = this.pinNear(event)
    this.down = { x: event.clientX, y: event.clientY, at: performance.now(), onPin }
    if (this.mode === 'reposition' && onPin && onPin === this.selected) {
      // Dragging the selected pin moves it; orbit is suspended until release.
      this.controls.enabled = false
      this.dragging = { pinId: onPin, last: null }
      this.renderer.domElement.setPointerCapture(event.pointerId)
    }
  }

  private pointerMove = (event: PointerEvent) => {
    if (this.dragging) {
      const result = this.pickAt(event)
      if (result?.ok) { this.dragging.last = result; this.showGhost(result.local, true); this.callbacks.onRepositionPreview(result) }
      return  // Off-surface movement keeps the last valid preview point.
    }
    if ((this.mode === 'place' || this.mode === 'reposition') && !this.down) {
      const result = this.pickAt(event)
      if (result?.ok) this.showGhost(result.local, true)
      else this.ghost.visible = false
      this.callbacks.onHover(result)
      this.invalidate()
    }
  }

  private pointerUp = (event: PointerEvent) => {
    const down = this.down
    this.down = null
    if (this.dragging) {
      const { last } = this.dragging
      this.dragging = null
      this.controls.enabled = true
      this.ghost.visible = false
      if (last) this.callbacks.onRepositionCommit(last)
      else this.callbacks.onRepositionCancel()
      this.invalidate()
      return
    }
    if (!down) return
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
    if (moved > CLICK_PIXELS || performance.now() - down.at > CLICK_MS) return  // An orbit drag never places a pin.
    if (this.mode === 'reposition' && down.onPin === this.selected) return  // A click on the pin itself is not a move.
    if (this.mode === 'place' || this.mode === 'reposition') {
      const result = this.pickAt(event)
      if (!result) return
      if (result.ok) this.callbacks.onPlace(result)
      else this.callbacks.onPickRefused(result)
      return
    }
    if (down.onPin) this.callbacks.onPinClick(down.onPin)
  }

  private pointerLeave = () => {
    if (this.mode !== 'orbit' && !this.dragging) { this.ghost.visible = false; this.callbacks.onHover(null); this.invalidate() }
  }

  /** Cancels an in-progress drag (Escape); the committed anchor is unchanged. */
  cancelDrag() {
    if (!this.dragging) return
    this.dragging = null
    this.controls.enabled = true
    this.ghost.visible = false
    this.callbacks.onRepositionCancel()
    this.invalidate()
  }

  private showGhost(local: Vec3, ok: boolean) {
    this.ghost.position.set(...local)
    this.ghost.scale.setScalar(this.needleLength() * 0.12)
    ;(this.ghost.material as THREE.MeshBasicMaterial).color.set(ok ? this.palette.selected : '#e8a092')
    this.ghost.visible = true
    this.invalidate()
  }

  hideGhost() { this.ghost.visible = false; this.invalidate() }

  private emitCamera() { this.callbacks.onCameraChange(this.getCamera()) }

  /** Screen-space rendering check used by the WebGL-unavailable message and tests. */
  static webglAvailable(): boolean {
    try {
      const canvas = document.createElement('canvas')
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
    } catch { return false }
  }
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
