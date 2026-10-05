# Contributor and technical notes

For instructions on synchronizing your clock and changing its display settings, see the [user guide](../README.md).

This page collects implementation details and the device research behind the dashboard. Run the local commands from the repository root. Browser tests use simulated sensors; confirm Bluetooth behavior and device writes with a physical LYWSD02.

## Run locally

The generated pages are committed to the repository. No build step or package installation is required to serve them.

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173/`. Real Web Bluetooth tests should use the HTTPS GitHub Pages deployment; localhost is accepted as a secure development context by Chromium.

English is served at `/`; other languages have their own directories, such as `/fr/` for French and `/ar/` for Arabic.

The page URL determines its language, even when a different preference was saved previously. Old `?lang=fr` links redirect to `/fr/` in the browser, preserving other query parameters and fragments.

Run the connection regression checks with Node.js, without installing packages:

```bash
node tests/connection-regressions.cjs
```

These checks simulate device switching, cancellation during connection setup, delayed Bluetooth responses and the retry limit. They do not replace validation with physical sensors.

## Update pages and translations

Edit `templates/index.html` for shared markup and `i18n.js` for translations. Then regenerate the static HTML pages and sitemap with Node.js, without installing packages:

```bash
node scripts/build-locales.cjs
```

The generator writes the English `index.html`, eight translated `index.html` files under `fr/`, `es/`, `it/`, `de/`, `ar/`, `zh/`, `pt/` and `hi/`, and `sitemap.xml`. Commit the generated files with their source changes. Each page includes its translated content and metadata before JavaScript runs; the shared scripts provide Bluetooth controls and language switching.

Verify that generated files match their sources and check the SEO configuration:

```bash
node scripts/build-locales.cjs --check
node --test tests/seo.test.cjs
node --test tests/locale-routing.test.cjs
```

The locale-routing checks exercise language selection and legacy `?lang=` links under both localhost and the GitHub Pages project path, including unavailable browser storage.

## Test the Home Assistant integration

The integration lives in `custom_components/lywsd02_sync` and is distributed through HACS from this repository (`hacs.json`). Its tests run the real Home Assistant and its real Bluetooth manager, fed by simulated connectable and passive proxies; only the final connection reaches a simulated clock. They use [pytest-homeassistant-custom-component](https://github.com/MatthewFlamm/pytest-homeassistant-custom-component) in a dedicated virtual environment:

```bash
python3.14 -m venv .venv
.venv/bin/pip install pytest-homeassistant-custom-component==0.13.367 aiousbwatcher==1.1.2 serialx==1.10.0
.venv/bin/python -m pytest
```

This pins Home Assistant 2026.9.4; the two extra packages are requirements of the `usb` integration loaded by Bluetooth. The same suite passes on Home Assistant 2025.2.0, the minimum declared in `hacs.json` (harness `0.13.210` with Python 3.13, `aiousbwatcher==1.1.1` and `pyserial==3.5`). Tests cover the time and settings values, schedules and cron validation, discovery and options flows, settings entities, clocks out of range or heard only by passive proxies, repair issues, failed syncs, the search and reconnections of the sync button, readings, hourly records and their statistics, daylight saving changes, restarts and translations.

Home Assistant does not call integrations back for every advertisement: identical advertisements are skipped, and when a passive proxy owns a device, a connectable proxy can make it reachable silently. The integration therefore never waits for an advertisement alone. It retries on timers and looks the clock up at each attempt; advertisements only shorten the wait.

A clock counts as reachable only while a connectable adapter or proxy still lists it. Home Assistant keeps a clock in its history for a few minutes after its adapters stopped hearing it, but cannot connect through that history. The **Sync clock** button therefore searches for up to a minute, asking adapters in automatic scanning mode for an active scan where Home Assistant provides `bluetooth.async_request_active_scan`, and reconnects after 2, 5 and 10 seconds when a connection fails or drops. Test proxies date advertisements with the real monotonic clock, so frozen time never makes them forget a clock; `Proxy.hear(ago=...)` sends an old advertisement instead.

Each sync writes the time first, under the 60-second limit of a sync. The readings that follow have their own limit and never fail a sync: a reading that fails keeps its last value, and records left unread are read at the next sync. `tests/home_assistant/test_records.py` checks the statistics with a real recorder, which these tests start before Home Assistant.

Home Assistant 2026.3 and later read the integration icon from `custom_components/lywsd02_sync/brand/`. Confirm Bluetooth behavior with a physical clock before publishing a release.

## Search indexing on GitHub Pages

The sitemap lists the nine canonical language URLs. Each page identifies its canonical URL and links to the other languages with `hreflang`. Keep the deployment URL consistent in the generator and in `robots.txt` if hosting changes.

GitHub Pages serves this project under `/LYWSD02_BLE_Dashboard/`. Its `robots.txt` is available at `/LYWSD02_BLE_Dashboard/robots.txt`, but Google only reads a robots file at the host root, `https://drslid.github.io/robots.txt`. The root URL returned HTTP 404 during the September 13, 2026 audit; Google treats that response as having no crawl restrictions. The project file therefore neither blocks crawling nor announces the sitemap to Google through the robots protocol. See [Google's robots.txt location and HTTP status rules](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec).

