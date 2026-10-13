# Bundled assets and licences

- **Three.js r180**: vendored `vendor/three.module.js` and `vendor/THREE-LICENSE.txt` from the official `mrdoob/three.js` repository; MIT licence.
- **RoundedBoxGeometry**: `vendor/geometries/RoundedBoxGeometry.js` from Three.js r180 examples, used to create beveled glass slab/cube silhouettes; MIT licence is included in `vendor/THREE-LICENSE.txt`.
- **Michroma Regular**, **IBM Plex Sans Variable**, and **IBM Plex Mono Regular**: self-hosted from the `google/fonts` repository in `fonts/`; each family has its corresponding SIL Open Font License text alongside the font file.

All runtime assets are local. The prototype does not fetch these assets from a CDN or Google Fonts at runtime.
