export const ASSISTANT_RESPONSE_STYLE = "Never use emoji characters in assistant responses, including headings, lists, explanations, status text, and examples. Use plain text labels and ASCII punctuation instead."

const EMOJI_PATTERN = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\uFE0F|\u200D|\u20E3/gu

export function stripEmojis(value: string): string {
  return value.replace(EMOJI_PATTERN, "")
}
