import type { Metadata } from 'next';
import Welcome from '../page';
import { GoogleAdsExperienceProvider } from '@/components/us-main/Experience';
export const metadata: Metadata = { title: 'AI Palm Reading & Western Birth Chart | AstroRekha', description: 'Explore AI-generated digital readings for personal reflection. Choose a one-time USD bundle with secure Stripe checkout.' };
export default function USDiscover() { return <GoogleAdsExperienceProvider><Welcome /></GoogleAdsExperienceProvider>; }
