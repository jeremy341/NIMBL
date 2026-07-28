import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js"
import { theme } from "./theme"

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

export interface SpinnerProps {
  color?: string
  children?: JSX.Element
}

export function Spinner(props: SpinnerProps) {
  const [frame, setFrame] = createSignal(0)

  onMount(() => {
    const timer = setInterval(() => setFrame((value) => (value + 1) % SPINNER_FRAMES.length), 80)
    onCleanup(() => clearInterval(timer))
  })

  const color = () => props.color ?? theme.textMuted
  return (
    <box flexDirection="row" gap={1}>
      <text fg={color()}>{SPINNER_FRAMES[frame()]}</text>
      <Show when={props.children}>
        <text fg={color()}>{props.children}</text>
      </Show>
    </box>
  )
}
