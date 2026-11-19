import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
function load(url, mocks) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(url,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(js,{module,exports:module.exports,require:s=>s in mocks?mocks[s]:require(s),Date,setInterval,clearInterval});
  return module.exports;
}
test('real shared clock updates route age; strict five-minute and 24-hour stale boundaries', async t=>{
  const epoch=1794993000000;
  t.mock.timers.enable({apis:['Date','setInterval'],now:epoch});
  const dom=new JSDOM('<div id="root"></div>');
  const saved={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  const {useNow}=load(new URL('../../shared/lib/useNow.ts',import.meta.url),{'@/shared/lib/useDocumentVisible':{useDocumentVisible:()=>true}});
  const mod=load(new URL('./RuntimeRouteAge.tsx',import.meta.url),{'@/shared/lib/useNow':{useNow}});
  const root=createRoot(document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(mod.RuntimeRouteAge,{attestedAt:epoch/1000})));
    assert.match(document.body.textContent,/Last advertised route · 0s ago/);
    await act(async()=>t.mock.timers.tick(120000));
    assert.match(document.body.textContent,/2m ago/);
    await act(async()=>t.mock.timers.tick(180000));
    assert.doesNotMatch(document.body.textContent,/STALE/);
    await act(async()=>t.mock.timers.tick(60000));
    assert.match(document.body.textContent,/6m ago · STALE · stale, may be offline/);
    await act(async()=>t.mock.timers.tick(86040000));
    assert.doesNotMatch(document.body.textContent,/over 24 h/);
    await act(async()=>t.mock.timers.tick(60000));
    assert.match(document.body.textContent,/Stale \(over 24 h\)/);
    assert.doesNotMatch(document.body.textContent,/\bonline\b/);
    assert.equal(mod.routeAge(epoch/1000+60,epoch).relative,'0s ago');
    assert.equal(mod.routeAge(epoch/1000,epoch+300001).stale,true);
    assert.equal(mod.routeAge(epoch/1000,epoch+301000).stale,true);
  } finally {
    await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,saved);t.mock.timers.reset();
  }
});
