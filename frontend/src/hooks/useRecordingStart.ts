import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useConfig } from '@/contexts/ConfigContext';
import { useRecordingState, RecordingStatus } from '@/contexts/RecordingStateContext';
import { recordingService } from '@/services/recordingService';
import Analytics from '@/lib/analytics';
import { showRecordingNotification } from '@/lib/recordingNotification';
import {
  getTranscriptionProviderLabel,
  isCloudTranscriptionProvider,
  type ApiFirstTranscriptionConfig,
  type TranscriptionSettingsProvider,
} from '@/lib/settings-provider-options';
import { toast } from 'sonner';

interface UseRecordingStartReturn {
  handleRecordingStart: () => Promise<void>;
  isAutoStarting: boolean;
}

type TranscriptionPreflightResult =
  | { ready: true }
  | {
      ready: false;
      reason: 'downloading' | 'missing' | 'config';
      title: string;
      description: string;
    };

/**
 * Custom hook for managing recording start lifecycle.
 * Handles both manual start (button click) and auto-start (from sidebar navigation).
 *
 * Features:
 * - Meeting title generation (format: Meeting DD_MM_YY_HH_MM_SS)
 * - Transcript clearing on start
 * - Analytics tracking
 * - Recording notification display
 * - Auto-start from sidebar via sessionStorage flag
 */
