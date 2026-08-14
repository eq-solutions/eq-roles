#!/usr/bin/env node
// Generates security-groups.html — a self-contained, interactive sandbox over
// the EQ suite's canonical role/permission model + default security groups,
// read straight from roles.json (built from roles/model.json).
// Run: npm run export:html
//
// The page embeds the canonical model as JSON and lets you toggle role
// grants, add/remove permission keys per module, and add/edit/remove default
// security groups entirely client-side (localStorage only). It never writes
// back to roles.json — use "Export changes" in the page to download a JSON
// diff, then apply it by hand through the normal versioned change process
// (see CHANGELOG.md / README.md).
//
// Scope: canonical model only. Live, per-tenant group membership and any
// tenant-specific (non-default) groups are managed in eq-shell's Access
// Control page and are NOT in this doc — see the scope note in the
// generated file.

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

const ACCESS_CONTROL_URL = 'https://core.eq.solutions/sks/admin/access-control';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
      <p class="lede">The 6-tier role enum. No inheritance — every grant below is explicit. Roles themselves aren't editable in this sandbox; only permission grants and security groups are.</p>
      <table>
        <thead><tr><th>Role</th><th>Rank</th><th>Description</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
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

function sandboxNoteSection() {
  return `
    <div class="sandbox-note">
      <strong>This page is an interactive sandbox.</strong> Tick a box to grant or revoke a permission, use <em>+ Add permission</em> to try a new key in any area, or edit/add security groups below. Everything stays in this browser (saved to local storage on this device only) until you export it — nothing here is sent anywhere or written back to <code>roles.json</code>. Use <em>Export changes</em> to download a JSON diff you can review and apply by hand through the repo's normal versioned change process.
    </div>`;
}

function matrixShellSection() {
  return `
    <section>
      <h2>2. Permission matrix</h2>
      <p class="lede">Every permission key, grouped by area, with which roles hold it. &#10003; = granted. Toggle a box to change a grant, or use the row's &times; to remove that permission entirely.</p>
      <div class="controls-row">
        <input type="search" id="perm-search" class="search-input" placeholder="Filter permissions by key or label&hellip;" aria-label="Filter permissions">
      </div>
      <div id="matrix-root"></div>
    </section>`;
}

function allPermsShellSection() {
  return `
    <section>
      <h2>3. All permissions</h2>
      <p class="lede">Every permission key in one flat table, independent of area grouping, reflecting your current sandbox state. Click a column header to sort; click again to reverse.</p>
      <div id="allperms-root"></div>
    </section>`;
}

function groupsShellSection() {
  return `
    <section>
      <h2>4. Default security groups</h2>
      <p class="lede">Named bundles of <em>extra</em> permission keys, additive on top of a user's base role — not a role themselves. A fresh tenant starts with zero groups; these are the canonical starter templates eq-shell seeds on tenant creation. Edit a card's name, description, or grants, remove one, or add a new bundle below.</p>
      <div id="groups-root"></div>
    </section>`;
}

const generatedAt = new Date().toISOString().slice(0, 10);

// Canonical data embedded for the client app. `<` is escaped so a literal
// "</script>" (or any tag) inside a string value can't break out of the
// embedding <script type="application/json"> block.
const canonicalJson = JSON.stringify(data).replace(/</g, '\\u003c');

