import React, { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Cloud, KeyRound, Loader2, Mic2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OnboardingContainer } from '../OnboardingContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';

const XAI_ENDPOINT = 'https://api.x.ai/v1';

type SummaryProvider = 'openrouter' | 'xai' | 'custom-openai' | 'openai' | 'claude' | 'groq';
type TranscriptionProvider = 'elevenLabs' | 'groq' | 'openai';

const SUMMARY_PROVIDER_OPTIONS: Record<
  SummaryProvider,
  {
    label: string;
    provider: 'openrouter' | 'custom-openai' | 'openai' | 'claude' | 'groq';
    defaultModel: string;
    endpoint?: string;
    requiresKey: boolean;
  }
> = {
  openrouter: {
    label: 'OpenRouter',
    provider: 'openrouter',
    defaultModel: 'openai/gpt-4o-mini',
    requiresKey: true,
  },
  xai: {
    label: 'xAI',
    provider: 'custom-openai',
    defaultModel: 'grok-4.3',
    endpoint: XAI_ENDPOINT,
    requiresKey: true,
  },
  'custom-openai': {
    label: 'Custom OpenAI-compatible',
    provider: 'custom-openai',
    defaultModel: '',
    requiresKey: false,
  },
  openai: {
    label: 'OpenAI',
    provider: 'openai',
    defaultModel: 'gpt-4o-mini',
    requiresKey: true,
  },
  claude: {
    label: 'Claude',
    provider: 'claude',
    defaultModel: 'claude-sonnet-4-5-20250929',
    requiresKey: true,
  },
  groq: {
    label: 'Groq',
    provider: 'groq',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresKey: true,
  },
};

const TRANSCRIPTION_PROVIDER_OPTIONS: Record<
  TranscriptionProvider,
  {
    label: string;
    provider: 'elevenLabs' | 'groq' | 'openai';
    defaultModel: string;
  }
> = {
  elevenLabs: {
    label: 'ElevenLabs Scribe',
    provider: 'elevenLabs',
    defaultModel: 'scribe_v2',
  },
  groq: {
    label: 'Groq',
    provider: 'groq',
    defaultModel: 'whisper-large-v3-turbo',
  },
  openai: {
    label: 'OpenAI',
    provider: 'openai',
    defaultModel: 'gpt-4o-mini-transcribe',
  },
};

