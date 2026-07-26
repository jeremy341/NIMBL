import React from "react"
import { Box, Text } from "ink"
import { C, LOGO_SIMPLE } from "./theme"
import TextInput from "ink-text-input"

interface HomeScreenProps {
  onSubmit: (text: string) => void
}

export function HomeScreen({ onSubmit }: HomeScreenProps) {
  const [value, setValue] = React.useState("")

  const handleSubmit = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setValue("")
    onSubmit(trimmed)
  }

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="center">
      <Box flexDirection="column" alignItems="center">
        {/* Logo - centered and simple */}
        <Box flexDirection="column" marginBottom={3}>
          {LOGO_SIMPLE.map((line, i) => (
            <Text key={i} color={C.accent}>{line}</Text>
          ))}
        </Box>

        {/* Chat input box - minimal style */}
        <Box flexDirection="row" marginBottom={2}>
          <Text color={C.mute}>🔹 </Text>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
            placeholder="Ask anything... 'Fix broken tests'"
          />
        </Box>

        <Box marginTop={2}>
          <Text color={C.dim}>Commands: /help  /model  /provider  /stats  /status  /export  /clear  /quit</Text>
        </Box>
      </Box>
    </Box>
  )
}
