export const AI_TECH_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "llm",
  "large language model",
  "gpt",
  "openai",
  "anthropic",
  "claude",
  "gemini",
  "neural network",
  "transformer",
  "nlp",
  "natural language",
  "computer vision",
  "robotics",
  "automation",
  "generative ai",
  "foundation model",
  "reinforcement learning",
  "diffusion model",
  "chatbot",
  "autonomous",
  "tech",
  "startup",
  "software",
] as const;

export function matchesAiTechKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return AI_TECH_KEYWORDS.some((kw) => lower.includes(kw));
}