// The client app is built with plain string concatenation (no template
// literals, no backticks) so it can sit inside this file's own outer
// template literal without any escaping gymnastics.
const appScript = [
  "(function () {",
  "  'use strict';",
  "  var canonical = JSON.parse(document.getElementById('eq-canonical-data').textContent);",
  "  var STORAGE_KEY = 'eq-secgroups-sandbox-v' + canonical.version;",
  "  var MODULE_LABELS = " + JSON.stringify(MODULE_LABELS) + ";",
  "  var searchTerm = '';",
  "",
  "  function esc(s) {",
  "    return String(s).replace(/[&<>\"']/g, function (c) {",
  "      var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' };",
  "      return map[c];",
  "    });",
  "  }",
  "",
  "  function slug(s) {",
  "    return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');",
  "  }",
  "",
  "  function cloneCanonical() {",
  "    return {",
  "      permissions: canonical.permissions.map(function (p) {",
  "        return { key: p.key, module: p.module, label: p.label, description: p.description, roles: p.roles.slice(), deprecated: p.deprecated || null };",
  "      }),",
  "      groups: canonical.defaultGroups.map(function (g) {",
  "        return { key: g.key, name: g.name, description: g.description, perms: g.perms.slice() };",
  "      })",
  "    };",
  "  }",
  "",
  "  function loadState() {",
  "    try {",
  "      var raw = localStorage.getItem(STORAGE_KEY);",
  "      if (raw) {",
  "        var parsed = JSON.parse(raw);",
  "        if (parsed && Array.isArray(parsed.permissions) && Array.isArray(parsed.groups)) return parsed;",
  "      }",
  "    } catch (e) {}",
  "    return cloneCanonical();",
  "  }",
  "",
  "  var state = loadState();",
  "",
  "  function saveState() {",
  "    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}",
  "  }",
  "",
  "  function findPerm(key) {",
  "    for (var i = 0; i < state.permissions.length; i++) if (state.permissions[i].key === key) return state.permissions[i];",
  "    return null;",
  "  }",
  "",
  "  function findGroup(key) {",
  "    for (var i = 0; i < state.groups.length; i++) if (state.groups[i].key === key) return state.groups[i];",
  "    return null;",
  "  }",
  "",
  "  function computeDiff() {",
  "    var canonPermByKey = {}, i;",
  "    for (i = 0; i < canonical.permissions.length; i++) canonPermByKey[canonical.permissions[i].key] = canonical.permissions[i];",
  "    var statePermByKey = {};",
  "    for (i = 0; i < state.permissions.length; i++) statePermByKey[state.permissions[i].key] = state.permissions[i];",
  "    var canonGroupByKey = {};",
  "    for (i = 0; i < canonical.defaultGroups.length; i++) canonGroupByKey[canonical.defaultGroups[i].key] = canonical.defaultGroups[i];",
  "    var stateGroupByKey = {};",
  "    for (i = 0; i < state.groups.length; i++) stateGroupByKey[state.groups[i].key] = state.groups[i];",
  "",
  "    var addedPerms = state.permissions.filter(function (p) { return !canonPermByKey[p.key]; });",
  "    var removedPerms = canonical.permissions.filter(function (p) { return !statePermByKey[p.key]; });",
  "    var changedGrants = [];",
  "    state.permissions.forEach(function (p) {",
  "      var c = canonPermByKey[p.key];",
  "      if (!c) return;",
  "      var before = c.roles.slice().sort().join(',');",
  "      var after = p.roles.slice().sort().join(',');",
  "      if (before !== after) changedGrants.push({ key: p.key, before: c.roles.slice(), after: p.roles.slice() });",
  "    });",
  "",
  "    var addedGroups = state.groups.filter(function (g) { return !canonGroupByKey[g.key]; });",
  "    var removedGroups = canonical.defaultGroups.filter(function (g) { return !stateGroupByKey[g.key]; });",
  "    var changedGroups = [];",
  "    state.groups.forEach(function (g) {",
  "      var c = canonGroupByKey[g.key];",
  "      if (!c) return;",
  "      var permsBefore = c.perms.slice().sort().join(',');",
  "      var permsAfter = g.perms.slice().sort().join(',');",
  "      if (permsBefore !== permsAfter || c.name !== g.name || c.description !== g.description) {",
  "        changedGroups.push({ key: g.key, before: { name: c.name, description: c.description, perms: c.perms.slice() }, after: { name: g.name, description: g.description, perms: g.perms.slice() } });",
  "      }",
  "    });",
  "",
  "    return { addedPerms: addedPerms, removedPerms: removedPerms, changedGrants: changedGrants, addedGroups: addedGroups, removedGroups: removedGroups, changedGroups: changedGroups };",
  "  }",
  "",
  "  function changeCount(diff) {",
  "    return diff.addedPerms.length + diff.removedPerms.length + diff.changedGrants.length + diff.addedGroups.length + diff.removedGroups.length + diff.changedGroups.length;",
  "  }",
  "",
  "  // ---------------------------------------------------------------- matrix",
  "  function renderMatrix() {",
  "    var root = document.getElementById('matrix-root');",
  "    var html = '';",
  "    var term = searchTerm.trim().toLowerCase();",
  "    canonical.modules.forEach(function (moduleKey) {",
  "      var perms = state.permissions.filter(function (p) { return p.module === moduleKey; });",
  "      if (term) {",
  "        perms = perms.filter(function (p) { return (p.key + ' ' + p.label).toLowerCase().indexOf(term) !== -1; });",
  "        if (perms.length === 0) return;",
  "      }",
  "      var headerCells = canonical.roles.map(function (r) { return '<th class=\"rot\">' + esc(r.label) + '</th>'; }).join('');",
  "      var rows = perms.map(function (p) {",
  "        var isNew = !canonical.permissions.some(function (cp) { return cp.key === p.key; });",
  "        var cells = canonical.roleKeys.map(function (rk) {",
  "          var checked = p.roles.indexOf(rk) !== -1 ? ' checked' : '';",
  "          return '<td class=\"grant-cell\"><input type=\"checkbox\" data-action=\"toggle-grant\" data-perm=\"' + esc(p.key) + '\" data-role=\"' + esc(rk) + '\"' + checked + '></td>';",
  "        }).join('');",
  "        var deprecated = p.deprecated ? '<div class=\"deprecated\">Deprecated — ' + esc(p.deprecated) + '</div>' : '';",
  "        var badge = isNew ? '<span class=\"badge-new\">New</span>' : '';",
  "        return '<tr><td class=\"perm-name\"><code>' + esc(p.key) + '</code>' + badge + '<div class=\"perm-label\">' + esc(p.label) + '</div>' + deprecated + '</td>' + cells +",
  "          '<td class=\"remove-cell\"><button type=\"button\" class=\"icon-btn\" data-action=\"remove-perm\" data-perm=\"' + esc(p.key) + '\" title=\"Remove this permission\" aria-label=\"Remove ' + esc(p.key) + '\">&times;</button></td></tr>';",
  "      }).join('');",
  "      var addRow = '<tr class=\"add-row\"><td colspan=\"' + (canonical.roles.length + 2) + '\">' +",
  "        '<form class=\"add-form\" data-action=\"add-perm\" data-module=\"' + esc(moduleKey) + '\">' +",
  "        '<span class=\"add-form-prefix\">' + esc(moduleKey) + '.</span>' +",
  "        '<input type=\"text\" name=\"key\" placeholder=\"new_key\" aria-label=\"New permission key suffix\">' +",
  "        '<input type=\"text\" name=\"label\" placeholder=\"Label\" aria-label=\"New permission label\">' +",
  "        '<button type=\"submit\" class=\"btn btn-ghost\">+ Add permission</button>' +",
  "        '<span class=\"form-error\" data-role=\"error\"></span>' +",
  "        '</form></td></tr>';",
  "      html += '<h3>' + esc(MODULE_LABELS[moduleKey] || moduleKey) + '</h3>' +",
  "        '<table class=\"matrix\"><thead><tr><th>Permission</th>' + headerCells + '<th></th></tr></thead><tbody>' + rows + addRow + '</tbody></table>';",
  "    });",
  "    if (!html) html = '<p class=\"lede\">No permissions match &ldquo;' + esc(searchTerm) + '&rdquo;.</p>';",
  "    root.innerHTML = html;",
  "  }",
  "",
  "  // ------------------------------------------------------------ all perms",
  "  var allPermsSort = { index: 0, dir: 'ascending' };",
  "  function allPermsRows() {",
  "    var canonKeys = {};",
  "    canonical.permissions.forEach(function (p) { canonKeys[p.key] = true; });",
  "    return state.permissions.slice().sort(function (a, b) { return a.key.localeCompare(b.key); }).map(function (p) {",
  "      var modLabel = MODULE_LABELS[p.module] || p.module;",
  "      var roleChips = p.roles.map(function (rk) {",
  "        var role = canonical.roles.filter(function (r) { return r.key === rk; })[0];",
  "        return '<code class=\"perm-chip\">' + esc(role ? role.label : rk) + '</code>';",
  "      }).join(' ');",
  "      var status = p.deprecated ? 'Deprecated' : (canonKeys[p.key] ? 'Active' : 'Added');",
  "      var deprecatedNote = p.deprecated ? '<div class=\"deprecated\">Deprecated — ' + esc(p.deprecated) + '</div>' : '';",
  "      return { key: p.key, module: modLabel, roleCount: p.roles.length, status: status,",
  "        html: '<tr><td data-sort=\"' + esc(p.key) + '\"><code>' + esc(p.key) + '</code><div class=\"perm-label\">' + esc(p.label) + '</div>' + deprecatedNote + '</td>' +",
  "          '<td data-sort=\"' + esc(modLabel) + '\">' + esc(modLabel) + '</td>' +",
  "          '<td data-sort=\"' + p.roles.length + '\"><span class=\"role-count\">' + p.roles.length + '</span><div class=\"role-chips\">' + roleChips + '</div></td>' +",
  "          '<td data-sort=\"' + esc(status) + '\">' + esc(status) + '</td></tr>' };",
  "    });",
  "  }",
  "",
  "  function renderAllPerms() {",
  "    var root = document.getElementById('allperms-root');",
  "    var rows = allPermsRows();",
  "    var cols = ['Permission', 'Module', 'Roles granted', 'Status'];",
  "    var types = ['text', 'text', 'number', 'text'];",
  "    var head = cols.map(function (c, i) {",
  "      var isSorted = allPermsSort.index === i;",
  "      var sortAttr = isSorted ? ' aria-sort=\"' + allPermsSort.dir + '\"' : '';",
  "      return '<th data-type=\"' + types[i] + '\" data-idx=\"' + i + '\"' + sortAttr + '>' + c + '</th>';",
  "    }).join('');",
  "    var sortedRows = sortRowsHtml(rows, allPermsSort);",
  "    root.innerHTML = '<table class=\"sortable\" id=\"all-perms\"><thead><tr>' + head + '</tr></thead><tbody>' + sortedRows + '</tbody></table>';",
  "  }",
  "",
  "  function sortRowsHtml(rows, sort) {",
  "    var idx = sort.index;",
  "    var mult = sort.dir === 'ascending' ? 1 : -1;",
  "    var type = idx === 2 ? 'number' : 'text';",
  "    var keyFor = function (r) { return idx === 0 ? r.key : idx === 1 ? r.module : idx === 2 ? r.roleCount : r.status; };",
  "    var copy = rows.slice().sort(function (ra, rb) {",
  "      var av = keyFor(ra), bv = keyFor(rb);",
  "      if (type === 'number') return (av - bv) * mult;",
  "      return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base', numeric: true }) * mult;",
  "    });",
  "    return copy.map(function (r) { return r.html; }).join('');",
  "  }",
  "",
  "  // ---------------------------------------------------------------- groups",
  "  function renderGroups() {",
  "    var root = document.getElementById('groups-root');",
  "    var cards = state.groups.map(function (g, i) {",
  "      var picker = canonical.modules.map(function (moduleKey) {",
  "        var perms = state.permissions.filter(function (p) { return p.module === moduleKey; });",
  "        if (perms.length === 0) return '';",
  "        var rows = perms.map(function (p) {",
  "          var checked = g.perms.indexOf(p.key) !== -1 ? ' checked' : '';",
  "          return '<label class=\"group-perm-row\"><input type=\"checkbox\" data-action=\"toggle-group-perm\" data-group=\"' + esc(g.key) + '\" data-perm=\"' + esc(p.key) + '\"' + checked + '> <code>' + esc(p.key) + '</code></label>';",
  "        }).join('');",
  "        return '<div class=\"group-perm-module\">' + esc(MODULE_LABELS[moduleKey] || moduleKey) + '</div>' + rows;",
  "      }).join('');",
  "      return '<div class=\"group-card\" open>' +",
  "        '<div class=\"group-card-edit\">' +",
  "        '<input type=\"text\" class=\"group-name-input\" data-action=\"edit-group-name\" data-group=\"' + esc(g.key) + '\" value=\"' + esc(g.name) + '\" aria-label=\"Group name\">' +",
  "        '<input type=\"text\" data-action=\"edit-group-desc\" data-group=\"' + esc(g.key) + '\" value=\"' + esc(g.description) + '\" aria-label=\"Group description\">' +",
  "        '</div>' +",
  "        '<div class=\"group-meta-row\"><code>' + esc(g.key) + '</code><span class=\"group-count\">' + g.perms.length + ' grant' + (g.perms.length === 1 ? '' : 's') + '</span>' +",
  "        '<button type=\"button\" class=\"btn btn-danger-ghost\" data-action=\"remove-group\" data-group=\"' + esc(g.key) + '\">Remove group</button></div>' +",
  "        '<div class=\"group-perm-picker\">' + picker + '</div>' +",
  "        '</div>';",
  "    }).join('');",
  "    var addCard = '<div class=\"group-card add-group-card\">' +",
  "      '<form data-action=\"add-group\" class=\"add-group-form\">' +",
  "      '<input type=\"text\" name=\"name\" placeholder=\"New group name\" aria-label=\"New group name\">' +",
  "      '<input type=\"text\" name=\"description\" placeholder=\"Description\" aria-label=\"New group description\">' +",
  "      '<button type=\"submit\" class=\"btn btn-ghost\">+ Add security group</button>' +",
  "      '<span class=\"form-error\" data-role=\"error\"></span>' +",
  "      '</form></div>';",
  "    root.innerHTML = '<div class=\"group-cards\">' + cards + addCard + '</div>';",
  "  }",
  "",
  "  // ---------------------------------------------------------- changes bar",
  "  function renderChangesBar() {",
  "    var bar = document.getElementById('changes-bar');",
  "    var diff = computeDiff();",
  "    var n = changeCount(diff);",
  "    var countHtml = n === 0",
  "      ? '<span class=\"changes-count is-zero\">No changes — matches the canonical model</span>'",
  "      : '<span class=\"changes-count\">' + n + ' unsaved change' + (n === 1 ? '' : 's') + ' &middot; saved to this browser only</span>';",
  "    bar.innerHTML = '<div class=\"changes-bar-inner\">' + countHtml +",
  "      '<span class=\"spacer\"></span>' +",
  "      '<div class=\"changes-bar-actions\">' +",
  "      '<button type=\"button\" class=\"btn btn-ghost\" data-action=\"reset-sandbox\"' + (n === 0 ? ' disabled' : '') + '>Reset to canonical</button>' +",
  "      '<button type=\"button\" class=\"btn\" data-action=\"export-changes\"' + (n === 0 ? ' disabled' : '') + '>Export changes (.json)</button>' +",
  "      '</div></div>';",
  "  }",
  "",
  "  function render() {",
  "    renderMatrix();",
  "    renderAllPerms();",
  "    renderGroups();",
  "    renderChangesBar();",
  "    saveState();",
  "  }",
  "",
  "  // -------------------------------------------------------------- actions",
  "  function toggleGrant(permKey, roleKey, granted) {",
  "    var p = findPerm(permKey);",
  "    if (!p) return;",
  "    var idx = p.roles.indexOf(roleKey);",
  "    if (granted && idx === -1) p.roles.push(roleKey);",
  "    if (!granted && idx !== -1) p.roles.splice(idx, 1);",
  "  }",
  "",
  "  function removePerm(permKey) {",
  "    state.permissions = state.permissions.filter(function (p) { return p.key !== permKey; });",
  "    state.groups.forEach(function (g) { g.perms = g.perms.filter(function (k) { return k !== permKey; }); });",
  "  }",
  "",
  "  function addPerm(moduleKey, keySuffix, label, formEl) {",
  "    var errEl = formEl.querySelector('[data-role=error]');",
  "    var suffix = slug(keySuffix);",
  "    if (!suffix) { errEl.textContent = 'Enter a key.'; return false; }",
  "    var fullKey = moduleKey + '.' + suffix;",
  "    if (findPerm(fullKey)) { errEl.textContent = 'That key already exists.'; return false; }",
  "    state.permissions.push({ key: fullKey, module: moduleKey, label: label.trim() || fullKey, description: '', roles: [], deprecated: null });",
  "    return true;",
  "  }",
  "",
  "  function removeGroup(groupKey) {",
  "    state.groups = state.groups.filter(function (g) { return g.key !== groupKey; });",
  "  }",
  "",
  "  function addGroup(name, description, formEl) {",
  "    var errEl = formEl.querySelector('[data-role=error]');",
  "    var trimmedName = name.trim();",
  "    if (!trimmedName) { errEl.textContent = 'Enter a name.'; return false; }",
  "    var key = slug(trimmedName);",
  "    if (findGroup(key)) { errEl.textContent = 'A group with that key already exists.'; return false; }",
  "    state.groups.push({ key: key, name: trimmedName, description: description.trim(), perms: [] });",
  "    return true;",
  "  }",
  "",
  "  function resetSandbox() {",
  "    if (!window.confirm('Discard all sandbox changes and reset to the canonical model?')) return;",
  "    state = cloneCanonical();",
  "    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}",
  "    render();",
  "  }",
  "",
  "  function exportChanges() {",
  "    var diff = computeDiff();",
  "    var payload = {",
  "      exportedAt: new Date().toISOString(),",
  "      baseVersion: canonical.version,",
  "      summary: {",
  "        permissionsAdded: diff.addedPerms.length,",
  "        permissionsRemoved: diff.removedPerms.length,",
  "        grantsChanged: diff.changedGrants.length,",
  "        groupsAdded: diff.addedGroups.length,",
  "        groupsRemoved: diff.removedGroups.length,",
  "        groupsChanged: diff.changedGroups.length",
  "      },",
  "      addedPermissions: diff.addedPerms,",
  "      removedPermissions: diff.removedPerms.map(function (p) { return p.key; }),",
  "      changedGrants: diff.changedGrants,",
  "      addedGroups: diff.addedGroups,",
  "      removedGroups: diff.removedGroups.map(function (g) { return g.key; }),",
  "      changedGroups: diff.changedGroups",
  "    };",
  "    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });",
  "    var url = URL.createObjectURL(blob);",
  "    var a = document.createElement('a');",
  "    a.href = url;",
  "    a.download = 'eq-security-groups-changes-' + canonical.version + '.json';",
  "    document.body.appendChild(a);",
  "    a.click();",
  "    document.body.removeChild(a);",
  "    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);",
  "  }",
  "",
  "  // --------------------------------------------------------------- events",
  "  document.addEventListener('click', function (e) {",
  "    var el = e.target.closest ? e.target.closest('[data-action]') : null;",
  "    if (!el) return;",
  "    var action = el.getAttribute('data-action');",
  "    if (action === 'remove-perm') { removePerm(el.getAttribute('data-perm')); render(); }",
  "    else if (action === 'remove-group') { removeGroup(el.getAttribute('data-group')); render(); }",
  "    else if (action === 'reset-sandbox') { resetSandbox(); }",
  "    else if (action === 'export-changes') { exportChanges(); }",
  "  });",
  "",
  "  document.addEventListener('change', function (e) {",
  "    var el = e.target;",
  "    var action = el.getAttribute && el.getAttribute('data-action');",
  "    if (!action) return;",
  "    if (action === 'toggle-grant') { toggleGrant(el.getAttribute('data-perm'), el.getAttribute('data-role'), el.checked); render(); }",
  "    else if (action === 'toggle-group-perm') {",
  "      var g = findGroup(el.getAttribute('data-group'));",
  "      if (!g) return;",
  "      var pk = el.getAttribute('data-perm');",
  "      var idx = g.perms.indexOf(pk);",
  "      if (el.checked && idx === -1) g.perms.push(pk);",
  "      if (!el.checked && idx !== -1) g.perms.splice(idx, 1);",
  "      render();",
  "    }",
  "    else if (action === 'edit-group-name') { var gn = findGroup(el.getAttribute('data-group')); if (gn) { gn.name = el.value; renderChangesBar(); saveState(); } }",
  "    else if (action === 'edit-group-desc') { var gd = findGroup(el.getAttribute('data-group')); if (gd) { gd.description = el.value; renderChangesBar(); saveState(); } }",
  "  });",
  "",
  "  document.addEventListener('submit', function (e) {",
  "    var form = e.target;",
  "    var action = form.getAttribute && form.getAttribute('data-action');",
  "    if (!action) return;",
  "    e.preventDefault();",
  "    if (action === 'add-perm') {",
  "      var keyInput = form.querySelector('[name=key]');",
  "      var labelInput = form.querySelector('[name=label]');",
  "      if (addPerm(form.getAttribute('data-module'), keyInput.value, labelInput.value, form)) render();",
  "    } else if (action === 'add-group') {",
  "      var nameInput = form.querySelector('[name=name]');",
  "      var descInput = form.querySelector('[name=description]');",
  "      if (addGroup(nameInput.value, descInput.value, form)) render();",
  "    }",
  "  });",
  "",
  "  document.addEventListener('input', function (e) {",
  "    if (e.target && e.target.id === 'perm-search') {",
  "      searchTerm = e.target.value;",
  "      renderMatrix();",
  "    }",
  "  });",
  "",
  "  document.addEventListener('click', function (e) {",
  "    var th = e.target.closest ? e.target.closest('#all-perms thead th') : null;",
  "    if (!th) return;",
  "    var idx = parseInt(th.getAttribute('data-idx'), 10);",
  "    allPermsSort.dir = (allPermsSort.index === idx && allPermsSort.dir === 'ascending') ? 'descending' : 'ascending';",
  "    allPermsSort.index = idx;",
  "    renderAllPerms();",
  "  });",
  "",
  "  render();",
  "})();"
].join('\n');

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
    --danger: #b3541e; --danger-bg: #fbeee5; --danger-border: #e0c2ac;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14141f; --fg: #eef3f7; --ice: #1c2b36; --border: #2a3a46; --muted: #9fb0bd; --danger-bg: #2e2013; }
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg); color: var(--fg); margin: 0; padding: 2.5rem 1.5rem 6rem;
    line-height: 1.5;
  }
  .wrap { max-width: 980px; margin: 0 auto; }
  header { border-bottom: 2px solid var(--sky); padding-bottom: 1.25rem; margin-bottom: 1.25rem; }
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
  .deprecated { color: var(--danger); font-size: 0.76rem; margin-top: 0.2rem; }
  code { font-family: 'SFMono-Regular', Consolas, Menlo, monospace; }
  .scope-note { background: var(--ice); border: 1px solid var(--border); border-radius: 6px; padding: 0.9rem 1.1rem; font-size: 0.87rem; margin-top: 2rem; }
  .scope-note strong { color: var(--deep); }
  .scope-note a { color: var(--deep); }
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

  /* sandbox note */
  .sandbox-note { background: var(--bg); border: 1.5px solid var(--sky); border-radius: 6px; padding: 0.9rem 1.1rem; font-size: 0.87rem; margin: 0 0 1.75rem; }
  .sandbox-note strong { color: var(--deep); }

  /* controls */
  .controls-row { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0 1rem; }
  .search-input { border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.65rem; font-size: 0.85rem; background: var(--bg); color: var(--fg); min-width: 260px; font-family: inherit; }
  .search-input:focus { outline: 2px solid var(--sky); outline-offset: 1px; }
  input[type="checkbox"] { width: 1rem; height: 1rem; accent-color: var(--deep); cursor: pointer; }
  .icon-btn { border: 1px solid var(--border); background: var(--bg); color: var(--muted); border-radius: 5px; width: 1.7rem; height: 1.7rem; line-height: 1; cursor: pointer; font-size: 0.95rem; }
  .icon-btn:hover { border-color: var(--danger); color: var(--danger); }
  .remove-cell { text-align: center; width: 2.2rem; }
  .add-row td { border-top: 1px dashed var(--border); background: var(--ice); }
  .add-form { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; padding: 0.4rem 0; }
  .add-form-prefix { font-family: 'SFMono-Regular', Consolas, Menlo, monospace; font-size: 0.82rem; color: var(--muted); }
  .add-form input[type=text] { border: 1px solid var(--border); border-radius: 5px; padding: 0.3rem 0.55rem; font-size: 0.82rem; background: var(--bg); color: var(--fg); font-family: inherit; }
  .add-form input[name=key] { width: 9rem; }
  .add-form input[name=label] { width: 14rem; }
  .btn { border: 1px solid var(--sky); background: var(--sky); color: #fff; border-radius: 6px; padding: 0.35rem 0.85rem; font-size: 0.82rem; cursor: pointer; font-weight: 600; font-family: inherit; }
  .btn:hover { background: var(--deep); border-color: var(--deep); }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-ghost { background: transparent; color: var(--deep); border-color: var(--border); }
  .btn-ghost:hover { background: var(--ice); }
  .btn-danger-ghost { background: transparent; color: var(--danger); border-color: var(--danger-border); }
  .btn-danger-ghost:hover { background: var(--danger-bg); }
  .form-error { color: var(--danger); font-size: 0.78rem; }
  .badge-new { display: inline-block; background: var(--deep); color: #fff; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; border-radius: 3px; padding: 0.05rem 0.35rem; margin-left: 0.4rem; vertical-align: middle; }

  /* group cards */
  .group-cards { display: flex; flex-direction: column; gap: 0.9rem; margin: 0.75rem 0 1.5rem; }
  .group-card { border: 1px solid var(--border); border-radius: 8px; padding: 1rem; background: var(--bg); }
  .group-card-edit { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.6rem; }
  .group-card-edit input[type=text] { border: 1px solid var(--border); border-radius: 5px; padding: 0.4rem 0.6rem; font-size: 0.85rem; background: var(--bg); color: var(--fg); width: 100%; font-family: inherit; }
  .group-name-input { font-weight: 600; font-size: 0.95rem; }
  .group-meta-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.7rem; }
  .group-meta-row code { color: var(--muted); font-size: 0.82rem; }
  .group-count { font-size: 0.76rem; color: var(--muted); background: var(--ice); border-radius: 4px; padding: 0.1rem 0.5rem; }
  .group-perm-picker { display: flex; flex-direction: column; gap: 0.15rem; max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.8rem; background: var(--ice); }
  .group-perm-module { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin: 0.5rem 0 0.15rem; }
  .group-perm-module:first-child { margin-top: 0; }
  .group-perm-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.83rem; padding: 0.1rem 0; cursor: pointer; }
  .group-perm-row code { font-size: 0.78rem; }
  .add-group-card { border: 1.5px dashed var(--border); }
  .add-group-form { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .add-group-form input[type=text] { border: 1px solid var(--border); border-radius: 5px; padding: 0.35rem 0.6rem; font-size: 0.84rem; background: var(--bg); color: var(--fg); font-family: inherit; }
  .add-group-form input[name=name] { width: 12rem; }
  .add-group-form input[name=description] { width: 20rem; }

  /* sortable table */
  table.sortable th { cursor: pointer; user-select: none; }
  table.sortable th:hover { background: var(--sky); color: #fff; }
  table.sortable th[aria-sort]::after { margin-left: 0.35rem; font-size: 0.7rem; }
  table.sortable th[aria-sort="ascending"]::after { content: '\\25B2'; }
  table.sortable th[aria-sort="descending"]::after { content: '\\25BC'; }
  .role-count { font-weight: 700; color: var(--deep); }
  .role-chips { margin-top: 0.2rem; }

  /* changes bar */
  .changes-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; background: var(--ice); border-top: 1px solid var(--border); padding: 0.7rem 1.5rem; }
  .changes-bar-inner { max-width: 980px; margin: 0 auto; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .changes-count { font-weight: 700; color: var(--deep); font-size: 0.85rem; }
  .changes-count.is-zero { color: var(--muted); font-weight: 600; }
  .changes-bar .spacer { flex: 1 1 auto; }
  .changes-bar-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>EQ Suite — Security Groups &amp; Permission Model</h1>
    <div class="meta">Canonical model &middot; @eq-solutions/roles v${esc(data.version)} &middot; generated ${generatedAt} &middot; interactive sandbox</div>
  </header>

  ${sandboxNoteSection()}
  ${workflowDiagramSection()}
  ${roleMatrixSection()}
  ${matrixShellSection()}
  ${allPermsShellSection()}
  ${groupsShellSection()}

  <div class="scope-note">
    <strong>Scope of this document:</strong> the canonical model only — the 6 roles, the full permission matrix, and the default security-group templates, as defined in <code>eq-roles</code>. Changes you make on this page are local to your browser and exploratory only; they do <strong>not</strong> touch live, per-tenant group membership or tenant-specific (non-default) groups — those are created and managed per tenant in eq-shell's <a href="${ACCESS_CONTROL_URL}" target="_blank" rel="noopener">Access Control page</a> (<code>admin.manage_groups</code>).
  </div>

  <footer>Generated by <code>scripts/export-security-groups.mjs</code> from <code>roles.json</code>. Re-run after any <code>roles/model.json</code> change to keep the canonical baseline current — your sandbox edits live only in this browser's local storage.</footer>
</div>
<div class="changes-bar" id="changes-bar"></div>
<script type="application/json" id="eq-canonical-data">${canonicalJson}</script>
<script>
${appScript}
</script>
</body>
</html>
`;

writeFileSync(path.join(root, 'security-groups.html'), html, 'utf8');
console.log(`Wrote security-groups.html (${data.roles.length} roles, ${data.permissions.length} perms, ${data.defaultGroups.length} default groups) — interactive sandbox`);
