import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GoogleAdsExperienceProvider } from "@/components/onboarding/OnboardingExperience";
import { GOOGLE_ADS_STEPS, googleAdsStep } from "@/lib/google-ads-funnel";
import Intro from "../../../onboarding/page";
import Birthday from "../../../onboarding/birthday/page";
import BirthTime from "../../../onboarding/birth-time/page";
import Birthplace from "../../../onboarding/birthplace/page";
import Step5 from "../../../onboarding/step-5/page";
import Step6 from "../../../onboarding/step-6/page";
import Step7 from "../../../onboarding/step-7/page";
import Step8 from "../../../onboarding/step-8/page";
import Step9 from "../../../onboarding/step-9/page";
import Step10 from "../../../onboarding/step-10/page";
import Step11 from "../../../onboarding/step-11/page";
import Step12 from "../../../onboarding/step-12/page";
import Step13 from "../../../onboarding/step-13/page";
import Step14 from "../../../onboarding/step-14/page";
import Step15 from "../../../onboarding/step-15/page";

export const metadata: Metadata = { title: "Your Reading | AstroRekha" };
export const dynamicParams = false;
export function generateStaticParams() {
  return GOOGLE_ADS_STEPS.map(step => ({ step: step ? [step] : [] }));
}
const screens = {
  "": Intro, birthday: Birthday, "birth-time": BirthTime, birthplace: Birthplace,
  "step-5": Step5, "step-6": Step6, "step-7": Step7, "step-8": Step8, "step-9": Step9,
  "step-10": Step10, "step-11": Step11, "step-12": Step12, "step-13": Step13, "step-14": Step14, "step-15": Step15,
};
export default async function GoogleAdsOnboarding({ params }: { params: Promise<{ step?: string[] }> }) {
  const step = googleAdsStep((await params).step);
  if (step === null) notFound();
  const Screen = screens[step];
  return <GoogleAdsExperienceProvider><Screen /></GoogleAdsExperienceProvider>;
}
