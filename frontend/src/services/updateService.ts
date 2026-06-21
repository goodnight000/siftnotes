/**
 * Update Service
 *
 * Handles automatic software updates using Tauri updater plugin.
 * Provides update checking, downloading, and installation functionality.
 */

import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  version?: string;
  date?: string;
  body?: string;
  downloadUrl?: string;
}

export interface UpdateProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

/**
 * Update Service
 * Singleton service for managing app updates
 */
export class UpdateService {
  private updateCheckInProgress = false;
  private lastCheckTime: number | null = null;
  private readonly CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Check for available updates
   * @param force Force check even if recently checked
   * @returns Promise with update information
   */
  async checkForUpdates(force = false, timeoutMs = 10_000): Promise<UpdateInfo> {
    // Prevent concurrent update checks
    if (this.updateCheckInProgress) {
      throw new Error('Update check already in progress');
    }

    // Skip if checked recently (unless forced)
    if (!force && this.lastCheckTime) {
      const timeSinceLastCheck = Date.now() - this.lastCheckTime;
      if (timeSinceLastCheck < this.CHECK_INTERVAL_MS) {
        console.log('Skipping update check - checked recently');
        return {
          available: false,
          currentVersion: await getVersion(),
        };
      }
    }

    this.updateCheckInProgress = true;
    this.lastCheckTime = Date.now();

    try {
      const currentVersion = await getVersion();
      const update = await check({ timeout: timeoutMs });

      if (!update) {
        return {
          available: false,
          currentVersion,
        };
      }

      return {
        available: true,
        currentVersion: update.currentVersion || currentVersion,
        version: update.version,
        date: update.date,
        body: update.body,
      };
    } catch (error) {
      console.error('Failed to check for updates:', error);
      throw error;
    } finally {
      this.updateCheckInProgress = false;
    }
  }

  /**
   * Download and install the available update
   * @param update The update object from checkForUpdates
   * @param onProgress Optional progress callback
   * @returns Promise that resolves when download completes
   */
  async downloadAndInstall(
    update: Update,
    onProgress?: (progress: UpdateProgress) => void
  ): Promise<void> {
    try {
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            downloaded = 0;
            contentLength = event.data.contentLength || 0;
            onProgress?.({
              downloaded,
              total: contentLength,
              percentage: 0,
            });
            break;
          case 'Progress':
            downloaded += event.data.chunkLength || 0;
            onProgress?.({
              downloaded,
              total: contentLength,
              percentage: contentLength > 0
                ? Math.round((downloaded / contentLength) * 100)
                : 0,
            });
            break;
          case 'Finished':
            onProgress?.({
              downloaded: contentLength,
              total: contentLength,
              percentage: 100,
            });
            break;
        }
      });

      await relaunch();
    } catch (error) {
      console.error('Failed to download/install update:', error);
      throw error;
    }
  }

  /**
   * Re-check for the latest update, install it, and relaunch the app.
   * This is used by startup auto-update where no Update object is retained.
   */
  async downloadAndInstallLatest(
    onProgress?: (progress: UpdateProgress) => void,
    timeoutMs = 10_000
  ): Promise<void> {
    const update = await check({ timeout: timeoutMs });

    if (!update?.available) {
      throw new Error('Update no longer available');
    }

    await this.downloadAndInstall(update, onProgress);
  }

  /**
   * Get the current app version
   * @returns Promise with version string
   */
  async getCurrentVersion(): Promise<string> {
    return getVersion();
  }

  /**
   * Check if an update check was performed recently
   * @returns true if checked within the interval
   */
  wasCheckedRecently(): boolean {
    if (!this.lastCheckTime) return false;
    const timeSinceLastCheck = Date.now() - this.lastCheckTime;
    return timeSinceLastCheck < this.CHECK_INTERVAL_MS;
  }
}

// Export singleton instance
export const updateService = new UpdateService();
