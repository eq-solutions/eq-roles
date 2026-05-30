# Changelog

All notable changes to `@eq-solutions/roles` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [1.0.0] - 2026-05-30

### Added
- Initial canonical EQ role model: the 5-tier role enum (`manager` / `supervisor` / `employee` / `apprentice` / `labour_hire`), the orthogonal `is_platform_admin` override, and the 15-key permission matrix across `admin` / `audit` / `intake` / `equipment` / `reports` (convention `<module>.<verb>`, no inheritance).
- Typed TS output (`roles.ts`: `EqRole` / `EqTier` / `PermKey` unions, `ROLES`, `PERMISSIONS`, `MATRIX`, `can()`) plus resolved `roles.json` for server/non-TS consumers — both generated from `roles/model.json` via `build.mjs`.
- Consumed by EQ Shell ([eq-shell#70](https://github.com/eq-solutions/eq-shell/pull/70)) as the canonical `EqRole` + `MATRIX` source; 5×15 permission-equivalence verified identical to the prior hand-defined matrix.

[1.0.0]: https://github.com/eq-solutions/eq-roles/releases/tag/v1.0.0
