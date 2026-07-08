import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  can, canAny, canAll, permissionsFor, isEqRole,
  MATRIX, PERMISSIONS, ROLE_KEYS, PLATFORM_ADMIN_FIELD,
  SERVICE_ROLE_MAP, fromServiceRole, labelFor,
  DEFAULT_GROUPS, defaultGroupPerms,
  resolveEffectivePermissions,
  type EqRole, type PermKey, type ServiceRole,
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
  assert.equal(can('supervisor', 'entity.manage_activation'), false);
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
  // v2.5.0: promoted from a live SKS tenant_role_override — "any field tech
  // can check whether a meter is in calibration" applies to apprentices too.
  assert.equal(can('apprentice', 'equipment.view'), true);
  assert.equal(can('apprentice', 'equipment.edit'), false);
  assert.equal(can('apprentice', 'quotes.view'), false);
});

test('labour_hire: field.view only', () => {
  assert.equal(can('labour_hire', 'field.view'), true);
  const others = PERMISSIONS.map(p => p.key).filter(k => k !== 'field.view');
  for (const p of others) {
    assert.equal(can('labour_hire', p), false, `labour_hire should not have ${p}`);
  }
});

// v2.5.1: ops.* promoted from Shell-local-only (src/permissions/matrix.ts
// OPS_MATRIX) so the server-side can()/requirePerm() can finally check labour
// hire rate actions instead of a hand-rolled role === 'manager' string check.
test('ops.*: manager + supervisor only, matching the pre-existing Shell matrix', () => {
  assert.equal(can('manager', 'ops.view_rates'), true);
  assert.equal(can('manager', 'ops.manage_rates'), true);
  assert.equal(can('supervisor', 'ops.view_rates'), true);
  assert.equal(can('supervisor', 'ops.manage_rates'), true);
  assert.equal(can('employee', 'ops.view_rates'), false);
  assert.equal(can('employee', 'ops.manage_rates'), false);
  assert.equal(can('apprentice', 'ops.manage_rates'), false);
  assert.equal(can('labour_hire', 'ops.manage_rates'), false);
});

