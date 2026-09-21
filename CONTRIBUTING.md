# Contributing to `@eq-solutions/roles`

This package is the **live** EQ permission source of truth. Treat grant changes
like migrations.

## Workflow

1. Edit **`roles/model.json`** only (authored source). Do not hand-edit generated
   `roles.ts` / `roles.js` / `roles.json` / `roles/*` / `lib/eq_roles.dart` /
   `security-groups.html`.
2. `npm run build` — regenerates artefacts and validates the model.
3. `npm run export:html` — refreshes the interactive sandbox.
4. `npm test` — matrix semantics + drift guards (including HTML embed).
5. Update **`CHANGELOG.md`** for any user-visible / semver behaviour.
6. Bump **`package.json`** + `roles/model.json` (+ lockfile root) together.

## Grant changes need a `/decide`

If you change **who can do what** (role lists, defaultGroups, resource
`perm` values, aliases), the PR must record:

- who decided
- options considered
- why this option

Do **not** remove deprecated keys without a consumer audit
(`tenant_role_overrides`, security groups, JWT claims).

## Default groups

Default group perms must be **group-grantable** under the live DB constraint
`security_group_perms_no_escalation_keys` — no `admin.*` / `audit.*` keys.
Tests enforce this.

## Resource layer

- Missing resource/action → fail-closed (`canAccessResource` false).
- Explicit `perm: null` → fail-open (always true). Document every null row
  (see `$resourcePermissions` and open issues such as #40 for `tender`).
