# Third-party assets

All externally authored files shipped with the game are listed here. Each selected pack is dedicated to the public domain under Creative Commons Zero 1.0 Universal. Attribution is not required, but creator and source details are retained as thanks and for release auditing.

## LowPoly Robot

- Creator: Quaternius
- Source: https://quaternius.itch.io/lowpoly-robot
- License: CC0 1.0 Universal
- Included: `src/assets/models/Robot.glb` (browser-optimized conversion of the upstream FBX; mesh, skin, materials, and all 14 clips retained)
- Use: animated player character; the authored idle, walk, run, and jump clips are selected from the model at runtime

## KayKit: Space Base Bits — free edition

- Creator: Kay Lousberg (KayKit)
- Source: https://kaylousberg.itch.io/space-base-bits
- License: CC0 1.0 Universal
- Included: the shared `spacebits_texture.png` atlas and matching `.gltf`/`.bin` pairs in `public/assets/kaykit/` for:
  - base module A, base-module garage, and cargo depot C;
  - cargo A, cargo B, packed cargo A, stacked cargo A, container sets A and B;
  - drill structure, lander A, lander base, large landing pad, and lights;
  - rock A, rock B, rock groups A and B;
  - solar panel, space-truck trailer, low and tall structures;
  - low, mining, slope, and tall terrain modules;
  - straight tunnel A and tall wind turbine.
- Use: cargo trailer and freight, corridor barriers, rocks and cliffs, every hazard marker/mover, route lights, salvage discoveries, roadside dressing, and destination architecture

Only the 28 model pairs referenced by the renderer were retained from the upstream glTF directory. Alternate variants and source FBX/OBJ files are not redistributed.

## Pixel Art Seamless Textures

- Creator: Sketchy_B0t
- Source: https://sketchybot.itch.io/past
- License: CC0 1.0 Universal
- Included: `src/assets/models/dirt.png`
- Use: repeating visible material on the simulation-derived route surface

## Interface SFX Pack 1

- Creator: ObsydianX
- Source: https://obsydianx.itch.io/interface-sfx-pack-1
- License: CC0 1.0 Universal
- Included: `cursor_style_4.ogg`, `confirm_style_2_001.ogg`, `back_style_2_001.ogg`, and `error_style_2_001.ogg` in `src/assets/audio/`
- Use: navigation and action feedback

The remaining gameplay sounds are synthesized at runtime with WebAudio and contain no third-party samples.

## Sci-Fi UI — Free Essential Pack (R4orce)

Seven cues from this pack are used for the sandstorm and interceptor turret: shield deploy,
shield refused, missile launch, the danger-level tick, radar on/off, and cache found.

**This pack is NOT CC0.** R4orce's EULA grants unlimited commercial use with no royalties and
credit appreciated but not required. It explicitly forbids reselling, redistributing or
re-packaging the raw audio files as standalone sound assets. Only converted, game-integrated
`.ogg` files are committed here — the original 48 kHz/24-bit WAVs are deliberately not in this
repository.

Credit: R4orce — https://instagram.com/_r4orce

## Pixabay

- Abandoned house ruins (pixellabs) — skyline scenery. Decimated from 95 MB to 630 KB for the
  pair: 512px webp textures and meshopt geometry compression.
- Night vision ambience (freesound community upload) — the loop under radar vision.

Pixabay's content licence permits free commercial use without attribution.
