# PanoToVR

[English](README.md) | [简体中文](README.zh-CN.md)

Create a Realsee VR space from local panoramas, returning a task code, project ID, VR URL, and local result directory. Supply a manifest or generate one automatically; resume polling with a known task code.

Install PanoToVR from v2.3.0 or later (v2.2.0 does not include it). From a local checkout, replace the repository source with `.`:

```sh
npx skills add realsee-developer/skills@v2.4.0 --skill panotovr --agent codex
```

Requires Node.js 22+, npm 10+, regional app credentials, and panorama-to-VR API access. See [the skill guide](SKILL.md) for dependency installation and commands. The generated local Claude plugin exposes `realsee-skills:panotovr`; the dedicated Codex installer and Arkclaw package remain Argus-only.

Obtain upload consent before execution. Workspaces may include temporary upload URLs; never commit or publish them. Only a [synthetic manifest template](assets/manifest.example.json) is bundled, without real images or run artifacts. Use Argus for depth, point clouds, and poses; use Blender reconstruction for editable scenes.
