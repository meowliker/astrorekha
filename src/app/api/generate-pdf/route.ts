import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";

export async function POST(request: NextRequest) {
  try {
    const { palmReading, userInfo } = await request.json();

    // Create new PDF document
    const doc = new jsPDF();
    
    // Set font
    doc.setFont("helvetica");
    
    // Header
    doc.setFontSize(24);
    doc.setTextColor(225, 29, 72); // Primary color
    doc.text("PalmCosmic", 105, 20, { align: "center" });
    
    doc.setFontSize(18);
    doc.setTextColor(0, 0, 0);
    doc.text("Your Personal Palm Reading Report", 105, 35, { align: "center" });
    
    // User info
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 105, 45, { align: "center" });
    if (userInfo?.name) {
      doc.text(`For: ${userInfo.name}`, 105, 52, { align: "center" });
    }
    
    // Line separator
    doc.setDrawColor(225, 29, 72);
    doc.setLineWidth(0.5);
    doc.line(20, 60, 190, 60);
    
    let yPosition = 75;

    // Helper to extract text from reading section (handles both string and object formats)
    const getReadingText = (section: any): string => {
      if (!section) return "";
      if (typeof section === "string") return section;
      if (typeof section === "object" && section.description) return section.description;
      return String(section);
    };

    // Helper to get score from reading section
    const getReadingScore = (section: any): number | null => {
      if (!section) return null;
      if (typeof section === "object" && typeof section.score === "number") return section.score;
      return null;
    };
    
    // Love Section
    if (palmReading?.love) {
      doc.setFontSize(14);
      doc.setTextColor(239, 68, 68); // Love color - red
      doc.text("Love & Relationships", 20, yPosition);
      
      const loveScore = getReadingScore(palmReading.love);
      if (loveScore !== null) {
        doc.setFontSize(12);
        doc.setTextColor(100, 100, 100);
        doc.text(`Score: ${loveScore}%`, 170, yPosition, { align: "right" });
      }
      yPosition += 8;
      
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      const loveText = getReadingText(palmReading.love);
      const loveLines = doc.splitTextToSize(loveText, 170);
      doc.text(loveLines, 20, yPosition);
      yPosition += loveLines.length * 5 + 15;
    }
    
    // Health Section
    if (palmReading?.health) {
      doc.setFontSize(14);
      doc.setTextColor(6, 182, 212); // Health color - cyan
      doc.text("Health & Vitality", 20, yPosition);
      
      const healthScore = getReadingScore(palmReading.health);
      if (healthScore !== null) {
        doc.setFontSize(12);
        doc.setTextColor(100, 100, 100);
        doc.text(`Score: ${healthScore}%`, 170, yPosition, { align: "right" });
      }
      yPosition += 8;
      
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      const healthText = getReadingText(palmReading.health);
      const healthLines = doc.splitTextToSize(healthText, 170);
      doc.text(healthLines, 20, yPosition);
      yPosition += healthLines.length * 5 + 15;
    }
    
    // Career Section
    if (palmReading?.career) {
      doc.setFontSize(14);
      doc.setTextColor(139, 92, 246); // Career color - purple
      doc.text("Career & Success", 20, yPosition);
      
      const careerScore = getReadingScore(palmReading.career);
      if (careerScore !== null) {
        doc.setFontSize(12);
        doc.setTextColor(100, 100, 100);
        doc.text(`Score: ${careerScore}%`, 170, yPosition, { align: "right" });
      }
      yPosition += 8;
      
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      const careerText = getReadingText(palmReading.career);
      const careerLines = doc.splitTextToSize(careerText, 170);
      doc.text(careerLines, 20, yPosition);
      yPosition += careerLines.length * 5 + 15;
    }
    
    // Wisdom Section
    if (palmReading?.wisdom) {
      doc.setFontSize(14);
      doc.setTextColor(234, 179, 8); // Wisdom color - yellow
      doc.text("Personal Growth & Wisdom", 20, yPosition);
      
      const wisdomScore = getReadingScore(palmReading.wisdom);
      if (wisdomScore !== null) {
        doc.setFontSize(12);
        doc.setTextColor(100, 100, 100);
        doc.text(`Score: ${wisdomScore}%`, 170, yPosition, { align: "right" });
      }
      yPosition += 8;
      
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      const wisdomText = getReadingText(palmReading.wisdom);
      const wisdomLines = doc.splitTextToSize(wisdomText, 170);
      doc.text(wisdomLines, 20, yPosition);
      yPosition += wisdomLines.length * 5 + 15;
    }
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("This reading is for entertainment purposes only.", 105, 280, { align: "center" });
    doc.text("© PalmCosmic - Your Cosmic Journey Awaits", 105, 285, { align: "center" });
    
    // Generate PDF as buffer
    const pdfBuffer = doc.output("arraybuffer");
    
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="palm-reading-${Date.now()}.pdf"`,
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
