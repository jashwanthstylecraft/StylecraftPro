/**
 * STYLECRAFT VISION PRO - team Google Sheet connector
 *
 * Lets the app write into your catalog Google Sheet:
 *   - "Send to catalog": a measured speed / noise / power goes into the product's row of the Catalog tab
 *     (columns measuredRpm, measuredNoiseDb, measuredWatts, measuredDate).
 *   - Leads: every lead captured in the app is added to a "Leads" tab (created automatically).
 *
 * SETUP (one time, about 5 minutes):
 *   1. Open your catalog Google Sheet > Extensions > Apps Script.
 *   2. Delete what's there, paste this whole file, click Save (disk icon).
 *   3. Deploy > New deployment > gear icon > "Web app".
 *        Description: Vision app   Execute as: Me   Who has access: Anyone
 *      Click Deploy, allow the permissions it asks for (Advanced > Go to project > Allow).
 *   4. Copy the "Web app URL" (ends in /exec).
 *   5. In the app: Settings > Team Google Sheet > paste the link > SAVE > TEST.
 *
 * SALES REP SIGN-IN: accounts live in the "Users" tab of the private leads sheet (see the end of this file).
 *
 * TEAM_KEY must match the "Team key" in the app's Settings. Change both if you want a new key.
 * If you edit this script later: Deploy > Manage deployments > pencil > Version: New version > Deploy.
 */
