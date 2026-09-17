# Solaripe / Amsu Project Handoff

Updated: 2026-09-14. Workspace: `C:/Users/omkar/solaripe`.

## Dragging and quote integration (September 14)

Obstacle pointer handlers previously depended on a validation callback that changed with obstacle state, resetting the active drag after movement. Validation now uses a current callback ref; obstacle meshes move directly during pointer movement and commit state once on pointer-up. Cancellation restores the stored position. Selection may rebuild meshes, so drag updates resolve the current obstacle group by id. Browser regression asserts three increasing positions within one held pointer and persistence after release.

The 3D Generate Quote action now saves the design first, refuses navigation on save failure and passes projectId. The quote form stores an optional designUrl inside its existing snapshot JSON. QuoteDesignSection provides a dedicated linked design section in the document and a native link in the rasterized saved-quote viewer. `lib/designPdfLinks.ts` restores real jsPDF URI annotations after html2canvas rasterization. `lib/designQuoteLink.ts` validates UUID, path, read-only client parameter and HTTP(S) scheme. The link opens the LATEST saved design, not an immutable geometry snapshot; that distinction is visible in the quote. Existing quotes without a design link are unchanged. This work does not redesign the existing public-design authorization model.

Client links need a publicly reachable deployed origin. Set NEXT_PUBLIC_SITE_URL to the correct public application origin, or generate quotes on that deployed site. Localhost links generated in development cannot be opened by remote clients. No deployment was performed. Backup: `backups/design-before-drag-quote-20260914.zip`. Added quoteLink.test.ts verifies URL validation and actual PDF URI annotations. Full quote workflow/provider integration is not equivalent to a sandbox fixture test; verify a deployed client's access before sending a proposal.

## Latest footprint alignment work (September 13)

The user clarified that the footprint, not the 23m height, looked oversized against the map. Do not change building height to address this. Found independent map/overlay zoom and pan paths: 2D drawing scale could drift from the underlying Google map, while 3D used the original trace scale. Added `utils/roofMapTransform.ts` to reproject the saved roof anchor and trace scale into the map viewport with Web Mercator. `MapBackground.tsx` synchronizes the drawing transform on map center/zoom, resize and roof changes. Wheel/pan in DesignCanvas and toolbar zoom/fit route through the map when available; standalone canvas fallback remains.

Top view now uses an orthographic camera, preserving equal projected footprint at roof and ground height. Perspective mode remains available. Controls, picking, mesh rebuilding, resizing and zoom support both camera types. This is a presentation correction, not a rescaling of geometry. Browser regression adds a rotated-polygon extrusion vertex check and a roof/ground projection equality check. Two map-transform unit tests cover zoom, pan and resize invariance. Backup: `backups/design-before-map-alignment-20260913.zip`.

Important: the user's screenshot showed an unsaved 1448.7m2 trace, while the last server-saved trace was 335.95m2. The exact in-memory edited trace was not available to inspect. Existing geometry damaged by editing against an independently zoomed map is not silently repaired or repacked; inspect the now georeferenced boundary and correct it explicitly. Live Google imagery agreement still requires site-specific visual verification; fixture tests establish transform consistency, not survey accuracy.

## Product and user priorities

Latest visual pass: `components/design/obstacleModels.ts` now creates ribbed tanks, concrete stair enclosures with illustrative access steps and rails, fan/grille AC units, framed skylights and capped vents. Materials are muted to reduce contrast with satellite surroundings. Footprints and entered heights are unchanged. Each obstacle has one hidden `obstruction-envelope` mesh for conservative geometric shading; all display meshes carry `userData.visualDetail` and are excluded from the analytical raycast. Steps and rails are illustrative, not surveyed access designs. `tests/design/obstacleModels.test.ts` checks dimensions and separation. Backup: `backups/design-before-obstacle-materials-20260913.zip`.

Amsu is a solar EPC operating system for Indian installers. The repository contains lead/CRM management, projects and pipeline milestones, quotations, client-facing design previews, settings/products, and calling integrations. Recent work focused on the solar Design module; the rest of the application has not been comprehensively audited.

