import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectSeparator,
    SelectTrigger,
    SelectValue
} from './ui/select';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Eye, EyeOff, Lock, RefreshCw, Unlock } from 'lucide-react';
import { ModelManager } from './WhisperModelManager';
import { ParakeetModelManager } from './ParakeetModelManager';
import {
    getAdvancedTranscriptionProviderOptions,
    getDefaultTranscriptionModel,
    getPrimaryTranscriptionProviderOptions,
    getTranscriptionProviderLabel,
} from '@/lib/settings-provider-options';


export interface TranscriptModelProps {
    provider: 'localWhisper' | 'parakeet' | 'deepgram' | 'elevenLabs' | 'groq' | 'openai';
    model: string;
    apiKey?: string | null;
}

export interface TranscriptSettingsProps {
    transcriptModelConfig: TranscriptModelProps;
    setTranscriptModelConfig: (config: TranscriptModelProps) => void;
    onModelSelect?: () => void;
}

export function TranscriptSettings({ transcriptModelConfig, setTranscriptModelConfig, onModelSelect }: TranscriptSettingsProps) {
    const [apiKey, setApiKey] = useState<string | null>(transcriptModelConfig.apiKey || null);
    const [showApiKey, setShowApiKey] = useState<boolean>(false);
    const [isApiKeyLocked, setIsApiKeyLocked] = useState<boolean>(true);
    const [isLockButtonVibrating, setIsLockButtonVibrating] = useState<boolean>(false);
    const [uiProvider, setUiProvider] = useState<TranscriptModelProps['provider']>(transcriptModelConfig.provider);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // Sync uiProvider when backend config changes (e.g., after model selection or initial load)
    useEffect(() => {
        setUiProvider(transcriptModelConfig.provider);
    }, [transcriptModelConfig.provider]);

    useEffect(() => {
        if (transcriptModelConfig.provider === 'localWhisper' || transcriptModelConfig.provider === 'parakeet') {
            setApiKey(null);
        }
    }, [transcriptModelConfig.provider]);

    const fetchApiKey = async (provider: string) => {
        try {

            const data = await invoke('api_get_transcript_api_key', { provider }) as string;

            setApiKey(data || '');
            setIsApiKeyLocked(!!data?.trim());
            return data || '';
        } catch (err) {
            console.error('Error fetching API key:', err);
            setApiKey(null);
            setIsApiKeyLocked(false);
            return '';
        }
    };
    const modelOptions = {
        localWhisper: [], // Model selection handled by ModelManager component
        parakeet: [], // Model selection handled by ParakeetModelManager component
        deepgram: ['nova-2-phonecall'],
        elevenLabs: ['scribe_v2', 'scribe_v1'],
        groq: ['whisper-large-v3-turbo', 'whisper-large-v3'],
        openai: ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe'],
    };
    const requiresApiKey = uiProvider === 'deepgram' || uiProvider === 'elevenLabs' || uiProvider === 'openai' || uiProvider === 'groq';
    const isLocalProvider = uiProvider === 'localWhisper' || uiProvider === 'parakeet';
    const providerLabel = getTranscriptionProviderLabel(uiProvider);
    const isSaveDisabled = isSaving || (requiresApiKey && (!apiKey?.trim() || !transcriptModelConfig.model?.trim()));

    const handleProviderChange = (provider: TranscriptModelProps['provider']) => {
        setUiProvider(provider);

        if (provider === 'localWhisper' || provider === 'parakeet') {
            setApiKey(null);
            setTranscriptModelConfig({
                ...transcriptModelConfig,
                provider,
                model: getDefaultTranscriptionModel(provider),
                apiKey: null
            });
            return;
        }

        setApiKey('');
        void fetchApiKey(provider);
        setTranscriptModelConfig({
            ...transcriptModelConfig,
            provider,
            model: modelOptions[provider][0] || getDefaultTranscriptionModel(provider),
        });
    };

    const handleSave = async () => {
        const trimmedApiKey = apiKey?.trim() || '';
        const configToSave: TranscriptModelProps = {
            ...transcriptModelConfig,
            provider: uiProvider,
            model: transcriptModelConfig.model || getDefaultTranscriptionModel(uiProvider),
            apiKey: requiresApiKey ? trimmedApiKey || null : null,
        };

        if (requiresApiKey && !trimmedApiKey) {
            toast.error(`${providerLabel} API key is required`);
            return;
        }

        setIsSaving(true);
        try {
            await invoke('api_save_transcript_config', {
                provider: configToSave.provider,
                model: configToSave.model,
                apiKey: configToSave.apiKey,
            });
            setTranscriptModelConfig(configToSave);
            if (requiresApiKey) setIsApiKeyLocked(true);
            toast.success('Transcription provider saved');
        } catch (error) {
            console.error('Failed to save transcription provider:', error);
            toast.error('Failed to save transcription provider', {
                description: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputClick = () => {
        if (isApiKeyLocked) {
            setIsLockButtonVibrating(true);
            setTimeout(() => setIsLockButtonVibrating(false), 500);
        }
    };

    const handleWhisperModelSelect = (modelName: string) => {
        // Always update config when model is selected, regardless of current provider
        // This ensures the model is set when user switches back
        setTranscriptModelConfig({
            ...transcriptModelConfig,
            provider: 'localWhisper', // Ensure provider is set correctly
            model: modelName
        });
        // Close modal after selection
        if (onModelSelect) {
            onModelSelect();
        }
    };

    const handleParakeetModelSelect = (modelName: string) => {
        // Always update config when model is selected, regardless of current provider
        // This ensures the model is set when user switches back
        setTranscriptModelConfig({
            ...transcriptModelConfig,
            provider: 'parakeet', // Ensure provider is set correctly
            model: modelName
        });
        // Close modal after selection
        if (onModelSelect) {
            onModelSelect();
        }
    };

    return (
        <div>
            <div>
                {/* <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Transcript Settings</h3>
                </div> */}
                <div className="space-y-5 pb-6">
                    <div>
                        <div className="mb-3">
                            <h3 className="text-lg font-semibold text-gray-900">Transcription provider</h3>
                            <p className="text-sm text-gray-600">ElevenLabs Scribe is the default cloud transcription path.</p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label className="block text-sm font-medium text-gray-700">
                                    Provider
                                </Label>
                                <Select
                                    value={uiProvider}
                                    onValueChange={(value) => {
                                        handleProviderChange(value as TranscriptModelProps['provider']);
                                    }}
                                >
                                    <SelectTrigger className='focus:ring-1 focus:ring-blue-500 focus:border-blue-500'>
                                        <SelectValue placeholder="Select provider" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectLabel>API providers</SelectLabel>
                                            {getPrimaryTranscriptionProviderOptions().map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                        <SelectSeparator />
                                        <SelectGroup>
                                            <SelectLabel>Advanced local fallback</SelectLabel>
                                            {getAdvancedTranscriptionProviderOptions().map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>

                            {!isLocalProvider && (
                                <div className="space-y-2">
                                    <Label className="block text-sm font-medium text-gray-700">
                                        Model
                                    </Label>
                                    <Select
                                        value={transcriptModelConfig.model}
                                        onValueChange={(value) => {
                                            const model = value as TranscriptModelProps['model'];
                                            setTranscriptModelConfig({ ...transcriptModelConfig, provider: uiProvider, model });
                                        }}
                                    >
                                        <SelectTrigger className='focus:ring-1 focus:ring-blue-500 focus:border-blue-500'>
                                            <SelectValue placeholder="Select model" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {modelOptions[uiProvider].map((model) => (
                                                <SelectItem key={model} value={model}>{model}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    </div>

                    {uiProvider === 'localWhisper' && (
                        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                            <h4 className="mb-3 text-sm font-semibold text-gray-900">Advanced local transcription</h4>
                            <ModelManager
                                selectedModel={transcriptModelConfig.provider === 'localWhisper' ? transcriptModelConfig.model : undefined}
                                onModelSelect={handleWhisperModelSelect}
                                autoSave={true}
                            />
                        </div>
                    )}

                    {uiProvider === 'parakeet' && (
                        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                            <h4 className="mb-3 text-sm font-semibold text-gray-900">Advanced local transcription</h4>
                            <ParakeetModelManager
                                selectedModel={transcriptModelConfig.provider === 'parakeet' ? transcriptModelConfig.model : undefined}
                                onModelSelect={handleParakeetModelSelect}
                                autoSave={true}
                            />
                        </div>
                    )}


                    {requiresApiKey && (
                        <div>
                            <Label className="block text-sm font-medium text-gray-700 mb-1">
                                {providerLabel} API key
                            </Label>
                            <div className="relative mx-1">
                                <Input
                                    type={showApiKey ? "text" : "password"}
                                    className={`pr-24 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${isApiKeyLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                                        }`}
                                    value={apiKey || ''}
                                    onChange={(e) => {
                                        const nextApiKey = e.target.value;
                                        setApiKey(nextApiKey);
                                        setTranscriptModelConfig({
                                            ...transcriptModelConfig,
                                            provider: uiProvider,
                                            apiKey: nextApiKey,
                                        });
                                    }}
                                    disabled={isApiKeyLocked}
                                    onClick={handleInputClick}
                                    placeholder="Enter your API key"
                                />
                                {isApiKeyLocked && (
                                    <div
                                        onClick={handleInputClick}
                                        className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-50 rounded-md cursor-not-allowed"
                                    />
                                )}
                                <div className="absolute inset-y-0 right-0 pr-1 flex items-center">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setIsApiKeyLocked(!isApiKeyLocked)}
                                        className={`transition-colors duration-200 ${isLockButtonVibrating ? 'animate-vibrate text-red-500' : ''
                                            }`}
                                        title={isApiKeyLocked ? "Unlock to edit" : "Lock to prevent editing"}
                                    >
                                        {isApiKeyLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setShowApiKey(!showApiKey)}
                                    >
                                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <Button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaveDisabled}
                            className="min-w-28 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
                        >
                            {isSaving ? (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                    Saving
                                </>
                            ) : (
                                'Save'
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div >
    )
}