export function useRecordingStart(
  isRecording: boolean,
  setIsRecording: (value: boolean) => void,
  showModal?: (name: 'modelSelector', message?: string) => void
): UseRecordingStartReturn {
  const [isAutoStarting, setIsAutoStarting] = useState(false);

  const { clearTranscripts, setMeetingTitle } = useTranscripts();
  const { setIsMeetingActive } = useSidebar();
  const { selectedDevices } = useConfig();
  const { setStatus } = useRecordingState();

  // Generate meeting title with timestamp
  const generateMeetingTitle = useCallback(() => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `Meeting ${day}_${month}_${year}_${hours}_${minutes}_${seconds}`;
  }, []);

  // Check if Parakeet transcription model is ready
  const checkParakeetReady = useCallback(async (): Promise<boolean> => {
    try {
      await invoke('parakeet_init');
      const hasModels = await invoke<boolean>('parakeet_has_available_models');
      return hasModels;
    } catch (error) {
      console.error('Failed to check Parakeet status:', error);
      return false;
    }
  }, []);

  // Check if any model is currently downloading
  const checkIfModelDownloading = useCallback(async (): Promise<boolean> => {
    try {
      const models = await invoke<any[]>('parakeet_get_available_models');
      const isDownloading = models.some(m =>
        m.status && (
          typeof m.status === 'object'
            ? 'Downloading' in m.status
            : m.status === 'Downloading'
        )
      );
      return isDownloading;
    } catch (error) {
      console.error('Failed to check model download status:', error);
      return false; // Default to not downloading (will show error + modal)
    }
  }, []);

  const checkTranscriptionReadyForRecording = useCallback(async (): Promise<TranscriptionPreflightResult> => {
    let config: ApiFirstTranscriptionConfig | null = null;

    try {
      config = await invoke<ApiFirstTranscriptionConfig | null>('api_get_transcript_config');
    } catch (error) {
      console.error('Failed to read transcription provider config:', error);
      return {
        ready: false,
        reason: 'config',
        title: 'Transcription API setup required',
        description: 'Could not verify your transcription provider. Open settings and save it again.',
      };
    }

    if (isCloudTranscriptionProvider(config?.provider)) {
      const providerLabel = getTranscriptionProviderLabel(config.provider as TranscriptionSettingsProvider);

      if (!config?.model?.trim()) {
        return {
          ready: false,
          reason: 'config',
          title: 'Transcription API setup required',
          description: `Select a ${providerLabel} transcription model before recording.`,
        };
      }

      if (!config?.apiKey?.trim()) {
        return {
          ready: false,
          reason: 'config',
          title: 'Transcription API setup required',
          description: `Save a ${providerLabel} API key before recording.`,
        };
      }

      return { ready: true };
    }

    const parakeetReady = await checkParakeetReady();
    if (parakeetReady) {
      return { ready: true };
    }

    const isDownloading = await checkIfModelDownloading();
    if (isDownloading) {
      return {
        ready: false,
        reason: 'downloading',
        title: 'Model download in progress',
        description: 'Please wait for the transcription model to finish downloading before recording.',
      };
    }

    return {
      ready: false,
      reason: 'missing',
      title: 'Transcription model not ready',
      description: 'Please download a transcription model before recording.',
    };
  }, [checkIfModelDownloading, checkParakeetReady]);

  const showTranscriptionPreflightMessage = useCallback((result: Exclude<TranscriptionPreflightResult, { ready: true }>) => {
    if (result.reason === 'downloading') {
      toast.info(result.title, {
        description: result.description,
        duration: 5000,
      });
      return;
    }

    toast.error(result.title, {
      description: result.description,
      duration: 5000,
    });
    showModal?.('modelSelector', result.title);
  }, [showModal]);

  // Handle manual recording start (from button click)
  const handleRecordingStart = useCallback(async () => {
    try {
      console.log('handleRecordingStart called - checking transcription provider status');

      const transcriptionReady = await checkTranscriptionReadyForRecording();
      if (!transcriptionReady.ready) {
        showTranscriptionPreflightMessage(transcriptionReady);
        if (transcriptionReady.reason === 'downloading') {
          Analytics.trackButtonClick('start_recording_blocked_downloading', 'home_page');
        } else {
          Analytics.trackButtonClick('start_recording_blocked_missing', 'home_page');
        }
        setStatus(RecordingStatus.IDLE);
        return;
      }

      console.log('Transcription provider ready - setting up meeting title and state');

      const randomTitle = generateMeetingTitle();
      setMeetingTitle(randomTitle);

      // Set STARTING status before initiating backend recording
      setStatus(RecordingStatus.STARTING, 'Initializing recording...');

      // Start the actual backend recording
      console.log('Starting backend recording with meeting:', randomTitle);
      await recordingService.startRecordingWithDevices(
        selectedDevices?.micDevice || null,
        selectedDevices?.systemDevice || null,
        randomTitle
      );
      console.log('Backend recording started successfully');

      // Update state after successful backend start
      // Note: RECORDING status will be set by RecordingStateContext event listener
      console.log('Setting isRecordingState to true');
      setIsRecording(true); // This will also update the sidebar via the useEffect
      clearTranscripts(); // Clear previous transcripts when starting new recording
      setIsMeetingActive(true);
      Analytics.trackButtonClick('start_recording', 'home_page');

      // Show recording notification if enabled
      await showRecordingNotification();
    } catch (error) {
      console.error('Failed to start recording:', error);
      setStatus(RecordingStatus.ERROR, error instanceof Error ? error.message : 'Failed to start recording');
      setIsRecording(false); // Reset state on error
      Analytics.trackButtonClick('start_recording_error', 'home_page');
      // Re-throw so RecordingControls can handle device-specific errors
      throw error;
    }
  }, [generateMeetingTitle, setMeetingTitle, setIsRecording, clearTranscripts, setIsMeetingActive, checkTranscriptionReadyForRecording, showTranscriptionPreflightMessage, selectedDevices, setStatus]);

  // Check for autoStartRecording flag and start recording automatically
  useEffect(() => {
    const checkAutoStartRecording = async () => {
      if (typeof window !== 'undefined') {
        const shouldAutoStart = sessionStorage.getItem('autoStartRecording');
        if (shouldAutoStart === 'true' && !isRecording && !isAutoStarting) {
          console.log('Auto-starting recording from navigation...');
          setIsAutoStarting(true);
          sessionStorage.removeItem('autoStartRecording'); // Clear the flag

          const transcriptionReady = await checkTranscriptionReadyForRecording();
          if (!transcriptionReady.ready) {
            showTranscriptionPreflightMessage(transcriptionReady);
            if (transcriptionReady.reason === 'downloading') {
              Analytics.trackButtonClick('start_recording_blocked_downloading', 'sidebar_auto');
            } else {
              Analytics.trackButtonClick('start_recording_blocked_missing', 'sidebar_auto');
            }
            setStatus(RecordingStatus.IDLE);
            setIsAutoStarting(false);
            return;
          }

          // Start the actual backend recording
          try {
            // Generate meeting title
            const generatedMeetingTitle = generateMeetingTitle();

            // Set STARTING status before initiating backend recording
            setStatus(RecordingStatus.STARTING, 'Initializing recording...');

            console.log('Auto-starting backend recording with meeting:', generatedMeetingTitle);
            const result = await recordingService.startRecordingWithDevices(
              selectedDevices?.micDevice || null,
              selectedDevices?.systemDevice || null,
              generatedMeetingTitle
            );
            console.log('Auto-start backend recording result:', result);

            // Update UI state after successful backend start
            // Note: RECORDING status will be set by RecordingStateContext event listener
            setMeetingTitle(generatedMeetingTitle);
            setIsRecording(true);
            clearTranscripts();
            setIsMeetingActive(true);
            Analytics.trackButtonClick('start_recording', 'sidebar_auto');

            // Show recording notification if enabled
            await showRecordingNotification();
          } catch (error) {
            console.error('Failed to auto-start recording:', error);
            setStatus(RecordingStatus.ERROR, error instanceof Error ? error.message : 'Failed to auto-start recording');
            alert('Failed to start recording. Check console for details.');
            Analytics.trackButtonClick('start_recording_error', 'sidebar_auto');
          } finally {
            setIsAutoStarting(false);
          }
        }
      }
    };

    checkAutoStartRecording();
  }, [
    isRecording,
    isAutoStarting,
    selectedDevices,
    generateMeetingTitle,
    setMeetingTitle,
    setIsRecording,
    clearTranscripts,
    setIsMeetingActive,
    checkTranscriptionReadyForRecording,
    showTranscriptionPreflightMessage,
    setStatus,
  ]);

  // Listen for direct recording trigger from sidebar when already on home page
  useEffect(() => {
    const handleDirectStart = async () => {
      if (isRecording || isAutoStarting) {
        console.log('Recording already in progress, ignoring direct start event');
        return;
      }

      console.log('Direct start from sidebar - checking transcription provider status');
      setIsAutoStarting(true);

      const transcriptionReady = await checkTranscriptionReadyForRecording();
      if (!transcriptionReady.ready) {
        showTranscriptionPreflightMessage(transcriptionReady);
        if (transcriptionReady.reason === 'downloading') {
          Analytics.trackButtonClick('start_recording_blocked_downloading', 'sidebar_direct');
        } else {
          Analytics.trackButtonClick('start_recording_blocked_missing', 'sidebar_direct');
        }
        setStatus(RecordingStatus.IDLE);
        setIsAutoStarting(false);
        return;
      }

      try {
        // Generate meeting title
        const generatedMeetingTitle = generateMeetingTitle();

        // Set STARTING status before initiating backend recording
        setStatus(RecordingStatus.STARTING, 'Initializing recording...');

        console.log('Starting backend recording with meeting:', generatedMeetingTitle);
        const result = await recordingService.startRecordingWithDevices(
          selectedDevices?.micDevice || null,
          selectedDevices?.systemDevice || null,
          generatedMeetingTitle
        );
        console.log('Backend recording result:', result);

        // Update UI state after successful backend start
        // Note: RECORDING status will be set by RecordingStateContext event listener
        setMeetingTitle(generatedMeetingTitle);
        setIsRecording(true);
        clearTranscripts();
        setIsMeetingActive(true);
        Analytics.trackButtonClick('start_recording', 'sidebar_direct');

        // Show recording notification if enabled
        await showRecordingNotification();
      } catch (error) {
        console.error('Failed to start recording from sidebar:', error);
        setStatus(RecordingStatus.ERROR, error instanceof Error ? error.message : 'Failed to start recording from sidebar');
        alert('Failed to start recording. Check console for details.');
        Analytics.trackButtonClick('start_recording_error', 'sidebar_direct');
      } finally {
        setIsAutoStarting(false);
      }
    };

    window.addEventListener('start-recording-from-sidebar', handleDirectStart);

    return () => {
      window.removeEventListener('start-recording-from-sidebar', handleDirectStart);
    };
  }, [
    isRecording,
    isAutoStarting,
    selectedDevices,
    generateMeetingTitle,
    setMeetingTitle,
    setIsRecording,
    clearTranscripts,
    setIsMeetingActive,
    checkTranscriptionReadyForRecording,
    showTranscriptionPreflightMessage,
    setStatus,
  ]);

  return {
    handleRecordingStart,
    isAutoStarting,
  };
}
