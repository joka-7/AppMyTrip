import type { TripData } from "../api";
import AppFrame from "./AppFrame";
import type { Theme } from "./ThemeSelector";

/**
 * What a `?shared=<tripId>` link opens: just the generated app, full-screen,
 * with none of the builder chrome (no AI chat panel, no steps) — meant to
 * look like the real mobile/web app trip participants would use.
 */
export default function SharedAppPage({ tripData, theme }: { tripData: TripData; theme: Theme }) {
  return (
    <div className="min-h-screen bg-gray-200 flex justify-center" dir="rtl">
      <div className="w-full max-w-md min-h-screen bg-gray-50 shadow-2xl flex flex-col">
        <AppFrame
          tripData={tripData}
          theme={theme}
          chatDisabledHint="צ'אט AI יתווסף לאפליקציה בעדכון עתידי."
        />
      </div>
    </div>
  );
}
