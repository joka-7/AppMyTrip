import type { TranslationKey } from "./he";

// English translations. The `Record<TranslationKey, string>` type guarantees
// this file stays in sync with he.ts — a missing or misspelled key is a compile
// error.
export const en: Record<TranslationKey, string> = {
  // Document / navbar
  "document.title": "AI Trip Planner — AppMyTrip",
  "nav.title": "AI Trip Planner",
  "nav.step": "Step {step} of 4",
  "nav.preview": "Preview app",
  "lang.label": "Interface language",

  // Progress bar
  "progress.step1": "Enter text",
  "progress.step2": "Enhancements",
  "progress.step3": "Completion agent",
  "progress.step4": "App design",

  // Common
  "common.back": "Back",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.add": "Add",
  "common.delete": "Delete",

  // Step 1 — text input
  "step1.heading": "Let's start building. Tell me about the trip",
  "step1.subtitle": "Paste WhatsApp messages, summaries, or just jot down your ideas.",
  "step1.textareaPlaceholder": "For example: On Sunday we fly to London...",
  "step1.preferencesLabel": "Preferences (optional) — e.g. dairy, vegan, accessibility",
  "step1.preferencesPlaceholder": "For example: we want dairy food",
  "step1.continueWithoutReprocessing": "Continue editing (without re-analyzing)",
  "step1.processing": "The AI is analyzing the text...",
  "step1.hint.reading": "Reading the text you entered...",
  "step1.hint.structuring": "Breaking the trip into days...",
  "step1.hint.activities": "Identifying activities and times...",
  "step1.reprocess": "Re-analyze (replaces the existing trip)",
  "step1.submit": "Create initial app structure",
  "step1.external.heading": "Send to external AI",
  "step1.external.intro":
    "Ask a free AI app directly, paste its reply below, and we'll continue from there.",
  "step1.external.sendButton": "Send to external AI",
  "step1.external.sendToFavorite": "Send to {favorite}",
  "step1.external.tryAnother": "Try a different AI app",
  "step1.external.pasteLabel": "Paste the AI's reply here",
  "step1.external.pastePlaceholder": "Paste the JSON response here…",
  "step1.external.pasteApply": "Use this reply",
  "step1.external.invalidReply":
    "That doesn't look like a valid trip yet — check that you copied the whole reply (including the opening and closing braces) and try again.",
  "step1.exampleRawText":
    "Hi, we're flying to Rome the day after tomorrow until Sunday. On the first day we land, head to the hotel near the Spanish Steps and then explore the area. On the second day the Colosseum and the Forum, and lots of shopping. On the third day the Vatican. We also need to find places to eat.",

  // Step 2 — enhancements
  "step2.heading": "Additional enhancements (optional)",
  "step2.subtitle":
    "Each extra detail requires another call to the AI, so the time it takes depends on how many you pick. You can also skip and add these manually later from the itinerary.",
  "step2.selectAll": "Select all options",
  "step2.skip": "Skip, continue to agent",
  "step2.submitting": "Adding the details...",
  "step2.hint.fetching": "Gathering details from sources...",
  "step2.hint.enriching": "Merging enhancements into the itinerary...",
  "step2.hint.almost": "Almost ready...",
  "step2.submit": "Add the selected details",
  "step2.opt.directions_car": "Add driving directions",
  "step2.opt.directions_transit": "Add public-transit directions",
  "step2.opt.prices": "Add estimated prices",
  "step2.opt.podcast": "Add a historical podcast",
  "step2.opt.links": "Add links to attraction/transport sites",
  "step2.opt.packing": "Add a what-to-bring list for each day",
  "step2.opt.travel_mode": "Work out how you travel between stops",

  // Step 3 — completion agent
  "step3.heading": "AI Completion Agent",
  "step3.subtitle": "Our AI reviews the itinerary and makes sure you didn't forget anything.",
  "step3.datesLabel": "Trip dates",
  "step3.datesPlaceholder": "For example: July 12–19",
  "step3.generating": "Generating media (podcasts)...",
  "step3.continue": "Continue to app design",

  // Chat panel
  "chat.inputPlaceholder": "Reply to the agent (e.g. 'yes, add it')",
  "chat.send": "Send",
  "chat.askElsewhere": "Or ask directly:",
  "chat.askExternallyToggle": "Ask an external AI directly",
  "chat.askExternallyNeedsText": "Type a message first to send it to an external AI.",

  // Step 4 — design & deploy
  "step4.heading": "Final step: design your app",
  "step4.subtitle": "Choose colors, fonts and layout before sharing the app with trip members.",
  "step4.tripNameLabel": "Trip name",
  "step4.tripNamePlaceholder": "For example: Family trip to Rome",
  "step4.defaultTripName": "My trip",
  "step4.themeLabel": "Choose a theme color",
  "step4.shareValidityLabel": "Share-link validity",
  "step4.updateExisting": "Update the existing trip",
  "step4.saveAsNew": "Save as a new copy",
  "step4.deploying": "Deploying...",
  "step4.deploy": "Deploy to device! Save and share the trip",
  "step4.copied": "Copied!",
  "step4.copyFailed": "Copy to clipboard failed",
  "step4.copyLink": "Copy link",
  "step4.share": "Share",
  "step4.openLink": "Open link",
  "step4.deployError": "Something went wrong while saving and sharing. Try again in a moment.",
  "step4.deployHint":
    "Deploying saves the trip to your Google account (you'll be signed in if needed) and produces a link you can share with trip members.",
  "step4.sectionIdentity": "Identity",
  "step4.sectionLook": "Look & feel",
  "step4.sectionBehavior": "App behavior",
  "step4.organizerLabel": "Organizer / group name",
  "step4.organizerPlaceholder": "For example: The Cohen family",
  "step4.taglineLabel": "Short tagline",
  "step4.taglinePlaceholder": "For example: Pack light, eat well",
  "step4.albumLabel": "Photo album link",
  "step4.albumPlaceholder": "For example: Google Photos share link",
  "step4.currencyLabel": "Currency",
  "step4.fontLabel": "Font",
  "step4.font.sans": "Sans",
  "step4.font.rounded": "Rounded",
  "step4.font.serif": "Serif",
  "step4.densityLabel": "Text density",
  "step4.density.compact": "Compact",
  "step4.density.comfortable": "Comfortable",
  "step4.density.spacious": "Spacious",
  "step4.headerImageLabel": "Header image (URL)",
  "step4.headerImagePlaceholder": "For example: a landscape photo link",
  "step4.defaultTabLabel": "Opening tab",
  "step4.startDayLabel": "Starting day",
  "step4.visibleTabsLabel": "Visible tabs",
  "step4.welcomeLabel": "Welcome message (shown once)",
  "step4.welcomePlaceholder": "For example: Welcome to the trip! Changes are saved locally.",
  "step4.welcomeDismiss": "Got it",
  "step4.accentColorLabel": "Custom accent color",
  "step4.accentColorReset": "Reset to default color",
  "step4.headerStyleLabel": "Header style",
  "step4.headerStyle.solid": "Solid",
  "step4.headerStyle.gradient": "Gradient",
  "step4.headerStyle.photo": "Photo",
  "step4.backgroundTemplateLabel": "Background template",
  "step4.backgroundTemplate.plain": "Plain",
  "step4.backgroundTemplate.dots": "Dots",
  "step4.backgroundTemplate.grid": "Grid",
  "step4.backgroundTemplate.waves": "Waves",
  "step4.backgroundTemplate.warm": "Warm",
  "step4.backgroundTemplate.cool": "Cool",
  "step4.cardLayoutLabel": "Card layout",
  "step4.cardLayout.list": "List",
  "step4.cardLayout.timeline": "Timeline",
  "step4.cornerStyleLabel": "Corners",
  "step4.cornerStyle.rounded": "Rounded",
  "step4.cornerStyle.sharp": "Sharp",
  "step4.dateFormatLabel": "Date format",
  "step4.dateFormat.short": "As entered",
  "step4.dateFormat.numeric": "Numeric (day/month)",
  "step4.currencyCustom": "Other",
  "step4.currencyCustomPlaceholder": "For example: AED",
  "step4.tabOrderLabel": "Tab order",
  "step4.tabMoveUp": "Move up",
  "step4.tabMoveDown": "Move down",
  "step4.mapTileLabel": "Map style",
  "step4.mapTile.streets": "Streets",
  "step4.mapTile.satellite": "Satellite",
  "step4.showMapRoutes": "Show route lines on map",
  "step4.showPodcasts": "Show podcast buttons",
  "step4.sectionBranding": "Branding & install",
  "step4.pwaShortNameLabel": "Short install name",
  "step4.pwaShortNamePlaceholder": "For example: Rome 2026",
  "step4.pwaIconLabel": "App icon (URL)",
  "step4.pwaIconPlaceholder": "Link to a square image",

  // Share-link durations
  "share.days7": "7 days",
  "share.days30": "30 days",
  "share.days90": "90 days",
  "share.forever": "Forever",

  // Generated app frame
  "appFrame.titlePlaceholder": "Trip name",
  "appFrame.datesPlaceholder": "Date range",
  "appFrame.albumPlaceholder": "Photo album link (optional)",
  "appFrame.saveHeaderAria": "Save name and date range",
  "appFrame.cancelEditAria": "Cancel editing",
  "appFrame.editHeaderAria": "Edit name and date range",
  "appFrame.titleFallback": "Your app",
  "appFrame.datesFallback": "The preview updates based on the text",
  "appFrame.albumAria": "Trip photo album",
  "appFrame.localOnlyNotice":
    "Changes you make here are saved only in this browser and are not sent to the server.",
  "appFrame.scrollPrevAria": "Scroll to earlier days",
  "appFrame.scrollNextAria": "Scroll to later days",
  "appFrame.manageDaysAria": "Manage days",
  "appFrame.manageDaysHeading": "Reorder, add, or remove days",
  "appFrame.addDay": "Add day",
  "appFrame.moveDayToStartAria": "Move to first",
  "appFrame.moveDayEarlierAria": "Move earlier",
  "appFrame.moveDayLaterAria": "Move later",
  "appFrame.moveDayToEndAria": "Move to last",
  "appFrame.deleteDayAria": "Delete day",
  "appFrame.madeWith": "Made with AppMyTrip — plan your own trip app",
  "appFrame.day": "Day {num}",
  "appFrame.emptyState": "Enter the trip description to see a live preview of the app here.",
  "appFrame.tab.itinerary": "Itinerary",
  "appFrame.tab.map": "Map",
  "appFrame.tab.price": "Pricing",
  "appFrame.tab.chat": "AI Chat",
  "appFrame.tab.checklist": "What to bring",

  // "What we need" checklist
  "checklist.tripWide": "For the whole trip",
  "checklist.dayHeading": "Day {num}",
  "checklist.empty": "Nothing here yet. Add what you need to bring, or ask the AI to suggest some.",
  "checklist.addPlaceholder": "What do you need?",
  "checklist.add": "Add",
  "checklist.addAria": "Add an item to the list",
  "checklist.editAria": "Edit the item {text}",
  "checklist.deleteAria": "Delete the item {text}",
  "checklist.showAllDays": "Show every day",
  "checklist.showThisDay": "Show only the current day",
  "checklist.suggest": "AI suggestions",
  "checklist.suggesting": "Preparing suggestions…",
  "checklist.suggestFailed": "Couldn't fetch suggestions. Please try again.",
  "checklist.packed": "{done} of {total} packed",

  // Travel modes
  "travelMode.driving": "Driving",
  "travelMode.transit": "Public transit",
  "travelMode.bicycling": "Cycling",
  "travelMode.walking": "Walking",
  "travelMode.hiking": "Hiking",
  "travelMode.auto": "Detect automatically",
  "travelMode.label": "How you get there",

  // Itinerary list
  "itinerary.priceLabel": "Price",
  "itinerary.urlLabel": "Website link",
  "itinerary.notSaved": "Not saved to server",
  "itinerary.addPrice": "Add price",
  "itinerary.playingNow": "Now playing...",
  "itinerary.historicalPodcast": "Historical podcast",
  "itinerary.activityNamePlaceholder": "Activity name",
  "itinerary.activityDescPlaceholder": "Short description",
  "itinerary.addActivity": "Add an activity to this day",
  "itinerary.urlAria": "Link to the activity's website",
  "itinerary.showOnMapAria": "Show the activity on the map",
  "itinerary.mapUrlLabel": "Google Maps link",
  "itinerary.mapUrlHint": "Paste a link if the map pin is wrong",
  "itinerary.mapUrlPinUpdated": "Map pin updated from the link",
  "itinerary.mapUrlNoCoords": "The link will be saved, but the map pin can't be updated from it",
  "itinerary.openInMapsAria": "Open the location in Google Maps",
  "itinerary.directionsAria": "Directions from the previous stop ({mode})",
  "itinerary.wazeAria": "Navigate to {title} in Waze",
  "itinerary.waze": "Waze",
  "itinerary.editAria": "Edit activity",
  "itinerary.deleteAria": "Delete activity",
  "itinerary.editPriceAria": "Edit price",

  // Activity type labels
  "activityType.attraction": "Attraction",
  "activityType.food": "Food",
  "activityType.lodging": "Lodging",
  "activityType.transport": "Transport",

  // Location picker
  "locationPicker.set": "Click the map to change the location, or drag the marker",
  "locationPicker.unset":
    "Click the map to pick an exact location, or leave empty for automatic lookup",
  "locationPicker.clear": "Clear location",

  // Map view
  "map.noCoords": "No coordinates to show on the map for this day.",
  "map.backToFullDay": "Back to the full day map",
  "map.openInGoogleMaps": "Open in Google Maps",
  "map.openInWaze": "Navigate in Waze",
  "map.clickToAdd": "Click the map to add a new activity at this location",

  // Price summary
  "price.empty": "No prices entered yet. You can add a price to each activity from the itinerary.",
  "price.byCategory": "Breakdown by category",
  "price.total": "Trip total",

  // Podcast player
  "podcast.listeningNow": "Now listening...",

  // API key menu
  "apiKey.setKey": "Set API key",
  "apiKey.configured": "API key set",
  "apiKey.configuredCount": "API key set ({count})",
  "apiKey.heading": "Your own API keys",
  "apiKey.descriptionBefore": "Choose a provider and paste your own API key — free at ",
  "apiKey.descriptionAfter":
    ". You can add several keys; when one hits its rate limit we switch to the next automatically. Everything is stored only in your browser.",
  "apiKey.trustNote":
    "Each key is sent with your requests to this app's own backend (never to a third party), only to be forwarded to the provider you picked — it's never stored on the server or logged in full.",
  "apiKey.removeAria": "Remove key {key}",
  "apiKey.showAria": "Show the key",
  "apiKey.hideAria": "Hide the key",
  "apiKey.addKey": "Add key",
  "apiKey.close": "Close",
  "apiKey.inputPlaceholder": "API Key...",
  "apiKey.primaryNote": "This provider is tried first on every request.",
  "apiKey.makePrimary": "Make this the primary provider",
  "apiKey.backendLabel": "Server engine",
  "apiKey.backendLegacy": "Standard",
  "apiKey.backendModelDispatcher": "Model Dispatcher (shared)",
  "apiKey.backendNote":
    "Advanced/testing setting — if the server hasn't set up Model Dispatcher, the request just falls back to the standard behavior.",
  "apiKey.modeApiKey": "API key",
  "apiKey.modeExternal": "External AI",
  "apiKey.externalDescription":
    "Skip API keys entirely — Step 1 gives you a link to a free AI app with your text ready to paste in, and you paste its reply back.",
  "apiKey.favoriteHeading": "Favorite AI app",
  "apiKey.favoriteNone": "Ask me each time",
  "apiKey.favoriteHint":
    "We'll jump straight to this app with one click in Step 1; the other options stay available too.",

  // Settings menu (⋮ overflow button)
  "settingsMenu.button": "Settings",
  "settingsMenu.language": "Language",
  "settingsMenu.fileActions": "File",

  // Cloud menu (sign-in, save, share, my trips)
  "cloud.importSuccess": "The trip was imported from the file.",
  "cloud.importFailed": "Importing the file failed.",
  "cloud.signInFailed": "Signing in with Google failed. Please try again.",
  "cloud.saved": "The trip was saved to your account.",
  "cloud.saveFailed": "Saving the trip failed.",
  "cloud.shareBeforeSave": "Save the trip before sharing it.",
  "cloud.shareCopied": "The share link was copied to the clipboard.",
  "cloud.shareCopyFailed":
    "The share link was created, but copying it to the clipboard failed — you can copy it manually below.",
  "cloud.shareFailed": "Sharing the trip failed.",
  "cloud.loadFailed": "Loading the trip failed.",
  "cloud.deleteFailed": "Deleting the trip failed.",
  "cloud.deleteAria": "Delete trip {name}",
  "cloud.deleteConfirmAria": "Confirm delete trip {name}",
  "cloud.deleteConfirm": "Delete?",
  "cloud.export": "Export",
  "cloud.exportIcs": "Export calendar",
  "cloud.print": "Print",
  "cloud.exportPdf": "Download PDF",
  "cloud.exportPdfFailed": "Creating the PDF failed.",
  "cloud.import": "Import",
  "cloud.signingIn": "Signing in...",
  "cloud.signIn": "Sign in with Google",
  "cloud.shareValidity": "Share-link validity:",
  "cloud.share": "Share",
  "cloud.saveAsLabel": "Save as:",
  "cloud.stage.step1": "Step 1",
  "cloud.stage.step2": "Step 2",
  "cloud.stage.step3": "Step 3",
  "cloud.stage.step4": "Step 4",
  "cloud.stage.final": "Final app",
  "cloud.myTrips": "My trips",
  "cloud.noTrips": "No saved trips yet.",
  "cloud.signOut": "Sign out",

  // Install app button
  "install.button": "Install the app",
  "install.iosTitle": "Install as an app on iPhone/iPad",
  "install.iosStep1": "Tap the Share button in Safari's toolbar",
  "install.iosStep2": 'Choose "Add to Home Screen"',

  // Error boundary
  "errorBoundary.title": "Something went wrong",
  "errorBoundary.subtitle":
    "An unexpected error occurred and the app stopped. Refreshing the page usually fixes it.",
  "errorBoundary.reload": "Refresh the page",
  "errorBoundary.details": "Technical details (for reporting)",

  // Shared trip page
  "sharedPage.settings": "Settings",
  "sharedPage.settingsAria": "Trip settings",
  "sharedPage.myTripsAria": "Go to My Trips",
  "sharedPage.export": "Export to file",
  "sharedPage.exportIcs": "Export calendar (.ics)",
  "sharedPage.print": "Print itinerary",
  "sharedPage.exportPdf": "Download PDF",
  "sharedPage.exportPdfFailed": "Creating the PDF failed.",
  "sharedPage.import": "Import from file",
  "sharedPage.saving": "Saving...",
  "sharedPage.saveToAccount": "Save to my account",
  "sharedPage.savedNotice": 'Saved to your account! You can find it under "My trips".',
  "sharedPage.saveFailed": "Saving to your account failed. Please try again.",
  "sharedPage.localOnlyNotice":
    "Changes you make here (including via chat) are saved only in this browser and are not sent to the server.",
  "sharedPage.adminHint":
    "You're an admin of this trip — you can save changes here, or add another admin by email.",
  "sharedPage.saveChanges": "Save changes",
  "sharedPage.saveChangesDone": "Changes saved to this link.",
  "sharedPage.saveChangesFailed": "Saving changes failed. Please try again.",
  "sharedPage.addAdminPlaceholder": "Add an admin by email...",
  "sharedPage.addAdmin": "Add admin",
  "sharedPage.addAdminDone": "Added — they can now save changes to this link too.",
  "sharedPage.addAdminFailed": "Adding that admin failed. Please try again.",
  "sharedPage.shareNewLink": "Share new link",
  "sharedPage.newLinkCopied": "A new link with your changes was copied to the clipboard.",
  "sharedPage.newLinkCopyFailed":
    "A new link was created, but copying it to the clipboard failed — you can copy it manually below.",
  "sharedPage.newLinkFailed": "Creating a new link failed. Please try again.",

  // Trip file import/export
  "tripFile.readFailed": "Reading the file failed.",
  "tripFile.invalid": "The file is not a valid trip.",

  // Podcast (browser TTS) errors
  "podcastPlayer.noTTS": "This browser doesn't support text-to-speech.",
  "podcastPlayer.ttsFailed":
    "Reading the podcast aloud failed. This browser may not have a suitable voice.",

  // Builder draft recovery (localStorage)
  "draft.recoverPrompt": "A saved draft from last time was found — restore it?",
  "draft.restore": "Restore draft",

  // Language indicator (agent reply language)
  "languageIndicator.explainer":
    "The agent's reply language is set by the dominant language of the trip text you entered, and updates automatically if you write to it in another language.",

  // API error explanations (App.tsx describeApiError)
  "apiError.rateLimited":
    "The AI provider is rate-limiting requests right now — try again in a minute, or add your own API key in settings to avoid a shared limit.",
  "apiError.noKey":
    "No AI API key is configured. Add your own key in settings (the 'Set API key' button).",
  "apiError.tooLarge":
    "The request is too large for the AI. Try splitting it into shorter requests.",
  "apiError.invalidResponse":
    "The response received from the AI wasn't valid. Try rephrasing the request or trying again.",
  "apiError.truncated":
    "The AI's response looked like it deleted most of the itinerary, so we kept it as it was. Try again, or split the request into smaller steps.",
  "apiError.providerDown":
    "The AI provider couldn't respond right now (a temporary service issue). Try again in a moment.",
  "apiError.technicalDetailLabel": "Technical detail:",

  // App-level notices & agent messages
  "notice.rateLimitedDemo":
    "The AI provider is rate-limiting requests right now — try again in a minute. In the meantime, a sample trip was loaded.",
  "notice.unreachableDemo": "We couldn't connect to the AI server — a sample trip was loaded.",
  "notice.enhanceFailed":
    "Adding the extra details failed — continuing with the current itinerary.",
  "notice.retry": "Retry",
  "notice.updateFailed": "The update failed — the itinerary didn't change.",
  "notice.mediaFailed": "Generating media on the server failed — continuing without audio files.",
  "agent.initial": "I recognized the trip! Go over the itinerary and fix anything you need.",
  "agent.demo":
    "I loaded a sample trip so you can see how the app works. To parse real text, set your own Gemini API key (the 'Set API key' button above) — or keep editing manually.",
  "agent.loaded": "The trip was loaded. You can keep editing.",
  "agent.imported": "The trip was imported from a file. You can keep editing.",
  "agent.sharedIntro":
    "Send a message to change the itinerary — changes here stay only in your browser.",
  "shared.expired": "This share link has expired.",
  "shared.loadFailed": "Loading the shared trip failed. The link may be wrong or the trip removed.",
  "shared.loading": "Loading the trip...",

  // Offline demo trip (shown when the backend is unreachable)
  "demo.title": "Sample trip ✨",
  "demo.dates": "Sun – Tue",
  "demo.d1a1.title": "Hotel check-in",
  "demo.d1a1.desc": "Drop off luggage and settle in.",
  "demo.d1a2.title": "Central historic site",
  "demo.d1a2.desc": "A tour through the heart of the old town.",
  "demo.d1a3.title": "Local restaurant",
  "demo.d1a3.desc": "Lunch in the city center.",
  "demo.d2a1.title": "City museum",
  "demo.d2a1.desc": "Permanent collection and a rotating exhibition.",
  "demo.d2a2.title": "Local market",
  "demo.d2a2.desc": "Shopping and street-food tasting.",
};
