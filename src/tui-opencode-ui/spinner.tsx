import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js"
import { useRenderer } from "@opentui/solid"
import { theme } from "./theme"

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

const FRAME_INTERVAL_MS = 80

const [animationsEnabled, setAnimationsEnabled] = createSignal(true)
export function enableAnimations(enabled: boolean) {
  setAnimationsEnabled(enabled)
}

/**
 * Spinner driven by the renderer's frame callback (like OpenTUI's native
 * spinner) so every animation tick also schedules a repaint. Falls back to a
 * shared setInterval ticker for headless/test renderers that have no frame
 * loop. The renderer-driven path is immune to the freeze caused by JS-timer
 * starvation when the main thread is briefly busy: as soon as a frame renders,
 * the animation advances on the renderer's own cadence.
 */
function useSpinnerFrame(): () => number {
  const renderer = useRenderer() as { addFrameCallback?: (cb: (deltaTime: number) => Promise<void> | void) => void; removeFrameCallback?: (cb: (deltaTime: number) => Promise<void> | void) => void; requestRender?: () => void } | undefined
  const [frame, setFrame] = createSignal(0)
  let accumulated = 0

  onMount(() => {
    if (renderer?.addFrameCallback) {
      const callback = (deltaTime: number) => {
        accumulated += deltaTime
        if (accumulated >= FRAME_INTERVAL_MS) {
          accumulated = 0
          setFrame((value) => (value + 1) % SPINNER_FRAMES.length)
          renderer.requestRender?.()
        }
      }
      renderer.addFrameCallback(callback)
      onCleanup(() => renderer.removeFrameCallback?.(callback))
      return
    }

    const interval = setInterval(() => setFrame((value) => (value + 1) % SPINNER_FRAMES.length), FRAME_INTERVAL_MS)
    interval.unref?.()
    onCleanup(() => clearInterval(interval))
  })

  return frame
}

export interface SpinnerProps {
  color?: string
  children?: JSX.Element
}

export function Spinner(props: SpinnerProps) {
  const frame = useSpinnerFrame()
  const color = () => props.color ?? theme.textMuted
  return (
    <Show when={animationsEnabled()} fallback={<text fg={color()}>⋯ {props.children}</text>}>
      <box flexDirection="row" gap={1}>
        <text fg={color()}>{SPINNER_FRAMES[frame()]}</text>
        <Show when={props.children}>
          <text fg={color()}>{props.children}</text>
        </Show>
      </box>
    </Show>
  )
}
