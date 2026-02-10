import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const INPUT_FILE = path.resolve(process.cwd(), "data/predictions-2026.json");

async function main() {
  console.log("📤 Uploading predictions to Firebase...\n");

  if (!fs.existsSync(INPUT_FILE)) {
    console.error("❌ Predictions file not found:", INPUT_FILE);
    process.exit(1);
  }

  const predictions = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const signs = Object.keys(predictions);

  console.log(`Found ${signs.length} predictions to upload\n`);

  for (const sign of signs) {
    try {
      console.log(`⏳ Uploading ${sign}...`);
      
      await setDoc(doc(db, "predictions_2026_global", sign), predictions[sign]);
      
      console.log(`✅ ${sign} uploaded\n`);
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`❌ Failed to upload ${sign}:`, error);
    }
  }

  console.log("\n🎉 All predictions uploaded to Firebase!");
  process.exit(0);
}

main();
