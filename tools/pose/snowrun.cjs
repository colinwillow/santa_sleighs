// node tools/pose/snowrun.cjs <out.png> "fit=0&r=idle,walk"   -- tools/pose/snowcheck.html (the snowman pose check), same server as run.cjs
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../..'), types = { '.js': 'text/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.json': 'application/json' };
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); s.end(d); }); }).listen(0);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] }); const p = await b.newPage({ viewport: { width: 1260, height: 4100 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:' + srv.address().port + '/tools/pose/snowcheck.html?' + (process.argv[3] || '')); await p.waitForFunction(() => window.done, null, { timeout: 900000 });
  const el = await p.$('canvas'); await el.screenshot({ path: process.argv[2] });
  console.log(JSON.stringify(await p.evaluate(() => window.report), null, 1)); await b.close(); srv.close();
})();
