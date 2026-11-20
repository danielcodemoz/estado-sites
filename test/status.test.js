'use strict';
const assert = require('assert');
const L = require('../status.js');
const sites = require('../sites.json');
let n = 0;
const t = (nome, fn) => { fn(); n++; console.log('ok -', nome); };

t('HTTP 200/301/404 → online certo', () => {
  [200, 204, 301, 403, 404].forEach(c => assert.deepStrictEqual(L.classificarHttp(c), { estado: 'online', certo: true }));
});
t('HTTP 5xx → offline certo', () => {
  [500, 502, 503].forEach(c => assert.deepStrictEqual(L.classificarHttp(c), { estado: 'offline', certo: true }));
});
t('HTTP inválido → desconhecido', () => {
  assert.strictEqual(L.classificarHttp(undefined).estado, 'desconhecido');
  assert.strictEqual(L.classificarHttp(NaN).estado, 'desconhecido');
});
t('falha CORS + no-cors opaco → provável online', () => {
  assert.deepStrictEqual(L.classificarFalha({ opaco: true, navegadorOnline: true }), { estado: 'provavel-online', certo: false });
});
t('falha CORS + só imagem → provável online', () => {
  assert.strictEqual(L.classificarFalha({ imagem: true, navegadorOnline: true }).estado, 'provavel-online');
});
t('tudo falha → provável offline (nunca certo)', () => {
  const r = L.classificarFalha({ expirou: true, navegadorOnline: true });
  assert.strictEqual(r.estado, 'provavel-offline'); assert.strictEqual(r.certo, false);
});
t('navegador sem rede → desconhecido, não culpa o site', () => {
  assert.strictEqual(L.classificarFalha({ navegadorOnline: false }).estado, 'desconhecido');
});
t('resumo conta online/provável/offline', () => {
  const r = L.resumir([{ estado: 'online' }, { estado: 'provavel-online' }, { estado: 'offline' }, { estado: 'provavel-offline' }, { estado: 'desconhecido' }, null]);
  assert.deepStrictEqual(r, { total: 6, online: 2, provavel: 1, offline: 2, desconhecido: 1, verificados: 5 });
  assert.strictEqual(L.textoResumo(r), '2/6 online (1 provável)');
});
t('plural de prováveis', () => {
  assert.strictEqual(L.textoResumo({ verificados: 3, total: 3, online: 3, provavel: 3 }), '3/3 online (3 prováveis)');
});
t('resumo vazio → A verificar', () => {
  const r = L.resumir([null, null]);
  assert.strictEqual(L.textoResumo(r), 'A verificar…'); assert.strictEqual(L.classeResumo(r), 'neutro');
});
t('classe do resumo', () => {
  assert.strictEqual(L.classeResumo(L.resumir([{ estado: 'online' }])), 'bom');
  assert.strictEqual(L.classeResumo(L.resumir([{ estado: 'online' }, { estado: 'offline' }])), 'aviso');
  assert.strictEqual(L.classeResumo(L.resumir([{ estado: 'offline' }])), 'mau');
});
t('tempo lento', () => {
  assert.ok(L.tempoLento(1500, 1500)); assert.ok(!L.tempoLento(300, 1500)); assert.ok(!L.tempoLento(undefined, 1500));
});
t('formatação de tempos', () => {
  assert.strictEqual(L.formatarMs(120), '120 ms');
  assert.strictEqual(L.formatarMs(1234), '1,2 s');
  assert.strictEqual(L.formatarMs(120, true), '≈ 120 ms');
  assert.strictEqual(L.formatarMs(null), '—');
});
t('tempo relativo', () => {
  const a = 1e12;
  assert.strictEqual(L.tempoRelativo(a - 2000, a), 'agora mesmo');
  assert.strictEqual(L.tempoRelativo(a - 30000, a), 'há 30 s');
  assert.strictEqual(L.tempoRelativo(a - 5 * 60000, a), 'há 5 min');
  assert.strictEqual(L.tempoRelativo(a - 3 * 3600000, a), 'há 3 h');
  assert.strictEqual(L.tempoRelativo(a - 86400000, a), 'há 1 dia');
  assert.strictEqual(L.tempoRelativo(0, a), '—');
});
t('cache de commits respeita TTL', () => {
  const ttl = 6 * 3600000;
  assert.ok(L.cacheValida({ em: 1000 }, 1000 + ttl - 1, ttl));
  assert.ok(!L.cacheValida({ em: 1000 }, 1000 + ttl, ttl));
  assert.ok(!L.cacheValida(null, 5, ttl)); assert.ok(!L.cacheValida({}, 5, ttl));
});
t('limite de taxa da API do GitHub', () => {
  assert.strictEqual(L.limiteAte(200, '59', '999', 0), 0);
  assert.strictEqual(L.limiteAte(403, '0', '2000', 0), 2000000);
  assert.strictEqual(L.limiteAte(403, '12', '2000', 0), 0);        // 403 por outra razão
  assert.strictEqual(L.limiteAte(429, null, null, 10), 10 + 900000); // sem reset → 15 min
});
t('validação de repo e URL', () => {
  assert.ok(L.repoValido('danielcodemoz/speeddisc')); assert.ok(!L.repoValido('a/b/c')); assert.ok(!L.repoValido(null));
  assert.strictEqual(L.urlSegura('javascript:alert(1)'), null); assert.strictEqual(L.urlSegura('http://x.pt'), null);
  assert.strictEqual(L.urlSegura('https://x.pt'), 'https://x.pt/');
});
t('sites.json: 11 sites, https, ids únicos, repos válidos, sem segredos', () => {
  assert.strictEqual(sites.sites.length, 11);
  assert.strictEqual(new Set(sites.sites.map(s => s.id)).size, 11);
  sites.sites.forEach(s => { assert.ok(L.urlSegura(s.url), s.id); assert.ok(s.repo === null || L.repoValido(s.repo), s.id); });
  assert.ok(!/token|secret|password/i.test(JSON.stringify(sites)));
});
console.log('\n' + n + ' testes passaram');
