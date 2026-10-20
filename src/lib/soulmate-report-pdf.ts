import { jsPDF } from "jspdf";
import { monthLabel, descriptionSections, READING_DISCLOSURE, type DescriptionDraft, type ReportPlan } from "./soulmate-report-plan";
import { assertTimelineContext, timelineMonthLabel, timelineSections, type TimelineContext, type TimelineDraft } from "./soulmate-timeline";

const ascii = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[—–‑]/g, "-").replace(/[^\x20-\x7e\n]/g, "");
export function renderSketchPdf(image: Buffer, format: "JPEG" | "PNG") {
  const doc = new jsPDF({ unit: "pt", format: [612, 612], compress: true });
  const info = doc.getImageProperties(new Uint8Array(image));
  if (Math.abs(info.width / info.height - 1) > 0.02) throw new Error("Sketch must be square; do not crop the buyer's portrait");
  doc.setProperties({ title: "Soulmate Sketch", author: "Astro Rekha" });
  // One page, full image, no heading, footer, logo, border or other text.
  doc.addImage(new Uint8Array(image), format, 0, 0, 612, 612);
  return Buffer.from(doc.output("arraybuffer"));
}
export function renderDescriptionPdf(plan: ReportPlan, draft: DescriptionDraft) {
  return renderReadingPdf(plan, "Soulmate Description", "Your soulmate description", descriptionSections(plan, draft), draft.closing);
}
export function renderTimelinePdf(context: TimelineContext, draft: TimelineDraft, now = new Date()) {
  assertTimelineContext(context, now);
  return renderReadingPdf(context, "Soulmate Connection Timeline", "Your connection timeline", timelineSections(context, draft), draft.closing, timelineMonthLabel);
}
function renderReadingPdf(plan: { customerName: string; preparedOn: string }, title: string, headingText: string, sections: { title: string; paragraphs: string[] }[], closing: string, formatDate = monthLabel) {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  doc.setProperties({ title, author: "Astro Rekha" });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  let y = 116;
  function frame() {
    doc.setFillColor("#fbf9f5"); doc.rect(0, 0, width, height, "F");
    doc.setFillColor("#251729"); doc.rect(0, 0, width, 78, "F");
    doc.setTextColor("#dcc496"); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("A S T R O R E K H A", 56, 34);
    doc.setTextColor("#e6dbe5"); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(title, 56, 56);
    y = 116;
  }
  function nextPage() { doc.addPage(); frame(); }
  function heading(title: string, size = 18, reserve = 45) {
    doc.setFont("times", "normal"); doc.setFontSize(size); doc.setTextColor("#251729");
    const lines: string[] = doc.splitTextToSize(ascii(title), width - 112);
    if (y + lines.length * (size + 3) + reserve > height - 70) { nextPage(); doc.setFont("times", "normal"); doc.setFontSize(size); doc.setTextColor("#251729"); }
    doc.text(lines, 56, y); y += lines.length * (size + 3) + 12;
  }
  function paragraph(value: string, note = false) {
    const size = note ? 9 : 10.3, leading = note ? 14 : 16.2;
    const style = () => { doc.setFont("helvetica", "normal"); doc.setFontSize(size); doc.setTextColor(note ? "#756d76" : "#322a35"); };
    style();
    const lines: string[] = doc.splitTextToSize(ascii(value), width - 112);
    if (y + (lines.length - 1) * leading > height - 74) { nextPage(); style(); }
    for (const line of lines) {
      if (y > height - 74) { nextPage(); style(); }
      doc.text(line, 56, y); y += leading;
    }
    y += 12;
  }
  frame();
  heading(headingText, 28);
  paragraph(`Prepared for ${ascii(plan.customerName) || "you"} | ${formatDate(plan.preparedOn)}`, true);
  sections.forEach((section) => {
    // Paginate by measured space. Fixed two-section breaks created extra pages
    // when a title or month label pushed the preceding section onto a new page.
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.3);
    const firstLines: string[] = doc.splitTextToSize(ascii(section.paragraphs[0] || ""), width - 112);
    heading(section.title, 18, firstLines.length * 16.2 + 12);
    section.paragraphs.forEach((text) => paragraph(text));
    y += 12;
  });
  paragraph(closing);
  // Keep the disclosure heading and its full paragraph together.
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const disclosureLines: string[] = doc.splitTextToSize(ascii(READING_DISCLOSURE), width - 112);
  if (y + 29 + disclosureLines.length * 14 > height - 74) nextPage();
  heading("About this reading", 14);
  paragraph(READING_DISCLOSURE, true);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setDrawColor("#ddd4cf"); doc.line(56, height - 51, width - 56, height - 51);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.3); doc.setTextColor("#756d76");
    doc.text(`${title} | Astro Rekha`, 56, height - 35);
    doc.text(`${page} / ${pages}`, width - 56, height - 35, { align: "right" });
  }
  return Buffer.from(doc.output("arraybuffer"));
}