The user wants an ARKA-inspired, ergonomic roof designer for Indian buildings. Preserve the existing workflow and Three.js renderer; do not replace everything with a new renderer or generic mockup. Priorities: accurate scale, actual module specifications, usable orbit/pan/zoom controls, realistic raised panels, clean satellite context, clear roof tracing handles, then visual polish. Accuracy must not be invented for better screenshots. Back up design files before substantial edits.

## Stack and development

- Next.js 16.2.6 App Router, React 19, TypeScript 5.7, Node.js.
- Three.js 0.185.1 directly (not React Three Fiber), OrbitControls, procedural canvas textures.
- React Konva for 2D tracing; Zustand + Immer for design state.
- Supabase SSR authentication and Postgres persistence; JSON design records.
- Tailwind 4, component CSS, Lucide icons. SunCalc 2.0.2 for sun position.
- Other integrations include Twilio, Groq/calling services, Google satellite imagery, PDF/XLSX handling. Consult implementation before changing any integration.
- Windows PowerShell: use `npm.cmd` and `npx.cmd`. `npm.cmd run dev` runs Next. The active development server is normally http://localhost:3000; inspect before starting another. Port 3001 may contain a stale production instance.
- Read relevant guides in `node_modules/next/dist/docs/` before Next.js changes, as instructed by AGENTS.md.
- Working tree contains accumulated user/agent modifications and backup files. Do not reset, clean, or revert unrelated changes. Do not expose `.env.local` secrets.

## Main design files

- `app/design/DesignPageContent.tsx`: 2D/3D orchestration, project load, shared read-only client view, responsive layout/theme.
- `components/design/DesignCanvas.tsx`: Konva roof outlines, vertices, drawing and 2D objects.
- `components/design/SolarDesign3D.tsx`: large production renderer; scene lifecycle, module/rack meshes, obstacles, camera interaction, layout generation, inspector, exports, shading orchestration, store synchronization.
- `components/design/design-workspace.css`: active 3D workspace styling.
- `components/design/DesignToolRail.tsx`, `DesignTopBar.tsx`: editor navigation.
- `components/design/sceneMaterials.ts`: PV/concrete textures and disposal helpers.
- `components/design/roofGeometry.ts`: footprint containment/intersections and geometry helpers. Some terrace helpers exist but active analysis does not support stepped roofs.
- `components/design/designAccuracy.ts`: complete projected-module footprints, setbacks, obstacle collision validation, geographic reanchoring after roof vertex edits.
- `components/design/solarPosition.ts`: full calendar date + IST to UTC conversion, SunCalc compass bearings.
- `components/design/sampleShading.ts`: cooperative, cancellable ray sampling with bounding-box broad phase.
- `utils/moduleDimensions.ts`: equipment-unit compatibility and exact thousandfold module-size recovery (latest fix).
- `store/designStore.ts`: project state, equipment, 2D objects, history, saves/loads.
- `types/index.ts`: design records and physical module dimensions.
- `lib/designs.ts`: Supabase design persistence through cookie-aware SSR client.
- `app/api/satellite-image/route.ts`, `lib/satelliteImage.ts`: satellite provider integration.
- `app/api/public-design/route.ts`: shared client-view endpoint using server admin client and supplied project UUID. Its sharing security model has NOT been audited during this work.

## Coordinate and unit contracts

Roof polygon points and 2D object positions/sizes are scene pixels. `roof.traceMpp` captures metres per pixel at tracing time; never substitute current zoom for valid saved trace scale. The stored `centroidLatLng` is actually the roof bounding-box center geographic anchor. Editing a vertex now shifts that anchor by the bounding-box-center delta.

The active 3D scene is in metres, centered on the active roof bounding box: X east, Y up, Z south. Compass azimuth is 0 north, 90 east, 180 south. Three.js assembly yaw is `(180 - azimuth)` radians conversion; panel tilt rotates around local X. Keep rendering, containment, shading and layout transforms consistent.

