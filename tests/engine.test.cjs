'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sandbox = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/bank.js'), 'utf8'), sandbox);
const bank = JSON.parse(JSON.stringify(sandbox.window.QUESTION_BANK));
const E = require('../assets/engine.js')(bank);
const single = E.byId.get('single-001'), multi = E.byId.get('multiple-001'), judge = E.byId.get('judge-001');

test('题库500道、原题号连续、答案均指向有效选项', () => {
  assert.equal(bank.questions.length, 500); assert.equal(new Set(bank.questions.map(q => q.id)).size, 500);
  for (const [type, count] of Object.entries({ single: 150, multiple: 150, judge: 200 })) {
    const group = bank.questions.filter(q => q.type === type); assert.equal(group.length, count);
    assert.deepEqual(group.map(q => q.number), Array.from({ length: count }, (_, i) => i + 1));
  }
  for (const q of bank.questions) {
    assert.ok(q.text.trim()); assert.ok(q.sourcePages.every(p => p >= 2 && p <= 83));
    assert.equal(q.options.length, q.type === 'judge' ? 2 : 4);
    assert.ok(q.answer.every(a => q.options.some(o => o.key === a))); assert.equal(E.grade(q, q.answer), true);
  }
});
test('单选和判断判分；多选漏选、多选、错选判错，顺序不影响', () => {
  assert.equal(E.grade(single, ['B']), true); assert.equal(E.grade(single, ['A']), false); assert.equal(E.grade(single, []), false);
  assert.equal(E.grade(judge, ['F']), true); assert.equal(E.grade(judge, ['T']), false);
  for (const values of [['A', 'B'], ['A', 'B', 'C', 'D'], ['A', 'C', 'D'], []]) assert.equal(E.grade(multi, values), false);
  assert.equal(E.grade(multi, ['D', 'A', 'B']), true);
});
test('提交仅计一次；重答会更新错题本并保留历史次数', () => {
  const state = E.freshState(), session = E.makeSession([single.id]);
  E.submit(state, session, single.id, ['A']); E.submit(state, session, single.id, ['B']);
  assert.equal(E.stats(state).wrong, 1); assert.equal(E.stats(state).attempts, 1); assert.equal(E.stats(state).practiced, 1);
  delete session.answers[single.id]; E.submit(state, session, single.id, ['B']);
  assert.equal(E.stats(state).wrong, 0); assert.equal(E.stats(state).attempts, 2); assert.equal(E.stats(state).practiced, 1); assert.equal(E.stats(state).accuracy, 50);
});
test('未选择答案不能提交，单选不能同时选两个', () => {
  const state = E.freshState(), session = E.makeSession([single.id]);
  assert.throws(() => E.submit(state, session, single.id, []));
  assert.throws(() => E.submit(state, session, single.id, ['A', 'B']));
  assert.equal(E.stats(state).attempts, 0);
});
test('题型筛选、未练筛选、错题与收藏独立正确', () => {
  const state = E.freshState(); E.record(state, single.id, ['A']); E.record(state, judge.id, ['F']); state.favorites = [multi.id];
  assert.equal(E.pool(state, 'sequence', 'all', 'unanswered').length, 498);
  assert.equal(E.pool(state, 'sequence', 'single').length, 150);
  assert.deepEqual(E.pool(state, 'wrong'), [single.id]); assert.deepEqual(E.pool(state, 'favorites'), [multi.id]);
  assert.deepEqual(E.pool(state, 'wrong', 'judge'), []);
});
test('随机洗牌保留所有题目、不重复，不更改输入', () => {
  const input = bank.questions.map(q => q.id); const copy = [...input]; const shuffled = E.shuffle(input, () => 0.25);
  assert.deepEqual(input, copy); assert.equal(new Set(shuffled).size, 500); assert.notDeepEqual(shuffled, input);
  assert.deepEqual([...shuffled].sort(), [...input].sort());
});
test('模拟提交统一评分，未答加入错题，交卷幂等', () => {
  const state = E.freshState(); const exam = E.makeExam(state, 100000);
  const [a, b, c] = exam.ids.map(id => E.byId.get(id));
  exam.answers[a.id] = [...a.answer]; exam.answers[b.id] = []; // all other questions unanswered
  assert.equal(E.stats(state).attempts, 0);
  const result = E.finishExam(state, 160000);
  assert.equal(result.correct, 1); assert.equal(result.skipped, 89); assert.equal(result.score, 1); assert.equal(result.seconds, 60);
  assert.equal(E.stats(state).attempts, 1); assert.equal(E.stats(state).practiced, 1); assert.equal(E.stats(state).wrong, 89);
  assert.equal(state.records[c.id].wrongActive, true); E.finishExam(state, 170000); assert.equal(E.stats(state).attempts, 1);
});
test('固定30分钟计时，刷新保留题目与答案并固定截止时间', () => {
  const state = E.freshState(); const exam = E.makeExam(state, 100000);
  exam.index = 77; exam.answers[exam.ids[0]] = ['T'];
  assert.equal(exam.minutes, 30); assert.equal(exam.deadline, 1900000); assert.equal(exam.rule, E.examRule.id);
  const restored = E.hydrate(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.exam.deadline, 1900000); assert.equal(restored.exam.index, 77); assert.deepEqual(restored.exam.answers, exam.answers);
  state.exam.deadline = 99999999; state.exam.minutes = 200;
  const fixed = E.hydrate(state); assert.equal(fixed.exam.deadline, 1900000); assert.equal(fixed.exam.minutes, 30);
  assert.throws(() => E.makeExam(state));
});
test('备份往返保留进度、收藏、草稿和错题；不信任备份中的统计', () => {
  const state = E.freshState(); E.record(state, multi.id, ['A']); state.favorites = [multi.id];
  state.sessions['sequence:all:all'] = E.makeSession([single.id, multi.id]); state.sessions['sequence:all:all'].index = 1;
  state.sessions['sequence:all:all'].drafts[multi.id] = ['B', 'D'];
  const restored = E.hydrate(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(E.stats(restored), E.stats(state)); assert.deepEqual(restored.favorites, [multi.id]);
  assert.deepEqual(restored.sessions['sequence:all:all'].drafts[multi.id], ['B', 'D']); assert.equal(restored.sessions['sequence:all:all'].index, 1);
  state.records[multi.id].attempts = 900; state.records[multi.id].lastCorrect = true;
  const sanitized = E.hydrate(state); assert.equal(sanitized.records[multi.id].attempts, 1); assert.equal(sanitized.records[multi.id].lastCorrect, false);
  assert.throws(() => E.hydrate({ format: 1 })); assert.throws(() => E.hydrate({ ...state, bankVersion: 'other' }));
});
test('背题标记不冒充真实作答；坏数据不污染题库', () => {
  const state = E.freshState(); state.sessions['sequence:all:all'] = E.makeSession([single.id]);
  state.sessions['sequence:all:all'].answers[single.id] = { kind: 'revealed' };
  state.favorites = ['bad-id', single.id, single.id]; state.records['bad-id'] = { attempts: 999 };
  const restored = E.hydrate(state); assert.equal(E.stats(restored).attempts, 0); assert.deepEqual(restored.favorites, [single.id]);
  assert.equal(restored.records['bad-id'], undefined); assert.equal(restored.sessions['sequence:all:all'].answers[single.id].kind, 'revealed');
});

test('每次按40判断、30单选、20多选随机组卷，卷内不重复', () => {
  const variants = new Set();
  for (let round = 0; round < 25; round++) {
    const exam = E.makeExam(E.freshState());
    assert.equal(exam.ids.length, 90); assert.equal(new Set(exam.ids).size, 90);
    assert.ok(exam.ids.slice(0, 40).every(id => id.startsWith('judge-')));
    assert.ok(exam.ids.slice(40, 70).every(id => id.startsWith('single-')));
    assert.ok(exam.ids.slice(70).every(id => id.startsWith('multiple-')));
    variants.add(exam.ids.join(','));
  }
  assert.ok(variants.size > 1);
});
test('全对得100分；只错一题多选得98.5分，分题型得分精确', () => {
  const state = E.freshState(), exam = E.makeExam(state);
  for (const id of exam.ids) exam.answers[id] = [...E.byId.get(id).answer];
  assert.equal(E.finishExam(state).score, 100);
  const next = E.makeExam(state), missed = next.ids[70];
  for (const id of next.ids) next.answers[id] = [...E.byId.get(id).answer];
  next.answers[missed] = [E.byId.get(missed).answer[0]]; // incomplete multi-choice answer
  const result = E.finishExam(state);
  assert.equal(result.correct, 89); assert.equal(result.score, 98.5); assert.equal(result.wrong, 1);
  assert.deepEqual(result.breakdown.map(r => [r.type, r.score, r.maxScore]), [['judge', 40, 40], ['single', 30, 30], ['multiple', 28.5, 30]]);
  assert.equal(result.results.find(r => r.id === missed).maxPoints, 1.5);
  const restored = E.hydrate(JSON.parse(JSON.stringify(state))); assert.equal(restored.lastExam.score, 98.5); assert.equal(restored.lastExam.rule, E.examRule.id);
});
test('得分按各题权重累加；未答、漏选、多选均不得分', () => {
  const state = E.freshState(), exam = E.makeExam(state);
  const chosen = [exam.ids[0], exam.ids[40], exam.ids[70]];
  for (const id of chosen) exam.answers[id] = [...E.byId.get(id).answer];
  const short = exam.ids[71], extra = exam.ids.find(id => E.byId.get(id).type === 'multiple' && E.byId.get(id).answer.length < 4 && !chosen.includes(id) && id !== short);
  exam.answers[short] = [E.byId.get(short).answer[0]];
  if (extra) exam.answers[extra] = ['A', 'B', 'C', 'D'];
  const result = E.finishExam(state);
  assert.equal(result.correct, 3); assert.equal(result.score, 3.5);
  assert.equal(result.breakdown.reduce((n, r) => n + r.score, 0), 3.5);
  state.lastExam.score = 100; state.lastExam.results[0].points = 999;
  assert.equal(E.hydrate(state).lastExam.score, 3.5);
});
test('更新兼容旧进度与旧模拟报告，旧模拟不按新权重重算', () => {
  const state = E.freshState(); E.record(state, single.id, ['B']); state.favorites = [multi.id];
  state.exam = { ids: [single.id, multi.id, judge.id], index: 1, answers: { [single.id]: ['B'], [multi.id]: [...multi.answer] }, startedAt: 100000, deadline: 160000, minutes: 1, type: 'all' };
  const restored = E.hydrate(JSON.parse(JSON.stringify(state))); assert.equal(restored.exam.rule, 'legacy-equal'); assert.equal(restored.exam.deadline, 160000);
  assert.deepEqual(restored.favorites, [multi.id]); assert.equal(restored.records[single.id].correct, 1);
  const result = E.finishExam(restored, 150000); assert.equal(result.score, 67); assert.equal(result.rule, 'legacy-equal');
  delete restored.lastExam.rule;
  assert.equal(E.hydrate(restored).lastExam.score, 67);
  const next = E.makeExam(restored); assert.equal(next.ids.length, 90); assert.equal(next.rule, E.examRule.id);
});
