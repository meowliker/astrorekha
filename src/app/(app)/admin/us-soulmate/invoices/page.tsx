import { SoulmateInvoicesPanel } from "../invoices-panel";
import { SoulmateWorkspaceShell } from "../workspace-shell";

export default function SoulmateInvoicesPage() {
  return <SoulmateWorkspaceShell title="US Soulmate Invoices" description="Order confirmations and their saved invoice PDFs.">
    <SoulmateInvoicesPanel />
  </SoulmateWorkspaceShell>;
}
