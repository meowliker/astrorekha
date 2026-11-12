'use client';
// Presentation remains the normal funnel. US URLs and storage are isolated at the copied screens.
export { useRouter as useOnboardingRouter } from 'next/navigation';
import { ASTROREKHA_ASSETS } from '@/lib/assets';
export const useGoogleAdsExperience = () => false;
export const useOnboardingAssets = () => ASTROREKHA_ASSETS;
