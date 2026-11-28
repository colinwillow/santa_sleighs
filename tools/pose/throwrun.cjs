// node tools/pose/throwrun.cjs ["walk=0"]  -- b93 THROW PROBE: boots the REAL onfoot.js (stub rig / input), walks, cocks / holds / releases the
// grenade five times and prints per frame: base role, throw state, the summed mixer weight on RightArm and its angle off BIND
// (an arm at ~0-3 deg off bind with weight 1 = the T-pose).
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../..'), types = { '.js': 'text/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.json': 'application/json' };
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); s.end(d); }); }).listen(0);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] }); const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => { if (/warn|error/.test(m.type())) console.log('CON', m.text()); });
  await p.goto('http://localhost:' + srv.address().port + '/tools/pose/throwprobe.html?' + (process.argv[2] || '')); await p.waitForFunction(() => window.done, null, { timeout: 180000 });
  const r = await p.evaluate(() => window.report);
  for (const e of r) console.log(JSON.stringify(e));
  await b.close(); srv.close();
})();
