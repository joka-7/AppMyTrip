import { safeUrl } from "./safeUrl";

export type Theme = "blue" | "green" | "dark" | "coral" | "purple" | "sand";

export type AppFont = "sans" | "rounded" | "serif";
export type AppDensity = "compact" | "comfortable" | "spacious";
export type AppTab = "itinerary" | "checklist" | "map" | "price" | "chat";
export type HeaderStyle = "solid" | "gradient" | "photo";
export type CardLayout = "list" | "timeline";
export type CornerStyle = "rounded" | "sharp";
export type MapTileStyle = "streets" | "satellite";
export type DateFormatStyle = "short" | "numeric";
export type BackgroundTemplate = "plain" | "dots" | "grid" | "waves" | "warm" | "cool";

export const CURRENCIES = ["₪", "$", "€", "£", "¥", "CHF"] as const;
export const CUSTOM_CURRENCY = "__custom__";

export interface VisibleTabs {
  itinerary: boolean;
  checklist: boolean;
  map: boolean;
  price: boolean;
  chat: boolean;
}

export interface AppDesign {
  theme: Theme;
  customAccentColor: string | null;
  font: AppFont;
  density: AppDensity;
  headerStyle: HeaderStyle;
  headerImageUrl: string | null;
  backgroundTemplate: BackgroundTemplate;
  cardLayout: CardLayout;
  cornerStyle: CornerStyle;
  currency: string;
  customCurrency: string;
  organizerName: string;
  tagline: string;
  dateFormat: DateFormatStyle;
  welcomeMessage: string;
  defaultTab: AppTab;
  startDay: number;
  visibleTabs: VisibleTabs;
  tabOrder: AppTab[];
  mapTileStyle: MapTileStyle;
  showMapRoutes: boolean;
  showPodcasts: boolean;
  pwaShortName: string;
  pwaIconUrl: string | null;
}

export const DEFAULT_TAB_ORDER: AppTab[] = ["itinerary", "checklist", "map", "price", "chat"];

export const DEFAULT_VISIBLE_TABS: VisibleTabs = {
  itinerary: true,
  checklist: true,
  map: true,
  price: true,
  chat: true,
};

export const THEME_ACCENT_HEX: Record<Theme, string> = {
  blue: "#1a5276",
  green: "#047857",
  dark: "#12344d",
  coral: "#c45c4a",
  purple: "#6d28d9",
  sand: "#b8860b",
};

export const THEME_ACCENT_DARK: Record<Theme, string> = {
  blue: "#003b5a",
  green: "#065f46",
  dark: "#0a2233",
  coral: "#9a3d2e",
  purple: "#5b21b6",
  sand: "#8b6914",
};

export const THEME_SWATCH_CLASSES: Record<Theme, { bg: string; ring: string }> = {
  blue: { bg: "bg-primary", ring: "ring-primary-light" },
  green: { bg: "bg-emerald-700", ring: "ring-emerald-200" },
  dark: { bg: "bg-[#12344d]", ring: "ring-slate-300" },
  coral: { bg: "bg-[#c45c4a]", ring: "ring-orange-200" },
  purple: { bg: "bg-violet-700", ring: "ring-violet-200" },
  sand: { bg: "bg-[#c9a227]", ring: "ring-amber-200" },
};

export const DEFAULT_APP_DESIGN: AppDesign = {
  theme: "blue",
  customAccentColor: null,
  font: "sans",
  density: "comfortable",
  headerStyle: "solid",
  headerImageUrl: null,
  backgroundTemplate: "plain",
  cardLayout: "list",
  cornerStyle: "rounded",
  currency: "₪",
  customCurrency: "",
  organizerName: "",
  tagline: "",
  dateFormat: "short",
  welcomeMessage: "",
  defaultTab: "itinerary",
  startDay: 1,
  visibleTabs: DEFAULT_VISIBLE_TABS,
  tabOrder: DEFAULT_TAB_ORDER,
  mapTileStyle: "streets",
  showMapRoutes: true,
  showPodcasts: true,
  pwaShortName: "",
  pwaIconUrl: null,
};

const TAB_ORDER: AppTab[] = DEFAULT_TAB_ORDER;

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function resolveAccentColor(design: AppDesign): string {
  if (design.customAccentColor && HEX_RE.test(design.customAccentColor)) {
    return design.customAccentColor;
  }
  return THEME_ACCENT_HEX[design.theme] ?? THEME_ACCENT_HEX.blue;
}

