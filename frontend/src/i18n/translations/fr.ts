import type { TranslationKey } from "./he";

// French translations. The `Record<TranslationKey, string>` type guarantees
// this file stays in sync with he.ts.
export const fr: Record<TranslationKey, string> = {
  // Document / navbar
  "document.title": "Planificateur de voyage IA — AppMyTrip",
  "nav.title": "Planificateur de voyage IA",
  "nav.step": "Étape {step} sur 4",
  "nav.preview": "Aperçu de l'application",
  "lang.label": "Langue de l'interface",

  // Progress bar
  "progress.step1": "Saisir le texte",
  "progress.step2": "Améliorations",
  "progress.step3": "Agent de complétion",
  "progress.step4": "Design de l'app",

  // Common
  "common.back": "Retour",
  "common.save": "Enregistrer",
  "common.cancel": "Annuler",
  "common.add": "Ajouter",
  "common.delete": "Supprimer",

  // Step 1 — text input
  "step1.heading": "Commençons à construire. Parlez-moi du voyage",
  "step1.subtitle": "Collez des messages WhatsApp, des résumés, ou notez simplement vos idées.",
  "step1.textareaPlaceholder": "Par exemple : dimanche, nous partons pour Londres...",
  "step1.preferencesLabel": "Préférences (facultatif) — ex. lacté, végétalien, accessibilité",
  "step1.preferencesPlaceholder": "Par exemple : nous voulons de la nourriture lactée",
  "step1.continueWithoutReprocessing": "Continuer l'édition (sans réanalyser)",
  "step1.processing": "L'IA analyse le texte...",
  "step1.hint.reading": "Lecture du texte saisi...",
  "step1.hint.structuring": "Découpage du voyage en jours...",
  "step1.hint.activities": "Identification des activités et horaires...",
  "step1.reprocess": "Réanalyser (remplace le voyage existant)",
  "step1.submit": "Créer la structure initiale de l'app",
  "step1.exampleRawText":
    "Salut, nous partons pour Rome après-demain jusqu'à dimanche. Le premier jour, nous atterrissons, allons à l'hôtel près de la place d'Espagne, puis nous explorons le quartier. Le deuxième jour, le Colisée et le Forum, et beaucoup de shopping. Le troisième jour, le Vatican. Il faut aussi trouver où manger.",

  // Step 2 — enhancements
  "step2.heading": "Améliorations supplémentaires (facultatif)",
  "step2.subtitle":
    "Chaque détail supplémentaire nécessite un nouvel appel à l'IA ; le temps requis dépend donc du nombre que vous choisissez. Vous pouvez aussi passer et les ajouter manuellement plus tard depuis l'itinéraire.",
  "step2.selectAll": "Tout sélectionner",
  "step2.skip": "Passer, continuer vers l'agent",
  "step2.submitting": "Ajout des détails...",
  "step2.hint.fetching": "Collecte des détails depuis les sources...",
  "step2.hint.enriching": "Intégration des améliorations dans l'itinéraire...",
  "step2.hint.almost": "Presque prêt...",
  "step2.submit": "Ajouter les détails sélectionnés",
  "step2.opt.directions_car": "Ajouter l'itinéraire en voiture",
  "step2.opt.directions_transit": "Ajouter l'itinéraire en transports en commun",
  "step2.opt.prices": "Ajouter des prix estimés",
  "step2.opt.podcast": "Ajouter un podcast historique",
  "step2.opt.links": "Ajouter des liens vers les sites des attractions/transports",

  // Step 3 — completion agent
  "step3.heading": "Agent de complétion IA",
  "step3.subtitle": "Notre IA parcourt l'itinéraire et s'assure que vous n'avez rien oublié.",
  "step3.datesLabel": "Dates du voyage",
  "step3.datesPlaceholder": "Par exemple : 12–19 juillet",
  "step3.generating": "Génération des médias (podcasts)...",
  "step3.continue": "Continuer vers le design de l'app",

  // Chat panel
  "chat.inputPlaceholder": "Répondez à l'agent (ex. « oui, ajoute-le »)",
  "chat.send": "Envoyer",

  // Step 4 — design & deploy
  "step4.heading": "Dernière étape : concevez votre app",
  "step4.subtitle":
    "Choisissez les couleurs, les polices et la mise en page avant de partager l'app avec les participants.",
  "step4.tripNameLabel": "Nom du voyage",
  "step4.tripNamePlaceholder": "Par exemple : Voyage à Rome en famille",
  "step4.defaultTripName": "Mon voyage",
  "step4.themeLabel": "Choisir une couleur de thème",
  "step4.shareValidityLabel": "Validité du lien de partage",
  "step4.updateExisting": "Mettre à jour le voyage existant",
  "step4.saveAsNew": "Enregistrer comme nouvelle copie",
  "step4.deploying": "Déploiement...",
  "step4.deploy": "Déployer sur l'appareil ! Enregistrez et partagez le voyage",
  "step4.copied": "Copié !",
  "step4.copyFailed": "La copie dans le presse-papiers a échoué",
  "step4.copyLink": "Copier le lien",
  "step4.openLink": "Ouvrir le lien",
  "step4.deployError":
    "Un problème est survenu lors de l'enregistrement et du partage. Réessayez dans un instant.",
  "step4.deployHint":
    "Le déploiement enregistre le voyage sur votre compte Google (connexion si nécessaire) et produit un lien à partager avec les participants.",
  "step4.sectionIdentity": "Identité",
  "step4.sectionLook": "Apparence",
  "step4.sectionBehavior": "Comportement de l'app",
  "step4.organizerLabel": "Nom de l'organisateur / du groupe",
  "step4.organizerPlaceholder": "Par exemple : La famille Cohen",
  "step4.taglineLabel": "Slogan court",
  "step4.taglinePlaceholder": "Par exemple : Voyagez léger, mangez bien",
  "step4.albumLabel": "Lien vers l'album photo",
  "step4.albumPlaceholder": "Par exemple : lien Google Photos",
  "step4.currencyLabel": "Devise",
  "step4.fontLabel": "Police",
  "step4.font.sans": "Sans serif",
  "step4.font.rounded": "Arrondie",
  "step4.font.serif": "Serif",
  "step4.densityLabel": "Densité du texte",
  "step4.density.compact": "Compacte",
  "step4.density.comfortable": "Confortable",
  "step4.density.spacious": "Aérée",
  "step4.headerImageLabel": "Image d'en-tête (URL)",
  "step4.headerImagePlaceholder": "Par exemple : lien vers une photo de paysage",
  "step4.defaultTabLabel": "Onglet d'ouverture",
  "step4.startDayLabel": "Jour de départ",
  "step4.visibleTabsLabel": "Onglets visibles",
  "step4.welcomeLabel": "Message de bienvenue (affiché une fois)",
  "step4.welcomePlaceholder":
    "Par exemple : Bienvenue dans le voyage ! Les modifications sont enregistrées localement.",
  "step4.welcomeDismiss": "Compris",
  "step4.accentColorLabel": "Couleur d'accent personnalisée",
  "step4.accentColorReset": "Réinitialiser la couleur par défaut",
  "step4.headerStyleLabel": "Style d'en-tête",
  "step4.headerStyle.solid": "Uni",
  "step4.headerStyle.gradient": "Dégradé",
  "step4.headerStyle.photo": "Photo",
  "step4.backgroundTemplateLabel": "Modèle d'arrière-plan",
  "step4.backgroundTemplate.plain": "Simple",
  "step4.backgroundTemplate.dots": "Points",
  "step4.backgroundTemplate.grid": "Grille",
  "step4.backgroundTemplate.waves": "Vagues",
  "step4.backgroundTemplate.warm": "Chaud",
  "step4.backgroundTemplate.cool": "Froid",
  "step4.cardLayoutLabel": "Disposition des cartes",
  "step4.cardLayout.list": "Liste",
  "step4.cardLayout.timeline": "Chronologie",
  "step4.cornerStyleLabel": "Coins",
  "step4.cornerStyle.rounded": "Arrondis",
  "step4.cornerStyle.sharp": "Carrés",
  "step4.dateFormatLabel": "Format des dates",
  "step4.dateFormat.short": "Tel que saisi",
  "step4.dateFormat.numeric": "Numérique (jour/mois)",
  "step4.currencyCustom": "Autre",
  "step4.currencyCustomPlaceholder": "Par exemple : AED",
  "step4.tabOrderLabel": "Ordre des onglets",
  "step4.tabMoveUp": "Monter",
  "step4.tabMoveDown": "Descendre",
  "step4.mapTileLabel": "Style de carte",
  "step4.mapTile.streets": "Rues",
  "step4.mapTile.satellite": "Satellite",
  "step4.showMapRoutes": "Afficher les itinéraires sur la carte",
  "step4.showPodcasts": "Afficher les boutons podcast",
  "step4.sectionBranding": "Image de marque et installation",
  "step4.pwaShortNameLabel": "Nom court d'installation",
  "step4.pwaShortNamePlaceholder": "Par exemple : Rome 2026",
  "step4.pwaIconLabel": "Icône de l'app (URL)",
  "step4.pwaIconPlaceholder": "Lien vers une image carrée",

  // Share-link durations
  "share.days7": "7 jours",
  "share.days30": "30 jours",
  "share.days90": "90 jours",
  "share.forever": "Pour toujours",

  // Generated app frame
  "appFrame.titlePlaceholder": "Nom du voyage",
  "appFrame.datesPlaceholder": "Plage de dates",
  "appFrame.albumPlaceholder": "Lien vers l'album photo (facultatif)",
  "appFrame.saveHeaderAria": "Enregistrer le nom et la plage de dates",
  "appFrame.cancelEditAria": "Annuler l'édition",
  "appFrame.editHeaderAria": "Modifier le nom et la plage de dates",
  "appFrame.titleFallback": "Votre app",
  "appFrame.datesFallback": "L'aperçu se met à jour selon le texte",
  "appFrame.albumAria": "Album photo du voyage",
  "appFrame.localOnlyNotice":
    "Les modifications faites ici sont enregistrées uniquement dans ce navigateur et ne sont pas envoyées au serveur.",
  "appFrame.scrollPrevAria": "Faire défiler vers les jours précédents",
  "appFrame.scrollNextAria": "Faire défiler vers les jours suivants",
  "appFrame.manageDaysAria": "Gérer les jours",
  "appFrame.manageDaysHeading": "Réorganiser, ajouter ou supprimer des jours",
  "appFrame.addDay": "Ajouter un jour",
  "appFrame.moveDayToStartAria": "Déplacer au début",
  "appFrame.moveDayEarlierAria": "Déplacer plus tôt",
  "appFrame.moveDayLaterAria": "Déplacer plus tard",
  "appFrame.moveDayToEndAria": "Déplacer à la fin",
  "appFrame.deleteDayAria": "Supprimer le jour",
  "appFrame.day": "Jour {num}",
  "appFrame.emptyState":
    "Saisissez la description du voyage pour voir ici un aperçu en direct de l'app.",
  "appFrame.tab.itinerary": "Itinéraire",
  "appFrame.tab.map": "Carte",
  "appFrame.tab.price": "Tarifs",
  "appFrame.tab.chat": "Chat IA",

  // Itinerary list
  "itinerary.priceLabel": "Prix",
  "itinerary.urlLabel": "Lien du site",
  "itinerary.notSaved": "Non enregistré sur le serveur",
  "itinerary.addPrice": "Ajouter un prix",
  "itinerary.playingNow": "En cours de lecture...",
  "itinerary.historicalPodcast": "Podcast historique",
  "itinerary.activityNamePlaceholder": "Nom de l'activité",
  "itinerary.activityDescPlaceholder": "Brève description",
  "itinerary.addActivity": "Ajouter une activité à ce jour",
  "itinerary.urlAria": "Lien vers le site de l'activité",
  "itinerary.showOnMapAria": "Afficher l'activité sur la carte",
  "itinerary.editAria": "Modifier l'activité",
  "itinerary.deleteAria": "Supprimer l'activité",
  "itinerary.editPriceAria": "Modifier le prix",

  // Activity type labels
  "activityType.attraction": "Attraction",
  "activityType.food": "Restauration",
  "activityType.lodging": "Hébergement",
  "activityType.transport": "Transport",

  // Location picker
  "locationPicker.set":
    "Cliquez sur la carte pour changer l'emplacement, ou faites glisser le marqueur",
  "locationPicker.unset":
    "Cliquez sur la carte pour choisir un emplacement précis, ou laissez vide pour une localisation automatique",
  "locationPicker.clear": "Effacer l'emplacement",

  // Map view
  "map.noCoords": "Aucune coordonnée à afficher sur la carte pour ce jour.",
  "map.backToFullDay": "Retour à la carte complète du jour",
  "map.openInGoogleMaps": "Ouvrir dans Google Maps",
  "map.openRoute": "Ouvrir l'itinéraire et le trajet dans Google Maps",
  "map.clickToAdd": "Cliquez sur la carte pour ajouter une nouvelle activité à cet emplacement",

  // Price summary
  "price.empty":
    "Aucun prix saisi pour le moment. Vous pouvez ajouter un prix à chaque activité depuis l'itinéraire.",
  "price.byCategory": "Répartition par catégorie",
  "price.total": "Total du voyage",

  // Podcast player
  "podcast.listeningNow": "Écoute en cours...",

  // API key menu
  "apiKey.setKey": "Configurer la clé API",
  "apiKey.configured": "Clé API configurée",
  "apiKey.configuredCount": "Clé API configurée ({count})",
  "apiKey.heading": "Vos propres clés API",
  "apiKey.descriptionBefore":
    "Choisissez un fournisseur et collez votre propre clé API — gratuite sur ",
  "apiKey.descriptionAfter":
    ". Vous pouvez ajouter plusieurs clés ; quand l'une atteint sa limite, nous passons automatiquement à la suivante. Tout est stocké uniquement dans votre navigateur.",
  "apiKey.trustNote":
    "Chaque clé est envoyée avec vos requêtes au serveur de cette application (jamais à un tiers), uniquement pour être transmise au fournisseur choisi — elle n'est jamais stockée sur le serveur ni journalisée en entier.",
  "apiKey.removeAria": "Supprimer la clé {key}",
  "apiKey.showAria": "Afficher la clé",
  "apiKey.hideAria": "Masquer la clé",
  "apiKey.addKey": "Ajouter une clé",
  "apiKey.close": "Fermer",
  "apiKey.inputPlaceholder": "Clé API...",
  "apiKey.primaryNote": "Ce fournisseur est essayé en premier à chaque requête.",
  "apiKey.makePrimary": "Définir comme fournisseur principal",

  // Cloud menu (sign-in, save, share, my trips)
  "cloud.importSuccess": "Le voyage a été importé depuis le fichier.",
  "cloud.importFailed": "L'importation du fichier a échoué.",
  "cloud.signInFailed": "La connexion avec Google a échoué. Réessayez.",
  "cloud.saved": "Le voyage a été enregistré sur votre compte.",
  "cloud.saveFailed": "L'enregistrement du voyage a échoué.",
  "cloud.shareBeforeSave": "Enregistrez le voyage avant de le partager.",
  "cloud.shareCopied": "Le lien de partage a été copié dans le presse-papiers.",
  "cloud.shareCopyFailed":
    "Le lien de partage a été créé, mais la copie dans le presse-papiers a échoué — vous pouvez le copier manuellement ci-dessous.",
  "cloud.shareFailed": "Le partage du voyage a échoué.",
  "cloud.loadFailed": "Le chargement du voyage a échoué.",
  "cloud.deleteFailed": "La suppression du voyage a échoué.",
  "cloud.deleteAria": "Supprimer le voyage {name}",
  "cloud.deleteConfirmAria": "Confirmer la suppression du voyage {name}",
  "cloud.deleteConfirm": "Supprimer ?",
  "cloud.export": "Exporter",
  "cloud.exportIcs": "Exporter le calendrier",
  "cloud.print": "Imprimer",
  "cloud.import": "Importer",
  "cloud.signingIn": "Connexion...",
  "cloud.signIn": "Se connecter avec Google",
  "cloud.shareValidity": "Validité du lien de partage :",
  "cloud.share": "Partager",
  "cloud.saveAsLabel": "Enregistrer à l'étape :",
  "cloud.stage.step1": "Étape 1",
  "cloud.stage.step2": "Étape 2",
  "cloud.stage.step3": "Étape 3",
  "cloud.stage.step4": "Étape 4",
  "cloud.stage.final": "Application finale",
  "cloud.myTrips": "Mes voyages",
  "cloud.noTrips": "Aucun voyage enregistré pour le moment.",
  "cloud.signOut": "Se déconnecter",

  // Install app button
  "install.button": "Installer l'app",
  "install.iosTitle": "Installer comme app sur iPhone/iPad",
  "install.iosStep1": "Appuyez sur le bouton Partager dans la barre d'outils de Safari",
  "install.iosStep2": "Choisissez « Sur l'écran d'accueil » (Add to Home Screen)",

  // Error boundary
  "errorBoundary.title": "Un problème est survenu",
  "errorBoundary.subtitle":
    "Une erreur inattendue s'est produite et l'app s'est arrêtée. Actualiser la page résout généralement le problème.",
  "errorBoundary.reload": "Actualiser la page",
  "errorBoundary.details": "Détails techniques (pour signalement)",

  // Shared trip page
  "sharedPage.settings": "Paramètres",
  "sharedPage.settingsAria": "Paramètres du voyage",
  "sharedPage.myTripsAria": "Aller à Mes voyages",
  "sharedPage.export": "Exporter vers un fichier",
  "sharedPage.exportIcs": "Exporter le calendrier (.ics)",
  "sharedPage.print": "Imprimer l'itinéraire",
  "sharedPage.import": "Importer depuis un fichier",
  "sharedPage.saving": "Enregistrement...",
  "sharedPage.saveToAccount": "Enregistrer sur mon compte",
  "sharedPage.savedNotice": "Enregistré sur votre compte ! Vous le trouverez dans « Mes voyages ».",
  "sharedPage.saveFailed": "L'enregistrement sur votre compte a échoué. Réessayez.",
  "sharedPage.localOnlyNotice":
    "Les modifications faites ici (y compris via le chat) sont enregistrées uniquement dans ce navigateur et ne sont pas envoyées au serveur.",
  "sharedPage.adminHint":
    "Vous êtes administrateur de ce voyage — vous pouvez enregistrer les modifications ici, ou ajouter un autre administrateur par e-mail.",
  "sharedPage.saveChanges": "Enregistrer les modifications",
  "sharedPage.saveChangesDone": "Modifications enregistrées sur ce lien.",
  "sharedPage.saveChangesFailed": "L'enregistrement des modifications a échoué. Réessayez.",
  "sharedPage.addAdminPlaceholder": "Ajouter un administrateur par e-mail...",
  "sharedPage.addAdmin": "Ajouter un administrateur",
  "sharedPage.addAdminDone":
    "Ajouté — cette personne peut désormais aussi enregistrer des modifications sur ce lien.",
  "sharedPage.addAdminFailed": "L'ajout de cet administrateur a échoué. Réessayez.",
  "sharedPage.shareNewLink": "Partager un nouveau lien",
  "sharedPage.newLinkCopied":
    "Un nouveau lien avec vos modifications a été copié dans le presse-papiers.",
  "sharedPage.newLinkCopyFailed":
    "Un nouveau lien a été créé, mais la copie dans le presse-papiers a échoué — vous pouvez le copier manuellement ci-dessous.",
  "sharedPage.newLinkFailed": "La création d'un nouveau lien a échoué. Réessayez.",

  // Trip file import/export
  "tripFile.readFailed": "La lecture du fichier a échoué.",
  "tripFile.invalid": "Le fichier n'est pas un voyage valide.",

  // Podcast (browser TTS) errors
  "podcastPlayer.noTTS": "Ce navigateur ne prend pas en charge la synthèse vocale.",
  "podcastPlayer.ttsFailed":
    "La lecture vocale du podcast a échoué. Ce navigateur n'a peut-être pas de voix adaptée.",

  // Builder draft recovery (localStorage)
  "draft.recoverPrompt":
    "Un brouillon enregistré de la dernière fois a été trouvé — le restaurer ?",
  "draft.restore": "Restaurer le brouillon",

  // Language indicator (agent reply language)
  "languageIndicator.explainer":
    "La langue des réponses de l'agent est déterminée par la langue dominante du texte du voyage que vous avez saisi, et se met à jour automatiquement si vous lui écrivez dans une autre langue.",

  // API error explanations (App.tsx describeApiError)
  "apiError.rateLimited":
    "Le fournisseur d'IA limite les requêtes en ce moment — réessayez dans une minute, ou ajoutez votre propre clé API dans les paramètres pour éviter une limite partagée.",
  "apiError.noKey":
    "Aucune clé API d'IA n'est configurée. Ajoutez votre propre clé dans les paramètres (bouton « Configurer la clé API »).",
  "apiError.tooLarge":
    "La requête est trop volumineuse pour l'IA. Essayez de la diviser en requêtes plus courtes.",
  "apiError.invalidResponse":
    "La réponse reçue de l'IA n'était pas valide. Essayez de reformuler la requête ou de réessayer.",
  "apiError.truncated":
    "La réponse de l'IA semblait avoir supprimé la majeure partie de l'itinéraire, nous l'avons donc laissé tel quel. Réessayez, ou divisez la requête en étapes plus petites.",
  "apiError.providerDown":
    "Le fournisseur d'IA n'a pas pu répondre pour le moment (problème de service temporaire). Réessayez dans un instant.",
  "apiError.technicalDetailLabel": "Détail technique :",

  // App-level notices & agent messages
  "notice.rateLimitedDemo":
    "Le fournisseur d'IA limite les requêtes en ce moment — réessayez dans une minute. En attendant, un voyage d'exemple a été chargé.",
  "notice.unreachableDemo":
    "Impossible de se connecter au serveur d'IA — un voyage d'exemple a été chargé.",
  "notice.enhanceFailed":
    "L'ajout des détails supplémentaires a échoué — nous continuons avec l'itinéraire actuel.",
  "notice.retry": "Réessayer",
  "notice.updateFailed": "La mise à jour a échoué — l'itinéraire n'a pas changé.",
  "notice.mediaFailed":
    "La génération des médias sur le serveur a échoué — nous continuons sans fichiers audio.",
  "agent.initial": "J'ai reconnu le voyage ! Parcourez l'itinéraire et corrigez ce qu'il faut.",
  "agent.demo":
    "J'ai chargé un voyage d'exemple pour vous montrer comment l'app fonctionne. Pour analyser un vrai texte, configurez votre propre clé API Gemini (bouton « Configurer la clé API » ci-dessus) — ou continuez à éditer manuellement.",
  "agent.loaded": "Le voyage a été chargé. Vous pouvez continuer à éditer.",
  "agent.imported": "Le voyage a été importé depuis un fichier. Vous pouvez continuer à éditer.",
  "agent.sharedIntro":
    "Envoyez un message pour modifier l'itinéraire — les modifications restent uniquement dans votre navigateur.",
  "shared.expired": "Ce lien de partage a expiré.",
  "shared.loadFailed":
    "Le chargement du voyage partagé a échoué. Le lien est peut-être erroné ou le voyage a été supprimé.",
  "shared.loading": "Chargement du voyage...",

  // Offline demo trip (shown when the backend is unreachable)
  "demo.title": "Voyage d'exemple ✨",
  "demo.dates": "dim. – mar.",
  "demo.d1a1.title": "Enregistrement à l'hôtel",
  "demo.d1a1.desc": "Déposer les bagages et s'installer.",
  "demo.d1a2.title": "Site historique central",
  "demo.d1a2.desc": "Une visite au cœur de la vieille ville.",
  "demo.d1a3.title": "Restaurant local",
  "demo.d1a3.desc": "Déjeuner au centre-ville.",
  "demo.d2a1.title": "Musée de la ville",
  "demo.d2a1.desc": "Collection permanente et exposition temporaire.",
  "demo.d2a2.title": "Marché local",
  "demo.d2a2.desc": "Shopping et dégustation de street food.",
};
