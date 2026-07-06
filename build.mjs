// Generates roles.ts + roles.js + roles.json from roles/model.json.
// Also generates roles/<module>.ts + roles/<module>.js for each ModuleKey.
// Mirrors the @eq-solutions/tokens build: one JSON source of truth, multiple
// generated artefacts. Run: `npm run build`.
//
// buildArtefacts(model) and buildModuleArtefacts(model, moduleKey) are pure
// (return artefact strings, throw on invalid input) so roles.dist.test.ts can
// assert committed files are not stale. Only the CLI section touches the fs.

import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Validate the model and render the three artefacts.
 * @returns {{ json: string, ts: string, js: string, stats: { roles: number, permissions: number } }}
 */
export function buildArtefacts(model) {
  // ── validate ──────────────────────────────────────────────────────────────
  const roleKeys = model.roles.map((r) => r.key);
  const roleSet = new Set(roleKeys);
  const permKeys = model.permissions.map((p) => p.key);

  const errors = [];
  if (new Set(permKeys).size !== permKeys.length) errors.push('duplicate permission key(s)');
  if (new Set(roleKeys).size !== roleKeys.length) errors.push('duplicate role key(s)');
  for (const p of model.permissions) {
    for (const r of p.roles) if (!roleSet.has(r)) errors.push(`permission ${p.key} grants unknown role "${r}"`);
    if (!p.key.includes('.')) errors.push(`permission ${p.key} must be <module>.<verb>`);
    if (!p.label || !p.label.trim()) errors.push(`permission ${p.key} is missing a plain-English label`);
  }

  // roleAliases: foreign role vocabularies mapped onto canonical EqRole. Keys
  // prefixed with `$` (e.g. $comment) are doc-only and skipped. Every target
  // must be a real role; no alias may target is_platform_admin (tenant isolation).
  const aliases = Object.entries(model.roleAliases ?? {}).filter(([k]) => !k.startsWith('$'));
  for (const [src, def] of aliases) {
    const map = def?.map ?? {};
    const sources = Object.keys(map);
    if (sources.length === 0) errors.push(`roleAlias "${src}" has no mappings`);
    for (const t of Object.values(map)) if (!roleSet.has(t)) errors.push(`roleAlias "${src}" maps to unknown role "${t}"`);
  }

  // defaultGroups: canonical starter security-group templates — cross-cutting
  // bundles of EXTRA perm keys for seeding a fresh tenant. Every perm must be a
  // real permission key; keys + names must be unique.
  const permKeySet = new Set(permKeys);
  const groups = model.defaultGroups ?? [];
  const groupKeys = groups.map((g) => g.key);
  const groupNames = groups.map((g) => g.name);
  if (new Set(groupKeys).size !== groupKeys.length) errors.push('duplicate defaultGroup key(s)');
  if (new Set(groupNames).size !== groupNames.length) errors.push('duplicate defaultGroup name(s)');
  for (const g of groups) {
    if (!g.key || !String(g.key).trim()) errors.push('defaultGroup is missing a key');
    if (!g.name || !String(g.name).trim()) errors.push(`defaultGroup "${g.key}" is missing a name`);
    if (!Array.isArray(g.perms) || g.perms.length === 0) errors.push(`defaultGroup "${g.key}" must grant at least one permission`);
    for (const p of g.perms ?? []) if (!permKeySet.has(p)) errors.push(`defaultGroup "${g.key}" grants unknown permission "${p}"`);
  }
  if (errors.length) throw new Error('model.json invalid:\n  - ' + errors.join('\n  - '));

  // ── derive the matrix (per role -> perms that list it) ─────────────────────
  const matrix = Object.fromEntries(
    roleKeys.map((role) => [role, permKeys.filter((k) => model.permissions.find((p) => p.key === k).roles.includes(role))]),
  );

  // ── roles.json (resolved data, for server / non-TS consumers) ──────────────
  const resolved = {
    version: model.version,
    generated: true,
    roles: model.roles,
    roleKeys,
    tiers: model.tiers,
    platformAdmin: model.platformAdmin,
    modules: model.modules,
    permissions: model.permissions,
    matrix,
    roleAliases: Object.fromEntries(aliases.map(([src, def]) => [src, def.map])),
    defaultGroups: groups,
  };
  const json = JSON.stringify(resolved, null, 2) + '\n';

  // ── consumer role adapters (typed + runtime) ───────────────────────────────
  const union = (xs) => xs.map((x) => `'${x}'`).join(' | ');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const aliasHeader =
    '\n/* ── Consumer role adapters ────────────────────────────────────────────────\n' +
    ' * Map a foreign system\'s own role vocabulary onto canonical EqRole. Authored in\n' +
    ' * roles/model.json (roleAliases); every target is validated to be a real role.\n' +
    ' * INVARIANT: no alias targets is_platform_admin — cross-tenant power is never\n' +
    ' * derived from a tenant-held role, so tenants stay isolated. */\n';
  const aliasTs = aliases.length === 0 ? '' : aliasHeader + aliases.map(([src, def]) => {
    const C = cap(src), U = src.toUpperCase();
    const keys = Object.keys(def.map);
    return `\nexport type ${C}Role = ${union(keys)};\n` +
      `export const ${U}_ROLE_MAP: Readonly<Record<${C}Role, EqRole>> = ${JSON.stringify(def.map)};\n` +
      `/** ${def.description ?? `Map a ${src} role onto canonical EqRole.`} Returns null for unknown input. */\n` +
      `export function from${C}Role(role: string): EqRole | null { return (${U}_ROLE_MAP as Record<string, EqRole>)[role] ?? null; }\n`;
  }).join('');
  const aliasJs = aliases.length === 0 ? '' : aliasHeader + aliases.map(([src, def]) => {
    const C = cap(src), U = src.toUpperCase();
    return `\nexport const ${U}_ROLE_MAP = ${JSON.stringify(def.map)};\n` +
      `/** ${def.description ?? `Map a ${src} role onto canonical EqRole.`} Returns null for unknown input. */\n` +
      `export function from${C}Role(role) { return ${U}_ROLE_MAP[role] ?? null; }\n`;
  }).join('');

  // ── default security groups (cross-cutting EXTRA perm bundles, for seeding) ─
  const groupKeyUnion = groupKeys.length ? union(groupKeys) : 'never';
  const groupsHeader =
    '\n/* ── Default security groups ───────────────────────────────────────────────\n' +
    ' * Canonical starter groups for seeding a fresh tenant (which starts with zero).\n' +
    ' * A group is a named bundle of EXTRA PermKeys, ADDITIVE on top of a user\'s base\n' +
    ' * role (session.extra_perms) — NOT a role. They grant only cross-cutting perms,\n' +
    ' * never a duplicate of what a role already grants. Authored in roles/model.json\n' +
    ' * (defaultGroups); every perm is validated to be a real PermKey. */\n';
  const groupsTs = groupsHeader +
    `\nexport type DefaultGroupKey = ${groupKeyUnion};\n` +
    `export interface DefaultGroup { key: DefaultGroupKey; name: string; description: string; perms: readonly PermKey[]; }\n` +
    `export const DEFAULT_GROUPS: readonly DefaultGroup[] = ${JSON.stringify(groups)};\n` +
    `\nconst DEFAULT_GROUP_PERMS: Record<DefaultGroupKey, readonly PermKey[]> = Object.fromEntries(\n` +
    `  DEFAULT_GROUPS.map((g) => [g.key, g.perms]),\n` +
    `) as Record<DefaultGroupKey, readonly PermKey[]>;\n` +
    `/** Extra PermKeys a default group grants. Returns [] for an unknown key. */\n` +
    `export function defaultGroupPerms(key: string): readonly PermKey[] { return DEFAULT_GROUP_PERMS[key as DefaultGroupKey] ?? []; }\n`;
  const groupsJs = groupsHeader +
    `\nexport const DEFAULT_GROUPS = ${JSON.stringify(groups)};\n` +
    `\nconst DEFAULT_GROUP_PERMS = Object.fromEntries(DEFAULT_GROUPS.map((g) => [g.key, g.perms]));\n` +
    `/** Extra PermKeys a default group grants. Returns [] for an unknown key. */\n` +
    `export function defaultGroupPerms(key) { return DEFAULT_GROUP_PERMS[key] ?? []; }\n`;

  // ── roles.ts (typed, the types consumable) ─────────────────────────────────
  const ts = `/* GENERATED by build.mjs from roles/model.json — do not edit. Run \`npm run build\`. */
/* @eq-solutions/roles v${model.version} — canonical EQ 6-tier role model + permission matrix.
 * Single source of truth across every EQ surface (Shell, Field, Service, Cards, Quotes).
 * Identity (role) is separate from billing (tier) and from the is_platform_admin override. */

export type EqRole = ${union(roleKeys)};
export type EqTier = ${union(model.tiers)};
export type PermKey = ${union(permKeys)};
export type ModuleKey = ${union(model.modules)};

export interface RoleMeta { key: EqRole; label: string; rank: number; description: string; }
export interface PermissionMeta { key: PermKey; module: ModuleKey; label: string; description: string; roles: readonly EqRole[]; }

export const ROLE_KEYS = [${roleKeys.map((r) => `'${r}'`).join(', ')}] as const satisfies readonly EqRole[];
export const TIERS = [${model.tiers.map((t) => `'${t}'`).join(', ')}] as const satisfies readonly EqTier[];

export const ROLES: readonly RoleMeta[] = ${JSON.stringify(model.roles)};
export const PERMISSIONS: readonly PermissionMeta[] = ${JSON.stringify(model.permissions)};

/** Field on the user/JWT that, when true, grants every permission across every tenant. */
export const PLATFORM_ADMIN_FIELD = '${model.platformAdmin.field}' as const;

/** Per-role permission grants. No inheritance — every grant is explicit. */
export const MATRIX: Record<EqRole, readonly PermKey[]> = ${JSON.stringify(matrix, null, 2)};

const MATRIX_SETS: Record<EqRole, Set<PermKey>> = Object.fromEntries(
  (Object.keys(MATRIX) as EqRole[]).map((r) => [r, new Set(MATRIX[r])]),
) as Record<EqRole, Set<PermKey>>;

/** Does this role hold this permission? is_platform_admin short-circuits to true. */
export function can(role: EqRole, perm: PermKey, opts?: { isPlatformAdmin?: boolean }): boolean {
  if (opts?.isPlatformAdmin) return true;
  return MATRIX_SETS[role]?.has(perm) ?? false;
}

/** All permissions a role holds (platform admins hold every PermKey). */
export function permissionsFor(role: EqRole, opts?: { isPlatformAdmin?: boolean }): readonly PermKey[] {
  if (opts?.isPlatformAdmin) return PERMISSIONS.map((p) => p.key);
  return MATRIX[role] ?? [];
}

export function canAny(role: EqRole, perms: readonly PermKey[], opts?: { isPlatformAdmin?: boolean }): boolean {
  if (opts?.isPlatformAdmin) return true;
  return perms.some((p) => MATRIX_SETS[role]?.has(p));
}

export function canAll(role: EqRole, perms: readonly PermKey[], opts?: { isPlatformAdmin?: boolean }): boolean {
  if (opts?.isPlatformAdmin) return true;
  return perms.every((p) => MATRIX_SETS[role]?.has(p));
}

export function isEqRole(x: unknown): x is EqRole { return typeof x === 'string' && (ROLE_KEYS as readonly string[]).includes(x); }

const PERM_LABELS: Record<PermKey, string> = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.label])) as Record<PermKey, string>;
/** Plain-English label for a permission key — what a non-technical manager reads in an admin UI. */
export function labelFor(perm: PermKey): string { return PERM_LABELS[perm]; }

const PERM_KEY_SET: ReadonlySet<PermKey> = new Set(PERMISSIONS.map((p) => p.key));

/* ── Effective permission resolution ───────────────────────────────────────
 * Combine a user's base role with the EXTRA perms from their security-group
 * memberships into the full permission set used for an authZ decision — and for
 * baking into the JWT claim that apps (and the app-layer can()) read. GRANT-ONLY
 * today: effective = role defaults ∪ group grants; is_platform_admin short-
 * circuits to ALL. revokes is RESERVED (applied last, deny-wins) so future
 * per-user revoke semantics drop in WITHOUT an API change. Precedence:
 * platform_admin > revoke > grant > role default. Group perms are filtered to
 * real PermKeys (a stale/renamed group perm is ignored, never trusted). Returns
 * keys in canonical PERMISSIONS order — deterministic, so equal inputs mint an
 * identical claim (no token churn). */
export interface EffectivePermsInput {
  role: EqRole;
  /** Union of EXTRA PermKeys from the user's security groups (already resolved from the store). */
  groupPerms?: readonly PermKey[];
  /** is_platform_admin short-circuits to every permission. */
  isPlatformAdmin?: boolean;
  /** Reserved for future per-user revokes — applied last (deny-wins). Empty today. */
  revokes?: readonly PermKey[];
}
export function resolveEffectivePermissions(input: EffectivePermsInput): readonly PermKey[] {
  if (input.isPlatformAdmin) return PERMISSIONS.map((p) => p.key);
  const granted = new Set<PermKey>(MATRIX[input.role] ?? []);
  for (const p of input.groupPerms ?? []) if (PERM_KEY_SET.has(p)) granted.add(p);
  if (input.revokes) for (const p of input.revokes) granted.delete(p);
  return PERMISSIONS.filter((p) => granted.has(p.key)).map((p) => p.key);
}
` + groupsTs + aliasTs;

  // ── roles.js (runtime ESM, the entry consumers actually load) ──────────────
  // Tarball installs (github:eq-solutions/eq-roles#vX) do NOT run `build`, so the
  // committed .js IS the shipped runtime. It must inline its data — importing
  // roles.json would need an import attribute Netlify's bundler can't satisfy
  // (ERR_IMPORT_ASSERTION_TYPE_MISSING), and a raw .ts entry crashes the loader
  // (ERR_UNKNOWN_FILE_EXTENSION). Types live in roles.ts; logic is kept identical.
  const js = `/* GENERATED by build.mjs from roles/model.json — do not edit. Run \`npm run build\`. */
/* @eq-solutions/roles v${model.version} — runtime ESM entry (data inlined, types stripped).
 * Loaded by runtime consumers: Netlify function bundlers, plain Node ESM, RLS scripts.
 * Type declarations live in roles.ts; both are generated from roles/model.json. */

export const ROLE_KEYS = [${roleKeys.map((r) => `'${r}'`).join(', ')}];
export const TIERS = [${model.tiers.map((t) => `'${t}'`).join(', ')}];

export const ROLES = ${JSON.stringify(model.roles)};
export const PERMISSIONS = ${JSON.stringify(model.permissions)};

/** Field on the user/JWT that, when true, grants every permission across every tenant. */
export const PLATFORM_ADMIN_FIELD = '${model.platformAdmin.field}';

/** Per-role permission grants. No inheritance — every grant is explicit. */
export const MATRIX = ${JSON.stringify(matrix, null, 2)};

const MATRIX_SETS = Object.fromEntries(
  Object.keys(MATRIX).map((r) => [r, new Set(MATRIX[r])]),
);

/** Does this role hold this permission? is_platform_admin short-circuits to true. */
export function can(role, perm, opts) {
  if (opts?.isPlatformAdmin) return true;
  return MATRIX_SETS[role]?.has(perm) ?? false;
}

/** All permissions a role holds (platform admins hold every PermKey). */
export function permissionsFor(role, opts) {
  if (opts?.isPlatformAdmin) return PERMISSIONS.map((p) => p.key);
  return MATRIX[role] ?? [];
}

export function canAny(role, perms, opts) {
  if (opts?.isPlatformAdmin) return true;
  return perms.some((p) => MATRIX_SETS[role]?.has(p));
}

export function canAll(role, perms, opts) {
  if (opts?.isPlatformAdmin) return true;
  return perms.every((p) => MATRIX_SETS[role]?.has(p));
}

export function isEqRole(x) { return typeof x === 'string' && ROLE_KEYS.includes(x); }

const PERM_LABELS = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.label]));
/** Plain-English label for a permission key — what a non-technical manager reads in an admin UI. */
export function labelFor(perm) { return PERM_LABELS[perm]; }

const PERM_KEY_SET = new Set(PERMISSIONS.map((p) => p.key));

/* Effective permission resolution — grant-only today (role ∪ group grants),
 * revoke-ready (revokes applied last, deny-wins). is_platform_admin → ALL.
 * Returns keys in canonical PERMISSIONS order (deterministic). See roles.ts for full docs. */
export function resolveEffectivePermissions(input) {
  if (input.isPlatformAdmin) return PERMISSIONS.map((p) => p.key);
  const granted = new Set(MATRIX[input.role] ?? []);
  for (const p of input.groupPerms ?? []) if (PERM_KEY_SET.has(p)) granted.add(p);
  if (input.revokes) for (const p of input.revokes) granted.delete(p);
  return PERMISSIONS.filter((p) => granted.has(p.key)).map((p) => p.key);
}
` + groupsJs + aliasJs;

  return { json, ts, js, stats: { roles: roleKeys.length, permissions: permKeys.length } };
}

