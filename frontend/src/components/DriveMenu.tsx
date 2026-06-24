import { useEffect, useState } from "react";
import { Cloud, LogIn, LogOut, Save, Share2, FolderOpen, X } from "lucide-react";
import type { TripData } from "../api";
import {
  type DriveTripSummary,
  deleteTrip,
  ensureAppFolder,
  listTrips,
  loadTrip,
  onAuthChange,
  saveTrip,
  shareTrip,
  signInWithGoogle,
  signOutOfGoogle,
} from "../services/googleDrive";

/** Sign-in + "My Trips" + Save/Share controls backed by the user's own Google Drive. */
export default function DriveMenu({
  tripData,
  onLoadTrip,
}: {
  tripData: TripData;
  onLoadTrip: (trip: TripData) => void;
}) {
  const [email, setEmail] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [trips, setTrips] = useState<DriveTripSummary[]>([]);
  const [savedFileId, setSavedFileId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    return onAuthChange((user) => {
      if (!user) {
        setEmail(null);
        setAccessToken(null);
        setFolderId(null);
        setTrips([]);
      }
    });
  }, []);

  const refreshTrips = async (token: string, folder: string) => {
    const list = await listTrips(token, folder);
    setTrips(list);
  };

  const handleSignIn = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const session = await signInWithGoogle();
      setEmail(session.email);
      setAccessToken(session.accessToken);
      const folder = await ensureAppFolder(session.accessToken);
      setFolderId(folder);
      await refreshTrips(session.accessToken, folder);
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
    setAccessToken(null);
    setFolderId(null);
    setTrips([]);
    setSavedFileId(null);
    setIsOpen(false);
  };

  const handleSave = async () => {
    if (!accessToken || !folderId) return;
    setBusy(true);
    setNotice(null);
    try {
      const fileId = await saveTrip(accessToken, folderId, tripData, savedFileId ?? undefined);
      setSavedFileId(fileId);
      await refreshTrips(accessToken, folderId);
      setNotice("הטיול נשמר ב-Google Drive שלכם.");
    } catch (err) {
      console.error(err);
      setNotice("שמירה ל-Drive נכשלה.");
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    if (!accessToken || !savedFileId) {
      setNotice("שמרו את הטיול לפני שיתופו.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const link = await shareTrip(accessToken, savedFileId);
      await navigator.clipboard.writeText(link).catch(() => {});
      setNotice("קישור השיתוף הועתק ללוח.");
    } catch (err) {
      console.error(err);
      setNotice("שיתוף הטיול נכשל.");
    } finally {
      setBusy(false);
    }
  };

  const handleLoad = async (trip: DriveTripSummary) => {
    if (!accessToken) return;
    setBusy(true);
    setNotice(null);
    try {
      const loaded = await loadTrip(accessToken, trip.id);
      onLoadTrip(loaded);
      setSavedFileId(trip.id);
      setIsOpen(false);
    } catch (err) {
      console.error(err);
      setNotice("טעינת הטיול נכשלה.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (trip: DriveTripSummary) => {
    if (!accessToken || !folderId) return;
    setBusy(true);
    try {
      await deleteTrip(accessToken, trip.id);
      await refreshTrips(accessToken, folderId);
      if (savedFileId === trip.id) setSavedFileId(null);
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
            הטיולים שלי ב-Drive
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
                  {trip.name.replace(/\.json$/, "")}
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
