# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/JS, no build step and no dependencies. Installable PWA (manifest + service worker). Hosted on GitHub Pages (account TeKuV) for the HTTPS that Web Bluetooth requires.

## Users

One owner of a UGREEN HiTune Max6 headset, French speaker, who uses it with an iPhone 17 Pro Max and a Windows PC. The official UGREEN app in their region does not support the Max6, so this app is their only way to change the headset's settings.

## Product Purpose

HiTune Max6 controls every setting the headset firmware exposes: noise cancellation and its level, equalizer, dual-device connection and the list of connected devices, voice prompts, prompt volume, game mode, high-quality decoding, spatial sound, the ANC button gestures, plus battery, codec and firmware version. Success: the owner changes a setting in seconds from either device and sees the headset confirm it.

## Positioning

It talks to the headset directly with the protocol reverse-engineered from the UGREEN Android app (com.wl.earbuds), so it works where the official app refuses the model.

## Operating Context

- iPhone: opened in the Bluefy browser (Safari has no Web Bluetooth), usually one-handed, often while wearing the headset.
- PC (Windows): Edge or Chrome, mouse and keyboard.
- Transport: BLE GATT service `66666666-6666-6666-6666-666666666666`, characteristic `77777777-7777-7777-7777-777777777777` (write + notify). The headset stops advertising BLE after a while; reconnecting may require power-cycling it.
- Frames: send `AA BB CC | cmd | len | data | crc16 LE`, response `DD EE FF | cmd | status | len | data | crc`, notification `85 86 87 | len | type | data`.

## Capabilities and Constraints

- Voice prompts: only English (0), Chinese (1), tones (2) exist in the protocol. On this firmware English is silent; French does not exist. Never promise French.
- Prompt volume range 1 to 15.
- No wear detection: the headset never answers command 19, and the UGREEN app hides it for the Max family. ANC button actions are limited to noise control, spatial sound, game mode or none.
- Factory reset (cmd 14) clears pairings: destructive, needs confirmation.
- Battery is a single value (over-ear headset), bit 7 = charging.
- No OTA firmware updates: out of scope, risk of bricking.

## Brand Commitments

Name: "HiTune Max6". The user asked for an app "à la Apple" (iOS settings-like feel). UI language: French. Never use the em dash character anywhere.

## Evidence on Hand

Protocol notes from the decompiled UGREEN app (v1.0.2) and live captures from the user's headset (firmware 1.0.4). No product photos of the Max6 are on hand; do not fabricate UGREEN branding or logos.

## Product Principles

1. The headset is the source of truth: show a value only after the headset reports it.
2. Every change is one tap and is confirmed visibly.
3. Say plainly what the headset cannot do instead of hiding it.
4. Works the same on the iPhone and the PC.
