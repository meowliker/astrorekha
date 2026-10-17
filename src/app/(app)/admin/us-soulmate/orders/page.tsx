import { SoulmateOrdersPanel } from "../orders-panel";
import { SoulmateWorkspaceShell } from "../workspace-shell";

export default function SoulmateOrdersPage() {
  return <SoulmateWorkspaceShell title="US Soulmate Orders" description="Purchases, customer answers, generation, review and delivery status.">
    <SoulmateOrdersPanel />
  </SoulmateWorkspaceShell>;
}