export function resolveAccentDark(design: AppDesign): string {
  if (design.customAccentColor && HEX_RE.test(design.customAccentColor)) {
    return design.customAccentColor;
  }
  return THEME_ACCENT_DARK[design.theme] ?? THEME_ACCENT_DARK.blue;
}

export function effectiveCurrency(design: AppDesign): string {
  if (design.currency === CUSTOM_CURRENCY) {
    return design.customCurrency.trim() || "₪";
  }
  return design.currency || "₪";
}

export function normalizeTabOrder(order?: AppTab[] | null): AppTab[] {
  if (!order?.length) return [...DEFAULT_TAB_ORDER];
  const seen = new Set<AppTab>();
  const result: AppTab[] = [];
  for (const tab of order) {
    if (TAB_ORDER.includes(tab) && !seen.has(tab)) {
      seen.add(tab);
      result.push(tab);
    }
  }
  for (const tab of TAB_ORDER) {
    if (!seen.has(tab)) result.push(tab);
  }
  return result;
}

export function resolveDefaultTab(preferred: AppTab, visibleTabs: VisibleTabs): AppTab {
  if (visibleTabs[preferred]) return preferred;
  return TAB_ORDER.find((tab) => visibleTabs[tab]) ?? "itinerary";
}

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
    tabOrder: normalizeTabOrder(raw.tabOrder),
  };
}

export const FONT_CLASSES: Record<AppFont, string> = {
  sans: "font-sans",
  rounded: "font-rounded",
  serif: "font-serif",
};

export const BACKGROUND_TEMPLATE_CLASSES: Record<BackgroundTemplate, string> = {
  plain: "bg-surface",
  dots: "bg-template-dots",
  grid: "bg-template-grid",
  waves: "bg-template-waves",
  warm: "bg-template-warm",
  cool: "bg-template-cool",
};

export const CORNER_CARD_CLASSES: Record<CornerStyle, string> = {
  rounded: "rounded-xl",
  sharp: "rounded-none",
};

export const MAP_TILE_URLS: Record<MapTileStyle, { url: string; attribution: string }> = {
  streets: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
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

export function headerBackgroundStyle(design: AppDesign): Record<string, string> | undefined {
  const accent = resolveAccentColor(design);
  const accentDark = resolveAccentDark(design);
  const headerImageUrl = design.headerStyle === "photo" ? safeUrl(design.headerImageUrl) : null;
  if (headerImageUrl) {
    return {
      backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${headerImageUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (design.headerStyle === "gradient") {
    return {
      background: `linear-gradient(135deg, ${accent} 0%, ${accentDark} 100%)`,
    };
  }
  if (design.customAccentColor && HEX_RE.test(design.customAccentColor)) {
    return { backgroundColor: accent };
  }
  return undefined;
}

export function formatTripDates(dates: string, format: DateFormatStyle): string {
  const text = dates.trim();
  if (!text || format === "short") return text;
  const isoRange = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*[-–]\s*(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoRange) {
    const [, , m1, d1, , m2, d2] = isoRange;
    const pad = (n: string) => n.padStart(2, "0");
    return `${pad(d1)}/${pad(m1)} – ${pad(d2)}/${pad(m2)}`;
  }
  const dmyRange = text.match(
    /(\d{1,2})[./](\d{1,2})[./](\d{4})\s*[-–]\s*(\d{1,2})[./](\d{1,2})[./](\d{4})/,
  );
  if (dmyRange) return text;
  return text;
}

export function themeClassForDesign(design: AppDesign): string {
  if (design.customAccentColor && HEX_RE.test(design.customAccentColor)) return "";
  // Must agree with headerBackgroundStyle's own safeUrl() check — an unsafe
  // headerImageUrl means no custom background is actually applied there, so
  // this needs to fall through to the normal theme class too, not leave the
  // header with neither.
  if (design.headerStyle === "photo" && safeUrl(design.headerImageUrl)) return "";
  if (design.headerStyle === "gradient") return "";
  const swatch = THEME_SWATCH_CLASSES[design.theme];
  return swatch?.bg ?? THEME_SWATCH_CLASSES.blue.bg;
}
