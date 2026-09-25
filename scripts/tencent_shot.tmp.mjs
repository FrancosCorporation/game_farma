import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});

const geo = await page.evaluate(() => {
  const t = document.querySelector('.tcaptcha-transform');
  const ifr = document.querySelector('iframe[src*="captcha"]');
  const out = { t: null, ifr: null };
  if (t) { const r=t.getBoundingClientRect(); const cs=getComputedStyle(t); out.t = {x:r.x,y:r.y,w:r.width,h:r.height,disp:cs.display,vis:cs.visibility,op:cs.opacity,z:cs.zIndex}; }
  if (ifr) { const r=ifr.getBoundingClientRect(); const cs=getComputedStyle(ifr); out.ifr = {x:r.x,y:r.y,w:r.width,h:r.height,disp:cs.display,vis:cs.visibility,z:cs.zIndex}; }
  return out;
});
console.log('CAPTCHA GEO:', JSON.stringify(geo, null, 1));
await page.screenshot({ path: '/tmp/opencode/tencent_before.png', fullPage: false });
console.log('screenshot saved');
await browser.close();
