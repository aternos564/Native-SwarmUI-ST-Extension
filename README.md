# Native SwarmUI for SillyTavern

SillyTavern extension that uses a local **SwarmUI** installation as its image-generation backend, via SwarmUI's native `/API/*` endpoints. SwarmUI handles prompt interpretation, model/LoRA/VAE management, and generation orchestration (ComfyUI backend). The extension does not rewrite prompts and does not use the 7821 adapter.

## Features

- Native SwarmUI API (`GetNewSession`, `ListModels`, `GenerateText2Image`)
- Dynamic discovery: Stable-Diffusion models, LoRAs (multi-select), VAEs (Automatic when empty)
- Prompt + negative prompt passed through untouched
- Steps, CFG, width, height, sampler, image count (1–4), seed (-1 = random)
- Panel generation + **Generate + Send to Chat** (posts image(s) to the current chat)
- `/swarm your prompt here` slash command (generates with panel settings, posts to chat)

## Install from SillyTavern

1. Open **Extensions**.
2. Choose **Install Extension**.
3. Paste this repository URL:
   `https://github.com/aternos564/Native-SwarmUI-ST-Extension`
4. Install and reload SillyTavern.

SillyTavern's installer expects the extension manifest at the repository root.

After updating, use **Extensions → Manage extensions → Update** (or reinstall) so the Termux copy matches the fixed version.

## SwarmUI URL

Default target:

`http://192.168.1.6:7801`

Configure it in the panel if your SwarmUI host differs. Image URLs resolve against this base (`<url>/<View/... path>`).

## CORS (required for browser use)

The extension runs in the SillyTavern browser page, so SwarmUI must allow that page's origin. SwarmUI supports a **single** origin value, in `Data/Settings.fds`:

```text
AccessControlAllowOrigin: <your SillyTavern origin>
```

The panel shows the current browser origin at the bottom — copy that value into the setting and restart SwarmUI. Note: only one origin can be set, so if you currently use `https://agnai.chat` there, switching to SillyTavern will stop the Agnai client until you switch back.

## Notes

Local/LAN use only. No cloud APIs, no paid services.
