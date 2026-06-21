import React from 'react';
import { FileText, KeyRound, Mic2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OnboardingContainer } from '../OnboardingContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';

export function WelcomeStep() {
  const { goNext } = useOnboarding();

  const features = [
    {
      icon: KeyRound,
      title: 'Bring your own summary API key',
    },
    {
      icon: Mic2,
      title: 'Bring your own transcription API key',
    },
    {
      icon: FileText,
      title: 'Export meeting notes as local Markdown',
    },
  ];

  return (
    <OnboardingContainer
      title="Welcome to SiftNotes"
      description="Record meetings with your own transcription and summary providers."
      step={1}
      hideProgress={true}
    >
      <div className="flex flex-col items-center space-y-10">
        <div className="w-16 h-px bg-border" />

        <div className="w-full max-w-md bg-surface rounded-lg border border-border shadow-sm p-6 space-y-4">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div key={index} className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-5 h-5 rounded-full bg-sunken flex items-center justify-center">
                    <Icon className="w-3 h-3 text-ink-2" />
                  </div>
                </div>
                <p className="text-sm text-ink-2 leading-relaxed">{feature.title}</p>
              </div>
            );
          })}
        </div>

        <div className="w-full max-w-xs space-y-3">
          <Button
            onClick={goNext}
            className="w-full h-11 bg-primary text-primary-foreground hover:opacity-90"
          >
            Get Started
          </Button>
          <p className="text-xs text-center text-ink-3">Takes less than 3 minutes</p>
        </div>
      </div>
    </OnboardingContainer>
  );
}
