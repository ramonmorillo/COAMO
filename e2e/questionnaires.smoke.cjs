// Uso: VITE_SUPABASE_URL=http://127.0.0.1:54399 VITE_SUPABASE_ANON_KEY=fake COAMO_BASE_PATH=/COAMO/ npx vite build
//      node e2e/questionnaires.smoke.cjs   (requiere Playwright con Chromium; VW=390 para móvil)
// La API de Supabase se simula en memoria: valida la interfaz, NO la RLS ni los triggers (ver db-tests/70_* en DERMAPEX).
// Prueba de humo E2E: build real con base /COAMO/ + API Supabase simulada en memoria (sin red ni datos reales).
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const DIST = process.env.COAMO_DIST || path.resolve(__dirname, '../dist'); const API = 'http://127.0.0.1:54399';
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/COAMO\/?/, '/');
  if (p === '/' ) p = '/index.html';
  const f = path.join(DIST, p);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'text/html' });
  fs.createReadStream(f).pipe(res);
}).listen(4180);

const UID = '11111111-1111-4111-8111-111111111111';
const db = {
  coag_profiles: [{ id: UID, full_name: 'Investigadora prueba', role: 'investigator', is_active: true, must_change_password: false }],
  coag_centers: [{ id: 'c1', code: 'LAFE', name: 'Hospital La Fe', center_role: 'recruiting', study_number: 1, is_active: true }],
  coag_center_memberships: [{ center_id: 'c1' }],
  coag_patients: [{ id: 'p1', center_id: 'c1', study_code: 'COAMO-1-0001', center_seq: 1, age_at_inclusion: 40, sex: 'male', diagnosis: 'HA', status: 'included', status_reason: null, inclusion_date: '2026-01-10', created_at: '2026-01-10' }],
  coag_inclusions: [{ patient_id: 'p1', inc_age_18: true, inc_diagnosis: true, inc_written_consent: true, inc_no_limiting_condition: true, inc_hospital_pharmacy_followup: true, exc_unable_without_support: false, exc_unable_visits: false, exc_interfering_trial: false, questionnaire_support: 'none', consent_date: '2026-01-10', consent_version: 'v1', verified_in_clinical_record: true }],
  coag_visits: [
    { id: 'v0', patient_id: 'p1', visit_type: 'baseline', visit_date: '2026-01-15', status: 'completed', modality: 'in_person', is_scheduled: true },
    { id: 'vf', patient_id: 'p1', visit_type: 'final', visit_date: '2026-10-20', status: 'completed', modality: 'in_person', is_scheduled: true }],
  coag_patient_schedule: [{ patient_id: 'p1', baseline_date: '2026-01-15', final_due_date: '2027-01-15', final_window_start: '2026-12-15', final_window_end: '2027-02-15', final_date: '2026-10-20', final_status: 'completed', final_deviation_days: -87, final_in_window: false }],
  coag_clinical_assessments: [{ visit_id: 'v0', treatment_regimen: 'prophylaxis', treatment_type: 'recombinant_extended' }],
  coag_questionnaire_administrations: [],
  coag_stratifications: [],
  coag_audit_log: [],
};
const writes = [];
function scores(code, r) {
  if (code === 'IEXPAC') { const ks = Array.from({length: 11}, (_, i) => 'q' + (i + 1)); const n = ks.filter(k => k in r).length; const s = ks.reduce((a, k) => a + (r[k] || 0), 0);
    return { items_expected: 11, items_answered: n, complete: n === 11, sum: n === 11 ? s : null, global_0_10: n === 11 ? Math.round(10 * (s - 11) / 44 * 1e4) / 1e4 : null, conditional_applicable: 0, conditional_answered: 0 }; }
  if (code === 'EQ5D3L') { const d = ['mobility','self_care','usual_activities','pain_discomfort','anxiety_depression']; const n = d.filter(k => k in r).length;
    return { dimensions_answered: n, profile_complete: n === 5, profile: n === 5 ? d.map(k => r[k]).join('') : null, vas: 'vas' in r ? r.vas : null, utility_index: null }; }
  return { items_answered: Object.keys(r).length, complete: false };
}
// Cálculo mínimo de la estratificación (HA) para simular lo que fija la BD (coag_private.stratification_result).
const SP = { age: { lt18: 0, '18_50': 1, gt50: 2 }, obesity: { yes: 1, no: 0 }, inhibitors: { yes: 3, no: 0 }, pain: { none: 0, mild_moderate: 1, persistent: 2, acute: 3 },
  joint_status: { yes: 3, no: 0 }, bleeding_management: { none: 0, hospital_admission: 2, outpatient: 3 }, hemophilia_severity: { mild: 0, moderate: 1, severe: 3 },
  spontaneous_bleeds_gt2: { yes: 4, no: 0 }, comorbidity: { yes: 1, no: 0 }, degenerative_joint: { yes: 2, no: 0 }, psychological: { yes: 3, no: 0 },
  advanced_therapy: { yes: 0, no: 0 }, route: { sc_only: 0, sc_iv: 1, iv: 2 }, dose_change: { yes: 2, no: 0 }, extra_doses: { yes: 3, no: 0 },
  home_dispensing: { yes: 1, no: 0 }, prophylaxis: { yes: 3, no: 0 }, non_adherence: { yes: 4, no: 0 }, socioeconomic: { yes: 3, no: 0 },
  intense_activity: { yes: 1, no: 0 }, cv_risk: { yes: 2, no: 0 }, access_difficulty: { yes: 2, no: 0 }, limited_knowledge: { yes: 3, no: 0 },
  transition: { yes: 4, no: 0 }, low_qol: { yes: 1, no: 0 } };
