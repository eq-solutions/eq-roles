#!/usr/bin/env node
// Generates security-groups.html — a self-contained, canonical-only export of
// the EQ suite's role/permission model + default security groups, read
// straight from roles.json (built from roles/model.json). Run: npm run export:html
//
// Scope: canonical model only. Live, per-tenant group membership and any
// tenant-specific (non-default) groups are managed in eq-shell's Access
// Control page and are NOT in this doc — see the note in the generated file.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const data = JSON.parse(readFileSync(path.join(root, 'roles.json'), 'utf8'));

const MODULE_LABELS = {
  admin: 'Admin (Shell)',
  audit: 'Audit',
  entity: 'Records (Entity)',
  intake: 'Intake',
  equipment: 'Equipment',
  reports: 'Reports',
  cards: 'Cards',
  service: 'Service (CMMS)',
  field: 'Field',
  quotes: 'Quotes',
  ops: 'Ops',
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const roleKeys = data.roles.map((r) => r.key);

function roleMatrixSection() {
  const rows = data.roles
    .map(
      (r) => `
      <tr>
        <td class="role-name">${esc(r.label)}</td>
        <td class="num">${r.rank}</td>
        <td>${esc(r.description)}</td>
      </tr>`
    )
    .join('');
  return `
    <section>
      <h2>1. Roles</h2>
      <p class="lede">The 6-tier role enum. No inheritance — every grant below is explicit.</p>
      <table>
        <thead><tr><th>Role</th><th>Rank</th><th>Description</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function permissionModuleTable(moduleKey) {
  const perms = data.permissions.filter((p) => p.module === moduleKey);
  if (perms.length === 0) return '';
  const rows = perms
    .map((p) => {
      const cells = roleKeys
        .map((rk) => `<td class="grant-cell">${data.matrix[rk]?.includes(p.key) ? '<span class="grant-yes">&#10003;</span>' : ''}</td>`)
        .join('');
      const deprecated = p.deprecated ? `<div class="deprecated">Deprecated — ${esc(p.deprecated)}</div>` : '';
      return `
      <tr>
        <td class="perm-name"><code>${esc(p.key)}</code><div class="perm-label">${esc(p.label)}</div>${deprecated}</td>
        ${cells}
      </tr>`;
    })
    .join('');
  const headerCells = data.roles.map((r) => `<th class="rot">${esc(r.label)}</th>`).join('');
  return `
      <h3>${esc(MODULE_LABELS[moduleKey] ?? moduleKey)}</h3>
      <table class="matrix">
        <thead><tr><th>Permission</th>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
}

function permissionMatrixSection() {
  const tables = data.modules.map(permissionModuleTable).join('');
  return `
    <section>
      <h2>2. Permission matrix</h2>
      <p class="lede">Every permission key, grouped by module, with which roles hold it by default. &#10003; = granted.</p>
      ${tables}
    </section>`;
}

function workflowDiagramSection() {
  return `
    <figure class="flow-figure">
      <figcaption class="lede">How access is resolved, end to end — a user's effective permission set is their base role's grants unioned with any security group(s) they've been added to, checked module-by-module at the point of action.</figcaption>
      <div class="flow-diagram">
        <div class="flow-step">
          <div class="flow-title">Base role</div>
          <div class="flow-sub">1 of 6 &middot; ranked, no inheritance</div>
        </div>
        <div class="flow-arrow" aria-hidden="true">+</div>
        <div class="flow-step">
          <div class="flow-title">Security group(s)</div>
          <div class="flow-sub">0 or more &middot; additive, optional</div>
        </div>
        <div class="flow-arrow" aria-hidden="true">=</div>
        <div class="flow-step flow-step--accent">
          <div class="flow-title">Effective permissions</div>
          <div class="flow-sub">role grants &cup; group grants</div>
        </div>
        <div class="flow-arrow" aria-hidden="true">&rarr;</div>
        <div class="flow-step">
          <div class="flow-title">Module gate</div>
          <div class="flow-sub">${data.modules.length} modules &middot; checked per action</div>
        </div>
      </div>
    </figure>`;
}

function allPermissionsSection() {
  const sorted = [...data.permissions].sort((a, b) => a.key.localeCompare(b.key));
  const rows = sorted
    .map((p) => {
      const modLabel = MODULE_LABELS[p.module] ?? p.module;
      const roleChips = p.roles
        .map((rk) => {
          const role = data.roles.find((r) => r.key === rk);
          return `<code class="perm-chip">${esc(role ? role.label : rk)}</code>`;
        })
        .join(' ');
      const status = p.deprecated ? 'Deprecated' : 'Active';
      const deprecatedNote = p.deprecated ? `<div class="deprecated">Deprecated — ${esc(p.deprecated)}</div>` : '';
      return `
      <tr>
        <td data-sort="${esc(p.key)}"><code>${esc(p.key)}</code><div class="perm-label">${esc(p.label)}</div>${deprecatedNote}</td>
        <td data-sort="${esc(modLabel)}">${esc(modLabel)}</td>
        <td data-sort="${p.roles.length}"><span class="role-count">${p.roles.length}</span><div class="role-chips">${roleChips}</div></td>
        <td data-sort="${esc(status)}">${status}</td>
      </tr>`;
    })
    .join('');
  return `
    <section>
      <h2>3. All permissions</h2>
      <p class="lede">Every permission key in one flat table, independent of module grouping. Click a column header to sort; click again to reverse.</p>
      <table class="sortable" id="all-perms">
        <thead>
          <tr>
            <th data-type="text">Permission</th>
            <th data-type="text">Module</th>
            <th data-type="number">Roles granted</th>
            <th data-type="text">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function securityGroupsSection() {
  const cards = data.defaultGroups
    .map((g, i) => {
      const perms = g.perms
        .map((p) => {
          const perm = data.permissions.find((x) => x.key === p);
          const modLabel = perm ? MODULE_LABELS[perm.module] ?? perm.module : '';
          return `<code class="perm-chip" title="${esc(modLabel)}">${esc(p)}</code>`;
        })
        .join(' ');
      return `
      <details class="group-card"${i === 0 ? ' open' : ''}>
        <summary>
          <span class="role-name">${esc(g.name)}</span>
          <code>${esc(g.key)}</code>
          <span class="group-count">${g.perms.length} grant${g.perms.length === 1 ? '' : 's'}</span>
        </summary>
        <div class="group-body">
          <p>${esc(g.description)}</p>
          <div class="group-perms">${perms}</div>
        </div>
      </details>`;
    })
    .join('');
  return `
    <section>
      <h2>4. Default security groups</h2>
      <p class="lede">Named bundles of <em>extra</em> permission keys, additive on top of a user's base role — not a role themselves. A fresh tenant starts with zero groups; these are the canonical starter templates eq-shell seeds on tenant creation.</p>
      <div class="group-cards">${cards}</div>
    </section>`;
}

const generatedAt = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EQ Suite — Security Groups &amp; Permission Model</title>
<style>
  :root {
    --sky: #3DA8D8; --deep: #2986B4; --ice: #EAF5FB; --ink: #1A1A2E;
    --bg: #ffffff; --fg: var(--ink); --border: #d9e6ee; --muted: #5b6b7a;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14141f; --fg: #eef3f7; --ice: #1c2b36; --border: #2a3a46; --muted: #9fb0bd; }
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg); color: var(--fg); margin: 0; padding: 2.5rem 1.5rem 4rem;
    line-height: 1.5;
  }
  .wrap { max-width: 980px; margin: 0 auto; }
  header { border-bottom: 2px solid var(--sky); padding-bottom: 1.25rem; margin-bottom: 2rem; }
  h1 { font-size: 1.7rem; margin: 0 0 0.35rem; color: var(--deep); }
  .meta { color: var(--muted); font-size: 0.9rem; }
  h2 { font-size: 1.25rem; color: var(--deep); border-top: 1px solid var(--border); padding-top: 1.75rem; margin-top: 2rem; }
  h3 { font-size: 1rem; color: var(--fg); margin: 1.5rem 0 0.5rem; }
  .lede { color: var(--muted); font-size: 0.92rem; max-width: 70ch; }
  table { border-collapse: collapse; width: 100%; margin: 0.75rem 0 1.5rem; font-size: 0.85rem; }
  th, td { border: 1px solid var(--border); padding: 0.45rem 0.6rem; text-align: left; vertical-align: top; }
  thead th { background: var(--ice); font-weight: 600; }
  .role-name { font-weight: 600; white-space: nowrap; }
  .num { text-align: center; }
  .matrix th.rot { text-align: center; white-space: nowrap; font-size: 0.78rem; }
  .grant-cell { text-align: center; }
  .grant-yes { color: var(--deep); font-weight: 700; }
  .perm-name code { font-size: 0.82rem; }
  .perm-label { color: var(--muted); font-size: 0.8rem; margin-top: 0.15rem; }
  .perm-chip { display: inline-block; background: var(--ice); border-radius: 4px; padding: 0.1rem 0.4rem; margin: 0.1rem 0.15rem 0.1rem 0; font-size: 0.78rem; }
  .deprecated { color: #b3541e; font-size: 0.76rem; margin-top: 0.2rem; }
  code { font-family: 'SFMono-Regular', Consolas, Menlo, monospace; }
  .scope-note { background: var(--ice); border: 1px solid var(--border); border-radius: 6px; padding: 0.9rem 1.1rem; font-size: 0.87rem; margin-top: 2rem; }
  .scope-note strong { color: var(--deep); }
  footer { margin-top: 2.5rem; color: var(--muted); font-size: 0.8rem; }

  /* workflow diagram */
  .flow-figure { margin: 0 0 2rem; }
  .flow-diagram { display: flex; align-items: stretch; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.9rem; }
  .flow-step { flex: 1 1 160px; border: 1.5px solid var(--sky); border-radius: 8px; padding: 0.85rem 1rem; background: var(--ice); text-align: center; }
  .flow-step--accent { border-color: var(--deep); background: var(--deep); }
  .flow-step--accent .flow-title, .flow-step--accent .flow-sub { color: #fff; }
  .flow-title { font-weight: 700; font-size: 0.92rem; color: var(--deep); }
  .flow-sub { font-size: 0.75rem; color: var(--muted); margin-top: 0.3rem; }
  .flow-arrow { display: flex; align-items: center; justify-content: center; font-size: 1.25rem; font-weight: 700; color: var(--muted); flex: 0 0 auto; padding: 0 0.15rem; }

  /* collapsible group cards */
  .group-cards { display: flex; flex-direction: column; gap: 0.7rem; margin: 0.75rem 0 1.5rem; }
  .group-card { border: 1px solid var(--border); border-radius: 8px; padding: 0 1rem; background: var(--bg); }
  .group-card summary { cursor: pointer; padding: 0.75rem 0; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; list-style: none; }
  .group-card summary::-webkit-details-marker { display: none; }
  .group-card summary::marker { content: ''; }
  .group-card summary::before { content: '\\25B8'; color: var(--deep); display: inline-block; transition: transform 0.15s; flex: 0 0 auto; }
  .group-card[open] summary::before { transform: rotate(90deg); }
  .group-card summary code { color: var(--muted); font-size: 0.82rem; }
  .group-count { margin-left: auto; font-size: 0.76rem; color: var(--muted); background: var(--ice); border-radius: 4px; padding: 0.1rem 0.5rem; }
  .group-body { padding: 0 0 1rem; }
  .group-body p { margin: 0 0 0.6rem; font-size: 0.88rem; }
  .group-perms { display: flex; flex-wrap: wrap; gap: 0.3rem; }

  /* sortable table */
  table.sortable th { cursor: pointer; user-select: none; }
  table.sortable th:hover { background: var(--sky); color: #fff; }
  table.sortable th[aria-sort]::after { margin-left: 0.35rem; font-size: 0.7rem; }
  table.sortable th[aria-sort="ascending"]::after { content: '\\25B2'; }
  table.sortable th[aria-sort="descending"]::after { content: '\\25BC'; }
  .role-count { font-weight: 700; color: var(--deep); }
  .role-chips { margin-top: 0.2rem; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>EQ Suite — Security Groups &amp; Permission Model</h1>
    <div class="meta">Canonical model &middot; @eq-solutions/roles v${esc(data.version)} &middot; generated ${generatedAt}</div>
  </header>

  ${workflowDiagramSection()}
  ${roleMatrixSection()}
  ${permissionMatrixSection()}
  ${allPermissionsSection()}
  ${securityGroupsSection()}

  <div class="scope-note">
    <strong>Scope of this document:</strong> the canonical model only — the 6 roles, the full permission matrix, and the 3 default security-group templates, as defined in <code>eq-roles</code>. It does <strong>not</strong> include live, per-tenant group membership or tenant-specific (non-default) groups — those are created and managed per tenant in eq-shell's Access Control page (<code>admin.manage_groups</code>) and are not exported here.
  </div>

  <footer>Generated by <code>scripts/export-security-groups.mjs</code> from <code>roles.json</code>. Re-run after any <code>roles/model.json</code> change to keep this current.</footer>
</div>
<script>
(function () {
  document.querySelectorAll('table.sortable').forEach(function (table) {
    var thead = table.tHead, tbody = table.tBodies[0];
    if (!thead || !tbody) return;
    Array.prototype.forEach.call(thead.querySelectorAll('th'), function (th) {
      th.addEventListener('click', function () {
        var type = th.dataset.type || 'text';
        var dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
        Array.prototype.forEach.call(thead.querySelectorAll('th'), function (h) { h.removeAttribute('aria-sort'); });
        th.setAttribute('aria-sort', dir);
        var mult = dir === 'ascending' ? 1 : -1;
        var idx = th.cellIndex;
        var rows = Array.prototype.slice.call(tbody.rows);
        rows.sort(function (ra, rb) {
          var ca = ra.cells[idx], cb = rb.cells[idx];
          var av = ca.dataset.sort != null ? ca.dataset.sort : ca.textContent.trim();
          var bv = cb.dataset.sort != null ? cb.dataset.sort : cb.textContent.trim();
          if (type === 'number') return (parseFloat(av) - parseFloat(bv)) * mult;
          return av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true }) * mult;
        });
        rows.forEach(function (r) { tbody.appendChild(r); });
      });
    });
  });
})();
</script>
</body>
</html>
`;

writeFileSync(path.join(root, 'security-groups.html'), html, 'utf8');
console.log(`Wrote security-groups.html (${data.roles.length} roles, ${data.permissions.length} perms, ${data.defaultGroups.length} default groups)`);
