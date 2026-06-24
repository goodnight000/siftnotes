import React from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { UpdateInfo } from '@/services/updateService';

let globalShowDialogCallback: (() => void) | null = null;

export function setUpdateDialogCallback(callback: () => void) {
  globalShowDialogCallback = callback;
}

export function showUpdateNotification(updateInfo: UpdateInfo, onUpdateClick?: () => void) {
  const handleClick = () => {
    if (onUpdateClick) {
      onUpdateClick();
    } else if (globalShowDialogCallback) {
      globalShowDialogCallback();
    }
  };

  toast.info(
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <Download className="h-4 w-4 flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">Update Available</p>
          <p className="text-sm text-muted-foreground truncate">
            Version {updateInfo.version} is now available
          </p>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
        className="text-sm font-medium text-blue-600 hover:text-blue-700 underline flex-shrink-0"
      >
        View Details
      </button>
    </div>,
    {
      duration: 10000,
      position: 'bottom-center',
    }
  );
}
