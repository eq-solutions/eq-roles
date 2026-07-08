// Proves the access-model plan's core extensibility claim: adding a tenant
// role tier (e.g. an "executive" sitting above manager) is a ONE-FILE change
// to roles/model.json — no edit to build.mjs, and every generated artefact
// (types, matrix, can(), the Dart emit) picks it up automatically.
//
// This test does NOT touch the real committed model.json — it exercises
// buildArtefacts()/buildDartArtefacts() (pure functions) against a synthetic
// copy with one extra role spliced in, so "no build.mjs change needed" is
// verified without actually widening the shipped role enum.
//
// See eq-context/eq/identity/ACCESS-MODEL-PLAN.md D1: manager stays the top
// tenant role for now; this test is the proof that adding Owner/Executive
// later is cheap, not a design commitment to add it today.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildArtefacts, buildDartArtefacts } from './build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(readFileSync(join(here, 'roles/model.json'), 'utf8'));

// Splice a synthetic "executive" role above manager (rank 0), inheriting
// manager's full grant set on every existing permission — the minimal,
// realistic shape of "add a tier above the current top".
const scaffolded = {
  ...model,
  roles: [
    { key: 'executive', label: 'Executive', rank: 0, description: 'Scaffold-only test role — proves one-file extensibility.' },
    ...model.roles,
  ],
  permissions: model.permissions.map((p) => ({
    ...p,
    roles: p.roles.includes('manager') ? [...p.roles, 'executive'] : p.roles,
  })),
};

test('scaffolding a new top-tier role requires zero build.mjs changes', () => {
  // buildArtefacts must not throw — the model validator accepts the new role
  // key with no code change, and no permission references an unknown role.
  assert.doesNotThrow(() => buildArtefacts(scaffolded));
});

test('the new role flows through to every generated surface', () => {
  const built = buildArtefacts(scaffolded);

  assert.ok(built.ts.includes(`'executive'`), 'EqRole union is missing the new role');
  assert.ok(built.js.includes(`'executive'`), 'runtime ROLE_KEYS is missing the new role');

  // MATRIX: executive inherits everything manager holds (by construction above).
  const managerBuilt = buildArtefacts(model);
  const managerPermCount = (managerBuilt.ts.match(/"manager":\s*\[([^\]]*)\]/)?.[1].match(/"/g)?.length ?? 0) / 2;
  assert.ok(built.ts.includes('"executive": ['), 'MATRIX is missing an executive entry');
  const executivePermCount = (built.ts.match(/"executive":\s*\[([^\]]*)\]/)?.[1].match(/"/g)?.length ?? 0) / 2;
  assert.equal(executivePermCount, managerPermCount, 'executive should inherit every manager grant');
});

test('the Dart emit picks up the new role with no generator change', () => {
  const dart = buildDartArtefacts(scaffolded);
  assert.ok(dart.includes("executive('executive'"), 'roles.dart enum is missing the new role');
  assert.ok(dart.includes('EqRole.executive:'), 'roles.dart kMatrix is missing an executive entry');
  // Dart source must stay syntactically sound in shape — every enum entry
  // still ends the constructor list with a semicolon before the body.
  assert.match(dart, /enum EqRole \{[\s\S]*executive\('executive'[\s\S]*;\n\n  const EqRole/);
});

test('scaffolding does not touch the real committed model or artefacts', () => {
  // Sanity check that this test operates on a copy, never the disk file.
  assert.equal(model.roles.some((r: { key: string }) => r.key === 'executive'), false);
});
