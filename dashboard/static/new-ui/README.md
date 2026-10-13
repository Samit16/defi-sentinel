# DeFiSentinel — clickable local prototype

DeFiSentinel is a developer-facing pre-launch security-check prototype. This package is intentionally a **local mock-up**: Solidity is not compiled, no contract is attacked, no RPC endpoint is contacted, and all reported outcomes and profit estimates are sample data. It is not a professional audit.

## Run locally

The app uses native JavaScript modules, so do not open `index.html` with `file://`. From this folder run:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

No npm install, build step, CDN, or external runtime request is required. The Three.js module, bevelled-box helper, fonts, and their licences are included in this archive.

## How to use it

1. **Upload** — drop one `.sol` file or paste source. The page requires a `.sol` filename, non-empty source, and fewer than 100 KB. It displays file size and a short monospace preview.
2. **Configure** — choose VAULT, LENDING, or GOVERNANCE. Function names are extracted locally with a simple `function name(` regular expression. Choose a parsed function for each role. Add optional constructor arguments and select ETH/TOKEN holdings. RUN remains disabled while required roles are unmapped.
3. **Run** — four mock modules progress in sequence. The per-module and overall elapsed time are generated locally. CANCEL aborts the timers.
4. **Report** — view the demonstration verdict, counts, per-attack notes, estimates, exact findings text, and an inline SVG summary chart. Copy the report object as JSON or run again.
5. **History** — open any sample or locally generated report by selecting its table row. New local reports are stored in this browser's localStorage.

The five screens are hash-routed: `#/upload`, `#/configure`, `#/running`, `#/report`, and `#/history`.

## Source map

- `index.html` — document shell, persistent navigation, disclosure strip, import map, and decorative canvas.
- `css/style.css` — design tokens, layout, responsive rules, focus states, transitions, and static glass fallback.
- `js/app.js` — hash router, in-memory state, upload validation, event handlers, timers, and localStorage history.
- `js/views.js` — semantic screen templates and exact user-specified findings wording.
- `js/glass.js` — Three.js scene, custom emissive-strip environment, PMREM reflections, glass objects, cursor and touch motion, visibility and performance handling, and CSS fallback.
- `js/mock-api.js` — sample report records, fake attack outcomes/timers, and local history functions. Its top comment lists the future API endpoints.
- `vendor/` — Three.js r180 ES module, RoundedBoxGeometry helper, and MIT licence.
- `fonts/` — self-hosted Michroma, IBM Plex Sans, IBM Plex Mono, and SIL Open Font License notices.

## How the glass interaction works

A single transparent, fixed canvas sits behind the interface. Three.js r180 creates an octahedron for upload/configure, a tilted rounded slab for the running screen, and a bevelled cube for report/history. A small custom environment scene contains emissive cyan, magenta, blue, and amber strips. `PMREMGenerator` converts it into reflections for `MeshPhysicalMaterial`; the objects use transmission, thickness, IOR, iridescence, clearcoat, and dispersion when that material property is available. A deep-blue core and a thin edge pass keep the silhouette legible.

Pointer movement is read from `window` because the canvas does not intercept input. The glass eases toward the cursor, shifts with parallax, and is nudged near the visual object's screen position. Touch drag contributes a small rotational offset. The running shape accelerates gently with overall progress. Report glass uses a subtle warm tint for vulnerable demo verdicts or a cool tint otherwise. Rendering pauses when the document is hidden or the canvas is out of view. Device pixel ratio is capped at 2 and drops to 1 if the measured frame rate remains under 40 FPS. If WebGL creation fails, or reduced motion is enabled, CSS/SVG-like layered geometry is shown instead. The reduced-motion version is static.

## Checks performed

- Verified the standalone files load through a local HTTP server with no CDN or Google Fonts requests; the five primary routes and all vendored assets loaded without HTTP errors.
- Exercised upload errors (wrong extension, empty source, exactly 100 KiB) and successful source preview; checked the role-mapping gate, local function-name parsing, and enablement after all required roles were selected.
- Let all four mock modules reach the report, checked the exact Reentrancy finding/remediation copy and report JSON shape, copied its JSON, opened a history row, and exercised the empty-history state.
- Checked the simulated RUNNING/DONE progression and cancellation path; verified that sample outcomes are visibly labelled `DEMO DATA`.
- Verified the real WebGL canvas, the reduced-motion glass fallback, and a fallback with WebGL context creation disabled; observed no browser page errors.
- Checked Upload, Configure, and History at 360 px without page-level horizontal overflow, with the History table scrolling inside its own region.
- Captured one screenshot per screen in `screenshots/`; additional captures show live WebGL and fallback states.

## Known prototype limits

- Function parsing is intentionally regex-only; it does not understand Solidity syntax or overloads.
- Constructor arguments and ETH/TOKEN selection are captured as configuration context but are not used to compile or execute anything.
- Scan durations and outcomes are illustrative fixed sample scenarios, not findings about the uploaded source.
- The three reference images mentioned in the supplied brief were not present in the upload directory. The composition follows the written visual direction instead.