export function ApiKeySetupStep() {
  const { goToStep, setSetupMode } = useOnboarding();
  const [summaryProvider, setSummaryProvider] = useState<SummaryProvider>('openrouter');
  const [summaryModel, setSummaryModel] = useState(SUMMARY_PROVIDER_OPTIONS.openrouter.defaultModel);
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [summaryApiKey, setSummaryApiKey] = useState('');
  const [transcriptionProvider, setTranscriptionProvider] = useState<TranscriptionProvider>('elevenLabs');
  const [transcriptionModel, setTranscriptionModel] = useState(
    TRANSCRIPTION_PROVIDER_OPTIONS.elevenLabs.defaultModel,
  );
  const [transcriptionApiKey, setTranscriptionApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedSummaryProvider = SUMMARY_PROVIDER_OPTIONS[summaryProvider];
  const selectedTranscriptionProvider = TRANSCRIPTION_PROVIDER_OPTIONS[transcriptionProvider];
  const endpoint = selectedSummaryProvider.endpoint ?? customEndpoint.trim();
  const needsEndpoint = selectedSummaryProvider.provider === 'custom-openai';

  const canSave = useMemo(() => {
    if (!summaryModel.trim()) return false;
    if (selectedSummaryProvider.requiresKey && !summaryApiKey.trim()) return false;
    if (needsEndpoint && !endpoint) return false;
    if (!transcriptionModel.trim()) return false;
    if (!transcriptionApiKey.trim()) return false;
    return true;
  }, [
    endpoint,
    needsEndpoint,
    selectedSummaryProvider.requiresKey,
    summaryApiKey,
    summaryModel,
    transcriptionApiKey,
    transcriptionModel,
  ]);

  const handleSummaryProviderChange = (value: SummaryProvider) => {
    const nextProvider = SUMMARY_PROVIDER_OPTIONS[value];
    setSummaryProvider(value);
    setSummaryModel(nextProvider.defaultModel);
    setCustomEndpoint(nextProvider.endpoint ?? '');
  };

  const handleTranscriptionProviderChange = (value: TranscriptionProvider) => {
    const nextProvider = TRANSCRIPTION_PROVIDER_OPTIONS[value];
    setTranscriptionProvider(value);
    setTranscriptionModel(nextProvider.defaultModel);
  };

  const saveApiKeySetup = async () => {
    if (!canSave || isSaving) return;

    setIsSaving(true);
    try {
      const summaryModelName = summaryModel.trim();
      const trimmedSummaryApiKey = summaryApiKey.trim();
      const transcriptionModelName = transcriptionModel.trim();
      const trimmedTranscriptionApiKey = transcriptionApiKey.trim();

      if (selectedSummaryProvider.provider === 'custom-openai') {
        await invoke('api_save_custom_openai_config', {
          endpoint,
          apiKey: trimmedSummaryApiKey || null,
          model: summaryModelName,
          maxTokens: null,
          temperature: null,
          topP: null,
        });
      }

      await invoke('api_save_model_config', {
        provider: selectedSummaryProvider.provider,
        model: summaryModelName,
        whisperModel: 'large-v3',
        apiKey:
          selectedSummaryProvider.provider === 'custom-openai'
            ? null
            : trimmedSummaryApiKey || null,
        ollamaEndpoint: null,
      });

      await invoke('api_save_transcript_config', {
        provider: selectedTranscriptionProvider.provider,
        model: transcriptionModelName,
        apiKey: trimmedTranscriptionApiKey,
      });

      setSetupMode('api');
      toast.success('Provider keys saved');
      goToStep(3);
    } catch (error) {
      console.error('Failed to save API-key onboarding setup:', error);
      toast.error('Could not save provider settings', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OnboardingContainer
      title="Connect Your Providers"
      description="Use your own API keys for transcription and summaries."
      step={2}
      totalSteps={3}
      showNavigation={true}
    >
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sunken">
              <KeyRound className="h-4 w-4 text-ink-2" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-ink">Summary provider</h2>
              <p className="text-sm text-ink-3">OpenRouter is selected by default.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="summary-provider">Provider</Label>
              <Select value={summaryProvider} onValueChange={handleSummaryProviderChange}>
                <SelectTrigger id="summary-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SUMMARY_PROVIDER_OPTIONS).map(([value, option]) => (
                    <SelectItem key={value} value={value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="summary-model">Model</Label>
              <Input
                id="summary-model"
                value={summaryModel}
                onChange={(event) => setSummaryModel(event.target.value)}
                placeholder="Provider model name"
              />
            </div>

            {needsEndpoint && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="summary-endpoint">Endpoint</Label>
                <Input
                  id="summary-endpoint"
                  value={endpoint}
                  disabled={summaryProvider === 'xai'}
                  onChange={(event) => setCustomEndpoint(event.target.value)}
                  placeholder="https://api.example.com/v1"
                />
              </div>
            )}

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="summary-api-key">
                API key{selectedSummaryProvider.requiresKey ? '' : ' (optional)'}
              </Label>
              <Input
                id="summary-api-key"
                type="password"
                value={summaryApiKey}
                onChange={(event) => setSummaryApiKey(event.target.value)}
                placeholder="Paste your summary provider key"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sunken">
              <Mic2 className="h-4 w-4 text-ink-2" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-ink">Transcription provider</h2>
              <p className="text-sm text-ink-3">ElevenLabs Scribe is selected by default.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="transcription-provider">Provider</Label>
              <Select
                value={transcriptionProvider}
                onValueChange={handleTranscriptionProviderChange}
              >
                <SelectTrigger id="transcription-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRANSCRIPTION_PROVIDER_OPTIONS).map(([value, option]) => (
                    <SelectItem key={value} value={value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transcription-model">Model</Label>
              <Input
                id="transcription-model"
                value={transcriptionModel}
                onChange={(event) => setTranscriptionModel(event.target.value)}
                placeholder="Transcription model"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="transcription-api-key">API key</Label>
              <Input
                id="transcription-api-key"
                type="password"
                value={transcriptionApiKey}
                onChange={(event) => setTranscriptionApiKey(event.target.value)}
                placeholder="Paste your transcription provider key"
              />
            </div>
          </div>
        </div>

        <Button
          onClick={saveApiKeySetup}
          disabled={!canSave || isSaving}
          className="h-11 w-full bg-primary text-primary-foreground hover:opacity-90"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Cloud className="mr-2 h-4 w-4" />
          )}
          Continue
        </Button>
      </div>
    </OnboardingContainer>
  );
}
