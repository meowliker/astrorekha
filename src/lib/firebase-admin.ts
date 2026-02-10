import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;

  try {
    const json = JSON.parse(raw);
    if (json.private_key && typeof json.private_key === "string") {
      json.private_key = json.private_key.replace(/\\n/g, "\n");
    }
    return json;
  } catch {
    return null;
  }
}

export function getAdminApp() {
  if (getApps().length) return getApps()[0]!;

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY");
  }

  return initializeApp({ credential: cert(serviceAccount) });
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
