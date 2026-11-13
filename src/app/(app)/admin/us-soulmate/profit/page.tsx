import AcquisitionView from "@/components/admin/AcquisitionView";
import { SoulmateProfitPanel } from "../profit-panel";
import { SoulmateWorkspaceShell } from "../workspace-shell";

export default function SoulmateProfitPage() {
  return <SoulmateWorkspaceShell title="US Soulmate Profit Sheet" description="An isolated view of Soulmate sales, costs and profitability.">
    <AcquisitionView funnel="us-soulmate"><SoulmateProfitPanel /></AcquisitionView>
  </SoulmateWorkspaceShell>;
}
