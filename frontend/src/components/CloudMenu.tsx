import { useEffect, useState } from "react";
import { Cloud, LogIn, LogOut, Save, Share2, FolderOpen, X } from "lucide-react";
import type { TripData } from "../api";
import {
  type CloudTripSummary,
  deleteTrip,
  listTrips,
  loadTrip,
  onAuthChange,
  saveTrip,
  shareTrip,
  signInWithGoogle,
  signOutOfGoogle,
} from "../services/tripsStore";
import type { Theme } from "./ThemeSelector";

/** Sign-in + "My Trips" + Save/Share controls backed by Firestore. */
export default function CloudMenu({
  tripData,
  theme,
  tripId,
  onTripIdChange,
  onLoadTrip,
}: {
  tripData: TripData;
  theme: Theme;
  /** Id of the trip currently being edited, shared with the step-4 deploy flow. */
  tripId: string | null;
  onTripIdChange: (tripId: string | null) => void;
  onLoadTrip: (trip: TripData, tripId: string, theme: Theme) => void;
}) {
  const [email, setEmail] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [trips, setTrips] = useState<CloudTripSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    return onAuthChange((user) => {
      if (!user) {
        setEmail(null);
        setUid(null);
        setTrips([]);
      }
    });
  }, []);

  const refreshTrips = async (id: string) => {
    setTrips(await listTrips(id));
  };

  const handleSignIn = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const session = await signInWithGoogle();
      setEmail(session.email);
      setUid(session.uid);
      await refreshTrips(session.uid);
    } catch (err) {
      console.error(err);
      setNotice("ההתחברות ל-Google נכשלה. נסו שוב.");
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOutOfGoogle();
    setEmail(null);
    setUid(null);
    setTrips([]);
    onTripIdChange(null);
    setIsOpen(false);
  };

  const handleSave = async () => {
    if (!uid) return;
    setBusy(true);
    setNotice(null);
    try {
      const savedId = await saveTrip(uid, tripData, { theme, tripId: tripId ?? undefined });
      onTripIdChange(savedId);
      await refreshTrips(uid);
      setNotice("הטיול נשמר בחשבונכם.");
    } catch (err) {
      console.error(err);
      setNotice("שמירת הטיול נכשלה.");
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    if (!uid || !tripId) {
      setNotice("שמרו את הטיול לפני שיתופו.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const link = await shareTrip(uid, tripId, tripData, theme);
      await navigator.clipboard.writeText(link).catch(() => {});
      setNotice("קישור השיתוף הועתק ללוח.");
    } catch (err) {
      console.error(err);
      setNotice("שיתוף הטיול נכשל.");
    } finally {
      setBusy(false);
    }
  };

  const handleLoad = async (trip: CloudTripSummary) => {
    if (!uid) return;
    setBusy(true);
    setNotice(null);
    try {
      const { trip: loaded, theme: loadedTheme } = await loadTrip(uid, trip.id);
      onLoadTrip(loaded, trip.id, loadedTheme);
      setIsOpen(false);
    } catch (err) {
      console.error(err);
      setNotice("טעינת הטיול נכשלה.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (trip: CloudTripSummary) => {
    if (!uid) return;
    setBusy(true);
    try {
      await deleteTrip(uid, trip.id);
      await refreshTrips(uid);
      if (tripId === trip.id) onTripIdChange(null);
    } catch (err) {
      console.error(err);
      setNotice("מחיקת הטיול נכשלה.");
    } finally {
      setBusy(false);
    }
  };

  if (!email) {
    return (
      <button
        onClick={handleSignIn}
        disabled={busy}
        className="flex items-center gap-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full transition-colors"
      >
        <LogIn size={16} />
        {busy ? "מתחבר..." : "התחברות עם Google"}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full transition-colors"
      >
        <Cloud size={16} />
        {email}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-40 text-right">
          {notice && <p className="text-xs text-amber-700 mb-3">{notice}</p>}

          <div className="flex gap-2 mb-4">
            <button
              onClick={handleSave}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded-lg"
            >
              <Save size={14} />
              שמירה
            </button>
            <button
              onClick={handleShare}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-3 py-2 rounded-lg"
            >
              <Share2 size={14} />
              שיתוף
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
            <FolderOpen size={14} />
            הטיולים שלי
          </div>
          <ul className="max-h-48 overflow-y-auto space-y-1 mb-3">
            {trips.length === 0 && (
              <li className="text-xs text-gray-400 py-2">אין טיולים שמורים עדיין.</li>
            )}
            {trips.map((trip) => (
              <li key={trip.id} className="flex items-center gap-1 group">
                <button
                  onClick={() => handleLoad(trip)}
                  disabled={busy}
                  className="flex-1 text-sm text-gray-700 text-right truncate hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-50"
                >
                  {trip.name}
                </button>
                <button
                  onClick={() => handleDelete(trip)}
                  disabled={busy}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
          >
            <LogOut size={14} />
            התנתקות
          </button>
        </div>
      )}
    </div>
  );
}
