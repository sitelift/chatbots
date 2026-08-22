export interface ProviderPreset {
  id: string
  label: string
  baseUrl: string
  models: string[]
  hint?: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      'openai/gpt-4o-mini',
      'anthropic/claude-sonnet-4',
      'google/gemini-2.0-flash-001',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    hint: 'One key, hundreds of models. Get keys at openrouter.ai/keys',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    hint: 'Extremely fast inference on open models',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat'],
    hint: 'Strong budget-friendly models',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.2', 'qwen2.5'],
    hint: 'Runs on your own machine — no API key needed, any key value works',
  },
  {
    id: 'custom',
    label: 'Custom / other',
    baseUrl: '',
    models: [],
    hint: 'Any endpoint that speaks the OpenAI chat-completions protocol',
  },
]

export function presetForBaseUrl(baseUrl: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.baseUrl !== '' && p.baseUrl === baseUrl.trim())
}

export interface ModelOption {
  id: string
  name: string
  contextLength: number | null
  promptPricePerM: number | null
  completionPricePerM: number | null
}
