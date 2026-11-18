import type { AcquisitionFunnel } from "@/lib/admin-acquisition";
import { googleProfitRegion } from "@/lib/google-profit-region";

export default function GoogleProfitReportingDay({ funnel, multipleAccounts=false }: { funnel: AcquisitionFunnel; multipleAccounts?: boolean }) {
  const account = googleProfitRegion(funnel);
  return <div className="flex flex-col gap-1 text-xs text-white/50">
    <span>Reporting day · {multipleAccounts ? "Account calendar days" : account.label}</span>
    <span className="rounded-xl border border-white/10 bg-[#1A2235] px-4 py-3 text-sm text-white">
      Midnight–11:59 PM
    </span>
  </div>;
}
