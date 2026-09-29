# Changelog

All notable changes to `@eq-solutions/roles` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [2.11.0] - 2026-09-30

### Changed
- **`defaultGroups.ops_admin`** now includes `cards.export_licences`, so admin staff who aren't managers can download a compliance pack of workers' licences. Grant only; no new keys, no role changes. Existing tenants' Ops Admin groups don't pick this up automatically — the seeded rows need a separate update.

## [2.10.0] - 2026-09-29

### Added
- **`cards.export_licences`** (`cards` module; manager only by default) - download a compliance pack of workers' licences (numbers and photos). Split out of `admin.review_cards`: the group escalation guard blocks `admin.*` keys from groups, so office/compliance staff who aren't managers could never be granted licence-pack export. Managers keep it through their role, so nobody loses access.
- **`defaultGroups.compliance_viewer`** ("Compliance Viewer") - `field.view_licences` + `cards.export_licences`. Numbers, photos and exports; deliberately excludes `entity.view_pii` (personal details stay with named people). No admin.*/audit.* keys.

## [2.9.1] - 2026-09-29

### Fixed
- **`ops.view_customers` label and description** — 2.9.0 described it as only the quote customer picker. Migrations 0356/0357 (eq-shell) also let it open the EQ Ops **Clients tab** (customers with stats, sites, contacts) for people a tenant override denies `entity.view`. Wording now matches what the key actually gates; contact details still sit behind `entity.view_pii`. No grant, role, or key changes.

## [2.9.0] - 2026-09-29

### Added
- **`ops.view_customers`** (`ops` module; manager + supervisor by default, same tier as the other Ops keys) - pick a customer when writing or editing a quote in EQ Ops, without the general customer register (`entity.view`). Built for a real SKS case: an office/admin employee whose role is denied `entity.view` by a tenant override could not see any customer in EQ Ops, and a group grant of `entity.view` cannot beat that denial.
- **`defaultGroups.ops_admin`** ("Ops Admin") - `quotes.view_all`, `quotes.create`, `ops.create_job`, `ops.view_rates`, `ops.view_suppliers`, `ops.view_customers`. Proven on SKS first. Deliberately excludes `ops.view_margins` and `quotes.approve`. No admin.*/audit.* keys.

## [2.8.2] - 2026-09-21

### Fixed
- **`defaultGroups.project_managers`** — was unseedable on every tenant: its perms (`admin.list_users`, `admin.edit_user`, `admin.review_cards`, `audit.view`) are all blocked by the live DB constraint `security_group_perms_no_escalation_keys` (CHANGELOG 2.8.0 Known issue). **/decide (recorded):** follow that Known issue's own recommended pass — keep only the group-grantable equivalent that exists (`cards.manage_licences`), drop the illegal admin/audit keys. Template description updated to match. This **narrows** what the template would grant if it had ever seeded (it never could); managers still hold the dropped keys via the base role matrix.

### Documented
- **`tender:view` remains `perm: null` (ungated)** — byte-faithful transcription of eq-shell's live resource maps (v2.8.0). Closed PR #28 wanted a `tender.view` gate (mgr+sup) because browse exposes `estimated_value_cents`; that is a product decide, not silently flipped here. Tracking: **eq-roles#40**. Model `$resourcePermissions` comment cross-links the open question.
- **`permKeyForResource` is intentionally TS/JS only** until EQ Cards asks for a Dart helper (`kResourcePerms` + `canAccessResource` are already public in `lib/eq_roles.dart`).

### Tests / DX
- Default groups must not grant `/^(admin|audit)\./` (escalation denylist).
- `subcontractor` exclusive-grant assertion (mirror of `labour_hire`).
- `package.json` exports module subpaths must match `model.modules`.
- Role description copy aligned with the matrix (no “undoes changes”; labour_hire/subcontractor mention `documents.view`).
- README default-groups table corrected (`report_viewers` includes `reports.view_financial`).
- `CONTRIBUTING.md`, `LICENSE` (UNLICENSED), `CODEOWNERS`; sandbox `MODULE_LABELS` covers `documents` + `ai`; `CHANGELOG.md` + `LICENSE` included in npm `files`.

## [2.8.1] - 2026-09-16

