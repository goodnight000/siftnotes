import React, { useEffect, useRef } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import {
  WelcomeStep,
  ApiKeySetupStep,
  PermissionsStep,
} from './steps';

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { currentStep, completeOnboarding } = useOnboarding();
  const [isMac, setIsMac] = React.useState(false);
  const [platformReady, setPlatformReady] = React.useState(false);
  const autoCompletedRef = useRef(false);

  useEffect(() => {
    const checkPlatform = async () => {
      try {
        const { platform } = await import('@tauri-apps/plugin-os');
        setIsMac(platform() === 'macos');
      } catch (e) {
        console.error('Failed to detect platform:', e);
        setIsMac(navigator.userAgent.includes('Mac'));
      } finally {
        setPlatformReady(true);
      }
    };
    checkPlatform();
  }, []);

  useEffect(() => {
    if (!platformReady || currentStep !== 3 || isMac || autoCompletedRef.current) return;

    autoCompletedRef.current = true;
    completeOnboarding()
      .then(onComplete)
      .catch((error) => {
        autoCompletedRef.current = false;
        console.error('Failed to complete onboarding:', error);
      });
  }, [completeOnboarding, currentStep, isMac, onComplete, platformReady]);

  return (
    <div className="onboarding-flow">
      {currentStep === 1 && <WelcomeStep />}
      {currentStep === 2 && <ApiKeySetupStep />}
      {currentStep === 3 && isMac && <PermissionsStep />}
    </div>
  );
}
