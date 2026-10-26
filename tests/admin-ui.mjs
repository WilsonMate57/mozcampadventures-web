/**
 * MOZ CAMP ADVENTURES — tests/admin-ui.mjs
 * Teste da interface do painel no Chrome (CDP) — SÓ em desenvolvimento.
 *   API_BASE, PHP_CLI, MCA_CONFIG (ver tests/admin.mjs); SHOTS=<pasta> para capturas.
 */

import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.API_BASE || 'http://localhost:8791';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = process.env.SHOTS;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const run = Math.random().toString(36).slice(2, 8);
const PASS = 'Painel-teste-2026';
const cliUser = (n, e, r) => execSync(`${process.env.PHP_CLI} api/bin/create-user.php "${n}" ${e} ${r}`, { encoding: 'utf8' }).match(/token=([a-f0-9]{64})/)[1];

const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9342', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'mca-ui-'))}`, 'about:blank']);
let targets;
for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch('http://127.0.0.1:9342/json/list')).json(); } catch { await sleep(250); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pend = {}; const jsErrors = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } if (m.method === 'Log.entryAdded' && /Content Security Policy/i.test(m.params.entry.text)) jsErrors.push('CSP: ' + m.params.entry.text.slice(0, 160));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.args.some(x => /Content Security Policy/i.test(x.value || ''))) jsErrors.push('CSP (consola)');
  if (m.method === 'Runtime.exceptionThrown') jsErrors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
const size = async (w, h, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
await size(1366, 900);
const go = async hash => { await send('Page.navigate', { url: `${BASE}/admin/${hash}` }); await sleep(1200); };
const waitFor = async (cond, ms = 6000) => { for (let t = 0; t < ms; t += 150) { if (await ev(cond)) return true; await sleep(150); } return false; };
const type = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
const shot = async name => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const h = await ev('Math.min(document.documentElement.scrollHeight, 6000)');
  const w = await ev('innerWidth');
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  try { writeFileSync(join(SHOTS, name + '.png'), Buffer.from(s.result.data, 'base64')); }
  catch (e) { console.log('  (captura ' + name + ' não gravada: ' + e.code + ')'); }   // ficheiro bloqueado, ex.: aberto no editor
};
const results = [];
async function test(name, fn, expected) {
  try { const got = await fn(); const ok = JSON.stringify(got) === JSON.stringify(expected); results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(expected)}`}`); }
  catch (e) { results.push(false); console.log(`FAIL  ${name}  → erro: ${e.message.split('\n')[0]}`); }
}

/* 1. Definir palavra-passe e entrar */
const adminEmail = `ui-admin-${run}@teste.local`;
const token = cliUser('Admin Interface', adminEmail, 'admin');
await go(`#/definir-senha?token=${token}`);
await waitFor(`!!document.querySelector('[data-auth] h1') && !!document.querySelector('#a-pass2')`, 15000);
await test('U1 ecrã «Definir palavra-passe» a partir do link', () => ev(`document.querySelector('[data-auth] h1').textContent`), 'Definir palavra-passe');
await type('#a-pass', PASS); await type('#a-pass2', PASS);
await click('[data-auth] button[type=submit]');
await waitFor(`!!document.querySelector('#a-email')`);
await test('U2 depois de definir, mostra o ecrã de entrada', () => ev(`!!document.querySelector('#a-email')`), true);
await shot('01-entrar');
await type('#a-email', adminEmail); await type('#a-pass', PASS);
await click('[data-auth] button[type=submit]');
await waitFor(`!document.querySelector('[data-app]').hidden && !!document.querySelector('.kpi')`);
await test('U3 entrada → resumo com indicadores', () => ev(`document.querySelectorAll('.kpi').length`), 11);
await test('U4 administrador vê todas as secções do menu', () => ev(`document.querySelectorAll('[data-nav] a').length`), 10);
await test('U5 resumo separa facturado, recebido, em dívida e por verificar', () => ev(`['Facturado este mês', 'Recebido este mês', 'Em dívida', 'Pagamentos por verificar'].every(l => [...document.querySelectorAll('.kpi small')].some(k => k.textContent.startsWith(l)))`), true);
await shot('02-resumo');

