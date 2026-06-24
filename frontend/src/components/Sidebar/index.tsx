'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, File, Folder, Pin, Settings, ChevronLeftCircle, ChevronRightCircle, Calendar, Home, Trash2, Plus, Pencil, SearchIcon, X, Upload, LayoutGrid } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useSidebar } from './SidebarProvider';
import type { CurrentMeeting } from '@/components/Sidebar/SidebarProvider';
import { ConfirmationModal } from '../ConfirmationModel/confirmation-modal';
import { ModelConfig } from '@/components/ModelSettingsModal';
import { SettingTabs } from '../SettingTabs';
import { TranscriptModelProps } from '@/components/TranscriptSettings';
import Analytics from '@/lib/analytics';
import { invoke } from '@tauri-apps/api/core';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useImportDialog } from '@/contexts/ImportDialogContext';
import { useConfig } from '@/contexts/ConfigContext';
import { getDefaultSummaryModel, getDefaultTranscriptionModel } from '@/lib/settings-provider-options';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { VisuallyHidden } from "@/components/ui/visually-hidden"

import { MessageToast } from '../MessageToast';
import Logo from '../Logo';
import { ComplianceNotification } from '../ComplianceNotification';
import { Input } from '../ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '../ui/input-group';

interface SidebarItem {
  id: string;
  title: string;
  type: 'folder' | 'file';
  meeting?: CurrentMeeting;
  children?: SidebarItem[];
}

function normaliseSidebarMeeting(meeting: CurrentMeeting): CurrentMeeting {
  return {
    ...meeting,
    project: meeting.project ?? null,
    tags: Array.isArray(meeting.tags) ? meeting.tags : [],
    is_pinned: Boolean(meeting.is_pinned),
    is_archived: Boolean(meeting.is_archived),
  };
}

function meetingToItem(meeting: CurrentMeeting): SidebarItem {
  return {
    id: meeting.id,
    title: meeting.title,
    type: 'file',
    meeting: normaliseSidebarMeeting(meeting),
  };
}

