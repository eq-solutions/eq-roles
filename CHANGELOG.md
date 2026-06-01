# Changelog

All notable changes to `@eq-solutions/roles` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

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

[1.3.0]: https://github.com/eq-solutions/eq-roles/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/eq-solutions/eq-roles/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/eq-solutions/eq-roles/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/eq-solutions/eq-roles/releases/tag/v1.0.0
