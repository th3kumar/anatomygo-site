import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import type { LoadedMesh } from './api'
import type { PickResult } from './picking'
import { SceneController, type CameraState, type Mode, type SceneCallbacks, type ScenePin, type ViewName } from './scene'

export interface ViewerHandle {
  fit(view?: ViewName): void
  getCamera(): CameraState | null
  setCamera(state: CameraState): void
  focusPin(id: string): void
  cancelDrag(): void
}

interface Props extends Partial<SceneCallbacks> {
  ref?: Ref<ViewerHandle>
  host: LoadedMesh | null
  context: LoadedMesh[]
  pins: ScenePin[]
  selected: string | null
  mode: Mode
  allowReverse: boolean
  showHidden: boolean
  showOtherLabels: boolean
  contextBlocks?: boolean
  initialCamera?: CameraState | null
  dark?: boolean
  insets?: { left: number; right: number; top: number; bottom: number }
}

const noop = () => {}

export function Viewer(props: Props) {
  const container = useRef<HTMLDivElement>(null)
  const labels = useRef<HTMLDivElement>(null)
  const axes = useRef<SVGSVGElement>(null)
  const controller = useRef<SceneController | null>(null)
  const callbacks = useRef(props)
  callbacks.current = props

  useEffect(() => {
    const forward = <K extends keyof SceneCallbacks>(key: K) =>
      ((...args: unknown[]) => ((callbacks.current[key] ?? noop) as (...a: unknown[]) => void)(...args)) as SceneCallbacks[K]
    const scene = new SceneController(container.current!, labels.current!, axes.current!, {
      onPlace: forward('onPlace'), onPickRefused: forward('onPickRefused'), onHover: forward('onHover'),
      onPinClick: forward('onPinClick'), onRepositionPreview: forward('onRepositionPreview'),
      onRepositionCommit: forward('onRepositionCommit'), onRepositionCancel: forward('onRepositionCancel'),
      onCameraChange: forward('onCameraChange'),
    })
    controller.current = scene
    return () => { scene.dispose(); controller.current = null }
  }, [])

  const hostId = props.host?.meta.id
  const fitted = useRef(false)
  useEffect(() => {
    const scene = controller.current
    if (!scene || !props.host) return
    scene.setHost(props.host.meta.id, props.host.buffers, props.host.meta.system)
    fitted.current = !props.initialCamera
    if (props.initialCamera) scene.setCamera(props.initialCamera)
    else scene.fit('oblique')
    // Only a host change re-frames the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId])

  useEffect(() => { controller.current?.setDark(props.dark ?? true) }, [props.dark])
  const insets = props.insets
  useEffect(() => { if (insets) controller.current?.setInsets(insets) }, [insets?.left, insets?.right, insets?.top, insets?.bottom]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { controller.current?.setContext(props.context.map((m) => ({ meshId: m.meta.id, buffers: m.buffers }))) }, [props.context])

  useEffect(() => {
    const scene = controller.current
    if (!scene) return
    scene.selected = props.selected
    scene.setPins(props.pins)
  }, [props.pins, props.selected, hostId])

  // Choosing another landmark on the same structure turns the camera to it, if it is out of sight.
  const shown = useRef<{ host?: string; selected: string | null }>({ selected: null })
  useEffect(() => {
    const previous = shown.current
    shown.current = { host: hostId, selected: props.selected }
    // On a freshly fitted structure the first landmark is shown too; a restored camera is left exactly as it was.
    const opened = previous.host !== hostId && fitted.current
    if (props.selected && (opened || (previous.host === hostId && previous.selected !== props.selected))) controller.current?.revealPin(props.selected)
  }, [props.selected, hostId])

  useEffect(() => {
    const scene = controller.current
    if (!scene) return
    scene.mode = props.mode
    scene.allowReverse = props.allowReverse
    scene.showHidden = props.showHidden
    scene.showOtherLabels = props.showOtherLabels
    scene.contextBlocks = props.contextBlocks ?? true
    if (props.mode !== 'place') scene.hideGhost()
    scene.invalidate()
  }, [props.mode, props.allowReverse, props.showHidden, props.showOtherLabels, props.contextBlocks])

  useImperativeHandle(props.ref, () => ({
    fit: (view) => controller.current?.fit(view),
    getCamera: () => controller.current?.getCamera() ?? null,
    setCamera: (state) => controller.current?.setCamera(state),
    focusPin: (id) => controller.current?.focusPin(id),
    cancelDrag: () => controller.current?.cancelDrag(),
  }), [])

  return (
    <div className={`viewer mode-${props.mode}`} ref={container}>
      <div className="labels" ref={labels} />
      <svg className="axes" ref={axes} width={84} height={84} aria-label="Anatomical orientation" />
    </div>
  )
}

export type { PickResult }
