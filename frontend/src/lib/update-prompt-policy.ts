import type { UpdateInfo } from '@/services/updateService';

export function shouldOpenUpdateDialog(updateInfo: Pick<UpdateInfo, 'available'> | null): boolean {
  return updateInfo?.available === true;
}
