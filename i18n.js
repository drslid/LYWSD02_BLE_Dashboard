(() => {
  'use strict';

  const BASE_URL = 'https://drslid.github.io/LYWSD02_BLE_Dashboard/';
  const STORAGE_KEY = 'lywsd02-language-v1';
  const LOCALES = {
    en: { tag: 'en', og: 'en_US', dir: 'ltr', label: 'English', hreflang: 'en' },
    fr: { tag: 'fr', og: 'fr_FR', dir: 'ltr', label: 'Français', hreflang: 'fr' },
    es: { tag: 'es', og: 'es_ES', dir: 'ltr', label: 'Español', hreflang: 'es' },
    it: { tag: 'it', og: 'it_IT', dir: 'ltr', label: 'Italiano', hreflang: 'it' },
    de: { tag: 'de', og: 'de_DE', dir: 'ltr', label: 'Deutsch', hreflang: 'de' },
    ar: { tag: 'ar', og: 'ar_SA', dir: 'rtl', label: 'العربية', hreflang: 'ar' },
    zh: { tag: 'zh-CN', og: 'zh_CN', dir: 'ltr', label: '中文', hreflang: 'zh-Hans' },
    pt: { tag: 'pt', og: 'pt_PT', dir: 'ltr', label: 'Português', hreflang: 'pt' },
    hi: { tag: 'hi', og: 'hi_IN', dir: 'ltr', label: 'हिन्दी', hreflang: 'hi' }
  };

  const SEO = {
    en: {
      imageAlt: 'Xiaomi Mijia LYWSD02 Bluetooth dashboard preview',
      title: 'LYWSD02 / MHO-C303 time sync and Bluetooth dashboard',
      description: "Sync LYWSD02 and MHO-C303 clocks by Bluetooth or Home Assistant. Read temperature, humidity, battery and hourly history locally, without cloud services.",
      ogTitle: 'Sync and get more from your LYWSD02 / MHO-C303',
      ogDescription: 'LYWSD02 / MHO-C303: Live measurements, clock sync, display settings and internal history through local Web Bluetooth.'
    },
    fr: {
      imageAlt: 'Aperçu du tableau de bord Bluetooth Xiaomi Mijia LYWSD02',
      title: 'Régler l’heure du LYWSD02 / MHO-C303 : dashboard Bluetooth',
      description: "Synchronisez vos LYWSD02 et MHO-C303 par Bluetooth ou Home Assistant. Température, humidité, batterie et historique horaire en local, sans cloud.",
      ogTitle: 'Synchronisez et exploitez pleinement votre LYWSD02 / MHO-C303',
      ogDescription: 'LYWSD02 / MHO-C303: Mesures en direct, horloge, réglages d’affichage et historique interne via Web Bluetooth local.'
    },
    es: {
      imageAlt: 'Vista previa del panel Bluetooth Xiaomi Mijia LYWSD02',
      title: 'Ajustar la hora del LYWSD02 / MHO-C303: panel Bluetooth',
      description: "Sincroniza LYWSD02 y MHO-C303 por Bluetooth o Home Assistant. Consulta temperatura, humedad, batería e historial horario localmente, sin nube.",
      ogTitle: 'Sincroniza y aprovecha al máximo tu LYWSD02 / MHO-C303',
      ogDescription: 'LYWSD02 / MHO-C303: Mediciones en directo, reloj, ajustes de pantalla e historial interno mediante Web Bluetooth local.'
    },
    it: {
      imageAlt: 'Anteprima della dashboard Bluetooth Xiaomi Mijia LYWSD02',
      title: 'Impostare l’ora del LYWSD02 / MHO-C303: dashboard Bluetooth',
      description: "Sincronizza LYWSD02 e MHO-C303 via Bluetooth o Home Assistant. Temperatura, umidità, batteria e storico orario in locale, senza cloud.",
      ogTitle: 'Sincronizza e sfrutta al meglio LYWSD02 / MHO-C303',
      ogDescription: 'LYWSD02 / MHO-C303: Misure in tempo reale, orologio, impostazioni display e storico interno tramite Web Bluetooth locale.'
    },
    de: {
      imageAlt: 'Vorschau des Bluetooth-Dashboards für Xiaomi Mijia LYWSD02',
      title: 'LYWSD02 / MHO-C303 Uhrzeit einstellen: Bluetooth-Dashboard',
      description: "LYWSD02 und MHO-C303 per Bluetooth oder Home Assistant synchronisieren. Temperatur, Luftfeuchte, Batterie und Stundenverlauf lokal lesen, ohne Cloud.",
      ogTitle: 'LYWSD02 / MHO-C303 synchronisieren und optimal nutzen',
      ogDescription: 'LYWSD02 / MHO-C303: Live-Messwerte, Uhrzeit, Anzeigeeinstellungen und interner Verlauf über lokales Web Bluetooth.'
    },
    ar: {
      imageAlt: 'معاينة لوحة تحكم بلوتوث Xiaomi Mijia LYWSD02',
      title: 'ضبط وقت LYWSD02 / MHO-C303: لوحة تحكم بلوتوث',
      description: "زامن LYWSD02 وMHO-C303 عبر البلوتوث أو Home Assistant. اقرأ الحرارة والرطوبة والبطارية والسجل بالساعة محليًا دون سحابة.",
      ogTitle: 'زامن جهاز LYWSD02 / MHO-C303 واستفد منه بالكامل',
      ogDescription: 'LYWSD02 / MHO-C303: قياسات مباشرة ومزامنة الساعة وإعدادات الشاشة والسجل الداخلي عبر Web Bluetooth محلي.'
    },
    zh: {
      imageAlt: 'Xiaomi Mijia LYWSD02 蓝牙控制面板预览',
      title: 'LYWSD02 / MHO-C303 时间同步与蓝牙控制面板',
      description: "通过蓝牙或 Home Assistant 同步 LYWSD02 和 MHO-C303 时钟。本地读取温度、湿度、电量及每小时历史记录，无需云服务。",
      ogTitle: '同步并充分使用你的 LYWSD02 / MHO-C303',
      ogDescription: 'LYWSD02 / MHO-C303: 通过本地 Web Bluetooth 查看实时数据、同步时钟、调整显示并读取内部历史。'
    },
    pt: {
      imageAlt: 'Pré-visualização do painel Bluetooth Xiaomi Mijia LYWSD02',
      title: 'Acertar a hora do LYWSD02 / MHO-C303: painel Bluetooth',
      description: "Sincronize LYWSD02 e MHO-C303 por Bluetooth ou Home Assistant. Temperatura, humidade, bateria e histórico horário locais, sem cloud.",
      ogTitle: 'Sincronize e aproveite melhor o LYWSD02 / MHO-C303',
      ogDescription: 'LYWSD02 / MHO-C303: Medições em direto, relógio, definições do ecrã e histórico interno através de Web Bluetooth local.'
    },
    hi: {
      imageAlt: 'Xiaomi Mijia LYWSD02 ब्लूटूथ डैशबोर्ड का पूर्वावलोकन',
      title: 'LYWSD02 / MHO-C303 का समय सेट करें: ब्लूटूथ डैशबोर्ड',
      description: "LYWSD02 और MHO-C303 घड़ियाँ ब्लूटूथ या Home Assistant से सिंक करें। तापमान, नमी, बैटरी और प्रति घंटा इतिहास स्थानीय रूप से पढ़ें, बिना क्लाउड।",
      ogTitle: 'अपने LYWSD02 / MHO-C303 को सिंक करें और पूरा उपयोग करें',
      ogDescription: 'LYWSD02 / MHO-C303: स्थानीय Web Bluetooth से लाइव माप, घड़ी सिंक, डिस्प्ले सेटिंग और आंतरिक इतिहास।'
    }
  };

  const MESSAGES = {
    en: {
      "protocol.refreshMeasurements": "Refresh measurements",
      "protocol.extraMeasurements": "Additional measurements",
      "protocol.soilMoisture": "Soil moisture",
      "protocol.conductivity": "Soil conductivity",
      "protocol.illuminance": "Illuminance",
      "protocol.sensors": "Original firmware · sensors (experimental)",
      "protocol.sampleHistoryTitle": "Recorded samples",
      "protocol.supportMatrix": "Experimental profiles and device research",
      "protocol.label": "Device / firmware",
      "protocol.stock": "LYWSD02 / MHO-C303 — original firmware",
      "protocol.pvvx": "PVVX BLE — experimental",
      "protocol.cgd1": "CGD1 — original firmware, experimental",
      "protocol.token": "Existing CGD1 pairing token (32 hexadecimal characters)",
      "protocol.note": "New profiles use documented commands and simulated tests; physical validation is pending. PVVX must already be installed. The existing CGD1 token stays only in this browser session.",
      "protocol.clockAcknowledged": "Clock setting acknowledged; clock read-back is unavailable.",
      "protocol.sampleHistory": "PVVX averaged samples. Timestamps are the device’s own time, not verified UTC.",
      "protocol.deviceTimestamp": "Device time (raw)",
      "protocol.batteryVoltage": "Battery voltage",
      "compatibility.stockFirmware": "Original firmware",
      "compatibility.photoCredits": "Photo credits",
      'compatibility.models': "Compatible clocks: LYWSD02 · LYWSD02MMC · MHO-C303",
      'compatibility.note': "MHO-C303 hardware testing: Home Assistant confirmed; browser validation pending.",
      'ha.credit': "MHO-C303 support contributed and tested by",
      'skip': 'Skip to dashboard',
      'mobile.eyebrow': 'LYWSD02 BLE Dashboard',
      'mobile.title': 'Continue on your computer',
      'mobile.lead': 'Connect to your sensor from a Bluetooth-enabled Windows, Mac or Linux computer.',
      'mobile.step1': 'Open Chrome, Edge or another Chromium browser.',
      'mobile.step2': 'Visit the same address.',
      'mobile.step3': 'Turn on Bluetooth, then connect your LYWSD02 / MHO-C303.',
      'mobile.copy': 'Copy dashboard address',
      'mobile.privacy': 'Local connection. No account and no sensor data sent to a server.',
      'header.language': 'Language',
      'header.github': 'GitHub',
      'hero.eyebrow': 'Xiaomi Mijia Temperature & Humidity Monitor Clock',
      'hero.title': "Sync your LYWSD02 and MHO-C303 clocks.",
      'hero.lead': 'Read live measurements, correct clock drift and retrieve the records stored inside your sensor.',
      'hero.local': 'Local Bluetooth',
      'hero.noAccount': 'No account',
      'hero.noCloud': 'No data uploaded',
      'hero.imageAlt': 'Xiaomi Mijia LYWSD02 Bluetooth thermometer, hygrometer and clock',
      'connection.kicker': 'Connection',
      'connection.title': 'Active sensor',
      'connection.disconnected': 'Disconnected',
      'connection.noDevice': 'No sensor selected',
      'connection.idWaiting': 'Browser ID pending',
      'connection.rename': 'Rename',
      'connection.detect': 'Find a sensor',
      'connection.autoRetry': 'Automatic reconnection',
      'connection.retryDefault': 'Up to 10 progressive attempts after a drop.',
      'connection.multiTitle': 'Several LYWSD02 / MHO-C303 devices?',
      'connection.multiText': 'Connect each sensor once and give it a local name. Its browser ID and last connection are kept on this computer.',
      'devices.title': 'Device history',
      'devices.subtitle': 'Saved only in this browser',
      'devices.empty': 'No previously connected sensor.',
      'devices.lastConnected': 'Last connected {date}',
      'devices.connections': '{count} connections',
      'devices.reconnect': 'Reconnect',
      'devices.reselect': 'Select again',
      'devices.remove': 'Remove from history',
      'metric.temperature': 'Temperature',
      'metric.current': 'Current reading',
      'metric.updates': '{count} updates',
      'metric.humidity': 'Humidity',
      'metric.relative': 'Relative humidity',
      'metric.battery': 'Battery',
      'metric.remaining': 'Remaining level',
      'metric.batteryLow': 'Low battery',
      'metric.deviceTime': 'Device time',
      'metric.timezoneUnread': 'Timezone not read',
      'metric.refreshTime': 'Refresh device time',
      'metric.drift': 'Drift {value}',
      'metric.driftUnknown': 'Drift --',
      'settings.kicker': 'Display',
      'settings.title': 'Clock and unit',
      'settings.timezone': 'Time zone',
      'settings.systemTimezone': 'System time zone',
      'settings.timeFormat': 'Time format',
      'settings.unit': 'Temperature unit',
      'settings.correction': 'One-time correction',
      'settings.autoClock': 'Automatically correct clock drift over 10 seconds',
      'settings.sync': 'Sync clock',
      'settings.saveUnit': 'Save unit',
      'settings.timeFormatHint': '12 h display: LYWSD02MMC only.',
      'header.homeAssistant': 'Home Assistant',
      'ha.kicker': 'Automation',
      'ha.title': 'Keep every clock on time with Home Assistant',
      'ha.lead': "Automatically sync LYWSD02, LYWSD02MMC and MHO-C303 clocks, including daylight saving changes. Read temperature, humidity, battery and hourly records. No YAML, no cloud.",
      'ha.step1': 'Add LYWSD02 Clock Sync to HACS.',
      'ha.step2': 'Download it, then restart Home Assistant.',
      'ha.step3': 'Accept the discovered clock, or add it yourself.',
      'ha.hacsButton': 'Open in HACS',
      'ha.addButton': 'Add a clock',
      'ha.point1': 'Every night at 04:00 by default',
      'ha.point2': 'Daily, weekly, monthly or cron',
      'ha.point3': 'Daylight saving fixed within the hour',
      'ha.point4': 'Works with ESPHome Bluetooth proxies',
      'ha.note': 'Requires HACS and Bluetooth in Home Assistant: a local adapter or a proxy with active connections.',
      'ha.guide': 'Read the guide',
      'history.kicker': 'Internal memory',
      'history.title': 'Hourly history',
      'history.count': '{count} records',
      'history.limit': 'Latest records',
      'history.hours24': '24 hours',
      'history.hours48': '48 hours',
      'history.hours96': '96 hours',
      'history.read': 'Read',
      'history.export': 'Export history as CSV',
      'history.statusDefault': 'The sensor stores timestamped minimum and maximum values.',
      'history.emptyConnect': 'Connect a sensor to read its memory.',
      'history.emptyLoaded': 'No history loaded for this sensor.',
      'history.empty': 'No records available.',
      'history.date': 'Date',
      'history.tempMin': 'Min. temp.',
      'history.tempMax': 'Max. temp.',
      'history.humidity': 'Humidity',
      'logs.kicker': 'Local diagnostics',
      'logs.title': 'Activity log',
      'logs.clear': 'Clear',
      'logs.empty': 'Bluetooth events will appear here.',
      'footer.project': 'Open-source project under the MIT License.',
      'footer.privacy': 'Measurements stay in your browser.',
      'rename.kicker': 'Local identification',
      'rename.title': 'Name this sensor',
      'rename.lead': 'This name is stored only in this browser.',
      'rename.label': 'Sensor name',
      'rename.placeholder': 'e.g. Living room',
      'rename.close': 'Close',
      'rename.cancel': 'Cancel',
      'rename.save': 'Save',
      'noscript': 'JavaScript must be enabled to communicate with the LYWSD02 / MHO-C303 over Bluetooth.',
      'copy.success': 'Address copied.',
      'copy.failure': 'Copy failed. Note the address above.',
      'button.connecting': 'Connecting',
      'button.cancelConnection': 'Stop connecting',
      'button.disconnect': 'Disconnect',
      'status.selecting': 'Selecting...',
      'status.connecting': 'Connecting...',
      'status.retry': 'Retry {current}/{total}',
      'status.connected': 'Connected',
      'status.failed': 'Connection failed',
      'status.lost': 'Connection lost',
      'status.https': 'HTTPS required',
      'status.incompatible': 'Not supported',
      'status.bluetoothOff': 'Bluetooth off',
      'retry.select': 'Select an LYWSD02 / MHO-C303 in the browser dialog.',
      'retry.none': 'No sensor selected.',
      'retry.attempt': 'Attempt 1/{total}',
      'retry.reconnectAttempt': 'Automatic reconnection 1/{total}',
      'retry.scheduled': 'Retrying in {seconds}s...',
      'retry.ready': 'Monitoring active. Automatic reconnection ready.',
      'retry.active': 'Monitoring active.',
      'retry.failure': 'Could not connect after {count} attempts.',
      'retry.disabled': 'Automatic reconnection is disabled.',
      'retry.manual': 'Disconnected on request. No automatic retry.',
      'retry.cancelled': 'Connection cancelled on request. No automatic retry.',
      'retry.on': 'Up to 10 progressive attempts after a drop.',
      'retry.off': 'No retry after a drop.',
      'retry.mismatch': 'That is not {name}. Select the matching browser ID.',
      'history.reading': 'Reading sensor memory...',
      'history.none': 'The sensor memory contains no records.',
      'history.loaded': '{count} records loaded from {stored} stored.',
      'history.failed': 'This firmware did not return its memory.',
      'drift.synced': 'in sync',
      'drift.ahead': '{seconds}s ahead',
      'drift.behind': '{seconds}s behind',
      'compat.httpsTitle': 'Secure connection required',
      'compat.httpsText': 'Web Bluetooth works only over HTTPS. Open the published GitHub Pages version.',
      'compat.browserTitle': 'Unsupported browser',
      'compat.browserText': 'Use Chrome, Edge or another Chromium browser on Windows, macOS or Linux. Safari and Firefox do not provide Web Bluetooth.',
      'compat.bluetoothTitle': 'Bluetooth is off',
      'compat.bluetoothText': 'Enable the computer Bluetooth adapter, then reload this page.',
      'log.storage': 'Local storage is unavailable; settings cannot be remembered.',
      'log.chooser': 'Opening the Bluetooth device picker...',
      'log.selectionCancelled': 'Sensor selection cancelled.',
      'log.connectionCancelled': 'Connection cancelled on request.',
      'log.selectionFailed': 'Selection failed: {error}.',
      'log.connected': 'Connected to {name}.',
      'log.attemptFailed': 'Attempt {attempt} failed: {error}.',
      'log.connectionFailed': 'Connection failed: {error}.',
      'log.interrupted': 'Bluetooth connection interrupted.',
      'log.disconnected': 'Sensor disconnected.',
      'log.readUnavailable': '{label} unavailable: {error}.',
      'log.invalidMeasurement': 'A measurement was received in an unexpected format.',
      'log.timeRefreshed': 'Device time refreshed.',
      'log.timeSynced': 'Clock synchronized in {mode}h mode ({timezone}).',
      'log.timeSyncedNoFormat': 'Clock synchronized ({timezone}).',
      'log.clockFormatUnsupported': 'This sensor did not accept the 12-hour format: only the LYWSD02MMC supports 12/24-hour switching.',
      'log.autoTimeSynced': 'Clock drift exceeded 10 seconds and was corrected automatically.',
      'log.timeSyncFailed': 'Clock sync failed: {error}.',
      'log.unitSet': 'Unit set to °{unit}.',
      'log.unitFailed': 'Could not set unit: {error}.',
      'log.historyReading': 'Reading internal history...',
      'log.historyNone': 'No records stored in the sensor.',
      'log.historyLoaded': '{count} history records loaded.',
      'log.historyFailed': 'Could not read history: {error}.',
      'log.historyExported': 'History exported as CSV.',
      'log.renamed': 'Sensor renamed “{name}” in this browser.',
      'log.removed': '{name} removed from device history.',
      'log.ready': 'Dashboard ready. All exchanges stay local to this browser.',
      'log.adapterAvailable': 'Bluetooth adapter available.',
      'log.fractionalZone': 'This time zone uses an offset of {timezone}; the device will be compensated automatically.',
      'read.battery': 'Battery reading',
      'read.unit': 'Unit reading',
      'read.time': 'Time reading',
      'error.unknown': 'unknown error',
      'error.network': 'Bluetooth connection interrupted',
      'error.notFound': 'LYWSD02 / MHO-C303 service not found or selection cancelled',
      'error.notSupported': 'Bluetooth feature not supported',
      'error.security': 'Bluetooth access blocked by the browser',
      'error.notAllowed': 'Bluetooth permission denied',
      'error.timeIncomplete': 'incomplete time value',
      'error.historyIncomplete': 'incomplete history counter'
    },
    fr: {
      "protocol.refreshMeasurements": "Actualiser les mesures",
      "protocol.extraMeasurements": "Mesures supplémentaires",
      "protocol.soilMoisture": "Humidité du sol",
      "protocol.conductivity": "Conductivité du sol",
      "protocol.illuminance": "Éclairement",
      "protocol.sensors": "Firmware d’origine · capteurs (expérimental)",
      "protocol.sampleHistoryTitle": "Relevés enregistrés",
      "protocol.supportMatrix": "Profils expérimentaux et recherche sur les appareils",
      "protocol.label": "Appareil / firmware",
      "protocol.stock": "LYWSD02 / MHO-C303 — firmware d’origine",
      "protocol.pvvx": "PVVX BLE — expérimental",
      "protocol.cgd1": "CGD1 — firmware d’origine, expérimental",
      "protocol.token": "Jeton d’appairage CGD1 existant (32 caractères hexadécimaux)",
      "protocol.note": "Les nouveaux profils utilisent des commandes documentées et des tests simulés ; la validation matérielle reste à faire. PVVX doit déjà être installé. Le jeton CGD1 existant reste uniquement dans cette session du navigateur.",
      "protocol.clockAcknowledged": "Réglage de l’heure accepté ; relecture de l’horloge indisponible.",
      "protocol.sampleHistory": "Moyennes PVVX. Les dates sont celles de l’appareil, sans conversion UTC vérifiée.",
      "protocol.deviceTimestamp": "Heure appareil (brute)",
      "protocol.batteryVoltage": "Tension de la pile",
      "compatibility.stockFirmware": "Firmware d’origine",
      "compatibility.photoCredits": "Crédits photo",
      'compatibility.models': "Horloges compatibles : LYWSD02 · LYWSD02MMC · MHO-C303",
      'compatibility.note': "Essai matériel du MHO-C303 : confirmé dans Home Assistant ; validation navigateur à effectuer.",
      'ha.credit': "Compatibilité MHO-C303 ajoutée et testée par",
      'skip': 'Aller au tableau de bord', 'mobile.title': 'Poursuivez sur votre ordinateur', 'mobile.lead': 'Connectez votre capteur depuis un PC, un Mac ou un ordinateur Linux équipé du Bluetooth.', 'mobile.step1': 'Ouvrez Chrome, Edge ou un autre navigateur Chromium.', 'mobile.step2': 'Rendez-vous à la même adresse.', 'mobile.step3': 'Activez le Bluetooth, puis connectez votre LYWSD02 / MHO-C303.', 'mobile.copy': 'Copier l’adresse du dashboard', 'mobile.privacy': 'Connexion locale. Aucun compte et aucune mesure envoyée à un serveur.',
      'header.language': 'Langue', 'hero.eyebrow': 'Horloge thermomètre-hygromètre Xiaomi Mijia', 'hero.title': "Synchronisez vos horloges LYWSD02 et MHO-C303.", 'hero.lead': 'Consultez les mesures en direct, corrigez la dérive de l’horloge et récupérez les relevés stockés dans le capteur.', 'hero.local': 'Bluetooth local', 'hero.noAccount': 'Aucun compte', 'hero.noCloud': 'Aucune donnée envoyée', 'hero.imageAlt': 'Thermomètre, hygromètre et horloge Bluetooth Xiaomi Mijia LYWSD02',
      'connection.kicker': 'Connexion', 'connection.title': 'Capteur actif', 'connection.disconnected': 'Déconnecté', 'connection.noDevice': 'Aucun capteur sélectionné', 'connection.idWaiting': 'ID navigateur en attente', 'connection.rename': 'Renommer', 'connection.detect': 'Détecter un capteur', 'connection.autoRetry': 'Reconnexion automatique', 'connection.retryDefault': 'Jusqu’à 10 tentatives progressives après une coupure.', 'connection.multiTitle': 'Plusieurs LYWSD02 / MHO-C303 ?', 'connection.multiText': 'Connectez chaque capteur une fois et nommez-le. Son ID navigateur et sa dernière connexion sont conservés sur cet ordinateur.',
      'devices.title': 'Historique des appareils', 'devices.subtitle': 'Enregistré uniquement dans ce navigateur', 'devices.empty': 'Aucun capteur déjà connecté.', 'devices.lastConnected': 'Dernière connexion {date}', 'devices.connections': '{count} connexions', 'devices.reconnect': 'Reconnecter', 'devices.reselect': 'Sélectionner à nouveau', 'devices.remove': 'Retirer de l’historique',
      'metric.temperature': 'Température', 'metric.current': 'Mesure actuelle', 'metric.updates': '{count} mises à jour', 'metric.humidity': 'Humidité', 'metric.relative': 'Humidité relative', 'metric.battery': 'Batterie', 'metric.remaining': 'Niveau restant', 'metric.batteryLow': 'Batterie faible', 'metric.deviceTime': 'Heure du capteur', 'metric.timezoneUnread': 'Fuseau non lu', 'metric.refreshTime': 'Actualiser l’heure du capteur', 'metric.drift': 'Dérive {value}', 'metric.driftUnknown': 'Dérive --',
      'settings.kicker': 'Affichage', 'settings.title': 'Horloge et unité', 'settings.timezone': 'Fuseau horaire', 'settings.systemTimezone': 'Fuseau du système', 'settings.timeFormat': 'Format de l’heure', 'settings.unit': 'Unité de température', 'settings.correction': 'Correction ponctuelle', 'settings.autoClock': 'Corriger automatiquement une dérive supérieure à 10 secondes', 'settings.sync': 'Synchroniser l’horloge', 'settings.saveUnit': 'Enregistrer l’unité',
      'settings.timeFormatHint': 'Affichage 12 h : LYWSD02MMC uniquement.', 'ha.kicker': 'Automatisation', 'ha.title': 'Gardez chaque horloge à l’heure avec Home Assistant', 'ha.lead': "Synchronisez automatiquement vos LYWSD02, LYWSD02MMC et MHO-C303, y compris aux changements d’heure. Lisez température, humidité, batterie et historique horaire. Sans YAML ni cloud.", 'ha.step1': 'Ajoutez LYWSD02 Clock Sync à HACS.', 'ha.step2': 'Téléchargez-la, puis redémarrez Home Assistant.', 'ha.step3': 'Acceptez l’horloge détectée ou ajoutez-la vous-même.', 'ha.hacsButton': 'Ouvrir dans HACS', 'ha.addButton': 'Ajouter une horloge', 'ha.point1': 'Chaque nuit à 04:00 par défaut', 'ha.point2': 'Quotidienne, hebdomadaire, mensuelle ou cron', 'ha.point3': 'Changement d’heure corrigé dans l’heure', 'ha.point4': 'Compatible avec les proxys Bluetooth ESPHome', 'ha.note': 'Nécessite HACS et le Bluetooth dans Home Assistant : un adaptateur local ou un proxy avec connexions actives.', 'ha.guide': 'Lire le guide',
      'history.kicker': 'Mémoire interne', 'history.title': 'Historique horaire', 'history.count': '{count} relevés', 'history.limit': 'Derniers relevés', 'history.hours24': '24 heures', 'history.hours48': '48 heures', 'history.hours96': '96 heures', 'history.read': 'Lire', 'history.export': 'Exporter l’historique en CSV', 'history.statusDefault': 'Le capteur conserve des minimums et maximums horodatés.', 'history.emptyConnect': 'Connectez un capteur pour lire sa mémoire.', 'history.emptyLoaded': 'Aucun historique chargé pour ce capteur.', 'history.empty': 'Aucun relevé disponible.', 'history.date': 'Date', 'history.tempMin': 'Temp. min', 'history.tempMax': 'Temp. max', 'history.humidity': 'Humidité',
      'logs.kicker': 'Diagnostic local', 'logs.title': 'Journal d’activité', 'logs.clear': 'Effacer', 'logs.empty': 'Les événements Bluetooth apparaîtront ici.', 'footer.project': 'Projet open source sous licence MIT.', 'footer.privacy': 'Les mesures restent dans votre navigateur.',
      'rename.kicker': 'Repérage local', 'rename.title': 'Nommer ce capteur', 'rename.lead': 'Ce nom est enregistré uniquement dans ce navigateur.', 'rename.label': 'Nom du capteur', 'rename.placeholder': 'Ex. Salon', 'rename.close': 'Fermer', 'rename.cancel': 'Annuler', 'rename.save': 'Enregistrer', 'noscript': 'JavaScript doit être activé pour communiquer avec le LYWSD02 / MHO-C303 en Bluetooth.',
      'copy.success': 'Adresse copiée.', 'copy.failure': 'Copie impossible. Notez l’adresse ci-dessus.', 'button.connecting': 'Connexion en cours', 'button.cancelConnection': 'Arrêter la connexion', 'button.disconnect': 'Déconnecter', 'status.selecting': 'Sélection...', 'status.connecting': 'Connexion...', 'status.retry': 'Nouvel essai {current}/{total}', 'status.connected': 'Connecté', 'status.failed': 'Échec de connexion', 'status.lost': 'Connexion perdue', 'status.https': 'HTTPS requis', 'status.incompatible': 'Non compatible', 'status.bluetoothOff': 'Bluetooth inactif',
      'retry.select': 'Sélectionnez un LYWSD02 / MHO-C303 dans la fenêtre du navigateur.', 'retry.none': 'Aucun capteur sélectionné.', 'retry.attempt': 'Tentative 1/{total}', 'retry.reconnectAttempt': 'Reconnexion automatique 1/{total}', 'retry.scheduled': 'Nouvelle tentative dans {seconds} s...', 'retry.ready': 'Surveillance active. Reconnexion automatique prête.', 'retry.active': 'Surveillance active.', 'retry.failure': 'Connexion impossible après {count} tentatives.', 'retry.disabled': 'Reconnexion automatique désactivée.', 'retry.manual': 'Déconnexion demandée. Aucun nouvel essai automatique.', 'retry.cancelled': 'Connexion arrêtée à votre demande. Aucun nouvel essai automatique.', 'retry.on': 'Jusqu’à 10 tentatives progressives après une coupure.', 'retry.off': 'Aucun nouvel essai après une coupure.', 'retry.mismatch': 'Ce capteur n’est pas {name}. Sélectionnez l’ID navigateur correspondant.',
      'history.reading': 'Lecture de la mémoire du capteur...', 'history.none': 'La mémoire du capteur ne contient aucun relevé.', 'history.loaded': '{count} relevés chargés sur {stored} stockés.', 'history.failed': 'Ce firmware n’a pas renvoyé sa mémoire.', 'drift.synced': 'à l’heure', 'drift.ahead': '{seconds} s en avance', 'drift.behind': '{seconds} s en retard',
      'compat.httpsTitle': 'Connexion sécurisée requise', 'compat.httpsText': 'Web Bluetooth fonctionne uniquement en HTTPS. Ouvrez la version publiée sur GitHub Pages.', 'compat.browserTitle': 'Navigateur incompatible', 'compat.browserText': 'Utilisez Chrome, Edge ou un navigateur Chromium sur Windows, macOS ou Linux. Safari et Firefox ne proposent pas Web Bluetooth.', 'compat.bluetoothTitle': 'Bluetooth désactivé', 'compat.bluetoothText': 'Activez l’adaptateur Bluetooth de l’ordinateur, puis rechargez la page.',
      'log.storage': 'Le stockage local est indisponible ; les réglages ne seront pas mémorisés.', 'log.chooser': 'Ouverture du sélecteur Bluetooth...', 'log.selectionCancelled': 'Sélection du capteur annulée.', 'log.connectionCancelled': 'Connexion arrêtée à votre demande.', 'log.selectionFailed': 'Sélection impossible : {error}.', 'log.connected': 'Connecté à {name}.', 'log.attemptFailed': 'Tentative {attempt} échouée : {error}.', 'log.connectionFailed': 'Connexion impossible : {error}.', 'log.interrupted': 'Connexion Bluetooth interrompue.', 'log.disconnected': 'Capteur déconnecté.', 'log.readUnavailable': '{label} indisponible : {error}.', 'log.invalidMeasurement': 'Mesure reçue dans un format inattendu.', 'log.timeRefreshed': 'Heure du capteur actualisée.', 'log.timeSynced': 'Horloge synchronisée en mode {mode} h ({timezone}).', 'log.timeSyncedNoFormat': 'Horloge synchronisée ({timezone}).', 'log.clockFormatUnsupported': 'Ce capteur n’a pas accepté le format 12 h : seul le LYWSD02MMC prend en charge le passage 12/24 h.', 'log.autoTimeSynced': 'La dérive dépassait 10 secondes et a été corrigée automatiquement.', 'log.timeSyncFailed': 'Synchronisation impossible : {error}.', 'log.unitSet': 'Unité réglée sur °{unit}.', 'log.unitFailed': 'Réglage de l’unité impossible : {error}.', 'log.historyReading': 'Lecture de l’historique interne...', 'log.historyNone': 'Aucun relevé enregistré dans le capteur.', 'log.historyLoaded': '{count} relevés historiques chargés.', 'log.historyFailed': 'Lecture de l’historique impossible : {error}.', 'log.historyExported': 'Historique exporté au format CSV.', 'log.renamed': 'Capteur renommé « {name} » dans ce navigateur.', 'log.removed': '{name} retiré de l’historique des appareils.', 'log.ready': 'Dashboard prêt. Tous les échanges restent locaux à ce navigateur.', 'log.adapterAvailable': 'Adaptateur Bluetooth disponible.', 'log.fractionalZone': 'Le fuseau {timezone} est compensé automatiquement par le capteur.',
      'read.battery': 'Lecture batterie', 'read.unit': 'Lecture unité', 'read.time': 'Lecture heure', 'error.unknown': 'erreur inconnue', 'error.network': 'connexion Bluetooth interrompue', 'error.notFound': 'service LYWSD02 / MHO-C303 introuvable ou sélection annulée', 'error.notSupported': 'fonction Bluetooth non prise en charge', 'error.security': 'accès Bluetooth bloqué par le navigateur', 'error.notAllowed': 'autorisation Bluetooth refusée', 'error.timeIncomplete': 'valeur horaire incomplète', 'error.historyIncomplete': 'compteur d’historique incomplet'
    },
    es: {
      "protocol.refreshMeasurements": "Actualizar mediciones",
      "protocol.extraMeasurements": "Mediciones adicionales",
      "protocol.soilMoisture": "Humedad del suelo",
      "protocol.conductivity": "Conductividad del suelo",
      "protocol.illuminance": "Iluminancia",
      "protocol.sensors": "Firmware original · sensores (experimental)",
      "protocol.sampleHistoryTitle": "Muestras guardadas",
      "protocol.supportMatrix": "Perfiles experimentales e investigación de dispositivos",
      "protocol.label": "Dispositivo / firmware",
      "protocol.stock": "LYWSD02 / MHO-C303 — firmware original",
      "protocol.pvvx": "PVVX BLE — experimental",
      "protocol.cgd1": "CGD1 — firmware original, experimental",
      "protocol.token": "Token de emparejamiento CGD1 existente (32 caracteres hexadecimales)",
      "protocol.note": "Los nuevos perfiles usan comandos documentados y pruebas simuladas; falta validación física. PVVX debe estar instalado. El token CGD1 existente se conserva solo en esta sesión del navegador.",
      "protocol.clockAcknowledged": "Ajuste de hora aceptado; no se puede releer el reloj.",
      "protocol.sampleHistory": "Muestras promediadas PVVX. Las fechas son del dispositivo, sin conversión UTC verificada.",
      "protocol.deviceTimestamp": "Hora del dispositivo (sin convertir)",
      "protocol.batteryVoltage": "Tensión de la batería",
      "compatibility.stockFirmware": "Firmware original",
      "compatibility.photoCredits": "Créditos de las fotos",
      'compatibility.models': "Relojes compatibles: LYWSD02 · LYWSD02MMC · MHO-C303",
      'compatibility.note': "Prueba física del MHO-C303: confirmada en Home Assistant; pendiente en el navegador.",
      'ha.credit': "Compatibilidad con MHO-C303 añadida y probada por",
      'skip': 'Ir al panel', 'mobile.title': 'Continúa en tu ordenador', 'mobile.lead': 'Conecta el sensor desde un PC, Mac u ordenador Linux con Bluetooth.', 'mobile.step1': 'Abre Chrome, Edge u otro navegador Chromium.', 'mobile.step2': 'Visita la misma dirección.', 'mobile.step3': 'Activa Bluetooth y conecta tu LYWSD02 / MHO-C303.', 'mobile.copy': 'Copiar dirección del panel', 'mobile.privacy': 'Conexión local. Sin cuenta ni datos enviados a un servidor.', 'header.language': 'Idioma',
      'hero.eyebrow': 'Reloj termómetro-higrómetro Xiaomi Mijia', 'hero.title': "Sincroniza tus relojes LYWSD02 y MHO-C303.", 'hero.lead': 'Consulta mediciones en directo, corrige la desviación del reloj y recupera los registros guardados en el sensor.', 'hero.local': 'Bluetooth local', 'hero.noAccount': 'Sin cuenta', 'hero.noCloud': 'Sin subir datos', 'hero.imageAlt': 'Termómetro, higrómetro y reloj Bluetooth Xiaomi Mijia LYWSD02',
      'connection.kicker': 'Conexión', 'connection.title': 'Sensor activo', 'connection.disconnected': 'Desconectado', 'connection.noDevice': 'Ningún sensor seleccionado', 'connection.idWaiting': 'ID del navegador pendiente', 'connection.rename': 'Renombrar', 'connection.detect': 'Buscar un sensor', 'connection.autoRetry': 'Reconexión automática', 'connection.retryDefault': 'Hasta 10 intentos progresivos tras un corte.', 'connection.multiTitle': '¿Varios LYWSD02 / MHO-C303?', 'connection.multiText': 'Conecta cada sensor una vez y ponle un nombre local. Su ID y última conexión se guardan en este ordenador.',
      'devices.title': 'Historial de dispositivos', 'devices.subtitle': 'Guardado solo en este navegador', 'devices.empty': 'No hay sensores conectados anteriormente.', 'devices.lastConnected': 'Última conexión {date}', 'devices.connections': '{count} conexiones', 'devices.reconnect': 'Reconectar', 'devices.reselect': 'Seleccionar de nuevo', 'devices.remove': 'Quitar del historial',
      'metric.temperature': 'Temperatura', 'metric.current': 'Medición actual', 'metric.updates': '{count} actualizaciones', 'metric.humidity': 'Humedad', 'metric.relative': 'Humedad relativa', 'metric.battery': 'Batería', 'metric.remaining': 'Nivel restante', 'metric.batteryLow': 'Batería baja', 'metric.deviceTime': 'Hora del dispositivo', 'metric.timezoneUnread': 'Zona no leída', 'metric.refreshTime': 'Actualizar hora del dispositivo', 'metric.drift': 'Desviación {value}', 'metric.driftUnknown': 'Desviación --',
      'settings.kicker': 'Pantalla', 'settings.title': 'Reloj y unidad', 'settings.timezone': 'Zona horaria', 'settings.systemTimezone': 'Zona del sistema', 'settings.timeFormat': 'Formato horario', 'settings.unit': 'Unidad de temperatura', 'settings.correction': 'Corrección puntual', 'settings.autoClock': 'Corregir automáticamente desviaciones superiores a 10 segundos', 'settings.sync': 'Sincronizar reloj', 'settings.saveUnit': 'Guardar unidad',
      'settings.timeFormatHint': 'Formato de 12 h: solo LYWSD02MMC.', 'ha.kicker': 'Automatización', 'ha.title': 'Mantén todos tus relojes en hora con Home Assistant', 'ha.lead': "Sincroniza automáticamente LYWSD02, LYWSD02MMC y MHO-C303, incluidos los cambios de horario. Consulta temperatura, humedad, batería e historial horario. Sin YAML ni nube.", 'ha.step1': 'Añade LYWSD02 Clock Sync a HACS.', 'ha.step2': 'Descárgala y reinicia Home Assistant.', 'ha.step3': 'Acepta el reloj detectado o añádelo tú mismo.', 'ha.hacsButton': 'Abrir en HACS', 'ha.addButton': 'Añadir un reloj', 'ha.point1': 'Cada noche a las 04:00 por defecto', 'ha.point2': 'Diaria, semanal, mensual o cron', 'ha.point3': 'Cambio de horario corregido en menos de una hora', 'ha.point4': 'Compatible con los proxies Bluetooth de ESPHome', 'ha.note': 'Requiere HACS y Bluetooth en Home Assistant: un adaptador local o un proxy con conexiones activas.', 'ha.guide': 'Leer la guía',
      'history.kicker': 'Memoria interna', 'history.title': 'Historial por hora', 'history.count': '{count} registros', 'history.limit': 'Últimos registros', 'history.hours24': '24 horas', 'history.hours48': '48 horas', 'history.hours96': '96 horas', 'history.read': 'Leer', 'history.export': 'Exportar historial en CSV', 'history.statusDefault': 'El sensor guarda mínimos y máximos con fecha y hora.', 'history.emptyConnect': 'Conecta un sensor para leer su memoria.', 'history.emptyLoaded': 'No hay historial cargado para este sensor.', 'history.empty': 'No hay registros disponibles.', 'history.date': 'Fecha', 'history.tempMin': 'Temp. mín.', 'history.tempMax': 'Temp. máx.', 'history.humidity': 'Humedad',
      'logs.kicker': 'Diagnóstico local', 'logs.title': 'Registro de actividad', 'logs.clear': 'Borrar', 'logs.empty': 'Los eventos Bluetooth aparecerán aquí.', 'footer.project': 'Proyecto de código abierto con licencia MIT.', 'footer.privacy': 'Las mediciones permanecen en tu navegador.', 'rename.kicker': 'Identificación local', 'rename.title': 'Nombra este sensor', 'rename.lead': 'Este nombre solo se guarda en este navegador.', 'rename.label': 'Nombre del sensor', 'rename.placeholder': 'Ej. Salón', 'rename.close': 'Cerrar', 'rename.cancel': 'Cancelar', 'rename.save': 'Guardar', 'noscript': 'JavaScript debe estar activado para comunicarse con el LYWSD02 / MHO-C303 por Bluetooth.',
      'copy.success': 'Dirección copiada.', 'copy.failure': 'No se pudo copiar. Anota la dirección.', 'button.connecting': 'Conectando', 'button.cancelConnection': 'Cancelar conexión', 'button.disconnect': 'Desconectar', 'status.selecting': 'Seleccionando...', 'status.connecting': 'Conectando...', 'status.retry': 'Reintento {current}/{total}', 'status.connected': 'Conectado', 'status.failed': 'Error de conexión', 'status.lost': 'Conexión perdida', 'status.https': 'Se requiere HTTPS', 'status.incompatible': 'No compatible', 'status.bluetoothOff': 'Bluetooth apagado',
      'retry.select': 'Selecciona un LYWSD02 / MHO-C303 en la ventana del navegador.', 'retry.none': 'Ningún sensor seleccionado.', 'retry.attempt': 'Intento 1/{total}', 'retry.reconnectAttempt': 'Reconexión automática 1/{total}', 'retry.scheduled': 'Nuevo intento en {seconds} s...', 'retry.ready': 'Supervisión activa. Reconexión automática lista.', 'retry.active': 'Supervisión activa.', 'retry.failure': 'No se pudo conectar tras {count} intentos.', 'retry.disabled': 'Reconexión automática desactivada.', 'retry.manual': 'Desconexión solicitada. Sin nuevo intento automático.', 'retry.cancelled': 'Conexión cancelada a petición. Sin nuevo intento automático.', 'retry.on': 'Hasta 10 intentos progresivos tras un corte.', 'retry.off': 'Sin reintento tras un corte.', 'retry.mismatch': 'Este sensor no es {name}. Selecciona el ID correcto.',
      'history.reading': 'Leyendo la memoria del sensor...', 'history.none': 'La memoria del sensor no contiene registros.', 'history.loaded': '{count} registros cargados de {stored} guardados.', 'history.failed': 'Este firmware no devolvió la memoria.', 'drift.synced': 'sincronizado', 'drift.ahead': '{seconds} s adelantado', 'drift.behind': '{seconds} s atrasado',
      'compat.httpsTitle': 'Se requiere conexión segura', 'compat.httpsText': 'Web Bluetooth solo funciona con HTTPS. Abre la versión publicada en GitHub Pages.', 'compat.browserTitle': 'Navegador incompatible', 'compat.browserText': 'Usa Chrome, Edge u otro navegador Chromium en Windows, macOS o Linux. Safari y Firefox no ofrecen Web Bluetooth.', 'compat.bluetoothTitle': 'Bluetooth desactivado', 'compat.bluetoothText': 'Activa el adaptador Bluetooth del ordenador y recarga la página.',
      'log.storage': 'El almacenamiento local no está disponible; no se recordarán los ajustes.', 'log.chooser': 'Abriendo el selector Bluetooth...', 'log.selectionCancelled': 'Selección cancelada.', 'log.connectionCancelled': 'Conexión cancelada a petición.', 'log.selectionFailed': 'No se pudo seleccionar: {error}.', 'log.connected': 'Conectado a {name}.', 'log.attemptFailed': 'Intento {attempt} fallido: {error}.', 'log.connectionFailed': 'Conexión fallida: {error}.', 'log.interrupted': 'Conexión Bluetooth interrumpida.', 'log.disconnected': 'Sensor desconectado.', 'log.readUnavailable': '{label} no disponible: {error}.', 'log.invalidMeasurement': 'Medición recibida con formato inesperado.', 'log.timeRefreshed': 'Hora del dispositivo actualizada.', 'log.timeSynced': 'Reloj sincronizado en modo {mode} h ({timezone}).', 'log.timeSyncedNoFormat': 'Reloj sincronizado ({timezone}).', 'log.clockFormatUnsupported': 'Este sensor no aceptó el formato de 12 h: solo el LYWSD02MMC admite el cambio 12/24 h.', 'log.autoTimeSynced': 'La desviación superaba 10 segundos y se corrigió automáticamente.', 'log.timeSyncFailed': 'No se pudo sincronizar: {error}.', 'log.unitSet': 'Unidad configurada en °{unit}.', 'log.unitFailed': 'No se pudo cambiar la unidad: {error}.', 'log.historyReading': 'Leyendo historial interno...', 'log.historyNone': 'No hay registros en el sensor.', 'log.historyLoaded': '{count} registros históricos cargados.', 'log.historyFailed': 'No se pudo leer el historial: {error}.', 'log.historyExported': 'Historial exportado en CSV.', 'log.renamed': 'Sensor renombrado “{name}” en este navegador.', 'log.removed': '{name} eliminado del historial.', 'log.ready': 'Panel listo. Todos los intercambios permanecen en este navegador.', 'log.adapterAvailable': 'Adaptador Bluetooth disponible.', 'log.fractionalZone': 'La zona {timezone} se compensa automáticamente.',
      'read.battery': 'Lectura de batería', 'read.unit': 'Lectura de unidad', 'read.time': 'Lectura de hora', 'error.unknown': 'error desconocido', 'error.network': 'conexión Bluetooth interrumpida', 'error.notFound': 'servicio LYWSD02 / MHO-C303 no encontrado o selección cancelada', 'error.notSupported': 'función Bluetooth no compatible', 'error.security': 'acceso Bluetooth bloqueado', 'error.notAllowed': 'permiso Bluetooth denegado', 'error.timeIncomplete': 'valor horario incompleto', 'error.historyIncomplete': 'contador de historial incompleto'
    },
    it: {
      "protocol.refreshMeasurements": "Aggiorna misure",
      "protocol.extraMeasurements": "Misure aggiuntive",
      "protocol.soilMoisture": "Umidità del suolo",
      "protocol.conductivity": "Conducibilità del suolo",
      "protocol.illuminance": "Illuminamento",
      "protocol.sensors": "Firmware originale · sensori (sperimentale)",
      "protocol.sampleHistoryTitle": "Campioni registrati",
      "protocol.supportMatrix": "Profili sperimentali e ricerca sui dispositivi",
      "protocol.label": "Dispositivo / firmware",
      "protocol.stock": "LYWSD02 / MHO-C303 — firmware originale",
      "protocol.pvvx": "PVVX BLE — sperimentale",
      "protocol.cgd1": "CGD1 — firmware originale, sperimentale",
      "protocol.token": "Token di associazione CGD1 esistente (32 caratteri esadecimali)",
      "protocol.note": "I nuovi profili usano comandi documentati e test simulati; manca la verifica fisica. PVVX deve essere già installato. Il token CGD1 esistente resta solo in questa sessione del browser.",
      "protocol.clockAcknowledged": "Ora accettata; rilettura dell’orologio non disponibile.",
      "protocol.sampleHistory": "Medie PVVX. Le date sono quelle del dispositivo, senza conversione UTC verificata.",
      "protocol.deviceTimestamp": "Ora dispositivo (grezza)",
      "protocol.batteryVoltage": "Tensione della batteria",
      "compatibility.stockFirmware": "Firmware originale",
      "compatibility.photoCredits": "Crediti fotografici",
      'compatibility.models': "Orologi compatibili: LYWSD02 · LYWSD02MMC · MHO-C303",
      'compatibility.note': "Test fisico MHO-C303: confermato in Home Assistant; da verificare nel browser.",
      'ha.credit': "Compatibilità MHO-C303 aggiunta e testata da",
      'skip': 'Vai alla dashboard', 'mobile.title': 'Continua sul computer', 'mobile.lead': 'Collega il sensore da un PC, Mac o computer Linux con Bluetooth.', 'mobile.step1': 'Apri Chrome, Edge o un altro browser Chromium.', 'mobile.step2': 'Visita lo stesso indirizzo.', 'mobile.step3': 'Attiva il Bluetooth e collega LYWSD02 / MHO-C303.', 'mobile.copy': 'Copia indirizzo dashboard', 'mobile.privacy': 'Connessione locale. Nessun account e nessun dato inviato a un server.', 'header.language': 'Lingua',
      'hero.eyebrow': 'Orologio termometro-igrometro Xiaomi Mijia', 'hero.title': "Sincronizza i tuoi orologi LYWSD02 e MHO-C303.", 'hero.lead': 'Leggi le misure in tempo reale, correggi lo scarto dell’orologio e recupera i dati memorizzati nel sensore.', 'hero.local': 'Bluetooth locale', 'hero.noAccount': 'Nessun account', 'hero.noCloud': 'Nessun dato inviato', 'hero.imageAlt': 'Termometro, igrometro e orologio Bluetooth Xiaomi Mijia LYWSD02',
      'connection.kicker': 'Connessione', 'connection.title': 'Sensore attivo', 'connection.disconnected': 'Disconnesso', 'connection.noDevice': 'Nessun sensore selezionato', 'connection.idWaiting': 'ID browser in attesa', 'connection.rename': 'Rinomina', 'connection.detect': 'Trova un sensore', 'connection.autoRetry': 'Riconnessione automatica', 'connection.retryDefault': 'Fino a 10 tentativi progressivi dopo un’interruzione.', 'connection.multiTitle': 'Più LYWSD02 / MHO-C303?', 'connection.multiText': 'Collega ogni sensore una volta e assegnagli un nome locale. ID e ultima connessione restano su questo computer.',
      'devices.title': 'Cronologia dispositivi', 'devices.subtitle': 'Salvata solo in questo browser', 'devices.empty': 'Nessun sensore collegato in precedenza.', 'devices.lastConnected': 'Ultima connessione {date}', 'devices.connections': '{count} connessioni', 'devices.reconnect': 'Riconnetti', 'devices.reselect': 'Seleziona di nuovo', 'devices.remove': 'Rimuovi dalla cronologia',
      'metric.temperature': 'Temperatura', 'metric.current': 'Misura attuale', 'metric.updates': '{count} aggiornamenti', 'metric.humidity': 'Umidità', 'metric.relative': 'Umidità relativa', 'metric.battery': 'Batteria', 'metric.remaining': 'Livello residuo', 'metric.batteryLow': 'Batteria scarica', 'metric.deviceTime': 'Ora dispositivo', 'metric.timezoneUnread': 'Fuso non letto', 'metric.refreshTime': 'Aggiorna ora dispositivo', 'metric.drift': 'Scarto {value}', 'metric.driftUnknown': 'Scarto --',
      'settings.kicker': 'Display', 'settings.title': 'Orologio e unità', 'settings.timezone': 'Fuso orario', 'settings.systemTimezone': 'Fuso del sistema', 'settings.timeFormat': 'Formato ora', 'settings.unit': 'Unità temperatura', 'settings.correction': 'Correzione singola', 'settings.autoClock': 'Correggi automaticamente scarti superiori a 10 secondi', 'settings.sync': 'Sincronizza orologio', 'settings.saveUnit': 'Salva unità',
      'settings.timeFormatHint': 'Formato 12 h: solo LYWSD02MMC.', 'ha.kicker': 'Automazione', 'ha.title': 'Tieni ogni orologio all’ora esatta con Home Assistant', 'ha.lead': "Sincronizza automaticamente LYWSD02, LYWSD02MMC e MHO-C303, inclusi i cambi dell’ora legale. Leggi temperatura, umidità, batteria e storico orario. Senza YAML né cloud.", 'ha.step1': 'Aggiungi LYWSD02 Clock Sync a HACS.', 'ha.step2': 'Scaricala, poi riavvia Home Assistant.', 'ha.step3': 'Accetta l’orologio rilevato o aggiungilo tu.', 'ha.hacsButton': 'Apri in HACS', 'ha.addButton': 'Aggiungi un orologio', 'ha.point1': 'Ogni notte alle 04:00 per impostazione predefinita', 'ha.point2': 'Giornaliera, settimanale, mensile o cron', 'ha.point3': 'Ora legale corretta entro un’ora', 'ha.point4': 'Compatibile con i proxy Bluetooth ESPHome', 'ha.note': 'Richiede HACS e il Bluetooth in Home Assistant: un adattatore locale o un proxy con connessioni attive.', 'ha.guide': 'Leggi la guida',
      'history.kicker': 'Memoria interna', 'history.title': 'Cronologia oraria', 'history.count': '{count} record', 'history.limit': 'Ultimi record', 'history.hours24': '24 ore', 'history.hours48': '48 ore', 'history.hours96': '96 ore', 'history.read': 'Leggi', 'history.export': 'Esporta cronologia CSV', 'history.statusDefault': 'Il sensore memorizza minimi e massimi con data e ora.', 'history.emptyConnect': 'Collega un sensore per leggerne la memoria.', 'history.emptyLoaded': 'Nessuna cronologia caricata per questo sensore.', 'history.empty': 'Nessun record disponibile.', 'history.date': 'Data', 'history.tempMin': 'Temp. min', 'history.tempMax': 'Temp. max', 'history.humidity': 'Umidità',
      'logs.kicker': 'Diagnostica locale', 'logs.title': 'Registro attività', 'logs.clear': 'Cancella', 'logs.empty': 'Gli eventi Bluetooth appariranno qui.', 'footer.project': 'Progetto open source con licenza MIT.', 'footer.privacy': 'Le misure restano nel browser.', 'rename.kicker': 'Identificazione locale', 'rename.title': 'Assegna un nome al sensore', 'rename.lead': 'Il nome viene salvato solo in questo browser.', 'rename.label': 'Nome sensore', 'rename.placeholder': 'Es. Soggiorno', 'rename.close': 'Chiudi', 'rename.cancel': 'Annulla', 'rename.save': 'Salva', 'noscript': 'JavaScript deve essere attivo per comunicare con LYWSD02 / MHO-C303 via Bluetooth.',
      'copy.success': 'Indirizzo copiato.', 'copy.failure': 'Copia non riuscita. Annota l’indirizzo.', 'button.connecting': 'Connessione', 'button.cancelConnection': 'Annulla connessione', 'button.disconnect': 'Disconnetti', 'status.selecting': 'Selezione...', 'status.connecting': 'Connessione...', 'status.retry': 'Nuovo tentativo {current}/{total}', 'status.connected': 'Connesso', 'status.failed': 'Connessione fallita', 'status.lost': 'Connessione persa', 'status.https': 'HTTPS richiesto', 'status.incompatible': 'Non supportato', 'status.bluetoothOff': 'Bluetooth spento',
      'retry.select': 'Seleziona un LYWSD02 / MHO-C303 nella finestra del browser.', 'retry.none': 'Nessun sensore selezionato.', 'retry.attempt': 'Tentativo 1/{total}', 'retry.reconnectAttempt': 'Riconnessione automatica 1/{total}', 'retry.scheduled': 'Nuovo tentativo tra {seconds} s...', 'retry.ready': 'Monitoraggio attivo. Riconnessione pronta.', 'retry.active': 'Monitoraggio attivo.', 'retry.failure': 'Connessione impossibile dopo {count} tentativi.', 'retry.disabled': 'Riconnessione automatica disattivata.', 'retry.manual': 'Disconnessione richiesta. Nessun nuovo tentativo.', 'retry.cancelled': 'Connessione annullata su richiesta. Nessun nuovo tentativo automatico.', 'retry.on': 'Fino a 10 tentativi progressivi dopo un’interruzione.', 'retry.off': 'Nessun tentativo dopo un’interruzione.', 'retry.mismatch': 'Questo sensore non è {name}. Seleziona l’ID corretto.',
      'history.reading': 'Lettura memoria sensore...', 'history.none': 'La memoria non contiene record.', 'history.loaded': '{count} record caricati su {stored}.', 'history.failed': 'Il firmware non ha restituito la memoria.', 'drift.synced': 'sincronizzato', 'drift.ahead': '{seconds} s avanti', 'drift.behind': '{seconds} s indietro',
      'compat.httpsTitle': 'Connessione sicura richiesta', 'compat.httpsText': 'Web Bluetooth funziona solo in HTTPS. Apri la versione GitHub Pages.', 'compat.browserTitle': 'Browser non compatibile', 'compat.browserText': 'Usa Chrome, Edge o un browser Chromium su Windows, macOS o Linux. Safari e Firefox non supportano Web Bluetooth.', 'compat.bluetoothTitle': 'Bluetooth disattivato', 'compat.bluetoothText': 'Attiva l’adattatore Bluetooth e ricarica la pagina.',
      'log.storage': 'Memoria locale non disponibile; le impostazioni non verranno ricordate.', 'log.chooser': 'Apertura selettore Bluetooth...', 'log.selectionCancelled': 'Selezione annullata.', 'log.connectionCancelled': 'Connessione annullata su richiesta.', 'log.selectionFailed': 'Selezione non riuscita: {error}.', 'log.connected': 'Connesso a {name}.', 'log.attemptFailed': 'Tentativo {attempt} fallito: {error}.', 'log.connectionFailed': 'Connessione fallita: {error}.', 'log.interrupted': 'Connessione Bluetooth interrotta.', 'log.disconnected': 'Sensore disconnesso.', 'log.readUnavailable': '{label} non disponibile: {error}.', 'log.invalidMeasurement': 'Misura ricevuta in formato inatteso.', 'log.timeRefreshed': 'Ora del dispositivo aggiornata.', 'log.timeSynced': 'Orologio sincronizzato in modalità {mode} h ({timezone}).', 'log.timeSyncedNoFormat': 'Orologio sincronizzato ({timezone}).', 'log.clockFormatUnsupported': 'Questo sensore non ha accettato il formato 12 h: solo il LYWSD02MMC supporta il passaggio 12/24 h.', 'log.autoTimeSynced': 'Lo scarto superava 10 secondi ed è stato corretto automaticamente.', 'log.timeSyncFailed': 'Sincronizzazione fallita: {error}.', 'log.unitSet': 'Unità impostata su °{unit}.', 'log.unitFailed': 'Impossibile impostare l’unità: {error}.', 'log.historyReading': 'Lettura cronologia interna...', 'log.historyNone': 'Nessun record nel sensore.', 'log.historyLoaded': '{count} record storici caricati.', 'log.historyFailed': 'Lettura cronologia fallita: {error}.', 'log.historyExported': 'Cronologia esportata in CSV.', 'log.renamed': 'Sensore rinominato “{name}” nel browser.', 'log.removed': '{name} rimosso dalla cronologia.', 'log.ready': 'Dashboard pronta. Tutti gli scambi restano locali.', 'log.adapterAvailable': 'Adattatore Bluetooth disponibile.', 'log.fractionalZone': 'Il fuso {timezone} viene compensato automaticamente.',
      'read.battery': 'Lettura batteria', 'read.unit': 'Lettura unità', 'read.time': 'Lettura ora', 'error.unknown': 'errore sconosciuto', 'error.network': 'connessione Bluetooth interrotta', 'error.notFound': 'servizio LYWSD02 / MHO-C303 non trovato o selezione annullata', 'error.notSupported': 'funzione Bluetooth non supportata', 'error.security': 'accesso Bluetooth bloccato', 'error.notAllowed': 'permesso Bluetooth negato', 'error.timeIncomplete': 'valore ora incompleto', 'error.historyIncomplete': 'contatore cronologia incompleto'
    },
    de: {
      "protocol.refreshMeasurements": "Messwerte aktualisieren",
      "protocol.extraMeasurements": "Weitere Messwerte",
      "protocol.soilMoisture": "Bodenfeuchte",
      "protocol.conductivity": "Bodenleitfähigkeit",
      "protocol.illuminance": "Beleuchtungsstärke",
      "protocol.sensors": "Original-Firmware · Sensoren (experimentell)",
      "protocol.sampleHistoryTitle": "Gespeicherte Messwerte",
      "protocol.supportMatrix": "Experimentelle Profile und Geräteprotokolle",
      "protocol.label": "Gerät / Firmware",
      "protocol.stock": "LYWSD02 / MHO-C303 — Original-Firmware",
      "protocol.pvvx": "PVVX BLE — experimentell",
      "protocol.cgd1": "CGD1 — Original-Firmware, experimentell",
      "protocol.token": "Vorhandenes CGD1-Kopplungstoken (32 Hexadezimalzeichen)",
      "protocol.note": "Die neuen Profile verwenden dokumentierte Befehle und simulierte Tests; Gerätetests stehen aus. PVVX muss installiert sein. Das vorhandene CGD1-Token bleibt nur in dieser Browsersitzung.",
      "protocol.clockAcknowledged": "Uhrzeit bestätigt; Auslesen der Uhrzeit nicht verfügbar.",
      "protocol.sampleHistory": "Gemittelte PVVX-Messwerte. Zeitstempel stammen vom Gerät, ohne bestätigte UTC-Umrechnung.",
      "protocol.deviceTimestamp": "Gerätezeit (unverändert)",
      "protocol.batteryVoltage": "Batteriespannung",
      "compatibility.stockFirmware": "Original-Firmware",
      "compatibility.photoCredits": "Bildnachweise",
      'compatibility.models': "Kompatible Uhren: LYWSD02 · LYWSD02MMC · MHO-C303",
      'compatibility.note': "MHO-C303-Gerätetest: in Home Assistant bestätigt; Browserprüfung steht noch aus.",
      'ha.credit': "MHO-C303-Unterstützung beigetragen und getestet von",
      'skip': 'Zum Dashboard', 'mobile.title': 'Am Computer fortfahren', 'mobile.lead': 'Verbinde den Sensor über einen Bluetooth-fähigen Windows-, Mac- oder Linux-Computer.', 'mobile.step1': 'Chrome, Edge oder einen Chromium-Browser öffnen.', 'mobile.step2': 'Dieselbe Adresse aufrufen.', 'mobile.step3': 'Bluetooth einschalten und LYWSD02 / MHO-C303 verbinden.', 'mobile.copy': 'Dashboard-Adresse kopieren', 'mobile.privacy': 'Lokale Verbindung. Kein Konto und keine Übertragung an einen Server.', 'header.language': 'Sprache',
      'hero.eyebrow': 'Xiaomi Mijia Thermometer-Hygrometer mit Uhr', 'hero.title': "Synchronisiere deine LYWSD02- und MHO-C303-Uhren.", 'hero.lead': 'Live-Messwerte lesen, die Uhrabweichung korrigieren und gespeicherte Sensordaten abrufen.', 'hero.local': 'Lokales Bluetooth', 'hero.noAccount': 'Kein Konto', 'hero.noCloud': 'Kein Upload', 'hero.imageAlt': 'Xiaomi Mijia LYWSD02 Bluetooth-Thermometer, Hygrometer und Uhr',
      'connection.kicker': 'Verbindung', 'connection.title': 'Aktiver Sensor', 'connection.disconnected': 'Getrennt', 'connection.noDevice': 'Kein Sensor ausgewählt', 'connection.idWaiting': 'Browser-ID ausstehend', 'connection.rename': 'Umbenennen', 'connection.detect': 'Sensor suchen', 'connection.autoRetry': 'Automatisch neu verbinden', 'connection.retryDefault': 'Bis zu 10 ansteigende Versuche nach Abbruch.', 'connection.multiTitle': 'Mehrere LYWSD02 / MHO-C303?', 'connection.multiText': 'Jeden Sensor einmal verbinden und lokal benennen. Browser-ID und letzte Verbindung bleiben auf diesem Computer gespeichert.',
      'devices.title': 'Geräteverlauf', 'devices.subtitle': 'Nur in diesem Browser gespeichert', 'devices.empty': 'Kein zuvor verbundener Sensor.', 'devices.lastConnected': 'Zuletzt verbunden {date}', 'devices.connections': '{count} Verbindungen', 'devices.reconnect': 'Neu verbinden', 'devices.reselect': 'Erneut auswählen', 'devices.remove': 'Aus Verlauf entfernen',
      'metric.temperature': 'Temperatur', 'metric.current': 'Aktueller Messwert', 'metric.updates': '{count} Aktualisierungen', 'metric.humidity': 'Luftfeuchte', 'metric.relative': 'Relative Luftfeuchte', 'metric.battery': 'Batterie', 'metric.remaining': 'Restladung', 'metric.batteryLow': 'Batterie schwach', 'metric.deviceTime': 'Gerätezeit', 'metric.timezoneUnread': 'Zeitzone nicht gelesen', 'metric.refreshTime': 'Gerätezeit aktualisieren', 'metric.drift': 'Abweichung {value}', 'metric.driftUnknown': 'Abweichung --',
      'settings.kicker': 'Anzeige', 'settings.title': 'Uhr und Einheit', 'settings.timezone': 'Zeitzone', 'settings.systemTimezone': 'Systemzeitzone', 'settings.timeFormat': 'Zeitformat', 'settings.unit': 'Temperatureinheit', 'settings.correction': 'Einmalige Korrektur', 'settings.autoClock': 'Uhrabweichung über 10 Sekunden automatisch korrigieren', 'settings.sync': 'Uhr synchronisieren', 'settings.saveUnit': 'Einheit speichern',
      'settings.timeFormatHint': '12-Stunden-Anzeige: nur LYWSD02MMC.', 'ha.kicker': 'Automatisierung', 'ha.title': 'Jede Uhr pünktlich mit Home Assistant', 'ha.lead': "Synchronisiere LYWSD02, LYWSD02MMC und MHO-C303 automatisch, auch bei Zeitumstellungen. Lies Temperatur, Luftfeuchte, Batterie und Stundenverlauf. Ohne YAML und Cloud.", 'ha.step1': 'LYWSD02 Clock Sync zu HACS hinzufügen.', 'ha.step2': 'Herunterladen und Home Assistant neu starten.', 'ha.step3': 'Die erkannte Uhr bestätigen oder selbst hinzufügen.', 'ha.hacsButton': 'In HACS öffnen', 'ha.addButton': 'Uhr hinzufügen', 'ha.point1': 'Standardmäßig jede Nacht um 04:00', 'ha.point2': 'Täglich, wöchentlich, monatlich oder per Cron', 'ha.point3': 'Zeitumstellung innerhalb einer Stunde korrigiert', 'ha.point4': 'Funktioniert mit ESPHome-Bluetooth-Proxys', 'ha.note': 'Erfordert HACS und Bluetooth in Home Assistant: einen lokalen Adapter oder einen Proxy mit aktiven Verbindungen.', 'ha.guide': 'Anleitung lesen',
      'history.kicker': 'Interner Speicher', 'history.title': 'Stundenverlauf', 'history.count': '{count} Einträge', 'history.limit': 'Neueste Einträge', 'history.hours24': '24 Stunden', 'history.hours48': '48 Stunden', 'history.hours96': '96 Stunden', 'history.read': 'Lesen', 'history.export': 'Verlauf als CSV exportieren', 'history.statusDefault': 'Der Sensor speichert zeitgestempelte Minimal- und Maximalwerte.', 'history.emptyConnect': 'Sensor verbinden, um seinen Speicher zu lesen.', 'history.emptyLoaded': 'Kein Verlauf für diesen Sensor geladen.', 'history.empty': 'Keine Einträge verfügbar.', 'history.date': 'Datum', 'history.tempMin': 'Temp. min.', 'history.tempMax': 'Temp. max.', 'history.humidity': 'Luftfeuchte',
      'logs.kicker': 'Lokale Diagnose', 'logs.title': 'Aktivitätsprotokoll', 'logs.clear': 'Leeren', 'logs.empty': 'Bluetooth-Ereignisse erscheinen hier.', 'footer.project': 'Open-Source-Projekt unter MIT-Lizenz.', 'footer.privacy': 'Messwerte bleiben im Browser.', 'rename.kicker': 'Lokale Kennzeichnung', 'rename.title': 'Sensor benennen', 'rename.lead': 'Der Name wird nur in diesem Browser gespeichert.', 'rename.label': 'Sensorname', 'rename.placeholder': 'z. B. Wohnzimmer', 'rename.close': 'Schließen', 'rename.cancel': 'Abbrechen', 'rename.save': 'Speichern', 'noscript': 'JavaScript muss für die Bluetooth-Kommunikation mit LYWSD02 / MHO-C303 aktiviert sein.',
      'copy.success': 'Adresse kopiert.', 'copy.failure': 'Kopieren fehlgeschlagen. Adresse bitte notieren.', 'button.connecting': 'Verbindung läuft', 'button.cancelConnection': 'Verbindung abbrechen', 'button.disconnect': 'Trennen', 'status.selecting': 'Auswahl...', 'status.connecting': 'Verbinden...', 'status.retry': 'Neuer Versuch {current}/{total}', 'status.connected': 'Verbunden', 'status.failed': 'Verbindung fehlgeschlagen', 'status.lost': 'Verbindung verloren', 'status.https': 'HTTPS erforderlich', 'status.incompatible': 'Nicht unterstützt', 'status.bluetoothOff': 'Bluetooth aus',
      'retry.select': 'LYWSD02 / MHO-C303 im Browserfenster auswählen.', 'retry.none': 'Kein Sensor ausgewählt.', 'retry.attempt': 'Versuch 1/{total}', 'retry.reconnectAttempt': 'Automatische Verbindung 1/{total}', 'retry.scheduled': 'Neuer Versuch in {seconds} s...', 'retry.ready': 'Überwachung aktiv. Neuverbindung bereit.', 'retry.active': 'Überwachung aktiv.', 'retry.failure': 'Nach {count} Versuchen keine Verbindung.', 'retry.disabled': 'Automatische Neuverbindung deaktiviert.', 'retry.manual': 'Manuell getrennt. Kein automatischer Versuch.', 'retry.cancelled': 'Verbindung auf Wunsch abgebrochen. Kein automatischer Versuch.', 'retry.on': 'Bis zu 10 ansteigende Versuche nach Abbruch.', 'retry.off': 'Kein Versuch nach Abbruch.', 'retry.mismatch': 'Dieser Sensor ist nicht {name}. Passende Browser-ID auswählen.',
      'history.reading': 'Sensorspeicher wird gelesen...', 'history.none': 'Der Sensorspeicher enthält keine Einträge.', 'history.loaded': '{count} von {stored} Einträgen geladen.', 'history.failed': 'Diese Firmware lieferte den Speicher nicht.', 'drift.synced': 'synchron', 'drift.ahead': '{seconds} s vor', 'drift.behind': '{seconds} s nach',
      'compat.httpsTitle': 'Sichere Verbindung erforderlich', 'compat.httpsText': 'Web Bluetooth funktioniert nur über HTTPS. Die veröffentlichte GitHub-Pages-Version öffnen.', 'compat.browserTitle': 'Browser nicht kompatibel', 'compat.browserText': 'Chrome, Edge oder Chromium unter Windows, macOS oder Linux verwenden. Safari und Firefox unterstützen Web Bluetooth nicht.', 'compat.bluetoothTitle': 'Bluetooth deaktiviert', 'compat.bluetoothText': 'Bluetooth-Adapter einschalten und Seite neu laden.',
      'log.storage': 'Lokaler Speicher nicht verfügbar; Einstellungen werden nicht gemerkt.', 'log.chooser': 'Bluetooth-Auswahl wird geöffnet...', 'log.selectionCancelled': 'Sensorauswahl abgebrochen.', 'log.connectionCancelled': 'Verbindung auf Wunsch abgebrochen.', 'log.selectionFailed': 'Auswahl fehlgeschlagen: {error}.', 'log.connected': 'Mit {name} verbunden.', 'log.attemptFailed': 'Versuch {attempt} fehlgeschlagen: {error}.', 'log.connectionFailed': 'Verbindung fehlgeschlagen: {error}.', 'log.interrupted': 'Bluetooth-Verbindung unterbrochen.', 'log.disconnected': 'Sensor getrennt.', 'log.readUnavailable': '{label} nicht verfügbar: {error}.', 'log.invalidMeasurement': 'Messwert in unerwartetem Format empfangen.', 'log.timeRefreshed': 'Gerätezeit aktualisiert.', 'log.timeSynced': 'Uhr im {mode}-Stundenmodus synchronisiert ({timezone}).', 'log.timeSyncedNoFormat': 'Uhr synchronisiert ({timezone}).', 'log.clockFormatUnsupported': 'Dieser Sensor hat das 12-Stunden-Format nicht übernommen: Nur der LYWSD02MMC unterstützt die 12/24-Stunden-Umschaltung.', 'log.autoTimeSynced': 'Eine Abweichung über 10 Sekunden wurde automatisch korrigiert.', 'log.timeSyncFailed': 'Synchronisierung fehlgeschlagen: {error}.', 'log.unitSet': 'Einheit auf °{unit} gesetzt.', 'log.unitFailed': 'Einheit konnte nicht gesetzt werden: {error}.', 'log.historyReading': 'Interner Verlauf wird gelesen...', 'log.historyNone': 'Keine Einträge im Sensor.', 'log.historyLoaded': '{count} Verlaufseinträge geladen.', 'log.historyFailed': 'Verlauf konnte nicht gelesen werden: {error}.', 'log.historyExported': 'Verlauf als CSV exportiert.', 'log.renamed': 'Sensor in diesem Browser „{name}“ genannt.', 'log.removed': '{name} aus dem Geräteverlauf entfernt.', 'log.ready': 'Dashboard bereit. Alle Daten bleiben lokal.', 'log.adapterAvailable': 'Bluetooth-Adapter verfügbar.', 'log.fractionalZone': 'Die Zeitzone {timezone} wird automatisch ausgeglichen.',
      'read.battery': 'Batteriestand', 'read.unit': 'Einheit', 'read.time': 'Uhrzeit', 'error.unknown': 'unbekannter Fehler', 'error.network': 'Bluetooth-Verbindung unterbrochen', 'error.notFound': 'LYWSD02 / MHO-C303-Dienst nicht gefunden oder Auswahl abgebrochen', 'error.notSupported': 'Bluetooth-Funktion nicht unterstützt', 'error.security': 'Bluetooth-Zugriff blockiert', 'error.notAllowed': 'Bluetooth-Berechtigung verweigert', 'error.timeIncomplete': 'unvollständiger Zeitwert', 'error.historyIncomplete': 'unvollständiger Verlaufszähler'
    },
    ar: {
      "protocol.refreshMeasurements": "تحديث القياسات",
      "protocol.extraMeasurements": "قياسات إضافية",
      "protocol.soilMoisture": "رطوبة التربة",
      "protocol.conductivity": "موصلية التربة",
      "protocol.illuminance": "الاستضاءة",
      "protocol.sensors": "البرنامج الأصلي · حساسات تجريبية",
      "protocol.sampleHistoryTitle": "القياسات المسجلة",
      "protocol.supportMatrix": "الملفات التجريبية وبحث الأجهزة",
      "protocol.label": "الجهاز / البرنامج الثابت",
      "protocol.stock": "LYWSD02 / MHO-C303 — البرنامج الأصلي",
      "protocol.pvvx": "PVVX BLE — تجريبي",
      "protocol.cgd1": "CGD1 — البرنامج الأصلي، تجريبي",
      "protocol.token": "رمز اقتران CGD1 الحالي (32 رمزًا سداسيًا عشريًا)",
      "protocol.note": "تستخدم الملفات الجديدة أوامر موثقة واختبارات محاكاة؛ التحقق الفعلي لم يكتمل. يجب تثبيت PVVX مسبقًا. يبقى رمز CGD1 الحالي في جلسة المتصفح فقط.",
      "protocol.clockAcknowledged": "تم قبول ضبط الوقت؛ قراءة الساعة غير متاحة.",
      "protocol.sampleHistory": "متوسطات PVVX. الأوقات خاصة بالجهاز وليست UTC مؤكدة.",
      "protocol.deviceTimestamp": "وقت الجهاز الخام",
      "protocol.batteryVoltage": "جهد البطارية",
      "compatibility.stockFirmware": "البرنامج الثابت الأصلي",
      "compatibility.photoCredits": "مصادر الصور",
      'compatibility.models': "الساعات المتوافقة: LYWSD02 · LYWSD02MMC · MHO-C303",
      'compatibility.note': "اختبار MHO-C303 الفعلي: مؤكد في Home Assistant؛ التحقق عبر المتصفح ما زال مطلوبًا.",
      'ha.credit': "أضاف دعم MHO-C303 واختبره",
      'skip': 'الانتقال إلى لوحة التحكم', 'mobile.title': 'تابع على جهاز الكمبيوتر', 'mobile.lead': 'اتصل بالمستشعر من كمبيوتر Windows أو Mac أو Linux مزود بالبلوتوث.', 'mobile.step1': 'افتح Chrome أو Edge أو متصفح Chromium آخر.', 'mobile.step2': 'افتح العنوان نفسه.', 'mobile.step3': 'شغّل البلوتوث ثم اتصل بجهاز LYWSD02 / MHO-C303.', 'mobile.copy': 'نسخ عنوان لوحة التحكم', 'mobile.privacy': 'اتصال محلي. لا حساب ولا إرسال لبيانات المستشعر إلى خادم.', 'header.language': 'اللغة',
      'hero.eyebrow': 'ساعة ومقياس حرارة ورطوبة Xiaomi Mijia', 'hero.title': "زامن ساعات LYWSD02 وMHO-C303.", 'hero.lead': 'اعرض القياسات مباشرة وصحح انحراف الساعة واسترجع السجلات المحفوظة داخل المستشعر.', 'hero.local': 'بلوتوث محلي', 'hero.noAccount': 'من دون حساب', 'hero.noCloud': 'لا رفع للبيانات', 'hero.imageAlt': 'مقياس حرارة ورطوبة وساعة بلوتوث Xiaomi Mijia LYWSD02',
      'connection.kicker': 'الاتصال', 'connection.title': 'المستشعر النشط', 'connection.disconnected': 'غير متصل', 'connection.noDevice': 'لم يتم اختيار مستشعر', 'connection.idWaiting': 'معرّف المتصفح قيد الانتظار', 'connection.rename': 'إعادة التسمية', 'connection.detect': 'البحث عن مستشعر', 'connection.autoRetry': 'إعادة الاتصال تلقائيًا', 'connection.retryDefault': 'حتى 10 محاولات متدرجة بعد انقطاع الاتصال.', 'connection.multiTitle': 'لديك عدة أجهزة LYWSD02 / MHO-C303؟', 'connection.multiText': 'اتصل بكل مستشعر مرة وامنحه اسمًا محليًا. يُحفظ معرّف المتصفح وآخر اتصال على هذا الكمبيوتر.',
      'devices.title': 'سجل الأجهزة', 'devices.subtitle': 'محفوظ في هذا المتصفح فقط', 'devices.empty': 'لا توجد مستشعرات متصلة سابقًا.', 'devices.lastConnected': 'آخر اتصال {date}', 'devices.connections': '{count} اتصالات', 'devices.reconnect': 'إعادة الاتصال', 'devices.reselect': 'الاختيار مجددًا', 'devices.remove': 'حذف من السجل',
      'metric.temperature': 'درجة الحرارة', 'metric.current': 'القراءة الحالية', 'metric.updates': '{count} تحديثات', 'metric.humidity': 'الرطوبة', 'metric.relative': 'الرطوبة النسبية', 'metric.battery': 'البطارية', 'metric.remaining': 'المستوى المتبقي', 'metric.batteryLow': 'البطارية منخفضة', 'metric.deviceTime': 'وقت الجهاز', 'metric.timezoneUnread': 'لم تُقرأ المنطقة الزمنية', 'metric.refreshTime': 'تحديث وقت الجهاز', 'metric.drift': 'الانحراف {value}', 'metric.driftUnknown': 'الانحراف --',
      'settings.kicker': 'الشاشة', 'settings.title': 'الساعة والوحدة', 'settings.timezone': 'المنطقة الزمنية', 'settings.systemTimezone': 'منطقة النظام', 'settings.timeFormat': 'تنسيق الوقت', 'settings.unit': 'وحدة الحرارة', 'settings.correction': 'تصحيح لمرة واحدة', 'settings.autoClock': 'تصحيح انحراف الساعة تلقائيًا إذا تجاوز 10 ثوانٍ', 'settings.sync': 'مزامنة الساعة', 'settings.saveUnit': 'حفظ الوحدة',
      'settings.timeFormatHint': 'عرض 12 ساعة: LYWSD02MMC فقط.', 'ha.kicker': 'الأتمتة', 'ha.title': 'اجعل كل ساعة على الوقت الصحيح مع Home Assistant', 'ha.lead': "زامن ساعات LYWSD02 وLYWSD02MMC وMHO-C303 تلقائيًا، بما في ذلك تغييرات التوقيت الصيفي. اقرأ الحرارة والرطوبة والبطارية والسجل بالساعة. دون YAML أو سحابة.", 'ha.step1': 'أضف LYWSD02 Clock Sync إلى HACS.', 'ha.step2': 'نزّله ثم أعد تشغيل Home Assistant.', 'ha.step3': 'اقبل الساعة المكتشفة أو أضفها بنفسك.', 'ha.hacsButton': 'فتح في HACS', 'ha.addButton': 'إضافة ساعة', 'ha.point1': 'كل ليلة عند 04:00 افتراضيًا', 'ha.point2': 'يوميًا أو أسبوعيًا أو شهريًا أو عبر cron', 'ha.point3': 'تصحيح التوقيت الصيفي خلال ساعة', 'ha.point4': 'يعمل مع وكلاء بلوتوث ESPHome', 'ha.note': 'يتطلب HACS والبلوتوث في Home Assistant: محوّلًا محليًا أو وكيلًا يدعم الاتصالات النشطة.', 'ha.guide': 'اقرأ الدليل',
      'history.kicker': 'الذاكرة الداخلية', 'history.title': 'السجل بالساعة', 'history.count': '{count} سجلات', 'history.limit': 'أحدث السجلات', 'history.hours24': '24 ساعة', 'history.hours48': '48 ساعة', 'history.hours96': '96 ساعة', 'history.read': 'قراءة', 'history.export': 'تصدير السجل بصيغة CSV', 'history.statusDefault': 'يحفظ المستشعر القيم الدنيا والعليا مع الوقت.', 'history.emptyConnect': 'اتصل بمستشعر لقراءة ذاكرته.', 'history.emptyLoaded': 'لم يُحمّل سجل لهذا المستشعر.', 'history.empty': 'لا توجد سجلات.', 'history.date': 'التاريخ', 'history.tempMin': 'أدنى حرارة', 'history.tempMax': 'أعلى حرارة', 'history.humidity': 'الرطوبة',
      'logs.kicker': 'تشخيص محلي', 'logs.title': 'سجل النشاط', 'logs.clear': 'مسح', 'logs.empty': 'ستظهر أحداث البلوتوث هنا.', 'footer.project': 'مشروع مفتوح المصدر بترخيص MIT.', 'footer.privacy': 'تبقى القياسات داخل متصفحك.', 'rename.kicker': 'تعريف محلي', 'rename.title': 'تسمية هذا المستشعر', 'rename.lead': 'يُحفظ الاسم في هذا المتصفح فقط.', 'rename.label': 'اسم المستشعر', 'rename.placeholder': 'مثال: غرفة المعيشة', 'rename.close': 'إغلاق', 'rename.cancel': 'إلغاء', 'rename.save': 'حفظ', 'noscript': 'يجب تفعيل JavaScript للاتصال بجهاز LYWSD02 / MHO-C303 عبر البلوتوث.',
      'copy.success': 'تم نسخ العنوان.', 'copy.failure': 'تعذر النسخ. دوّن العنوان أعلاه.', 'button.connecting': 'جارٍ الاتصال', 'button.cancelConnection': 'إيقاف الاتصال', 'button.disconnect': 'قطع الاتصال', 'status.selecting': 'جارٍ الاختيار...', 'status.connecting': 'جارٍ الاتصال...', 'status.retry': 'محاولة {current}/{total}', 'status.connected': 'متصل', 'status.failed': 'فشل الاتصال', 'status.lost': 'انقطع الاتصال', 'status.https': 'يلزم HTTPS', 'status.incompatible': 'غير مدعوم', 'status.bluetoothOff': 'البلوتوث متوقف',
      'retry.select': 'اختر LYWSD02 / MHO-C303 من نافذة المتصفح.', 'retry.none': 'لم يتم اختيار مستشعر.', 'retry.attempt': 'المحاولة 1/{total}', 'retry.reconnectAttempt': 'إعادة الاتصال 1/{total}', 'retry.scheduled': 'محاولة جديدة خلال {seconds} ث...', 'retry.ready': 'المراقبة نشطة وإعادة الاتصال جاهزة.', 'retry.active': 'المراقبة نشطة.', 'retry.failure': 'تعذر الاتصال بعد {count} محاولات.', 'retry.disabled': 'إعادة الاتصال التلقائية متوقفة.', 'retry.manual': 'تم قطع الاتصال يدويًا. لن تحدث محاولة تلقائية.', 'retry.cancelled': 'تم إيقاف الاتصال بناءً على طلبك. لن تحدث محاولة تلقائية.', 'retry.on': 'حتى 10 محاولات متدرجة بعد الانقطاع.', 'retry.off': 'لا إعادة محاولة بعد الانقطاع.', 'retry.mismatch': 'هذا المستشعر ليس {name}. اختر معرّف المتصفح الصحيح.',
      'history.reading': 'جارٍ قراءة ذاكرة المستشعر...', 'history.none': 'ذاكرة المستشعر خالية.', 'history.loaded': 'تم تحميل {count} من أصل {stored} سجلًا.', 'history.failed': 'لم يُرجع هذا البرنامج الثابت الذاكرة.', 'drift.synced': 'متزامن', 'drift.ahead': 'متقدم {seconds} ث', 'drift.behind': 'متأخر {seconds} ث',
      'compat.httpsTitle': 'يلزم اتصال آمن', 'compat.httpsText': 'يعمل Web Bluetooth عبر HTTPS فقط. افتح نسخة GitHub Pages المنشورة.', 'compat.browserTitle': 'المتصفح غير متوافق', 'compat.browserText': 'استخدم Chrome أو Edge أو Chromium على Windows أو macOS أو Linux. لا يدعم Safari وFirefox خدمة Web Bluetooth.', 'compat.bluetoothTitle': 'البلوتوث متوقف', 'compat.bluetoothText': 'شغّل محول البلوتوث ثم أعد تحميل الصفحة.',
      'log.storage': 'التخزين المحلي غير متاح؛ لن تُحفظ الإعدادات.', 'log.chooser': 'جارٍ فتح محدد أجهزة البلوتوث...', 'log.selectionCancelled': 'تم إلغاء اختيار المستشعر.', 'log.connectionCancelled': 'تم إيقاف الاتصال بناءً على طلبك.', 'log.selectionFailed': 'تعذر الاختيار: {error}.', 'log.connected': 'تم الاتصال بـ {name}.', 'log.attemptFailed': 'فشلت المحاولة {attempt}: {error}.', 'log.connectionFailed': 'فشل الاتصال: {error}.', 'log.interrupted': 'انقطع اتصال البلوتوث.', 'log.disconnected': 'تم قطع المستشعر.', 'log.readUnavailable': '{label} غير متاح: {error}.', 'log.invalidMeasurement': 'وصل قياس بتنسيق غير متوقع.', 'log.timeRefreshed': 'تم تحديث وقت الجهاز.', 'log.timeSynced': 'تمت مزامنة الساعة بنظام {mode} ساعة ({timezone}).', 'log.timeSyncedNoFormat': 'تمت مزامنة الساعة ({timezone}).', 'log.clockFormatUnsupported': 'لم يقبل هذا المستشعر نظام 12 ساعة: التبديل بين نظامي 12/24 ساعة مدعوم في LYWSD02MMC فقط.', 'log.autoTimeSynced': 'تم تصحيح انحراف تجاوز 10 ثوانٍ تلقائيًا.', 'log.timeSyncFailed': 'فشلت المزامنة: {error}.', 'log.unitSet': 'تم ضبط الوحدة على °{unit}.', 'log.unitFailed': 'تعذر ضبط الوحدة: {error}.', 'log.historyReading': 'جارٍ قراءة السجل الداخلي...', 'log.historyNone': 'لا سجلات في المستشعر.', 'log.historyLoaded': 'تم تحميل {count} سجلًا.', 'log.historyFailed': 'تعذرت قراءة السجل: {error}.', 'log.historyExported': 'تم تصدير السجل بصيغة CSV.', 'log.renamed': 'تمت تسمية المستشعر “{name}” في هذا المتصفح.', 'log.removed': 'تم حذف {name} من سجل الأجهزة.', 'log.ready': 'لوحة التحكم جاهزة. جميع البيانات محلية.', 'log.adapterAvailable': 'محول البلوتوث متاح.', 'log.fractionalZone': 'ستتم معاوضة المنطقة {timezone} تلقائيًا.',
      'read.battery': 'قراءة البطارية', 'read.unit': 'قراءة الوحدة', 'read.time': 'قراءة الوقت', 'error.unknown': 'خطأ غير معروف', 'error.network': 'انقطع اتصال البلوتوث', 'error.notFound': 'خدمة LYWSD02 / MHO-C303 غير موجودة أو أُلغي الاختيار', 'error.notSupported': 'ميزة البلوتوث غير مدعومة', 'error.security': 'منع المتصفح الوصول إلى البلوتوث', 'error.notAllowed': 'رُفض إذن البلوتوث', 'error.timeIncomplete': 'قيمة وقت غير مكتملة', 'error.historyIncomplete': 'عداد سجل غير مكتمل'
    },
    zh: {
      "protocol.refreshMeasurements": "刷新测量值",
      "protocol.extraMeasurements": "其他测量值",
      "protocol.soilMoisture": "土壤湿度",
      "protocol.conductivity": "土壤电导率",
      "protocol.illuminance": "照度",
      "protocol.sensors": "原厂固件 · 实验性传感器",
      "protocol.sampleHistoryTitle": "已记录的采样",
      "protocol.supportMatrix": "实验性配置与设备协议研究",
      "protocol.label": "设备 / 固件",
      "protocol.stock": "LYWSD02 / MHO-C303 — 原厂固件",
      "protocol.pvvx": "PVVX BLE — 实验性",
      "protocol.cgd1": "CGD1 — 原厂固件，实验性",
      "protocol.token": "现有 CGD1 配对令牌（32 位十六进制字符）",
      "protocol.note": "新增配置使用已公开的命令并通过模拟测试，尚待实机验证。PVVX 必须已安装。现有 CGD1 令牌仅保留在本次浏览器会话中。",
      "protocol.clockAcknowledged": "已确认设置时间，但无法回读时钟。",
      "protocol.sampleHistory": "PVVX 平均采样值。时间戳为设备时间，未经 UTC 转换验证。",
      "protocol.deviceTimestamp": "设备原始时间",
      "protocol.batteryVoltage": "电池电压",
      "compatibility.stockFirmware": "原厂固件",
      "compatibility.photoCredits": "图片来源",
      'compatibility.models': "兼容时钟：LYWSD02 · LYWSD02MMC · MHO-C303",
      'compatibility.note': "MHO-C303 实机测试：已在 Home Assistant 中确认，浏览器验证尚待完成。",
      'ha.credit': "MHO-C303 支持的贡献与实机测试来自",
      'skip': '跳到控制面板', 'mobile.title': '请在电脑上继续', 'mobile.lead': '请使用支持蓝牙的 Windows、Mac 或 Linux 电脑连接传感器。', 'mobile.step1': '打开 Chrome、Edge 或其他 Chromium 浏览器。', 'mobile.step2': '访问同一网址。', 'mobile.step3': '开启蓝牙，然后连接 LYWSD02 / MHO-C303。', 'mobile.copy': '复制控制面板地址', 'mobile.privacy': '本地连接，无需账户，传感器数据不会发送到服务器。', 'header.language': '语言',
      'hero.eyebrow': 'Xiaomi Mijia 温湿度监测时钟', 'hero.title': "同步你的 LYWSD02 和 MHO-C303 时钟。", 'hero.lead': '查看实时测量，修正时钟偏差，并读取传感器内部保存的记录。', 'hero.local': '本地蓝牙', 'hero.noAccount': '无需账户', 'hero.noCloud': '不上传数据', 'hero.imageAlt': 'Xiaomi Mijia LYWSD02 蓝牙温湿度计与时钟',
      'connection.kicker': '连接', 'connection.title': '当前传感器', 'connection.disconnected': '未连接', 'connection.noDevice': '未选择传感器', 'connection.idWaiting': '等待浏览器 ID', 'connection.rename': '重命名', 'connection.detect': '查找传感器', 'connection.autoRetry': '自动重连', 'connection.retryDefault': '断开后最多进行 10 次渐进重试。', 'connection.multiTitle': '有多个 LYWSD02 / MHO-C303？', 'connection.multiText': '每个传感器连接一次并设置本地名称。浏览器 ID 和最近连接时间会保存在这台电脑上。',
      'devices.title': '设备历史', 'devices.subtitle': '仅保存在此浏览器', 'devices.empty': '没有以前连接过的传感器。', 'devices.lastConnected': '最近连接：{date}', 'devices.connections': '连接 {count} 次', 'devices.reconnect': '重新连接', 'devices.reselect': '重新选择', 'devices.remove': '从历史中删除',
      'metric.temperature': '温度', 'metric.current': '当前读数', 'metric.updates': '更新 {count} 次', 'metric.humidity': '湿度', 'metric.relative': '相对湿度', 'metric.battery': '电量', 'metric.remaining': '剩余电量', 'metric.batteryLow': '电量低', 'metric.deviceTime': '设备时间', 'metric.timezoneUnread': '未读取时区', 'metric.refreshTime': '刷新设备时间', 'metric.drift': '偏差 {value}', 'metric.driftUnknown': '偏差 --',
      'settings.kicker': '显示', 'settings.title': '时钟与单位', 'settings.timezone': '时区', 'settings.systemTimezone': '系统时区', 'settings.timeFormat': '时间格式', 'settings.unit': '温度单位', 'settings.correction': '单次校正', 'settings.autoClock': '时钟偏差超过 10 秒时自动校正', 'settings.sync': '同步时钟', 'settings.saveUnit': '保存单位',
      'settings.timeFormatHint': '12 小时制显示：仅限 LYWSD02MMC。', 'ha.kicker': '自动化', 'ha.title': '用 Home Assistant 让每个时钟保持准确', 'ha.lead': "自动同步 LYWSD02、LYWSD02MMC 和 MHO-C303 时钟，支持夏令时切换。读取温度、湿度、电量及每小时历史记录。无需 YAML 或云服务。", 'ha.step1': '将 LYWSD02 Clock Sync 添加到 HACS。', 'ha.step2': '下载后重启 Home Assistant。', 'ha.step3': '确认自动发现的时钟，或手动添加。', 'ha.hacsButton': '在 HACS 中打开', 'ha.addButton': '添加时钟', 'ha.point1': '默认每晚 04:00 同步', 'ha.point2': '每天、每周、每月或自定义 cron', 'ha.point3': '夏令时切换一小时内校正', 'ha.point4': '支持 ESPHome 蓝牙代理', 'ha.note': '需要 HACS 以及 Home Assistant 中可用的蓝牙：本地适配器或支持主动连接的代理。', 'ha.guide': '阅读指南',
      'history.kicker': '内部存储', 'history.title': '每小时历史', 'history.count': '{count} 条记录', 'history.limit': '最近记录', 'history.hours24': '24 小时', 'history.hours48': '48 小时', 'history.hours96': '96 小时', 'history.read': '读取', 'history.export': '导出 CSV 历史', 'history.statusDefault': '传感器保存带时间戳的最低值和最高值。', 'history.emptyConnect': '连接传感器后读取其存储。', 'history.emptyLoaded': '尚未为此传感器加载历史。', 'history.empty': '没有可用记录。', 'history.date': '日期', 'history.tempMin': '最低温度', 'history.tempMax': '最高温度', 'history.humidity': '湿度',
      'logs.kicker': '本地诊断', 'logs.title': '活动日志', 'logs.clear': '清除', 'logs.empty': '蓝牙事件将显示在这里。', 'footer.project': '采用 MIT 许可证的开源项目。', 'footer.privacy': '测量数据保留在你的浏览器中。', 'rename.kicker': '本地标识', 'rename.title': '命名此传感器', 'rename.lead': '此名称仅保存在当前浏览器。', 'rename.label': '传感器名称', 'rename.placeholder': '例如：客厅', 'rename.close': '关闭', 'rename.cancel': '取消', 'rename.save': '保存', 'noscript': '必须启用 JavaScript 才能通过蓝牙与 LYWSD02 / MHO-C303 通信。',
      'copy.success': '地址已复制。', 'copy.failure': '复制失败，请记下上方地址。', 'button.connecting': '正在连接', 'button.cancelConnection': '停止连接', 'button.disconnect': '断开连接', 'status.selecting': '正在选择...', 'status.connecting': '正在连接...', 'status.retry': '重试 {current}/{total}', 'status.connected': '已连接', 'status.failed': '连接失败', 'status.lost': '连接已断开', 'status.https': '需要 HTTPS', 'status.incompatible': '不支持', 'status.bluetoothOff': '蓝牙已关闭',
      'retry.select': '请在浏览器窗口中选择 LYWSD02 / MHO-C303。', 'retry.none': '未选择传感器。', 'retry.attempt': '尝试 1/{total}', 'retry.reconnectAttempt': '自动重连 1/{total}', 'retry.scheduled': '{seconds} 秒后重试...', 'retry.ready': '监测已启用，自动重连已就绪。', 'retry.active': '监测已启用。', 'retry.failure': '{count} 次尝试后仍无法连接。', 'retry.disabled': '自动重连已关闭。', 'retry.manual': '已手动断开，不会自动重试。', 'retry.cancelled': '已按要求停止连接，不会自动重试。', 'retry.on': '断开后最多进行 10 次渐进重试。', 'retry.off': '断开后不重试。', 'retry.mismatch': '此传感器不是 {name}，请选择匹配的浏览器 ID。',
      'history.reading': '正在读取传感器存储...', 'history.none': '传感器存储中没有记录。', 'history.loaded': '已从 {stored} 条中加载 {count} 条。', 'history.failed': '此固件未返回存储内容。', 'drift.synced': '已同步', 'drift.ahead': '快 {seconds} 秒', 'drift.behind': '慢 {seconds} 秒',
      'compat.httpsTitle': '需要安全连接', 'compat.httpsText': 'Web Bluetooth 仅支持 HTTPS，请打开已发布的 GitHub Pages 版本。', 'compat.browserTitle': '浏览器不兼容', 'compat.browserText': '请在 Windows、macOS 或 Linux 上使用 Chrome、Edge 或其他 Chromium 浏览器。Safari 和 Firefox 不支持 Web Bluetooth。', 'compat.bluetoothTitle': '蓝牙已关闭', 'compat.bluetoothText': '开启电脑蓝牙适配器，然后重新加载页面。',
      'log.storage': '本地存储不可用，设置无法保存。', 'log.chooser': '正在打开蓝牙设备选择器...', 'log.selectionCancelled': '已取消选择。', 'log.connectionCancelled': '已按要求停止连接。', 'log.selectionFailed': '选择失败：{error}。', 'log.connected': '已连接到 {name}。', 'log.attemptFailed': '第 {attempt} 次尝试失败：{error}。', 'log.connectionFailed': '连接失败：{error}。', 'log.interrupted': '蓝牙连接中断。', 'log.disconnected': '传感器已断开。', 'log.readUnavailable': '{label}不可用：{error}。', 'log.invalidMeasurement': '收到格式异常的测量数据。', 'log.timeRefreshed': '设备时间已刷新。', 'log.timeSynced': '时钟已同步为 {mode} 小时制（{timezone}）。', 'log.timeSyncedNoFormat': '时钟已同步（{timezone}）。', 'log.clockFormatUnsupported': '此传感器未接受 12 小时制：仅 LYWSD02MMC 支持 12/24 小时制切换。', 'log.autoTimeSynced': '超过 10 秒的偏差已自动校正。', 'log.timeSyncFailed': '时钟同步失败：{error}。', 'log.unitSet': '单位已设为 °{unit}。', 'log.unitFailed': '单位设置失败：{error}。', 'log.historyReading': '正在读取内部历史...', 'log.historyNone': '传感器中没有记录。', 'log.historyLoaded': '已加载 {count} 条历史记录。', 'log.historyFailed': '历史读取失败：{error}。', 'log.historyExported': '历史已导出为 CSV。', 'log.renamed': '已在此浏览器中将传感器命名为“{name}”。', 'log.removed': '已从设备历史中删除 {name}。', 'log.ready': '控制面板已就绪，所有数据交换均在本地进行。', 'log.adapterAvailable': '蓝牙适配器可用。', 'log.fractionalZone': '时区 {timezone} 将自动补偿。',
      'read.battery': '电量读取', 'read.unit': '单位读取', 'read.time': '时间读取', 'error.unknown': '未知错误', 'error.network': '蓝牙连接中断', 'error.notFound': '未找到 LYWSD02 / MHO-C303 服务或取消了选择', 'error.notSupported': '不支持此蓝牙功能', 'error.security': '浏览器阻止了蓝牙访问', 'error.notAllowed': '蓝牙权限被拒绝', 'error.timeIncomplete': '时间值不完整', 'error.historyIncomplete': '历史计数不完整'
    },
    pt: {
      "protocol.refreshMeasurements": "Atualizar medições",
      "protocol.extraMeasurements": "Medições adicionais",
      "protocol.soilMoisture": "Humidade do solo",
      "protocol.conductivity": "Condutividade do solo",
      "protocol.illuminance": "Iluminância",
      "protocol.sensors": "Firmware original · sensores (experimental)",
      "protocol.sampleHistoryTitle": "Amostras guardadas",
      "protocol.supportMatrix": "Perfis experimentais e pesquisa de dispositivos",
      "protocol.label": "Dispositivo / firmware",
      "protocol.stock": "LYWSD02 / MHO-C303 — firmware original",
      "protocol.pvvx": "PVVX BLE — experimental",
      "protocol.cgd1": "CGD1 — firmware original, experimental",
      "protocol.token": "Token de emparelhamento CGD1 existente (32 caracteres hexadecimais)",
      "protocol.note": "Os novos perfis usam comandos documentados e testes simulados; falta validação física. PVVX deve estar instalado. O token CGD1 existente fica apenas nesta sessão do navegador.",
      "protocol.clockAcknowledged": "Acerto da hora aceite; leitura do relógio indisponível.",
      "protocol.sampleHistory": "Médias PVVX. As datas são do dispositivo, sem conversão UTC verificada.",
      "protocol.deviceTimestamp": "Hora do dispositivo (original)",
      "protocol.batteryVoltage": "Tensão da pilha",
      "compatibility.stockFirmware": "Firmware original",
      "compatibility.photoCredits": "Créditos das fotografias",
      'compatibility.models': "Relógios compatíveis: LYWSD02 · LYWSD02MMC · MHO-C303",
      'compatibility.note': "Teste físico do MHO-C303: confirmado no Home Assistant; validação no navegador pendente.",
      'ha.credit': "Compatibilidade MHO-C303 adicionada e testada por",
      'skip': 'Ir para o painel', 'mobile.title': 'Continue no computador', 'mobile.lead': 'Ligue o sensor através de um PC, Mac ou computador Linux com Bluetooth.', 'mobile.step1': 'Abra o Chrome, Edge ou outro navegador Chromium.', 'mobile.step2': 'Aceda ao mesmo endereço.', 'mobile.step3': 'Ative o Bluetooth e ligue o LYWSD02 / MHO-C303.', 'mobile.copy': 'Copiar endereço do painel', 'mobile.privacy': 'Ligação local. Sem conta e sem dados enviados para um servidor.', 'header.language': 'Idioma',
      'hero.eyebrow': 'Relógio termómetro-higrómetro Xiaomi Mijia', 'hero.title': "Sincronize os seus relógios LYWSD02 e MHO-C303.", 'hero.lead': 'Veja medições em direto, corrija o desvio do relógio e recupere os registos guardados no sensor.', 'hero.local': 'Bluetooth local', 'hero.noAccount': 'Sem conta', 'hero.noCloud': 'Sem envio de dados', 'hero.imageAlt': 'Termómetro, higrómetro e relógio Bluetooth Xiaomi Mijia LYWSD02',
      'connection.kicker': 'Ligação', 'connection.title': 'Sensor ativo', 'connection.disconnected': 'Desligado', 'connection.noDevice': 'Nenhum sensor selecionado', 'connection.idWaiting': 'ID do navegador pendente', 'connection.rename': 'Mudar nome', 'connection.detect': 'Procurar sensor', 'connection.autoRetry': 'Reconexão automática', 'connection.retryDefault': 'Até 10 tentativas progressivas após uma quebra.', 'connection.multiTitle': 'Vários LYWSD02 / MHO-C303?', 'connection.multiText': 'Ligue cada sensor uma vez e dê-lhe um nome local. O ID e a última ligação ficam guardados neste computador.',
      'devices.title': 'Histórico de dispositivos', 'devices.subtitle': 'Guardado apenas neste navegador', 'devices.empty': 'Nenhum sensor ligado anteriormente.', 'devices.lastConnected': 'Última ligação {date}', 'devices.connections': '{count} ligações', 'devices.reconnect': 'Ligar novamente', 'devices.reselect': 'Selecionar novamente', 'devices.remove': 'Remover do histórico',
      'metric.temperature': 'Temperatura', 'metric.current': 'Medição atual', 'metric.updates': '{count} atualizações', 'metric.humidity': 'Humidade', 'metric.relative': 'Humidade relativa', 'metric.battery': 'Bateria', 'metric.remaining': 'Nível restante', 'metric.batteryLow': 'Bateria fraca', 'metric.deviceTime': 'Hora do dispositivo', 'metric.timezoneUnread': 'Fuso não lido', 'metric.refreshTime': 'Atualizar hora do dispositivo', 'metric.drift': 'Desvio {value}', 'metric.driftUnknown': 'Desvio --',
      'settings.kicker': 'Ecrã', 'settings.title': 'Relógio e unidade', 'settings.timezone': 'Fuso horário', 'settings.systemTimezone': 'Fuso do sistema', 'settings.timeFormat': 'Formato da hora', 'settings.unit': 'Unidade de temperatura', 'settings.correction': 'Correção pontual', 'settings.autoClock': 'Corrigir automaticamente desvios superiores a 10 segundos', 'settings.sync': 'Sincronizar relógio', 'settings.saveUnit': 'Guardar unidade',
      'settings.timeFormatHint': 'Formato de 12 h: só LYWSD02MMC.', 'ha.kicker': 'Automação', 'ha.title': 'Mantenha todos os relógios à hora certa com o Home Assistant', 'ha.lead': "Sincronize LYWSD02, LYWSD02MMC e MHO-C303 automaticamente, incluindo mudanças da hora. Consulte temperatura, humidade, bateria e histórico horário. Sem YAML nem cloud.", 'ha.step1': 'Adicione o LYWSD02 Clock Sync ao HACS.', 'ha.step2': 'Transfira-o e reinicie o Home Assistant.', 'ha.step3': 'Aceite o relógio detetado ou adicione-o manualmente.', 'ha.hacsButton': 'Abrir no HACS', 'ha.addButton': 'Adicionar um relógio', 'ha.point1': 'Todas as noites às 04:00 por predefinição', 'ha.point2': 'Diária, semanal, mensal ou cron', 'ha.point3': 'Mudança de hora corrigida em menos de uma hora', 'ha.point4': 'Funciona com proxies Bluetooth ESPHome', 'ha.note': 'Requer o HACS e Bluetooth no Home Assistant: um adaptador local ou um proxy com ligações ativas.', 'ha.guide': 'Ler o guia',
      'history.kicker': 'Memória interna', 'history.title': 'Histórico por hora', 'history.count': '{count} registos', 'history.limit': 'Últimos registos', 'history.hours24': '24 horas', 'history.hours48': '48 horas', 'history.hours96': '96 horas', 'history.read': 'Ler', 'history.export': 'Exportar histórico CSV', 'history.statusDefault': 'O sensor guarda mínimos e máximos com data e hora.', 'history.emptyConnect': 'Ligue um sensor para ler a memória.', 'history.emptyLoaded': 'Nenhum histórico carregado para este sensor.', 'history.empty': 'Nenhum registo disponível.', 'history.date': 'Data', 'history.tempMin': 'Temp. mín.', 'history.tempMax': 'Temp. máx.', 'history.humidity': 'Humidade',
      'logs.kicker': 'Diagnóstico local', 'logs.title': 'Registo de atividade', 'logs.clear': 'Limpar', 'logs.empty': 'Os eventos Bluetooth aparecerão aqui.', 'footer.project': 'Projeto open source com licença MIT.', 'footer.privacy': 'As medições ficam no navegador.', 'rename.kicker': 'Identificação local', 'rename.title': 'Dar nome ao sensor', 'rename.lead': 'Este nome só é guardado neste navegador.', 'rename.label': 'Nome do sensor', 'rename.placeholder': 'Ex. Sala', 'rename.close': 'Fechar', 'rename.cancel': 'Cancelar', 'rename.save': 'Guardar', 'noscript': 'O JavaScript tem de estar ativo para comunicar com o LYWSD02 / MHO-C303 por Bluetooth.',
      'copy.success': 'Endereço copiado.', 'copy.failure': 'Não foi possível copiar. Anote o endereço.', 'button.connecting': 'A ligar', 'button.cancelConnection': 'Cancelar ligação', 'button.disconnect': 'Desligar', 'status.selecting': 'A selecionar...', 'status.connecting': 'A ligar...', 'status.retry': 'Nova tentativa {current}/{total}', 'status.connected': 'Ligado', 'status.failed': 'Falha na ligação', 'status.lost': 'Ligação perdida', 'status.https': 'HTTPS necessário', 'status.incompatible': 'Não compatível', 'status.bluetoothOff': 'Bluetooth desligado',
      'retry.select': 'Selecione um LYWSD02 / MHO-C303 na janela do navegador.', 'retry.none': 'Nenhum sensor selecionado.', 'retry.attempt': 'Tentativa 1/{total}', 'retry.reconnectAttempt': 'Reconexão automática 1/{total}', 'retry.scheduled': 'Nova tentativa em {seconds} s...', 'retry.ready': 'Monitorização ativa. Reconexão pronta.', 'retry.active': 'Monitorização ativa.', 'retry.failure': 'Não foi possível ligar após {count} tentativas.', 'retry.disabled': 'Reconexão automática desativada.', 'retry.manual': 'Desligado a pedido. Sem nova tentativa.', 'retry.cancelled': 'Ligação cancelada a pedido. Sem nova tentativa automática.', 'retry.on': 'Até 10 tentativas progressivas após uma quebra.', 'retry.off': 'Sem tentativa após uma quebra.', 'retry.mismatch': 'Este sensor não é {name}. Selecione o ID correto.',
      'history.reading': 'A ler a memória do sensor...', 'history.none': 'A memória do sensor não contém registos.', 'history.loaded': '{count} registos carregados de {stored}.', 'history.failed': 'Este firmware não devolveu a memória.', 'drift.synced': 'sincronizado', 'drift.ahead': '{seconds} s adiantado', 'drift.behind': '{seconds} s atrasado',
      'compat.httpsTitle': 'Ligação segura necessária', 'compat.httpsText': 'O Web Bluetooth só funciona em HTTPS. Abra a versão publicada no GitHub Pages.', 'compat.browserTitle': 'Navegador incompatível', 'compat.browserText': 'Use Chrome, Edge ou Chromium no Windows, macOS ou Linux. Safari e Firefox não suportam Web Bluetooth.', 'compat.bluetoothTitle': 'Bluetooth desativado', 'compat.bluetoothText': 'Ative o adaptador Bluetooth e recarregue a página.',
      'log.storage': 'Armazenamento local indisponível; as definições não serão guardadas.', 'log.chooser': 'A abrir o seletor Bluetooth...', 'log.selectionCancelled': 'Seleção cancelada.', 'log.connectionCancelled': 'Ligação cancelada a pedido.', 'log.selectionFailed': 'Seleção falhou: {error}.', 'log.connected': 'Ligado a {name}.', 'log.attemptFailed': 'Tentativa {attempt} falhou: {error}.', 'log.connectionFailed': 'Ligação falhou: {error}.', 'log.interrupted': 'Ligação Bluetooth interrompida.', 'log.disconnected': 'Sensor desligado.', 'log.readUnavailable': '{label} indisponível: {error}.', 'log.invalidMeasurement': 'Medição recebida num formato inesperado.', 'log.timeRefreshed': 'Hora do dispositivo atualizada.', 'log.timeSynced': 'Relógio sincronizado no modo {mode} h ({timezone}).', 'log.timeSyncedNoFormat': 'Relógio sincronizado ({timezone}).', 'log.clockFormatUnsupported': 'Este sensor não aceitou o formato de 12 h: só o LYWSD02MMC suporta a mudança 12/24 h.', 'log.autoTimeSynced': 'Um desvio superior a 10 segundos foi corrigido automaticamente.', 'log.timeSyncFailed': 'Sincronização falhou: {error}.', 'log.unitSet': 'Unidade definida para °{unit}.', 'log.unitFailed': 'Não foi possível definir a unidade: {error}.', 'log.historyReading': 'A ler histórico interno...', 'log.historyNone': 'Nenhum registo no sensor.', 'log.historyLoaded': '{count} registos históricos carregados.', 'log.historyFailed': 'Não foi possível ler o histórico: {error}.', 'log.historyExported': 'Histórico exportado em CSV.', 'log.renamed': 'Sensor renomeado “{name}” neste navegador.', 'log.removed': '{name} removido do histórico.', 'log.ready': 'Painel pronto. Todas as trocas permanecem locais.', 'log.adapterAvailable': 'Adaptador Bluetooth disponível.', 'log.fractionalZone': 'O fuso {timezone} será compensado automaticamente.',
      'read.battery': 'Leitura da bateria', 'read.unit': 'Leitura da unidade', 'read.time': 'Leitura da hora', 'error.unknown': 'erro desconhecido', 'error.network': 'ligação Bluetooth interrompida', 'error.notFound': 'serviço LYWSD02 / MHO-C303 não encontrado ou seleção cancelada', 'error.notSupported': 'função Bluetooth não suportada', 'error.security': 'acesso Bluetooth bloqueado', 'error.notAllowed': 'permissão Bluetooth recusada', 'error.timeIncomplete': 'valor de hora incompleto', 'error.historyIncomplete': 'contador de histórico incompleto'
    },
    hi: {
      "protocol.refreshMeasurements": "माप ताज़ा करें",
      "protocol.extraMeasurements": "अतिरिक्त माप",
      "protocol.soilMoisture": "मिट्टी की नमी",
      "protocol.conductivity": "मिट्टी की चालकता",
      "protocol.illuminance": "प्रकाश स्तर",
      "protocol.sensors": "मूल फ़र्मवेयर · प्रयोगात्मक सेंसर",
      "protocol.sampleHistoryTitle": "रिकॉर्ड किए गए नमूने",
      "protocol.supportMatrix": "प्रयोगात्मक प्रोफ़ाइल और उपकरण शोध",
      "protocol.label": "डिवाइस / फ़र्मवेयर",
      "protocol.stock": "LYWSD02 / MHO-C303 — मूल फ़र्मवेयर",
      "protocol.pvvx": "PVVX BLE — प्रयोगात्मक",
      "protocol.cgd1": "CGD1 — मूल फ़र्मवेयर, प्रयोगात्मक",
      "protocol.token": "मौजूदा CGD1 पेयरिंग टोकन (32 हेक्साडेसिमल अक्षर)",
      "protocol.note": "नए प्रोफ़ाइल प्रकाशित कमांड और सिमुलेशन परीक्षणों पर आधारित हैं; वास्तविक सत्यापन बाकी है। PVVX पहले से स्थापित होना चाहिए। मौजूदा CGD1 टोकन केवल इस ब्राउज़र सत्र में रहता है।",
      "protocol.clockAcknowledged": "समय सेटिंग स्वीकार हुई; घड़ी का समय वापस पढ़ना उपलब्ध नहीं है।",
      "protocol.sampleHistory": "PVVX के औसत नमूने। समय डिवाइस का है, सत्यापित UTC रूपांतरण नहीं।",
      "protocol.deviceTimestamp": "डिवाइस का मूल समय",
      "protocol.batteryVoltage": "बैटरी वोल्टेज",
      "compatibility.stockFirmware": "मूल फ़र्मवेयर",
      "compatibility.photoCredits": "तस्वीरों का श्रेय",
      'compatibility.models': "संगत घड़ियाँ: LYWSD02 · LYWSD02MMC · MHO-C303",
      'compatibility.note': "MHO-C303 का वास्तविक परीक्षण: Home Assistant में पुष्टि हुई; ब्राउज़र में सत्यापन बाकी है।",
      'ha.credit': "MHO-C303 समर्थन जोड़ने और परीक्षण का श्रेय",
      'skip': 'डैशबोर्ड पर जाएँ', 'mobile.title': 'अपने कंप्यूटर पर जारी रखें', 'mobile.lead': 'Bluetooth वाले Windows, Mac या Linux कंप्यूटर से सेंसर कनेक्ट करें।', 'mobile.step1': 'Chrome, Edge या कोई Chromium ब्राउज़र खोलें।', 'mobile.step2': 'यही पता खोलें।', 'mobile.step3': 'Bluetooth चालू करें और LYWSD02 / MHO-C303 कनेक्ट करें।', 'mobile.copy': 'डैशबोर्ड पता कॉपी करें', 'mobile.privacy': 'स्थानीय कनेक्शन। कोई खाता नहीं और सेंसर डेटा सर्वर पर नहीं भेजा जाता।', 'header.language': 'भाषा',
      'hero.eyebrow': 'Xiaomi Mijia तापमान, नमी और घड़ी मॉनिटर', 'hero.title': "अपनी LYWSD02 और MHO-C303 घड़ियाँ सिंक करें।", 'hero.lead': 'लाइव माप देखें, घड़ी का अंतर सुधारें और सेंसर में सुरक्षित रिकॉर्ड पढ़ें।', 'hero.local': 'स्थानीय Bluetooth', 'hero.noAccount': 'खाता नहीं', 'hero.noCloud': 'डेटा अपलोड नहीं', 'hero.imageAlt': 'Xiaomi Mijia LYWSD02 Bluetooth तापमान, नमी और घड़ी सेंसर',
      'connection.kicker': 'कनेक्शन', 'connection.title': 'सक्रिय सेंसर', 'connection.disconnected': 'डिस्कनेक्टेड', 'connection.noDevice': 'कोई सेंसर नहीं चुना', 'connection.idWaiting': 'ब्राउज़र ID की प्रतीक्षा', 'connection.rename': 'नाम बदलें', 'connection.detect': 'सेंसर खोजें', 'connection.autoRetry': 'स्वचालित पुनः कनेक्शन', 'connection.retryDefault': 'कनेक्शन टूटने पर अधिकतम 10 क्रमिक प्रयास।', 'connection.multiTitle': 'कई LYWSD02 / MHO-C303 हैं?', 'connection.multiText': 'हर सेंसर को एक बार जोड़कर स्थानीय नाम दें। ब्राउज़र ID और अंतिम कनेक्शन इस कंप्यूटर पर सुरक्षित रहते हैं।',
      'devices.title': 'डिवाइस इतिहास', 'devices.subtitle': 'केवल इस ब्राउज़र में सुरक्षित', 'devices.empty': 'पहले जुड़ा कोई सेंसर नहीं।', 'devices.lastConnected': 'अंतिम कनेक्शन {date}', 'devices.connections': '{count} कनेक्शन', 'devices.reconnect': 'फिर कनेक्ट करें', 'devices.reselect': 'फिर चुनें', 'devices.remove': 'इतिहास से हटाएँ',
      'metric.temperature': 'तापमान', 'metric.current': 'वर्तमान माप', 'metric.updates': '{count} अपडेट', 'metric.humidity': 'नमी', 'metric.relative': 'सापेक्ष नमी', 'metric.battery': 'बैटरी', 'metric.remaining': 'शेष स्तर', 'metric.batteryLow': 'बैटरी कम', 'metric.deviceTime': 'डिवाइस समय', 'metric.timezoneUnread': 'समय क्षेत्र नहीं पढ़ा', 'metric.refreshTime': 'डिवाइस समय रीफ़्रेश करें', 'metric.drift': 'अंतर {value}', 'metric.driftUnknown': 'अंतर --',
      'settings.kicker': 'डिस्प्ले', 'settings.title': 'घड़ी और इकाई', 'settings.timezone': 'समय क्षेत्र', 'settings.systemTimezone': 'सिस्टम समय क्षेत्र', 'settings.timeFormat': 'समय प्रारूप', 'settings.unit': 'तापमान इकाई', 'settings.correction': 'एक बार का सुधार', 'settings.autoClock': '10 सेकंड से अधिक अंतर को अपने आप सुधारें', 'settings.sync': 'घड़ी सिंक करें', 'settings.saveUnit': 'इकाई सेव करें',
      'settings.timeFormatHint': '12 घंटे का डिस्प्ले: केवल LYWSD02MMC।', 'ha.kicker': 'ऑटोमेशन', 'ha.title': 'Home Assistant से हर घड़ी को सही समय पर रखें', 'ha.lead': "LYWSD02, LYWSD02MMC और MHO-C303 घड़ियाँ अपने आप सिंक करें, डेलाइट सेविंग बदलावों सहित। तापमान, नमी, बैटरी और प्रति घंटा इतिहास पढ़ें। बिना YAML या क्लाउड।", 'ha.step1': 'LYWSD02 Clock Sync को HACS में जोड़ें।', 'ha.step2': 'इसे डाउनलोड करें, फिर Home Assistant रीस्टार्ट करें।', 'ha.step3': 'खोजी गई घड़ी स्वीकार करें या स्वयं जोड़ें।', 'ha.hacsButton': 'HACS में खोलें', 'ha.addButton': 'घड़ी जोड़ें', 'ha.point1': 'डिफ़ॉल्ट रूप से हर रात 04:00 बजे', 'ha.point2': 'रोज़, साप्ताहिक, मासिक या कस्टम cron', 'ha.point3': 'डेलाइट सेविंग एक घंटे के भीतर ठीक', 'ha.point4': 'ESPHome Bluetooth प्रॉक्सी के साथ काम करता है', 'ha.note': 'Home Assistant में HACS और Bluetooth ज़रूरी है: लोकल एडैप्टर या सक्रिय कनेक्शन वाला प्रॉक्सी।', 'ha.guide': 'गाइड पढ़ें',
      'history.kicker': 'आंतरिक मेमोरी', 'history.title': 'प्रति घंटा इतिहास', 'history.count': '{count} रिकॉर्ड', 'history.limit': 'नवीनतम रिकॉर्ड', 'history.hours24': '24 घंटे', 'history.hours48': '48 घंटे', 'history.hours96': '96 घंटे', 'history.read': 'पढ़ें', 'history.export': 'CSV इतिहास निर्यात करें', 'history.statusDefault': 'सेंसर समय सहित न्यूनतम और अधिकतम मान सुरक्षित करता है।', 'history.emptyConnect': 'मेमोरी पढ़ने के लिए सेंसर कनेक्ट करें।', 'history.emptyLoaded': 'इस सेंसर का इतिहास लोड नहीं है।', 'history.empty': 'कोई रिकॉर्ड उपलब्ध नहीं।', 'history.date': 'तारीख', 'history.tempMin': 'न्यूनतम तापमान', 'history.tempMax': 'अधिकतम तापमान', 'history.humidity': 'नमी',
      'logs.kicker': 'स्थानीय जाँच', 'logs.title': 'गतिविधि लॉग', 'logs.clear': 'साफ़ करें', 'logs.empty': 'Bluetooth घटनाएँ यहाँ दिखेंगी।', 'footer.project': 'MIT लाइसेंस वाला ओपन-सोर्स प्रोजेक्ट।', 'footer.privacy': 'माप आपके ब्राउज़र में रहते हैं।', 'rename.kicker': 'स्थानीय पहचान', 'rename.title': 'इस सेंसर को नाम दें', 'rename.lead': 'यह नाम केवल इसी ब्राउज़र में सुरक्षित होता है।', 'rename.label': 'सेंसर का नाम', 'rename.placeholder': 'जैसे बैठक कक्ष', 'rename.close': 'बंद करें', 'rename.cancel': 'रद्द करें', 'rename.save': 'सेव करें', 'noscript': 'Bluetooth द्वारा LYWSD02 / MHO-C303 से जुड़ने के लिए JavaScript चालू होना चाहिए।',
      'copy.success': 'पता कॉपी हो गया।', 'copy.failure': 'कॉपी नहीं हुआ। ऊपर का पता लिख लें।', 'button.connecting': 'कनेक्ट हो रहा है', 'button.cancelConnection': 'कनेक्शन रोकें', 'button.disconnect': 'डिस्कनेक्ट करें', 'status.selecting': 'चुना जा रहा है...', 'status.connecting': 'कनेक्ट हो रहा है...', 'status.retry': 'पुनः प्रयास {current}/{total}', 'status.connected': 'कनेक्टेड', 'status.failed': 'कनेक्शन विफल', 'status.lost': 'कनेक्शन टूट गया', 'status.https': 'HTTPS आवश्यक', 'status.incompatible': 'समर्थित नहीं', 'status.bluetoothOff': 'Bluetooth बंद',
      'retry.select': 'ब्राउज़र विंडो में LYWSD02 / MHO-C303 चुनें।', 'retry.none': 'कोई सेंसर नहीं चुना।', 'retry.attempt': 'प्रयास 1/{total}', 'retry.reconnectAttempt': 'स्वचालित पुनः कनेक्शन 1/{total}', 'retry.scheduled': '{seconds} सेकंड में फिर प्रयास...', 'retry.ready': 'निगरानी चालू। स्वचालित पुनः कनेक्शन तैयार।', 'retry.active': 'निगरानी चालू।', 'retry.failure': '{count} प्रयासों के बाद कनेक्शन नहीं हुआ।', 'retry.disabled': 'स्वचालित पुनः कनेक्शन बंद है।', 'retry.manual': 'अनुरोध पर डिस्कनेक्ट किया। स्वचालित प्रयास नहीं होगा।', 'retry.cancelled': 'अनुरोध पर कनेक्शन रोक दिया गया। स्वचालित प्रयास नहीं होगा।', 'retry.on': 'कनेक्शन टूटने पर अधिकतम 10 क्रमिक प्रयास।', 'retry.off': 'कनेक्शन टूटने पर पुनः प्रयास नहीं।', 'retry.mismatch': 'यह सेंसर {name} नहीं है। सही ब्राउज़र ID चुनें।',
      'history.reading': 'सेंसर मेमोरी पढ़ी जा रही है...', 'history.none': 'सेंसर मेमोरी में कोई रिकॉर्ड नहीं।', 'history.loaded': '{stored} में से {count} रिकॉर्ड लोड हुए।', 'history.failed': 'इस फ़र्मवेयर ने मेमोरी नहीं दी।', 'drift.synced': 'सिंक है', 'drift.ahead': '{seconds} सेकंड आगे', 'drift.behind': '{seconds} सेकंड पीछे',
      'compat.httpsTitle': 'सुरक्षित कनेक्शन आवश्यक', 'compat.httpsText': 'Web Bluetooth केवल HTTPS पर चलता है। प्रकाशित GitHub Pages संस्करण खोलें।', 'compat.browserTitle': 'ब्राउज़र समर्थित नहीं', 'compat.browserText': 'Windows, macOS या Linux पर Chrome, Edge या Chromium उपयोग करें। Safari और Firefox में Web Bluetooth नहीं है।', 'compat.bluetoothTitle': 'Bluetooth बंद है', 'compat.bluetoothText': 'कंप्यूटर का Bluetooth एडाप्टर चालू करके पेज फिर लोड करें।',
      'log.storage': 'स्थानीय स्टोरेज उपलब्ध नहीं; सेटिंग याद नहीं रहेंगी।', 'log.chooser': 'Bluetooth डिवाइस चयन खुल रहा है...', 'log.selectionCancelled': 'सेंसर चयन रद्द किया गया।', 'log.connectionCancelled': 'अनुरोध पर कनेक्शन रोक दिया गया।', 'log.selectionFailed': 'चयन विफल: {error}।', 'log.connected': '{name} से कनेक्टेड।', 'log.attemptFailed': 'प्रयास {attempt} विफल: {error}।', 'log.connectionFailed': 'कनेक्शन विफल: {error}।', 'log.interrupted': 'Bluetooth कनेक्शन टूट गया।', 'log.disconnected': 'सेंसर डिस्कनेक्टेड।', 'log.readUnavailable': '{label} उपलब्ध नहीं: {error}।', 'log.invalidMeasurement': 'अनपेक्षित प्रारूप में माप मिला।', 'log.timeRefreshed': 'डिवाइस समय रीफ़्रेश हुआ।', 'log.timeSynced': 'घड़ी {mode}-घंटे प्रारूप में सिंक हुई ({timezone})।', 'log.timeSyncedNoFormat': 'घड़ी सिंक हुई ({timezone})।', 'log.clockFormatUnsupported': 'इस सेंसर ने 12-घंटे प्रारूप स्वीकार नहीं किया: 12/24-घंटे बदलाव केवल LYWSD02MMC पर समर्थित है।', 'log.autoTimeSynced': '10 सेकंड से अधिक अंतर अपने आप ठीक किया गया।', 'log.timeSyncFailed': 'घड़ी सिंक विफल: {error}।', 'log.unitSet': 'इकाई °{unit} पर सेट हुई।', 'log.unitFailed': 'इकाई सेट नहीं हुई: {error}।', 'log.historyReading': 'आंतरिक इतिहास पढ़ा जा रहा है...', 'log.historyNone': 'सेंसर में कोई रिकॉर्ड नहीं।', 'log.historyLoaded': '{count} इतिहास रिकॉर्ड लोड हुए।', 'log.historyFailed': 'इतिहास नहीं पढ़ा गया: {error}।', 'log.historyExported': 'इतिहास CSV में निर्यात हुआ।', 'log.renamed': 'इस ब्राउज़र में सेंसर का नाम “{name}” रखा गया।', 'log.removed': '{name} को डिवाइस इतिहास से हटाया गया।', 'log.ready': 'डैशबोर्ड तैयार। सभी डेटा स्थानीय हैं।', 'log.adapterAvailable': 'Bluetooth एडाप्टर उपलब्ध है।', 'log.fractionalZone': 'समय क्षेत्र {timezone} का सुधार अपने आप होगा।',
      'read.battery': 'बैटरी रीडिंग', 'read.unit': 'इकाई रीडिंग', 'read.time': 'समय रीडिंग', 'error.unknown': 'अज्ञात त्रुटि', 'error.network': 'Bluetooth कनेक्शन टूटा', 'error.notFound': 'LYWSD02 / MHO-C303 सेवा नहीं मिली या चयन रद्द हुआ', 'error.notSupported': 'Bluetooth सुविधा समर्थित नहीं', 'error.security': 'ब्राउज़र ने Bluetooth पहुँच रोकी', 'error.notAllowed': 'Bluetooth अनुमति अस्वीकृत', 'error.timeIncomplete': 'अधूरा समय मान', 'error.historyIncomplete': 'अधूरा इतिहास काउंटर'
    }
  };

  // The static page generator uses the same catalogs as the browser.
  if (typeof module === 'object' && module.exports) {
    module.exports = { BASE_URL, LOCALES, SEO, MESSAGES };
    return;
  }

  const appRoot = new URL('./', document.currentScript.src);
  const pageLocale = document.documentElement.dataset.locale;
  const locale = Object.hasOwn(LOCALES, pageLocale) ? pageLocale : 'en';
  const urlLocale = new URLSearchParams(location.search).get('lang');

  function navigationUrl(code) {
    const url = new URL(code === 'en' ? './' : `${code}/`, appRoot);
    url.search = location.search;
    url.searchParams.delete('lang');
    url.hash = location.hash;
    return url;
  }

  // Keep previously shared query-string links working on GitHub Pages and localhost.
  if (Object.hasOwn(LOCALES, urlLocale)) {
    location.replace(navigationUrl(urlLocale));
  }

  function interpolate(message, values = {}) {
    return message.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
  }

  function t(key, values) {
    const message = MESSAGES[locale]?.[key] ?? MESSAGES.en[key] ?? key;
    return interpolate(message, values);
  }

  function localizedUrl(code) {
    return new URL(code === 'en' ? './' : `${code}/`, BASE_URL).href;
  }

  function setMeta(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.setAttribute('content', value);
  }

  function updateStructuredData() {
    const element = document.getElementById('structuredData');
    if (!element) return;
    try {
      const graph = JSON.parse(element.textContent);
      const app = graph['@graph']?.find((item) => item['@type'] === 'WebApplication');
      const site = graph['@graph']?.find((item) => item['@type'] === 'WebSite');
      if (app) {
        app.url = localizedUrl(locale);
        app.inLanguage = LOCALES[locale].tag;
        app.name = SEO[locale].ogTitle;
        app.description = SEO[locale].description;
      }
      if (site) {
        site.url = localizedUrl(locale);
        site.inLanguage = LOCALES[locale].tag;
        site.name = SEO[locale].ogTitle;
      }
      element.textContent = JSON.stringify(graph);
    } catch {
      return;
    }
  }

  function apply() {
    const config = LOCALES[locale];
    const seo = SEO[locale];
    document.documentElement.lang = config.tag;
    document.documentElement.dir = config.dir;
    document.title = seo.title;
    setMeta('meta[name="description"]', seo.description);
    setMeta('meta[property="og:title"]', seo.ogTitle);
    setMeta('meta[property="og:description"]', seo.ogDescription);
    setMeta('meta[property="og:url"]', localizedUrl(locale));
    setMeta('meta[property="og:locale"]', config.og);
    setMeta('meta[name="twitter:title"]', seo.ogTitle);
    setMeta('meta[name="twitter:description"]', seo.ogDescription);
    setMeta('meta[property="og:image:alt"]', seo.imageAlt);
    setMeta('meta[name="twitter:image:alt"]', seo.imageAlt);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', localizedUrl(locale));

    document.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = t(element.dataset.i18n, { count: 0 });
    });
    document.querySelectorAll('[data-i18n-title]').forEach((element) => {
      element.title = t(element.dataset.i18nTitle);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((element) => {
      element.setAttribute('aria-label', t(element.dataset.i18nAria));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-alt]').forEach((element) => {
      element.alt = t(element.dataset.i18nAlt);
    });
    document.querySelectorAll('[data-i18n-label]').forEach((element) => {
      element.label = t(element.dataset.i18nLabel);
    });
    document.querySelectorAll('[data-language-select]').forEach((select) => {
      select.value = locale;
    });
    updateStructuredData();
  }

  function setLocale(nextLocale) {
    if (!Object.hasOwn(LOCALES, nextLocale)) return;
    try {
      localStorage.setItem(STORAGE_KEY, nextLocale);
    } catch {
      // The URL still keeps the selected language stable.
    }
    location.assign(navigationUrl(nextLocale));
  }

  window.LYWSD02_I18N = {
    apply,
    locale: () => locale,
    localeTag: () => LOCALES[locale].tag,
    locales: LOCALES,
    publishedUrl: () => localizedUrl(locale),
    setLocale,
    t
  };

  apply();
})();
