import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, increment } from "firebase/firestore";

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json(
        { success: false, error: "Promo code is required" },
        { status: 400 }
      );
    }

    const trimmedCode = code.trim();

    // Try exact match first, then uppercase, then lowercase
    let promoRef = doc(db, "promo_codes", trimmedCode);
    let promoDoc = await getDoc(promoRef);

    // If not found, try uppercase version
    if (!promoDoc.exists()) {
      promoRef = doc(db, "promo_codes", trimmedCode.toUpperCase());
      promoDoc = await getDoc(promoRef);
    }

    // If still not found, try lowercase version
    if (!promoDoc.exists()) {
      promoRef = doc(db, "promo_codes", trimmedCode.toLowerCase());
      promoDoc = await getDoc(promoRef);
    }

    if (!promoDoc.exists()) {
      return NextResponse.json(
        { success: false, error: "Invalid promo code" },
        { status: 404 }
      );
    }

    const promoData = promoDoc.data();
    const foundCode = promoRef.id;

    // Check if code is active
    if (!promoData.active) {
      return NextResponse.json(
        { success: false, error: "This promo code is no longer active" },
        { status: 400 }
      );
    }

    // Check if code has expired
    if (promoData.expiresAt && new Date(promoData.expiresAt) < new Date()) {
      return NextResponse.json(
        { success: false, error: "This promo code has expired" },
        { status: 400 }
      );
    }

    // Check usage limit
    if (promoData.maxUses && promoData.usedCount >= promoData.maxUses) {
      return NextResponse.json(
        { success: false, error: "This promo code has reached its usage limit" },
        { status: 400 }
      );
    }

    // Increment usage count
    await updateDoc(promoRef, {
      usedCount: increment(1),
      lastUsedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: {
        code: foundCode,
        discount: promoData.discount || 100, // Default 100% off (free)
        type: promoData.type || "percent", // "percent" or "fixed"
        coins: promoData.coins || 100, // Bonus coins
        plan: promoData.plan || "yearly", // Which plan to give
        unlockAll: promoData.unlockAll !== false, // Unlock all features by default
      },
    });
  } catch (error: any) {
    console.error("Promo validation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to validate promo code" },
      { status: 500 }
    );
  }
}
