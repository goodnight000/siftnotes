'use client';

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { ArrowLeft, Settings2, Mic, Database as DatabaseIcon, SparkleIcon, FlaskConical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { TranscriptSettings } from '@/components/TranscriptSettings';
import { RecordingSettings } from '@/components/RecordingSettings';
import { PreferenceSettings } from '@/components/PreferenceSettings';
import { SummaryModelSettings } from '@/components/SummaryModelSettings';
import { BetaSettings } from '@/components/BetaSettings';
import { useConfig } from '@/contexts/ConfigContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { resolveApiFirstTranscriptionConfig } from '@/lib/settings-provider-options';

// Tabs configuration (constant)
const TABS = [
  { value: 'general', label: 'General', icon: Settings2 },
  { value: 'recording', label: 'Recordings', icon: Mic },
  { value: 'Transcriptionmodels', label: 'Transcription API', icon: DatabaseIcon },
  { value: 'summaryModels', label: 'Summary API', icon: SparkleIcon },
  { value: 'beta', label: 'Beta', icon: FlaskConical }
] as const;

export default function SettingsPage() {
  const router = useRouter();
  const { transcriptModelConfig, setTranscriptModelConfig } = useConfig();

  // Animation state for tabs
  const [activeTab, setActiveTab] = useState('general');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 });

  // Load saved transcript configuration on mount
  useEffect(() => {
    const loadTranscriptConfig = async () => {
      try {
        const config = await invoke('api_get_transcript_config') as any;
        if (config) {
          console.log('Loaded saved transcript config:', config);
          setTranscriptModelConfig(resolveApiFirstTranscriptionConfig(config));
        }
      } catch (error) {
        console.error('Failed to load transcript config:', error);
      }
    };
    loadTranscriptConfig();
  }, [setTranscriptModelConfig]);

  // Update underline position when active tab changes
  useLayoutEffect(() => {
    const activeIndex = TABS.findIndex(tab => tab.value === activeTab);
    const activeTabElement = tabRefs.current[activeIndex];

    if (activeTabElement) {
      const { offsetLeft, offsetWidth } = activeTabElement;
      setUnderlineStyle({ left: offsetLeft, width: offsetWidth });
    }
  }, [activeTab]);

  return (
    <div className="h-screen bg-paper flex flex-col">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 bg-paper border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-ink-2 hover:text-ink transition-colors shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold truncate">Settings</h1>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-4 pt-6 sm:p-8 sm:pt-6 min-w-0">
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-transparent relative rounded-none border-b border-border p-0 h-auto w-full max-w-full justify-start overflow-x-auto overflow-y-hidden">
              {TABS.map((tab, index) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    ref={el => { tabRefs.current[index] = el }}
                    className="flex shrink-0 items-center gap-2 px-4 py-4 sm:px-6 bg-transparent rounded-none border-0 data-[state=active]:bg-transparent data-[state=active]:text-clay data-[state=active]:shadow-none text-ink-2 hover:text-ink relative z-10"
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {tab.label}
                  </TabsTrigger>
                );
              })}

              <motion.div
                className="absolute bottom-0 z-20 h-0.5 bg-clay"
                layoutId="underline"
                style={{ left: underlineStyle.left, width: underlineStyle.width }}
                transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              />
            </TabsList>

            <TabsContent value="general">
              <PreferenceSettings />
            </TabsContent>
            <TabsContent value="recording">
              <RecordingSettings />
            </TabsContent>
            <TabsContent value="Transcriptionmodels">
              <TranscriptSettings
                transcriptModelConfig={transcriptModelConfig}
                setTranscriptModelConfig={setTranscriptModelConfig}
              />
            </TabsContent>
            <TabsContent value="summaryModels">
              <SummaryModelSettings />
            </TabsContent>
            <TabsContent value="beta" className="mt-6">
              <BetaSettings />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
