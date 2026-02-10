"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Loader2, MapPin, Search, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { useUserStore } from "@/lib/user-store";
import { doc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { getZodiacSign } from "@/lib/astrology-api";

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const relationshipOptions = ["Single", "In a relationship", "Married", "Divorced", "Widowed", "Prefer not to say"];
const genderOptions = ["Male", "Female", "Non-binary", "Prefer not to say"];

export default function EditProfilePage() {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0); // 0=hidden, 1=first confirm, 2=password
  const [deletePassword, setDeletePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Edit modal states
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState("");
  
  // Location search states
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  
  const { resetUserState } = useUserStore();

  const {
    gender, setGender,
    birthMonth, birthDay, birthYear,
    setBirthDate,
    birthPlace, setBirthPlace,
    birthHour, birthMinute, birthPeriod,
    setBirthTime,
    relationshipStatus, setRelationshipStatus,
  } = useOnboardingStore();

  const [localName, setLocalName] = useState("You");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsClient(true);
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    setIsLoading(true);
    try {
      // Get userId - prefer Firebase Auth uid
      const authUid = auth.currentUser?.uid;
      const storedId = localStorage.getItem("palmcosmic_user_id");
      const userId = authUid || storedId;

      if (!userId) {
        setIsLoading(false);
        return;
      }

      // Update localStorage if using auth uid
      if (authUid && storedId !== authUid) {
        localStorage.setItem("palmcosmic_user_id", authUid);
      }

      // Load from Firebase
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        
        // Populate all fields from Firebase
        if (data.name) setLocalName(data.name);
        if (data.gender) setGender(data.gender);
        if (data.relationshipStatus) setRelationshipStatus(data.relationshipStatus);
        if (data.birthMonth && data.birthDay && data.birthYear) {
          setBirthDate(String(data.birthMonth), String(data.birthDay), String(data.birthYear));
        }
        if (data.birthPlace) setBirthPlace(data.birthPlace);
        if (data.birthHour) {
          setBirthTime(
            String(data.birthHour),
            String(data.birthMinute || 0),
            data.birthPeriod || "AM"
          );
        }
      } else {
        // Fallback to localStorage for name
        const savedName = localStorage.getItem("palmcosmic_name");
        if (savedName) setLocalName(savedName);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatBirthDate = () => {
    if (!birthMonth || !birthDay || !birthYear) return "Not set";
    // birthMonth could be a month name or number
    const monthIndex = isNaN(Number(birthMonth)) 
      ? months.findIndex(m => m.toLowerCase() === birthMonth.toLowerCase())
      : Number(birthMonth) - 1;
    const monthName = monthIndex >= 0 && monthIndex < 12 ? months[monthIndex] : birthMonth;
    return `${monthName} ${birthDay}, ${birthYear}`;
  };

  const formatBirthTime = () => {
    if (!birthHour) return "Not set";
    const hour = birthHour || 12;
    const minute = birthMinute || 0;
    const period = birthPeriod || "PM";
    return `${hour}:${String(minute).padStart(2, '0')} ${period}`;
  };

  const handleSaveField = async (field: string, value: any) => {
    setIsSaving(true);
    try {
      // Update local store based on field
      switch (field) {
        case "name":
          setLocalName(value);
          localStorage.setItem("palmcosmic_name", value);
          break;
        case "gender":
          setGender(value);
          break;
        case "relationship":
          setRelationshipStatus(value);
          break;
        case "birthDate":
          // value is { month, day, year }
          setBirthDate(String(value.month), String(value.day), String(value.year));
          break;
        case "birthPlace":
          setBirthPlace(value);
          break;
        case "birthTime":
          // value is { hour, minute, period }
          setBirthTime(String(value.hour), String(value.minute), value.period);
          break;
      }

      // Save to Firebase
      const userId = localStorage.getItem("palmcosmic_user_id");
      if (userId) {
        const userRef = doc(db, "users", userId);
        
        // Determine the new birth details
        const newBirthMonth = field === "birthDate" ? value.month : birthMonth;
        const newBirthDay = field === "birthDate" ? value.day : birthDay;
        const newBirthYear = field === "birthDate" ? value.year : birthYear;
        const newBirthHour = field === "birthTime" ? value.hour : birthHour;
        const newBirthMinute = field === "birthTime" ? value.minute : birthMinute;
        const newBirthPeriod = field === "birthTime" ? value.period : birthPeriod;
        const newBirthPlace = field === "birthPlace" ? value : birthPlace;
        
        // Calculate sun sign from birth date
        const sunSign = newBirthMonth && newBirthDay 
          ? getZodiacSign(Number(newBirthMonth), Number(newBirthDay))
          : null;
        
        // Base update data
        const updateData: any = {
          name: field === "name" ? value : localName,
          gender: field === "gender" ? value : gender,
          relationshipStatus: field === "relationship" ? value : relationshipStatus,
          birthMonth: newBirthMonth,
          birthDay: newBirthDay,
          birthYear: newBirthYear,
          birthPlace: newBirthPlace,
          birthHour: newBirthHour,
          birthMinute: newBirthMinute,
          birthPeriod: newBirthPeriod,
          updatedAt: new Date().toISOString(),
        };
        
        // If birth details changed, recalculate signs
        if (field === "birthDate" || field === "birthTime" || field === "birthPlace") {
          // Update sun sign immediately (calculated locally)
          if (sunSign) {
            updateData.sunSign = sunSign;
          }
          
          // Recalculate moon and ascendant signs via API
          try {
            const response = await fetch("/api/astrology/signs", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-user-id": userId,
              },
              body: JSON.stringify({
                birthMonth: newBirthMonth,
                birthDay: newBirthDay,
                birthYear: newBirthYear,
                birthHour: newBirthHour,
                birthMinute: newBirthMinute,
                birthPeriod: newBirthPeriod,
                birthPlace: newBirthPlace,
              }),
            });
            const signsData = await response.json();
            if (signsData.success) {
              updateData.sunSign = signsData.sunSign;
              updateData.moonSign = signsData.moonSign;
              updateData.ascendantSign = signsData.ascendant;
            }
          } catch (signsError) {
            console.error("Error recalculating signs:", signsError);
            // Still save the sun sign we calculated locally
          }
        }
        
        await setDoc(userRef, updateData, { merge: true });
      }
    } catch (error) {
      console.error("Error saving:", error);
    } finally {
      setIsSaving(false);
      setEditingField(null);
    }
  };

  // Search for location suggestions using OpenStreetMap Nominatim API
  const searchLocation = async (query: string) => {
    if (query.length < 3) {
      setLocationSuggestions([]);
      return;
    }
    
    setIsSearchingLocation(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`
      );
      const data = await response.json();
      const suggestions = data.map((item: any) => item.display_name);
      setLocationSuggestions(suggestions);
    } catch (error) {
      console.error("Location search error:", error);
      setLocationSuggestions([]);
    } finally {
      setIsSearchingLocation(false);
    }
  };

  const handleDeleteAccount = async () => {
    // Verify password (simple check - in production, verify against Firebase Auth)
    const storedPassword = localStorage.getItem("palmcosmic_password");
    if (storedPassword && deletePassword !== storedPassword) {
      setDeleteError("Incorrect password. Please try again.");
      return;
    }
    
    setIsDeleting(true);
    setDeleteError("");
    
    try {
      const userId = localStorage.getItem("palmcosmic_user_id");
      const userEmail = localStorage.getItem("palmcosmic_email");
      
      // Step 1: Cancel Stripe subscription first (set cancel_at_period_end)
      // This prevents continued billing after account deletion
      if (userId || userEmail) {
        try {
          const cancelResponse = await fetch("/api/stripe/cancel-subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: userId || "",
              email: userEmail || "",
            }),
          });
          
          const cancelData = await cancelResponse.json();
          if (cancelData.success) {
            console.log("Subscription cancelled successfully before account deletion");
          } else if (cancelData.error && !cancelData.error.includes("Subscription ID is required")) {
            // Only log non-critical errors (user might not have a subscription)
            console.log("Subscription cancellation note:", cancelData.error);
          }
        } catch (cancelError) {
          // Don't block deletion if subscription cancellation fails
          // The subscription might not exist or already be cancelled
          console.log("Subscription cancellation skipped:", cancelError);
        }
      }
      
      // Step 2: Delete from Firebase
      if (userId) {
        await deleteDoc(doc(db, "users", userId));
        await deleteDoc(doc(db, "palm_readings", userId));
      }
      
      // Step 3: Clear all local data
      localStorage.clear();
      
      // Step 4: Reset stores
      resetUserState();
      
      // Step 5: Redirect to welcome screen
      router.push("/welcome");
    } catch (error) {
      console.error("Delete account error:", error);
      setDeleteError("Failed to delete account. Please try again.");
      setIsDeleting(false);
    }
  };

  if (!isClient) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-full max-w-md h-screen bg-[#0A0E1A]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col relative">
        {/* Starry background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="absolute w-0.5 h-0.5 bg-white/20 rounded-full"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
              }}
            />
          ))}
        </div>

        {/* Header */}
        <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm">
          <div className="flex items-center justify-center px-4 py-3">
            <button
              onClick={() => router.push("/profile")}
              className="absolute left-4 w-10 h-10 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-white text-xl font-semibold">Edit</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto relative z-10">
          <div className="px-4 py-6 space-y-4">
            {/* Name */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => {
                setEditingField("name");
                setTempValue(localName);
              }}
              className="w-full bg-[#1A1F2E] rounded-2xl p-4 border border-primary/20 text-left"
            >
              <p className="text-white/50 text-xs mb-1">Name</p>
              <div className="flex items-center justify-between">
                <p className="text-primary text-lg font-medium">{localName}</p>
                <ChevronRight className="w-5 h-5 text-primary" />
              </div>
            </motion.button>

            {/* Gender */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              onClick={() => {
                setEditingField("gender");
                setTempValue(gender || "Male");
              }}
              className="w-full bg-[#1A1F2E] rounded-2xl p-4 border border-primary/20 text-left"
            >
              <p className="text-white/50 text-xs mb-1">Gender</p>
              <div className="flex items-center justify-between">
                <p className="text-primary text-lg font-medium">{gender || "Not set"}</p>
                <ChevronRight className="w-5 h-5 text-primary" />
              </div>
            </motion.button>

            {/* Relationship */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              onClick={() => {
                setEditingField("relationship");
                setTempValue(relationshipStatus || "Single");
              }}
              className="w-full bg-[#1A1F2E] rounded-2xl p-4 border border-primary/20 text-left"
            >
              <p className="text-white/50 text-xs mb-1">Relationship</p>
              <div className="flex items-center justify-between">
                <p className="text-primary text-lg font-medium">{relationshipStatus || "Not set"}</p>
                <ChevronRight className="w-5 h-5 text-primary" />
              </div>
            </motion.button>

            {/* Date of Birth */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              onClick={() => setEditingField("birthDate")}
              className="w-full bg-[#1A1F2E] rounded-2xl p-4 border border-primary/20 text-left"
            >
              <p className="text-white/50 text-xs mb-1">Date of birth</p>
              <div className="flex items-center justify-between">
                <p className="text-primary text-lg font-medium">{formatBirthDate()}</p>
                <ChevronRight className="w-5 h-5 text-primary" />
              </div>
            </motion.button>

            {/* Place of Birth */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              onClick={() => {
                setEditingField("birthPlace");
                setTempValue(birthPlace || "");
              }}
              className="w-full bg-[#1A1F2E] rounded-2xl p-4 border border-primary/20 text-left"
            >
              <p className="text-white/50 text-xs mb-1">Place of birth</p>
              <div className="flex items-center justify-between">
                <p className="text-primary text-lg font-medium">{birthPlace || "Not set"}</p>
                <ChevronRight className="w-5 h-5 text-primary" />
              </div>
            </motion.button>

            {/* Time of Birth */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              onClick={() => setEditingField("birthTime")}
              className="w-full bg-[#1A1F2E] rounded-2xl p-4 border border-primary/20 text-left"
            >
              <p className="text-white/50 text-xs mb-1">Time of birth</p>
              <div className="flex items-center justify-between">
                <p className="text-primary text-lg font-medium">{formatBirthTime()}</p>
                <ChevronRight className="w-5 h-5 text-primary" />
              </div>
            </motion.button>

            {/* Delete Account */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="pt-8"
            >
              <button
                onClick={() => setDeleteStep(1)}
                className="w-full py-4 text-red-400 hover:text-red-300 transition-colors"
              >
                Delete Data & Account
              </button>
            </motion.div>
          </div>
        </div>

        {/* Edit Modals */}
        <AnimatePresence>
          {editingField === "name" && (
            <EditTextModal
              title="Name"
              value={tempValue}
              onChange={setTempValue}
              onSave={() => handleSaveField("name", tempValue)}
              onClose={() => setEditingField(null)}
              isSaving={isSaving}
            />
          )}
          {editingField === "birthPlace" && (
            <LocationSearchModal
              value={tempValue}
              onChange={setTempValue}
              onSave={() => handleSaveField("birthPlace", tempValue)}
              onClose={() => setEditingField(null)}
              isSaving={isSaving}
              onSearch={searchLocation}
              suggestions={locationSuggestions}
              isSearching={isSearchingLocation}
            />
          )}
          {editingField === "gender" && (
            <SelectModal
              title="Gender"
              options={genderOptions}
              selected={tempValue}
              onSelect={(val) => {
                setTempValue(val);
                handleSaveField("gender", val);
              }}
              onClose={() => setEditingField(null)}
            />
          )}
          {editingField === "relationship" && (
            <SelectModal
              title="Relationship"
              options={relationshipOptions}
              selected={tempValue}
              onSelect={(val) => {
                setTempValue(val);
                handleSaveField("relationship", val);
              }}
              onClose={() => setEditingField(null)}
            />
          )}
          {editingField === "birthDate" && (
            <DatePickerModal
              month={birthMonth}
              day={birthDay}
              year={birthYear}
              onSave={(m, d, y) => handleSaveField("birthDate", { month: m, day: d, year: y })}
              onClose={() => setEditingField(null)}
              isSaving={isSaving}
            />
          )}
          {editingField === "birthTime" && (
            <TimePickerModal
              hour={Number(birthHour) || 12}
              minute={Number(birthMinute) || 0}
              period={birthPeriod}
              onSave={(h, m, p) => handleSaveField("birthTime", { hour: h, minute: m, period: p })}
              onClose={() => setEditingField(null)}
              isSaving={isSaving}
            />
          )}
        </AnimatePresence>

        {/* Delete Confirmation Modal - Step 1 */}
        <AnimatePresence>
          {deleteStep === 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setDeleteStep(0)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#1A1F2E] rounded-2xl w-full max-w-sm p-6 border border-white/10"
              >
                <h2 className="text-white text-xl font-bold text-center mb-2">
                  Delete Account?
                </h2>
                <p className="text-white/60 text-center text-sm mb-6">
                  Are you sure you want to delete your account? This will permanently remove all your data including readings, reports, and subscription.
                </p>
                <div className="space-y-3">
                  <Button
                    onClick={() => setDeleteStep(2)}
                    className="w-full h-12 bg-red-500 hover:bg-red-600 text-white font-semibold"
                  >
                    Yes, I Want to Delete
                  </Button>
                  <Button
                    onClick={() => setDeleteStep(0)}
                    variant="outline"
                    className="w-full h-12 border-white/20 text-white hover:bg-white/10"
                  >
                    Cancel
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Confirmation Modal - Step 2 (Password) */}
        <AnimatePresence>
          {deleteStep === 2 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => {
                setDeleteStep(0);
                setDeletePassword("");
                setDeleteError("");
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#1A1F2E] rounded-2xl w-full max-w-sm p-6 border border-white/10"
              >
                <h2 className="text-white text-xl font-bold text-center mb-2">
                  Confirm Deletion
                </h2>
                <p className="text-white/60 text-center text-sm mb-4">
                  Enter your password to permanently delete your account.
                </p>
                
                {deleteError && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <p className="text-red-400 text-sm text-center">{deleteError}</p>
                  </div>
                )}
                
                <div className="relative mb-4">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full bg-[#0A0E1A] border border-white/20 rounded-xl px-4 py-3 pr-12 text-white focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                
                <p className="text-white/40 text-xs text-center mb-4">
                  Note: Your account will be scheduled for deletion after your current subscription cycle ends.
                </p>
                
                <div className="space-y-3">
                  <Button
                    onClick={handleDeleteAccount}
                    disabled={isDeleting || !deletePassword}
                    className="w-full h-12 bg-red-500 hover:bg-red-600 text-white font-semibold disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      "Delete My Account"
                    )}
                  </Button>
                  <Button
                    onClick={() => {
                      setDeleteStep(0);
                      setDeletePassword("");
                      setDeleteError("");
                    }}
                    variant="outline"
                    className="w-full h-12 border-white/20 text-white hover:bg-white/10"
                  >
                    Cancel
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Edit Text Modal Component
function EditTextModal({ title, value, onChange, onSave, onClose, isSaving }: {
  title: string;
  value: string;
  onChange: (val: string) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1A1F2E] rounded-2xl w-full max-w-sm p-6 border border-white/10"
      >
        <h2 className="text-white text-xl font-bold mb-4">{title}</h2>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[#0A0E1A] border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary"
          autoFocus
        />
        <div className="flex gap-3 mt-4">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 border-white/20 text-white hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={isSaving}
            className="flex-1 bg-primary hover:bg-primary/90 text-white"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Location Search Modal Component
function LocationSearchModal({ value, onChange, onSave, onClose, isSaving, onSearch, suggestions, isSearching }: {
  value: string;
  onChange: (val: string) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
  onSearch: (query: string) => void;
  suggestions: string[];
  isSearching: boolean;
}) {
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleInputChange = (val: string) => {
    onChange(val);
    
    // Debounce search
    if (searchTimeout) clearTimeout(searchTimeout);
    const timeout = setTimeout(() => {
      onSearch(val);
    }, 300);
    setSearchTimeout(timeout);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1A1F2E] rounded-2xl w-full max-w-sm p-6 border border-white/10"
      >
        <h2 className="text-white text-xl font-bold mb-4">Place of Birth</h2>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
          <input
            type="text"
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search for a location..."
            className="w-full bg-[#0A0E1A] border border-white/20 rounded-xl pl-10 pr-10 py-3 text-white focus:outline-none focus:border-primary"
            autoFocus
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary animate-spin" />
          )}
        </div>
        
        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => {
                  onChange(suggestion);
                  onSearch(""); // Clear suggestions
                }}
                className="w-full p-3 bg-[#0A0E1A] rounded-xl text-left text-white/80 text-sm hover:bg-white/10 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{suggestion}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        
        <div className="flex gap-3 mt-4">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 border-white/20 text-white hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={isSaving}
            className="flex-1 bg-primary hover:bg-primary/90 text-white"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Select Modal Component
function SelectModal({ title, options, selected, onSelect, onClose }: {
  title: string;
  options: string[];
  selected: string;
  onSelect: (val: string) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1A1F2E] rounded-2xl w-full max-w-sm p-6 border border-white/10"
      >
        <h2 className="text-white text-xl font-bold mb-4">{title}</h2>
        <div className="space-y-2">
          {options.map((option) => (
            <button
              key={option}
              onClick={() => onSelect(option)}
              className={`w-full p-3 rounded-xl text-left transition-colors ${
                selected === option
                  ? "bg-primary text-white"
                  : "bg-[#0A0E1A] text-white hover:bg-white/10"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// Date Picker Modal
function DatePickerModal({ month, day, year, onSave, onClose, isSaving }: {
  month: string | number | null;
  day: string | number | null;
  year: string | number | null;
  onSave: (m: string | number, d: string | number, y: string | number) => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  const [m, setM] = useState(Number(month) || 1);
  const [d, setD] = useState(Number(day) || 1);
  const [y, setY] = useState(Number(year) || 1990);

  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1A1F2E] rounded-2xl w-full max-w-sm p-6 border border-white/10"
      >
        <h2 className="text-white text-xl font-bold mb-4">Date of Birth</h2>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <select
            value={m}
            onChange={(e) => setM(Number(e.target.value))}
            className="bg-[#0A0E1A] border border-white/20 rounded-xl px-2 py-3 text-white text-sm"
          >
            {months.map((month, i) => (
              <option key={month} value={i + 1}>{month}</option>
            ))}
          </select>
          <select
            value={d}
            onChange={(e) => setD(Number(e.target.value))}
            className="bg-[#0A0E1A] border border-white/20 rounded-xl px-2 py-3 text-white text-sm"
          >
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
          <select
            value={y}
            onChange={(e) => setY(Number(e.target.value))}
            className="bg-[#0A0E1A] border border-white/20 rounded-xl px-2 py-3 text-white text-sm"
          >
            {Array.from({ length: 100 }, (_, i) => (
              <option key={2024 - i} value={2024 - i}>{2024 - i}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 border-white/20 text-white hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onSave(m, d, y)}
            disabled={isSaving}
            className="flex-1 bg-primary hover:bg-primary/90 text-white"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Time Picker Modal
function TimePickerModal({ hour, minute, period, onSave, onClose, isSaving }: {
  hour: number | null;
  minute: number | null;
  period: string | null;
  onSave: (h: number, m: number, p: string) => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  const [h, setH] = useState(hour || 12);
  const [m, setM] = useState(minute || 0);
  const [p, setP] = useState(period || "PM");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1A1F2E] rounded-2xl w-full max-w-sm p-6 border border-white/10"
      >
        <h2 className="text-white text-xl font-bold mb-4">Time of Birth</h2>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <select
            value={h}
            onChange={(e) => setH(Number(e.target.value))}
            className="bg-[#0A0E1A] border border-white/20 rounded-xl px-2 py-3 text-white text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
          <select
            value={m}
            onChange={(e) => setM(Number(e.target.value))}
            className="bg-[#0A0E1A] border border-white/20 rounded-xl px-2 py-3 text-white text-sm"
          >
            {Array.from({ length: 60 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
            ))}
          </select>
          <select
            value={p}
            onChange={(e) => setP(e.target.value)}
            className="bg-[#0A0E1A] border border-white/20 rounded-xl px-2 py-3 text-white text-sm"
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 border-white/20 text-white hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onSave(h, m, p)}
            disabled={isSaving}
            className="flex-1 bg-primary hover:bg-primary/90 text-white"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
