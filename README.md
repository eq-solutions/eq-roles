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

The build validates the model (no dup keys, every grant names a real role, every key is `module.verb`).

## Usage (TS)

```ts
import { can, MATRIX, ROLE_KEYS, type EqRole, type PermKey } from '@eq-solutions/roles';

can('supervisor', 'intake.commit');                       // true
can('apprentice', 'intake.commit');                       // false
can('employee',  'admin.list_users', { isPlatformAdmin: true }); // true (override)
```

`PermKey` is a closed union — `can('field.nope', …)` fails to compile.

## Adoption plan
- **eq-shell** — replace the `EqRole` union in `session.ts` and the composed `MATRIX` in `permissions/**` with imports from here; `useCan()` calls `can()`.
- **Netlify functions / RLS** — read `roles.json` server-side; inject `eq_role` into the JWT `app_metadata`.
- **EQ Field** — consume `roles.json` instead of the lossy 2-tier `staff | supervisor` mapping.
- **EQ Service** — map its `tenant_members.role` onto these canonical roles.
- **Cards** — add a `roles.dart` emit (mirrors the tokens Dart path) when wired.

This is the foundation for the staged Supabase-Auth re-platform: one role registry → custom JWT claims → RLS enforcement everywhere.
