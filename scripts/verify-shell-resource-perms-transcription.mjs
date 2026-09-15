#!/usr/bin/env node
// scripts/verify-shell-resource-perms-transcription.mjs
//
// One-time bridge-verification tool for the W2 workstream of the
// eq-roles-permission-model-prompt (see G:\My Drive\eq-roles-permission-model-prompt.md).
// RESOURCE_PERMS (roles/model.json's resourcePermissions, generated into
// roles.ts/js/dart's canAccessResource()) was populated as a byte-faithful
// transcription of 7 independently-hardcoded entity-permission Sets living in
// eq-shell, as they existed live on 2026-09-16. This script re-derives the
// SAME resource->action->perm facts mechanically, straight from eq-shell's own
// source text, and diffs them against the published RESOURCE_PERMS — so the
// transcription isn't trusted on a human's word alone.
//
// NOT a permanent CI fixture. Once eq-shell's W3 migrates its 7 files from
// these hardcoded Sets onto canAccessResource() calls, the Sets this script
// greps for will be gone by design — at that point this script (and its
// premise) is obsolete and should be deleted, not kept green artificially.
// Safe to re-run any time before W3 starts, as a guard against eq-shell
// changing underneath an unpublished/unmigrated W2.
//
// Heuristic, not a real parser — same tradeoff eq-shell's own
// permission-enforcement-drift.test.ts documents for itself: this extracts
// known Set literals and nearby permission-string literals via regex against
// each file's CURRENT known shape. A restructuring of any of the 7 files
// (not just a content change) could make an extraction silently miss rather
// than mismatch — re-read the file by hand if this script starts reporting
// zero rows extracted for a file that should have some.
//
// Usage:
//   node scripts/verify-shell-resource-perms-transcription.mjs [path-to-eq-shell]
// Defaults to the sibling checkout this whole workspace uses: ../../eq-shell
// (i.e. C:\Projects\eq-shell, relative to this repo's root).
//
// Exit codes: 0 = every extracted fact matches RESOURCE_PERMS, 1 = mismatch or
// extraction error.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { RESOURCE_PERMS } from '../roles.js';

const here = dirname(fileURLToPath(import.meta.url));
const shellRoot = resolve(here, '..', process.argv[2] ?? join('..', '..', 'eq-shell'));

function readShellFile(relPath) {
  const full = join(shellRoot, relPath);
  try {
    return readFileSync(full, 'utf8');
  } catch (e) {
    throw new Error(`Could not read ${full} — is eq-shell checked out at ${shellRoot}? Pass its path as argv[2] if not. (${e.message})`);
  }
}

