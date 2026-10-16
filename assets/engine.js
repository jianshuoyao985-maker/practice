/* Pure practice logic. No network, dependencies, or browser APIs. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.createPracticeEngine = factory;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (bank) {
  'use strict';
  const questions = bank.questions;
  const byId = new Map(questions.map(q => [q.id, q]));
  const types = ['all', 'single', 'multiple', 'judge'];
  const modes = ['sequence', 'random', 'wrong', 'favorites', 'lookup'];
  const examRule = Object.freeze({ id: 'contest-90-v1', minutes: 30, total: 90, maxScore: 100,
    sections: Object.freeze([
      Object.freeze({ type: 'judge', count: 40, points: 1 }),
      Object.freeze({ type: 'single', count: 30, points: 1 }),
      Object.freeze({ type: 'multiple', count: 20, points: 1.5 })
    ]) });
  const legacyRule = 'legacy-equal';
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
  const int = (n, fallback = 0) => Number.isSafeInteger(n) && n >= 0 ? n : fallback;
  const emptyRecord = () => ({ attempts: 0, correct: 0, wrong: 0, lastAnswer: [], lastCorrect: null, lastAt: 0, wrongActive: false });
  function selection(q, values) {
    if (!Array.isArray(values)) return [];
    const allowed = q.options.map(o => o.key);
    return [...new Set(values.filter(v => allowed.includes(v)))].sort();
  }
  function grade(q, values) {
    const chosen = selection(q, values);
    return chosen.length > 0 && chosen.join('') === [...q.answer].sort().join('');
  }
  function shuffle(items, rng = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function freshState() {
    return { format: 1, app: 'tourism-practice', bankVersion: bank.version, records: {}, favorites: [], sessions: {},
      settings: { study: false, largeText: false }, view: { page: 'practice', mode: 'sequence', type: 'all', scope: 'all', key: 'sequence:all:all' }, exam: null, lastExam: null };
  }
  function pool(state, mode = 'sequence', type = 'all', scope = 'all') {
    return questions.filter(q => {
      if (type !== 'all' && q.type !== type) return false;
      if (mode === 'wrong' && !state.records[q.id]?.wrongActive) return false;
      if (mode === 'favorites' && !state.favorites.includes(q.id)) return false;
      if (scope === 'unanswered' && state.records[q.id]?.attempts > 0) return false;
      return true;
    }).map(q => q.id);
  }
  function makeSession(ids, mode = 'sequence') {
    return { ids: mode === 'random' ? shuffle(ids) : [...ids], index: 0, answers: {}, drafts: {}, startedAt: Date.now() };
  }
  function record(state, id, values, now = Date.now()) {
    const q = byId.get(id);
    if (!q) throw new Error('题目不存在');
    const chosen = selection(q, values);
    if (!chosen.length) throw new Error('请先选择答案');
    if (q.type !== 'multiple' && chosen.length !== 1) throw new Error('本题只能选择一个答案');
    const correct = grade(q, chosen);
    const r = state.records[id] || emptyRecord();
    r.attempts++; r.correct += Number(correct); r.wrong += Number(!correct);
    r.lastAnswer = chosen; r.lastCorrect = correct; r.lastAt = now; r.wrongActive = !correct;
    state.records[id] = r;
    return { kind: 'answered', selection: chosen, correct, timestamp: now };
  }
  function submit(state, session, id, values) {
    if (!session.ids.includes(id)) throw new Error('题目不在本轮练习中');
    if (session.answers[id]) return session.answers[id];
    const answer = record(state, id, values);
    session.answers[id] = answer;
    delete session.drafts[id];
    return answer;
  }
  function stats(state) {
    const records = Object.values(state.records);
    const attempts = records.reduce((n, r) => n + r.attempts, 0);
    const correct = records.reduce((n, r) => n + r.correct, 0);
    return { practiced: records.filter(r => r.attempts > 0).length, mastered: records.filter(r => r.lastCorrect === true).length,
      wrong: records.filter(r => r.wrongActive).length, favorites: state.favorites.length, attempts, correct,
      accuracy: attempts ? Math.round(correct / attempts * 100) : null };
  }
  function questionPoints(q) {
    return examRule.sections.find(section => section.type === q.type).points;
  }
  function validContestIds(ids) {
    return ids.length === examRule.total && new Set(ids).size === examRule.total &&
      examRule.sections.every(section => ids.filter(id => byId.get(id)?.type === section.type).length === section.count);
  }
  function makeExam(state, now = Date.now()) {
    if (state.exam) throw new Error('已有进行中的模拟练习');
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error('开始时间无效');
    const ids = examRule.sections.flatMap(section => {
      const available = pool(state, 'sequence', section.type);
      if (available.length < section.count) throw new Error('题库数量不足，无法按赛制组卷');
      return shuffle(available).slice(0, section.count);
    });
    state.exam = { rule: examRule.id, ids, index: 0, answers: {}, startedAt: now,
      deadline: now + examRule.minutes * 60000, minutes: examRule.minutes, type: 'all' };
    return state.exam;
  }
  function buildExamReport(results, rule, meta) {
    const weighted = rule === examRule.id;
    const scored = results.map(result => {
      const maxPoints = weighted ? questionPoints(byId.get(result.id)) : 100 / results.length;
      return { ...result, maxPoints, points: result.correct ? maxPoints : 0 };
    });
    const correct = scored.filter(r => r.correct).length;
    const breakdown = weighted ? examRule.sections.map(section => {
      const group = scored.filter(r => byId.get(r.id).type === section.type);
      return { type: section.type, count: group.length, correct: group.filter(r => r.correct).length,
        wrong: group.filter(r => !r.correct && !r.skipped).length, skipped: group.filter(r => r.skipped).length,
        pointsEach: section.points, score: group.reduce((sum, r) => sum + r.points, 0), maxScore: section.count * section.points };
    }) : [];
    return { ...meta, rule, results: scored, total: scored.length, correct, wrong: scored.filter(r => !r.correct && !r.skipped).length,
      skipped: scored.filter(r => r.skipped).length,
      score: weighted ? scored.reduce((sum, r) => sum + r.points, 0) : Math.round(correct / scored.length * 100),
      maxScore: 100, breakdown };
  }
  function finishExam(state, now = Date.now()) {
    if (!state.exam) return state.lastExam;
    const exam = state.exam;
    const results = exam.ids.map(id => {
      const q = byId.get(id); const values = selection(q, exam.answers[id]);
      const correct = grade(q, values);
      if (values.length) record(state, id, values, now);
      else { const r = state.records[id] || emptyRecord(); r.wrongActive = true; state.records[id] = r; }
      return { id, selection: values, correct, skipped: !values.length };
    });
    state.lastExam = buildExamReport(results, exam.rule === examRule.id ? examRule.id : legacyRule, {
      seconds: Math.max(0, Math.floor((Math.min(now, exam.deadline || now) - exam.startedAt) / 1000)), finishedAt: now, type: exam.type });
    state.exam = null;
    return state.lastExam;
  }
  function cleanSession(s) {
    if (!s || !Array.isArray(s.ids)) return null;
    const ids = [...new Set(s.ids.filter(id => byId.has(id)))];
    const result = { ids, index: Math.min(int(s.index), Math.max(0, ids.length - 1)), answers: {}, drafts: {}, startedAt: int(s.startedAt) };
    for (const id of ids) {
      const q = byId.get(id); const a = s.answers?.[id];
      if (a?.kind === 'revealed') result.answers[id] = { kind: 'revealed' };
      else if (a?.kind === 'answered') {
        let values = selection(q, a.selection);
        if (q.type !== 'multiple') values = values.slice(0, 1);
        if (values.length) result.answers[id] = { kind: 'answered', selection: values, correct: grade(q, values), timestamp: int(a.timestamp) };
      }
      let draft = selection(q, s.drafts?.[id]);
      if (q.type !== 'multiple') draft = draft.slice(0, 1);
      if (draft.length) result.drafts[id] = draft;
    }
    return result;
  }
  function hydrate(raw) {
    if (!raw || raw.app !== 'tourism-practice' || raw.format !== 1 || raw.bankVersion !== bank.version) throw new Error('备份格式或题库版本不匹配');
    const state = freshState();
    for (const q of questions) {
      const r = raw.records?.[q.id];
      if (!r || typeof r !== 'object') continue;
      const correct = int(r.correct), wrong = int(r.wrong);
      if (correct + wrong > 10000000) continue;
      let lastAnswer = selection(q, r.lastAnswer);
      if (q.type !== 'multiple') lastAnswer = lastAnswer.slice(0, 1);
      state.records[q.id] = { attempts: correct + wrong, correct, wrong, lastAnswer, lastCorrect: lastAnswer.length ? grade(q, lastAnswer) : null, lastAt: int(r.lastAt), wrongActive: Boolean(r.wrongActive) };
    }
    state.favorites = [...new Set(Array.isArray(raw.favorites) ? raw.favorites.filter(id => byId.has(id)) : [])];
    state.settings = { study: Boolean(raw.settings?.study), largeText: Boolean(raw.settings?.largeText) };
    for (const key of Object.keys(raw.sessions || {}).slice(0, 80)) {
      if (!/^(sequence|random|wrong|favorites):(all|single|multiple|judge):(all|unanswered)$/.test(key) && key !== 'lookup') continue;
      const session = cleanSession(raw.sessions[key]);
      if (session) state.sessions[key] = session;
    }
    if (raw.view && ['practice', 'search', 'exam', 'data'].includes(raw.view.page)) {
      state.view = { page: raw.view.page, mode: modes.includes(raw.view.mode) ? raw.view.mode : 'sequence', type: types.includes(raw.view.type) ? raw.view.type : 'all', scope: raw.view.scope === 'unanswered' ? 'unanswered' : 'all', key: '' };
      state.view.key = state.view.mode === 'lookup' ? 'lookup' : `${state.view.mode}:${state.view.type}:${state.view.scope}`;
    }
    if (raw.exam && Array.isArray(raw.exam.ids)) {
      const clean = cleanSession({ ...raw.exam, answers: {} });
      const rule = raw.exam.rule || legacyRule;
      const contest = rule === examRule.id;
      const valid = contest ? validContestIds(clean.ids) : rule === legacyRule;
      if (valid && clean.ids.length && int(raw.exam.startedAt) && (contest || raw.exam.deadline === null || int(raw.exam.deadline) >= int(raw.exam.startedAt))) {
        const startedAt = int(raw.exam.startedAt);
        state.exam = { rule, ids: clean.ids, index: clean.index, startedAt,
          deadline: contest ? startedAt + examRule.minutes * 60000 : raw.exam.deadline === null ? null : int(raw.exam.deadline),
          minutes: contest ? examRule.minutes : int(raw.exam.minutes), type: contest ? 'all' : types.includes(raw.exam.type) ? raw.exam.type : 'all', answers: {} };
        for (const id of clean.ids) {
          const q = byId.get(id); let values = selection(q, raw.exam.answers?.[id]);
          if (q.type !== 'multiple') values = values.slice(0, 1);
          if (values.length) state.exam.answers[id] = values;
        }
      }
    }
    if (raw.lastExam && Array.isArray(raw.lastExam.results)) {
      const seen = new Set();
      const results = raw.lastExam.results.filter(r => r && byId.has(r.id) && !seen.has(r.id) && seen.add(r.id)).map(r => {
        const q = byId.get(r.id); let values = selection(q, r.selection);
        if (q.type !== 'multiple') values = values.slice(0, 1);
        return { id: r.id, selection: values, correct: grade(q, values), skipped: !values.length };
      });
      const rule = raw.lastExam.rule || legacyRule;
      const valid = rule === examRule.id ? validContestIds(results.map(r => r.id)) : rule === legacyRule;
      if (valid && results.length) {
        state.lastExam = buildExamReport(results, rule, { seconds: int(raw.lastExam.seconds), finishedAt: int(raw.lastExam.finishedAt), type: types.includes(raw.lastExam.type) ? raw.lastExam.type : 'all' });
      }
    }
    return state;
  }
  return { questions, byId, types, modes, examRule, questionPoints, selection, grade, shuffle, freshState, pool, makeSession, record, submit, stats, makeExam, finishExam, hydrate, own };
});
