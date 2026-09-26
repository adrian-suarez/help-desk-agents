/**
 * Servicios corporativos simulados en localhost para probar la skill de diagnóstico.
 *   MOCK_FAIL=sso      → /sso/health responde 503
 *   MOCK_SLOW=erp      → /erp/health tarda 1,5 s
 *   MOCK_NO_GATEWAY=1  → no abre el puerto del gateway VPN
 */
import http from 'node:http';
import net from 'node:net';

const list = (v) => new Set((v ?? '').split(',').filter(Boolean));
const fail = list(process.env.MOCK_FAIL);
const slow = list(process.env.MOCK_SLOW);

http
  .createServer((req, res) => {
    const first = req.url.split('/').filter(Boolean)[0];
    const name = first === 'health' ? 'intranet' : first;
    const reply = () => {
      const code = fail.has(name) ? 503 : 200;
      res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify({ service: name, up: code === 200 }));
    };
    slow.has(name) ? setTimeout(reply, 1500) : reply();
  })
  .listen(18080, '127.0.0.1', () => console.log('Servicios simulados en http://127.0.0.1:18080'));

if (!process.env.MOCK_NO_GATEWAY) {
  net.createServer((s) => s.end()).listen(10443, '127.0.0.1', () => console.log('Gateway VPN simulado en 127.0.0.1:10443'));
}
