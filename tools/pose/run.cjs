// node tools/pose/run.cjs <out.png> "fit=nocoat&r=idle,walk,run,fire"   (serves the repo itself on :8131)
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../..'), types = { '.js': 'text/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.json': 'application/json' };
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); s.end(d); }); }).listen(8131);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] }); const p = await b.newPage({ viewport: { width: 1260, height: 1840 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8131/tools/pose/posecheck.html?' + (process.argv[3] || '')); await p.waitForFunction(() => window.done, null, { timeout: 180000 });
  const el = await p.$('canvas'); await el.screenshot({ path: process.argv[2] });
  console.log(JSON.stringify(await p.evaluate(() => window.report), null, 1)); await b.close(); srv.close();
})();
