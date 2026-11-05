/**
 * MOZ CAMP ADVENTURES — tests/chat-ui.mjs
 * Live Chat de ponta a ponta com dois Chrome independentes: visitante no site e agente no painel.
 * SÓ em desenvolvimento.   API_BASE, PHP_CLI, MCA_CONFIG, PSQL; SHOTS=<pasta> para capturas.
 */

import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.API_BASE || 'http://localhost:8791';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { PHP_CLI, PSQL, SHOTS } = process.env;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const run = Math.random().toString(36).slice(2, 8), PASS = 'Conversa-ui-2026';
const sql = q => execSync(`${PSQL} -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tmp = mkdtempSync(join(tmpdir(), 'mca-chat-ui-'));

async function browser(port) {
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmp, String(port))}`, '--window-size=1400,900', 'about:blank']);
  let targets;
  for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(250); } }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let id = 0;
  const pend = {}, errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]);
    if (m.method === 'Log.entryAdded' && /Content Security Policy/i.test(m.params.entry.text)) errors.push('CSP: ' + m.params.entry.text.slice(0, 120));
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('DOM.enable');
  const b = {
    proc, ws, errors, send,
    ev: async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'erro'); return r.result.result.value; },
    go: async url => { await send('Page.navigate', { url: BASE + url }); await sleep(900); },
    wait: async (cond, ms = 9000) => { for (let t = 0; t < ms; t += 150) { if (await b.ev(cond)) return true; await sleep(150); } return false; },
    type: (sel, v) => b.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`),
    click: sel => b.ev(`document.querySelector(${JSON.stringify(sel)}).click()`),
    shot: async name => { if (!SHOTS) return; const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64')); },
  };
  return b;
}

const results = [];
async function test(name, fn, expected) {
  try {
    const got = await fn();
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(expected)}`}`);
  } catch (e) { results.push(false); console.log(`FAIL  ${name}  → erro: ${e.message.split('\n')[0]}`); }
}

sql('DELETE FROM rate_limits');
sql("UPDATE chat_agents SET status = 'offline'");
const email = `agente-ui-${run}@teste.local`, vmail = `visitante-${run}@example.com`;
const token = execSync(`${PHP_CLI} api/bin/create-user.php "Marta Agente" ${email} gerente`, { encoding: 'utf8' }).match(/token=([a-f0-9]{64})/)[1];
const V = await browser(9351), A = await browser(9352);
const last = `[...document.querySelectorAll('.chatw__msg')].at(-1)`;

try {
  /* Botão */
  await V.go('/');
  await V.wait(`!!document.querySelector('.chatw__btn')`);
  await test('B1 botão flutuante no site, com disponibilidade e sem contador', () => V.ev(`(()=>{const r=document.querySelector('.chatw').dataset.state,b=document.querySelector('.chatw__btn'),s=getComputedStyle(b);return [r,s.position,b.getAttribute('aria-expanded'),document.querySelector('.chatw__badge').hidden]})()`), ['offline', 'fixed', 'false', true]);
  await test('B2 estilo carregado e sem deslocar a página', () => V.ev(`[getComputedStyle(document.querySelector('.chatw__panel')).position, document.documentElement.scrollWidth <= innerWidth]`), ['fixed', true]);
  for (const p of ['/tours/whale-watching/', '/pages/contact.html', '/en/', '/holiday-packages/', '/conta/', '/nao-existe']) {
    await V.go(p);
    await test(`B3 botão presente em ${p}`, () => V.wait(`!!document.querySelector('.chatw__btn')`, 4000), true);
  }
  await V.go('/en/');
  await V.wait(`!!document.querySelector('.chatw__btn')`);
  await V.click('.chatw__btn');
  await test('B4 em inglês no site inglês, com as categorias do brief', () => V.ev(`[document.querySelector('.chatw__head strong').textContent, [...document.querySelectorAll('#chatw-subject option')].slice(1).map(o=>o.textContent).join('|')]`), ['Chat with us', 'Reservations|Island Hopping|Sunset Cruise|Beach Tours|Safaris|Transfers|Accommodation|General Information|Other']);

  /* Visitante inicia na página de um pacote, sem equipa */
  await V.click('.chatw__min');
  await V.go('/tours/whale-watching/');
  await V.wait(`!!document.querySelector('.chatw__btn')`);
  await V.click('.chatw__btn');
  await test('C1 janela abre na própria página, com aviso de equipa offline', () => V.ev(`[location.pathname, !document.querySelector('.chatw__panel').hidden, /Deixe a sua mensagem/.test(document.querySelector('.chatw__note').textContent), document.querySelector('.chatw__submit').textContent]`), ['/tours/whale-watching/', true, true, 'Deixar mensagem']);
  await V.shot('01-formulario');
  await V.ev(`document.querySelector('.chatw__form').requestSubmit()`);
  await test('C2 campos em falta: erro junto do formulário, nada enviado', () => V.ev(`[document.querySelector('.chatw__form .chatw__err').textContent, document.querySelector('.chatw__form').hidden]`), ['Indique o seu nome.', false]);
  await V.type('#chatw-name', 'Rita Visitante'); await V.type('#chatw-email', vmail); await V.type('#chatw-subject', 'safaris'); await V.type('#chatw-message', 'Olá, têm vagas para sábado?');
  await V.ev(`document.querySelector('.chatw__form').requestSubmit()`);
  await V.wait(`document.querySelectorAll('.chatw__msg').length === 1`);
  await test('C4 a janela aberta fica acima do aviso de cookies', () => V.ev(`(()=>{const i=document.querySelector('.chatw__composer textarea').getBoundingClientRect();const e=document.elementFromPoint(i.left+10,i.top+10);return e===document.querySelector('.chatw__composer textarea')})()`), true);
  await test('C3 conversa iniciada sem conta', () => V.ev(`[document.querySelector('.chatw__form').hidden, ${last}.textContent.includes('têm vagas'), ${last}.classList.contains('is-mine')]`), [true, true, true]);

  /* Agente */
  await A.go('/admin/');
  await A.ev(`fetch('/api/admin/setup-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:${JSON.stringify(token)},password:${JSON.stringify(PASS)}})}).then(r=>r.status)`);
  await A.ev(`fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:${JSON.stringify(email)},password:${JSON.stringify(PASS)}})}).then(r=>r.status)`);
  await A.go('/admin/#/chat');
  await A.send('Page.reload'); await sleep(1500);
  await A.wait(`!!document.querySelector('[data-me]')`);
  await test('A1 secção Live Chat no menu, com a conversa à espera', () => A.wait(`[...document.querySelectorAll('.chatp__item')].some(x=>x.textContent.includes('Rita Visitante'))`), true);
  await test('A2 ter o painel aberto não coloca o agente online', () => V.ev(`fetch('/api/chat/status').then(r=>r.json()).then(d=>d.state)`), 'offline');
  await A.type('[data-me]', 'online');
  await test('A3 ao escolher online, o visitante vê a equipa online sem recarregar', () => V.wait(`document.querySelector('.chatw').dataset.state === 'online'`), true);
  await A.ev(`[...document.querySelectorAll('.chatp__item')].find(x=>x.textContent.includes('Rita Visitante')).click()`);
  await A.wait(`document.querySelectorAll('.chatp__msg').length === 1`);
  await test('A4 três áreas com dados do visitante e contexto do pacote', () => A.ev(`[!!document.querySelector('.chatp__list'), !!document.querySelector('.chatp__main'), !document.querySelector('.chatp__side').hidden, document.querySelector('[data-chat-info]').textContent.includes(${JSON.stringify(vmail)}), document.querySelector('[data-chat-info]').textContent.includes('/tours/whale-watching/'), !!document.querySelector('[data-item-ctx]')]`), [true, true, true, true, true, true]);

  await test('A5 o menu do painel continua intacto e os dados do visitante ficam na área própria', () => A.wait(`document.querySelectorAll('[data-nav] a').length > 5 && !document.querySelector('.side').textContent.includes(${JSON.stringify(vmail)}) && document.querySelector('.chatp__side').textContent.includes(${JSON.stringify(vmail)})`), true);
  await test('A6 painel sem scroll lateral', () => A.ev(`document.documentElement.scrollWidth <= innerWidth`), true);
  await test('A7 disponibilidade da equipa mostra só quem está presente', () => A.wait(`document.querySelector('[data-agents]').textContent === 'Marta: Online'`), true);

  /* Tempo real nos dois sentidos */
  await V.type('.chatw__composer textarea', 'a escrever');
  await test('T1 agente vê o visitante a escrever', () => A.wait(`!document.querySelector('[data-typing]').hidden && /está a escrever/.test(document.querySelector('[data-typing]').textContent)`), true);
  await V.type('.chatw__composer textarea', '');
  await A.type('[data-reply] textarea', 'Olá Rita, temos vagas.');
  await test('T2 visitante vê a equipa a escrever', () => V.wait(`!document.querySelector('.chatw__typing').hidden`), true);
  const t0 = Date.now();
  await A.ev(`document.querySelector('[data-reply]').requestSubmit()`);
  await test('T3 resposta chega ao visitante sem recarregar', () => V.wait(`document.querySelectorAll('.chatw__msg.is-team').length === 1`), true);
  console.log(`INFO  resposta do agente visível no site em ${Date.now() - t0} ms`);
  await test('T4 identificada com o primeiro nome do agente, data e hora', () => V.ev(`(()=>{const m=document.querySelector('.chatw__msg.is-team');return [m.querySelector('.chatw__who').textContent, m.querySelector('p').textContent, /\\d\\d:\\d\\d/.test(m.querySelector('time').textContent)]})()`), ['Marta', 'Olá Rita, temos vagas.', true]);
  await test('T5 responder atribui a conversa ao agente', () => A.wait(`document.querySelector('[data-owner]').textContent === 'Marta Agente'`), true);
  await V.type('.chatw__composer textarea', 'Perfeito, obrigada!');
  await V.ev(`document.querySelector('.chatw__composer').requestSubmit()`);
  await test('T6 mensagem do visitante chega ao agente sem recarregar', () => A.wait(`[...document.querySelectorAll('.chatp__msg')].some(x=>x.textContent.includes('Perfeito, obrigada!'))`), true);
  await test('T7 visitante vê «Lida» depois de o agente ler', () => V.wait(`${last}.querySelector('.chatw__st').textContent === 'Lida'`), true);
  await V.shot('02-conversa'); await A.shot('03-painel');

  /* Recuperar e minimizar */
  await V.go('/pages/contact.html');
  await test('R1 ao mudar de página, a janela e o histórico voltam', () => V.wait(`document.querySelectorAll('.chatw__msg').length === 3 && !document.querySelector('.chatw__panel').hidden`), true);
  await V.send('Page.reload'); await sleep(1000);
  await test('R2 ao actualizar a página, a conversa é recuperada', () => V.wait(`document.querySelectorAll('.chatw__msg').length === 3`), true);
  await V.click('.chatw__min');
  await A.type('[data-reply] textarea', 'Quer reservar já?');
  await A.ev(`document.querySelector('[data-reply]').requestSubmit()`);
  await test('R3 minimizada: contador de não lidas e aviso no título', () => V.wait(`document.querySelector('.chatw__badge').textContent === '1' && document.title.startsWith('(1)')`, 26000), true);
  await V.shot('04-contador');
  await V.click('.chatw__btn');
  await test('R4 ao reabrir, a mensagem está lá e o contador desaparece', () => V.wait(`document.querySelector('.chatw__badge').hidden && !document.title.startsWith('(') && document.querySelectorAll('.chatw__msg').length === 4`), true);

  /* Segurança na interface */
  const NOTE = `Cliente VIP nota-${run}`;
  await A.type('[data-note] textarea', NOTE);
  await A.ev(`document.querySelector('[data-note]').requestSubmit()`);
  await test('N1 nota interna aparece no painel', () => A.wait(`document.querySelector('[data-notes]').textContent.includes(${JSON.stringify(NOTE)})`), true);
  await sleep(3500);
  await test('N2 nota interna não aparece no site', () => V.ev(`document.body.textContent.includes(${JSON.stringify(NOTE)})`), false);
  const XSS = '<img src=x onerror="window.__xss=1"><b>teste</b>';
  await V.type('.chatw__composer textarea', XSS);
  await V.ev(`document.querySelector('.chatw__composer').requestSubmit()`);
  await A.wait(`[...document.querySelectorAll('.chatp__msg')].some(x=>x.textContent.includes('onerror'))`);
  await test('X1 HTML numa mensagem aparece como texto nos dois lados', async () => [await V.ev(`[window.__xss === undefined, !document.querySelector('.chatw__msg img[src="x"]')]`), await A.ev(`[window.__xss === undefined, !document.querySelector('.chatp__msg img[src="x"]'), !document.querySelector('.chatp__item b')]`)], [[true, true], [true, true, true]]);

  /* Ficheiro */
  const png = join(tmp, 'foto.png');
  writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  const doc = await V.send('DOM.getDocument');
  const node = await V.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '.chatw__composer input[type=file]' });
  await V.send('DOM.setFileInputFiles', { nodeId: node.result.nodeId, files: [png] });
  await test('F1 imagem enviada chega ao agente', () => A.wait(`!!document.querySelector('.chatp__msg img')`), true);

  /* Falha de ligação */
  await V.ev(`(()=>{window.__f=window.fetch;window.fetch=()=>Promise.reject(new Error('offline'))})()`);
  await test('L1 sem ligação: aviso visível', () => V.wait(`!document.querySelector('.chatw__net').hidden`), true);
  await V.type('.chatw__composer textarea', 'Mensagem sem rede');
  await V.ev(`document.querySelector('.chatw__composer').requestSubmit()`);
  await test('L2 mensagem fica como não enviada, com opção de repetir', () => V.wait(`!!document.querySelector('.chatw__retry')`), true);
  await V.ev(`window.fetch=window.__f`);
  await V.click('.chatw__retry');
  await test('L3 ao repetir, chega ao agente uma só vez', () => A.wait(`[...document.querySelectorAll('.chatp__msg')].filter(x=>x.textContent.includes('Mensagem sem rede')).length === 1`), true);
  await test('L4 o aviso desaparece quando a ligação volta', () => V.wait(`document.querySelector('.chatw__net').hidden`, 34000), true);
  await sleep(3500);
  await test('L5 a mensagem não fica duplicada no site', () => V.ev(`[...document.querySelectorAll('.chatw__msg')].filter(x=>x.textContent.includes('Mensagem sem rede')).length`), 1);

  /* Encerrar e sair */
  await A.click('[data-close]');
  await test('E1 encerrar: visitante é avisado', () => V.wait(`/encerrada/.test(document.querySelector('.chatw__note').textContent)`), true);
  await test('E2 painel esconde a resposta e oferece reabrir', () => A.wait(`document.querySelector('[data-reply]').hidden && !!document.querySelector('[data-reopen]')`), true);
  await A.click('[data-reopen]');
  await A.wait(`!document.querySelector('[data-reply]').hidden`);
  await A.type('[data-me]', 'offline');
  await test('E3 agente offline: o site mostra equipa offline', () => V.wait(`document.querySelector('.chatw').dataset.state === 'offline'`), true);

  /* Telemóvel */
  await V.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await V.go('/');
  await V.wait(`!!document.querySelector('.chatw__btn')`);
  await V.ev(`document.querySelector('.chatw__panel').hidden || document.querySelector('.chatw__min').click()`);
  await V.ev(`[...document.querySelectorAll('.cookie-banner button')].find(b=>/essenciais/.test(b.textContent)).click()`);
  await sleep(300);
  await test('M1 telemóvel: botão não tapa a barra inferior nem cria scroll lateral', () => V.ev(`(()=>{const b=document.querySelector('.chatw__btn').getBoundingClientRect(),d=document.querySelector('.mobile-dock').getBoundingClientRect();return [b.bottom<=d.top, document.documentElement.scrollWidth<=innerWidth]})()`), [true, true]);
  await V.shot('05-telemovel-botao');
  await V.click('.chatw__btn');
  await sleep(300);
  await test('M2 telemóvel: janela em ecrã inteiro', () => V.ev(`(()=>{const p=document.querySelector('.chatw__panel').getBoundingClientRect();return [p.width===innerWidth, p.height===innerHeight]})()`), [true, true]);
  await V.shot('06-telemovel-janela');
  await V.ev(`document.querySelector('.chatw__min').click()`);
  await test('M3 minimizar volta a mostrar o botão', () => V.ev(`!document.querySelector('.chatw__btn').hidden && document.querySelector('.chatw__panel').hidden`), true);

  await test('Z1 sem erros de JavaScript nem de CSP (site)', () => V.errors, []);
  await test('Z2 sem erros de JavaScript nem de CSP (painel)', () => A.errors, []);
} catch (e) {
  results.push(false);
  console.log('FAIL  execução interrompida: ' + e.message.split('\n')[0]);
} finally {
  sql("UPDATE chat_agents SET status = 'offline'");
  sql('DELETE FROM rate_limits');
  for (const b of [V, A]) { b.ws.close(); b.proc.kill(); }
  await sleep(500);
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* o Chrome pode ainda estar a fechar */ }
}
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} testes passaram`);
process.exit(failed ? 1 : 0);
