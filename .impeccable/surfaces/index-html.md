---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

## Scope

`index.html`: the whole app (connection screen, headset settings, sheets). Visitor mode: Operate.

## Task

Change any Max6 setting in seconds on the iPhone (Bluefy, one hand, headset on) or the PC (Edge/Chrome). Frequent: noise control, EQ. Occasional: dual connection, gestures, prompts, wear detection. Rare: reset.

## Direction contract

FORM: brief-pinned "à la Apple" (iOS AirPods settings page translated to the web); seed: seed:9f31216ca771fd21 (roll overridden by the pinned brief).

THESIS: the headset's own settings page, as iOS would ship it if UGREEN were a first-party accessory. Refuses the vendor-app dashboard of coloured tiles and banners.

OWN-WORLD: iOS grouped-inset lists on systemGroupedBackground, system font with iOS tracking, iOS system blue as the only accent, systemGreen switches, translucent large-title navigation bar with scroll-edge blur, sheets that rise from the bottom with critically damped springs. Light and dark follow the system.

STORY: open, tap Connect once, see the headset drawn with its battery, then every setting the firmware exposes, each confirmed by the headset itself.

FIRST VIEWPORT: large title "HiTune Max6", an authored SVG of the over-ear headset with battery and charging state beneath it, then the Noise Control segmented selector (Off, Noise cancellation, Transparency) at full width, then the first grouped list.

SIGNATURE: Noise Control selector: a glass pill that slides between three drawn icons on a spring, follows the pointer 1:1 when dragged, and settles only when the headset confirms; a pending state shows until the echo arrives.

RISK: Web Bluetooth only in Bluefy on iPhone; the headset stops advertising BLE after a while, so the connect flow must say how to wake it.
