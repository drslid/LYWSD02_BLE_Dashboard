# PVVX compatibility assessment and project naming

Reviewed on October 30, 2026 against [PVVX ATC_MiThermometer commit cafd86d](https://github.com/pvvx/ATC_MiThermometer/tree/cafd86d2f091d6ac80ac9e71a3fb1862b34133be), its configurator and the current dashboard source. The development version now implements an experimental PVVX adapter in the browser and Home Assistant. **Physical validation is still pending.** See the [current device matrix and usage](DEVICE_SUPPORT.md) for implementation status and limits.

## Current support depends on firmware

The established dashboard and `lywsd02_sync` path implements the stock LYWSD02 GATT protocol for LYWSD02, LYWSD02MMC and MHO-C303 with original firmware. The physical MHO-C303 validation was performed in Home Assistant by [@drug123](https://github.com/drslid/LYWSD02_BLE_Dashboard/pull/1#issuecomment-6524401251); its browser path still needs physical validation. The new PVVX adapter uses its own command service and validates identity, firmware v4.7–v5.9 and service capabilities before clock/settings writes.

PVVX firmware is another protocol even when installed on an LYWSD02MMC. Adding `ATC_` or more model names to discovery would not provide compatibility: the existing service lookup and characteristic reads/writes would still be wrong. MHO-C303 and MHO-C401 are different devices; support for the former does not validate the latter.

## Feasible device groups

These priorities are an implementation recommendation inferred from the shared PVVX protocol and the upstream model list, not a ranking of tested hardware.

| Hardware and firmware | Feasibility | Suggested priority |
| --- | --- | --- |
| LYWSD03MMC running PVVX BLE | Live measurements, battery, recorded samples, display settings and clock screen where enabled | First reference device for a PVVX adapter; verify its exact board and firmware version |
| MHO-C401 / MHO-C401N running PVVX BLE | Same adapter with model-specific display capabilities | Next validation device; distinguish this model from MHO-C303 |
| CGG1-M / CGG1N and CGDK2 running PVVX BLE | Shared command transport; displays and capabilities differ | Extend the validation matrix once the adapter works |
| MJWSD05MMC / English variant running PVVX BLE | Especially relevant for clock use; model-specific clock/display configuration | A useful second phase for the clock-sync integration |
| LYWSD02MMC running PVVX BLE | Feasible through the PVVX adapter rather than the stock adapter | Optional; original firmware has no TelinkOTA and requires a wired programmer for the initial reflash |
| MHO-C122 and the upstream Tuya BLE firmware variants | Possible where the installed build exposes the required services | Later, model by model; board revisions and flashing paths vary |
| PVVX builds without a screen | Sensor readings and history where exposed; no visible clock to synchronize | Optional sensor support rather than pretending every device is a clock |
| Zigbee-only firmware | No Web Bluetooth connection | Outside this Bluetooth dashboard; dual BLE/Zigbee firmware needs its own validation |
| Other models with factory firmware, or ATC1441 firmware | The PVVX model list does not establish their protocol compatibility | Separate research and validation |

Upstream sources: [model catalogue](https://github.com/pvvx/ATC_MiThermometer/blob/cafd86d2f091d6ac80ac9e71a3fb1862b34133be/README.md), [build capabilities](https://github.com/pvvx/ATC_MiThermometer/blob/cafd86d2f091d6ac80ac9e71a3fb1862b34133be/src/app_config.h), [LYWSD02MMC flashing limitation](https://pvvx.github.io/LYWSD02MMC/).

## Protocol work required

| Function | Current stock Xiaomi adapter | PVVX adapter requirement |
| --- | --- | --- |
| Transport | Service `ebe0ccb0-…` and separate characteristics | Service `0x1F10`, command/notification characteristic `0x1F1F`; Write Without Response plus notification replies |
| Identification | Advertised name prefix, model saved in the config entry | Validate a `0x00` device-ID reply: protocol revision, hardware, firmware and service flags |
| Time | Timestamp plus a signed timezone byte on `ebe0ccb7-…` | `0x23` command plus a 32-bit timestamp; separate timezone handling |
| Temperature / humidity | Signed hundredths of °C plus humidity in whole percent | Standard Environmental Sensing characteristics or PVVX `0x33` notifications; humidity uses hundredths of percent |
| Battery | Xiaomi characteristic `ebe0ccc4-…` | Standard Battery Service `0x180F` / `0x2A19`, or relevant PVVX fields |
| Settings | Dedicated unit characteristic and optional 12/24-hour command | Read, decode and modify `0x55` configuration while preserving unrelated bits and respecting firmware/model differences |
| History | Indexed hourly minimum/maximum records | `0x35` command and a different transfer/record format containing timestamped samples/averages, not hourly extrema |

The PVVX command header explicitly states that every device does not support every command. A valid `0x00` reply provides the service flags; the UI should expose only the functions available on that device. A renamed `ATC_` device can still use PVVX, and a BTHome advertisement alone does not prove that a device has the PVVX command service.

Sources: [command IDs and device-ID structure](https://github.com/pvvx/ATC_MiThermometer/blob/cafd86d2f091d6ac80ac9e71a3fb1862b34133be/src/cmd_parser.h), [command parser](https://github.com/pvvx/ATC_MiThermometer/blob/cafd86d2f091d6ac80ac9e71a3fb1862b34133be/src/cmd_parser.c), [connection services](https://github.com/pvvx/ATC_MiThermometer#bluetooth-connection-mode), [configuration layout](https://github.com/pvvx/ATC_MiThermometer/blob/cafd86d2f091d6ac80ac9e71a3fb1862b34133be/src/app.h).

### Time and history need particular care

Despite the firmware's UTC-oriented names, the upstream configurator's `setDevTime()` sends Unix seconds **plus the browser's local timezone offset**. Reusing the current five-byte stock payload would be wrong: its first byte would be interpreted as the command and it carries a timezone byte that PVVX does not use. A new adapter must explicitly define the device time basis, fractional-zone handling, daylight saving changes and manual correction, then test it against the displayed clock.

PVVX records contain a time, temperature, humidity and battery voltage. The upstream documentation describes averaged measurements, with a configurable recording interval. They cannot be presented as the stock device's true hourly minimum/maximum records. Historic timestamps can also be ambiguous if the clock or its time basis was changed earlier; normalize only when the offset is known and communicate uncertainty rather than inventing UTC timestamps.

Sources: [upstream configurator, `setDevTime()`](https://github.com/pvvx/pvvx.github.io/blob/master/ATC_MiThermometer/TelinkMiFlasher.html), [record structure](https://github.com/pvvx/ATC_MiThermometer/blob/cafd86d2f091d6ac80ac9e71a3fb1862b34133be/src/logger.h), [recording semantics](https://github.com/pvvx/ATC_MiThermometer#reading-measurements-from-flash).

## Implementation and remaining validation

1. Implemented: separate adapters, identity/capability checks, command queues, cancellation, clock read-back and settings that preserve unrelated flags. Simulated tests cover signed/fractional offsets, malformed/unknown identities, errors and disconnections.
2. Implemented in the browser: measurements, battery, sample-history transfer and a dedicated CSV containing raw device timestamps. The record-count selector counts samples for PVVX, hours for stock clocks.
3. Implemented in Home Assistant: discovery hints, protocol selection, scheduled time/settings updates and readings. Existing integration/entity/statistics identities remain unchanged. PVVX records are deliberately not imported as stock hourly extrema.
4. Pending: physical verification of clock display, daylight saving transitions, transfer completion, exact board variants and firmware behavior. PIN-protected command services are outside this implementation.
5. Pending: wider firmware/hardware coverage and a release after physical validation. Unknown identities and Zigbee builds are rejected rather than used through the stock protocol.

Home Assistant already receives PVVX sensors configured for BTHome through its built-in [BTHome integration](https://www.home-assistant.io/integrations/bthome/). The useful addition here would be a simpler device-control interface, time synchronization and history retrieval. Reimplementing passive sensor reception alone would add little value. Keep firmware installation in the existing upstream flasher initially rather than expanding this dashboard into an OTA tool.

## Naming recommendation

A broader public name such as **BLE Climate Dashboard** fits multiple clock and sensor protocols. The current project can keep its established name while the new profiles remain experimental. A rename should follow working, physically validated multi-protocol support, or be chosen explicitly as a branding decision.

| Name or identifier | Recommendation |
| --- | --- |
| README heading, site header, PWA display name, GitHub description | Can move to a broader brand without changing saved devices |
| User-facing integration name | Can use a broader name while retaining the integration domain |
| GitHub repository name and GitHub Pages URL | Treat as a separate migration: update canonical URLs, language links, sitemap, HACS and installation links |
| Home Assistant domain `lywsd02_sync` and existing entry/entity unique IDs | Preserve; these are identities used by installed integrations and automations |
| External statistics IDs such as `lywsd02_sync:…` | Preserve so existing history and dashboard cards remain linked |
| Browser storage keys `lywsd02-*` | Preserve or migrate explicitly; a cosmetic rename should not discard aliases and device history |
| Internal class names and `LYWSD02_I18N` | Rename only when useful during refactoring; they are not the user-facing brand |

The recommendation is to broaden the public identity when the product scope actually expands, while keeping established internal identities and providing migrations where a technical rename is necessary. No repository, domain or storage identifiers were renamed by this assessment.
