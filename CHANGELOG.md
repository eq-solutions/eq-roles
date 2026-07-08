# Changelog

All notable changes to `@eq-solutions/roles` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [2.5.1] - 2026-07-08

Access-model foundation, Phase 1 prerequisite (see `eq-context/eq/identity/ACCESS-MODEL-PLAN.md`).
Phase 1's plan assumed the Shell-side enforcement conversion would be a pure
refactor with no package changes ("Shell only"). The enforcement-site inventory
found 5 real hand-rolled `role === '…'` checks with **no existing PermKey to
convert to** — `can()`/`requirePerm()` type their `perm` argument from this
package's `PermKey`, so a permission has to exist here before Shell can check
it. This release adds exactly the 3 missing keys, each matching an existing
check's current grant set 1:1 — additive only, zero live behaviour change.

### Added
- **`ops` module + `ops.view_rates`** — promoted unchanged from Shell's local-only `OPS_MATRIX` (`src/permissions/matrix.ts`), which had no canonical package presence at all (unlike entity/intake/equipment etc., which Shell hand-mirrors from this package; `ops.*` didn't exist here in any form). manager + supervisor, matching the existing Shell grant exactly.
- **`ops.manage_rates`** — new. Matches the current hand-rolled check in `labour-hire-commit.ts` / `labour-hire-mutate.ts` / `labour-hire-parse.ts` (`is_platform_admin || role === 'manager' || role === 'supervisor'`) exactly.
- **`entity.manage_activation`** — new. Matches the current hand-rolled check in `update-data-activation.ts` / `get-data-activation-status.ts` (`role === 'manager' || is_platform_admin`) exactly. Manager-only.

## [2.5.0] - 2026-07-08

Access-model foundation, Phase 0 (see `eq-context/eq/identity/ACCESS-MODEL-PLAN.md`).
Preceded by an enforcement-site inventory across Shell/Field/Service/Cards/RLS —
findings are what shaped the scope below (see the inventory doc for detail).

### Added
- **`apprentice` gains `equipment.view`** — promoted from a live SKS `tenant_role_override`. Verified cross-app safe (Shell's client-side `EQUIPMENT_MATRIX` mirror updated in the same PR; the module's own doc comment already described the perm as "granted broadly so any field tech can check calibration").
- **`deprecated` field on `PermissionMeta`** (optional, additive) — `cards.view` / `cards.onboard` marked deprecated with a reason + replacement (`admin.review_cards` / tenant entitlement). Still emitted and enforced for existing `tenant_role_overrides`; new consumers should not grant them. Real removal is a future major bump once all consumers are confirmed clear.
- **`project_managers` canonical default group** — promoted from a tenant-specific (SKS) security group once it proved to be a common cross-cutting need (manage users, review Cards onboarding, view audit log) rather than a one-off.
- **`roles.dart` emit** — a new generated artefact (Dart 2.17+ enhanced enums, zero external package deps) mirroring `roles.ts`/`roles.js` exactly, for the eventual Cards/Flutter consumer. Not yet wired into Cards (tracked separately) — this release only ships the generator + the artefact.
- **`executive-scaffold.test.ts`** — proves the "adding a role tier is a one-file change" claim by exercising `buildArtefacts()`/`buildDartArtefacts()` against a synthetic model with an extra role spliced in, asserting zero `build.mjs` changes are needed and every generated surface (types, matrix, Dart) picks it up. Does not touch the real committed model — no new role shipped today.

### Explicitly NOT changed (see the inventory)
- `service.create` / `service.close` — a live SKS override grants these to `employee`, but the same `PermKey` also gates asset/customer-mutation rights in EQ Service's `canWrite()`. Promoting this canonically would silently change Service behaviour for every tenant. Stays tenant-local until PermKeys are split by app (Phase 3).
- `quotes.approve` — a live SKS override grants this to `supervisor`. Kept tenant-local (no strong cross-tenant safety evidence yet); the quotes module already has its own real, in-sync client matrix (`src/modules/quotes/permissions.ts`).
- `apprentice` → `intake.view` — reconsidered from an earlier tentative plan to remove it. Shell's own `intake/permissions.ts` documents this as a *deliberate* broad-by-design default ("view by default for all... gating tightens later"), not an oversight. SKS's denial override is a legitimate, tenant-specific tightening, not evidence the default is wrong.

### Docs (carried over from the unreleased 2.4.0 follow-up — never separately versioned)
- Reconciled stale "5-tier" references (README, `build.mjs` header, `model.json` `$comment`) to **6-tier** — the enum has carried `subcontractor` since 2.4.0. No code or matrix change; regenerated artifacts differ only in the header comment.
- Documented **EQ Field's** real adoption state: Field trusts the JWT `eq_role` (Phase D) and keys on canonical `EqRole`; its ~50 fine-grained in-app perms stay Field-owned (guarded against role-key drift); `subcontractor` is intentionally excluded from Field login (roster `employment_type` only).

## [2.4.0] - 2026-07-05

