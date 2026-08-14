import { TextAttributes, type BoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { Show } from "solid-js"
import { SplitBorder, setBorder } from "./border"
import { theme } from "./theme"

export type ToastVariant = "info" | "success" | "warning" | "error"

export function toastError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error
  return "An unknown error has occurred"
}

export interface ToastProps {
  toast?: { title?: string; message: string; variant: ToastVariant }
}

export function Toast(props: ToastProps) {
  const dimensions = useTerminalDimensions()
  return (
    <Show when={props.toast}>
      {(current) => (
        <box
          position="absolute"
          justifyContent="center"
          alignItems="flex-start"
          top={2}
          right={2}
          zIndex={2500}
          maxWidth={Math.min(60, dimensions().width - 6)}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          backgroundColor={theme.backgroundPanel}
          borderColor={theme[current().variant]}
          customBorderChars={SplitBorder.customBorderChars}
          ref={(value: BoxRenderable) => setBorder(value, ["left", "right"], SplitBorder.customBorderChars)}
        >
          <Show when={current().title}>
            {(title) => <text attributes={TextAttributes.BOLD} marginBottom={1} fg={theme.text}>{title()}</text>}
          </Show>
          <text fg={theme.text} wrapMode="word" width="100%">{current().message}</text>
        </box>
      )}
    </Show>
  )
}
