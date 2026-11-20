# estado-sites — painel de estado dos sites do Daniel

Site estático (sem build, sem servidor, sem segredos) em https://estado-sites.danielpro.dev.

- `sites.json` — única lista de sites (nome, URL, repo público opcional) e parâmetros (intervalo, timeout, cache).
- `status.js` — lógica pura (estados, resumo, cache, limites da API). Teste: `node test/status.test.js`.
- `app.js` / `style.css` / `index.html` — interface (PT, claro/escuro, 390 px, acessível).

Verificação feita no navegador: com CORS lê o código HTTP; sem CORS usa `no-cors` + ping por imagem e mostra "provável".
