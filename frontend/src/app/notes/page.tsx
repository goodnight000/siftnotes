'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronDown } from 'lucide-react';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';

function fmtDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Mirror the sidebar's routing rule (Sidebar/index.tsx:635-636).
function hrefFor(id: string) {
  if (id.startsWith('intro-call')) return '/';
  return id.includes('-') ? `/meeting-details?id=${id}` : `/notes/${id}`;
}

export default function AllNotesPage() {
  const router = useRouter();
  const { meetings } = useSidebar();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...meetings]
      .filter((m) => !m.is_archived)
      .filter((m) => !q || m.title?.toLowerCase().includes(q))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [meetings, query]);

  return (
    <div className="flex h-full flex-col bg-paper">
      <header className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3 px-8 pt-6 pb-4">
        <div className="min-w-0">
          <h1 className="truncate text-h1 text-ink">All notes</h1>
          <div className="mt-1 text-caption text-ink-3">{rows.length} notes</div>
        </div>
        <div className="no-drag flex min-w-0 flex-1 items-center justify-end gap-2.5 sm:flex-none">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 sm:flex-none">
            <Search className="h-4 w-4 flex-none text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="min-w-0 flex-1 bg-transparent text-small text-ink outline-none placeholder:text-ink-3 sm:w-44 sm:flex-none"
            />
          </div>
          <button className="flex flex-none items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-small text-ink-2">
            Recent <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="custom-scrollbar flex-1 overflow-auto px-8 pb-8">
        {rows.length === 0 ? (
          <div className="grid h-40 place-items-center text-ink-3">No notes yet.</div>
        ) : (
          rows.map((m) => (
            <button
              key={m.id}
              onClick={() => router.push(hrefFor(m.id))}
              className="flex w-full items-center gap-3 border-b border-border px-2.5 py-3.5 text-left transition-colors hover:bg-sunken sm:gap-5"
            >
              <span className="min-w-0 flex-1 truncate text-small font-semibold text-ink sm:w-60 sm:flex-none">
                {m.title || 'Untitled meeting'}
              </span>
              <span className="hidden min-w-0 flex-1 truncate text-small text-ink-2 sm:block">
                {m.project || ''}
              </span>
              <span className="w-20 flex-none text-right text-caption text-ink-3 sm:w-28">
                {fmtDate(m.created_at)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