Equipment dimensions are now explicitly `dimensionUnit: 'mm'`. Module records have `moduleWidthM` and `moduleHeightM` in metres; existing module dimensions, power, model and orientation must survive equipment changes and save/reload. Landscape swaps the physical axes for rendering. Avoid hardcoded manufacturer dimensions.

## Latest reported defect and fix

User screenshots showed apparently vertical walls/poles instead of panels. A read-only request to the affected project's existing public-design endpoint revealed equipment `panelWidth: 1.134`, `panelHeight: 2.278` with no unit marker. These legacy values are metres, while new code divided them by 1000 assuming millimetres. Panels became a thousand times too small, while rack heights/thicknesses remained full size. The saved endpoint did not contain the user's current unsaved 107-panel layout, so that exact in-memory scene could not be inspected.

Compatibility now normalizes untagged legacy equipment where BOTH dimension values are between 0.1 and 10 into millimetres and sets an explicit unit marker. This is a bounded historical compatibility rule, not manufacturer verification. Explicitly tagged millimetres are never reinterpreted. Converted specifications require reconfirmation. Load/update/save and renderer paths use normalization. Sub-centimetre saved module sizes are recovered only if BOTH exactly match a thousandfold error against the selected equipment dimensions. Different legitimate module sizes are preserved. Invalid tiny geometry is not rendered as negative-sized PV faces or oversized support hardware.

Do not silently repack a user's layout or overwrite the database. If placement occurred while dimensions were wrong, repaired modules may overlap. The user should confirm specifications and explicitly regenerate/align the layout after inspection. The current unsaved browser state may need returning to 2D and reopening 3D; avoid advising an immediate refresh that loses unsaved work.

## Completed work before latest fix

- Retained original renderer and organized Panels, Obstacles, Building, Electrical and Analysis tools.
- Camera pan is independent of moving selected objects; orbit, zoom, fit, top and perspective views retained. Touch and pointer handling improved.
- Renderer skips GPU redraws when idle; camera damping still updates. Scene/material disposal and async load cancellation are present.
- Clean extruded roof geometry, parapets, neutral/concrete materials, raised module racks with rails/legs/bracing; no invented decorative facade windows.
- Satellite coverage grows with roof size (at least approximately 360m), with unlit photo material, separate shadow plane and fallback ground. Larger coverage does not create 3D neighboring buildings.
- Yellow screen-space roof handles remain visible across zoom levels.
- Module dimensions/power are preserved individually. Boundary checks consider full footprints and concave notches, obstacles and panel overlap.
- Full-date IST sun controls, zero direct sunlight at night, result invalidation when inputs change, progress and cancellation.
- Missing measurements/specifications/obstacle heights and unsupported roofs block shading instead of claiming accuracy.

## Analysis limits: do not overclaim

- Current active analysis is for the active flat roof only. Nonzero roof slope or terraces block analysis. Multi-roof shading is not comprehensively implemented.
- Nine sample points per module, at selected instant or half-hour samples through a selected day, with equal weighting. This is sampled geometric shading, NOT irradiance-weighted annual energy loss.
- Includes modeled building/parapet/obstacle/module meshes. Unmodeled neighbors and trees, and illustrative mounting hardware, are excluded. Thin blockers may require higher sampling density.
- Satellite imagery cannot supply reliable building/obstacle heights, roof load capacity, structural/wind certification or unseen objects. User confirmation is not independent survey validation.
- Fixed annual generation estimates were removed from this 3D summary/export path. Other quotation/statistics modules may still contain assumptions; audit separately before promising accurate system-wide yield.
- Material changes do not alter analytical geometry. Camera may still reset on height/parapet scene reconstruction.
- Larger arrays use pairwise geometry checks; no comprehensive BVH/instancing optimization or thousand-panel latency guarantee.

## Tests and verification

Run from the workspace:

```powershell
npx.cmd tsx --test tests/design/geometry.test.ts tests/design/accuracy.test.ts tests/design/moduleDimensions.test.ts
node tests/design/verify-accuracy.mjs
npx.cmd tsc --noEmit --pretty false
git diff --check
```

