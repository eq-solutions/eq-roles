// Guards the build pipeline itself, separate from the matrix-semantics tests in
// roles.test.ts:
//   1. the committed artefacts (roles.ts / roles.js / roles.json) are not stale
//      — they byte-match a fresh buildArtefacts(model);
//   2. the shipped runtime (roles.js — what bundlers actually load) behaves
//      identically to the typed roles.ts it is generated alongside.
// The prod outage on 2026-06-02 was a shipped-runtime problem the .ts-only tests
// could never have caught; these tests exercise the .js consumers receive.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildArtefacts, buildModuleArtefacts } from './build.mjs';
import {
  ROLE_KEYS as TS_ROLE_KEYS,
  PERMISSIONS as TS_PERMISSIONS,
  can as tsCan,
  permissionsFor as tsPermissionsFor,
} from './roles.ts';
import type { ModuleKey } from './roles.ts';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

const model = JSON.parse(read('roles/model.json'));
const built = buildArtefacts(model);

// the actual shipped runtime, loaded the way a consumer loads it
const rt = await import('./roles.js');

// ── drift guard: committed artefacts == fresh build ─────────────────────────

test('roles.json on disk matches a fresh build (run `npm run build`)', () => {
  assert.equal(read('roles.json'), built.json);
});

test('roles.ts on disk matches a fresh build (run `npm run build`)', () => {
  assert.equal(read('roles.ts'), built.ts);
});

test('roles.js on disk matches a fresh build (run `npm run build`)', () => {
  assert.equal(read('roles.js'), built.js);
});

test('package.json version matches model.json version', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, model.version, 'bump package.json + roles/model.json together');
});

// ── shipped roles.js behaves identically to roles.ts ────────────────────────

test('roles.js exports the full public surface', () => {
  for (const name of [
    'ROLE_KEYS', 'TIERS', 'ROLES', 'PERMISSIONS', 'PLATFORM_ADMIN_FIELD',
    'MATRIX', 'can', 'permissionsFor', 'canAny', 'canAll', 'isEqRole',
    'SERVICE_ROLE_MAP', 'fromServiceRole', 'labelFor',
  ]) {
    assert.ok(name in rt, `roles.js is missing export "${name}"`);
  }
});

test('roles.js fromServiceRole agrees with roles.ts and never yields platform-admin power', () => {
  const cases: Record<string, string> = {
    super_admin: 'manager', admin: 'manager', supervisor: 'supervisor', technician: 'employee', read_only: 'apprentice',
  };
  for (const [src, canon] of Object.entries(cases)) {
    assert.equal(rt.fromServiceRole(src), canon, `${src} should map to ${canon}`);
  }
  assert.equal(rt.fromServiceRole('nope'), null);
  // tenant isolation invariant: every alias target is a real role, none is the platform-admin override
  for (const target of Object.values(rt.SERVICE_ROLE_MAP)) {
    assert.ok(rt.ROLE_KEYS.includes(target), `${target} is not a real role`);
    assert.notEqual(target, rt.PLATFORM_ADMIN_FIELD, 'no alias may target is_platform_admin');
  }
});

test('roles.js can() agrees with roles.ts across every role × permission', () => {
  for (const role of TS_ROLE_KEYS) {
    for (const p of TS_PERMISSIONS) {
      assert.equal(rt.can(role, p.key), tsCan(role, p.key), `${role}/${p.key} diverged`);
      assert.equal(rt.can(role, p.key, { isPlatformAdmin: true }), true, `${role}/${p.key} ignored platform admin`);
    }
  }
});

test('roles.js permissionsFor() agrees with roles.ts for every role', () => {
  for (const role of TS_ROLE_KEYS) {
    assert.deepEqual(rt.permissionsFor(role), tsPermissionsFor(role));
  }
});

test('roles.js canAny / canAll behave correctly', () => {
  assert.equal(rt.canAny('employee', ['admin.invite_user', 'field.view']), true);
  assert.equal(rt.canAny('labour_hire', ['admin.invite_user', 'service.create']), false);
  assert.equal(rt.canAll('supervisor', ['audit.view', 'entity.edit', 'field.dispatch']), true);
  assert.equal(rt.canAll('supervisor', ['audit.view', 'admin.invite_user']), false);
});

test('roles.js isEqRole accepts roles and rejects non-roles', () => {
  for (const r of rt.ROLE_KEYS) assert.equal(rt.isEqRole(r), true);
  assert.equal(rt.isEqRole('admin'), false);
  assert.equal(rt.isEqRole(null), false);
  assert.equal(rt.isEqRole(42), false);
});

// ── per-module artefacts ─────────────────────────────────────────────────────

const MODEL_MODULES: ModuleKey[] = JSON.parse(read('roles/model.json')).modules;

for (const moduleKey of MODEL_MODULES) {
  const cap = moduleKey.charAt(0).toUpperCase() + moduleKey.slice(1);
  const UPPER = moduleKey.toUpperCase();

  test(`roles/${moduleKey}.ts on disk matches a fresh build`, () => {
    const fresh = buildModuleArtefacts(model, moduleKey);
    assert.equal(read(`roles/${moduleKey}.ts`), fresh.ts);
  });

  test(`roles/${moduleKey}.js on disk matches a fresh build`, () => {
    const fresh = buildModuleArtefacts(model, moduleKey);
    assert.equal(read(`roles/${moduleKey}.js`), fresh.js);
  });

  test(`roles/${moduleKey}.js runtime — ${UPPER}_PERM_KEYS + ${UPPER}_MATRIX + ${moduleKey}Can exports exist`, async () => {
    const modRt = await import(`./roles/${moduleKey}.js`);
    assert.ok(Array.isArray(modRt[`${UPPER}_PERM_KEYS`]), `${UPPER}_PERM_KEYS missing`);
    assert.ok(typeof modRt[`${UPPER}_MATRIX`] === 'object', `${UPPER}_MATRIX missing`);
    assert.ok(typeof modRt[`${moduleKey}Can`] === 'function', `${moduleKey}Can missing`);
    assert.ok(typeof modRt[`permissionsFor${cap}`] === 'function', `permissionsFor${cap} missing`);
    assert.ok(typeof modRt[`${moduleKey}CanAny`] === 'function', `${moduleKey}CanAny missing`);
    assert.ok(typeof modRt[`${moduleKey}CanAll`] === 'function', `${moduleKey}CanAll missing`);
  });

  test(`roles/${moduleKey}.js — ${moduleKey}Can() agrees with root can() for every role`, async () => {
    const modRt = await import(`./roles/${moduleKey}.js`);
    const modPermKeys: string[] = modRt[`${UPPER}_PERM_KEYS`];
    const canFn = modRt[`${moduleKey}Can`] as (role: string, perm: string, opts?: { isPlatformAdmin?: boolean }) => boolean;
    for (const role of TS_ROLE_KEYS) {
      for (const perm of modPermKeys) {
        assert.equal(canFn(role, perm), tsCan(role, perm as never), `${role}/${perm} diverged`);
        assert.equal(canFn(role, perm, { isPlatformAdmin: true }), true, `${role}/${perm} ignored platform admin`);
      }
    }
  });
}
