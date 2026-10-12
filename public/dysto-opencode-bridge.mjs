import http from 'node:http';

const HOST = process.env.DYSTO_BRIDGE_HOST || '127.0.0.1';
const PORT = Number(process.env.DYSTO_OPENCODE_BRIDGE_PORT || 11436);
const OPENCODE = (process.env.DYSTO_OPENCODE_URL || 'http://127.0.0.1:4096').replace(/\/$/, '');
const USERNAME = process.env.OPENCODE_SERVER_USERNAME || 'opencode';
const PASSWORD = process.env.OPENCODE_SERVER_PASSWORD || '';
const MAX_BODY = 1024 * 1024;
const ALLOWED_ORIGINS = new Set((process.env.DYSTO_ALLOWED_ORIGINS || 'https://sb-5hj233f78g7w.vercel.run,http://localhost:5173,http://127.0.0.1:5173').split(',').map(value => value.trim()).filter(Boolean));

function headers() {
  const value = { 'Content-Type': 'application/json' };
  if (PASSWORD) value.Authorization = 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
  return value;
}
async function request(path, options = {}) {
  return fetch(`${OPENCODE}${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) }, signal: AbortSignal.timeout(120000) });
}
async function readBody(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > MAX_BODY) throw new Error('Petición demasiado grande'); }
  return body ? JSON.parse(body) : {};
}
function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) { res.writeHead(403, { 'Vary': 'Origin' }); res.end('Origin not allowed'); return; }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url === '/health') {
    try {
      const response = await request('/global/health', { signal: AbortSignal.timeout(4000) });
      const body = await response.text();
      send(res, response.ok ? 200 : 502, { ok: response.ok, provider: 'opencode', opencode: OPENCODE, error: response.ok ? undefined : body.slice(0, 300) });
    } catch (error) {
      send(res, 502, { ok: false, provider: 'opencode', opencode: OPENCODE, error: `No se puede conectar con OpenCode: ${error instanceof Error ? error.message : String(error)}. Ejecutá opencode serve --hostname 127.0.0.1 --port 4096.` });
    }
    return;
  }
  if (req.method !== 'POST' || req.url !== '/api/chat') { send(res, 404, { error: 'Ruta no encontrada' }); return; }
  try {
    const input = await readBody(req);
    const messages = Array.isArray(input.messages) ? input.messages : [];
    const system = messages.filter(message => message?.role === 'system').map(message => String(message.content || '')).join('\n\n');
    const prompt = messages.filter(message => message?.role !== 'system').map(message => `${message?.role === 'assistant' ? 'Contexto previo del personaje' : 'Jugador'}: ${String(message?.content || '')}`).join('\n\n');
    if (!prompt.trim()) { send(res, 400, { error: 'Falta el mensaje del jugador' }); return; }
    const sessionResponse = await request('/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Dysto · diálogo NPC' }) });
    const sessionText = await sessionResponse.text();
    if (!sessionResponse.ok) { send(res, 502, { error: `OpenCode no pudo crear una sesión (${sessionResponse.status}): ${sessionText.slice(0, 500)}` }); return; }
    const session = JSON.parse(sessionText);
    const messageResponse = await request(`/session/${encodeURIComponent(session.id)}/message`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, tools: {}, parts: [{ type: 'text', text: prompt }] }),
    });
    const messageText = await messageResponse.text();
    if (!messageResponse.ok) { send(res, 502, { error: `OpenCode no pudo generar la respuesta (${messageResponse.status}): ${messageText.slice(0, 700)}` }); return; }
    const result = JSON.parse(messageText);
    const content = (result.parts || []).filter(part => part.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n').trim();
    if (!content) { send(res, 502, { error: 'OpenCode terminó sin devolver texto. Revisá el modelo configurado en OpenCode.' }); return; }
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ message: { role: 'assistant', content }, done: true }) + '\n');
  } catch (error) {
    send(res, 502, { error: `El puente OpenCode falló: ${error instanceof Error ? error.message : String(error)}` });
  }
});
server.listen(PORT, HOST, () => console.log(`Dysto OpenCode bridge listo en http://${HOST}:${PORT}; OpenCode: ${OPENCODE}`));
