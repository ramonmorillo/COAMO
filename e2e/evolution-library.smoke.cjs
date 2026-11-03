// Uso: VITE_SUPABASE_URL=http://127.0.0.1:54399 VITE_SUPABASE_ANON_KEY=fake COAMO_BASE_PATH=/COAMO/ npx vite build
//      node e2e/evolution-library.smoke.cjs   (Playwright con Chromium)
// API de Supabase simulada en memoria con datos sintéticos: valida la interfaz (guardado, fallo de guardado,
// concurrencia, copia para la historia clínica, VERITAS-Pro y biblioteca), NO la RLS ni los triggers
// (ver db-tests/71_* y 72_* en DERMAPEX).
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const DIST = process.env.COAMO_DIST || path.resolve(__dirname, '../dist'); const API = 'http://127.0.0.1:54399';
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/COAMO\/?/, '/');
  if (p === '/') p = '/index.html';
  const f = path.join(DIST, p);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'text/html' });
  fs.createReadStream(f).pipe(res);
}).listen(4181);

const UID = '11111111-1111-4111-8111-111111111111';
const db = {
  coag_profiles: [{ id: UID, full_name: 'Investigadora prueba', role: 'investigator', is_active: true, must_change_password: false }],
  coag_centers: [{ id: 'c1', code: 'LAFE', name: 'Hospital La Fe', center_role: 'recruiting', study_number: 1, is_active: true }],
  coag_center_memberships: [{ center_id: 'c1' }],
  coag_patients: [{ id: 'p1', center_id: 'c1', study_code: 'COAMO-1-0001', center_seq: 1, age_at_inclusion: 40, sex: 'male', diagnosis: 'HA', status: 'included', status_reason: null, inclusion_date: '2026-01-10', created_at: '2026-01-10' }],
  coag_inclusions: [{ patient_id: 'p1', inc_age_18: true, inc_diagnosis: true, inc_written_consent: true, inc_no_limiting_condition: true, inc_hospital_pharmacy_followup: true, exc_unable_without_support: false, exc_unable_visits: false, exc_interfering_trial: false, questionnaire_support: 'none', consent_date: '2026-01-10', consent_version: 'v1', verified_in_clinical_record: true }],
  coag_visits: [{ id: 'v0', patient_id: 'p1', visit_type: 'baseline', visit_date: '2026-01-15', status: 'completed', modality: 'in_person', is_scheduled: true }],
  coag_patient_schedule: [],
  coag_clinical_assessments: [{ visit_id: 'v0', treatment_regimen: 'prophylaxis', treatment_type: 'recombinant_extended' }],
  coag_questionnaire_administrations: [],
  coag_stratifications: [{ id: 's1', visit_id: 'v0', model_version: 'CMO-COAG-SEFH-v2.0', status: 'completed', answers: {}, suggestions: {}, clinical_source_visit_id: null,
    raised_priority: null, raised_reason: null, restratification_reason: null, score: 22, score_min: 22, score_max: 22, model_priority: 2, final_priority: 2, revision: 1,
    last_correction_reason: null, last_corrected_at: null, completed_at: '2026-01-15', updated_at: '' }],
  coag_visit_evolutions: [],
  coag_audit_log: [],
};
let failNextEvolutionWrite = false;
const REV_PRO = [6, 7, 11, 13, 14, 16, 17, 18, 19, 20, 23];
function filterRows(rows, params) {
  return rows.filter(row => [...params].every(([k, v]) => {
    if (['select', 'order', 'offset', 'limit', 'columns'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map(x => x.replace(/"/g, '')).includes(String(row[k]));
    return true; }));
}
function veritasScores(r) {
  const n = Object.keys(r).length; const item = {}; let t = 0;
  for (const [k, v] of Object.entries(r)) { const i = Number(k.slice(1)); item[k] = REV_PRO.includes(i) ? 6 - v : v; t += item[k]; }
  return { items_expected: 24, items_answered: n, complete: n === 24, item_scores: item, total: n === 24 ? t : null, block_items_answered: {} };
}
async function handle(route) {
  const req = route.request(); const url = new URL(req.url()); const m = req.method();
  if (url.pathname.startsWith('/auth/v1/user')) return route.fulfill({ json: { id: UID, email: 'i@test', aud: 'authenticated', role: 'authenticated' } });
  if (url.pathname.startsWith('/auth/')) return route.fulfill({ json: {} });
  const table = url.pathname.replace('/rest/v1/', '');
  const rows = db[table] || (db[table] = []);
  const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  let out;
  if (m === 'GET') out = filterRows(rows, url.searchParams);
  else if (m === 'POST' || m === 'PATCH') {
    const body = JSON.parse(req.postData());
    if (table === 'coag_visit_evolutions' && failNextEvolutionWrite) { failNextEvolutionWrite = false; return route.fulfill({ status: 503, json: { message: 'Servicio no disponible (simulado)' } }); }
    if (m === 'POST') {
      const row = { id: 'r' + (rows.length + 1), revision: 1, created_by: UID, updated_by: UID, created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-03T10:00:00Z', ...body };
      if (table === 'coag_questionnaire_administrations') Object.assign(row, { instrument_version: 'VERITAS-Pro-ES-COAMO-2026-10-27', scoring_version: 'coamo-q-2', scores: veritasScores(body.responses || {}) });
      rows.push(row); out = [row];
    } else {
      const hits = filterRows(rows, url.searchParams);
      for (const r of hits) { Object.assign(r, body); r.revision += 1; r.updated_at = '2026-11-03T11:00:00Z'; if (table === 'coag_questionnaire_administrations') r.scores = veritasScores(r.responses || {}); }
      out = hits;
    }
  }
  if (one) return out.length ? route.fulfill({ json: out[0] }) : (m === 'GET' ? route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }) : route.fulfill({ json: null }));
  return route.fulfill({ json: out, headers: { 'content-range': `0-${Math.max(out.length - 1, 0)}/${out.length}` } });
}
const results = []; const ok = (cond, msg) => { results.push(`${cond ? 'OK ' : 'FALLO'} ${msg}`); if (!cond) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: Number(process.env.VW || 1280), height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4181' });
  const page = await ctx.newPage();
  const consoleErrors = []; page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('dialog', (d) => d.accept());
  await page.route(API + '/**', handle);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp: 4102444800, role: 'authenticated', aud: 'authenticated' })}.sig`;
  await page.addInitScript(([jwt, uid]) => { if (!localStorage.getItem('coamo-auth')) localStorage.setItem('coamo-auth', JSON.stringify({ access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'i@test' } })); }, [jwt, UID]);
  const base = 'http://127.0.0.1:4181/COAMO/#';

  // ── Evolución farmacéutica ──
  await page.goto(`${base}/patients/p1`);
  await page.getByRole('link', { name: 'Evolución farmacéutica' }).first().click();
  await page.getByRole('heading', { name: 'Evolución farmacéutica', level: 1 }).waitFor({ timeout: 15000 });
  ok(true, 'enlace «Evolución farmacéutica» desde la visita de la ficha');
  const area = page.locator('#evo-text');
  await area.fill('Paciente estable, sin sangrados. Se refuerza la técnica de autoadministración.');
  failNextEvolutionWrite = true;
  await page.getByRole('button', { name: 'Guardar evolución' }).click();
  await page.getByText('Servicio no disponible (simulado)').waitFor();
  ok(db.coag_visit_evolutions.length === 0 && !(await page.getByText(/Evolución guardada/).isVisible()), 'guardado fallido: se muestra el error, no «guardada», y no hay fila');
  ok((await area.inputValue()).startsWith('Paciente estable'), 'guardado fallido: el texto sigue en pantalla');
  ok(await page.getByRole('button', { name: 'Copiar evolución para historia clínica' }).isDisabled(), 'no se puede copiar lo que no está guardado');
  await page.getByRole('button', { name: 'Guardar evolución' }).click();
  await page.getByText('Evolución guardada (revisión 1).').waitFor();
  ok(db.coag_visit_evolutions.length === 1 && db.coag_visit_evolutions[0].visit_id === 'v0', 'guardado real: una fila asociada a la visita');
  await page.getByRole('button', { name: 'Copiar evolución para historia clínica' }).click();
  await page.getByText(/Texto copiado/).waitFor();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(clip.includes('EVOLUCIÓN FARMACÉUTICA') && clip.includes('Fecha: 15/01/2026 · Visita basal · Presencial') && clip.includes('prioridad 2 (puntuación 22'), 'texto copiado: encabezado, fecha, visita y estratificación');
  ok(!clip.includes('COAMO-1-0001'), 'texto copiado sin el código de estudio');
  // Concurrencia: otra persona guarda antes (revisión 2 en la BD) → no se sobrescribe.
  db.coag_visit_evolutions[0].revision = 2; db.coag_visit_evolutions[0].evolution_text = 'Cambio de otra persona';
  await area.fill('Mi cambio tardío');
  await page.getByRole('button', { name: 'Guardar evolución' }).click();
  await page.getByText(/Otra persona ha modificado esta evolución/).waitFor();
  ok(db.coag_visit_evolutions[0].evolution_text === 'Cambio de otra persona', 'concurrencia: no se sobrescribe el cambio ajeno');
  await page.reload();
  await page.locator('#evo-text').waitFor();
  ok((await page.locator('#evo-text').inputValue()) === 'Cambio de otra persona', 'recuperación tras recargar: texto de la BD');

  // ── VERITAS-Pro: guardar respuestas y ver el total ──
  await page.goto(`${base}/visits/v0/questionnaires/VERITAS_PRO`);
  await page.getByRole('heading', { name: 'VERITAS-Pro' }).waitFor();
  for (let i = 1; i <= 24; i++) await page.locator(`input[type=radio][name="item-q${i}"]`).first().check();
  ok(await page.getByText(/VERITAS-Pro total \(24-120; menor = mayor adherencia\): 68/).isVisible(), 'VERITAS-Pro: vista previa del total con la clave (todo «Siempre» = 68)');

  // ── EVASAF: comentarios ──
  await page.goto(`${base}/visits/v0/questionnaires/EVASAF`);
  await page.getByRole('heading', { name: 'EVASAF' }).waitFor();
  ok(await page.getByLabel('Comentarios:').isVisible(), 'EVASAF: apartado «Comentarios:» del documento actualizado');
  await page.locator('input[type=radio][name="item-q1"]').first().check();
  await page.getByLabel('Comentarios:').fill('  Muy bien atendido.\nGracias.  ');
  await page.getByRole('button', { name: /Guardar borrador/ }).click();
  await page.waitForTimeout(800);
  const evasaf = db.coag_questionnaire_administrations.find((r) => r.instrument_code === 'EVASAF');
  ok(evasaf && evasaf.comments === 'Muy bien atendido.\nGracias.', 'EVASAF: el comentario se envía recortado y se guarda');
  await page.reload();
  await page.getByLabel('Comentarios:').waitFor();
  ok((await page.getByLabel('Comentarios:').inputValue()) === 'Muy bien atendido.\nGracias.', 'EVASAF: el comentario se recupera tras recargar');

  // ── Biblioteca ──
  await page.goto(`${base}/project`);
  await page.getByRole('heading', { name: 'Documentación y cuestionarios' }).waitFor();
  ok(await page.getByText('Protocolo de 30/08/2026 (el dictamen no indica número de versión)').isVisible(), 'registro documental: protocolo aprobado identificado');
  ok(await page.getByRole('link', { name: 'Versión imprimible (PDF)' }).count() === 4, 'cuatro versiones imprimibles (EQ-5D-3L excluido por licencia)');
  await page.goto(`${base}/documents/questionnaires/VERITAS_PRN/print`);
  await page.getByText('Me administro una infusión cuando aparecen síntomas de sangrado.', { exact: false }).first().waitFor();
  ok(await page.getByText(/PMID: 19754842/).isVisible(), 'imprimible VERITAS-PRN con referencia bibliográfica');
  await page.goto(`${base}/documents/questionnaires/EQ5D3L/print`);
  ok(await page.getByText('Versión imprimible no disponible').isVisible(), 'EQ-5D-3L: sin versión imprimible propia');
  ok(!(await page.evaluate(() => Object.keys(localStorage).some((k) => k !== 'coamo-auth'))), 'nada clínico en localStorage');

  ok(consoleErrors.filter((e) => !/406|Failed to load resource/.test(e)).length === 0, `sin errores de consola (${consoleErrors.join(' | ')})`);
  console.log(results.join('\n'));
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exitCode = 1; server.close(); });
