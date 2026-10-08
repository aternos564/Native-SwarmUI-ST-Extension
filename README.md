# Native SwarmUI for SillyTavern

A small SillyTavern third-party extension that talks directly to SwarmUI's native API from the browser.

## Features

- Native SwarmUI API connection
- Model discovery
- LoRA discovery and weight
- VAE discovery and selection
- Prompt and negative prompt
- Steps, CFG, width and height
- Sampler selection
- Direct text-to-image generation

## Install from SillyTavern

1. Open **Extensions**.
2. Choose **Install Extension**.
3. Paste this repository URL:
   `https://github.com/aternos564/Native-SwarmUI-ST-Extension`
4. Install and reload SillyTavern.

SillyTavern's installer expects the extension manifest at the repository root.

## SwarmUI URL

Default target:

`http://192.168.1.6:7801`

This extension talks to SwarmUI's native `/API/*` endpoints directly. It does not use the separate SillyTavern adapter on port 7821.

## CORS

Because the extension runs in the SillyTavern browser, SwarmUI must allow requests from the SillyTavern page origin.

The extension shows the current browser origin at the bottom of its panel.

## Notes

This project is currently version 0.2.0 and is intended for local/LAN use.
