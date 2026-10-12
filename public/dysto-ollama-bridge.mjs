import http from 'node:http';

const HOST = process.env.DYSTO_BRIDGE_HOST || '127.0.0.1';
const PORT = Number(process.env.DYSTO_BRIDGE_PORT || 11435);
const OLLAMA = (process.env.DYSTO_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const MAX_BODY = 1024 * 1024;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url === '/health') {
    try {
      const response = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) });
      const body = await response.text();
      res.writeHead(response.ok ? 200 : 502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: response.ok, ollamaStatus: response.status, ollama: OLLAMA, models: response.ok ? JSON.parse(body).models?.map(m => m.name) ?? [] : [], error: response.ok ? undefined : body.slice(0, 300) }));
    } catch (error) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, ollama: OLLAMA, error: `No se puede conectar con Ollama: ${error instanceof Error ? error.message : String(error)}` }));
    }
    return;
  }
  if (req.method !== 'POST' || req.url !== '/api/chat') {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'Ruta no encontrada' })); return;
  }
  let raw = ''; let tooLarge = false;
  req.setEncoding('utf8');
  for await (const chunk of req) { raw += chunk; if (raw.length > MAX_BODY) { tooLarge = true; break; } }
  if (tooLarge) { res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'Petición demasiado grande' })); return; }
  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.messages) || typeof payload.model !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'Se esperaba model y messages para Ollama' })); return;
    }
    const upstream = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    if (!upstream.body) { res.end(); return; }
    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch (error) {
    if (res.headersSent) { res.destroy(error instanceof Error ? error : undefined); return; }
    const detail = error instanceof Error ? error.message : String(error);
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: `El puente no pudo completar la petición a Ollama: ${detail}. Verificá que Ollama esté activo en ${OLLAMA}.` }));
  }
});

server.listen(PORT, HOST, () => console.log(`Dysto Ollama bridge listo en http://${HOST}:${PORT}; Ollama: ${OLLAMA}`));
server.on('error', error => { console.error(`No se pudo iniciar el puente: ${error.message}`); process.exitCode = 1; });