### Fixed
- **Version collision** — #34 (`RESOURCE_PERMS` / `canAccessResource`) and #35 (`cards.manage_licences`) both landed as `2.8.0` minutes apart. Package + model stamped to **2.8.1** so combined HEAD has one unambiguous version. No matrix grant changes beyond that stamp.

### Added
- **`permKeyForResource(resource, action)`** — resource→`PermKey` lookup (or `null` for ungated / unmodeled pairs), exported alongside `canAccessResource()` on TS + JS only. Built for eq-shell's W3 migration: call sites that already layer `tenant_role_overrides` + security-group grants on top of the base matrix need the lookup, not `canAccessResource()`'s plain role-based check (which would silently drop those layers).

## [2.8.0] - 2026-09-16

### Added
- **`cards.manage_licences`** — split out of `admin.review_cards`, which bundled two unrelated things: onboarding/policy governance (approve Cards signups, set org-wide credential requirements, export licence data) and per-person licence record admin (add/replace-photo/remove a licence, mark/revoke a compliance override, resync). Only the second cluster moves to this new key; `admin.review_cards` keeps its original scope and every one of its existing call sites. Manager-only by default — no behaviour change for anyone who already has it. The difference is this key isn't `admin.`/`audit.`-prefixed, so unlike `admin.review_cards` it's actually grantable through the custom-groups mechanism to someone who isn't a Manager. Surfaced when a live grant attempt (an Office/Admin group, for a non-Manager) hit the DB's `security_group_perms_no_escalation_keys` constraint — the same constraint independently confirmed to already make the canonical `project_managers` default group (see Known issue below) fully non-functional. `/decide` pass run before building.

### Known issue (not fixed in this release)
- **`defaultGroups.project_managers`** grants `admin.list_users`, `admin.edit_user`, `admin.review_cards`, `audit.view` — every one of which is illegal under `security_group_perms_no_escalation_keys`. This template cannot currently be instantiated on any tenant. Needs its own pass (replace with group-grantable equivalents where one exists, e.g. `cards.manage_licences`, drop the rest) — left out of this release to keep it focused on the one permission Zemi Asri's case needed.

## [2.7.7] - 2026-09-01

### Changed
- **`quotes.view_all`** — removed from Supervisor's default grant, now **manager only**. Royce's call after seeing the live grant surface (2026-09-01): of SKS's 12 Supervisors, only 2 have ever created a quote (`quote.created_by`) — one already covered by keeping his own quotes visible regardless, one already a deactivated duplicate account, unrelated to this change. The other 10 have never touched Ops; narrowing removes access they don't use, not access they rely on. `/decide` pass run before building. No new grant lever needed — Access Control's existing custom-groups mechanism (live since v2.7.6, the previous release) already lets any specific Supervisor be re-granted individually if a real need shows up.

## [2.7.6] - 2026-08-31

