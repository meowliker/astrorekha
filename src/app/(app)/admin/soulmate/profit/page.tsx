import AcquisitionView from "@/components/admin/AcquisitionView";
import { SoulmateProfitPanel } from "../profit-panel";
import { SoulmateWorkspaceShell } from "../workspace-shell";

export default function SoulmateProfitPage() {
  return <SoulmateWorkspaceShell title="Soulmate Profit Sheet" description="An isolated view of Soulmate sales, costs and profitability.">
    <AcquisitionView funnel="soulmate"><SoulmateProfitPanel /></AcquisitionView>
  </SoulmateWorkspaceShell>;
}