/**
 * Build per-module artefacts for one module key.
 * Returns { ts, js } — TypeScript declarations + runtime ESM for that module's
 * permission slice. Each module file is self-contained (EqRole inlined, no
 * cross-module imports) so consumers only ship what they import.
 */
export function buildModuleArtefacts(model, moduleKey) {
  const roleKeys = model.roles.map((r) => r.key);
  const modPerms = model.permissions.filter((p) => p.module === moduleKey);
  const modPermKeys = modPerms.map((p) => p.key);

  if (modPermKeys.length === 0) throw new Error(`No permissions found for module "${moduleKey}"`);

  const modMatrix = Object.fromEntries(
    roleKeys.map((role) => [
      role,
      modPermKeys.filter((k) => modPerms.find((p) => p.key === k).roles.includes(role)),
    ]),
  );

  const cap = moduleKey.charAt(0).toUpperCase() + moduleKey.slice(1);
  const UPPER = moduleKey.toUpperCase();
  const union = (xs) => xs.map((x) => `'${x}'`).join(' | ');

  const ts = `/* GENERATED by build.mjs from roles/model.json — do not edit. Run \`npm run build\`. */
/* @eq-solutions/roles/${moduleKey} v${model.version} — ${moduleKey}-module permission slice.
 * Import from "@eq-solutions/roles/${moduleKey}" for typed ${moduleKey}.* perms only.
 * Full 30-perm matrix lives in the root "@eq-solutions/roles" entry. */

/** EqRole — inlined so this module file has zero imports. */
export type EqRole = ${union(roleKeys)};

export type ${cap}PermKey = ${union(modPermKeys)};
export const ${UPPER}_PERM_KEYS: readonly ${cap}PermKey[] = [${modPermKeys.map((k) => `'${k}'`).join(', ')}];
export const ${UPPER}_PERMISSIONS = ${JSON.stringify(modPerms)} as const;

/** Per-role grants within the ${moduleKey} module. */
export const ${UPPER}_MATRIX: Record<EqRole, readonly ${cap}PermKey[]> = ${JSON.stringify(modMatrix, null, 2)};

const _${UPPER}_SETS: Record<EqRole, Set<${cap}PermKey>> = Object.fromEntries(
  (Object.keys(${UPPER}_MATRIX) as EqRole[]).map((r) => [r, new Set(${UPPER}_MATRIX[r])]),
) as Record<EqRole, Set<${cap}PermKey>>;

export function ${moduleKey}Can(role: EqRole, perm: ${cap}PermKey, opts?: { isPlatformAdmin?: boolean }): boolean {
  if (opts?.isPlatformAdmin) return true;
  return _${UPPER}_SETS[role]?.has(perm) ?? false;
}

export function permissionsFor${cap}(role: EqRole, opts?: { isPlatformAdmin?: boolean }): readonly ${cap}PermKey[] {
  if (opts?.isPlatformAdmin) return ${UPPER}_PERM_KEYS.slice();
  return ${UPPER}_MATRIX[role] ?? [];
}

export function ${moduleKey}CanAny(role: EqRole, perms: readonly ${cap}PermKey[], opts?: { isPlatformAdmin?: boolean }): boolean {
  if (opts?.isPlatformAdmin) return true;
  return perms.some((p) => _${UPPER}_SETS[role]?.has(p));
}

export function ${moduleKey}CanAll(role: EqRole, perms: readonly ${cap}PermKey[], opts?: { isPlatformAdmin?: boolean }): boolean {
  if (opts?.isPlatformAdmin) return true;
  return perms.every((p) => _${UPPER}_SETS[role]?.has(p));
}
`;

  const js = `/* GENERATED by build.mjs from roles/model.json — do not edit. Run \`npm run build\`. */
/* @eq-solutions/roles/${moduleKey} v${model.version} — ${moduleKey}-module permission slice (runtime ESM). */

export const ${UPPER}_PERM_KEYS = [${modPermKeys.map((k) => `'${k}'`).join(', ')}];
export const ${UPPER}_PERMISSIONS = ${JSON.stringify(modPerms)};

/** Per-role grants within the ${moduleKey} module. */
export const ${UPPER}_MATRIX = ${JSON.stringify(modMatrix, null, 2)};

const _${UPPER}_SETS = Object.fromEntries(
  Object.keys(${UPPER}_MATRIX).map((r) => [r, new Set(${UPPER}_MATRIX[r])]),
);

export function ${moduleKey}Can(role, perm, opts) {
  if (opts?.isPlatformAdmin) return true;
  return _${UPPER}_SETS[role]?.has(perm) ?? false;
}

export function permissionsFor${cap}(role, opts) {
  if (opts?.isPlatformAdmin) return ${UPPER}_PERM_KEYS.slice();
  return ${UPPER}_MATRIX[role] ?? [];
}

export function ${moduleKey}CanAny(role, perms, opts) {
  if (opts?.isPlatformAdmin) return true;
  return perms.some((p) => _${UPPER}_SETS[role]?.has(p));
}

export function ${moduleKey}CanAll(role, perms, opts) {
  if (opts?.isPlatformAdmin) return true;
  return perms.every((p) => _${UPPER}_SETS[role]?.has(p));
}
`;

  return { ts, js };
}

// ── CLI: read the model, write the artefacts (only when run directly) ────────
const invokedDirectly = process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (invokedDirectly) {
  const model = JSON.parse(readFileSync(join(here, 'roles', 'model.json'), 'utf8'));
  let artefacts;
  try {
    artefacts = buildArtefacts(model);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  writeFileSync(join(here, 'roles.json'), artefacts.json);
  writeFileSync(join(here, 'roles.ts'), artefacts.ts);
  writeFileSync(join(here, 'roles.js'), artefacts.js);

  // Per-module slices (roles/<module>.ts + roles/<module>.js)
  for (const moduleKey of model.modules) {
    const mod = buildModuleArtefacts(model, moduleKey);
    writeFileSync(join(here, 'roles', `${moduleKey}.ts`), mod.ts);
    writeFileSync(join(here, 'roles', `${moduleKey}.js`), mod.js);
  }

  console.log(
    `@eq-solutions/roles v${model.version} built: ` +
    `${artefacts.stats.roles} roles, ${artefacts.stats.permissions} permissions -> ` +
    `roles.ts + roles.js + roles.json + ${model.modules.length} module slices`,
  );
}
