export default function GoogleProfitSavedNote({at}: {at?: string}) {
  if (!at) return null;
  return <span className="mt-1 block text-xs font-normal text-white/50" title="Google is updating. All figures in this row are from the same last verified snapshot; totals include these saved figures.">
    Saved · {new Date(at).toLocaleString('en-IN', {timeZone:'Asia/Kolkata', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})} IST
  </span>;
}