function buildMeetingSidebarItems(meetings: CurrentMeeting[], showArchived: boolean): SidebarItem[] {
  const visibleMeetings = meetings
    .map(normaliseSidebarMeeting)
    .filter(meeting => showArchived || !meeting.is_archived);
  const pinned = visibleMeetings.filter(meeting => meeting.is_pinned);
  const regular = visibleMeetings.filter(meeting => !meeting.is_pinned);
  const projectGroups = new Map<string, CurrentMeeting[]>();

  for (const meeting of regular) {
    const projectName = meeting.project?.trim() || 'Unfiled';
    projectGroups.set(projectName, [...(projectGroups.get(projectName) || []), meeting]);
  }

  const children: SidebarItem[] = [];
  if (pinned.length > 0) {
    children.push({
      id: 'pinned-meetings',
      title: 'Pinned',
      type: 'folder',
      children: pinned.map(meetingToItem),
    });
  }

  for (const [projectName, projectMeetings] of Array.from(projectGroups.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    children.push({
      id: `project-${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'unfiled'}`,
      title: projectName,
      type: 'folder',
      children: projectMeetings.map(meetingToItem),
    });
  }

  return [{
    id: 'meetings',
    title: 'Meeting Notes',
    type: 'folder',
    children,
  }];
}

function filterItems(items: SidebarItem[], query: string, matchedMeetingIds: Set<string>): SidebarItem[] {
  const lowered = query.trim().toLowerCase();
  if (!lowered) return items;

  return items
    .map(item => {
      if (item.type === 'folder') {
        const children = filterItems(item.children || [], query, matchedMeetingIds);
        const titleMatches = item.title.toLowerCase().includes(lowered);
        return titleMatches || children.length > 0 ? { ...item, children } : null;
      }

      const titleMatches = item.title.toLowerCase().includes(lowered);
      const tagMatches = item.meeting?.tags?.some(tag => tag.toLowerCase().includes(lowered)) ?? false;
      return matchedMeetingIds.has(item.id) || titleMatches || tagMatches ? item : null;
    })
    .filter((item): item is SidebarItem => item !== null);
}

const Sidebar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const {
    currentMeeting,
    setCurrentMeeting,
    isCollapsed,
    toggleCollapse,
    searchTranscripts,
    searchResults,
    isSearching,
    meetings,
    setMeetings,
    serverAddress
  } = useSidebar();

  const { openImportDialog } = useImportDialog();
  const { betaFeatures } = useConfig();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['meetings']));
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showArchived, setShowArchived] = useState(false);
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    provider: 'openrouter',
    model: getDefaultSummaryModel('openrouter'),
    whisperModel: '',
    apiKey: null,
    ollamaEndpoint: null
  });
  const [transcriptModelConfig, setTranscriptModelConfig] = useState<TranscriptModelProps>({
    provider: 'elevenLabs',
    model: getDefaultTranscriptionModel('elevenLabs'),
  });
  const [settingsSaveSuccess, setSettingsSaveSuccess] = useState<boolean | null>(null);

  // State for edit modal
  const [editModalState, setEditModalState] = useState<{ isOpen: boolean; meetingId: string | null; currentTitle: string }>({
    isOpen: false,
    meetingId: null,
    currentTitle: ''
  });
  const [editingTitle, setEditingTitle] = useState<string>('');

  // Ensure 'meetings' folder is always expanded
  useEffect(() => {
    if (!expandedFolders.has('meetings')) {
      const newExpanded = new Set(expandedFolders);
      newExpanded.add('meetings');
      setExpandedFolders(newExpanded);
    }
  }, [expandedFolders]);

  // useEffect(() => {
  //   if (settingsSaveSuccess !== null) {
  //     const timer = setTimeout(() => {
  //       setSettingsSaveSuccess(null);
  //     }, 3000);
  //   }
  // }, [settingsSaveSuccess]);


  const [deleteModalState, setDeleteModalState] = useState<{ isOpen: boolean; itemId: string | null }>({ isOpen: false, itemId: null });

  useEffect(() => {
    // Note: Don't set hardcoded defaults - let DB be the source of truth
    const fetchModelConfig = async () => {
      // Only make API call if serverAddress is loaded
      if (!serverAddress) {
        console.log('Waiting for server address to load before fetching model config');
        return;
      }

      try {
        const data = await invoke('api_get_model_config') as any;
        if (data && data.provider !== null) {
          // Fetch API key if not included and provider requires it
          if (data.provider !== 'ollama' && !data.apiKey) {
            try {
              const apiKeyData = await invoke('api_get_api_key', {
                provider: data.provider
              }) as string;
              data.apiKey = apiKeyData;
            } catch (err) {
              console.error('Failed to fetch API key:', err);
            }
          }
          setModelConfig(data);
        }
      } catch (error) {
        console.error('Failed to fetch model config:', error);
      }
    };

    fetchModelConfig();
  }, [serverAddress]);


  useEffect(() => {
    // Note: Don't set hardcoded defaults - let DB be the source of truth
    const fetchTranscriptSettings = async () => {
      // Only make API call if serverAddress is loaded
      if (!serverAddress) {
        console.log('Waiting for server address to load before fetching transcript settings');
        return;
      }

      try {
        const data = await invoke('api_get_transcript_config') as any;
        if (data && data.provider !== null) {
          setTranscriptModelConfig(data);
        }
      } catch (error) {
        console.error('Failed to fetch transcript settings:', error);
      }
    };
    fetchTranscriptSettings();
  }, [serverAddress]);

  // Listen for model config updates from other components
  useEffect(() => {
    const setupListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<ModelConfig>('model-config-updated', (event) => {
        console.log('Sidebar received model-config-updated event:', event.payload);
        setModelConfig(event.payload);
      });

      return unlisten;
    };

    let cleanup: (() => void) | undefined;
    setupListener().then(fn => cleanup = fn);

    return () => {
      cleanup?.();
    };
  }, []);



  // Handle model config save
  const handleSaveModelConfig = async (config: ModelConfig) => {
    try {
      await invoke('api_save_model_config', {
        provider: config.provider,
        model: config.model,
        whisperModel: config.whisperModel,
        apiKey: config.apiKey,
        ollamaEndpoint: config.ollamaEndpoint,
      });

      setModelConfig(config);
      console.log('Model config saved successfully');
      setSettingsSaveSuccess(true);

      // Emit event to sync other components
      const { emit } = await import('@tauri-apps/api/event');
      await emit('model-config-updated', config);

      // Track settings change
      await Analytics.trackSettingsChanged('model_config', `${config.provider}_${config.model}`);
    } catch (error) {
      console.error('Error saving model config:', error);
      setSettingsSaveSuccess(false);
    }
  };

  const handleSaveTranscriptConfig = async (updatedConfig?: TranscriptModelProps) => {
    try {
      const configToSave = updatedConfig || transcriptModelConfig;
      const payload = {
        provider: configToSave.provider,
        model: configToSave.model,
        apiKey: configToSave.apiKey ?? null
      };
      console.log('Saving transcript config with payload:', payload);

      await invoke('api_save_transcript_config', {
        provider: payload.provider,
        model: payload.model,
        apiKey: payload.apiKey,
      });


      setSettingsSaveSuccess(true);

      // Track settings change
      const transcriptConfigToSave = updatedConfig || transcriptModelConfig;
      await Analytics.trackSettingsChanged('transcript_config', `${transcriptConfigToSave.provider}_${transcriptConfigToSave.model}`);
    } catch (error) {
      console.error('Failed to save transcript config:', error);
      setSettingsSaveSuccess(false);
    }
  };

  // Handle search input changes
  const handleSearchChange = useCallback(async (value: string) => {
    setSearchQuery(value);

    // If search query is empty, just return to normal view
    if (!value.trim()) return;

    // Search through transcripts
    await searchTranscripts(value);

    // Make sure the meetings folder is expanded when searching
    if (!expandedFolders.has('meetings')) {
      const newExpanded = new Set(expandedFolders);
      newExpanded.add('meetings');
      setExpandedFolders(newExpanded);
    }
  }, [expandedFolders, searchTranscripts]);

  const groupedSidebarItems = useMemo(
    () => buildMeetingSidebarItems(meetings, showArchived),
    [meetings, showArchived]
  );

  useEffect(() => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      let changed = false;

      const ensure = (id: string) => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      };

      ensure('meetings');
      groupedSidebarItems[0]?.children
        ?.filter(item => item.type === 'folder')
        .forEach(item => ensure(item.id));

      return changed ? next : prev;
    });
  }, [groupedSidebarItems]);

  // Combine search results with sidebar items
  const filteredSidebarItems = useMemo(() => {
    const matchedMeetingIds = new Set(searchResults.map(result => result.id));
    return filterItems(groupedSidebarItems, searchQuery, matchedMeetingIds);
  }, [groupedSidebarItems, searchQuery, searchResults]);


  const handleDelete = async (itemId: string) => {
    console.log('Deleting item:', itemId);
    const payload = {
      meetingId: itemId
    };

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('api_delete_meeting', {
        meetingId: itemId,
      });
      console.log('Meeting deleted successfully');
      const updatedMeetings = meetings.filter((m: CurrentMeeting) => m.id !== itemId);
      setMeetings(updatedMeetings);

      // Track meeting deletion
      Analytics.trackMeetingDeleted(itemId);

      // Show success toast
      toast.success("Meeting deleted successfully", {
        description: "All associated data has been removed"
      });

      // If deleting the active meeting, navigate to home
      if (currentMeeting?.id === itemId) {
        setCurrentMeeting({ id: 'intro-call', title: '+ New Call' });
        router.push('/');
      }
    } catch (error) {
      console.error('Failed to delete meeting:', error);
      toast.error("Failed to delete meeting", {
        description: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const handleDeleteConfirm = () => {
    if (deleteModalState.itemId) {
      handleDelete(deleteModalState.itemId);
    }
    setDeleteModalState({ isOpen: false, itemId: null });
  };

  const handleSidebarOrganizationUpdate = async (
    meeting: CurrentMeeting,
    patch: Partial<Pick<CurrentMeeting, 'is_pinned' | 'is_archived'>>
  ) => {
    const nextMeeting = normaliseSidebarMeeting({ ...meeting, ...patch });

    try {
      const updated = await invoke<CurrentMeeting>('api_update_meeting_organization', {
        meetingId: nextMeeting.id,
        project: nextMeeting.project ?? null,
        tags: nextMeeting.tags ?? [],
        isPinned: Boolean(nextMeeting.is_pinned),
        isArchived: Boolean(nextMeeting.is_archived),
      });

      const normalised = normaliseSidebarMeeting(updated);
      setMeetings(meetings.map((m: CurrentMeeting) =>
        m.id === normalised.id ? { ...m, ...normalised } : m
      ));

      if (currentMeeting?.id === normalised.id) {
        setCurrentMeeting(normalised);
      }
    } catch (error) {
      console.error('Failed to update meeting organization:', error);
      toast.error('Failed to update meeting organization', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Handle modal editing of meeting names
  const handleEditStart = (meetingId: string, currentTitle: string) => {
    setEditModalState({
      isOpen: true,
      meetingId: meetingId,
      currentTitle: currentTitle
    });
    setEditingTitle(currentTitle);
  };

  const handleEditConfirm = async () => {
    const newTitle = editingTitle.trim();
    const meetingId = editModalState.meetingId;

    if (!meetingId) return;

    // Prevent empty titles
    if (!newTitle) {
      toast.error("Meeting title cannot be empty");
      return;
    }

    try {
      await invoke('api_save_meeting_title', {
        meetingId: meetingId,
        title: newTitle,
      });

      // Update local state
      const updatedMeetings = meetings.map((m: CurrentMeeting) =>
        m.id === meetingId ? { ...m, title: newTitle } : m
      );
      setMeetings(updatedMeetings);

      // Update current meeting if it's the one being edited
      if (currentMeeting?.id === meetingId) {
        setCurrentMeeting({ ...currentMeeting, id: meetingId, title: newTitle });
      }

      // Track the edit
      Analytics.trackButtonClick('edit_meeting_title', 'sidebar');

      toast.success("Meeting title updated successfully");

      // Close modal and reset state
      setEditModalState({ isOpen: false, meetingId: null, currentTitle: '' });
      setEditingTitle('');
    } catch (error) {
      console.error('Failed to update meeting title:', error);
      toast.error("Failed to update meeting title", {
        description: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const handleEditCancel = () => {
    setEditModalState({ isOpen: false, meetingId: null, currentTitle: '' });
    setEditingTitle('');
  };

  const toggleFolder = (folderId: string) => {
    // Normal toggle behavior for all folders
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  // Expose setShowModelSettings to window for Rust tray to call
  useEffect(() => {
    (window as any).openSettings = () => {
      setShowModelSettings(true);
    };

    // Cleanup on unmount
    return () => {
      delete (window as any).openSettings;
    };
  }, []);

  const renderCollapsedIcons = () => {
    if (!isCollapsed) return null;

    const isHomePage = pathname === '/';
    const isNotesPage = pathname?.startsWith('/notes') ?? false;
    const isSettingsPage = pathname === '/settings';

    return (
      <TooltipProvider>
        <div className="flex flex-col items-center space-y-4 mt-4">
          <Logo isCollapsed={isCollapsed} />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push('/')}
                className={`p-2 rounded-lg transition-colors duration-150 ${isHomePage ? 'bg-wash text-clay' : 'text-ink-3 hover:bg-sunken'
                  }`}
              >
                <Home className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Home</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push('/notes')}
                className={`p-2 rounded-lg transition-colors duration-150 ${isNotesPage ? 'bg-wash text-clay' : 'text-ink-3 hover:bg-sunken'
                  }`}
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>All notes</p>
            </TooltipContent>
          </Tooltip>

          {betaFeatures.importAndRetranscribe && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => openImportDialog()}
                  className="p-2 rounded-lg transition-colors duration-150 text-ink-3 hover:bg-sunken"
                >
                  <Upload className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Import Audio</p>
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push('/settings')}
                className={`p-2 rounded-lg transition-colors duration-150 ${isSettingsPage ? 'bg-wash text-clay' : 'text-ink-3 hover:bg-sunken'
                  }`}
              >
                <Settings className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>

        </div>
      </TooltipProvider>
    );
  };

  // Find matching transcript snippet for a meeting item
  const findMatchingSnippet = (itemId: string) => {
    if (!searchQuery.trim() || !searchResults.length) return null;
    return searchResults.find(result => result.id === itemId);
  };

  const renderItem = (item: SidebarItem, depth = 0) => {
    const isExpanded = expandedFolders.has(item.id);
    const paddingLeft = `${depth * 12 + 12}px`;
    const isActive = item.type === 'file' && currentMeeting?.id === item.id;
    const isMeetingItem = item.type === 'file' && !item.id.startsWith('intro-call');
    const itemMeeting = item.meeting;

    // Check if this item has a matching transcript snippet
    const matchingResult = isMeetingItem ? findMatchingSnippet(item.id) : null;
    const hasTranscriptMatch = !!matchingResult;

    if (isCollapsed) return null;

    return (
      <div key={item.id}>
        <div
          className={`flex items-center transition-all duration-150 group ${item.type === 'folder' && depth === 0
            ? 'p-3 text-lg font-semibold h-10 mx-3 mt-3 rounded-lg'
            : `px-3 py-2 my-0.5 rounded-md text-sm ${isActive ? 'bg-wash text-clay font-medium' :
              hasTranscriptMatch ? 'bg-wash' : 'hover:bg-sunken'
            } cursor-pointer`
            }`}
          style={item.type === 'folder' && depth === 0 ? {} : { paddingLeft }}
          onClick={() => {
            if (item.type === 'folder') {
              toggleFolder(item.id);
            } else {
              setCurrentMeeting(item.meeting ?? { id: item.id, title: item.title });
              const basePath = item.id.startsWith('intro-call') ? '/' :
                item.id.includes('-') ? `/meeting-details?id=${item.id}` : `/notes/${item.id}`;
              router.push(basePath);
            }
          }}
        >
          {item.type === 'folder' ? (
            <>
              {item.id === 'meetings' ? (
                <Calendar className="w-4 h-4 mr-2" />
              ) : (
                <Folder className="w-4 h-4 mr-2" />
              )}
              <span className={depth === 0 ? "" : "font-medium"}>{item.title}</span>
              <div className="ml-auto">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-ink-3" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-ink-3" />
                )}
              </div>
              {searchQuery && item.id === 'meetings' && isSearching && (
                <span className="ml-2 text-xs text-clay animate-pulse">Searching...</span>
              )}
            </>
          ) : (
            <div className="flex flex-col w-full">
              <div className="flex items-center w-full">
                {isMeetingItem ? (
                  <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full mr-2 bg-sunken">
                    <File className="w-3.5 h-3.5 text-ink-3" />
                  </div>
                ) : (
                  <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full mr-2 bg-wash">
                    <Plus className="w-3.5 h-3.5 text-clay" />
                  </div>
                )}
                <span className="flex-1 break-words">{item.title}</span>
                {isMeetingItem && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    {itemMeeting && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleSidebarOrganizationUpdate(itemMeeting, {
                              is_pinned: !itemMeeting.is_pinned,
                            });
                          }}
                          className="hover:text-clay p-1 rounded-md hover:bg-wash flex-shrink-0"
                          aria-label={itemMeeting.is_pinned ? 'Unpin meeting' : 'Pin meeting'}
                          title={itemMeeting.is_pinned ? 'Unpin meeting' : 'Pin meeting'}
                        >
                          <Pin className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleSidebarOrganizationUpdate(itemMeeting, {
                              is_archived: !itemMeeting.is_archived,
                            });
                          }}
                          className="hover:text-amber-600 p-1 rounded-md hover:bg-amber-50 flex-shrink-0"
                          aria-label={itemMeeting.is_archived ? 'Restore meeting' : 'Archive meeting'}
                          title={itemMeeting.is_archived ? 'Restore meeting' : 'Archive meeting'}
                        >
                          {itemMeeting.is_archived ? (
                            <ArchiveRestore className="w-4 h-4" />
                          ) : (
                            <Archive className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditStart(item.id, item.title);
                      }}
                      className="hover:text-clay p-1 rounded-md hover:bg-wash flex-shrink-0"
                      aria-label="Edit meeting title"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteModalState({ isOpen: true, itemId: item.id });
                      }}
                      className="hover:text-red-600 p-1 rounded-md hover:bg-red-50 flex-shrink-0"
                      aria-label="Delete meeting"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Show transcript match snippet if available */}
              {hasTranscriptMatch && (
                <div className="mt-1 ml-8 text-xs text-ink-3 bg-wash p-1.5 rounded border border-border line-clamp-2">
                  <span className="font-medium text-clay">Match:</span> {matchingResult.matchContext}
                </div>
              )}
            </div>
          )}
        </div>
        {item.type === 'folder' && isExpanded && item.children && (
          <div className="ml-1">
            {item.children.map(child => renderItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed top-0 left-0 h-screen z-40">
      {/* Floating collapse button */}
      <button
        onClick={toggleCollapse}
        className="absolute -right-6 top-20 z-50 p-1 bg-paper hover:bg-sunken rounded-full shadow-lg border"
        style={{ transform: 'translateX(50%)' }}
      >
        {isCollapsed ? (
          <ChevronRightCircle className="w-6 h-6" />
        ) : (
          <ChevronLeftCircle className="w-6 h-6" />
        )}
      </button>

      <div
        className={`h-screen bg-paper border-r shadow-sm flex flex-col overflow-x-hidden transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-64'
          }`}
      >
        {/*  Header with traffic light spacing */}
        <div className="flex-shrink-0 h-22 flex items-center">

          {/* Title container */}



          <div className="flex-1">
            {!isCollapsed && (
              <div className="p-3">
                {/* <span className="text-lg text-center border rounded-full bg-blue-50 border-white font-semibold text-gray-700 mb-2 block items-center">
                  <span>SiftNotes</span>
                </span> */}
                <Logo isCollapsed={isCollapsed} />

                <div className="relative mb-1">
                  <InputGroup >
                    <InputGroupInput placeholder='Search meeting content...' value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                    />
                    <InputGroupAddon>
                      <SearchIcon />
                    </InputGroupAddon>
                    {searchQuery &&
                      <InputGroupAddon align={'inline-end'}>
                        <InputGroupButton
                          onClick={() => handleSearchChange('')}
                        >
                          <X />
                        </InputGroupButton>
                      </InputGroupAddon>
                    }
                  </InputGroup>
                </div>
                <button
                  onClick={() => setShowArchived(value => !value)}
                  className={`w-full flex items-center justify-center gap-2 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${showArchived ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-sunken text-ink-2 hover:bg-surface'
                    }`}
                >
                  {showArchived ? (
                    <ArchiveRestore className="w-3.5 h-3.5" />
                  ) : (
                    <Archive className="w-3.5 h-3.5" />
                  )}
                  <span>{showArchived ? 'Hide archived' : 'Show archived'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main content - scrollable area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Fixed navigation items */}
          <div className="flex-shrink-0">
            {!isCollapsed && (
              <div
                onClick={() => router.push('/')}
                className="p-3  text-lg font-semibold items-center hover:bg-sunken h-10   flex mx-3 mt-3 rounded-lg cursor-pointer"
              >
                <Home className="w-4 h-4 mr-2" />
                <span>Home</span>
              </div>
            )}
          </div>

          {/* Content area */}
          <div className="flex-1 flex flex-col min-h-0">
            {renderCollapsedIcons()}
            {/* Meeting Notes folder header - fixed */}
            {!isCollapsed && (
              <div className="flex-shrink-0">
                {filteredSidebarItems.filter(item => item.type === 'folder').map(item => (
                  <div key={item.id}>
                    <div
                      className="flex items-center transition-all duration-150 p-3 text-lg font-semibold h-10 mx-3 mt-3 rounded-lg"
                    >
                      <span className="text-ink-2">{item.title}</span>
                      {searchQuery && item.id === 'meetings' && isSearching && (
                        <span className="ml-2 text-xs text-clay animate-pulse">Searching...</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Scrollable meeting items */}
            {!isCollapsed && (
              <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                {filteredSidebarItems
                  .filter(item => item.type === 'folder' && expandedFolders.has(item.id) && item.children)
                  .map(item => (
                    <div key={`${item.id}-children`} className="mx-3">
                      {item.children!.map(child => renderItem(child, 1))}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {!isCollapsed && (

          <div className="flex-shrink-0 p-2 border-t border-border">
            {betaFeatures.importAndRetranscribe && (
              <button
                onClick={() => openImportDialog()}
                className="w-full flex items-center justify-center px-3 py-2 mt-1 text-sm font-medium text-clay bg-wash hover:bg-sunken rounded-lg transition-colors shadow-sm"
              >
                <Upload className="w-4 h-4 mr-2" />
                <span>Import Audio</span>
              </button>
            )}

            <button
              onClick={() => router.push('/settings')}
              className="w-full flex items-center justify-center px-3 py-1.5 mt-1 mb-1 text-sm font-medium text-ink-2 bg-surface hover:bg-sunken rounded-lg transition-colors shadow-sm"
            >
              <Settings className="w-4 h-4 mr-2" />
              <span>Settings</span>
            </button>
            <div className="w-full flex items-center justify-center px-3 py-1 text-xs text-ink-3">
              v0.4.0
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Delete */}
      <ConfirmationModal
        isOpen={deleteModalState.isOpen}
        text="Are you sure you want to delete this meeting? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteModalState({ isOpen: false, itemId: null })}
      />

      {/* Edit Meeting Title Modal */}
      <Dialog open={editModalState.isOpen} onOpenChange={(open) => {
        if (!open) handleEditCancel();
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <VisuallyHidden>
            <DialogTitle>Edit Meeting Title</DialogTitle>
          </VisuallyHidden>
          <div className="py-4">
            <h3 className="text-lg font-semibold mb-4">Edit Meeting Title</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="meeting-title" className="block text-sm font-medium text-ink-2 mb-2">
                  Meeting Title
                </label>
                <input
                  id="meeting-title"
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleEditConfirm();
                    } else if (e.key === 'Escape') {
                      handleEditCancel();
                    }
                  }}
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-clay focus:border-transparent"
                  placeholder="Enter meeting title"
                  autoFocus
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={handleEditCancel}
              className="px-4 py-2 text-sm font-medium text-ink-2 bg-sunken hover:bg-surface rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleEditConfirm}
              className="px-4 py-2 text-sm font-medium text-white bg-clay hover:opacity-90 rounded-md transition-colors"
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Sidebar;