### Added
- **`quotes.view_all`** — promoted from a Shell-local permission (declared by hand in eq-shell's
  `src/modules/quotes/permissions.ts` since migration 0267, 2026-08-23) into the canonical matrix.
  No behaviour change: still Manager+Supervisor by default, same as it's always resolved server-side
  in `eq_list_quotes`/`eq_get_quote_detail` (migrations 0267/0296). The only thing this adds is a real
  grant lever — it's now a normal `PermKey`, so eq-shell's Access Control page can grant it to one
  specific Employee (e.g. covering a manager's leave) without a role promotion, the same way every
  other perm in this matrix is grantable through the custom-groups mechanism. Previously impossible:
  the RPCs already honoured an `extra_perms` claim for this key, but nothing in the product could set
  one, since it lived outside the package's `PermKey` union that the grant UI draws from.

## [2.7.5] - 2026-08-25

Permission-grant correction, not a nav change. eq-shell's "Audit log" link has always
gated on `admin.list_users` (manager-only) — never on `audit.view` directly. Supervisor
held `audit.view` anyway, so the permission implied access the nav never granted.
Royce's call, once the mismatch surfaced: the permission was the wrong one, not the nav.

### Changed
- **`audit.view`** — removed from Supervisor's default grant, now **manager only**.
  No live surface changes: the one place that read this key for Supervisor was the
  key's own description, not any real gate. `roles.test.ts`/`roles.dist.test.ts`
  fixtures updated to match.

## [2.7.4] - 2026-08-18

### Added
- **`service.receive_calendar_digest`** — gates EQ Service's PM Calendar supervisor digest email.
  Replaces a bespoke `CALENDAR_DIGEST_GROUP_ID` env var (a raw `security_groups.id` check) that
  eq-service PR #753 already retired in favour of checking this key against eq-shell's
  `list-members` effective-permissions field (eq-shell PR #1440). Granted to **manager only** by
  default — the narrowest default that satisfies this model's manager-holds-every-permission
  invariant (`roles.test.ts`) — with everyone else added individually via the existing "Calendar
  Digest Recipients" custom group, so the rest of the recipient list stays a deliberate, curated
  choice rather than an automatic role grant.

## [2.5.8] - 2026-07-27

### Added
- **`ops.view_supplier_credentials`** — split out of `ops.view_suppliers`, same manager+supervisor
  tier. eq-shell's Suppliers directory RPC (`eq_list_suppliers`) redacted the login/password columns
  server-side with a hardcoded manager/supervisor/platform-admin check that predated this key's
  existence; that check now maps onto a real, Security-Groups-configurable permission instead of
  being fixed at the role level.

## [2.5.7] - 2026-07-26

Access-model Phase 3 — `tenant_role_overrides` drain, row 1 of 1 requiring a canonical decision.
Audited all 10 live SKS overrides on jvkn against the 2026-07-08 `ACCESS-MODEL-PLAN.md` decisions:
9 of 10 already had a locked resolution (4 Cards-smear artifacts to dissolve per D4, 1 redundant
no-op, 4 staying tenant-local by design — `intake.view` deny, `service.create`/`close`, `quotes.approve`).
`labour_hire`/`equipment.view` was the one row with no precedent — not part of D2's apprentice-only
promotion, not a Cards-smear artifact. Royce's call: promote it (viewing equipment isn't sensitive).

### Added
- **`labour_hire`** added to `equipment.view`'s role list — labour-hire workers can now see the
  Plant & Equipment list + calibration, matching apprentice's existing grant. No `equipment.edit`.

## [2.5.6] - 2026-07-26

Access-model **Phase 3** — first guardrails conversion. eq-field's `leave.js`/`timesheets.js` had
existing perm-key infrastructure (`leave.approve`, `leave.archive`, `ts.approve`, `ts.view_completion`)
and converted their remaining raw `isManager` hard-gates onto it directly (no key change needed —
those pairs already grant identically to manager + supervisor). `people.js`'s worker-record actions
(add / edit / remove / restore / hard-delete / PIN management) had no matching key: the existing
`people.add_new` / `people.edit_others` / `people.deactivate` / `people.assign_role` are manager-only,
and using them would have silently stripped supervisors of access they hold today via `isManager`.

### Added
- **`field.manage_people`** — add / edit / remove / restore / permanently delete a worker record,
  manage their PIN. Manager + supervisor, matching `field.manage_roster`'s tier — preserves today's
  `isManager`-gated behaviour rather than narrowing it (Royce's call: package-additive, no policy
  change bundled into a mechanical refactor).

## [2.5.5] - 2026-07-26

Makes this repo an actual, consumable Dart package — `roles.dart` was a loose
generated file at repo root with no `pubspec.yaml`, so `pub`'s git-dependency
resolution (the same mechanism eq-cards already uses for `eq_design_tokens`)
couldn't resolve it. Adds `pubspec.yaml` (`name: eq_roles`, pure Dart, no
external dependency) and moves the emit to `lib/eq_roles.dart` — the
conventional layout a Dart package's importable library file must live at.

No content change to the generated Dart artefact itself beyond its new path;
`buildDartArtefacts()` is untouched. Confirmed nothing consumed the old
root-level `roles.dart` path, so this is a safe relocation, not a breaking
change for any existing consumer.

### Changed
- `roles.dart` → `lib/eq_roles.dart` (Dart package layout).
- Added `pubspec.yaml`.

## [2.5.4] - 2026-07-26

