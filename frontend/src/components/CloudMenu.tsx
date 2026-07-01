import { useEffect, useRef, useState } from "react";
import { Cloud, Download, LogIn, LogOut, Save, Share2, FolderOpen, Upload, X } from "lucide-react";
import type { TripData } from "../api";
import { exportTripToFile, importTripFromFile } from "../services/tripFile";
import {
  type CloudTripSummary,
  deleteSharedTrip,
  deleteTrip,
  listTrips,
  loadTrip,
  onAuthChange,
  saveTrip,
  shareTrip,
  signInWithGoogle,
  signOutOfGoogle,
} from "../services/tripsStore";

/** Share-duration choices shown next to the share button; 0 means "forever" (no expiry field stored). */
const SHARE_DURATIONS = [
  { label: "7 ימים", days: 7 },
  { label: "30 יום", days: 30 },
  { label: "90 יום", days: 90 },
  { label: "לתמיד", days: 0 },
];
import type { Theme } from "./ThemeSelector";

/** Sign-in + "My Trips" + Save/Share controls backed by Firestore. */
export default function CloudMenu({
  tripData,
  theme,
  tripId,
  onTripIdChange,
  onLoadTrip,
  onImportTrip,
}: {
  tripData: TripData;
  theme: Theme;
  /** Id of the trip currently being edited, shared with the step-4 deploy flow. */
  tripId: string | null;
  onTripIdChange: (tripId: string | null) => void;
  onLoadTrip: (trip: TripData, tripId: string, theme: Theme) => void;
  onImportTrip: (trip: TripData, theme: Theme) => void;
}) {
  const [email, setEmail] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [trips, setTrips] = useState<CloudTripSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareDays, setShareDays] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { tripData: imported, theme: importedTheme } = await importTripFromFile(file);
      onImportTrip(imported, importedTheme);
      setNotice("הטיול יובא מהקובץ.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "ייבוא הקובץ נכשל.");
    }
  };

  const refreshTrips = async (id: string) => {
    setTrips(await listTrips(id));
  };

  useEffect(() => {
    return onAuthChange((user) => {
      if (user) {
        setEmail(user.email);
        setUid(user.uid);
        refreshTrips(user.uid);
      } else {
        setEmail(null);
        setUid(null);
        setTrips([]);
      }
    });
  }, []);

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
      const link = await shareTrip(uid, tripId, tripData, theme, shareDays || undefined);
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
      // Best-effort: also revoke any public share link so it doesn't outlive the trip.
      await deleteSharedTrip(trip.id).catch((err) => console.error(err));
      await refreshTrips(uid);
      if (tripId === trip.id) onTripIdChange(null);
    } catch (err) {
      console.error(err);
      setNotice("מחיקת הטיול נכשלה.");
    } finally {
      setBusy(false);
    }
  };

  const fileImportControls = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleImportFile}
        className="hidden"
      />
      <button
        onClick={() => exportTripToFile(tripData, theme)}
        className="flex items-center gap-1.5 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-full transition-colors"
      >
        <Download size={16} />
        ייצוא
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1.5 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-full transition-colors"
      >
        <Upload size={16} />
        ייבוא
      </button>
    </>
  );

  if (!email) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {fileImportControls}
        <button
          onClick={handleSignIn}
          disabled={busy}
          className="flex items-center gap-2 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-full transition-colors"
        >
          <LogIn size={16} />
          {busy ? "מתחבר..." : "התחברות עם Google"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {fileImportControls}
      <div className="relative">
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-full transition-colors"
        >
          <Cloud size={16} />
          {email}
        </button>

        {isOpen && (
          <div className="absolute left-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-outline/20 p-4 z-40 text-right">
            {notice && <p className="text-xs text-amber-700 mb-3">{notice}</p>}

            <div className="flex gap-2 mb-2">
              <button
                onClick={handleSave}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-sm px-3 py-2 rounded-lg"
              >
                <Save size={14} />
                שמירה
              </button>
              <button
                onClick={handleShare}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-1.5 bg-surface-container hover:bg-surface-container-high text-ink-muted text-sm px-3 py-2 rounded-lg"
              >
                <Share2 size={14} />
                שיתוף
              </button>
            </div>
            <label className="block text-xs text-ink-muted mb-4">
              תוקף קישור השיתוף:{" "}
              <select
                value={shareDays}
                onChange={(e) => setShareDays(Number(e.target.value))}
                className="border border-outline/40 rounded-md px-1.5 py-0.5 text-xs"
              >
                {SHARE_DURATIONS.map((opt) => (
                  <option key={opt.days} value={opt.days}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted mb-2">
              <FolderOpen size={14} />
              הטיולים שלי
            </div>
            <ul className="max-h-48 overflow-y-auto space-y-1 mb-3">
              {trips.length === 0 && (
                <li className="text-xs text-ink-muted py-2">אין טיולים שמורים עדיין.</li>
              )}
              {trips.map((trip) => (
                <li key={trip.id} className="flex items-center gap-1 group">
                  <button
                    onClick={() => handleLoad(trip)}
                    disabled={busy}
                    className="flex-1 text-sm text-ink text-right truncate hover:text-primary px-2 py-1.5 rounded-lg hover:bg-surface-container"
                  >
                    {trip.name}
                  </button>
                  <button
                    onClick={() => handleDelete(trip)}
                    disabled={busy}
                    className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-red-500 p-1"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>

            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink"
            >
              <LogOut size={14} />
              התנתקות
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
