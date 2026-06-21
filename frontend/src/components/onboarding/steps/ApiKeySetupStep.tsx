import React, { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Cloud, HardDriveDownload, KeyRound, Loader2, Mic2 } from 'lucide-react';
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

const PARAKEET_MODEL = 'parakeet-tdt-0.6b-v3-int8';
const XAI_ENDPOINT = 'https://api.x.ai/v1';

type SummaryProvider = 'openrouter' | 'xai' | 'custom-openai' | 'openai' | 'claude' | 'groq';

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

export function ApiKeySetupStep() {
  const { goToStep, setSetupMode } = useOnboarding();
  const [summaryProvider, setSummaryProvider] = useState<SummaryProvider>('openrouter');
  const [model, setModel] = useState(SUMMARY_PROVIDER_OPTIONS.openrouter.defaultModel);
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedProvider = SUMMARY_PROVIDER_OPTIONS[summaryProvider];
  const endpoint = selectedProvider.endpoint ?? customEndpoint.trim();
  const needsEndpoint = selectedProvider.provider === 'custom-openai';

  const canSave = useMemo(() => {
    if (!model.trim()) return false;
    if (selectedProvider.requiresKey && !apiKey.trim()) return false;
    if (needsEndpoint && !endpoint) return false;
    return true;
  }, [apiKey, endpoint, model, needsEndpoint, selectedProvider.requiresKey]);

  const handleProviderChange = (value: SummaryProvider) => {
    const nextProvider = SUMMARY_PROVIDER_OPTIONS[value];
    setSummaryProvider(value);
    setModel(nextProvider.defaultModel);
    setCustomEndpoint(nextProvider.endpoint ?? '');
  };

  const saveApiKeySetup = async () => {
    if (!canSave || isSaving) return;

    setIsSaving(true);
    try {
      const modelName = model.trim();
      const trimmedApiKey = apiKey.trim();

      if (selectedProvider.provider === 'custom-openai') {
        await invoke('api_save_custom_openai_config', {
          endpoint,
          apiKey: trimmedApiKey || null,
          model: modelName,
          maxTokens: null,
          temperature: null,
          topP: null,
        });
      }

      await invoke('api_save_model_config', {
        provider: selectedProvider.provider,
        model: modelName,
        whisperModel: 'large-v3',
        apiKey: selectedProvider.provider === 'custom-openai' ? null : trimmedApiKey || null,
        ollamaEndpoint: null,
      });

      await invoke('api_save_transcript_config', {
        provider: 'parakeet',
        model: PARAKEET_MODEL,
        apiKey: null,
      });

      setSetupMode('api');
      toast.success('Summary provider saved');
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

  const skipApiKey = () => {
    setSetupMode('api');
    goToStep(3);
  };

  const useLocalModels = () => {
    setSetupMode('local');
    goToStep(3);
  };

  return (
    <OnboardingContainer
      title="Choose Summary Provider"
      description="Use your own API key for meeting summaries."
      step={2}
      totalSteps={4}
      showNavigation={true}
    >
      <div className="mx-auto w-full max-w-lg space-y-5">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
              <KeyRound className="h-4 w-4 text-gray-700" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-gray-900">Summary API key</h2>
              <p className="text-sm text-gray-500">OpenRouter is selected by default.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="summary-provider">Provider</Label>
              <Select value={summaryProvider} onValueChange={handleProviderChange}>
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

            {needsEndpoint && (
              <div className="space-y-2">
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

            <div className="space-y-2">
              <Label htmlFor="summary-model">Model</Label>
              <Input
                id="summary-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="Provider model name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="summary-api-key">
                API key{selectedProvider.requiresKey ? '' : ' (optional)'}
              </Label>
              <Input
                id="summary-api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste your provider key"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
              <Mic2 className="h-4 w-4 text-gray-700" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900">Transcription stays local</h3>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                Live recording currently uses Parakeet on your Mac. Cloud transcription keys can be added once the recording adapter supports them.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Button
            onClick={saveApiKeySetup}
            disabled={!canSave || isSaving}
            className="h-11 w-full bg-gray-900 text-white hover:bg-gray-800"
          >
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cloud className="mr-2 h-4 w-4" />}
            Continue with API Key
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={useLocalModels}
            className="h-11 w-full"
          >
            <HardDriveDownload className="mr-2 h-4 w-4" />
            Set Up Local Models Instead
          </Button>

          <button
            type="button"
            onClick={skipApiKey}
            className="w-full text-center text-sm text-gray-500 transition-colors hover:text-gray-800"
          >
            Skip API key for now
          </button>
        </div>
      </div>
    </OnboardingContainer>
  );
}
