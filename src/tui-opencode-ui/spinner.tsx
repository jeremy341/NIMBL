import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js"
import { theme } from "./theme"

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

type FrameSubscriber = (frame: number) => void

const subscribers = new Set<FrameSubscriber>()
let sharedFrame = 0
let ticker: ReturnType<typeof setInterval> | undefined

function subscribe(subscriber: FrameSubscriber) {
  subscribers.add(subscriber)
  subscriber(sharedFrame)
  if (!ticker) {
    ticker = setInterval(() => {
      sharedFrame = (sharedFrame + 1) % SPINNER_FRAMES.length
      for (const notify of subscribers) notify(sharedFrame)
    }, 80)
    ticker.unref?.()
  }

  return () => {
    subscribers.delete(subscriber)
    if (subscribers.size === 0 && ticker) {
      clearInterval(ticker)
      ticker = undefined
    }
  }
}

export interface SpinnerProps {
  color?: string
  children?: JSX.Element
}

export function Spinner(props: SpinnerProps) {
  const [frame, setFrame] = createSignal(0)

  onMount(() => {
    const unsubscribe = subscribe(setFrame)
    onCleanup(unsubscribe)
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
