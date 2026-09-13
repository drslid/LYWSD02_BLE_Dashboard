# Contributor and technical notes

For instructions on synchronizing your clock and changing its display settings, see the [user guide](../README.md).

This page collects implementation details and the device research behind the dashboard. Run the local commands from the repository root. Browser tests use simulated sensors; confirm Bluetooth behavior and device writes with a physical LYWSD02.

## Run locally

No build step or package installation is required.

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173/`. Real Web Bluetooth tests should use the HTTPS GitHub Pages deployment; localhost is accepted as a secure development context by Chromium.

Run the connection regression checks with Node.js, without installing packages:

```bash
node tests/connection-regressions.cjs
```

These checks simulate device switching, cancellation during connection setup, delayed Bluetooth responses and the retry limit. They do not replace validation with physical sensors.

## Project structure

```text
index.html          Semantic application shell and SEO metadata
app.js              Bluetooth, reconnect, history and device persistence
i18n.js             Nine language catalogs and localized metadata
styles.css          Responsive LTR/RTL interface
site.webmanifest    Installable app metadata
robots.txt          Crawler policy and sitemap location
sitemap.xml         English and eight localized URLs
img/                Product, social preview and icon assets
tests/              Connection and device-switching regression checks
docs/               Contributor and technical documentation
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

Celsius is written as `0xFF`; Fahrenheit is `0x01`. Temperature notifications are decoded as signed little-endian values so negative readings remain valid.

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
- [Home Assistant LYWSD02 Sync](https://github.com/ashald/home-assistant-lywsd02)
- [PVVX ATC MiThermometer](https://github.com/pvvx/ATC_MiThermometer)
- [fildunsky LYWSD02MMC widget](https://github.com/fildunsky/LYWSD02MMC-widget)

These references were gathered during the device research on September 13, 2026. Check the upstream projects for later changes.
