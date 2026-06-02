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

import { buildArtefacts } from './build.mjs';
import {
  ROLE_KEYS as TS_ROLE_KEYS,
  PERMISSIONS as TS_PERMISSIONS,
  can as tsCan,
  permissionsFor as tsPermissionsFor,
} from './roles.ts';

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
  ]) {
    assert.ok(name in rt, `roles.js is missing export "${name}"`);
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