const TEAM_KEY = '2c5eb66ed3b66ae8';
const CATALOG_TAB = 'Catalog';
const LEADS_TAB = 'Leads';
// Leads go to a separate PRIVATE spreadsheet ("Stylecraft Vision Leads (private)"), because the catalog sheet
// is shared publicly so phones can read it. Only people with access to this spreadsheet can see leads.
const LEADS_SPREADSHEET_ID = '1dQSEZVc2ABrZqf7PW1bQ7gqqq2PIjcgQ1W06IgSX3aM';
const LEAD_HEADERS = ['id', 'Date', 'Rep', 'Name', 'Shop', 'Phone', 'Email', 'City', 'Event', 'Interested in', 'Wants visit/demo', 'Notes', 'Title', 'Website', 'Badge #', 'Captured by', 'Status', 'Follow-up date', 'Last contact', 'Photo', 'Region'];
const PHOTO_COL = 20;   // column T
const PHOTO_PX = 60;   // photo size in the sheet (rows are 64 px tall)

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.key !== TEAM_KEY) return reply({ ok: false, error: 'Wrong team key' });
    // Documents are read-only, so they don't wait for the lock
    if (body.type === 'docs' || body.type === 'docFile') {
      const who = checkUser(body.user, body.token);
      if (!who.ok) return reply(who);
      return reply(body.type === 'docs' ? listDocs() : docFile(body.id));
    }
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      // Sign-in: the user name and password come from the "Users" tab of the private leads sheet
      if (body.type === 'login') return reply(login(body.user, body.password));
      if (body.type === 'ping') {
        const leadsName = LEADS_SPREADSHEET_ID ? SpreadsheetApp.openById(LEADS_SPREADSHEET_ID).getName() : 'this sheet';
        return reply({ ok: true, message: 'Connected. Catalog: ' + SpreadsheetApp.getActive().getName() + ' - Leads: ' + leadsName });
      }
      // Everything else needs a signed-in, active rep
      const who = checkUser(body.user, body.token);
      if (!who.ok) return reply(who);
      if (body.type === 'session') return reply({ ok: true, message: 'Signed in as ' + who.name, region: who.region || '' });
      if (body.type === 'changePassword') return reply(changePassword(who, body.password, body.newPassword));
      if (body.type === 'measurement') return reply(saveMeasurement(body));
      if (body.type === 'leads') {
        (body.leads || []).forEach(l => { l.rep = who.name || l.rep; l.region = who.region || l.region || ''; });   // rep + region come from the account
        return reply(saveLeads(body.leads || []));
      }
      return reply({ ok: false, error: 'Unknown request' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function doGet() {
  return reply({ ok: true, message: 'Stylecraft Vision connector is running' });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function saveMeasurement(b) {
  const sh = SpreadsheetApp.getActive().getSheetByName(CATALOG_TAB);
  if (!sh) return { ok: false, error: 'No "' + CATALOG_TAB + '" tab in this sheet' };
  const data = sh.getDataRange().getValues();
  const header = data[0].map(String);
  const col = name => header.indexOf(name);
  if (col('id') < 0) return { ok: false, error: 'Catalog tab has no "id" column' };
  // add the measured columns if this sheet doesn't have them yet
  ['measuredRpm', 'measuredNoiseDb', 'measuredWatts', 'measuredDate'].forEach(name => {
    if (col(name) < 0) { header.push(name); sh.getRange(1, header.length).setValue(name); }
  });
  let row = -1;
  for (let r = 1; r < data.length; r++) if (String(data[r][col('id')]).trim() === String(b.id).trim()) { row = r + 1; break; }
  if (row < 0) return { ok: false, error: 'Product ' + b.id + ' not found in the Catalog tab' };
  const set = (name, v) => { if (v !== undefined && v !== null && v !== '') sh.getRange(row, col(name) + 1).setValue(v); };
  set('measuredRpm', b.measuredRpm);
  set('measuredNoiseDb', b.measuredNoiseDb);
  set('measuredWatts', b.measuredWatts);
  set('measuredDate', b.date);
  return { ok: true, message: 'Saved to the catalog (row ' + row + ')' };
}

function saveLeads(leads) {
  const ss = LEADS_SPREADSHEET_ID ? SpreadsheetApp.openById(LEADS_SPREADSHEET_ID) : SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(LEADS_TAB);
  if (!sh) {
    sh = ss.insertSheet(LEADS_TAB);   // added at the end, so the Catalog tab stays first
    sh.appendRow(LEAD_HEADERS);
    sh.getRange(1, 1, 1, LEAD_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < LEAD_HEADERS.length) {
    // older Leads tab: add the newer column titles
    sh.getRange(1, 1, 1, LEAD_HEADERS.length).setValues([LEAD_HEADERS]).setFontWeight('bold');
  }
  // id -> sheet row, so a lead edited on the phone updates its row instead of being skipped
  const ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues().map(r => String(r[0]).trim());
  const rowOf = {};
  ids.forEach((id, i) => { if (id) rowOf[id] = i + 1; });
  // keep text as text: a phone like "+1 555..." or notes starting with "=" would otherwise be read as a formula
  const txt = v => { const s = (v === undefined || v === null) ? '' : String(v); return /^[=+\-@]/.test(s) ? "'" + s : s; };
  let added = 0, updated = 0, photos = 0;
  leads.forEach(l => {
    const id = String(l.id || '').trim();
    if (!id) return;
    const values = [id, l.date || '', txt(l.rep), txt(l.name), txt(l.shop), txt(l.phone), txt(l.email), txt(l.city), txt(l.event),
      txt(l.products), l.wantsVisit || '', txt(l.notes), txt(l.title), txt(l.website), txt(l.badgeId), txt(l.source),
      txt(l.status), txt(l.followUp), txt(l.lastContact), '', txt(l.region)];   // column T (photo) stays empty text
    if (rowOf[id]) {
      sh.getRange(rowOf[id], 1, 1, values.length).setValues([values]);
      updated++;
    } else {
      sh.appendRow(values);
      rowOf[id] = sh.getLastRow();
      added++;
    }
    if (l.photo) { putPhoto(sh, rowOf[id], id, l.photo); photos++; }
  });
  return { ok: true, message: added + ' lead(s) added' + (updated ? ', ' + updated + ' updated' : '') + ' in the Leads tab' + (photos ? ' (' + photos + ' photo' + (photos > 1 ? 's' : '') + ')' : '') };
}

// Puts the lead's profile photo in column T of its row, replacing an older photo of the same lead.
function putPhoto(sh, row, id, base64) {
  try {
    sh.getImages().forEach(img => {
      if (img.getAltTextTitle() === id || (img.getAnchorCell().getRow() === row && img.getAnchorCell().getColumn() === PHOTO_COL)) img.remove();
    });
    const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', id + '.jpg');
    const img = sh.insertImage(blob, PHOTO_COL, row, 2, 2);
    img.setWidth(PHOTO_PX).setHeight(PHOTO_PX).setAltTextTitle(id);
    if (sh.getRowHeight(row) < PHOTO_PX + 4) sh.setRowHeight(row, PHOTO_PX + 4);
  } catch (err) {
    // a photo problem never blocks saving the lead itself
  }
}

// ---------------------------------------------------------------------------------------------
// SALES REP ACCOUNTS ("Users" tab of the private leads sheet)
//
// You fill: Username, Full name, Email, Phone, Temporary password, Active (yes/no).
// The script fills the grey columns; don't type in them.
//   - New rep: type a Username and a Temporary password. At the first sign-in the app asks the rep to
//     choose their own password; the temporary one is then erased from the sheet.
//   - Forgot password / reset: type a new Temporary password in their row (the old password stops working).
//   - Rep leaves or loses the phone: set Active to "no". The phone is signed out the next time it goes online.
//   - 10 wrong passwords in a row lock the account (Active becomes "locked"); set it back to "yes" to unlock.
// Passwords are stored as salted SHA-256 hashes, never as text.
// ---------------------------------------------------------------------------------------------
const USERS_TAB = 'Users';
const USER_HEADERS = ['Username', 'Full name', 'Email', 'Phone', 'Temporary password', 'Active',
  'Must change password', 'Password hash', 'Salt', 'Session token', 'Last sign-in', 'Failed attempts', 'Region'];
const MAX_FAILED = 10;

function usersSheet() {
  const ss = SpreadsheetApp.openById(LEADS_SPREADSHEET_ID);
  let sh = ss.getSheetByName(USERS_TAB);
  if (!sh) {
    sh = ss.insertSheet(USERS_TAB);
    sh.getRange(1, 1, 1, USER_HEADERS.length).setValues([USER_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function findUser(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  const sh = usersSheet();
  const values = sh.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim().toLowerCase() === key) {
      const v = values[r];
      return {
        sh: sh, row: r + 1, user: String(v[0]).trim(), name: String(v[1] || '').trim(), email: String(v[2] || '').trim(),
        phone: String(v[3] || '').trim(), temp: String(v[4] || ''), active: String(v[5] || '').trim().toLowerCase(),
        mustChange: String(v[6] || '').trim().toLowerCase() === 'yes', hash: String(v[7] || ''), salt: String(v[8] || ''),
        token: String(v[9] || ''), failed: Number(v[11]) || 0, region: String(v[12] || '').trim()
      };
    }
  }
  return null;
}

function hashPassword(salt, password) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + password, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function isActive(u) { return u.active === 'yes' || u.active === 'y' || u.active === 'true'; }

function login(user, password) {
  const u = findUser(user);
  const bad = { ok: false, error: 'Wrong user name or password' };
  if (!u || !password) return bad;
  if (u.active === 'locked') return { ok: false, error: 'Account locked after too many wrong passwords. Ask your manager to unlock it.' };
  if (!isActive(u)) return { ok: false, error: 'This account is not active. Ask your manager.' };
  let mustChange;
  if (u.temp !== '' && String(password) === u.temp) {
    mustChange = true;                                   // first sign-in or reset by the manager
  } else if (u.hash && u.salt && hashPassword(u.salt, String(password)) === u.hash) {
    mustChange = u.mustChange;
  } else {
    const failed = u.failed + 1;
    u.sh.getRange(u.row, 12).setValue(failed);
    if (failed >= MAX_FAILED) u.sh.getRange(u.row, 6).setValue('locked');
    return bad;
  }
  // A temporary password (first sign-in or a reset) starts a new session and signs out other phones;
  // a normal sign-in reuses the session so the same rep can use a phone and a tablet.
  const token = (!mustChange && u.token) ? u.token : Utilities.getUuid();
  u.sh.getRange(u.row, 7).setValue(mustChange ? 'yes' : 'no');
  u.sh.getRange(u.row, 10, 1, 3).setValues([[token, new Date(), 0]]);
  return { ok: true, message: 'Welcome, ' + (u.name || u.user), user: u.user, token: token, mustChange: mustChange,
    name: u.name, email: u.email, phone: u.phone, region: u.region };
}

function checkUser(user, token) {
  const u = findUser(user);
  if (!u || !token || u.token !== String(token)) {
    return { ok: false, signedOut: true, error: 'Please sign in again (your password was reset or your session ended).' };
  }
  if (!isActive(u)) return { ok: false, signedOut: true, error: 'This account is not active. Ask your manager.' };
  return { ok: true, user: u.user, name: u.name || u.user, region: u.region, row: u.row, sh: u.sh, temp: u.temp, hash: u.hash, salt: u.salt };
}

function changePassword(who, current, next) {
  next = String(next || '');
  if (next.length < 6) return { ok: false, error: 'Use at least 6 characters' };
  const okCurrent = (who.temp !== '' && String(current) === who.temp) ||
    (who.hash && who.salt && hashPassword(who.salt, String(current)) === who.hash);
  if (!okCurrent) return { ok: false, error: 'Current password is wrong' };
  if (next === String(current) || next === who.temp) return { ok: false, error: 'Choose a password different from the temporary one' };
  const salt = Utilities.getUuid();
  // erase the temporary password, store only the salted hash
  who.sh.getRange(who.row, 5).setValue('');
  who.sh.getRange(who.row, 7, 1, 3).setValues([['no', hashPassword(salt, next), salt]]);
  return { ok: true, message: 'Password changed' };
}

// ---------------------------------------------------------------------------------------------
// DOCUMENTS (IB, TDS, battery SDS, certificates, test reports) - "Documents" tab of the private leads sheet
//
// Access column (dropdown):  Share = reps can open it and send it to customers
//                            View only = reps can open it in the app, no send button
//                            Hidden = not shown in the app
// The "Certification marks" column feeds the certification badges on each product page.
// Files are found by "Drive file ID", or by "File name" when the ID is empty (the ID is then filled in).
// To (re)load the list from documents_index.csv: open the catalog sheet > menu "Stylecraft Pro" > Import documents index.
// Re-importing keeps the Access choices you already made.
// ---------------------------------------------------------------------------------------------
const DOCS_TAB = 'Documents';
const DOC_HEADERS = ['Category', 'Products', 'Product name', 'Type', 'Title', 'Certification marks', 'Issuer', 'Date',
  'Language', 'Access', 'File name', 'Drive file ID', 'Source', 'Notes'];
const ACCESS_CHOICES = ['Share', 'View only', 'Hidden'];
const MAX_DOC_BYTES = 20 * 1024 * 1024;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Stylecraft Pro')
    .addItem('Import documents index', 'importDocumentsIndex')
    .addToUi();
}

function docsSheet() {
  return SpreadsheetApp.openById(LEADS_SPREADSHEET_ID).getSheetByName(DOCS_TAB);
}

/** Reads documents_index.csv (in the "Stylecraft Pro Documents" folder on Drive) into the Documents tab. */
function importDocumentsIndex() {
  const files = DriveApp.getFilesByName('documents_index.csv');
  if (!files.hasNext()) throw new Error('documents_index.csv not found in Drive. Upload the "Stylecraft Pro Documents" folder first.');
  const csvFile = files.next();
  const rows = Utilities.parseCsv(csvFile.getBlob().getDataAsString('UTF-8'));
  if (!rows.length) throw new Error('documents_index.csv is empty');
  const header = rows.shift().map(String);
  const at = name => header.indexOf(name);
  const ss = SpreadsheetApp.openById(LEADS_SPREADSHEET_ID);
  let sh = ss.getSheetByName(DOCS_TAB);
  const keep = {};   // previous Access and Drive file ID choices
  if (sh) {
    const old = sh.getDataRange().getValues();
    for (let r = 1; r < old.length; r++) keep[old[r][1] + '|' + old[r][10]] = { access: old[r][9], id: old[r][11] };
    sh.clear();
  } else {
    sh = ss.insertSheet(DOCS_TAB);
  }
  const out = rows.filter(r => r.join('').trim() !== '').map(r => {
    const row = DOC_HEADERS.map(h => at(h) >= 0 ? r[at(h)] : '');
    const k = keep[row[1] + '|' + row[10]];
    if (k) { if (k.access) row[9] = k.access; if (k.id && !row[11]) row[11] = k.id; }
    return row;
  });
  sh.getRange(1, 1, 1, DOC_HEADERS.length).setValues([DOC_HEADERS])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f1f1f').setWrap(true);
  if (out.length) {
    sh.getRange(2, 1, out.length, DOC_HEADERS.length).setNumberFormat('@').setValues(out);
    const acc = sh.getRange(2, 10, out.length, 1);
    acc.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ACCESS_CHOICES, true).setAllowInvalid(false).build());
    acc.setFontWeight('bold').setHorizontalAlignment('center');
    const rules = [
      ['Share', '#c8e6c9', '#1b5e20'], ['View only', '#fff59d', '#795548'], ['Hidden', '#e0e0e0', '#757575']
    ].map(([v, bg, fg]) => SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(v).setBackground(bg).setFontColor(fg).setRanges([acc]).build());
    sh.setConditionalFormatRules(rules);
  }
  sh.setFrozenRows(1); sh.setFrozenColumns(3);
  [110, 170, 240, 95, 300, 170, 90, 90, 70, 95, 260, 120, 70, 320].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, Math.max(out.length, 1) + 1, DOC_HEADERS.length).createFilter();
  PropertiesService.getScriptProperties().setProperty('DOCS_FOLDER_ID', csvFile.getParents().hasNext() ? csvFile.getParents().next().getId() : '');
  return out.length + ' documents imported';
}

function docRows() {
  const sh = docsSheet();
  if (!sh) return [];
  const v = sh.getDataRange().getValues();
  const rows = [];
  for (let r = 1; r < v.length; r++) {
    if (!String(v[r][10]).trim() && !String(v[r][11]).trim()) continue;
    rows.push({ row: r + 1, category: String(v[r][0]), products: String(v[r][1]).split(',').map(s => s.trim()).filter(String),
      type: String(v[r][3]), title: String(v[r][4]), marks: String(v[r][5]).split(',').map(s => s.trim()).filter(String),
      issuer: String(v[r][6]), date: String(v[r][7]), language: String(v[r][8]), access: String(v[r][9] || 'Hidden').trim(),
      fileName: String(v[r][10]), fileId: String(v[r][11]).trim(), source: String(v[r][12]) });
  }
  return rows;
}

// Stable id (doesn't change when the sheet is sorted or the Drive file ID gets filled in)
function docKey(d) { return d.fileName + '|' + d.products.join(','); }

/** Everything the app needs: the visible documents plus the certification marks per product. */
function listDocs() {
  const all = docRows();
  const certs = {};    // product -> { certified: [...], tested: [...] }
  all.forEach(d => {
    if (d.type !== 'Certificate' && d.type !== 'Test report') return;
    d.products.forEach(p => {
      const c = certs[p] || (certs[p] = { certified: [], tested: [] });
      d.marks.forEach(m => {
        const list = d.type === 'Certificate' ? c.certified : c.tested;
        if (list.indexOf(m) < 0) list.push(m);
      });
    });
  });
  Object.keys(certs).forEach(p => { certs[p].tested = certs[p].tested.filter(m => certs[p].certified.indexOf(m) < 0); });
  const docs = all.filter(d => d.access === 'Share' || d.access === 'View only').map(d => ({
    id: docKey(d), products: d.products, type: d.type, title: d.title, marks: d.marks, issuer: d.issuer, date: d.date,
    language: d.language, share: d.access === 'Share', fileName: d.fileName
  }));
  return { ok: true, message: docs.length + ' documents', docs: docs, certs: certs };
}

function findDocFile(d) {
  if (d.fileId) { try { return DriveApp.getFileById(d.fileId); } catch (e) { /* fall back to the name */ } }
  const folderId = PropertiesService.getScriptProperties().getProperty('DOCS_FOLDER_ID');
  const it = DriveApp.getFilesByName(d.fileName);
  let first = null;
  while (it.hasNext()) {
    const f = it.next();
    if (!first) first = f;
    if (folderId && isInside(f, folderId)) { first = f; break; }
  }
  if (first) docsSheet().getRange(d.row, 12).setValue(first.getId());   // remember it for next time
  return first;
}

function isInside(file, folderId) {
  let parents = file.getParents(), depth = 0;
  while (parents.hasNext() && depth < 6) {
    const p = parents.next();
    if (p.getId() === folderId) return true;
    parents = p.getParents(); depth++;
  }
  return false;
}

/** Sends one document (base64) to the app, if its Access allows it. Google Docs/Sheets are sent as PDF. */
function docFile(id) {
  const d = docRows().filter(x => docKey(x) === String(id))[0];
  if (!d || (d.access !== 'Share' && d.access !== 'View only')) return { ok: false, error: 'This document is not available' };
  const f = findDocFile(d);
  if (!f) return { ok: false, error: 'File not found in Drive yet: ' + d.fileName };
  let blob = f.getBlob(), name = f.getName();
  const mime = f.getMimeType();
  if (mime.indexOf('application/vnd.google-apps') === 0) { blob = f.getAs('application/pdf'); name = name + '.pdf'; }
  if (blob.getBytes().length > MAX_DOC_BYTES) return { ok: false, error: 'File too large for the app (' + Math.round(blob.getBytes().length / 1048576) + ' MB)' };
  return { ok: true, message: name, fileName: name, mimeType: blob.getContentType(), share: d.access === 'Share',
    data: Utilities.base64Encode(blob.getBytes()) };
}