/* 2. Pedido manual (WhatsApp) */
await go('#/reservas');
await waitFor(`!!document.querySelector('[data-new]')`);
await click('[data-new]');
await waitFor(`document.querySelector('[data-dialog]').open && !!document.querySelector('[data-item]')`);
await type('[data-item]', 'santa-maria-snorkeling');
const d = new Date(); d.setDate(d.getDate() + 20); const iso = d.toISOString().slice(0, 10);
await type('[data-dialog] [name=date]', iso); await type('[data-dialog] [name=adults]', '5');
await type('[data-dialog] [name=name]', `Grupo Interface ${run}`); await type('[data-dialog] [name=phone]', '+258 84 555 6666'); await type('[data-dialog] [name=email]', 'grupo@example.com');
await ev(`(()=>{const f=document.querySelector('[data-dialog] form');f.requestSubmit(f.querySelector('button[value=ok]'))})()`);
await waitFor(`/^#\\/reservas\\/MCA-/.test(location.hash) && !!document.querySelector('.dl')`);
const ref = await ev(`location.hash.split('/')[2]`);
await test('U6 pedido manual registado → página da reserva com referência', () => /^MCA-\d{4}-\d{5}$/.test(ref), true);
await test('U7 total calculado pelo servidor (5 × 7.500)', () => ev(`[...document.querySelectorAll('td')].some(t=>t.textContent.includes('37.500 MZN'))`), true);

/* 3. Confirmar e facturar */
await click('[data-to=confirmada]');
await waitFor(`document.querySelector('[data-dialog]').open`);
await ev(`(()=>{const f=document.querySelector('[data-dialog] form');f.requestSubmit(f.querySelector('button[value=ok]'))})()`);
await waitFor(`!!document.querySelector('.badge--confirmada')`);
await test('U8 reserva confirmada (histórico actualizado)', () => ev(`[!!document.querySelector('.badge--confirmada'), document.querySelectorAll('.timeline li').length]`), [true, 2]);
await test('U8b o aviso diz o resultado REAL do e-mail ao cliente', () => ev(`document.querySelector('[data-toast]').textContent`), 'Estado actualizado. E-mail registado (modo de teste, não enviado).');
await shot('03-reserva');
await click('[data-inv=FT]');
await waitFor(`!!document.querySelector('[data-draft]')`);
await test('U9 rascunho de factura com a linha da reserva', () => ev(`document.querySelectorAll('[data-lines] tr').length`), 1);
await click('[data-disc]');
await ev(`(()=>{const tr=[...document.querySelectorAll('[data-lines] tr')].pop();const p=tr.querySelector('[data-k=unit_price]');p.value='-2500';p.dispatchEvent(new Event('input',{bubbles:true}))})()`);
await test('U10 total recalculado no ecrã com desconto', () => ev(`document.querySelector('[data-total]').textContent`), '35.000,00 MZN');
await type('#f-nuit', '400123456');
await shot('04-factura-rascunho');
await click('[data-issue]');
await waitFor(`document.querySelector('[data-dialog]').open`);
await ev(`(()=>{const f=document.querySelector('[data-dialog] form');f.requestSubmit(f.querySelector('button[value=ok]'))})()`);
await waitFor(`!!document.querySelector('.badge--emitida')`, 8000);
await test('U11 factura emitida: número FT, link do PDF, sem editor', () => ev(`[/FT-\\d{4}\\/\\d{4}/.test(document.querySelector('h2').textContent), !!document.querySelector('a[href$="/pdf"]'), !document.querySelector('[data-draft]')]`), [true, true, true]);
/* O Chrome headless intercepta application/pdf no fetch (204); usa-se o cookie da sessão do browser */
const pdfUrl = await ev(`document.querySelector('a[href$="/pdf"]').href`);
const sess = (await send('Network.getCookies', { urls: [BASE] })).result.cookies.find(c => c.name === 'mca_admin');
const pdfRes = await fetch(pdfUrl, { headers: { Cookie: 'mca_admin=' + sess.value } });
const pdfStatus = [pdfRes.status, pdfRes.headers.get('content-type'), (await pdfRes.arrayBuffer()).byteLength > 1000, sess.httpOnly];
await test('U12 PDF abre com a sessão do utilizador (cookie HttpOnly)', () => pdfStatus, [200, 'application/pdf', true, true]);
await shot('05-factura-emitida');

