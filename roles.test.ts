import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  can, canAny, canAll, permissionsFor, isEqRole,
  MATRIX, PERMISSIONS, ROLE_KEYS, PLATFORM_ADMIN_FIELD,
  type EqRole, type PermKey,
} from './roles.ts';

// ── can() ──────────────────────────────────────────────────────────────────

test('manager holds every permission', () => {
  for (const p of PERMISSIONS) {
    assert.equal(can('manager', p.key), true, `manager missing ${p.key}`);
  }
});

test('supervisor: granted perms return true', () => {
  assert.equal(can('supervisor', 'audit.view'), true);
  assert.equal(can('supervisor', 'intake.commit'), true);
  assert.equal(can('supervisor', 'field.dispatch'), true);
});

test('supervisor: withheld admin perms return false', () => {
  assert.equal(can('supervisor', 'admin.invite_user'), false);
  assert.equal(can('supervisor', 'admin.manage_groups'), false);
  assert.equal(can('supervisor', 'audit.rollback'), false);
  assert.equal(can('supervisor', 'reports.view'), false);
  assert.equal(can('supervisor', 'quotes.approve'), false);
});

test('employee: read-only field and view perms', () => {
  assert.equal(can('employee', 'field.view'), true);
  assert.equal(can('employee', 'quotes.view'), true);
  assert.equal(can('employee', 'field.dispatch'), false);
  assert.equal(can('employee', 'intake.commit'), false);
  assert.equal(can('employee', 'service.create'), false);
});

test('apprentice: read-mostly, no import or write', () => {
  assert.equal(can('apprentice', 'entity.view'), true);
  assert.equal(can('apprentice', 'intake.view'), true);
  assert.equal(can('apprentice', 'intake.import'), false);
  assert.equal(can('apprentice', 'equipment.view'), false);
  assert.equal(can('apprentice', 'quotes.view'), false);
});

test('labour_hire: field.view only', () => {
  assert.equal(can('labour_hire', 'field.view'), true);
  const others = PERMISSIONS.map(p => p.key).filter(k => k !== 'field.view');
  for (const p of others) {
    assert.equal(can('labour_hire', p), false, `labour_hire should not have ${p}`);
  }
});

// ── platform admin override ────────────────────────────────────────────────

test('isPlatformAdmin grants every perm regardless of role', () => {
  const opts = { isPlatformAdmin: true };
  for (const role of ROLE_KEYS) {
    for (const p of PERMISSIONS) {
      assert.equal(can(role, p.key, opts), true, `platform admin ${role} blocked on ${p.key}`);
    }
  }
});

test('PLATFORM_ADMIN_FIELD is the expected JWT field name', () => {
  assert.equal(PLATFORM_ADMIN_FIELD, 'is_platform_admin');
});

// ── canAny() / canAll() ────────────────────────────────────────────────────

test('canAny: true when role holds at least one perm', () => {
  assert.equal(canAny('employee', ['admin.invite_user', 'field.view']), true);
});

test('canAny: false when role holds none', () => {
  assert.equal(canAny('labour_hire', ['admin.invite_user', 'service.create']), false);
});

test('canAny: empty perms array returns false', () => {
  assert.equal(canAny('manager', []), false);
});

test('canAll: true when role holds all perms', () => {
  assert.equal(canAll('supervisor', ['audit.view', 'entity.edit', 'field.dispatch']), true);
});

test('canAll: false when role is missing any one', () => {
  assert.equal(canAll('supervisor', ['audit.view', 'admin.invite_user']), false);
});

test('canAny/canAll: isPlatformAdmin short-circuits to true', () => {
  const opts = { isPlatformAdmin: true };
  assert.equal(canAny('labour_hire', ['admin.invite_user'], opts), true);
  assert.equal(canAll('labour_hire', ['admin.invite_user', 'audit.rollback'], opts), true);
});

// ── permissionsFor() ──────────────────────────────────────────────────────

test('permissionsFor: returns same set as MATRIX', () => {
  for (const role of ROLE_KEYS) {
    assert.deepEqual(permissionsFor(role), MATRIX[role]);
  }
});

test('permissionsFor: platform admin gets every perm key', () => {
  const all = permissionsFor('labour_hire', { isPlatformAdmin: true });
  assert.equal(all.length, PERMISSIONS.length);
});

// ── isEqRole() ─────────────────────────────────────────────────────────────

test('isEqRole: accepts all valid role keys', () => {
  for (const r of ROLE_KEYS) assert.equal(isEqRole(r), true);
});

test('isEqRole: rejects non-roles', () => {
  assert.equal(isEqRole('admin'), false);
  assert.equal(isEqRole(''), false);
  assert.equal(isEqRole(null), false);
  assert.equal(isEqRole(undefined), false);
  assert.equal(isEqRole(42), false);
});

// ── matrix integrity ──────────────────────────────────────────────────────

test('MATRIX grants are a subset of declared PERMISSIONS', () => {
  const declared = new Set(PERMISSIONS.map(p => p.key));
  for (const role of ROLE_KEYS) {
    for (const perm of MATRIX[role]) {
      assert.ok(declared.has(perm), `${role} matrix references undeclared perm ${perm}`);
    }
  }
});

test('permission roles list is consistent with MATRIX', () => {
  for (const p of PERMISSIONS) {
    for (const role of p.roles) {
      assert.ok(
        (MATRIX[role] as readonly PermKey[]).includes(p.key),
        `${p.key} lists ${role} in roles[] but MATRIX[${role}] omits it`,
      );
    }
  }
});

test('higher-rank roles are strict subsets of the role above them', () => {
  const supervisor = new Set(MATRIX['supervisor']);
  const employee = new Set(MATRIX['employee']);
  const apprentice = new Set(MATRIX['apprentice']);
  for (const p of employee) assert.ok(supervisor.has(p), `employee has ${p} but supervisor doesn't`);
  for (const p of apprentice) assert.ok(employee.has(p), `apprentice has ${p} but employee doesn't`);
});
