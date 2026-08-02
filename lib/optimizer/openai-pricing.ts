// Real OpenAI per-token pricing, confirmed against platform.openai.com/docs/pricing
// (Aug 2026). Used to compute the ACTUAL cost of each generation from the
// token usage every OpenAI response already includes, rather than logging a
// flat guess.
//
// That guess used to be $0.05/generation ($0.04 image + $0.01 "gpt-4o-mini"
// copy) — but the copy call actually runs gpt-4o (not gpt-4o-mini, despite
// the old comment), and gpt-image-1's quality defaults to "auto" with no
// quality param set here, which resolves to "high" ($0.167/image at
// 1024x1024) for prompts this detailed rather than the ~$0.04 assumed.
// Real-world: 7 organic posts cost $1.26 ($0.18/post) — consistent with
// high-quality image ($0.167) + a few cents of gpt-4o copy, not the $0.05
// the budget math was built around. Every downstream budget calculation
// (planBudget, the monthly-cap check, the Settings breakdown) was
// undercounting real spend by roughly 3.5x as a result.

export const GPT4O_INPUT_PER_TOKEN = 2.50 / 1_000_000
export const GPT4O_OUTPUT_PER_TOKEN = 10.00 / 1_000_000

// gpt-image-1 bills input and output separately, both metered in tokens.
export const GPT_IMAGE_1_INPUT_PER_TOKEN = 10.00 / 1_000_000
export const GPT_IMAGE_1_OUTPUT_PER_TOKEN = 40.00 / 1_000_000

// Flat-rate fallback only for the rare case a response omits usage data —
// high quality 1024x1024 is what "auto" has been resolving to for these
// prompts in practice, so that's the honest fallback, not the old $0.04.
export const IMAGE_FALLBACK_COST_DOLLARS = 0.167
export const COPY_FALLBACK_COST_DOLLARS = 0.02

export interface OpenAIUsage {
  prompt_tokens?: number
  completion_tokens?: number
}

export interface ImageUsage {
  input_tokens?: number
  output_tokens?: number
}

/** Real cost of one gpt-4o chat completion, in dollars, from its own usage block. */
export function chatCompletionCost(usage: OpenAIUsage | undefined): number {
  if (!usage) return COPY_FALLBACK_COST_DOLLARS
  const input = (usage.prompt_tokens ?? 0) * GPT4O_INPUT_PER_TOKEN
  const output = (usage.completion_tokens ?? 0) * GPT4O_OUTPUT_PER_TOKEN
  return input + output
}

/** Real cost of one gpt-image-1 generation, in dollars, from its own usage block. */
export function imageGenerationCost(usage: ImageUsage | undefined): number {
  if (!usage) return IMAGE_FALLBACK_COST_DOLLARS
  const input = (usage.input_tokens ?? 0) * GPT_IMAGE_1_INPUT_PER_TOKEN
  const output = (usage.output_tokens ?? 0) * GPT_IMAGE_1_OUTPUT_PER_TOKEN
  return input + output
}
