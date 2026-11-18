import type { Metadata } from 'next';
import BundlePricing from '../../../onboarding/bundle-pricing/page';
import { GoogleAdsExperienceProvider } from '@/components/us-main/Experience';
export const metadata: Metadata = { title: 'Choose Your Digital Reading | AstroRekha', robots: { index: false, follow: false } };
export default function USDiscoverPaywall() { return <GoogleAdsExperienceProvider><BundlePricing /></GoogleAdsExperienceProvider>; }
