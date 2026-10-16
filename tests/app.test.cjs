/* Controller tests with a minimal DOM adapter. These are not real-browser tests. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KEY = 'tourism-practice:2026:v1';
function app(storage = new Map(), failingStorage = false) {
  const nodes = new Map(), events = {}, timers = [], downloads = [];
  let clock = 1792152000000;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', value: '', hidden: false, open: false, isConnected: true, dataset: {},
      classList: { toggle() {} }, addEventListener(name, fn) { this[name] = fn; }, focus() {}, scrollIntoView() {},
      showModal() { this.open = true; }, close() { this.open = false; }, appendChild() {}, remove() {}, click() {} });
    return nodes.get(id);
  }
  const doc = { activeElement: null, hidden: false, body: node('body'), querySelector: node, querySelectorAll: () => [], getElementById: id => node('#' + id),
    addEventListener(name, fn) { (events[name] ||= []).push(fn); }, createElement: () => node('created') };
  class FakeDate extends Date { static now() { return clock; } }
  const context = { document: doc, localStorage: { getItem: k => storage.get(k) || null, setItem(k, v) { if (failingStorage) throw new Error('disabled'); storage.set(k, v); } },
    Date: FakeDate, Blob, URL: { createObjectURL(blob) { downloads.push(blob); return 'blob:local-test'; }, revokeObjectURL() {} },
    setTimeout: () => 1, clearTimeout() {}, setInterval: fn => timers.push(fn), FormData: class { constructor(form) { this.values = form.values; } get(k) { return this.values[k]; } },
    scrollTo() {}, addEventListener() {}, console };
  context.window = context; vm.createContext(context);
  for (const file of ['bank.js', 'engine.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets', file), 'utf8'), context, { filename: file });
  function click(action, data = {}) {
    const element = { dataset: { action, ...data }, disabled: false, tagName: 'BUTTON', closest() { return this; } };
    for (const fn of events.click || []) fn({ target: element });
  }
  return { storage, nodes, node, click, events, timers, downloads, bank: context.QUESTION_BANK,
    state: () => JSON.parse(storage.get(KEY)), html: () => node('#main').innerHTML,
    submit(id, values) { for (const fn of events.submit || []) fn({ target: { id, values }, preventDefault() {} }); },
    tick(ms) { clock += ms; for (const fn of timers) fn(); } };
}
test('页面流程：作答、错题重练、收藏、背题和刷新续练', () => {
  const a = app(); assert.match(a.html(), /康养旅游与传统/); assert.doesNotMatch(a.html(), /id="feedback"/);
  a.click('choose', { value: 'A' }); a.click('submit'); assert.equal(a.state().records['single-001'].wrongActive, true); assert.match(a.html(), /再想一想/);
  a.click('favorite', { id: 'single-001' }); assert.deepEqual(a.state().favorites, ['single-001']);
  a.click('wrong'); a.click('choose', { value: 'B' }); a.click('submit'); assert.equal(a.state().records['single-001'].wrongActive, false);
  a.click('sequence'); a.click('type', { type: 'multiple' });
  for (const key of ['A', 'B']) a.click('choose', { value: key }); a.click('submit'); assert.equal(a.state().records['multiple-001'].lastCorrect, false);
  a.click('retry'); for (const key of ['D', 'B', 'A']) a.click('choose', { value: key }); a.click('submit'); assert.equal(a.state().records['multiple-001'].lastCorrect, true);
  a.click('next'); a.click('study'); const attempts = a.state().records['multiple-001'].attempts; assert.match(a.html(), /查看答案不计入/);
  a.click('study'); a.click('peek'); assert.equal(a.state().records['multiple-002'], undefined); assert.equal(a.state().records['multiple-001'].attempts, attempts);
  const b = app(a.storage); assert.match(b.html(), /按数据性质分类/); assert.match(b.html(), /题库标准答案/);
});
test('搜索、题型筛选、打开题目、答题卡跳转', () => {
  const a = app(); a.click('search'); a.node('#search-input').value = 'GIS'; a.click('run-search');
  assert.match(a.node('#search-list').innerHTML, /GIS/); assert.doesNotMatch(a.node('#search-list').innerHTML, /没有找到/);
  const id = a.node('#search-list').innerHTML.match(/data-id="([^"]+)"/)[1]; a.click('open-question', { id }); assert.match(a.html(), /GIS/);
  a.click('sheet'); assert.equal(a.node('#dialog').open, true); assert.match(a.node('#dialog-content').innerHTML, /本轮答题卡/);
  a.click('jump', { index: '1' }); assert.equal(a.node('#dialog').open, false); assert.equal(a.state().sessions.lookup.index, 1);
});
test('固定赛制界面、每题分值、交卷报告显示半分和分题型成绩', () => {
  const a = app(); a.click('exam');
  assert.match(a.html(), /比赛赛制模拟/); assert.match(a.html(), /开始 30 分钟模拟/); assert.doesNotMatch(a.html(), /id="exam-count"|id="exam-type"/);
  a.submit('exam-form', {});
  let s = a.state(), ids = s.exam.ids;
  assert.equal(ids.length, 90); assert.equal(s.exam.deadline - s.exam.startedAt, 1800000);
  const first = a.bank.questions.find(q => q.id === ids[0]), multi = a.bank.questions.find(q => q.id === ids[70]);
  a.click('choose', { value: first.answer[0] }); a.click('jump', { index: '70' });
  assert.match(a.html(), /本题 1.5 分/);
  for (const value of multi.answer) a.click('choose', { value });
  assert.equal(Object.keys(a.state().records).length, 0); assert.doesNotMatch(a.html(), /id="feedback"/);
  a.click('finish-exam'); assert.match(a.node('#dialog-content').innerHTML, /88 道题未作答/); a.click('confirm-exam');
  s = a.state(); assert.equal(s.lastExam.correct, 2); assert.equal(s.lastExam.skipped, 88); assert.equal(s.lastExam.score, 2.5);
  assert.match(a.html(), /本次练习报告/); assert.match(a.html(), /分题型成绩/); assert.match(a.html(), /<strong>2.5<\/strong>/);
  a.click('report-question', { id: ids[70] }); assert.match(a.node('#dialog-content').innerHTML, /1.5 \/ 1.5 分/);
  a.click('close-dialog'); a.click('review-mistakes'); assert.equal(a.state().sessions.lookup.ids.length, 88);
});
test('模拟刷新后在30分钟边界自动交卷，重复计时不会重复记分', () => {
  const a = app(); a.click('exam'); a.submit('exam-form', {});
  const id = a.state().exam.ids[0], q = a.bank.questions.find(q => q.id === id); a.click('choose', { value: q.answer[0] });
  const b = app(a.storage); assert.ok(b.state().exam); b.tick(1799000); assert.ok(b.state().exam);
  b.tick(1000);
  assert.equal(b.state().exam, null); assert.equal(b.state().lastExam.correct, 1); assert.equal(b.state().lastExam.skipped, 89);
  assert.equal(b.state().lastExam.score, 1); assert.equal(b.state().lastExam.seconds, 1800);
  assert.equal(b.state().records[id].attempts, 1); b.tick(5000); assert.equal(b.state().records[id].attempts, 1);
});
test('导出、导入、字体设置与清空确认可用', async () => {
  const a = app(); a.click('choose', { value: 'B' }); a.click('submit'); a.click('data'); a.click('font'); assert.equal(a.state().settings.largeText, true);
  a.click('export'); assert.equal(a.downloads.length, 1); const backup = await a.downloads[0].text(); assert.equal(JSON.parse(backup).records['single-001'].correct, 1);
  a.click('reset'); assert.equal(a.state().records['single-001'].correct, 1); a.click('confirm-reset'); assert.equal(Object.keys(a.state().records).length, 0);
  await a.node('#import-file').change({ target: { files: [{ size: backup.length, text: async () => backup }], value: 'fake' } });
  assert.match(a.node('#dialog-content').innerHTML, /已练 1 道/); a.click('confirm-import'); assert.equal(a.state().records['single-001'].correct, 1);
});
test('存储不可用时仍可练习并提示导出；损坏进度不导致白屏', () => {
  const a = app(new Map(), true); a.click('choose', { value: 'B' }); a.click('submit'); assert.match(a.html(), /回答正确/); assert.match(a.node('#storage-warning').textContent, /未能保存/);
  const b = app(new Map([[KEY, '{broken-json']])); assert.match(b.html(), /康养旅游与传统/); assert.match(b.node('#storage-warning').textContent, /无法读取/);
});
