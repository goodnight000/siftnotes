'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useUpdateCheck } from '@/hooks/useUpdateCheck';
import { updateService, UpdateInfo, UpdateProgress } from '@/services/updateService';
import { UpdateDialog } from './UpdateDialog';
import { getUpdateAction, type UpdateCheckMode } from '@/lib/update-prompt-policy';
import { setUpdateDialogCallback } from './UpdateNotification';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import {
  UPDATE_LAST_LOCATION_KEY,
  UPDATE_PENDING_RESTORE_KEY,
  createUpdateRestoreSnapshot,
  loadUpdateRestoreSnapshot,
  saveUpdateRestoreSnapshot,
} from '@/lib/update-restore-state';
import { toast } from 'sonner';

interface UpdateCheckContextType {
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  checkForUpdates: (force?: boolean, mode?: UpdateCheckMode) => Promise<UpdateInfo | null>;
  showUpdateDialog: () => void;
}

const UpdateCheckContext = createContext<UpdateCheckContextType | undefined>(undefined);

export function UpdateCheckProvider({ children }: { children: React.ReactNode }) {
  const [showDialog, setShowDialog] = useState(false);
  const [startupPhase, setStartupPhase] = useState<'checking' | 'installing' | 'ready'>('checking');
  const [startupProgress, setStartupProgress] = useState<UpdateProgress | null>(null);
  const startupCheckStartedRef = useRef(false);
  const { isRecording } = useRecordingState();

  const handleShowDialog = useCallback(() => {
    setShowDialog(true);
  }, []);

  const savePendingRestoreSnapshot = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const lastLocationSnapshot = loadUpdateRestoreSnapshot(UPDATE_LAST_LOCATION_KEY);
    const snapshot = lastLocationSnapshot ?? createUpdateRestoreSnapshot({
      pathname: window.location.pathname,
      search: window.location.search,
    });

    saveUpdateRestoreSnapshot(UPDATE_PENDING_RESTORE_KEY, snapshot);
  }, []);

  const installSilently = useCallback(async () => {
    setStartupPhase('installing');
    setStartupProgress({ downloaded: 0, total: 0, percentage: 0 });
    savePendingRestoreSnapshot();

    try {
      await updateService.downloadAndInstallLatest(setStartupProgress);
    } catch (error) {
      console.error('Startup update failed:', error);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(UPDATE_PENDING_RESTORE_KEY);
      }
      toast.error('Update failed', {
        description: error instanceof Error ? error.message : 'The app will continue with the current version.',
      });
      setStartupPhase('ready');
    }
  }, [savePendingRestoreSnapshot]);

  const handleUpdateAvailable = useCallback(async (info: UpdateInfo, mode: UpdateCheckMode) => {
    const action = getUpdateAction({
      mode,
      updateInfo: info,
      isRecording,
    });

    if (action === 'install-silently') {
      await installSilently();
      return;
    }

    if (action === 'prompt') {
      handleShowDialog();
      return;
    }

    if (action === 'blocked-by-recording') {
      toast.info('Update available', {
        description: 'Finish or stop the current recording before installing the update.',
      });
      if (mode === 'startup') {
        setStartupPhase('ready');
      }
    }
  }, [handleShowDialog, installSilently, isRecording]);

  const { updateInfo, isChecking, checkForUpdates } = useUpdateCheck({
    checkOnMount: false,
    showNotification: false,
    onUpdateAvailable: handleUpdateAvailable,
  });

  useEffect(() => {
    if (startupCheckStartedRef.current) {
      return;
    }
    startupCheckStartedRef.current = true;

    let cancelled = false;

    const runStartupCheck = async () => {
      setStartupPhase('checking');
      const info = await checkForUpdates(false, 'startup', 10_000);

      if (cancelled) {
        return;
      }

      if (!info?.available) {
        setStartupPhase('ready');
      }
    };

    runStartupCheck();

    return () => {
      cancelled = true;
    };
  }, [checkForUpdates]);

  useEffect(() => {
    if (startupPhase !== 'ready') {
      return;
    }

    const interval = window.setInterval(() => {
      checkForUpdates(false, 'interactive');
    }, 24 * 60 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [checkForUpdates, startupPhase]);

  useEffect(() => {
    // Register the callback so UpdateNotification can trigger the dialog
    setUpdateDialogCallback(handleShowDialog);
    return () => {
      setUpdateDialogCallback(() => {});
    };
  }, [handleShowDialog]);

  // Listen for tray menu events
  useEffect(() => {
    const handleTrayCheck = () => {
      checkForUpdates(true, 'interactive'); // Force check from tray
    };

    window.addEventListener('check-updates-from-tray', handleTrayCheck);
    return () => window.removeEventListener('check-updates-from-tray', handleTrayCheck);
  }, [checkForUpdates]);

  const contextValue = {
    updateInfo,
    isChecking,
    checkForUpdates,
    showUpdateDialog: handleShowDialog,
  };

  if (startupPhase !== 'ready') {
    return (
      <UpdateCheckContext.Provider value={contextValue}>
        <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-900">
          <div className="w-full max-w-sm px-6 text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
            <h1 className="text-lg font-semibold">
              {startupPhase === 'installing' ? 'Updating SiftNotes' : 'Checking for updates'}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {startupPhase === 'installing'
                ? 'Installing the latest version. The app will reopen automatically.'
                : 'Preparing the latest available version.'}
            </p>
            {startupPhase === 'installing' && startupProgress && (
              <div className="mt-5">
                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${Math.min(startupProgress.percentage, 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {Math.round(startupProgress.percentage)}% complete
                </p>
              </div>
            )}
          </div>
        </div>
      </UpdateCheckContext.Provider>
    );
  }

  return (
    <UpdateCheckContext.Provider value={contextValue}>
      {children}
      <UpdateDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        updateInfo={updateInfo}
        onBeforeInstall={savePendingRestoreSnapshot}
      />
    </UpdateCheckContext.Provider>
  );
}

export function useUpdateCheckContext() {
  const context = useContext(UpdateCheckContext);
  if (context === undefined) {
    throw new Error('useUpdateCheckContext must be used within UpdateCheckProvider');
  }
  return context;
}