// Pull a `const NAME = new Set<string>([ 'a', 'b', ... ]);`-shaped (or
// `new Set([...])`, no generic) literal's string contents, by name.
function extractSet(src, varName) {
  const re = new RegExp(`const ${varName}\\s*=\\s*new Set(?:<[^>]*>)?\\(\\[([\\s\\S]*?)\\]\\)`, 'm');
  const m = src.match(re);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

const RESOURCE_PERM_MAP = new Map(RESOURCE_PERMS.map((rp) => [`${rp.resource}:${rp.action}`, rp.perm]));

const results = []; // { file, resource, action, expectedPerm, actualPerm, ok }
function check(file, resource, action, actualPerm) {
  const key = `${resource}:${action}`;
  const expected = RESOURCE_PERM_MAP.has(key) ? RESOURCE_PERM_MAP.get(key) : '<no RESOURCE_PERMS row>';
  const ok = RESOURCE_PERM_MAP.has(key) && expected === actualPerm;
  results.push({ file, resource, action, expectedPerm: expected, actualPerm, ok });
}

// ── entity-rows.ts (view, keyed by entity) ──────────────────────────────────
{
  const src = readShellFile('netlify/functions/entity-rows.ts');
  const fieldEntities = extractSet(src, 'FIELD_ENTITIES') ?? [];
  const hoursEntities = extractSet(src, 'HOURS_GATED_ENTITIES') ?? [];
  const licenceEntities = extractSet(src, 'LICENCE_GATED_ENTITIES') ?? [];
  const crmEntities = extractSet(src, 'CRM_ENTITIES') ?? [];
  const allowedEntities = extractSet(src, 'ALLOWED_ENTITIES') ?? [];
  for (const e of fieldEntities) check('entity-rows.ts', e, 'view', 'field.view');
  for (const e of hoursEntities) check('entity-rows.ts', e, 'view', 'field.view_hours');
  for (const e of licenceEntities) check('entity-rows.ts', e, 'view', 'field.view_licences');
  for (const e of crmEntities) check('entity-rows.ts', e, 'view', 'entity.view');
  const gated = new Set([...fieldEntities, ...hoursEntities, ...licenceEntities, ...crmEntities]);
  for (const e of allowedEntities) if (!gated.has(e)) check('entity-rows.ts', e, 'view', null); // ungated, e.g. tender
}

// ── crm-write.ts (create/edit/delete, keyed by action -> entity + perm) ─────
{
  const src = readShellFile('netlify/functions/crm-write.ts');
  const m = src.match(/const PERM_BY_ACTION:[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!m) throw new Error('crm-write.ts: could not find PERM_BY_ACTION');
  const entries = [...m[1].matchAll(/(\w+):\s*'([\w.]+)'/g)].map(([, action, perm]) => [action, perm]);
  // action-name -> [resource, tier] — the tier this action belongs to (matches
  // this file's own header comment: add_/update_/archive_* etc.)
  const ACTION_RESOURCE = {
    add_customer: ['customer', 'create'], update_customer: ['customer', 'edit'], archive_customer: ['customer', 'edit'],
    merge_customers: ['customer', 'delete'],
    add_site: ['site', 'create'], update_site: ['site', 'edit'], archive_site: ['site', 'edit'],
    unarchive_site: ['site', 'edit'], delete_site: ['site', 'delete'],
    add_contact: ['contact', 'create'], update_contact: ['contact', 'edit'], archive_contact: ['contact', 'edit'],
    merge_contact: ['contact', 'delete'], delete_contact: ['contact', 'delete'],
    link_contact_customer: ['contact', 'edit'], unlink_contact_customer: ['contact', 'edit'],
    link_contact_site: ['contact', 'edit'], unlink_contact_site: ['contact', 'edit'],
    link_site_customer: ['site', 'edit'], unlink_site_customer: ['site', 'edit'],
    add_site_project: ['site_project', 'create'], delete_site_project: ['site_project', 'delete'],
  };
  for (const [action, perm] of entries) {
    const mapped = ACTION_RESOURCE[action];
    if (!mapped) continue; // an action this script doesn't know how to classify yet
    check('crm-write.ts', mapped[0], mapped[1], perm);
  }
}

// ── entity-patch.ts (edit, FIELD_EDIT_ENTITIES -> field.dispatch, else entity.edit) ─
{
  const src = readShellFile('netlify/functions/entity-patch.ts');
  const fieldEdit = extractSet(src, 'FIELD_EDIT_ENTITIES') ?? [];
  for (const e of fieldEdit) check('entity-patch.ts', e, 'edit', 'field.dispatch');
  // Patchable-but-not-field entities (customer/contact/site/asset) all resolve
  // to entity.edit per this file's own requiredPerm ternary — verified by the
  // absence of any other branch, not a Set this script can enumerate directly.
  for (const e of ['customer', 'contact', 'site', 'asset']) check('entity-patch.ts', e, 'edit', 'entity.edit');
}

// ── entity-insert.ts (create, entity.create for whatever entity-registry allows) ──
{
  const src = readShellFile('netlify/functions/entity-insert.ts');
  if (!/requirePerm\(session,\s*'entity\.create'/.test(src)) {
    throw new Error("entity-insert.ts: expected a requirePerm(session, 'entity.create', ...) call — not found");
  }
  const registrySrc = readShellFile('netlify/functions/_shared/entity-registry.ts');
  const insertable = [...registrySrc.matchAll(/(\w+):\s*\{[^}]*?insertFields:/gs)].map((m) => m[1]);
  for (const e of insertable) check('entity-insert.ts', e, 'create', 'entity.create');
}

// ── entity-actions.ts (edit for archive/unarchive, delete for delete) ───────
{
  const src = readShellFile('netlify/functions/entity-actions.ts');
  const actionable = extractSet(src, 'ACTIONABLE_ENTITIES') ?? [];
  for (const e of actionable) {
    check('entity-actions.ts', e, 'edit', 'entity.edit');
    check('entity-actions.ts', e, 'delete', 'entity.delete');
  }
}

// ── tenant-dashboard.ts (view/count gating) ─────────────────────────────────
{
  const src = readShellFile('netlify/functions/tenant-dashboard.ts');
  const entityGated = extractSet(src, 'ENTITY_VIEW_GATED_COUNTS') ?? [];
  for (const e of entityGated) check('tenant-dashboard.ts', e, 'view', 'entity.view');
  if (/c\.entity === 'staff'\)\s*return canField/.test(src)) check('tenant-dashboard.ts', 'staff', 'view', 'field.view');
}

// ── equipment-list.ts (view, single hardcoded requirePerm call) ────────────
{
  const src = readShellFile('netlify/functions/equipment-list.ts');
  if (!/requirePerm\(session,\s*'equipment\.view'/.test(src)) {
    throw new Error("equipment-list.ts: expected a requirePerm(session, 'equipment.view', ...) call — not found");
  }
  check('equipment-list.ts', 'equipment', 'view', 'equipment.view');
}

// ── EntityBrowserPage.tsx (frontend mirror) ─────────────────────────────────
{
  const src = readShellFile('src/pages/EntityBrowserPage.tsx');
  const crmView = extractSet(src, 'CRM_VIEW_ENTITIES') ?? [];
  const hoursView = extractSet(src, 'HOURS_VIEW_ENTITIES') ?? [];
  const fieldView = extractSet(src, 'FIELD_VIEW_ENTITIES') ?? [];
  const create = extractSet(src, 'CREATE_ENTITIES') ?? [];
  const manageable = extractSet(src, 'MANAGEABLE_ENTITIES') ?? [];
  const fieldEdit = extractSet(src, 'FIELD_EDIT_ENTITIES') ?? [];
  for (const e of crmView) check('EntityBrowserPage.tsx', e, 'view', 'entity.view');
  for (const e of hoursView) check('EntityBrowserPage.tsx', e, 'view', 'field.view_hours');
  for (const e of fieldView) check('EntityBrowserPage.tsx', e, 'view', 'field.view');
  for (const e of create) check('EntityBrowserPage.tsx', e, 'create', 'entity.create');
  for (const e of manageable) {
    check('EntityBrowserPage.tsx', e, 'edit', 'entity.edit');
    check('EntityBrowserPage.tsx', e, 'delete', 'entity.delete');
  }
  for (const e of fieldEdit) check('EntityBrowserPage.tsx', e, 'edit', 'field.dispatch');
}

// ── report ───────────────────────────────────────────────────────────────
const failures = results.filter((r) => !r.ok);
console.log(`[verify-shell-resource-perms-transcription] checked eq-shell at ${shellRoot}`);
console.log(`${results.length} facts extracted from 8 files, ${failures.length} mismatch(es).\n`);

if (failures.length) {
  console.log('MISMATCHES:');
  for (const f of failures) {
    console.log(`  ✗ [${f.file}] ${f.resource}:${f.action} — RESOURCE_PERMS has ${JSON.stringify(f.expectedPerm)}, eq-shell has ${JSON.stringify(f.actualPerm)}`);
  }
  console.log('\nEither RESOURCE_PERMS needs updating (eq-shell changed since this was authored) or this extraction script itself needs updating (a file was restructured, not just re-valued).');
  process.exitCode = 1;
} else {
  console.log('✓ every extracted fact from eq-shell matches the published RESOURCE_PERMS exactly.');
  process.exitCode = 0;
}