function strat(row) {
  const a = row.answers || {}; let mn = 0, mx = 0;
  for (const [k, o] of Object.entries(SP)) { if (a[k] in o) { mn += o[a[k]]; mx += o[a[k]]; } else mx += Math.max(...Object.values(o)); }
  const pr = s => (s >= 28 ? 1 : s >= 20 ? 2 : 3);
  const mp = a.advanced_therapy === 'yes' ? 1 : a.age && a.advanced_therapy && pr(mn) === pr(mx) ? pr(mn) : null;
  return { score_min: mn, score_max: mx, score: mn === mx ? mn : null, model_priority: mp, final_priority: row.raised_priority ?? mp, model_version: 'CMO-COAG-SEFH-v2.0' };
}
function filterRows(rows, params) {
  return rows.filter(row => [...params].every(([k, v]) => {
    if (['select', 'order', 'offset', 'limit'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map(x => x.replace(/"/g, '')).includes(String(row[k]));
    return true; }));
}
async function handle(route) {
  const req = route.request(); const url = new URL(req.url()); const m = req.method();
  if (url.pathname.startsWith('/auth/v1/user')) return route.fulfill({ json: { id: UID, email: 'i@test', aud: 'authenticated', role: 'authenticated' } });
  if (url.pathname.startsWith('/auth/')) return route.fulfill({ json: {} });
  const table = url.pathname.replace('/rest/v1/', '');
  const rows = db[table] || [];
  const accept = req.headers()['accept'] || '';
  const one = accept.includes('vnd.pgrst.object');
  let out;
  if (m === 'GET') out = filterRows(rows, url.searchParams);
  else if (m === 'POST') {
    const body = JSON.parse(req.postData()); writes.push({ m, table, body });
    if (table === 'coag_questionnaire_administrations' && rows.some(r => r.visit_id === body.visit_id && r.instrument_code === body.instrument_code))
      return route.fulfill({ status: 409, json: { code: '23505', message: 'duplicate' } });
    const row = { id: 'a' + (rows.length + 1), revision: 1, instrument_version: body.instrument_code === 'EQ5D3L' ? (body.administration_mode === 'interviewer' ? 'EQ-5D-3L-ES-ES-v1.0-interviewer' : 'EQ-5D-3L-ES-ES-v2.0-self') : 'v-test',
      scores: scores(body.instrument_code, body.responses || {}), last_correction_reason: null, last_corrected_at: null, completed_at: body.status === 'completed' ? '2026-10-26' : null, created_at: '', updated_at: '', ...body };
    if (table === 'coag_stratifications') { delete row.instrument_version; delete row.scores; Object.assign(row, strat(row)); }
    rows.push(row); out = [row];
  } else if (m === 'PATCH') {
    const body = JSON.parse(req.postData()); writes.push({ m, table, body, filter: url.search });
    const hits = filterRows(rows, url.searchParams);
    for (const r of hits) {
      if (r.status === 'completed' && !body.correction_reason) return route.fulfill({ status: 400, json: { message: 'Este cuestionario está completado: indique el motivo de la corrección.' } });
      Object.assign(r, body); r.revision += 1;
      if (table === 'coag_stratifications') Object.assign(r, strat(r)); else r.scores = scores(r.instrument_code, r.responses || {});
      if (body.correction_reason) { r.last_correction_reason = body.correction_reason; r.last_corrected_at = '2026-10-26T10:00:00Z'; }
      delete r.correction_reason; if (r.status === 'completed' && !r.completed_at) r.completed_at = '2026-10-26';
    }
    out = hits;
  }
  if (one) return out.length ? route.fulfill({ json: out[0] }) : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } });
  return route.fulfill({ json: out, headers: { 'content-range': `0-${Math.max(out.length - 1, 0)}/${out.length}` } });
}
const results = []; const ok = (cond, msg) => { results.push(`${cond ? 'OK ' : 'FALLO'} ${msg}`); if (!cond) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: Number(process.env.VW||1280), height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = []; page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  await page.route(API + '/**', handle);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp: 4102444800, role: 'authenticated', aud: 'authenticated' })}.sig`;
  await page.addInitScript(([jwt, uid]) => { if (!localStorage.getItem('coamo-auth')) localStorage.setItem('coamo-auth', JSON.stringify({ access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'i@test' } })); }, [jwt, UID]);

  await page.goto('http://127.0.0.1:4180/COAMO/#/patients/p1');
  await page.getByText('Cuestionarios y resultados comunicados por el paciente').waitFor({ timeout: 15000 });
  ok(true, 'ficha: apartado «Cuestionarios y resultados comunicados por el paciente» visible (base /COAMO/, HashRouter)');
  ok(await page.locator('tbody tr').filter({ hasText: 'Variable principal' }).count() === 1, 'IEXPAC destacado como variable principal');
  await page.getByRole('link', { name: 'IEXPAC en V0 · Visita basal' }).click();
  await page.getByRole('heading', { name: 'IEXPAC', exact: true }).waitFor();
  await page.getByLabel('Autoadministrado', { exact: true }).check();
  for (let i = 1; i <= 5; i++) await page.locator(`input[name="item-q${i}"][value="4"]`).check();
  ok((await page.locator('.coamo-q-progress-label').innerText()).startsWith('5 / 11'), 'progreso 5/11');
  ok(await page.getByText('IEXPAC global: no calculable').isVisible(), 'parcial: sin global (no se imputa)');
  let dialogSeen = false; page.once('dialog', async (d) => { dialogSeen = true; await d.dismiss(); });
  await page.getByRole('link', { name: 'Volver a la ficha' }).click(); await page.waitForTimeout(300);
  ok(dialogSeen && await page.getByRole('heading', { name: 'IEXPAC', exact: true }).isVisible(), 'aviso de cambios sin guardar al salir; se permanece en el formulario');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await page.getByText(/Guardado: en curso/).waitFor();
  ok(true, 'borrador guardado en la BD (estado en curso)');
  await page.reload(); await page.getByRole('heading', { name: 'IEXPAC', exact: true }).waitFor();
  ok(await page.locator('input[name="item-q3"][value="4"]').isChecked() && !(await page.locator('input[name="item-q6"]:checked').count()), 'recuperación del borrador tras recargar: respuestas conservadas, no respondidas siguen vacías');
  for (let i = 6; i <= 11; i++) await page.locator(`input[name="item-q${i}"][value="5"]`).check();
  await page.locator('input[name="item-q12-applies"]').first().check();
  await page.locator('input[name="item-q12"][value="2"]').check();
  ok((await page.locator('.questionnaire-result').innerText()).includes('Suma ítems 1-11: 50'), 'vista previa: suma 50 (5×4 + 6×5), condicionado excluido');
  ok((await page.locator('.questionnaire-result').innerText()).includes('8,86'), 'vista previa: global 8,86 = 10×39/44');
  await page.getByRole('button', { name: 'Guardar y marcar como completado' }).click();
  await page.getByText(/Guardado: completado \(revisión 2\)/).waitFor();
  ok(await page.locator('input[name="item-q1"]').first().isDisabled(), 'completado: formulario bloqueado');
  await page.getByRole('button', { name: 'Corregir cuestionario completado' }).click();
  await page.locator('input[name="item-q1"][value="5"]').check();
  await page.getByRole('button', { name: 'Guardar corrección' }).click();
  ok(await page.getByText(/motivo de la corrección/).first().isVisible(), 'corrección sin motivo: bloqueada en la interfaz');
  await page.getByLabel(/Motivo de la corrección/).fill('Error de transcripción del papel');
  await page.getByRole('button', { name: 'Guardar corrección' }).click();
  await page.getByText(/revisión 3/).waitFor();
  ok(await page.getByText('Última corrección').isVisible(), 'corrección guardada con motivo visible (revisión 3)');
  const patch = writes.filter(w => w.m === 'PATCH').pop();
  ok(patch.filter.includes('revision=eq.2') && patch.body.correction_reason, 'la actualización exige la revisión cargada (control de concurrencia) y envía el motivo');
  await page.screenshot({ path: '' + (process.env.SHOTS || '/tmp') + '/form.png', fullPage: true });
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `sin scroll horizontal en el formulario (ancho ${process.env.VW||1280})`);

  await page.goto('http://127.0.0.1:4180/COAMO/#/visits/v0/questionnaires/VERITAS_PRN');
  await page.getByRole('heading', { name: 'VERITAS-PRN' }).waitFor();
  ok(await page.getByText(/el régimen no es a demanda/).isVisible(), 'VERITAS-PRN: aviso de aplicabilidad por régimen en profilaxis (sin imponer)');
  ok(await page.locator('input[type=radio][name^="item-q"]').count() === 120, 'VERITAS-PRN: 24 ítems × 5 opciones');
  await page.goto('http://127.0.0.1:4180/COAMO/#/visits/v0/questionnaires/VERITAS_PRO');
  await page.getByRole('heading', { name: 'VERITAS-Pro' }).waitFor();
  ok(await page.locator('input[type=radio][name^="item-q"]').count() === 120, 'VERITAS-Pro: 24 ítems × 5 opciones');
  ok(await page.getByText('Realizo las infusiones de profilaxis los días programados.').isVisible(), 'VERITAS-Pro: ítem 1 literal del documento');
  ok(await page.getByText(/Régimen en profilaxis registrado/).isVisible(), 'VERITAS-Pro: régimen en profilaxis reconocido');
  await page.locator('fieldset label', { hasText: 'Estado' }).locator('select').selectOption('not_applicable');
  await page.locator('fieldset label', { hasText: 'Motivo' }).locator('select').selectOption('regimen_mismatch');
  await page.getByRole('button', { name: 'Registrar como no aplicable' }).click();
  await page.getByText(/Guardado: no aplicable/).waitFor();
  ok(true, 'VERITAS-Pro registrado como no aplicable con motivo');

  await page.goto('http://127.0.0.1:4180/COAMO/#/visits/vf/questionnaires/EQ5D3L');
  await page.getByText('Elija primero la modalidad de administración.').waitFor();
  await page.getByLabel('Por entrevista con profesional (v1.0)').check();
  ok(await page.getByText('Primero, me gustaría preguntarle sobre la MOVILIDAD').isVisible(), 'EQ-5D-3L por entrevista: texto v1.0');
  for (const d of ['mobility','self_care','usual_activities','pain_discomfort','anxiety_depression']) await page.locator(`input[name="item-${d}"][value="1"]`).check();
  await page.getByLabel('SU ESTADO DE SALUD HOY =').fill('0');
  ok((await page.locator('.questionnaire-result').innerText()).includes('Perfil: 11111 · EVA: 0'), 'EQ-5D: perfil 11111 y EVA 0 válida');
  await page.getByRole('button', { name: 'Guardar y marcar como completado' }).click();
  await page.getByText(/Guardado: completado/).waitFor();
  ok(writes.some(w => w.body.instrument_code === 'EQ5D3L' && w.body.administration_mode === 'interviewer' && w.body.responses.vas === 0), 'EQ-5D: modalidad entrevista y EVA 0 enviadas');

  await page.goto('http://127.0.0.1:4180/COAMO/#/patients/p1/questionnaires');
  await page.getByRole('heading', { name: 'Evolución de cuestionarios V0–VF' }).waitFor();
  ok(await page.getByText('IEXPAC VF: pendiente', { exact: false }).count() > 0 || await page.getByText(/IEXPAC · VF: Pendiente/).count() > 0, 'evolución: identifica cuestionarios pendientes');
  ok(await page.getByText('Requiere V0 y VF completos (11 ítems)').isVisible(), 'evolución: sin Δ IEXPAC sin par completo');
  await page.screenshot({ path: '' + (process.env.SHOTS || '/tmp') + '/evolution.png', fullPage: true });
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin scroll horizontal en la evolución');

  await page.goto('http://127.0.0.1:4180/COAMO/#/questionnaires/export');
  await page.getByRole('heading', { name: 'Exportación de cuestionarios' }).waitFor();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar' }).first().click()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  const lines = csv.trim().split('\r\n');
  ok(lines[0].startsWith('study_code,center_code,diagnosis') && lines.length === 3, 'CSV ancho: cabecera estable y 2 filas (V0, VF)');
  const head = lines[0].split(','); const v0 = lines[1].split(',');
  ok(v0[head.indexOf('iexpac_global')] === '9.0909' && v0[head.indexOf('iexpac_q12')] === '2' && v0[head.indexOf('vpro_status')] === 'not_applicable', 'CSV: global corregido 9,0909 (suma 51), ítem condicionado y estado VERITAS-Pro');

  // Estratificación CMO (modelo SEFH v2.0): VF sin datos clínicos propios → propuestas desde V0, cálculo y elevación.
  await page.goto('http://127.0.0.1:4180/COAMO/#/patients/p1');
  await page.getByRole('link', { name: 'Estratificación CMO' }).first().waitFor();
  ok(await page.getByRole('link', { name: 'Estratificación CMO' }).count() === 2, 'ficha: estratificación disponible en cada visita realizada');
  await page.goto('http://127.0.0.1:4180/COAMO/#/visits/vf/stratification');
  await page.getByRole('heading', { name: /Estratificación CMO/ }).waitFor();
  ok(await page.getByText(/esta visita no tiene datos clínicos propios/).isVisible(), 'estratificación: propuestas tomadas de V0 y señaladas');
  ok(await page.getByText(/sin determinar/).isVisible(), 'estratificación: sin respuestas suficientes no asigna nivel');
  const pick = (id, index) => page.locator(`input[name="strat-${id}"]`).nth(index).check();
  const plan = { hemophilia_severity: 2, route: 2, non_adherence: 0, limited_knowledge: 0, cv_risk: 0, obesity: 0, spontaneous_bleeds_gt2: 0, pain: 0, bleeding_management: 0 };
  const yesNo = ['inhibitors', 'joint_status', 'comorbidity', 'degenerative_joint', 'psychological', 'advanced_therapy', 'dose_change', 'extra_doses',
    'home_dispensing', 'socioeconomic', 'intense_activity', 'access_difficulty', 'transition', 'low_qol'];
  for (const id of yesNo) await pick(id, 1);
  for (const [id, index] of Object.entries(plan)) await pick(id, index);
  const resultText = await page.locator('#strat-result').locator('..').innerText();
  ok(/Puntuación: 23/.test(resultText) && /Prioridad 2/.test(resultText) && /cada 6 meses/.test(resultText), 'estratificación: 23 puntos → Prioridad 2, valoración cada 6 meses');
  await page.getByLabel(/Elevar el nivel/).selectOption('1');
  ok(await page.getByText('Indique el motivo de la elevación de nivel.', { exact: true }).isVisible(), 'elevación de nivel: exige motivo');
  ok(await page.getByText(/elevado desde Prioridad 2/).isVisible(), 'elevación de nivel: Prioridad 1 con nivel del modelo visible');
  const confirm = page.getByRole('button', { name: 'Confirmar estratificación' });
  ok(await confirm.isDisabled() && await page.getByText(/motivo de la reestratificación \(mínimo/).isVisible(), 'reestratificación (VF): no se confirma sin motivos');
  await page.getByLabel(/Motivo de la elevación/).fill('Inicio de terapia no sustitutiva');
  await page.getByLabel(/Motivo de la reestratificación/).fill('Cambio de tratamiento');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin scroll horizontal en la estratificación');
  await page.screenshot({ path: '' + (process.env.SHOTS || '/tmp') + '/stratification.png', fullPage: true });
  await confirm.click();
  await page.getByText('Estratificación confirmada: Prioridad 1.').waitFor();
  const sw = writes.filter(w => w.table === 'coag_stratifications').pop();
  ok(sw.m === 'POST' && sw.body.status === 'completed' && sw.body.clinical_source_visit_id === 'v0' && Object.keys(sw.body.answers).length === 25
    && sw.body.raised_priority === 1 && sw.body.restratification_reason === 'Cambio de tratamiento' && sw.body.suggestions.prophylaxis.value === 'yes'
    && !('model_priority' in sw.body) && !('score' in sw.body),
    'guardado: respuestas, propuestas con procedencia, origen V0, elevación y motivo; el cliente no envía puntuaciones');
  ok(await page.getByRole('button', { name: 'Corregir' }).isVisible() && await page.locator('input[name="strat-route"]').first().isDisabled(), 'confirmada: bloqueada hasta «Corregir»');
  await page.getByRole('button', { name: 'Corregir' }).click();
  await pick('cv_risk', 1);
  ok(await page.getByRole('button', { name: 'Guardar corrección' }).isDisabled(), 'corrección: exige motivo');
  await page.getByLabel(/Motivo de la corrección/).fill('Revisado con la HCE');
  await page.getByRole('button', { name: 'Guardar corrección' }).click();
  await page.getByText('Estratificación confirmada: Prioridad 1.').waitFor();
  const cw = writes.filter(w => w.table === 'coag_stratifications').pop();
  ok(cw.m === 'PATCH' && cw.filter.includes('revision=eq.1') && cw.body.correction_reason === 'Revisado con la HCE' && cw.body.answers.cv_risk === 'no',
    'corrección: con motivo y control de concurrencia (revisión cargada)');
  await page.goto('http://127.0.0.1:4180/COAMO/#/patients/p1');
  await page.getByText(/· Prioridad 1/).waitFor();
  ok(true, 'ficha: prioridad asignada visible junto a la visita');

  await page.goto('http://127.0.0.1:4180/COAMO/#/dashboard');
  await page.getByText('Cumplimiento de cuestionarios').waitFor();
  ok(await page.getByText('Pacientes con V0 completa').isVisible(), 'cuadro de mando: indicadores de cumplimiento');
  await page.screenshot({ path: '' + (process.env.SHOTS || '/tmp') + '/dashboard.png', fullPage: true });

  const keys = await page.evaluate(() => Object.keys(localStorage));
  ok(keys.length === 1 && keys[0] === 'coamo-auth', `localStorage solo contiene la sesión (${keys.join(',')}); ningún dato clínico`);
  ok(consoleErrors.length === 0, `sin errores de consola (${consoleErrors.slice(0, 3).join(' | ')})`);
  console.log(results.join('\n'));
  await browser.close(); server.close();
})().catch((e) => { console.log(results.join('\n')); console.error(e); process.exit(1); });