// v2.5.1: entity.manage_activation — new, matches the current manager-only
// hand-rolled check in update-data-activation.ts / get-data-activation-status.ts.
test('entity.manage_activation: manager-only', () => {
  assert.equal(can('manager', 'entity.manage_activation'), true);
  assert.equal(can('supervisor', 'entity.manage_activation'), false);
  assert.equal(can('employee', 'entity.manage_activation'), false);
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

// ── plain-English labels ────────────────────────────────────────────────────

test('every permission has a non-empty plain-English label', () => {
  for (const p of PERMISSIONS) {
    assert.ok(p.label && p.label.trim().length > 0, `${p.key} has no label`);
    assert.notEqual(p.label, p.key, `${p.key} label should be human text, not the key`);
  }
});

test('labelFor returns the permission label', () => {
  assert.equal(labelFor('intake.commit'), 'Confirm an import');
  assert.equal(labelFor('admin.manage_groups'), 'Manage access groups');
  assert.equal(labelFor('quotes.approve'), 'Approve quotes');
});

// ── consumer role adapters (Service C6) ─────────────────────────────────────

test('fromServiceRole maps every Service role onto a canonical role', () => {
  const expected: Record<ServiceRole, EqRole> = {
    super_admin: 'manager', admin: 'manager', supervisor: 'supervisor', technician: 'employee', read_only: 'apprentice',
  };
  for (const [src, canon] of Object.entries(expected) as [ServiceRole, EqRole][]) {
    assert.equal(fromServiceRole(src), canon);
    assert.equal(SERVICE_ROLE_MAP[src], canon);
  }
});

test('fromServiceRole returns null for unknown input', () => {
  assert.equal(fromServiceRole('root'), null);
  assert.equal(fromServiceRole(''), null);
});

test('tenant isolation: super_admin maps to a plain manager, not platform admin', () => {
  // The mapped role grants no cross-tenant power on its own — is_platform_admin
  // is orthogonal and is never derived from a tenant-held role.
  assert.equal(fromServiceRole('super_admin'), 'manager');
  assert.equal(can('manager', 'admin.list_users'), true);          // tenant-scoped admin, yes
  assert.equal(can(fromServiceRole('super_admin')!, 'admin.list_users'), true);
});

test('every Service alias target is a real EqRole', () => {
  for (const target of Object.values(SERVICE_ROLE_MAP)) {
    assert.ok((ROLE_KEYS as readonly string[]).includes(target), `${target} is not a real role`);
  }
});

// ── default security groups ─────────────────────────────────────────────────

test('DEFAULT_GROUPS is non-empty and every entry is well-formed', () => {
  assert.ok(DEFAULT_GROUPS.length > 0, 'expected at least one default group');
  for (const g of DEFAULT_GROUPS) {
    assert.ok(g.key && g.key.trim().length > 0, 'group missing key');
    assert.ok(g.name && g.name.trim().length > 0, `group ${g.key} missing name`);
    assert.ok(g.description && g.description.trim().length > 0, `group ${g.key} missing description`);
    assert.ok(g.perms.length > 0, `group ${g.key} grants no perms`);
  }
});

test('every default group grants only real permission keys', () => {
  const declared = new Set(PERMISSIONS.map(p => p.key));
  for (const g of DEFAULT_GROUPS) {
    for (const p of g.perms) {
      assert.ok(declared.has(p), `group ${g.key} grants undeclared perm ${p}`);
    }
  }
});

test('default group keys and names are unique', () => {
  const keys = DEFAULT_GROUPS.map(g => g.key);
  const names = DEFAULT_GROUPS.map(g => g.name);
  assert.equal(new Set(keys).size, keys.length, 'duplicate group key');
  assert.equal(new Set(names).size, names.length, 'duplicate group name');
});

test('defaultGroupPerms returns a group\'s perms, and [] for unknown keys', () => {
  for (const g of DEFAULT_GROUPS) {
    assert.deepEqual(defaultGroupPerms(g.key), g.perms);
  }
  assert.deepEqual(defaultGroupPerms('does_not_exist'), []);
});

test('default groups are cross-cutting — not a no-op grant for every role', () => {
  // A useful group hands out at least one perm the lowest-rank role lacks;
  // otherwise it just echoes the role hierarchy (the gap Royce flagged against).
  for (const g of DEFAULT_GROUPS) {
    const addsSomething = g.perms.some(p => !(MATRIX['apprentice'] as readonly PermKey[]).includes(p));
    assert.ok(addsSomething, `group ${g.key} grants nothing beyond the apprentice baseline`);
  }
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

// ── resolveEffectivePermissions() — grant-only, revoke-ready ─────────────────

test('resolve: no groups → exactly the role default set', () => {
  for (const role of ROLE_KEYS) {
    assert.deepEqual(resolveEffectivePermissions({ role }), MATRIX[role]);
  }
});

test('resolve: a security group ADDS a perm above the base role', () => {
  // employee can VIEW equipment but not EDIT it; the equipment_editors group grants edit.
  assert.equal(can('employee', 'equipment.edit'), false);
  const eff = resolveEffectivePermissions({
    role: 'employee',
    groupPerms: defaultGroupPerms('equipment_editors'),
  });
  assert.ok(eff.includes('equipment.edit'), 'group grant should appear in the effective set');
  assert.ok(eff.includes('field.view'), 'base role perms are retained');
});

test('resolve: platform admin short-circuits to every permission', () => {
  const eff = resolveEffectivePermissions({ role: 'labour_hire', isPlatformAdmin: true });
  assert.equal(eff.length, PERMISSIONS.length);
});

test('resolve: a group perm already held by the role does not duplicate', () => {
  // supervisor already holds equipment.edit; granting it again must not double it.
  const eff = resolveEffectivePermissions({ role: 'supervisor', groupPerms: ['equipment.edit'] });
  assert.equal(eff.filter((p) => p === 'equipment.edit').length, 1);
});

test('resolve: stale / unknown group perm keys are ignored, never trusted', () => {
  const eff = resolveEffectivePermissions({
    role: 'apprentice',
    groupPerms: ['not.a.real.perm' as PermKey, 'reports.view'],
  });
  assert.ok(!eff.includes('not.a.real.perm' as PermKey), 'orphan key must be dropped');
  assert.ok(eff.includes('reports.view'), 'real group grant still applies');
});

test('resolve: deterministic canonical order → identical claim for equal inputs', () => {
  const a = resolveEffectivePermissions({ role: 'employee', groupPerms: ['reports.view', 'equipment.edit'] });
  const b = resolveEffectivePermissions({ role: 'employee', groupPerms: ['equipment.edit', 'reports.view'] });
  assert.deepEqual(a, b, 'input order must not change the resolved claim');
  const order = PERMISSIONS.map((p) => p.key).filter((k) => a.includes(k));
  assert.deepEqual(a, order, 'output must follow canonical PERMISSIONS order');
});

test('resolve: revoke (reserved) subtracts, and deny-wins over a grant', () => {
  // Forward-compat: the revoke path is wired but unused in production today.
  const base = resolveEffectivePermissions({ role: 'supervisor' });
  assert.ok(base.includes('field.dispatch'));
  const revoked = resolveEffectivePermissions({ role: 'supervisor', revokes: ['field.dispatch'] });
  assert.ok(!revoked.includes('field.dispatch'), 'revoke removes a role default');
  // deny-wins: same perm granted by a group AND revoked → absent.
  const conflict = resolveEffectivePermissions({
    role: 'employee', groupPerms: ['equipment.edit'], revokes: ['equipment.edit'],
  });
  assert.ok(!conflict.includes('equipment.edit'), 'revoke must beat a group grant');
});

test('resolve: platform admin beats revoke (precedence top)', () => {
  const eff = resolveEffectivePermissions({ role: 'manager', isPlatformAdmin: true, revokes: ['quotes.approve'] });
  assert.ok(eff.includes('quotes.approve'), 'platform_admin outranks revoke');
});
