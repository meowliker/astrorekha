import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCAZeMkiUY6w1aDXZGL9HFZ9Rm9x-3WEMA",
  authDomain: "palm-cosmic.firebaseapp.com",
  projectId: "palm-cosmic",
  storageBucket: "palm-cosmic.firebasestorage.app",
  messagingSenderId: "35594331902",
  appId: "1:35594331902:web:493024eeb709b32a77e7af"
};

// Initialize Firebase (prevent multiple initializations)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

export default app;
