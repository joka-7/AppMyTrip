import type { TripData } from "../api";
import AppFrame from "./AppFrame";
import type { Theme } from "./ThemeSelector";

export default function PhonePreview({ tripData, theme }: { tripData: TripData; theme: Theme }) {
  return (
    <div className="w-[350px] h-[700px] border-[12px] border-gray-900 rounded-[2.5rem] overflow-hidden flex flex-col bg-gray-50 shadow-2xl relative mx-auto">
      <AppFrame
        tripData={tripData}
        theme={theme}
        chatDisabledHint="תכונה זו תהיה זמינה באפליקציה הסופית — בשלב הבנייה משתמשים בסוכן ה-AI שמשמאל"
      />
    </div>
  );
}
