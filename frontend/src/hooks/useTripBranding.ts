import { useEffect } from "react";
import type { AppDesign } from "../services/appDesign";
import { safeUrl } from "../services/safeUrl";

/** Applies trip-specific PWA/document branding when viewing a shared trip. */
export function useTripBranding(appDesign: AppDesign, tripTitle: string) {
  useEffect(() => {
    const shortName = appDesign.pwaShortName.trim() || tripTitle.trim() || "AppMyTrip";
    const prevTitle = document.title;
    document.title = shortName;

    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    const prevAppleTitle = appleTitle?.getAttribute("content") ?? null;
    appleTitle?.setAttribute("content", shortName.slice(0, 12));

    let iconLink: HTMLLinkElement | null = null;
    const iconUrl = safeUrl(appDesign.pwaIconUrl);
    if (iconUrl) {
      iconLink = document.createElement("link");
      iconLink.rel = "icon";
      iconLink.href = iconUrl;
      document.head.appendChild(iconLink);
    }

    return () => {
      document.title = prevTitle;
      if (prevAppleTitle !== null) appleTitle?.setAttribute("content", prevAppleTitle);
      iconLink?.remove();
    };
  }, [appDesign.pwaShortName, appDesign.pwaIconUrl, tripTitle]);
}