### Added
- **New role: `subcontractor` (rank 6)** — an external trade engaged for a job, distinct from an agency-supplied `labour_hire` worker. Same minimal baseline as `labour_hire`: `field.view` only. Found live: eq-shell's `cards-approve-staff.ts` had `'subcontractor'` hardcoded into its local `WORKER_ROLES` set for over a month with no matching DB enum value or canonical role — an app-vs-DB vocabulary drift that would have silently rejected the value the moment anyone actually tried to use it. This closes that gap at the source instead of leaving the app-side reference dangling.

### Changed
- 6-tier role model everywhere (was 5-tier): `manager / supervisor / employee / apprentice / labour_hire / subcontractor`.
- Version bumped to `2.4.0` (additive — new role + one permission grant, fully backward compatible; existing roles' grants are unchanged).

## [2.2.0] - 2026-06-04

### Added
- **Default security groups (`defaultGroups`)** — canonical starter security-group templates for seeding a fresh tenant (which today starts with **zero** groups — the gap Royce flagged). A group is a named bundle of *extra* `PermKey`s, **additive** on top of a user's base role (`session.extra_perms`), for **cross-cutting** grants that don't fit the role hierarchy. The build emits a typed `DEFAULT_GROUPS` const, a `DefaultGroupKey` union + `DefaultGroup` interface, and a `defaultGroupPerms(key): readonly PermKey[]` helper (returns `[]` for unknown keys) into `roles.ts` + `roles.js`; the resolved data is also in `roles.json`. Shipped set: `equipment_editors` (`equipment.view`, `equipment.edit`) and `report_viewers` (`reports.view`) — both grant only perms that cut across the role hierarchy, never a duplicate of what a role already grants.
- 6 new tests (83 total): well-formedness, real-perm-key validation, key/name uniqueness, `defaultGroupPerms` behaviour, a cross-cutting (non-no-op) invariant, and a `roles.js`-vs-model drift guard. `roles.dist.test.ts` public-surface list updated with `DEFAULT_GROUPS` + `defaultGroupPerms`.

### Changed
- `build.mjs` validates `model.defaultGroups` (every `perms` entry is a real permission key; keys + names unique; at least one perm each) and generates the const + helper into all three artefacts.
- Version bumped to `2.2.0` (additive public surface, fully backward compatible).

## [2.1.0] - 2026-06-04

### Added
- **Consumer role adapters (`roleAliases`)** — a foreign system's own role vocabulary can now be mapped onto canonical `EqRole` in `roles/model.json`, and the build emits a typed adapter. First consumer: **EQ Service (C6)** — `ServiceRole` type, `SERVICE_ROLE_MAP`, and `fromServiceRole(role): EqRole | null` (in `roles.ts` + `roles.js`; raw map also in `roles.json`). Mapping: `super_admin`/`admin` → `manager`, `supervisor` → `supervisor`, `technician` → `employee`, `read_only` → `apprentice`.
- **Tenant-isolation invariant, enforced at build + test:** `super_admin` maps to a **tenant-scoped `manager`, never `is_platform_admin`**. Cross-tenant power is never derived from a tenant-held role — EQ-internal platform ops stay out-of-band (service-role / audited impersonation). `build.mjs` validates every alias target is a real role; `roles.test.ts` + `roles.dist.test.ts` assert no alias yields the platform-admin override.
- **Plain-English permission labels** — every permission now carries a short, jargon-free `label` (e.g. `intake.commit` → "Confirm an import") alongside the developer-facing `description`, for admin UIs where a non-technical manager grants access. New `labelFor(perm): string` helper (`roles.ts` + `roles.js`); `label` added to `PermissionMeta` and to each module slice's `*_PERMISSIONS`. `build.mjs` requires every permission to have a non-empty label.
- 7 new tests (77 total).

### Changed
- `build.mjs` validates `model.roleAliases` (doc-only `$`-prefixed keys skipped) and generates the adapter into all three artefacts; also enforces the per-permission `label`.
- Version bumped to `2.1.0` (additive public surface, fully backward compatible).

## [2.0.0] - 2026-06-02

### Added
- **Per-module subpath exports** — `@eq-solutions/roles/<module>` for all 10 modules (`admin`, `audit`, `entity`, `intake`, `equipment`, `reports`, `cards`, `service`, `field`, `quotes`). Each subpath is a self-contained slice: only that module's `PermKey` union, `MATRIX`, and typed helpers (`<module>Can`, `permissionsFor<Module>`, `<module>CanAny`, `<module>CanAll`). `EqRole` is inlined so the slice has zero imports — consumers ship only what they use.
- `buildModuleArtefacts(model, moduleKey)` pure function exported from `build.mjs`, drift-guarded by `roles.dist.test.ts`.
- 40 new tests in `roles.dist.test.ts` — drift-guard + export-surface + cross-role parity per module (70 total across both suites).

### Changed
- `build.mjs` CLI writes 20 additional files (`roles/<module>.ts` + `roles/<module>.js` for each module).
- `package.json` — 10 new subpath exports. Main entry (`.`) is **unchanged** — fully backward compatible.
- Version bumped to `2.0.0` to mark the architectural split. Downstream consumers (eq-shell, eq-field, eq-solves-service) adopt module slices in C6/C7/C8.

## [1.4.0] - 2026-06-02

### Added
- **`roles.js`** — compiled runtime ESM entry, generated by `build.mjs` alongside `roles.ts`/`roles.json` and committed to the repo. Data is inlined (it does not import `roles.json`), so it loads without import attributes. This is now the entry runtime consumers load.
- **`roles.dist.test.ts`** — guards the build pipeline: asserts the committed `roles.ts`/`roles.js`/`roles.json` byte-match a fresh build (no stale artefacts can be merged), that `package.json` and `roles/model.json` versions agree, and that the shipped `roles.js` runtime is behaviourally identical to `roles.ts` across every role × permission. `npm test` now runs both suites (30 tests).
- **`.gitattributes`** — pins all text to LF (`text=auto eol=lf`) so `build.mjs` output is byte-identical across machines and the drift test is stable on Windows; marks the generated artefacts `linguist-generated`.

### Changed
- `main` and `exports["."]["default"]` now point at `./roles.js` (was `./roles.ts`); `"types"` stays `./roles.ts`. Added `./roles.js` to the `exports` map and `roles.js` to the `files` array.
- `build.mjs` refactored to export a pure `buildArtefacts(model)` (validates, returns the three artefact strings); the filesystem writes now live behind a run-directly guard so the generator is importable by the drift test. Output is unchanged (byte-identical).

### Fixed
- **Prod outage (eq-shell, 2026-06-02):** the package shipped a raw `.ts` entry, so any bundled Netlify function importing it crashed on load (`ERR_UNKNOWN_FILE_EXTENSION ".ts"`; importing `roles.json` hit `ERR_IMPORT_ASSERTION_TYPE_MISSING`), taking down all 18 eq-shell functions that import `_shared/permissions`. Tarball installs (`github:eq-solutions/eq-roles#vX`) don't run `build`, so no compiled JS existed. Shipping a committed `roles.js` and pointing the default export at it fixes this for every consumer (Field/Service/Cards/Quotes would have hit the same wall). Verified by bundling a trivial Netlify function with esbuild: no `roles.ts`/`roles.json` reference survives and `can()` runs.

## [1.3.0] - 2026-06-02

### Added
- `canAny(role, perms[], opts?)` — returns true if the role holds at least one of the supplied permissions. Useful for nav-guard and route-level checks where access requires any qualifying perm.
- `canAll(role, perms[], opts?)` — returns true only if the role holds every supplied permission. Both helpers respect the `isPlatformAdmin` short-circuit.
- `roles.test.ts` — 21-test suite covering `can()`, `canAny()`, `canAll()`, `permissionsFor()`, `isEqRole()`, platform admin override, and matrix integrity invariants. Runs via `npm test` (tsx, no compile step).

### Fixed
- `package.json` version was stuck at `1.1.0` despite the model and generated artefacts being at `1.2.0`. Version is now consistent across all three files.
- `prepublishOnly` now runs `npm test` after build so a broken matrix cannot be published.

## [1.2.0] - 2026-05-31

### Added
- `admin.manage_groups` permission — create and manage security groups and membership. Manager-only.

## [1.1.0] - 2026-05-31

### Added
- Full suite permission matrix across `entity` / `cards` / `service` / `field` / `quotes` modules (15 new permission keys, bringing total to 30).
- `ModuleKey` union type and `modules` array export.
- `TIERS` constant and `EqTier` type (`trial` / `standard` / `advanced` / `enterprise`).

## [1.0.0] - 2026-05-30

### Added
- Initial canonical EQ role model: the 5-tier role enum (`manager` / `supervisor` / `employee` / `apprentice` / `labour_hire`), the orthogonal `is_platform_admin` override, and the 15-key permission matrix across `admin` / `audit` / `intake` / `equipment` / `reports` (convention `<module>.<verb>`, no inheritance).
- Typed TS output (`roles.ts`: `EqRole` / `EqTier` / `PermKey` unions, `ROLES`, `PERMISSIONS`, `MATRIX`, `can()`) plus resolved `roles.json` for server/non-TS consumers — both generated from `roles/model.json` via `build.mjs`.
- Consumed by EQ Shell ([eq-shell#70](https://github.com/eq-solutions/eq-shell/pull/70)) as the canonical `EqRole` + `MATRIX` source; 5×15 permission-equivalence verified identical to the prior hand-defined matrix.

[2.2.0]: https://github.com/eq-solutions/eq-roles/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/eq-solutions/eq-roles/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/eq-solutions/eq-roles/compare/v1.4.0...v2.0.0
[1.4.0]: https://github.com/eq-solutions/eq-roles/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/eq-solutions/eq-roles/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/eq-solutions/eq-roles/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/eq-solutions/eq-roles/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/eq-solutions/eq-roles/releases/tag/v1.0.0
