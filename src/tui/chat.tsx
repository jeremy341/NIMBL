import React from "react"
import { Box, Text, Static } from "ink"
import TextInput from "ink-text-input"
import { C } from "./theme"

export interface Message {
  id: string
  role: "user" | "nimb" | "err"
  content: string
}

interface ChatScreenProps {
  messages: Message[]
  loading: boolean
  onSubmit: (text: string) => void
}

export function ChatScreen({ messages, loading, onSubmit }: ChatScreenProps) {
  const [value, setValue] = React.useState("")

  const handleSubmit = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setValue("")
    onSubmit(trimmed)
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Message history - scrollable area */}
      <Box flexDirection="column" flexGrow={1}>
        <Static items={messages}>
          {(msg) => {
            const isUser = msg.role === "user"
            const isErr = msg.role === "err"

            if (isErr) {
              return (
                <Box key={msg.id} paddingLeft={2} paddingTop={1}>
                  <Text color={C.err}>Error: {msg.content}</Text>
                </Box>
              )
            }

            const label = isUser ? "You" : "NIMBL"
            const labelColor = isUser ? C.accentHi : C.accent

            return (
              <Box key={msg.id} flexDirection="column" paddingLeft={2} paddingTop={1}>
                <Text color={labelColor} bold>{label}</Text>
                <Box paddingLeft={2} flexDirection="column">
                  {msg.content.split("\n").map((line, i) => {
                    const bg = isUser ? C.userBubble : C.nimbBubble
                    return (
                      <Text key={i} backgroundColor={bg} color={C.text}>{line || " "}</Text>
                    )
                  })}
                </Box>
              </Box>
            )
          }}
        </Static>
      </Box>

      {/* Loading indicator */}
      {loading && (
        <Box paddingLeft={2} paddingTop={1}>
          <Text color={C.accentHi}>⚙️  Thinking...</Text>
        </Box>
      )}

      {/* Input bar */}
      <Box flexDirection="row" paddingLeft={2} paddingRight={2} paddingY={1}>
        <Text color={C.accentHi}>🔹 </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="Type a message... (/help for commands)"
        />
      </Box>
    </Box>
  )
}
