"""Files read by HACS and Home Assistant before any integration code runs."""

from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any

from PIL import Image
import pytest

from custom_components.lywsd02_sync.const import DOMAIN, SCHEDULES, STATUSES, WEEKDAYS
from custom_components.lywsd02_sync.sensor import SENSORS

ROOT = Path(__file__).parents[2]
INTEGRATION = ROOT / "custom_components" / DOMAIN
TRANSLATIONS = sorted((INTEGRATION / "translations").glob("*.json"))
PLACEHOLDER = re.compile(r"\{\w+\}")


def load(path: Path) -> Any:
    """Read a JSON file."""
    return json.loads(path.read_text(encoding="utf-8"))


def flatten(data: dict[str, Any], prefix: str = "") -> dict[str, str]:
    """Return every translated string by its dotted key."""
    strings: dict[str, str] = {}
    for key, value in data.items():
        if isinstance(value, dict):
            strings.update(flatten(value, f"{prefix}{key}."))
        else:
            strings[f"{prefix}{key}"] = value
    return strings


def test_hacs_can_install_the_integration() -> None:
    """HACS needs one integration folder, a complete manifest and brand icons."""
    assert load(ROOT / "hacs.json")["name"] == "LYWSD02 Clock Sync"
    manifest = load(INTEGRATION / "manifest.json")
    for key in ("domain", "documentation", "issue_tracker", "codeowners", "name", "version"):
        assert manifest[key], key
    assert manifest["domain"] == DOMAIN
    assert manifest["bluetooth"] == [{"local_name": "LYWSD02*", "connectable": True}]
    assert [folder.name for folder in (ROOT / "custom_components").iterdir() if folder.is_dir()] == [DOMAIN]
    for name, size in (("icon.png", 256), ("icon@2x.png", 512)):
        with Image.open(INTEGRATION / "brand" / name) as image:
            assert (image.size, image.mode) == ((size, size), "RGBA")


def test_english_names_every_key_used_by_the_code() -> None:
    """Selectors, entities, states and icons use the same keys as the code."""
    english = load(INTEGRATION / "translations" / "en.json")
    assert list(english["selector"]["schedule"]["options"]) == SCHEDULES
    assert list(english["selector"]["weekday"]["options"]) == list(WEEKDAYS)
    assert list(english["entity"]["sensor"]) == [description.translation_key for description in SENSORS]
    assert list(english["entity"]["sensor"]["sync_status"]["state"]) == STATUSES
    assert list(english["entity"]["button"]) == ["sync_clock"]
    icons = load(INTEGRATION / "icons.json")["entity"]
    assert icons.keys() == english["entity"].keys()
    assert icons["sensor"].keys() == english["entity"]["sensor"].keys()


@pytest.mark.parametrize("path", TRANSLATIONS, ids=lambda path: path.stem)
def test_translations_match_english(path: Path) -> None:
    """Every language has the same keys and placeholders as English."""
    english = flatten(load(INTEGRATION / "translations" / "en.json"))
    translated = flatten(load(path))
    assert translated.keys() == english.keys()
    for key, text in english.items():
        assert sorted(PLACEHOLDER.findall(translated[key])) == sorted(PLACEHOLDER.findall(text)), key


def test_integration_speaks_the_site_languages() -> None:
    """The integration ships the nine languages of the web dashboard."""
    assert {path.stem for path in TRANSLATIONS} == {"en", "fr", "es", "it", "de", "ar", "zh-Hans", "pt", "hi"}