Access-Model Foundation Plan, Phase 3 ("Guardrails") — promotes 2 keys eq-shell's own client
matrix (`src/permissions/matrix.ts`'s `OPS_MATRIX`) already declared for its Suppliers directory
UI, but which never existed in this package. `suppliers-mutate.ts`'s server-side write gate has
been reusing `ops.manage_rates` as a documented interim measure ("needs a release in that separate
repo first") since the Suppliers directory shipped — this closes that gap. Also fixes eq-shell's
`check-perm-sync.mjs` drift-guard, which had a blind spot that let this exact class of gap go
undetected (merged the full package matrix into its client-side comparison set, making it
structurally unable to catch a local module declaring a key the package didn't have).

**`service.create`/`service.close`/`quotes.approve` deliberately NOT split this round** — SKS has a
live, enabled tenant override granting `service.create`/`service.close` to `employee` and
`quotes.approve` to `supervisor` (verified live on jvkn 2026-07-26). Renaming these keys would
silently break those 3 real grants mid-onboarding. Splitting by app is only actionable once/if a
canonical broadening is actually proposed for one of them — until then they stay tenant-local, per
the standing decision in v2.5.0's "Explicitly NOT changed" note.

### Added
- **`ops.view_suppliers`** — view the trade suppliers/wholesalers/hire companies directory. Manager + supervisor, matching `ops.view_rates`' tier.
- **`ops.manage_suppliers`** — add/edit/delete suppliers directory entries. Manager + supervisor, matching `ops.manage_rates`' tier.

## [2.5.3] - 2026-07-17

Access-model **cluster 3** — write-split trim (see `eq-context/access-model-cluster1-build-plan-2026-07-16.md`
for the sibling cluster-1 plan; cluster 3 follows the same key-granularity approach for writes).
Trimmed from an original 11 candidates to 6 that map to a distinct owner or an irreversible verb —
the rest fold back into their existing coarse tier (`field.dispatch`, `service.create`/`close`, `quotes.create`).

Package-additive — no behaviour change here. All 6 grant to **manager + supervisor**, matching the
tier of the existing action they split from or sit alongside.

### Added
- **`service.reopen`** — reopen a closed work order. Kept with a named few so the audit log reads clean.
- **`service.record_tests`** — log calibration / test results. Matches `equipment.edit`'s tier.
- **`field.manage_roster`** — build & edit the crew roster, distinct from day-to-day `field.dispatch`.
- **`field.manage_licences`** — add / verify worker licences & compliance, matching `field.view_licences`'s tier.
- **`field.manage_labour_hire`** — manage labour-hire companies & charge rates, matching `ops.manage_rates`'s tier.
- **`ops.create_job`** — convert an approved quote into a numbered job. Matches `quotes.create`'s tier.

### Not added (folded back — see the steelman in the cluster build plan)
`field.log_hours`, `field.manage_shutdowns`, `service.edit`, `service.manage_assets`, `quotes.edit` —
no distinct owner beyond the existing coarse tier that already covers them.

## [2.5.2] - 2026-07-16

Access-model cluster 1 — sensitive-read split (see `eq-context/access-model-cluster1-build-plan-2026-07-16.md`).
Splits 7 sensitive reads out of the coarse `*.view` keys so opening an app no longer implies
visibility of the pay / margins / PII / commercials inside it. **Package-additive — no behaviour
change here**; the split only bites when consumers gate on the new keys (eq-shell Phase 2,
eq-field / eq-service Phase 3, tenant RLS Phase 4).

Default grant is **manager + supervisor, hard cutover** — roles that today see these via the
coarse key lose them on rollout until re-granted. `reports.view_financial` is **manager only**
(supervisor has no Reports base grant, so a financial sub-read would dangle).

### Added
- **`entity.view_pii`** (mgr, sup) — a record's personal / contact details (phone, DOB, emergency contact), split out of `entity.view`.
- **`field.view_hours`** (mgr, sup) — worker timesheets / hours (pay-adjacent), split out of `field.view`.
- **`field.view_licences`** (mgr, sup) — worker licences & compliance status, split out of `field.view`.
- **`field.view_rates`** (mgr, sup) — labour-hire / charge rates (commercial), split out of `field.view`.
- **`service.view_commercials`** (mgr, sup) — job pricing / contract value, split out of `service.view`.
- **`ops.view_margins`** (mgr, sup) — cost & margin on a quote / job, split out of `quotes.view`.
- **`reports.view_financial`** (mgr) — GM / financial reports.

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
