import { SoulmateAnalyticsPanel } from "../analytics-panel";
import { SoulmateWorkspaceShell } from "../workspace-shell";

export default function SoulmateAnalyticsPage() {
  return <SoulmateWorkspaceShell title="US Soulmate Analytics" description="Production landings, checkout progression, verified purchases and campaign traffic.">
    <SoulmateAnalyticsPanel />
  </SoulmateWorkspaceShell>;
}
