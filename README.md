# @eq-solutions/roles

Canonical EQ **role model** — the single source of truth for the 6-tier role enum, the `is_platform_admin` override, and the permission matrix. The companion to [`@eq-solutions/tokens`](https://github.com/eq-solutions/eq-design-tokens): tokens own how EQ *looks*, roles own who can *do* what.

This package exists because the same model was once hand-redefined in `eq-shell/src/session.ts` + `src/permissions/**`, re-invented in EQ Service, and squashed to a coarse mapping in EQ Field. It makes the model **one definition, consumed not copied** — adding a tier or permission becomes a one-file change. Consumer status is tracked under [Adoption plan](#adoption-plan).

## The model

**Three independent axes** (don't conflate them):
- **Role** — what you can *do*. `manager · supervisor · employee · apprentice · labour_hire · subcontractor`.
- **Tier** — what the tenant *pays for*. `trial · standard · advanced · enterprise`. Separate concern.
- **`is_platform_admin`** — orthogonal override. When true, `can()` returns true for every permission across every tenant. EQ-internal staff only.

**Permissions** follow `<module>.<verb>[_<scope>]` and are granted with **no inheritance** — every grant is explicit and auditable.

## Source of truth

Edit [`roles/model.json`](roles/model.json), then `npm run build`. That regenerates:
- **`roles.ts`** — typed consumable: `EqRole` / `EqTier` / `PermKey` unions, `ROLES`, `PERMISSIONS`, `MATRIX`, and `can()`. Used for types (`"types"`).
- **`roles.js`** — compiled runtime ESM entry (same exports, data inlined, types stripped). This is what `main` / the default export resolve to, so bundlers (Netlify functions) and plain Node ESM load real JS at runtime — never the raw `.ts`. **Committed to the repo** because tarball installs (`github:eq-solutions/eq-roles#vX`) don't run `build`.
- **`roles.json`** — resolved data (incl. derived per-role matrix) for servers / non-TS consumers that read JSON directly (Field's vanilla JS, a future Dart emit for Cards).

The build validates the model (no dup keys, every grant names a real role, every key is `module.verb`). `npm test` then guards the result: matrix semantics, the shipped `roles.js` runtime matching `roles.ts`, and the committed artefacts byte-matching a fresh build (so stale generated files can't be merged). `prepublishOnly` runs both before any publish.

## Usage (TS)

```ts
import { can, labelFor, MATRIX, ROLE_KEYS, type EqRole, type PermKey } from '@eq-solutions/roles';

can('supervisor', 'intake.commit');                       // true
can('apprentice', 'intake.commit');                       // false
can('employee',  'admin.list_users', { isPlatformAdmin: true }); // true (override)

labelFor('intake.commit');                                // 'Confirm an import'  (plain-English, for admin UIs)
```

Each permission carries a short, jargon-free `label` for surfaces where a non-technical manager grants access, alongside the longer developer-facing `description`.

`PermKey` is a closed union — `can('field.nope', …)` fails to compile.

## Consumer role adapters

When an app has its *own* role vocabulary, map it onto canonical `EqRole` here (in [`roles/model.json`](roles/model.json) under `roleAliases`) rather than re-deciding the mapping per consumer. The build emits a typed adapter:

```ts
import { fromServiceRole, SERVICE_ROLE_MAP, type ServiceRole } from '@eq-solutions/roles';

fromServiceRole('technician');   // 'employee'
fromServiceRole('super_admin');  // 'manager'  (NOT platform admin — see below)
fromServiceRole('root');         // null
```

**Tenant isolation invariant:** no alias may target `is_platform_admin`. Cross-tenant power is *never* derived from a tenant-held role — so a tenant role can never escalate to god-mode over other tenants. EQ Service's `super_admin` therefore maps to a tenant-scoped `manager`; genuine EQ-internal platform operations (provisioning, support, incident response) live **out-of-band** (Supabase service-role key / time-boxed audited impersonation that mints a normal tenant-scoped token), not in any tenant role. The build and test suites enforce this.

## Default security groups

A **security group** is a named, per-tenant bundle of *extra* `PermKey`s, **additive on top of** a user's base role (surfaced as `session.extra_perms`) — it is **not** a role. Groups exist for **cross-cutting** grants that don't fit the role hierarchy: "a few people across roles who can edit equipment", say. Today a fresh tenant starts with **zero** groups; this package ships canonical starter templates so Shell can seed sensible defaults on tenant creation.

```ts
import { DEFAULT_GROUPS, defaultGroupPerms, type DefaultGroupKey } from '@eq-solutions/roles';

DEFAULT_GROUPS;                          // [{ key, name, description, perms }, …]
defaultGroupPerms('equipment_editors');  // ['equipment.view', 'equipment.edit']
defaultGroupPerms('does_not_exist');     // []  (unknown key → no perms)
```

Authored in [`roles/model.json`](roles/model.json) under `defaultGroups`; the build validates every `perms` entry is a real `PermKey` and that keys + names are unique. The shipped set:

| Key | Name | Grants | Why it's cross-cutting |
|---|---|---|---|
| `equipment_editors` | Equipment editors | `equipment.view`, `equipment.edit` | Editing the plant list is manager/supervisor-only; this hands it to a few employees/apprentices who maintain equipment. |
| `report_viewers` | Report viewers | `reports.view` | GM reports are manager-only; this lets a supervisor or lead read them without being made a manager. |

**These are templates, not duplicates of a role.** Each grants only perms that cut *across* the role hierarchy — a group that merely re-grants what a role already has would blur the role-vs-group line and is intentionally excluded.

> Picking *which* defaults ship is a product decision — keep the set small and obviously useful. The Shell consumer seeds `DEFAULT_GROUPS` (mapped by `name`, the DB's unique key) into each new tenant; the package only owns the canonical definition.

## Adoption plan
- **eq-shell** — replace the `EqRole` union in `session.ts` and the composed `MATRIX` in `permissions/**` with imports from here; `useCan()` calls `can()`.
- **Netlify functions / RLS** — read `roles.json` server-side; inject `eq_role` into the JWT `app_metadata`.
- **EQ Field** — ✅ *done (2026-07)*. Field's login now trusts the Shell-verified `eq_role` from the JWT (Phase D) and keys its access on the canonical `EqRole` enum — no more coarse `staff | supervisor` squash. The two **coarse** field gates (`field.view`, `field.dispatch`) live here and are consumed by Shell. Field's ~50 **fine-grained** in-app permissions (`roster.*`, `ts.*`, `leave.*`, `sites.*`, `reports.*`) remain **Field-owned** (a hand-maintained matrix in `scripts/permission-matrix.js`, keyed to these same roles); a Field-side startup guard warns if its role keys ever drift from `ROLE_KEYS` here. `subcontractor` is intentionally **excluded** from Field — it is a roster `employment_type`, never a Field login role.
- **EQ Service** — map its `tenant_members.role` onto these canonical roles via `fromServiceRole()` (shipped, see *Consumer role adapters*); replace the scattered `isAdmin`/`canWrite` string checks with `can()`.
- **Cards** — ✅ *emit ready (2.5.0)*. `roles.dart` is generated (Dart 2.17+ enhanced enums, zero external deps), mirrors `roles.ts`/`roles.js` exactly, and is guarded against drift by `roles.dist.test.ts`. Not yet imported by the app — Cards still hand-maintains its own `kEqRoleLabels` map. Wiring it in (and retiring that map) is a tracked follow-up, not blocking this release.

This is the foundation for the staged Supabase-Auth re-platform: one role registry → custom JWT claims → RLS enforcement everywhere.
