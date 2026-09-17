import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', e => console.log('FULL ERROR:\n' + e.stack?.split('\n').slice(0, 8).join('\n')));
await p.goto(process.argv[2], { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await p.waitForTimeout(4000);
await b.close();
