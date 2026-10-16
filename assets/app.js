(function () {
  'use strict';
  const bank = window.QUESTION_BANK;
  if (!bank || !window.createPracticeEngine) {
    document.getElementById('main').textContent = '题库加载失败，请确认 assets 文件夹已和 index.html 一起上传。';
    return;
  }
  const E = window.createPracticeEngine(bank);
  const STORAGE_KEY = 'tourism-practice:2026:v1';
  const TYPE = { all: '全部题型', single: '单选题', multiple: '多选题', judge: '判断题' };
  const MODE = { sequence: '顺序练习', random: '随机刷题', wrong: '错题巩固', favorites: '我的收藏', lookup: '题库练习' };
  const DESC = { sequence: '沿着原题顺序，把知识一点点积累起来。', random: '打乱题目顺序，看看自己是否真的记住了。', wrong: '把容易混淆的知识，再认真练习一次。', favorites: '留住重点，让下一次复习更有方向。', lookup: '找到想练的题，专注解决一个知识点。' };
  const paths = { sequence: '<path d="M5 4h14v17l-7-4-7 4z"/><path d="M9 8h6M9 11h6"/>', random: '<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2.5 0 4.3-3.1 6-6M15 6c1-.9 2-1 3-1h3m-4-4 4 4-4 4"/>', wrong: '<path d="M12 3 2 21h20L12 3zM12 9v5m0 3v1"/>', favorites: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3L2.8 9.7l6.4-.9z"/>', exam: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 2h6v4H9zM9 11h6m-6 4h6"/>', search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>', check: '<path d="m5 12 4 4L19 6"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>', next: '<path d="m9 5 7 7-7 7"/>', prev: '<path d="m15 5-7 7 7 7"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' };
  function icon(name, filled = false) { return `<svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sequence}</svg>`; }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const $ = selector => document.querySelector(selector);
  let state = E.freshState(), storageMessage = '';
  try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) state = E.hydrate(JSON.parse(saved)); }
  catch (error) { storageMessage = '暂时无法读取已保存的进度。你可以继续练习，或在「备份与设置」中导入进度备份。'; }
  let searchText = '', searchType = 'all', searchPage = 0, searchMatches = [], examConfig = false, reportFilter = 'wrong';
  let toastTimer, searchTimer, lastFocus;
  function warn(message) { storageMessage = message; const el = $('#storage-warning'); el.textContent = message; el.hidden = !message; }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); if (storageMessage) warn(''); }
    catch (error) { warn('浏览器未能保存进度，本次练习仍可继续。离开前请在「备份与设置」中导出备份。'); }
  }
  function toast(message) { clearTimeout(toastTimer); const el = $('#toast'); el.textContent = message; el.hidden = false; toastTimer = setTimeout(() => { el.hidden = true; }, 3000); }
  function openDialog(title, body) {
    lastFocus = document.activeElement;
    $('#dialog-content').innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-button" data-action="close-dialog" aria-label="关闭弹窗">${icon('close')}</button></div><div class="dialog-body">${body}</div>`;
    if (!$('#dialog').open) $('#dialog').showModal();
  }
  function closeDialog() { $('#dialog').close(); if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true }); }
  function statsStrip() {
    const s = E.stats(state);
    return `<div class="stats-strip" aria-label="累计学习统计"><div class="stat"><span class="stat-label">已练题目</span><span class="stat-value">${s.practiced}<small>/ 500</small></span></div><div class="stat"><span class="stat-label">累计正确率</span><span class="stat-value">${s.accuracy === null ? '—' : s.accuracy + '%'}<small>按作答次数</small></span></div><div class="stat"><span class="stat-label">待巩固错题</span><span class="stat-value">${s.wrong}<small>道</small></span></div><div class="stat"><span class="stat-label">收藏题目</span><span class="stat-value">${s.favorites}<small>道</small></span></div></div>`;
  }
  function heading(title, subtitle, tag = '') {
    return `<div class="page-heading"><div><div class="eyebrow">2026 · 旅游技能竞赛</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${tag ? `<div class="heading-tag">${tag}</div>` : ''}</div>`;
  }
  function navigation() {
    const s = E.stats(state);
    const current = state.view.page === 'practice' ? (state.view.mode === 'lookup' ? 'search' : state.view.mode) : state.view.page;
    const items = [['sequence', '顺序练习'], ['random', '随机刷题'], ['wrong', '错题巩固', s.wrong], ['favorites', '我的收藏', s.favorites], ['exam', '模拟练习'], ['search', '题库检索']];
    function nav(items, mobile = false) {
      const short = { sequence: '练习', wrong: '错题', favorites: '收藏', exam: '模拟', search: '题库' };
      return items.map(([key, label, count]) => `<button class="nav-button ${current === key || (mobile && key === 'sequence' && current === 'random') ? 'active' : ''}" data-action="${key}" ${current === key ? 'aria-current="page"' : ''}>${icon(key)}<span>${mobile ? short[key] : label}</span>${count ? `<span class="nav-count">${count}</span>` : ''}</button>`).join('');
    }
    $('#navigation').innerHTML = nav(items);
    $('#mobile-navigation').innerHTML = nav(items.filter(i => i[0] !== 'random'), true);
    $('#side-progress').innerHTML = `<div class="mini-row"><span>全题库进度</span><span>${Math.round(s.practiced / 5)}%</span></div><div class="progress-track" role="progressbar" aria-label="全题库完成度" aria-valuenow="${s.practiced}" aria-valuemin="0" aria-valuemax="500"><div class="progress-fill" style="width:${s.practiced / 5}%"></div></div><p>已经练习 ${s.practiced} 道，还有 ${500 - s.practiced} 道。</p>`;
  }
  function session() {
    const v = state.view;
    if (!state.sessions[v.key]) state.sessions[v.key] = E.makeSession(E.pool(state, v.mode, v.type, v.scope), v.mode);
    return state.sessions[v.key];
  }
  function enterPractice(mode = 'sequence', type = 'all', scope = 'all', force = false) {
    const key = `${mode}:${type}:${scope}`;
    state.view = { page: 'practice', mode, type, scope, key };
    if (force || !state.sessions[key]) state.sessions[key] = E.makeSession(E.pool(state, mode, type, scope), mode);
    save(); render(); window.scrollTo(0, 0);
  }
  function typeTabs(value, search = false) {
    return `<div class="type-tabs" role="group" aria-label="按题型筛选">${E.types.map(t => `<button class="type-tab ${value === t ? 'active' : ''}" data-action="${search ? 'search-type' : 'type'}" data-type="${t}" aria-pressed="${value === t}">${t === 'all' ? '全部' : TYPE[t]}<span>${t === 'all' ? 500 : bank.counts[t]}</span></button>`).join('')}</div>`;
  }
  function empty(title, description, action = 'sequence', label = '开始顺序练习') {
    return `<div class="empty-state"><div class="empty-illustration" aria-hidden="true">✓</div><h2>${esc(title)}</h2><p>${esc(description)}</p><button class="button primary" data-action="${action}">${esc(label)}</button></div>`;
  }
  function answerText(q, values) {
    return values?.length ? q.options.filter(o => values.includes(o.key)).map(o => q.type === 'judge' ? o.text : `${o.key}. ${o.text}`).join('；') : '未作答';
  }
  function sourceRow(q) {
    return `<div class="source-row"><span>原题编号：${TYPE[q.type]} ${q.number}</span><a href="${esc(bank.sourceFile)}#page=${q.sourcePage}" target="_blank" rel="noopener">原 PDF 第 ${q.sourcePages.join('、')} 页 ↗</a></div>`;
  }
  function answerBox(q, result, study = false) {
    const revealed = study || result?.kind === 'revealed';
    if (!revealed && !result) return '';
    const correct = result?.correct;
    return `<div id="feedback" tabindex="-1" class="answer-box ${revealed ? 'study' : correct ? '' : 'wrong'}" role="status"><div class="answer-heading">${revealed ? '题库标准答案' : correct ? '✓ 回答正确' : '再想一想，这道题已加入错题本'}</div>${!revealed ? `<div>你的答案：<strong>${esc(q.type === 'judge' ? answerText(q, result.selection) : result.selection.join('、'))}</strong></div>` : ''}<div>正确答案：<strong>${esc(q.type === 'judge' ? answerText(q, q.answer) : q.answer.join('、'))}</strong></div>${q.type !== 'judge' ? `<div class="answer-sub">${esc(answerText(q, q.answer))}</div>` : ''}<div class="answer-sub">${revealed ? '查看答案不计入已练题目与正确率。' : correct ? '已记录本次作答。重练答对的题目会移出错题本。' : q.type === 'multiple' ? '多选题需完全一致；漏选、错选、多选均判错。' : '对照题干中的关键词，稍后再练一次。'}</div>${q.sourceNote ? `<div class="answer-sub">原题附注：${esc(q.sourceNote)}</div>` : ''}${sourceRow(q)}</div>`;
  }
  function questionCard(q, s, isExam = false) {
    const result = isExam ? null : s.answers[q.id];
    const study = !isExam && state.settings.study;
    const showAnswer = !isExam && (Boolean(result) || study);
    const chosen = isExam ? (s.answers[q.id] || []) : (result?.selection || s.drafts[q.id] || []);
    const favorite = state.favorites.includes(q.id);
    const hint = isExam ? '答案自动保存，交卷后统一查看结果。' : study ? '背题模式 · 先理解题干，再记住关键知识。' : q.type === 'multiple' ? '请选择所有正确选项，选完后点击「提交答案」。' : '请选择一个答案，再点击「提交答案」。';
    const options = q.options.map((o, i) => {
      const selected = chosen.includes(o.key), correct = q.answer.includes(o.key);
      const classes = showAnswer ? (correct ? 'correct' : selected ? 'incorrect' : '') : selected ? 'selected' : '';
      const mark = showAnswer ? correct ? 'check' : selected ? 'close' : '' : selected ? 'check' : '';
      return `<button class="option ${classes}" data-action="choose" data-value="${o.key}" aria-pressed="${selected}" ${showAnswer ? 'disabled' : ''}><span class="option-letter">${q.type === 'judge' ? (i === 0 ? '✓' : '×') : o.key}</span><span class="option-text">${esc(o.text)}</span>${mark ? `<span class="option-icon">${icon(mark)}</span><span class="sr-only">${showAnswer ? correct ? '正确选项' : '你的错误选项' : '已选'}</span>` : ''}</button>`;
    }).join('');
    const footer = isExam ? `<button class="button" data-action="previous" ${s.index === 0 ? 'disabled' : ''}>上一题</button><div class="footer-actions"><button class="button ghost" data-action="sheet">答题卡</button><button class="button primary" data-action="${s.index === s.ids.length - 1 ? 'finish-exam' : 'next'}">${s.index === s.ids.length - 1 ? '交卷' : '下一题'} ${icon('next')}</button></div>` : `<button class="button" data-action="previous" ${s.index === 0 ? 'disabled' : ''}>上一题</button><div class="footer-actions">${showAnswer ? '' : '<button class="button ghost" data-action="next">跳过</button>'}<button class="button primary" data-action="${showAnswer ? 'next' : 'submit'}" ${!showAnswer && !chosen.length ? 'disabled' : ''}>${showAnswer ? s.index === s.ids.length - 1 ? '本轮总结' : '下一题' : '提交答案'} ${showAnswer ? icon('next') : ''}</button></div>`;
    return `<article class="question-card"><div class="question-body"><div class="question-meta"><div class="question-meta-left"><span class="badge ${q.type}">${TYPE[q.type]}</span><span class="question-count">本轮 ${s.index + 1} / ${s.ids.length} · 原题 ${q.number}</span></div><button class="favorite-button ${favorite ? 'active' : ''}" data-action="favorite" data-id="${q.id}" aria-pressed="${favorite}" aria-label="${favorite ? '取消收藏本题' : '收藏本题'}">${icon('favorites', favorite)}<span>${favorite ? '已收藏' : '收藏'}</span></button></div><h2 class="question-title" id="question-title" tabindex="-1">${esc(q.text)}</h2><p class="question-hint">${hint}</p><div class="options ${q.type === 'judge' ? 'judge-options' : ''}" role="group" aria-labelledby="question-title">${options}</div>${!isExam ? answerBox(q, result, study) : ''}</div><div class="question-footer">${footer}</div></article>${isExam ? `<div class="card-bottom"><span>切换页面不暂停计时；刷新可继续。</span><span>${s.rule === E.examRule.id ? `本题 ${E.questionPoints(q)} 分 · 多选严格判分` : '旧版自选模拟 · 按原规则结算'}</span></div>` : `<div class="card-bottom"><div>${!showAnswer ? '<button class="text-link" data-action="peek">暂时不会，查看答案</button>' : !study ? '<button class="text-link" data-action="retry">再答一次</button>' : '<span>背题不计入作答统计</span>'}</div><button class="text-link mobile-sheet" data-action="sheet">答题卡 / 跳题 ↗</button><span class="keyboard-hint">A–D 选项 · ← → 切题 · Enter 提交</span></div>`}`;
  }
  function mapStatus(s, id, isExam) {
    if (isExam) return s.answers[id]?.length ? 'draft' : '';
    const a = s.answers[id];
    return a ? a.kind === 'revealed' ? 'revealed' : a.correct ? 'correct' : 'wrong' : s.drafts[id]?.length ? 'draft' : '';
  }
  function numberButton(s, id, i, isExam = false) {
    const q = E.byId.get(id), status = mapStatus(s, id, isExam);
    const statusLabel = { correct: '答对', wrong: '答错', revealed: '已看答案', draft: isExam ? '已选答案' : '未提交' }[status] || '未作答';
    return `<button class="number-button ${status} ${s.index === i ? 'current' : ''}" data-action="jump" data-index="${i}" aria-label="本轮第${i + 1}题，${TYPE[q.type]}原题${q.number}，${statusLabel}" ${s.index === i ? 'aria-current="step"' : ''}>${i + 1}</button>`;
  }
  function practiceAside(s, isExam = false) {
    const values = Object.values(s.answers);
    const done = isExam ? values.filter(x => x.length).length : values.filter(a => a.kind === 'answered').length;
    const from = Math.floor(s.index / 20) * 20;
    return `<aside class="practice-aside"><section class="side-card"><h3>${isExam ? '模拟进度' : '本轮进度'}<span>${TYPE[isExam ? s.type : state.view.type] || '全部'}</span></h3>${isExam ? '<div class="exam-clock" data-exam-clock></div><p class="round-caption">剩余时间</p>' : ''}<div class="round-number">${done}<small>/ ${s.ids.length} 已${isExam ? '选' : '答'}</small></div><div class="progress-track"><div class="progress-fill" style="width:${s.ids.length ? done / s.ids.length * 100 : 0}%"></div></div><p class="round-caption">${isExam ? '可随时切题、修改答案。' : '每完成一道，都离目标近一点。'}</p><div class="mini-grid">${s.ids.slice(from, from + 20).map((id, i) => numberButton(s, id, i + from, isExam)).join('')}</div><button class="answer-map-trigger" data-action="sheet"><span>查看全部答题卡</span><span>↗</span></button>${isExam ? '<div class="spacer"></div><button class="button full primary" data-action="finish-exam">提前交卷</button>' : ''}</section><section class="side-card side-tip"><h3>${isExam ? '本轮比赛赛制' : '给自己一个小提醒'}</h3><p>${isExam ? (s.rule === E.examRule.id ? '限时 30 分钟，共 90 题、100 分。判断 40 题、单选 30 题，每题 1 分；多选 20 题，每题 1.5 分。到时自动交卷。' : '本轮是更新前开始的自选模拟，将按原规则结算；下一轮会采用 30 分钟、90 题的新赛制。') : state.view.mode === 'wrong' ? '答对即移出错题本。本轮题目保持不变，方便回看；点「更新本轮」可载入最新错题。' : '多选题别急着提交。先检查有没有漏选，再确认每个选项是否符合题意。'}</p></section></aside>`;
  }
  function renderPractice() {
    const v = state.view, s = session();
    const filter = v.mode !== 'lookup' ? typeTabs(v.type) : '<span class="badge">来自题库检索</span>';
    const scope = ['sequence', 'random'].includes(v.mode) ? `<select class="scope-select" id="practice-scope" aria-label="练习范围"><option value="all" ${v.scope === 'all' ? 'selected' : ''}>全部题目</option><option value="unanswered" ${v.scope === 'unanswered' ? 'selected' : ''}>仅未练过</option></select>` : '';
    const toolbar = `<div class="toolbar">${filter}<div class="toolbar-right">${scope}<button class="study-switch" data-action="study" aria-pressed="${state.settings.study}"><span class="switch-track" aria-hidden="true"></span>背题模式</button><button class="button ghost small" data-action="${v.mode === 'random' ? 'sequence' : 'random'}">${v.mode === 'random' ? '顺序练习' : '随机刷题'} ↗</button></div></div>`;
    let content;
    if (!s.ids.length) {
      const messages = { wrong: ['当前范围没有待巩固错题', '练习中答错的题目会自动收录到这里，重练答对后自动移出。'], favorites: ['还没有收藏这类题目', '遇到重点或想再看的题，点击题目右上角的星标。'] };
      const [title, description] = messages[v.mode] || ['这个范围已经练完啦', '可以切换题型继续练习，或开始一轮随机练习。'];
      content = empty(title, description);
    } else content = `<div class="practice-layout"><div>${questionCard(E.byId.get(s.ids[s.index]), s)}<button class="text-link" data-action="restart">${v.mode === 'random' ? '重新洗牌，开始新一轮' : ['wrong', 'favorites'].includes(v.mode) || v.scope === 'unanswered' ? '更新本轮题目' : '重新练这一组'}</button></div>${practiceAside(s)}</div>`;
    $('#main').innerHTML = heading(MODE[v.mode], DESC[v.mode], '<strong>500</strong> 道原题') + statsStrip() + toolbar + content;
  }
  function examSetup() {
    return heading('比赛赛制模拟', '按比赛配比随机组卷，30 分钟完成一次完整自测。') + `<div class="exam-start-layout"><section class="panel"><h2>本次模拟规则</h2><p>每轮从 500 道题库中分类随机抽题，卷内不重复；按判断、单选、多选的顺序作答。</p><div class="exam-summary"><div><strong>30<small>分钟</small></strong><span>固定考试时长</span></div><div><strong>90<small>题</small></strong><span>每轮随机抽取</span></div><div><strong>100<small>分</small></strong><span>按题型分值计分</span></div></div><div class="table-scroll"><table class="exam-table"><caption class="sr-only">比赛题型与分值</caption><thead><tr><th scope="col">题型</th><th scope="col">题量</th><th scope="col">每题</th><th scope="col">满分</th></tr></thead><tbody>${E.examRule.sections.map(section => `<tr><th scope="row">${TYPE[section.type]}</th><td>${section.count} 题</td><td>${section.points} 分</td><td>${section.count * section.points} 分</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">合计</th><td>90 题</td><td>—</td><td>100 分</td></tr></tfoot></table></div><form id="exam-form"><button class="button primary" type="submit">开始 30 分钟模拟 ${icon('next')}</button></form><p class="soft-note">多选沿用严格判分：全部选对得 1.5 分，漏选、多选、错选得 0 分。未答得 0 分，并加入错题本。点击开始即计时，到时自动交卷。</p>${state.lastExam ? '<div class="spacer"></div><button class="text-link" data-action="last-report">查看上次练习报告 ↗</button>' : ''}</section><aside class="panel exam-intro"><div class="eyebrow">按比赛节奏，完整练一轮</div><div class="big-number">30</div><h3>分钟，专注完成这一轮</h3><ul class="exam-rules"><li>第 1–40 题：判断题</li><li>第 41–70 题：单选题</li><li>第 71–90 题：多选题</li><li>每轮重新随机抽题</li><li>交卷后统一显示答案</li><li>刷新后继续原倒计时</li></ul><p>成绩报告会分别显示三种题型的答对数量与实际得分，多选题的半分会完整保留。</p></aside></div>`;
  }
  function reportHtml() {
    const r = state.lastExam, list = r.results.filter(x => reportFilter === 'all' || !x.correct);
    const contest = r.rule === E.examRule.id;
    const breakdown = contest ? `<h3 class="score-breakdown-title">分题型成绩</h3><div class="table-scroll"><table class="exam-table"><caption class="sr-only">各题型得分明细</caption><thead><tr><th scope="col">题型</th><th scope="col">答对 / 题量</th><th scope="col">得分 / 满分</th></tr></thead><tbody>${r.breakdown.map(item => `<tr><th scope="row">${TYPE[item.type]}</th><td>${item.correct} / ${item.count}</td><td><strong>${item.score}</strong> / ${item.maxScore} 分</td></tr>`).join('')}</tbody></table></div>` : '<p>这是更新前的自选模拟报告，保留原计分结果。点击「再来一场」开始新赛制模拟。</p>';
    return heading('本次练习报告', contest ? '30 分钟 · 90 道题 · 判断与单选各 1 分，多选每题 1.5 分。' : '旧版自选模拟 · 按原规则结算。') + `<section class="panel"><div class="exam-report-head"><div class="score-ring" style="--angle:${r.score * 3.6}deg"><div class="score-inner"><strong>${r.score}</strong><small>本次得分 / 100</small></div></div><div><h2>${r.score === 100 ? '这一轮，全部答对！' : r.score >= 80 ? '继续巩固，稳步前进。' : '找到了下一步的复习重点。'}</h2><p>共 ${r.total} 题 · 用时 ${Math.floor(r.seconds / 60)} 分 ${r.seconds % 60} 秒</p><div class="report-metrics"><div><strong>${r.correct}</strong><span>答对</span></div><div><strong>${r.wrong}</strong><span>答错</span></div><div><strong>${r.skipped}</strong><span>未作答</span></div></div></div></div>${breakdown}<div class="data-actions"><button class="button primary" data-action="review-mistakes" ${r.correct === r.total ? 'disabled' : ''}>重练本次错题与未答题</button><button class="button" data-action="new-exam">再来一场</button></div><p>错题与未答题已加入错题本。${contest ? '总分直接累加各题实际得分，保留 0.5 分。' : '本报告按旧版每题等分规则计算。'}</p></section><section class="panel"><div class="toolbar"><h2>逐题回顾</h2><div class="type-tabs"><button class="type-tab ${reportFilter === 'wrong' ? 'active' : ''}" data-action="report-filter" data-filter="wrong">错题与未答 ${r.total - r.correct}</button><button class="type-tab ${reportFilter === 'all' ? 'active' : ''}" data-action="report-filter" data-filter="all">全部 ${r.total}</button></div></div><div class="review-list">${list.length ? list.map(item => { const q = E.byId.get(item.id); return `<button class="review-row" data-action="report-question" data-id="${q.id}"><span class="badge ${q.type}">${TYPE[q.type]} ${q.number}</span><span class="review-text">${esc(q.text)}</span><span class="review-state ${item.correct ? 'ok' : ''}">${item.skipped ? '未答' : item.correct ? '答对' : '答错'} ↗</span></button>`; }).join('') : '<p>本次没有错题。切换「全部」可以回顾每道题。</p>'}</div></section>`;
  }
  function renderExam() {
    if (state.exam) {
      const s = state.exam, q = E.byId.get(s.ids[s.index]);
      $('#main').innerHTML = heading(s.rule === E.examRule.id ? '比赛模拟进行中' : '旧版自选模拟进行中', s.rule === E.examRule.id ? '判断 40 题 · 单选 30 题 · 多选 20 题 · 满分 100 分' : '本轮保留原规则；下一轮采用 30 分钟、90 题赛制。', '<span data-exam-clock></span>') + `<div class="practice-layout"><div>${questionCard(q, s, true)}<button class="text-link" data-action="finish-exam">提前交卷并查看结果</button></div>${practiceAside(s, true)}</div>`;
    } else $('#main').innerHTML = !examConfig && state.lastExam ? reportHtml() : examSetup();
  }
  function renderSearch() {
    $('#main').innerHTML = heading('题库检索', '按关键词或原题号查找，也可以直接进入练习。') + `<div class="search-bar"><input class="search-field" id="search-input" type="search" placeholder="搜索题干、选项或原题号，例如：大数据、康养、51" value="${esc(searchText)}" aria-label="搜索题干、选项或原题号"><button class="button primary" data-action="run-search">搜索</button></div><div class="search-filters">${typeTabs(searchType, true)}<span class="search-count" id="search-count"></span></div><div class="search-list" id="search-list"></div><div id="search-pagination"></div>`;
    renderSearchResults();
  }
  function renderSearchResults() {
    const query = searchText.trim().toLowerCase();
    searchMatches = bank.questions.filter(q => (searchType === 'all' || q.type === searchType) && (!query || (/^\d+$/.test(query) ? q.number === Number(query) : [q.text, ...q.options.map(o => o.text)].join(' ').toLowerCase().includes(query))));
    const pageCount = Math.max(1, Math.ceil(searchMatches.length / 20));
    searchPage = Math.min(searchPage, pageCount - 1);
    $('#search-count').textContent = `找到 ${searchMatches.length} 道题`;
    $('#search-list').innerHTML = searchMatches.length ? searchMatches.slice(searchPage * 20, searchPage * 20 + 20).map(q => `<button class="search-result" data-action="open-question" data-id="${q.id}"><div class="search-result-content"><div class="search-result-meta"><span class="badge ${q.type}">${TYPE[q.type]}</span><span>原题 ${q.number}</span>${state.records[q.id]?.wrongActive ? '<span>待巩固</span>' : state.records[q.id]?.attempts ? '<span>已练习</span>' : ''}${state.favorites.includes(q.id) ? '<span>★ 已收藏</span>' : ''}</div><div class="search-result-title">${esc(q.text)}</div></div><span class="search-arrow" aria-hidden="true">↗</span></button>`).join('') : empty('没有找到相关题目', '换一个短一些的关键词试试，或者清除题型筛选。', 'clear-search', '清除搜索');
    $('#search-pagination').innerHTML = searchMatches.length ? `<div class="pagination"><button class="button small" data-action="search-prev" ${searchPage === 0 ? 'disabled' : ''}>上一页</button><span>${searchPage + 1} / ${pageCount}</span><button class="button small" data-action="search-next" ${searchPage === pageCount - 1 ? 'disabled' : ''}>下一页</button></div>` : '';
  }
  function renderData() {
    const s = E.stats(state);
    $('#main').innerHTML = heading('备份与设置', '保存自己的练习积累，按喜欢的节奏继续。') + `<section class="panel"><h2>我的学习进度</h2><p>已练 ${s.practiced} / 500 题，待巩固错题 ${s.wrong} 道，收藏 ${s.favorites} 道。</p><p>进度保存在当前设备的当前浏览器中。换设备、换浏览器、切换网址或清除浏览器数据时，需要导出再导入备份。多人使用同一浏览器时会共用进度。</p><div class="data-actions"><button class="button primary" data-action="export">导出进度备份</button><button class="button" data-action="import">导入进度备份</button></div><p>导入会替换当前进度，不会合并。文件仅在本机读取。</p></section><section class="panel"><h2>练习偏好</h2><div class="setting-row"><div><h3>加大题目字号</h3><p>放大题干、选项与答案，阅读更轻松。</p></div><button class="study-switch" data-action="font" aria-pressed="${state.settings.largeText}"><span class="switch-track" aria-hidden="true"></span>${state.settings.largeText ? '已开启' : '开启'}</button></div><div class="setting-row"><div><h3>清空所有练习记录</h3><p>会清空作答、错题、收藏与模拟记录，请先导出备份。</p></div><button class="button danger small" data-action="reset">清空记录</button></div></section><section class="panel"><h2>题库与判分说明</h2><p class="source-summary">${esc(bank.sourceTitle)}<br>题库共 500 道：150 道单选、150 道多选、200 道判断。<br>题目与标准答案均来自你提供的原 PDF，保留题型内原题号。PDF 原文没有逐题解析，因此本网页展示标准答案，不生成额外解析。<br>多选题按答案集合完全一致判分。练习答错自动收录；重练答对自动移出错题本。查看答案与背题不计作答。已练题目按实际提交过答案的不同题目计数，累计正确率按所有提交次数计算。<br>比赛模拟固定 30 分钟、90 题、满分 100 分：判断 40 题，每题 1 分；单选 30 题，每题 1 分；多选 20 题，每题 1.5 分。按题型随机抽取，按判断、单选、多选的顺序出题；成绩保留 0.5 分。多选必须全部选对得分，漏选、多选、错选均为 0 分。<br>模拟练习交卷时统一计入记录；未答题影响本次得分并进入错题本，不计入累计作答次数。若中途退出，计时仍会继续，到时再次打开网页会自动交卷。</p><div class="data-actions"><a class="button" href="${esc(bank.sourceFile)}" target="_blank" rel="noopener">查看原始 PDF ↗</a><a class="button" href="README.md" target="_blank" rel="noopener">查看部署与使用说明 ↗</a></div></section>`;
  }
  function render() {
    navigation(); document.body.classList.toggle('large-text', state.settings.largeText);
    if (state.view.page === 'practice') renderPractice();
    else if (state.view.page === 'search') renderSearch();
    else if (state.view.page === 'exam') renderExam();
    else renderData();
    updateClock(false);
  }
  function activeContext() { return state.view.page === 'exam' && state.exam ? { s: state.exam, exam: true } : state.view.page === 'practice' ? { s: session(), exam: false } : null; }
  function move(delta) {
    const context = activeContext(); if (!context || !context.s.ids.length) return;
    const { s, exam } = context, next = s.index + delta;
    if (next < 0) return;
    if (next >= s.ids.length) { if (exam) confirmExam(); else roundSummary(); return; }
    s.index = next; save(); render(); focusQuestion();
  }
  function focusQuestion() { $('#question-title')?.focus({ preventScroll: true }); $('.question-card')?.scrollIntoView({ block: 'start', behavior: 'auto' }); }
  function roundSummary() {
    const s = session(), results = Object.values(s.answers), answered = results.filter(r => r.kind === 'answered');
    openDialog('本轮练习进度', `<p class="dialog-description">这一轮共有 ${s.ids.length} 道题。已提交 ${answered.length} 道，其中答对 ${answered.filter(a => a.correct).length} 道，答错 ${answered.filter(a => !a.correct).length} 道。另有 ${results.filter(a => a.kind === 'revealed').length} 道只看了答案。</p><p class="dialog-description">未提交 ${s.ids.length - answered.length} 道，可用答题卡返回补练。全局进度已保存。</p><div class="dialog-actions"><button class="button" data-action="sheet">打开答题卡</button><button class="button primary" data-action="restart">重新开始这一轮</button></div>`);
  }
  function openSheet() {
    const ctx = activeContext(); if (!ctx || !ctx.s.ids.length) return;
    const { s, exam } = ctx;
    openDialog('本轮答题卡', `<p class="dialog-description">数字是本轮练习顺序，原题编号显示在题目上方。</p><div class="legend"><span><i></i>未答</span>${exam ? '<span><i class="draft"></i>已选答案</span>' : '<span><i class="correct"></i>答对</span><span><i class="wrong"></i>答错</span><span><i class="draft"></i>待提交</span><span><i class="revealed"></i>已看答案</span>'}</div><form class="jump-form" id="jump-form"><label for="jump-number">跳到本轮</label><input id="jump-number" type="number" min="1" max="${s.ids.length}" value="${s.index + 1}" inputmode="numeric" required><span>题</span><button class="button small" type="submit">跳转</button></form><div class="full-grid">${s.ids.map((id, i) => numberButton(s, id, i, exam)).join('')}</div>`);
  }
  function confirmExam() {
    if (!state.exam) return;
    const unanswered = state.exam.ids.filter(id => !state.exam.answers[id]?.length).length;
    openDialog('确认交卷', `<p class="dialog-description">${unanswered ? `还有 ${unanswered} 道题未作答，交卷后按未答题处理并加入错题本。` : '所有题目都已选择答案。交卷后将统一判分并保存记录。'}</p><div class="dialog-actions"><button class="button" data-action="close-dialog">继续答题</button><button class="button primary" data-action="confirm-exam">确认交卷</button></div>`);
  }
  function finishExam(expired = false) { E.finishExam(state); state.view.page = 'exam'; examConfig = false; reportFilter = 'wrong'; if ($('#dialog').open) closeDialog(); save(); render(); window.scrollTo(0, 0); if (expired) toast('模拟时间已到，已自动交卷。'); }
  function updateClock(allowFinish = true) {
    const indicator = $('#exam-indicator'); indicator.hidden = !state.exam;
    if (!state.exam) return;
    const remaining = state.exam.deadline === null ? null : Math.max(0, Math.ceil((state.exam.deadline - Date.now()) / 1000));
    if (remaining === 0 && allowFinish) { finishExam(true); return; }
    const value = remaining === null ? '不限时' : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    indicator.innerHTML = `<span class="hide-mobile">模拟中 · </span>${value}`;
    document.querySelectorAll('[data-exam-clock]').forEach(el => { el.textContent = value; el.classList.toggle('urgent', remaining !== null && remaining < 300); });
  }
  function showReportQuestion(id) {
    const result = state.lastExam?.results.find(r => r.id === id); if (!result) return;
    const q = E.byId.get(id);
    openDialog(`${TYPE[q.type]} · 原题 ${q.number}`, `<h3>${esc(q.text)}</h3><div class="spacer"></div>${q.options.map(o => `<p class="dialog-description">${q.type === 'judge' ? '' : `${o.key}. `}${esc(o.text)}</p>`).join('')}<div class="answer-box ${result.correct ? '' : 'wrong'}"><div class="answer-heading">${result.skipped ? '本题未作答' : result.correct ? '回答正确' : '本题答错'}</div><div>你的答案：${esc(answerText(q, result.selection))}</div><div>正确答案：${esc(answerText(q, q.answer))}</div>${state.lastExam.rule === E.examRule.id ? `<div>本题得分：<strong>${result.points} / ${result.maxPoints} 分</strong></div>` : ''}${sourceRow(q)}</div>`);
  }
  function lookup(ids, index = 0) { state.sessions.lookup = E.makeSession(ids); state.sessions.lookup.index = index; state.view = { page: 'practice', mode: 'lookup', type: 'all', scope: 'all', key: 'lookup' }; state.settings.study = false; save(); render(); window.scrollTo(0, 0); }
  function exportData() {
    const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `旅数刷题进度_${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); toast('已生成进度备份，请保存好下载文件。');
  }
  let pendingImport = null;
  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]'); if (!button || button.disabled) return;
    const action = button.dataset.action;
    try {
      if (['sequence', 'random', 'wrong', 'favorites'].includes(action)) { enterPractice(action, 'all', 'all', ['wrong', 'favorites'].includes(action)); return; }
      if (['search', 'exam', 'data'].includes(action)) { state.view.page = action; if (action === 'exam') examConfig = false; save(); render(); window.scrollTo(0, 0); return; }
      switch (action) {
        case 'type': enterPractice(state.view.mode, button.dataset.type, state.view.scope, ['wrong', 'favorites'].includes(state.view.mode)); break;
        case 'study': state.settings.study = !state.settings.study; save(); render(); break;
        case 'font': state.settings.largeText = !state.settings.largeText; save(); render(); break;
        case 'choose': {
          const ctx = activeContext(); if (!ctx) break;
          const { s, exam } = ctx, q = E.byId.get(s.ids[s.index]);
          if (!q || (!exam && (s.answers[q.id] || state.settings.study))) break;
          const key = button.dataset.value;
          if (!q.options.some(o => o.key === key)) break;
          let values = exam ? (s.answers[q.id] || []) : (s.drafts[q.id] || []);
          values = q.type === 'multiple' ? values.includes(key) ? values.filter(v => v !== key) : [...values, key].sort() : [key];
          if (exam) { if (values.length) s.answers[q.id] = values; else delete s.answers[q.id]; } else s.drafts[q.id] = values;
          save(); render(); document.querySelector(`[data-action="choose"][data-value="${key}"]`)?.focus({ preventScroll: true }); break;
        }
        case 'submit': { const s = session(), id = s.ids[s.index]; if (!id || state.settings.study) break; E.submit(state, s, id, s.drafts[id]); save(); render(); $('#feedback')?.focus({ preventScroll: true }); break; }
        case 'next': move(1); break;
        case 'previous': move(-1); break;
        case 'favorite': { const id = button.dataset.id; if (!E.byId.has(id)) break; state.favorites = state.favorites.includes(id) ? state.favorites.filter(x => x !== id) : [...state.favorites, id]; save(); render(); break; }
        case 'peek': { const s = session(), id = s.ids[s.index]; if (id && !s.answers[id]) { s.answers[id] = { kind: 'revealed' }; delete s.drafts[id]; save(); render(); } break; }
        case 'retry': { const s = session(), id = s.ids[s.index]; delete s.answers[id]; delete s.drafts[id]; save(); render(); break; }
        case 'restart': { if ($('#dialog').open) closeDialog(); const v = state.view; if (v.mode === 'lookup') { state.sessions.lookup = E.makeSession(session().ids); save(); render(); } else enterPractice(v.mode, v.type, v.scope, true); toast('已开始新一轮，累计记录保留。'); break; }
        case 'sheet': openSheet(); break;
        case 'jump': { const ctx = activeContext(), index = Number(button.dataset.index); if (ctx && Number.isInteger(index) && index >= 0 && index < ctx.s.ids.length) { ctx.s.index = index; if ($('#dialog').open) closeDialog(); save(); render(); focusQuestion(); } break; }
        case 'close-dialog': closeDialog(); break;
        case 'finish-exam': confirmExam(); break;
        case 'confirm-exam': finishExam(); break;
        case 'new-exam': examConfig = true; render(); break;
        case 'last-report': examConfig = false; render(); break;
        case 'report-filter': reportFilter = button.dataset.filter; render(); break;
        case 'report-question': showReportQuestion(button.dataset.id); break;
        case 'review-mistakes': { const ids = state.lastExam.results.filter(r => !r.correct).map(r => r.id); if (ids.length) lookup(ids); break; }
        case 'search-type': searchType = button.dataset.type; searchPage = 0; renderSearch(); break;
        case 'run-search': searchText = $('#search-input').value; searchPage = 0; renderSearchResults(); break;
        case 'clear-search': searchText = ''; searchType = 'all'; searchPage = 0; renderSearch(); break;
        case 'search-prev': searchPage = Math.max(0, searchPage - 1); renderSearchResults(); window.scrollTo(0, 0); break;
        case 'search-next': searchPage++; renderSearchResults(); window.scrollTo(0, 0); break;
        case 'open-question': { const ids = searchMatches.map(q => q.id), index = ids.indexOf(button.dataset.id); if (index >= 0) lookup(ids, index); break; }
        case 'export': exportData(); break;
        case 'import': $('#import-file').click(); break;
        case 'confirm-import': if (pendingImport) { state = pendingImport; pendingImport = null; closeDialog(); save(); render(); updateClock(); toast('进度备份已导入。'); } break;
        case 'reset': openDialog('清空全部记录？', '<p class="dialog-description">这会清空当前浏览器中的作答、错题、收藏、模拟与练习进度。操作不可撤销。建议先关闭弹窗并导出备份。</p><div class="dialog-actions"><button class="button" data-action="close-dialog">保留记录</button><button class="button danger" data-action="confirm-reset">确认清空</button></div>'); break;
        case 'confirm-reset': state = E.freshState(); closeDialog(); save(); render(); toast('记录已清空。'); break;
      }
    } catch (error) { toast(error.message || '操作未完成，请重试。'); }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'search-input') { searchText = event.target.value; searchPage = 0; clearTimeout(searchTimer); searchTimer = setTimeout(() => { if (state.view.page === 'search') renderSearchResults(); }, 120); }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'practice-scope') enterPractice(state.view.mode, state.view.type, event.target.value, true);
  });
  document.addEventListener('submit', event => {
    if (event.target.id === 'exam-form') {
      event.preventDefault();
      try { E.makeExam(state); state.view.page = 'exam'; save(); render(); window.scrollTo(0, 0); } catch (error) { toast(error.message); }
    }
    if (event.target.id === 'jump-form') {
      event.preventDefault(); const ctx = activeContext(), index = Number($('#jump-number').value) - 1;
      if (ctx && Number.isInteger(index) && index >= 0 && index < ctx.s.ids.length) { ctx.s.index = index; closeDialog(); save(); render(); focusQuestion(); }
    }
  });
  $('#import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast('备份文件过大，请选择本网页导出的 JSON 进度文件。'); return; }
    try {
      pendingImport = E.hydrate(JSON.parse(await file.text())); const s = E.stats(pendingImport);
      openDialog('导入这份进度备份？', `<p class="dialog-description">备份包含已练 ${s.practiced} 道、错题 ${s.wrong} 道、收藏 ${s.favorites} 道。导入将替换当前全部进度，不会合并。</p><div class="dialog-actions"><button class="button" data-action="close-dialog">取消</button><button class="button primary" data-action="confirm-import">替换并导入</button></div>`);
    } catch (error) { pendingImport = null; toast('无法导入：请使用本题库网页导出的有效 JSON 备份。'); }
  });
  $('#dialog').addEventListener('click', event => { if (event.target === $('#dialog')) closeDialog(); });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || $('#dialog').open || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
    const ctx = activeContext(); if (!ctx || !ctx.s.ids.length) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    else if (event.key === 'Enter' && event.target.tagName !== 'BUTTON' && event.target.tagName !== 'A') { event.preventDefault(); (ctx.exam ? $('[data-action="next"]') || $('[data-action="finish-exam"]') : $('[data-action="submit"]') || $('[data-action="next"]'))?.click(); }
    else {
      const q = E.byId.get(ctx.s.ids[ctx.s.index]); const key = event.key.toUpperCase();
      const index = /^[1-4]$/.test(key) ? Number(key) - 1 : 'ABCD'.indexOf(key);
      if (index >= 0 && index < q.options.length) { event.preventDefault(); document.querySelector(`[data-action="choose"][data-value="${q.options[index].key}"]`)?.click(); }
    }
  });
  // The deadline is absolute. Background tabs and refreshes cannot pause a timed round.
  setInterval(() => updateClock(), 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateClock(); });
  window.addEventListener('pageshow', () => updateClock());
  render(); if (storageMessage) warn(storageMessage); updateClock();
})();
