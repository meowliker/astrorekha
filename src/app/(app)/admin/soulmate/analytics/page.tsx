import AcquisitionView from "@/components/admin/AcquisitionView";
import { SoulmateAnalyticsPanel } from "../analytics-panel";
import { SoulmateWorkspaceShell } from "../workspace-shell";

export default function SoulmateAnalyticsPage() {
  return <SoulmateWorkspaceShell title="Soulmate Analytics" description="Production landings, checkout progression, verified purchases and campaign traffic.">
    <AcquisitionView funnel="soulmate"><SoulmateAnalyticsPanel /></AcquisitionView>
  </SoulmateWorkspaceShell>;
}
