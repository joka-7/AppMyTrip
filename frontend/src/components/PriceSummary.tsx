import type { TripData } from "../api";

function formatPrice(value: number): string {
  return value.toLocaleString("he-IL", { maximumFractionDigits: 2 });
}

export default function PriceSummary({ tripData }: { tripData: TripData }) {
  const days = tripData.days ?? [];
  const grandTotal = days.reduce(
    (sum, day) => sum + day.activities.reduce((s, act) => s + (act.price ?? 0), 0),
    0,
  );

  if (days.every((day) => day.activities.every((act) => act.price == null))) {
    return (
      <div className="h-full flex items-center justify-center text-center text-gray-400 text-sm px-6">
        עדיין לא הוזנו מחירים. ניתן להוסיף מחיר לכל פעילות מתוך לוח הזמנים.
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {days.map((day) => {
        const dayTotal = day.activities.reduce((s, act) => s + (act.price ?? 0), 0);
        return (
          <div
            key={day.dayNum}
            className="bg-white p-4 rounded-xl shadow-sm border border-gray-100"
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-gray-800">יום {day.dayNum}</h4>
              <span className="text-sm font-semibold text-gray-700">
                {formatPrice(dayTotal)} ₪
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {day.activities.map((act) => (
                <div
                  key={act.id}
                  className="flex items-center justify-between py-1.5 text-sm text-gray-600"
                >
                  <span className="truncate">{act.title}</span>
                  <span className="shrink-0 ms-2">
                    {act.price != null ? `${formatPrice(act.price)} ₪` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="bg-blue-600 text-white p-4 rounded-xl shadow-sm flex items-center justify-between">
        <span className="font-bold">סה"כ לטיול</span>
        <span className="font-bold text-lg">{formatPrice(grandTotal)} ₪</span>
      </div>
    </div>
  );
}
