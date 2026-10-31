/** Display structure returned by the palm reading generator. */
export interface PalmReadingData {
  cosmicInsight?: string;
  tabs?: {
    ageTimeline?: { title?: string; stages?: Array<{ range: string; label: string; description: string }>; milestones?: Record<string, string> };
    wealth?: { title?: string; financialPotential?: { level?: string; details?: string }; businessAptitude?: string; wealthTimeline?: string; assetAccumulation?: string; moneyManagementStyle?: string };
    mounts?: { title?: string; mounts?: Array<{ name: string; description: string }>; specialMarkings?: Record<string, string> };
    love?: { title?: string; partnerCharacteristics?: string; marriageTiming?: string; partnersFinancialStatus?: string; relationshipChallenges?: string; familyPredictions?: string; pregnancyWindow?: { title?: string; description?: string } | string };
  };
}
