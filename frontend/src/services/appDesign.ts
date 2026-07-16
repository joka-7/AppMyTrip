import type { Theme } from "../components/ThemeSelector";

export type AppFont = "sans" | "rounded" | "serif";
export type AppDensity = "compact" | "comfortable" | "spacious";
export type AppTab = "itinerary" | "map" | "price" | "chat";

export const CURRENCIES = ["₪", "$", "€", "£"] as const;

export interface VisibleTabs {
  itinerary: boolean;
  map: boolean;
  price: boolean;
  chat: boolean;
}

export interface AppDesign {
  theme: Theme;
  font: AppFont;
  density: AppDensity;
  headerImageUrl: string | null;
  currency: string;
  organizerName: string;
  tagline: string;
  welcomeMessage: string;
  defaultTab: AppTab;
  startDay: number;
  visibleTabs: VisibleTabs;
}

export const DEFAULT_VISIBLE_TABS: VisibleTabs = {
  itinerary: true,
  map: true,
  price: true,
  chat: true,
};

export const DEFAULT_APP_DESIGN: AppDesign = {
  theme: "blue",
  font: "sans",
  density: "comfortable",
  headerImageUrl: null,
  currency: "₪",
  organizerName: "",
  tagline: "",
  welcomeMessage: "",
  defaultTab: "itinerary",
  startDay: 1,
  visibleTabs: DEFAULT_VISIBLE_TABS,
};

const TAB_ORDER: AppTab[] = ["itinerary", "map", "price", "chat"];

/** Resolves a tab that is actually shown, falling back when the preferred tab is hidden. */
export function resolveDefaultTab(
  preferred: AppTab,
  visibleTabs: VisibleTabs,
): AppTab {
  if (visibleTabs[preferred]) return preferred;
  return TAB_ORDER.find((tab) => visibleTabs[tab]) ?? "itinerary";
}

/** Merges partial/legacy Firestore or file payloads into a full AppDesign. */
export function normalizeAppDesign(
  raw?: Partial<AppDesign> | null,
  legacyTheme?: Theme,
): AppDesign {
  if (!raw) {
    return legacyTheme ? { ...DEFAULT_APP_DESIGN, theme: legacyTheme } : DEFAULT_APP_DESIGN;
  }
  return {
    ...DEFAULT_APP_DESIGN,
    ...raw,
    theme: raw.theme ?? legacyTheme ?? DEFAULT_APP_DESIGN.theme,
    visibleTabs: { ...DEFAULT_VISIBLE_TABS, ...raw.visibleTabs },
  };
}

export const FONT_CLASSES: Record<AppFont, string> = {
  sans: "font-sans",
  rounded: "font-rounded",
  serif: "font-serif",
};

/** Density tokens consumed by AppFrame and ItineraryList. */
export const DENSITY_CLASSES: Record<
  AppDensity,
  { headerTitle: string; headerSub: string; contentPad: string; navLabel: string; cardPad: string }
> = {
  compact: {
    headerTitle: "text-lg",
    headerSub: "text-xs",
    contentPad: "p-3",
    navLabel: "text-[9px]",
    cardPad: "p-3",
  },
  comfortable: {
    headerTitle: "text-xl",
    headerSub: "text-sm",
    contentPad: "p-4",
    navLabel: "text-[10px]",
    cardPad: "p-4",
  },
  spacious: {
    headerTitle: "text-2xl",
    headerSub: "text-base",
    contentPad: "p-5",
    navLabel: "text-xs",
    cardPad: "p-5",
  },
};
