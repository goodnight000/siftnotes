import { useCallback, useEffect, useState } from 'react';
import { updateService, UpdateInfo } from '@/services/updateService';
import { showUpdateNotification } from '@/components/UpdateNotification';
import type { UpdateCheckMode } from '@/lib/update-prompt-policy';

interface UseUpdateCheckOptions {
  checkOnMount?: boolean;
  showNotification?: boolean;
  onUpdateAvailable?: (info: UpdateInfo, mode: UpdateCheckMode) => void | Promise<void>;
  defaultMode?: UpdateCheckMode;
}

export function useUpdateCheck(options: UseUpdateCheckOptions = {}) {
  const {
    checkOnMount = true,
    showNotification = true,
    onUpdateAvailable,
    defaultMode = 'interactive',
  } = options;

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkForUpdates = useCallback(async (
    force = false,
    mode: UpdateCheckMode = defaultMode,
    timeoutMs = 10_000
  ): Promise<UpdateInfo | null> => {
    // Skip if checked recently (unless forced)
    if (!force && updateService.wasCheckedRecently()) {
      return null;
    }

    setIsChecking(true);
    try {
      const info = await updateService.checkForUpdates(force, timeoutMs);
      setUpdateInfo(info);

      if (info.available) {
        if (onUpdateAvailable) {
          await onUpdateAvailable(info, mode);
        } else if (showNotification) {
          showUpdateNotification(info, () => {
            // This will be handled by the component that uses this hook
          });
        }
      }

      return info;
    } catch (error) {
      console.error('Failed to check for updates:', error);
      // Silently fail on startup checks to avoid disrupting user experience
      return null;
    } finally {
      setIsChecking(false);
    }
  }, [defaultMode, onUpdateAvailable, showNotification]);

  useEffect(() => {
    if (checkOnMount) {
      // Delay the check slightly to avoid blocking app startup
      const timer = setTimeout(() => {
        checkForUpdates(false, defaultMode);
      }, 2000); // Check 2 seconds after mount

      return () => clearTimeout(timer);
    }
  }, [checkForUpdates, checkOnMount, defaultMode]);

  return {
    updateInfo,
    isChecking,
    checkForUpdates,
  };
}
