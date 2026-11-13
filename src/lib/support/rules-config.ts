export const REPLY_TOPICS = {
  refunds: "Refund discussion or offers",
  failedPayments: "Failed payment attempts",
  processing: "Reports described as processing",
  generationMethods: "Unrequested AI or entertainment explanations",
  palmReplacement: "Offers to replace a palm",
} as const;
export type ReplyTopic = keyof typeof REPLY_TOPICS;
export type RuleSettings = {
  specificLabel: string;
  loginLabel: string;
  completedLabel: string;
  closing: string;
  signature: string;
  blockedTopics: ReplyTopic[];
};
export const DEFAULT_RULE_SETTINGS: RuleSettings = {
  specificLabel: "For Santushti",
  loginLabel: "For Santushti/Login",
  completedLabel: "Completed",
  closing:
    "Please feel free to reach out to us if you have any questions or concerns.",
  signature: "Regards,\nTeam AstroRekha",
  blockedTopics: Object.keys(REPLY_TOPICS) as ReplyTopic[],
};
export type RuleVersion = {
  version: number;
  content: string;
  settings: RuleSettings;
  change_note: string;
  published_at: string;
  published_by: string;
};
export const SUPPORT_SAFEGUARDS = [
  "Only team.astrorekha@gmail.com is supported. Sending remains a human action in Gmail; the support API cannot send mail or issue refunds.",
  "Email changes, extra questions, additional access and payment mapping require an authorized approver. An explicitly delegated owner API token can approve repairs and manage workspace rules; other API tokens cannot. Check actorAuthority returned with the live rules.",
  "Ready replies require verified, completed, unlocked reports. Quoted customer history and report PDF attachments are excluded.",
  "Instructions guide Codex; publishing text does not add app capabilities or override these permissions. Unsupported cases remain escalations.",
];
