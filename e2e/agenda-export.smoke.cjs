// Uso: VITE_SUPABASE_URL=http://127.0.0.1:54399 VITE_SUPABASE_ANON_KEY=fake COAMO_BASE_PATH=/COAMO/ npx vite build
//      node e2e/agenda-export.smoke.cjs   (requiere Playwright con Chromium; VW=390 para móvil; SHOTS=<carpeta> para capturas)
// Prueba de humo E2E de Agenda, Proyecto y Exportación de investigación: build real con base /COAMO/ + API
// Supabase simulada en memoria (sin red ni datos reales). Valida la interfaz, NO la RLS ni los triggers
// (la exportación contra el esquema real y la RLS está en tests/researchExport.db.test.ts).
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
const today = new Date(); const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(today); const plus = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
const db = {
  coag_profiles: [{ id: UID, full_name: 'Investigadora prueba', role: 'investigator', is_active: true, must_change_password: false }],
  coag_centers: [{ id: 'c1', code: 'LAFE', name: 'Hospital La Fe', city: 'Valencia', center_role: 'recruiting', study_number: 1, is_active: true }],
  coag_center_memberships: [{ center_id: 'c1' }],
  coag_patients: [
    { id: 'p1', center_id: 'c1', study_code: 'COAMO-1-0001', center_seq: 1, age_at_inclusion: 40, sex: 'male', diagnosis: 'HA', status: 'included', status_reason: null, inclusion_date: '2026-01-10', status_changed_at: null, created_at: '2026-01-10T00:00:00Z', updated_at: '2026-01-10T00:00:00Z' },
    { id: 'p2', center_id: 'c1', study_code: 'COAMO-1-0002', center_seq: 2, age_at_inclusion: 55, sex: 'female', diagnosis: 'EVW', status: 'included', status_reason: null, inclusion_date: plus(-3), status_changed_at: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' }],
  coag_inclusions: [],
  coag_visits: [
    { id: 'v0', patient_id: 'p1', visit_type: 'baseline', visit_date: '2026-01-15', status: 'completed', modality: 'in_person', is_scheduled: true, created_at: '2026-01-15T00:00:00Z', updated_at: '2026-01-15T00:00:00Z' },
    { id: 'v1', patient_id: 'p1', visit_type: 'followup', visit_date: plus(-2), status: 'scheduled', modality: 'phone', is_scheduled: true, created_at: '2026-01-15T00:00:00Z', updated_at: '2026-01-15T00:00:00Z' },
    { id: 'v2', patient_id: 'p1', visit_type: 'followup', visit_date: plus(5), status: 'scheduled', modality: 'video', is_scheduled: true, created_at: '2026-01-15T00:00:00Z', updated_at: '2026-01-15T00:00:00Z' }],
  coag_patient_schedule: [{ patient_id: 'p1', baseline_date: '2026-01-15', final_due_date: '2027-01-15', final_window_start: '2026-12-15', final_window_end: '2027-02-15', final_date: null, final_status: null, final_deviation_days: null, final_in_window: null }],
  coag_clinical_assessments: [],
  coag_questionnaire_administrations: [],
  coag_stratifications: [{ id: 's1', visit_id: 'v0', model_version: 'CMO-COAG-SEFH-v2.0', status: 'completed', answers: { age: '18_50' }, suggestions: {}, clinical_source_visit_id: 'v0', raised_priority: null, result: {}, score: 21, score_min: 21, score_max: 21, model_priority: 2, final_priority: 2, revision: 1, last_corrected_at: null, completed_at: '2026-01-15T00:00:00Z', created_at: '2026-01-15T00:00:00Z', updated_at: '2026-01-15T00:00:00Z' }],
};
const writes = [];
function filterRows(rows, params) {
  return rows.filter((row) => [...params].every(([k, v]) => {
    if (['select', 'order', 'offset', 'limit', 'columns'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')).includes(String(row[k]));
    return true;
  }));
}
// Proyección mínima del select de PostgREST: columnas simples y el embebido coag_patients!inner(study_code).
function project(rows, select) {
  if (!select || select === '*') return rows;
  const embed = /coag_patients!inner\(([^)]*)\)/.exec(select);
  const cols = select.replace(/,?coag_patients!inner\([^)]*\)/, '').split(',').filter(Boolean);
  return rows.map((row) => {
    const out = Object.fromEntries(cols.map((c) => [c, row[c] ?? null]));
    if (embed) { const p = db.coag_patients.find((x) => x.id === row.patient_id); out.coag_patients = p ? Object.fromEntries(embed[1].split(',').map((c) => [c, p[c]])) : null; }
    return out;
  });
}
async function handle(route) {
  const req = route.request(); const url = new URL(req.url()); const m = req.method();
  if (url.pathname.startsWith('/auth/v1/user')) return route.fulfill({ json: { id: UID, email: 'i@test', aud: 'authenticated', role: 'authenticated' } });
  if (url.pathname.startsWith('/auth/')) return route.fulfill({ json: {} });
  const table = url.pathname.replace('/rest/v1/', '');
  const rows = db[table] || [];
  const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  if (m === 'HEAD') {
    const n = filterRows(rows, url.searchParams).length;
    return route.fulfill({ status: 200, headers: { 'content-range': `*/${n}`, 'access-control-expose-headers': 'content-range' }, body: '' });
  }
  let out;
  if (m === 'GET') {
    let all = filterRows(rows, url.searchParams);
    const order = url.searchParams.get('order');
    if (order) { const col = order.split('.')[0]; all = [...all].sort((a, b) => String(a[col]).localeCompare(String(b[col]))); }
    const range = req.headers()['range'];
    if (range) { const [from, to] = range.split('-').map(Number); all = all.slice(from, to + 1); }
    out = project(all, url.searchParams.get('select'));
  } else if (m === 'POST') {
    const body = JSON.parse(req.postData()); writes.push({ m, table, body });
    const row = { id: 'n' + (rows.length + 1), created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z', ...body };
    rows.push(row); out = [row];
  } else if (m === 'PATCH') {
    const body = JSON.parse(req.postData()); writes.push({ m, table, body, filter: url.search });
    const hits = filterRows(rows, url.searchParams); for (const r of hits) Object.assign(r, body); out = hits;
  }
  if (one) return out.length ? route.fulfill({ json: out[0] }) : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } });
  return route.fulfill({ json: out, headers: { 'content-range': `0-${Math.max(out.length - 1, 0)}/${out.length}` } });
}
const results = []; const ok = (cond, msg) => { if (process.env.TRACE) console.log(cond ? 'OK ' : 'FALLO', msg); results.push(`${cond ? 'OK ' : 'FALLO'} ${msg}`); if (!cond) process.exitCode = 1; };
const SHOTS = process.env.SHOTS || '/tmp';
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: Number(process.env.VW || 1280), height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(Number(process.env.STEP_TIMEOUT || 30000));
  const consoleErrors = []; page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  await page.route(API + '/**', handle);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp: 4102444800, role: 'authenticated', aud: 'authenticated' })}.sig`;
  await page.addInitScript(([jwt, uid]) => { if (!localStorage.getItem('coamo-auth')) localStorage.setItem('coamo-auth', JSON.stringify({ access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'i@test' } })); }, [jwt, UID]);
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  // ── Proyecto: dictamen del CEIm ──
  await page.goto('http://127.0.0.1:4181/COAMO/#/project');
  await page.getByRole('heading', { name: 'Marco del estudio' }).waitFor({ timeout: 15000 });
  const projectText = await page.locator('main').innerText();
  ok(projectText.includes('Nº de registro 2026-0810-1') && projectText.includes('CEIm del Hospital Universitario y Politécnico La Fe'), 'Proyecto: comité y nº de registro del dictamen');
  ok(projectText.includes('sesión de 21/10/2026') && projectText.includes('versión 2 de 25/09/2026') && projectText.includes('Tomás Palanques Pastor'), 'Proyecto: sesión, HIP/CI aprobada e IP');
  ok((await page.locator('.app-footer').innerText()).includes('2026-0810-1'), 'pie de la app con el informe favorable');
  await page.screenshot({ path: `${SHOTS}/project.png`, fullPage: true });
  ok(await noHScroll(), 'Proyecto sin scroll horizontal');

  // ── Agenda ──
  await page.goto('http://127.0.0.1:4181/COAMO/#/agenda');
  await page.getByRole('heading', { name: 'Listado de seguimiento' }).waitFor();
  ok(await page.locator('tbody tr').filter({ hasText: 'COAMO-1-0001' }).count() >= 1, 'agenda: visitas con el código del paciente (select embebido)');
  ok(await page.getByText('Programada vencida').first().isVisible(), 'agenda: la cita pasada sin cerrar figura como vencida');
  await page.getByRole('button', { name: 'Hoy' }).click();
  await page.locator('.agenda-create select').first().selectOption('p1');
  ok(await page.locator('.agenda-create select').nth(1).inputValue() === 'followup', 'agenda: tipo sugerido «seguimiento» (ya tiene basal; fuera de la ventana de la final)');
  ok(await page.getByText(/Prioridad 2 \(última estratificación completada\): valoración cada 6 meses/).isVisible(), 'agenda: periodicidad orientativa según la prioridad CMO vigente');
  ok(!(await page.locator('.agenda-create select').nth(1).locator('option[value="baseline"]').count()), 'agenda: no ofrece una segunda basal');
  await page.locator('.agenda-create select').first().selectOption('p2');
  ok(await page.locator('.agenda-create select').nth(1).inputValue() === 'baseline', 'agenda: paciente sin visitas → basal');
  await page.locator('.agenda-create select').nth(2).selectOption('phone');
  await page.getByRole('button', { name: 'Crear cita' }).click();
  await page.getByText(/Cita creada: COAMO-1-0002 · Visita basal/).waitFor();
  const post = writes.find((w) => w.m === 'POST' && w.table === 'coag_visits');
  ok(post && post.body.status === 'scheduled' && post.body.visit_date === TODAY && post.body.modality === 'phone' && post.body.visit_type === 'baseline', 'agenda: la cita se crea como visita programada (estado, fecha, tipo y modalidad)');
  await page.locator('.agenda-status-filter input').nth(1).check();
  ok(page.url().includes('status=overdue') && await page.locator('tbody tr').count() === 1, 'agenda: filtro por estado en la URL');
  await page.screenshot({ path: `${SHOTS}/agenda.png`, fullPage: true });
  ok(await noHScroll(), `agenda sin scroll horizontal (ancho ${process.env.VW || 1280})`);

  // ── Ficha: acceso a la agenda y reprogramación ──
  await page.goto('http://127.0.0.1:4181/COAMO/#/patients/p1');
  await page.getByRole('link', { name: 'Agenda del paciente' }).waitFor();
  const dateInput = page.locator('input[type=date][aria-label^="Fecha de la visita de seguimiento"]').last();
  await dateInput.fill(plus(9)); await dateInput.blur(); await page.waitForTimeout(300);
  const patch = writes.filter((w) => w.m === 'PATCH' && w.table === 'coag_visits').pop();
  ok(patch && patch.body.visit_date === plus(9) && patch.filter.includes('id=eq.v2'), 'ficha: reprogramar una cita actualiza solo la fecha de esa visita');

  // ── Exportación de investigación ──
  await page.goto('http://127.0.0.1:4181/COAMO/#/export');
  await page.getByRole('heading', { name: 'Exportación de datos' }).waitFor();
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.getByRole('button', { name: 'Exportar y descargar' }).click();
  await page.locator('.notice-success, .notice-danger').first().waitFor({ timeout: 30000 });
  const failure = page.locator('.notice-danger');
  if (await failure.count()) throw new Error(`Exportación fallida: ${await failure.first().innerText()}`);
  const dl = await downloadPromise;
  ok(/^coamo_export_\d{8}_\d{6}\.zip$/.test(dl.suggestedFilename()), `exportación: ZIP descargado (${dl.suggestedFilename()})`);
  const zip = fs.readFileSync(await dl.path());
  ok(zip.includes(Buffer.from('manifest.json')) && zip.includes(Buffer.from('analisis/wide_pacientes.csv')) && zip.includes(Buffer.from('coamo_export.xlsx')), 'exportación: el ZIP contiene manifiesto, WIDE y Excel');
  await page.getByText(/Exportación completada y verificada/).waitFor();
  ok(await page.getByText(/2 pacientes, \d+ visitas, 8 tablas conciliadas/).isVisible(), 'exportación: resumen con 8 tablas conciliadas');
  await page.screenshot({ path: `${SHOTS}/export.png`, fullPage: true });
  ok(await noHScroll(), 'exportación sin scroll horizontal');

  ok(consoleErrors.length === 0, `sin errores de consola${consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''}`);
  await browser.close(); server.close();
  console.log(results.join('\n'));
})().catch((error) => { console.error(error); console.log(results.join('\n')); process.exit(1); });
