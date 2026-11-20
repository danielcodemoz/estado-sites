/* Lógica pura do painel (sem DOM) — testável em Node: `node test/status.test.js` */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EstadoLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Estados: online | provavel-online | provavel-offline | offline | desconhecido
  var ROTULOS = {
    'online': 'Online',
    'provavel-online': 'Provavelmente online',
    'provavel-offline': 'Provavelmente offline',
    'offline': 'Offline',
    'desconhecido': 'Sem dados'
  };

  // Resposta CORS legível: temos o código HTTP, logo a certeza é alta.
  function classificarHttp(status) {
    if (typeof status !== 'number' || !isFinite(status)) return { estado: 'desconhecido', certo: false };
    if (status >= 500) return { estado: 'offline', certo: true };   // 5xx = servidor com erro
    return { estado: 'online', certo: true };                        // 2xx/3xx/4xx = servidor responde
  }

  // Quando o pedido CORS falha (bloqueio CORS OU rede), usamos os sinais do fallback:
  //   opaco  — fetch no-cors resolveu (chegou ao servidor, sem ler o código)
  //   imagem — ping por <img> carregou
  //   expirou — esgotou o tempo limite
  //   navegadorOnline — navigator.onLine
  function classificarFalha(s) {
    if (s.navegadorOnline === false) return { estado: 'desconhecido', certo: false };
    if (s.opaco || s.imagem) return { estado: 'provavel-online', certo: false };
    return { estado: 'provavel-offline', certo: false };            // nunca "certo": pode ser rede local/bloqueador
  }

  function tempoLento(ms, limiar) {
    return typeof ms === 'number' && ms >= limiar;
  }

  function resumir(resultados) {
    var r = { total: resultados.length, online: 0, provavel: 0, offline: 0, desconhecido: 0, verificados: 0 };
    resultados.forEach(function (x) {
      if (!x || !x.estado) return;
      r.verificados++;
      if (x.estado === 'online') r.online++;
      else if (x.estado === 'provavel-online') { r.online++; r.provavel++; }
      else if (x.estado === 'offline' || x.estado === 'provavel-offline') r.offline++;
      else r.desconhecido++;
    });
    return r;
  }

  function textoResumo(r) {
    if (!r.verificados) return 'A verificar…';
    var t = r.online + '/' + r.total + ' online';
    if (r.provavel) t += ' (' + r.provavel + (r.provavel > 1 ? ' prováveis' : ' provável') + ')';
    return t;
  }

  function classeResumo(r) {
    if (!r.verificados) return 'neutro';
    if (r.offline > 0) return r.online === 0 ? 'mau' : 'aviso';
    return r.desconhecido > 0 ? 'aviso' : 'bom';
  }

  function tempoRelativo(ts, agora) {
    if (!ts) return '—';
    var s = Math.max(0, Math.round((agora - ts) / 1000));
    if (s < 5) return 'agora mesmo';
    if (s < 60) return 'há ' + s + ' s';
    var m = Math.floor(s / 60);
    if (m < 60) return 'há ' + m + ' min';
    var h = Math.floor(m / 60);
    if (h < 24) return 'há ' + h + ' h';
    var d = Math.floor(h / 24);
    return 'há ' + d + (d === 1 ? ' dia' : ' dias');
  }

  function formatarMs(ms, aproximado) {
    if (typeof ms !== 'number') return '—';
    var t = ms >= 10000 ? (ms / 1000).toFixed(0) + ' s' : ms >= 1000 ? (ms / 1000).toFixed(1).replace('.', ',') + ' s' : Math.round(ms) + ' ms';
    return (aproximado ? '≈ ' : '') + t;
  }

  // Cache de commits (localStorage): entrada = { data, em, erro? }
  function cacheValida(entrada, agora, ttlMs) {
    return !!entrada && typeof entrada.em === 'number' && agora - entrada.em < ttlMs;
  }

  // Cabeçalhos da API do GitHub → timestamp (ms) até quando não devemos chamar; 0 = livre.
  function limiteAte(status, restantes, reset, agora) {
    if ((status === 403 || status === 429) && (restantes === 0 || restantes === '0' || status === 429)) {
      var r = Number(reset);
      return isFinite(r) && r > 0 ? r * 1000 : agora + 15 * 60 * 1000;
    }
    return 0;
  }

  function repoValido(repo) {
    return typeof repo === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
  }

  function urlSegura(u) {
    try { var x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch (e) { return null; }
  }

  function dataCurta(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return {
    ROTULOS: ROTULOS, classificarHttp: classificarHttp, classificarFalha: classificarFalha,
    tempoLento: tempoLento, resumir: resumir, textoResumo: textoResumo, classeResumo: classeResumo,
    tempoRelativo: tempoRelativo, formatarMs: formatarMs, cacheValida: cacheValida,
    limiteAte: limiteAte, repoValido: repoValido, urlSegura: urlSegura, dataCurta: dataCurta
  };
});
