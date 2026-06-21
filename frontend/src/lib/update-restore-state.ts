export const UPDATE_PENDING_RESTORE_KEY = 'siftnotes.update.pendingRestore';
export const UPDATE_LAST_LOCATION_KEY = 'siftnotes.update.lastLocation';
export const UPDATE_RESTORE_TTL_MS = 30 * 60 * 1000;

const ALLOWED_RESTORE_ROUTES = ['/', '/meeting-details', '/settings'];

export interface UpdateRestoreMeeting {
  id: string;
  title: string;
}

export interface UpdateRestoreSnapshot {
  pathname: string;
  search: string;
  savedAt: number;
  currentMeeting?: UpdateRestoreMeeting | null;
}

export interface CreateUpdateRestoreSnapshotInput {
  pathname: string;
  search?: string;
  savedAt?: number;
  currentMeeting?: UpdateRestoreMeeting | null;
}

export function createUpdateRestoreSnapshot({
  pathname,
  search = '',
  savedAt = Date.now(),
  currentMeeting = null,
}: CreateUpdateRestoreSnapshotInput): UpdateRestoreSnapshot {
  return {
    pathname,
    search: normalizeSearch(search),
    currentMeeting,
    savedAt,
  };
}

export function serializeUpdateRestoreSnapshot(snapshot: UpdateRestoreSnapshot): string {
  return JSON.stringify(snapshot);
}

export function parseUpdateRestoreSnapshot(value: string | null): UpdateRestoreSnapshot | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<UpdateRestoreSnapshot>;
    if (typeof parsed.pathname !== 'string' || typeof parsed.savedAt !== 'number') {
      return null;
    }

    return {
      pathname: parsed.pathname,
      search: typeof parsed.search === 'string' ? parsed.search : '',
      currentMeeting: isRestoreMeeting(parsed.currentMeeting) ? parsed.currentMeeting : null,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function isFreshUpdateRestoreSnapshot(
  snapshot: UpdateRestoreSnapshot,
  now = Date.now(),
  ttlMs = UPDATE_RESTORE_TTL_MS,
): boolean {
  return now - snapshot.savedAt <= ttlMs;
}

export function resolveUpdateRestoreDestination(
  snapshot: UpdateRestoreSnapshot | null,
  now = Date.now(),
): string | null {
  if (!snapshot || !isFreshUpdateRestoreSnapshot(snapshot, now)) {
    return null;
  }

  if (!isSafePathname(snapshot.pathname)) {
    return null;
  }

  const pathname = ALLOWED_RESTORE_ROUTES.includes(snapshot.pathname)
    ? snapshot.pathname
    : '/';

  if (pathname === '/') {
    return '/';
  }

  return `${pathname}${normalizeSearch(snapshot.search)}`;
}

export function saveUpdateRestoreSnapshot(
  key: string,
  snapshot: UpdateRestoreSnapshot,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): void {
  storage.setItem(key, serializeUpdateRestoreSnapshot(snapshot));
}

export function loadUpdateRestoreSnapshot(
  key: string,
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): UpdateRestoreSnapshot | null {
  return parseUpdateRestoreSnapshot(storage.getItem(key));
}

export function consumeUpdateRestoreSnapshot(
  key: string,
  storage: Pick<Storage, 'getItem' | 'removeItem'> = window.localStorage,
): UpdateRestoreSnapshot | null {
  const snapshot = loadUpdateRestoreSnapshot(key, storage);
  storage.removeItem(key);
  return snapshot;
}

function normalizeSearch(search: string): string {
  if (!search) {
    return '';
  }
  return search.startsWith('?') ? search : `?${search}`;
}

function isSafePathname(pathname: string): boolean {
  return pathname.startsWith('/') && !pathname.startsWith('//') && !pathname.includes('://');
}

function isRestoreMeeting(value: unknown): value is UpdateRestoreMeeting {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const meeting = value as Partial<UpdateRestoreMeeting>;
  return typeof meeting.id === 'string' && typeof meeting.title === 'string';
}
