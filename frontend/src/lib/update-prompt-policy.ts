import type { UpdateInfo } from '@/services/updateService';

export type UpdateCheckMode = 'startup' | 'interactive';
export type UpdateAction = 'none' | 'install-silently' | 'prompt' | 'blocked-by-recording';

export interface UpdateActionInput {
  mode: UpdateCheckMode;
  updateInfo: Pick<UpdateInfo, 'available'> | null;
  isRecording: boolean;
}

export function getUpdateAction({
  mode,
  updateInfo,
  isRecording,
}: UpdateActionInput): UpdateAction {
  if (updateInfo?.available !== true) {
    return 'none';
  }

  if (isRecording) {
    return 'blocked-by-recording';
  }

  return mode === 'startup' ? 'install-silently' : 'prompt';
}

export function shouldOpenUpdateDialog(updateInfo: Pick<UpdateInfo, 'available'> | null): boolean {
  return getUpdateAction({
    mode: 'interactive',
    updateInfo,
    isRecording: false,
  }) === 'prompt';
}
