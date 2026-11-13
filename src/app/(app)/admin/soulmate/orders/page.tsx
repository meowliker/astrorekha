import AcquisitionView from "@/components/admin/AcquisitionView";
import { SoulmateOrdersPanel } from "../orders-panel";
import { SoulmateWorkspaceShell } from "../workspace-shell";

export default function SoulmateOrdersPage() {
  return <AcquisitionView standalone><SoulmateWorkspaceShell title="Soulmate Orders" description="Purchases, customer answers, generation, review and delivery status.">
    <SoulmateOrdersPanel />
  </SoulmateWorkspaceShell></AcquisitionView>;
}
