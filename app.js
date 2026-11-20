(function () {
  'use strict';
  var L = window.EstadoLogic;
  var cfg = { intervaloSegundos: 60, timeoutMs: 8000, lentoMs: 1500, cacheCommitsHoras: 6, sites: [] };
  var cartoes = {};       // id → { el, refs }
  var resultados = {};    // id → resultado da última verificação
  var ultimaRonda = 0, proximaEm = 0, aVerificar = false;

  function $(id) { return document.getElementById(id); }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  /* ---------- tema ---------- */
  function temaAtual() {
    var t = document.documentElement.dataset.tema;
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function pintarBotaoTema() {
    var escuro = temaAtual() === 'dark', b = $('btn-tema');
    b.setAttribute('aria-pressed', String(escuro));
    b.textContent = escuro ? 'Tema: escuro' : 'Tema: claro';
  }
  $('btn-tema').addEventListener('click', function () {
    var novo = temaAtual() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.tema = novo;
    guardar('tema', novo);
    pintarBotaoTema();
  });
  pintarBotaoTema();

  /* ---------- verificação ---------- */
  function fetchComTempo(url, opcoes, ms) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, ms);
    opcoes.signal = ctl.signal;
    return fetch(url, opcoes).finally(function () { clearTimeout(timer); });
  }

  function pingImagem(url, ms) {
    return new Promise(function (resolve) {
      var img = new Image(), fim = false;
      function acabar(ok) { if (fim) return; fim = true; clearTimeout(t); img.onload = img.onerror = null; resolve(ok); }
      var t = setTimeout(function () { acabar(false); }, ms);
      img.onload = function () { acabar(true); };
      img.onerror = function () { acabar(false); };
      img.src = url;
    });
  }

  function agora() { return performance.now(); }

  async function verificar(site) {
    var t0 = agora(), base = { ts: Date.now() };
    // 1) pedido CORS: se o site permitir, lemos o código HTTP (certo)
    var expirou = false;
    try {
      var r = await fetchComTempo(site.url, { method: 'HEAD', mode: 'cors', cache: 'no-store' }, cfg.timeoutMs);
      var c = L.classificarHttp(r.status);
      return Object.assign(base, c, { http: r.status, ms: agora() - t0, aprox: false });
    } catch (e) { expirou = e && e.name === 'AbortError'; }

    // 2) CORS bloqueado ou rede em baixo: no-cors (opaco) e depois ping por imagem
    var opaco = false, imagem = false, t1 = agora();
    if (!expirou) {
      try {
        await fetchComTempo(site.url, { method: 'GET', mode: 'no-cors', cache: 'no-store' }, cfg.timeoutMs);
        opaco = true;
      } catch (e) { expirou = e && e.name === 'AbortError'; }
    }
    if (!opaco && !expirou) {
      t1 = agora();
      imagem = await pingImagem(new URL('/favicon.ico', site.url).href + '?_=' + Date.now(), 5000);
    }
    var res = L.classificarFalha({ opaco: opaco, imagem: imagem, expirou: expirou, navegadorOnline: navigator.onLine });
    return Object.assign(base, res, { http: null, ms: (opaco || imagem) ? agora() - t1 : null, aprox: true });
  }

  /* ---------- cartões ---------- */
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function linha(dl, rotulo) {
    var dt = el('dt', null, rotulo), dd = el('dd');
    dl.appendChild(dt); dl.appendChild(dd);
    return dd;
  }

  function criarCartao(site) {
    var li = el('li', 'cartao');
    li.setAttribute('aria-labelledby', 'nome-' + site.id);
    var cab = el('div', 'cab');
    var h2 = el('h2', null, site.nome); h2.id = 'nome-' + site.id;
    var estado = el('span', 'estado', 'A verificar…'); estado.dataset.estado = 'desconhecido';
    cab.appendChild(h2); cab.appendChild(estado);
    var host = new URL(site.url).host;
    var dl = document.createElement('dl');
    var tempo = linha(dl, 'Tempo de resposta');
    var ultima = linha(dl, 'Última verificação');
    var commit = linha(dl, 'Último commit');
    tempo.textContent = '—'; ultima.textContent = '—';
    commit.textContent = L.repoValido(site.repo) ? 'A carregar…' : 'Sem repositório público';
    var a = el('a', 'abrir', 'Abrir ' + host);
    a.href = L.urlSegura(site.url) || '#';
    a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', 'Abrir ' + site.nome + ' (' + host + ') num novo separador');
    li.appendChild(cab); li.appendChild(el('p', 'url', host)); li.appendChild(dl); li.appendChild(a);
    cartoes[site.id] = { el: li, estado: estado, tempo: tempo, ultima: ultima, commit: commit };
    return li;
  }

  function pintarCartao(site) {
    var c = cartoes[site.id], r = resultados[site.id];
    if (!c || !r) return;
    var rot = L.ROTULOS[r.estado] || 'Sem dados';
    if (r.http) rot += ' (HTTP ' + r.http + ')';
    c.estado.textContent = rot;
    c.estado.dataset.estado = r.estado;
    c.tempo.textContent = '';
    if (typeof r.ms === 'number') {
      var s = el('span', L.tempoLento(r.ms, cfg.lentoMs) ? 'lento' : null, L.formatarMs(r.ms, r.aprox));
      c.tempo.appendChild(s);
      if (L.tempoLento(r.ms, cfg.lentoMs)) c.tempo.appendChild(document.createTextNode(' (lento)'));
    } else c.tempo.textContent = '—';
    c.ultima.textContent = '';
    var tm = document.createElement('time');
    tm.dateTime = new Date(r.ts).toISOString();
    tm.title = new Date(r.ts).toLocaleString('pt-PT');
    tm.dataset.ts = r.ts;
    tm.textContent = L.tempoRelativo(r.ts, Date.now());
    c.ultima.appendChild(tm);
  }

  function pintarResumo() {
    var lista = cfg.sites.map(function (s) { return resultados[s.id]; });
    var r = L.resumir(lista), t = $('resumo-texto');
    t.textContent = L.textoResumo(r);
    t.className = 'resumo-texto ' + L.classeResumo(r);
    $('barra-bom').style.width = (r.total ? r.online / r.total * 100 : 0) + '%';
    $('barra-mau').style.width = (r.total ? r.offline / r.total * 100 : 0) + '%';
  }

  async function ronda() {
    if (aVerificar) return;
    aVerificar = true;
    var b = $('btn-atualizar'); b.disabled = true; b.textContent = 'A verificar…';
    await Promise.all(cfg.sites.map(function (site) {
      return verificar(site).then(function (r) { resultados[site.id] = r; pintarCartao(site); pintarResumo(); })
        .catch(function () { resultados[site.id] = { estado: 'desconhecido', ts: Date.now(), ms: null }; pintarCartao(site); pintarResumo(); });
    }));
    ultimaRonda = Date.now();
    proximaEm = ultimaRonda + cfg.intervaloSegundos * 1000;
    aVerificar = false;
    b.disabled = false; b.textContent = 'Atualizar agora';
    carregarCommits();
    tique();
  }

  /* ---------- commits (API pública do GitHub, com cache) ---------- */
  var aCarregarCommits = false;
  function pintarCommit(site, entrada, emCache) {
    var c = cartoes[site.id]; if (!c) return;
    c.commit.textContent = '';
    if (!entrada || !entrada.data) { c.commit.textContent = entrada && entrada.erro ? 'Indisponível' : '—'; return; }
    var txt = L.dataCurta(entrada.data);
    var url = typeof entrada.url === 'string' && entrada.url.indexOf('https://github.com/') === 0 ? entrada.url : null;
    var nodo;
    if (url) { nodo = el('a', null, txt); nodo.href = url; nodo.target = '_blank'; nodo.rel = 'noopener noreferrer'; }
    else nodo = document.createTextNode(txt);
    var tm = document.createElement('time'); tm.dateTime = entrada.data; tm.appendChild(nodo);
    c.commit.appendChild(tm);
    if (emCache && entrada.stale) c.commit.appendChild(document.createTextNode(' (cache)'));
  }

  async function carregarCommits() {
    if (aCarregarCommits) return;
    aCarregarCommits = true;
    var ttl = cfg.cacheCommitsHoras * 3600 * 1000;
    for (var i = 0; i < cfg.sites.length; i++) {
      var site = cfg.sites[i];
      if (!L.repoValido(site.repo)) continue;
      var chave = 'commit:' + site.repo, entrada = null;
      try { entrada = JSON.parse(ler(chave)); } catch (e) {}
      if (L.cacheValida(entrada, Date.now(), ttl)) { pintarCommit(site, entrada, true); continue; }
      var ate = Number(ler('gh-bloqueado-ate')) || 0;
      if (Date.now() < ate) { if (entrada) entrada.stale = true; pintarCommit(site, entrada, true); continue; }
      try {
        var resp = await fetch('https://api.github.com/repos/' + site.repo + '/commits?per_page=1', { headers: { Accept: 'application/vnd.github+json' } });
        var bloq = L.limiteAte(resp.status, resp.headers.get('x-ratelimit-remaining'), resp.headers.get('x-ratelimit-reset'), Date.now());
        if (bloq) { guardar('gh-bloqueado-ate', String(bloq)); if (entrada) entrada.stale = true; pintarCommit(site, entrada, true); continue; }
        if (resp.status === 404) { var vazio = { erro: '404', em: Date.now() }; guardar(chave, JSON.stringify(vazio)); pintarCommit(site, vazio); continue; }
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var j = await resp.json(), cm = j && j[0];
        var novo = { data: cm && cm.commit && cm.commit.committer && cm.commit.committer.date, url: cm && cm.html_url, em: Date.now() };
        if (!novo.data) throw new Error('sem commits');
        guardar(chave, JSON.stringify(novo));
        pintarCommit(site, novo);
      } catch (e) {
        if (entrada && entrada.data) entrada.stale = true;
        pintarCommit(site, entrada || { erro: 'rede' }, true);
      }
    }
    aCarregarCommits = false;
  }

  /* ---------- relógio de 1 s: contagem decrescente + tempos relativos ---------- */
  function tique() {
    var agoraMs = Date.now();
    $('ultima').textContent = 'Última verificação: ' + (ultimaRonda ? new Date(ultimaRonda).toLocaleTimeString('pt-PT') : '—');
    if (aVerificar) $('proxima').textContent = 'a verificar…';
    else if (proximaEm) {
      var s = Math.max(0, Math.round((proximaEm - agoraMs) / 1000));
      $('proxima').textContent = 'Próxima em ' + s + ' s';
      if (s === 0 && !document.hidden) ronda();
    }
    document.querySelectorAll('.cartao time[data-ts]').forEach(function (t) {
      t.textContent = L.tempoRelativo(Number(t.dataset.ts), agoraMs);
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && proximaEm && Date.now() >= proximaEm) ronda();
  });
  $('btn-atualizar').addEventListener('click', ronda);

  /* ---------- arranque ---------- */
  fetch('sites.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (j) {
      cfg = Object.assign(cfg, j);
      var ul = $('sites');
      cfg.sites.forEach(function (s) { ul.appendChild(criarCartao(s)); });
      pintarResumo();
      setInterval(tique, 1000);
      ronda();
    })
    .catch(function () { $('erro-lista').hidden = false; $('resumo-texto').textContent = 'Sem lista de sites'; });
})();
