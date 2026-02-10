import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getAdminDb } from "@/lib/firebase-admin";
import { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

async function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: SCOPES,
  });
  
  const sheets = google.sheets({ version: "v4", auth });
  return sheets;
}

// POST - Manual trigger with auth header
export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    const authHeader = request.headers.get("authorization");
    const expectedAuth = `Bearer ${process.env.ADMIN_SYNC_SECRET}`;
    
    if (!process.env.ADMIN_SYNC_SECRET || authHeader !== expectedAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return await syncSheets();
  } catch (error: any) {
    console.error("Sheets sync error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync sheets" },
      { status: 500 }
    );
  }
}

// GET - For Vercel Cron jobs
export async function GET(request: NextRequest) {
  try {
    // Vercel cron sends authorization header with CRON_SECRET
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const adminSecret = process.env.ADMIN_SYNC_SECRET;
    
    // Accept either CRON_SECRET or ADMIN_SYNC_SECRET
    const isValidCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const isValidAdmin = adminSecret && authHeader === `Bearer ${adminSecret}`;
    
    if (!isValidCron && !isValidAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return await syncSheets();
  } catch (error: any) {
    console.error("Sheets sync error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync sheets" },
      { status: 500 }
    );
  }
}

async function syncSheets() {
  const sheets = await getGoogleSheetsClient();
  const adminDb = getAdminDb();
  const now = new Date().toISOString();

  // ========== SYNC ABANDONED LEADS ==========
  // Users who entered email at step-15 but didn't subscribe
  const leadsSnapshot = await adminDb.collection("leads")
    .where("subscriptionStatus", "==", "no")
    .get();

  const abandonedLeads = leadsSnapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => {
    const data = doc.data();
    return [
      data.email || "",
      data.gender || "",
      data.age?.toString() || "",
      data.relationshipStatus || "",
      (data.goals || []).join(", "),
      data.createdAt || "",
      data.source || "",
    ];
  });

  // Update Abandoned Leads sheet
  const abandonedSheetId = process.env.GOOGLE_SHEET_ABANDONED_LEADS;
  if (abandonedSheetId) {
    try {
      // Clear existing data (except header)
      await sheets.spreadsheets.values.clear({
        spreadsheetId: abandonedSheetId,
        range: "Sheet1!A2:H10000",
      });

      // Add/update header
      await sheets.spreadsheets.values.update({
        spreadsheetId: abandonedSheetId,
        range: "Sheet1!A1:H1",
        valueInputOption: "RAW",
        requestBody: {
          values: [["Email", "Gender", "Age", "Relationship Status", "Goals", "Created At", "Source", "Last Synced"]],
        },
      });

      // Add data if any
      if (abandonedLeads.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: abandonedSheetId,
          range: "Sheet1!A2",
          valueInputOption: "RAW",
          requestBody: {
            values: abandonedLeads.map((row: string[]) => [...row, now]),
          },
        });
      }
    } catch (err) {
      console.error("Failed to sync abandoned leads sheet:", err);
    }
  }

  // ========== SYNC ACTIVE/TRIAL SUBSCRIBERS ==========
  // Users who are currently on trial or have active subscriptions
  const usersSnapshot = await adminDb.collection("users").get();
  
  const activeSubscribers = usersSnapshot.docs
    .filter((doc: QueryDocumentSnapshot<DocumentData>) => {
      const data = doc.data();
      const status = data.subscriptionStatus;
      return status === "active" || status === "trialing";
    })
    .map((doc: QueryDocumentSnapshot<DocumentData>) => {
      const data = doc.data();
      return [
        data.email || "",
        data.name || "",
        data.gender || "",
        data.age?.toString() || "",
        data.relationshipStatus || "",
        (data.goals || []).join(", "),
        data.subscriptionStatus || "",
        data.subscriptionPlan || "",
        data.trialEndsAt || "",
        data.createdAt || "",
      ];
    });

  // Update Active Subscribers sheet
  const activeSheetId = process.env.GOOGLE_SHEET_ACTIVE_SUBSCRIBERS;
  if (activeSheetId) {
    try {
      // Clear existing data (except header)
      await sheets.spreadsheets.values.clear({
        spreadsheetId: activeSheetId,
        range: "Sheet1!A2:K10000",
      });

      // Add/update header
      await sheets.spreadsheets.values.update({
        spreadsheetId: activeSheetId,
        range: "Sheet1!A1:K1",
        valueInputOption: "RAW",
        requestBody: {
          values: [["Email", "Name", "Gender", "Age", "Relationship Status", "Goals", "Status", "Plan", "Trial Ends", "Created At", "Last Synced"]],
        },
      });

      // Add data if any
      if (activeSubscribers.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: activeSheetId,
          range: "Sheet1!A2",
          valueInputOption: "RAW",
          requestBody: {
            values: activeSubscribers.map((row: string[]) => [...row, now]),
          },
        });
      }
    } catch (err) {
      console.error("Failed to sync active subscribers sheet:", err);
    }
  }

  return NextResponse.json({
    success: true,
    abandonedLeadsCount: abandonedLeads.length,
    activeSubscribersCount: activeSubscribers.length,
    syncedAt: now,
    sheets: {
      abandonedLeads: abandonedSheetId ? "synced" : "not configured",
      activeSubscribers: activeSheetId ? "synced" : "not configured",
    },
  });
}