/* 3b. Pagamentos: registo confirmado → parcial; comprovativo do cliente → por verificar → confirmar → pago */
const invId = await ev(`location.hash.split('/')[2]`);
await waitFor(`!!document.querySelector('[data-paynew]')`);
await test('U19 factura emitida mostra cartão de pagamentos «Pendente», saldo 35.000', () => ev(`[document.querySelector('[data-paycard] .badge').textContent, [...document.querySelectorAll('[data-paycard] .kpi strong')][2].textContent]`), ['Pendente', '35.000,00 MZN']);
await click('[data-paynew]');
await waitFor(`document.querySelector('[data-dialog]').open`);
await type('[data-dialog] [name=amount]', '15000'); await type('[data-dialog] [name=reference]', 'NED-' + run);
await type('[data-dialog] [name=method]', 'Nedbank');
await ev(`document.querySelector('[data-dialog] [name=confirm]').checked = true`);
await ev(`(()=>{const f=document.querySelector('[data-dialog] form');f.requestSubmit(f.querySelector('button[value=ok]'))})()`);
await waitFor(`document.querySelector('[data-paycard] .badge')?.textContent === 'Parcialmente pago'`);
await test('U20 pagamento confirmado → «Parcialmente pago», recibo e saldo 20.000', () => ev(`[document.querySelector('[data-paycard] .badge').textContent, !!document.querySelector('[data-paycard] a[href*="/receipts/"]'), [...document.querySelectorAll('[data-paycard] .kpi strong')][2].textContent]`), ['Parcialmente pago', true, '20.000,00 MZN']);
const proofLink = await ev(`fetch('/api/admin/invoices/${invId}/proof-link',{method:'POST',headers:{'X-CSRF-Token':''}}).then(r=>r.status)`);
await click('[data-proofl]');
await waitFor(`!!document.querySelector('[data-dialog] .link-box')`);
const custLink = await ev(`document.querySelector('[data-dialog] .link-box').textContent`);
await test('U21 link para o comprovativo gerado no painel (CSRF exigido em chamadas directas)', async () => [proofLink, /\/pagamento\/#t=[a-f0-9]{48}$/.test(custLink), await ev(`!!document.querySelector('[data-dialog] a[href*="wa.me"]')`)], [403, true, true]);
await ev(`document.querySelector('[data-dialog]').close()`);
await shot('09-pagamentos-factura');
/* página do cliente */
await send('Page.navigate', { url: custLink.replace('http://localhost:8791', BASE) });
await waitFor(`!!document.querySelector('[data-proof-body]') && !document.querySelector('[data-proof-body]').hidden`, 15000);
await test('U22 página do cliente: factura, saldo e instruções (sem login)', () => ev(`[document.querySelector('[data-f=balance]').textContent, document.querySelectorAll('[data-f=methods] li').length, document.querySelector('#pf-amount').value]`), ['20.000,00 MZN', 3, '20000']);
await ev(`(()=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x34,0x0a])],'comprovativo.pdf',{type:'application/pdf'}));document.querySelector('#pf-file').files=dt.files;document.querySelector('#pf-ref').value='MP-UI-${run}';document.querySelector('#pf-method').value='M-Pesa'})()`);
await shot('10-cliente-comprovativo');
await ev(`document.querySelector('[data-proof-form]').requestSubmit()`);
await waitFor(`document.querySelector('[data-proof]').textContent.includes('Comprovativo recebido')`, 8000);
await test('U23 cliente envia comprovativo → mensagem de recebido (ainda não conta)', () => ev(`document.querySelector('[data-proof]').textContent.includes('Comprovativo recebido')`), true);
await go(`#/facturas/${invId}`);
await waitFor(`!!document.querySelector('[data-pconfirm]')`);
await test('U24 no painel: «por verificar», saldo continua 20.000', () => ev(`[[...document.querySelectorAll('[data-paycard] .kpi strong')][2].textContent, !!document.querySelector('[data-paycard] .badge--declarado')]`), ['20.000,00 MZN', true]);
await click('[data-pconfirm]');
await waitFor(`document.querySelector('[data-dialog]').open`);
await type('[data-dialog] [name=note]', 'Verificado no extracto M-Pesa');
await ev(`(()=>{const f=document.querySelector('[data-dialog] form');f.requestSubmit(f.querySelector('button[value=ok]'))})()`);
await waitFor(`document.querySelector('[data-paycard] .badge')?.textContent === 'Pago'`);
await test('U25 após confirmar → «Pago», saldo 0, sem botão de novo pagamento', () => ev(`[document.querySelector('[data-paycard] .badge').textContent, [...document.querySelectorAll('[data-paycard] .kpi strong')][2].textContent, !document.querySelector('[data-paynew]')]`), ['Pago', '0,00 MZN', true]);
await shot('11-factura-paga');
await go('#/pagamentos');
await waitFor(`!!document.querySelector('[data-st]')`);
await click('[data-st="confirmado"]');
await waitFor(`(()=>{const b=[...document.querySelectorAll('[data-list] .badge')];return b.length>0 && b.every(x=>x.textContent==='Confirmado')})()`);
await test('U26 lista de pagamentos mostra os recibos emitidos', () => ev(`[...document.querySelectorAll('[data-list] td.mono')].some(t => /^RC-/.test(t.textContent))`), true);

/* 3c. Área do cliente e registo de e-mails (Fase 7) */
await go(`#/reservas/${ref}`);
await waitFor(`!!document.querySelector('[data-clientlink]')`);
await click('[data-clientlink]');
await waitFor(`!!document.querySelector('[data-client-url]')`);
const areaLink = await ev(`document.querySelector('[data-client-url]').textContent`);
await test('U27 painel gera o link da área do cliente (com WhatsApp e revogação)', () => ev(`[/\\/reserva\\/#r=MCA-\\d{4}-\\d{5}&t=[a-f0-9]{48}$/.test(${JSON.stringify(areaLink)}), !!document.querySelector('[data-dialog] a[href*="wa.me"]'), !!document.querySelector('[data-dialog] [data-revoke]')]`), [true, true, true]);
await ev(`document.querySelector('[data-dialog]').close()`);
await size(375, 812, true);
await send('Page.navigate', { url: areaLink });
await waitFor(`!!document.querySelector('[data-c-body]') && !document.querySelector('[data-c-body]').hidden`, 15000);
await test('U28 cliente vê a reserva, a factura paga e os recibos (sem login)', () => ev(`[document.querySelector('[data-c-status]').textContent, document.querySelectorAll('[data-c-invoices] tbody tr').length >= 1, document.querySelectorAll('[data-c-receipts] tbody tr').length >= 2, document.querySelector('[data-c-invoices]').textContent.includes('Pago')]`), ['Confirmada', true, true, true]);
await test('U29 área do cliente em 375 px sem scroll horizontal', () => ev(`[innerWidth, document.documentElement.scrollWidth <= 375]`), [375, true]);
await shot('12-area-cliente-mobile');
await size(1366, 900);
await go('#/emails');
await waitFor(`!!document.querySelector('[data-st]')`);
await click('[data-st=""]');
await waitFor(`!!document.querySelector('[data-list] table')`);
await test('U30 registo de e-mails lista as notificações enviadas', () => ev(`[...document.querySelectorAll('[data-list] td')].some(t => t.textContent.includes('Reserva confirmada'))`), true);
await shot('13-emails');
await go('#/definicoes');
await waitFor(`!!document.querySelector('[data-notif]')`);
await test('U31 Definições: 9 tipos de notificação configuráveis', () => ev(`document.querySelectorAll('[data-notif] input[type=checkbox]').length`), 9);

/* 4. Utilizadores, definições, mobile */
await go('#/utilizadores');
await waitFor(`!!document.querySelector('[data-roleform]')`);
await test('U13 perfil Administrador bloqueado, Gerente com caixas de permissões', () => ev(`[document.querySelector('[data-roleform] input[name=name]').disabled, document.querySelectorAll('[data-roleform] input[type=checkbox]').length >= 13]`), [true, true]);
await shot('06-utilizadores');
await go('#/definicoes');
await waitFor(`!!document.querySelector('[data-company]')`);
await test('U14 definições com NUIT e 2 bancos + M-Pesa', () => ev(`[document.querySelector('#f-nuit').value, document.querySelectorAll('[data-methods] .card').length]`), ['459001987', 4]);
await shot('07-definicoes');
await size(375, 812, true);
await go(`#/reservas/${ref}`);
await waitFor(`!!document.querySelector('.dl')`);
await test('U15 mobile: a página mantém 375 px (sem zoom-out nem scroll horizontal)', () => ev(`[innerWidth, document.documentElement.scrollWidth <= 375]`), [375, true]);
await shot('08-reserva-mobile');
await size(1366, 900);

/* 5. Gerente: menus e acesso limitados */
await ev(`fetch('/api/admin/logout',{method:'POST',headers:{'X-CSRF-Token':''}})`);
await send('Network.clearBrowserCookies');
const mgrEmail = `ui-gerente-${run}@teste.local`;
const mt = cliUser('Gerente Interface', mgrEmail, 'gerente');
await fetch(`${BASE}/api/admin/setup-password`, { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: mt, password: PASS }) });
await go('#/');
await waitFor(`!!document.querySelector('#a-email')`);
await type('#a-email', mgrEmail); await type('#a-pass', PASS);
await click('[data-auth] button[type=submit]');
await waitFor(`!document.querySelector('[data-app]').hidden`);
await test('U16 gerente não vê Utilizadores, Definições nem Auditoria', () => ev(`[...document.querySelectorAll('[data-nav] a')].map(a=>a.textContent).filter(t=>/Utilizadores|Definições|Auditoria/.test(t)).length`), 0);
await go('#/utilizadores');
await waitFor(`document.querySelector('#view').textContent.includes('Sem permissão')`);
await test('U17 acesso directo a #/utilizadores → «Sem permissão»', () => ev(`document.querySelector('#view').textContent.includes('Sem permissão') || ('[ecrã: ' + location.hash + ' | ' + document.querySelector('[data-title]').textContent + ' | ' + document.querySelector('#view').textContent.slice(0, 80) + ' | auth=' + !document.querySelector('[data-auth]').hidden + ']')`), true);
await test('U17b corrida: resposta antiga do resumo não se sobrepõe à página nova (3×)', async () => { const out = []; for (let i = 0; i < 3; i++) { await ev("location.hash='#/'; setTimeout(()=>{location.hash='#/utilizadores'}, 5)"); await sleep(2500); out.push(await ev(`document.querySelector('#view').textContent.includes('Sem permissão')`)); } return out; }, [true, true, true]);
await test('U18 sem erros de JavaScript', () => jsErrors, []);

const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} testes passaram`);
ws.close(); chrome.kill();
process.exit(pass === results.length ? 0 : 1);
