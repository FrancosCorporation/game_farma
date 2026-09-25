import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});

const info = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /立即生成|Gerar imediatamente/.test(b.innerText));
  const propsKey = Object.keys(btn).find(k => k.startsWith('__reactProps'));
  const fiberKey = Object.keys(btn).find(k => k.startsWith('__reactFiber'));
  const props = btn[propsKey];
  const out = { hasOnClick: typeof props.onClick, onClickSrc: props.onClick ? props.onClick.toString().slice(0,800) : null };

  // sobe a arvore de fibers procurando estado com quota/credit/images
  let f = btn[fiberKey];
  const states = [];
  let depth = 0;
  while (f && depth < 40) {
    const p = f.memoizedProps;
    if (p && typeof p === 'object') {
      const s = {};
      for (const k of Object.keys(p)) {
        const v = p[k];
        if (typeof v === 'function') s[k] = 'fn';
        else if (v === null) s[k] = null;
        else if (typeof v === 'object') s[k] = 'obj:' + (Array.isArray(v) ? 'arr['+v.length+']' : Object.keys(v).slice(0,8).join(','));
        else s[k] = String(v).slice(0,60);
      }
      if (Object.keys(s).length) states.push({ depth, type: String((f.type && (f.type.name || f.type)) || '?'), props: s });
    }
    f = f.return; depth++;
  }
  out.tree = states.slice(0, 25);
  return out;
});
console.log(JSON.stringify(info, null, 1).slice(0, 6000));
await browser.close();
