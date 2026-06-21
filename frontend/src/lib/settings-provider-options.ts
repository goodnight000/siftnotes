export type SummarySettingsProvider =
  | 'openrouter'
  | 'custom-openai'
  | 'openai'
  | 'claude'
  | 'groq'
  | 'builtin-ai'
  | 'ollama';

export type TranscriptionSettingsProvider =
  | 'elevenLabs'
  | 'groq'
  | 'openai'
  | 'parakeet'
  | 'localWhisper'
  | 'deepgram';

export interface SettingsProviderOption<TProvider extends string> {
  value: TProvider;
  label: string;
}

export interface ApiFirstTranscriptionConfig {
  provider?: TranscriptionSettingsProvider | string | null;
  model?: string | null;
  apiKey?: string | null;
}

export interface ApiFirstSummaryConfig {
  provider?: SummarySettingsProvider | string | null;
  model?: string | null;
  whisperModel?: string | null;
  apiKey?: string | null;
  ollamaEndpoint?: string | null;
}

const PRIMARY_TRANSCRIPTION_PROVIDER_OPTIONS: SettingsProviderOption<TranscriptionSettingsProvider>[] = [
  { value: 'elevenLabs', label: 'ElevenLabs Scribe' },
  { value: 'groq', label: 'Groq' },
  { value: 'openai', label: 'OpenAI' },
];

const ADVANCED_TRANSCRIPTION_PROVIDER_OPTIONS: SettingsProviderOption<TranscriptionSettingsProvider>[] = [
  { value: 'parakeet', label: 'Parakeet local engine' },
  { value: 'localWhisper', label: 'Local Whisper' },
];

const PRIMARY_SUMMARY_PROVIDER_OPTIONS: SettingsProviderOption<SummarySettingsProvider>[] = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'custom-openai', label: 'Custom OpenAI-compatible' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude', label: 'Claude' },
  { value: 'groq', label: 'Groq' },
];

const ADVANCED_SUMMARY_PROVIDER_OPTIONS: SettingsProviderOption<SummarySettingsProvider>[] = [
  { value: 'builtin-ai', label: 'Built-in AI' },
  { value: 'ollama', label: 'Ollama' },
];

const DEFAULT_TRANSCRIPTION_MODELS: Record<TranscriptionSettingsProvider, string> = {
  elevenLabs: 'scribe_v2',
  groq: 'whisper-large-v3-turbo',
  openai: 'gpt-4o-mini-transcribe',
  parakeet: 'parakeet-tdt-0.6b-v3-int8',
  localWhisper: 'large-v3-turbo',
  deepgram: 'nova-2-phonecall',
};

const DEFAULT_SUMMARY_MODELS: Record<SummarySettingsProvider, string> = {
  openrouter: 'openai/gpt-4o-mini',
  'custom-openai': '',
  openai: 'gpt-4o-mini',
  claude: 'claude-sonnet-4-5-20250929',
  groq: 'llama-3.3-70b-versatile',
  'builtin-ai': '',
  ollama: 'gemma3:1b',
};

export function getPrimaryTranscriptionProviderOptions() {
  return PRIMARY_TRANSCRIPTION_PROVIDER_OPTIONS;
}

export function getAdvancedTranscriptionProviderOptions() {
  return ADVANCED_TRANSCRIPTION_PROVIDER_OPTIONS;
}

export function getDefaultTranscriptionProvider() {
  return PRIMARY_TRANSCRIPTION_PROVIDER_OPTIONS[0];
}

export function getTranscriptionProviderLabel(provider: TranscriptionSettingsProvider) {
  return (
    [...PRIMARY_TRANSCRIPTION_PROVIDER_OPTIONS, ...ADVANCED_TRANSCRIPTION_PROVIDER_OPTIONS].find(
      (option) => option.value === provider,
    )?.label ?? provider
  );
}

export function isCloudTranscriptionProvider(provider: string | null | undefined) {
  return provider === 'elevenLabs' || provider === 'groq' || provider === 'openai';
}

export function getDefaultTranscriptionModel(provider: TranscriptionSettingsProvider) {
  return DEFAULT_TRANSCRIPTION_MODELS[provider];
}

export function resolveApiFirstTranscriptionConfig<TConfig extends ApiFirstTranscriptionConfig>(
  config: TConfig | null | undefined,
) {
  const provider = config?.provider;
  if (!provider || provider === 'parakeet' || provider === 'localWhisper') {
    return {
      ...config,
      provider: 'elevenLabs' as const,
      model: DEFAULT_TRANSCRIPTION_MODELS.elevenLabs,
      apiKey: null,
    };
  }

  return {
    ...config,
    provider,
    model:
      config?.model ||
      DEFAULT_TRANSCRIPTION_MODELS[provider as TranscriptionSettingsProvider] ||
      DEFAULT_TRANSCRIPTION_MODELS.elevenLabs,
    apiKey: config?.apiKey ?? null,
  };
}

export function getPrimarySummaryProviderOptions() {
  return PRIMARY_SUMMARY_PROVIDER_OPTIONS;
}

export function getAdvancedSummaryProviderOptions() {
  return ADVANCED_SUMMARY_PROVIDER_OPTIONS;
}

export function getSummaryProviderLabel(provider: SummarySettingsProvider) {
  return (
    [...PRIMARY_SUMMARY_PROVIDER_OPTIONS, ...ADVANCED_SUMMARY_PROVIDER_OPTIONS].find(
      (option) => option.value === provider,
    )?.label ?? provider
  );
}

export function getDefaultSummaryModel(provider: SummarySettingsProvider) {
  return DEFAULT_SUMMARY_MODELS[provider];
}

export function resolveApiFirstSummaryConfig<TConfig extends ApiFirstSummaryConfig>(
  config: TConfig | null | undefined,
) {
  const provider = config?.provider;
  if (!provider || provider === 'builtin-ai' || provider === 'ollama') {
    return {
      ...config,
      provider: 'openrouter' as const,
      model: DEFAULT_SUMMARY_MODELS.openrouter,
      whisperModel: config?.whisperModel || 'large-v3',
      apiKey: null,
      ollamaEndpoint: null,
    };
  }

  return {
    ...config,
    provider,
    model:
      config?.model ||
      DEFAULT_SUMMARY_MODELS[provider as SummarySettingsProvider] ||
      DEFAULT_SUMMARY_MODELS.openrouter,
    whisperModel: config?.whisperModel || 'large-v3',
    apiKey: config?.apiKey ?? null,
    ollamaEndpoint: config?.ollamaEndpoint ?? null,
  };
}
