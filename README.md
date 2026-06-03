# @eq-solutions/roles

Canonical EQ **role model** — the single source of truth for the 5-tier role enum, the `is_platform_admin` override, and the permission matrix. The companion to [`@eq-solutions/tokens`](https://github.com/eq-solutions/eq-design-tokens): tokens own how EQ *looks*, roles own who can *do* what.

Today the same model is hand-redefined in `eq-shell/src/session.ts` + `src/permissions/**`, lossily squashed to 2 tiers in EQ Field, and re-invented in EQ Service. This package makes it **one definition, consumed not copied** — adding a tier or permission becomes a one-file change.

## The model

**Three independent axes** (don't conflate them):
- **Role** — what you can *do*. `manager · supervisor · employee · apprentice · labour_hire`.
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

## Adoption plan
- **eq-shell** — replace the `EqRole` union in `session.ts` and the composed `MATRIX` in `permissions/**` with imports from here; `useCan()` calls `can()`.
- **Netlify functions / RLS** — read `roles.json` server-side; inject `eq_role` into the JWT `app_metadata`.
- **EQ Field** — consume `roles.json` instead of the lossy 2-tier `staff | supervisor` mapping.
- **EQ Service** — map its `tenant_members.role` onto these canonical roles via `fromServiceRole()` (shipped, see *Consumer role adapters*); replace the scattered `isAdmin`/`canWrite` string checks with `can()`.
- **Cards** — add a `roles.dart` emit (mirrors the tokens Dart path) when wired.

This is the foundation for the staged Supabase-Auth re-platform: one role registry → custom JWT claims → RLS enforcement everywhere.