Playwright/esbuild test scripts may require execution outside the restricted sandbox on this machine. Browser tests use isolated fixture persistence and mocked imagery, not the user's real saved design; they do not establish surveyed geospatial accuracy. The fixture harness mounts production components and additionally tests a mocked shared client route. Inspect screenshots and canvas-pixel checks, not just successful compilation.

After the latest unit fix, all 11 unit tests and the desktop/mobile accuracy browser suite passed. The legacy-units browser fixture asserts each repaired module is 1.134m wide, 2.278m long and 0.035m thick, with nonblank canvas pixels. Browser output: `artifacts/design-accuracy-validation/`, including `legacy-units-fixed.png`. `git diff --check` passed; full TypeScript checking still reports only the three pre-existing backup-page errors below.

Known pre-existing TypeScript errors are in `app/design/DesignPageContentBackup.tsx`, `app/leads/pageBackup.tsx`, and `app/projects/pageBackup.tsx` (missing callback/argument props). Do not claim a clean full build or modify unrelated backup pages just to hide these errors.

## Backups

`backups/design-before-panel-units-20260912.zip` captures renderer/store/types before the latest unit repair. Earlier archives include `design-before-accuracy-20260912.zip`, `design-before-reference-polish-20260911.zip`, `design-before-ui-only-20260911.zip`, and `design-before-3d-upgrade-20260910.zip`. Inspect archive contents before restoring; never overwrite the entire dirty workspace.

## Recommended continuation

### Security and quote work, September 14

User chose recoverable managed encryption, not vendor-held-only keys. They authorized finishing local code/tests, but require approval before production database, deployment-secret or backup changes. None of those production changes have been performed.

QuoteDesignSection now sits compactly on P1 rather than a standalone page. Signed project/tenant-scoped design links expire after 30 days; authenticated owners mint via POST /api/design-share with server-only DESIGN_SHARE_SECRET. /api/public-design no longer accepts UUID-only links. Existing old links must be regenerated. If sharing is not configured, a saved design can still generate a quote without a design link, with a notice. Sharing signatures are NOT encryption of stored project data. Rotating/loss of that secret invalidates links, not records.

Default API auth gate, scoped satellite reads, Twilio HTTP/WSS signature verification, cron bearer-only authentication, tenant-specific notification recipient and private runtime-cache cleanup are implemented. New settings have blank notification phone rather than the platform owner's default. Full live security audit is NOT complete: RLS/storage/foreign-key ownership, provider deployment, audit logging, backups and restores still need verification. Migration 0021 is prepared only and must first be reviewed in staging; never replay historical 0004/0005 TRUNCATE migrations.

See docs/security-recovery.md for setup and recovery requirements. Local tests: tests/security/access.test.ts, tests/security/verify-routes.mjs (mock DB), tests/design/verify-accuracy.mjs (local Next server plus fixtures), tests/design/verify-quote-layout.mjs. Quote cover test stays at five pages, 1123px cover, rendered local images and compact clickable link. Three existing backup-page TypeScript errors remain. An earlier .next/dev/types/validator.ts was malformed; source-only checks exclude generated files and still report only those backup errors. Local server launched hidden on localhost:3000, logs artifacts/security-dev-server*.log. No real calls placed or production rows changed.

Backup before quote/security work: backups/quote-security-before-20260914.zip. Preserve all unrelated dirty worktree changes.

1. Verify the user's actual unsaved layout after the compatibility fix; correct any remaining unit mismatch without guessing hardware or deleting panels.
2. Add persisted mixed-module and landscape round-trip tests; extend malformed-data validation and migration provenance if needed.
3. Audit actual provider imagery alignment against known control points and the roof's saved trace scale.
4. Only then extend surveyed stepped/sloped geometry, neighbor obstructions and validated irradiance/yield modeling as separate scoped work.
5. Preserve a clear distinction between proposal visualization, preliminary shading and professionally verified engineering results.