To announce the sitemap, submit `https://drslid.github.io/LYWSD02_BLE_Dashboard/sitemap.xml` in Google Search Console after verifying the site property. Alternatively, if you control the separate `drslid.github.io` repository that serves the host root, add this line to that site's root `robots.txt`, preserving any existing rules and sitemap entries:

```text
Sitemap: https://drslid.github.io/LYWSD02_BLE_Dashboard/sitemap.xml
```

Neither submitting a sitemap nor publishing it in robots.txt guarantees indexing. See [Google's sitemap submission guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap#addsitemap).

## Project structure

```text
templates/index.html     Source markup for all language pages
scripts/build-locales.cjs Static page and sitemap generator
index.html               Generated English page
fr/, es/, it/, de/       Generated French, Spanish, Italian and German pages
ar/, zh/, pt/, hi/       Generated Arabic, Chinese, Portuguese and Hindi pages
app.js                   Bluetooth, reconnect, history and device persistence
i18n.js                  Nine language catalogs and localized metadata
styles.css               Responsive LTR/RTL interface
site.webmanifest         Installable app metadata
robots.txt               Project robots file; see GitHub Pages scope above
sitemap.xml              Generated English and eight localized URLs
img/                     Product, social preview and icon assets
custom_components/       Home Assistant integration installed by HACS
hacs.json                HACS name and minimum Home Assistant version
tests/                   Connection, SEO and Home Assistant checks
docs/                    Contributor and technical documentation
```

## Protocol notes

The dashboard uses the Xiaomi service `EBE0CCB0-7A0A-4B0C-8A1A-6FF2997DA3A6` and these characteristics:

| Function | Characteristic |
| --- | --- |
| Time and timezone | `EBE0CCB7-7A0A-4B0C-8A1A-6FF2997DA3A6` |
| Stored-record counts | `EBE0CCB9-7A0A-4B0C-8A1A-6FF2997DA3A6` |
| History start index | `EBE0CCBA-7A0A-4B0C-8A1A-6FF2997DA3A6` |
| History notifications | `EBE0CCBC-7A0A-4B0C-8A1A-6FF2997DA3A6` |
| Temperature unit | `EBE0CCBE-7A0A-4B0C-8A1A-6FF2997DA3A6` |
| Temperature/humidity notifications | `EBE0CCC1-7A0A-4B0C-8A1A-6FF2997DA3A6` |
| Battery | `EBE0CCC4-7A0A-4B0C-8A1A-6FF2997DA3A6` |

Celsius is written as `0xFF`; Fahrenheit is `0x01`. Temperature notifications are decoded as signed little-endian values so negative readings remain valid: hundredths of a degree Celsius, then the humidity in %, whatever unit the clock displays. The battery level is one byte, in %.

The record counts are two unsigned 32-bit values: the index of the newest hourly record, then how many records the clock keeps, so the oldest one is `newest - kept + 1`. After an index is written to the history start index, enabling history notifications makes the clock send its records from that index on, oldest first, and stop after the newest one ([h4/lywsd02 #28](https://github.com/h4/lywsd02/pull/28)). Each record has 14 bytes: index and time (unsigned 32-bit), then the maximum temperature (signed 16-bit hundredths of °C), maximum humidity (8-bit), minimum temperature and minimum humidity. A record covers a completed hour and carries the clock's own Unix time at its start: the dashboard capture of September 13, 2026, read at 20:43, shows 19:00 as its newest record. The Home Assistant integration reads the time and the record counts before setting the time, removes the offset of the clock (drift, time correction, minutes of a fractional zone) from each record and rounds it to the hour; records newer than the counts read are left for the next sync. Hours of fractional zones start at half past in UTC and are rounded up.

The time value has 5 bytes: the Unix time (unsigned 32-bit little-endian) and the UTC offset in whole hours (signed 8-bit). Fractional zones such as UTC+05:30 keep the whole hours in the offset byte and add the remaining minutes to the timestamp. The 12/24-hour display uses a 7-byte command on the same characteristic (`0xAA` in the last byte for 12 hours). Only the LYWSD02MMC accepts it; the plain LYWSD02 rejects its length. The dashboard therefore sends the time first and treats this command as optional. The Home Assistant integration does the same, after the temperature unit, and only when a time format was chosen in Home Assistant.

## Widget audit

The implementation was compared with [`fildunsky/LYWSD02MMC-widget`](https://github.com/fildunsky/LYWSD02MMC-widget/blob/master/win/lywsd02_widget_win.py).

Useful device behaviors adopted from that project:

- Clock-drift calculation against the selected local time zone
- Automatic time synchronization above a 10-second threshold
- Fractional time-zone support by storing whole hours in the signed timezone byte and compensating remaining minutes in the Unix timestamp
- Persistent selection and a configurable polling/reconnection workflow

Native-only features not copied into the web dashboard:

- MAC-address and RSSI scan results: Web Bluetooth deliberately hides these details
- Windows system-tray icon and start-at-login behavior
- Background polling after the browser tab is closed
- MHO-C303 selection: this project remains focused on the LYWSD02 protocol and history characteristics

The widget also calculates a configurable comfort status. That is a useful future visualization, but it is not written to the stock LYWSD02 firmware and was kept out of the current device-control surface.

## Firmware research notes

The device research on September 13, 2026 recorded the PVVX firmware `LYWSD02MMC_v59.bin` and a hardware-programmer requirement for the LYWSD02MMC. This was not a browser OTA workflow. Do not flash binaries made for the different LYWSD03MMC model.

For most users, passive ESPHome/Home Assistant monitoring, clock synchronization and stock-firmware history provide the best benefit without opening the device.

## Technical references

- [Web Bluetooth API](https://developer.mozilla.org/docs/Web/API/Web_Bluetooth_API)
- [Web Bluetooth connection cancellation](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetoothremotegattserver-disconnect)
- [h4/lywsd02](https://github.com/h4/lywsd02), stock protocol and history format
- [ESPHome Xiaomi BLE](https://esphome.io/components/sensor/xiaomi_ble/#lywsd02)
- [Home Assistant LYWSD02 Sync](https://github.com/ashald/home-assistant-lywsd02), including [12/24-hour support on the LYWSD02MMC only](https://github.com/ashald/home-assistant-lywsd02/issues/10)
- [PVVX ATC MiThermometer](https://github.com/pvvx/ATC_MiThermometer)
- [fildunsky LYWSD02MMC widget](https://github.com/fildunsky/LYWSD02MMC-widget)

These references were gathered during the device research on September 13, 2026. Check the upstream projects for later changes.
