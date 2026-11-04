/* mission.js — step navigation, hints, teacher mode, mission check, boot */
'use strict';
const TEACHER_PW = 'naes5922023';
const App = {
  step: 1, unlocked: new Set([1]), hintLevel: { 1: 0, 2: 0, 3: 0 },

  unlock(n) {
    this.unlocked.add(n);
    const b = $(`.step[data-step="${n}"]`); if (b) b.disabled = false;
  },
  go(n) {
    if (!this.unlocked.has(n)) return;
    this.step = n;
    $$('.step').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    [1, 2, 3].forEach(i => $('#page' + i).classList.toggle('hidden', i !== n));
    if (n === 2) { RT.mountStage($('#stageHost2')); Blocks.resize(); }
    if (n === 3) RT.mountStage($('#stageHost3'));
    if (n >= 2) { RT.renderSprite(); RT.renderInput(); }
  },

  /* ---------- hints (3 levels, context aware) ---------- */
  hints() {
    const T = Trainer;
    if (this.step === 1) {
      if (!T.model || T.dirty) return [
        '每一個類別都要放進「同一種手勢」的照片，然後按中間的「訓練模型」。',
        '按類別卡上的「🖼️ 圖庫」，只勾跟類別名字一樣的手勢。<b>模糊、太暗、只拍到手腕、空白的照片都不要選</b>，它們會讓 AI 學錯。',
        `每個類別至少 ${T.minCount} 張照片、而且不能混進別的手勢。選好後按「訓練模型」，等進度條跑完。`];
      if (!T.shareUrl) return [
        '模型訓練好了！先在右邊「預覽」點幾張測試照片，看看 AI 猜得準不準。',
        '覺得準了，就按右上角的「⬆ 匯出模型」。',
        '在匯出視窗按「⬆ 上傳我的模型」，上傳完成後按「📋 複製」，再到上面點「2 排列積木」。'];
      return ['連結已經做好了！點上面的「2 排列積木」。', '如果忘記複製連結，再按一次「⬆ 匯出模型」就能看到。', '連結長得像 https://teachable.sim/models/xxxx/ ，最後的「/」也要一起複製。'];
    }
    if (this.step === 2) {
      if (!Blocks.tmAdded) return [
        '先把 AI 的積木加進來：點左下角藍色的「擴充功能」按鈕。',
        '在擴充功能清單裡，選「TM2Scratch」。',
        '加好之後，積木區最下面會多出綠色的 TM2Scratch 積木。'];
      if (!RT.tm.model) return [
        '把「當綠旗被點擊」拖到程式區，下面接「影像分類模型網址」，再把你的連結貼進去。',
        '點積木裡的網址文字，按 Ctrl+A 全選，再按 Ctrl+V 貼上你的連結。貼好後按舞台上方的綠旗。',
        '按綠旗後，「接收到影像標籤」的選單才會出現剪刀、石頭、布。如果沒出現，檢查網址是不是完整（最後的「/」也要有）。'];
      return [
        '模型載入成功了！拖出「接收到影像標籤:（剪刀）時」，下面接「說出」積木。',
        '剪刀、石頭、布各需要一個「接收到影像標籤」積木，每一個說不一樣的話。',
        '試試看：點右邊的照片當作鏡頭畫面，角色有沒有說話？都好了就到「3 看成果」做任務檢查。'];
    }
    return [
      '先按綠旗，再比出手勢，或點右邊的照片。',
      '按「開始任務檢查」，電腦會輪流給角色看剪刀、石頭、布。',
      '如果沒過關，看看是哪一個手勢沒反應，回到「2 排列積木」補上；如果是 AI 認錯，回到「1 訓練模型」換更好的照片。'];
  },
  showHint() {
    const list = this.hints(); const lv = this.hintLevel[this.step] = Math.min(this.hintLevel[this.step] + 1, 3);
    const body = h('div', { class: 'msg' }, h('h2', {}, `💡 小提示（第 ${lv} / 3 層）`));
    list.slice(0, lv).forEach((t, i) => { const p = h('div', { class: 'hint-item' + (i === lv - 1 ? ' new' : '') }); p.innerHTML = t; body.append(p); });
    body.append(h('div', { class: 'modal-actions' },
      lv < 3 ? h('button', { class: 'tm-btn ghost', onclick: () => { Modal.close(); this.showHint(); } }, '還是不懂，再多一點提示') : null,
      h('button', { class: 'big-btn', onclick: () => Modal.close() }, '我知道了')));
    Modal.open(body, 'narrow');
  },

  /* ---------- teacher ---------- */
  teacher() {
    if (this.isTeacher) return this.teacherPanel();
    const inp = h('input', { type: 'password', class: 'pw', placeholder: '請輸入老師密碼', autocomplete: 'off' });
    const go = () => { if (inp.value === TEACHER_PW) { this.isTeacher = true; Modal.close(); this.teacherPanel(); } else { inp.value = ''; toast('密碼不對'); } };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    Modal.open(h('div', { class: 'msg' }, h('h2', {}, '🔒 老師功能'), inp,
      h('div', { class: 'modal-actions' }, h('button', { class: 'tm-btn ghost', onclick: () => Modal.close() }, '取消'), h('button', { class: 'big-btn', onclick: go }, '進入'))), 'narrow');
    setTimeout(() => inp.focus(), 50);
  },
  teacherPanel() {
    const minI = h('input', { type: 'number', min: 1, max: 30, value: Trainer.minCount });
    const wrongI = h('input', { type: 'number', min: 0, max: 10, value: Trainer.maxWrong });
    const st = h('div', { class: 'exp-msg' });
    const busy = async (label, fn) => { st.className = 'exp-msg'; st.textContent = label + '…'; try { await fn(); st.classList.add('good'); st.textContent = '✅ 完成'; } catch (e) { st.classList.add('bad'); st.textContent = '失敗：' + e.message; } };
    const box = h('div', { class: 'msg teacher' }, h('h2', {}, '👩‍🏫 老師功能'),
      h('div', { class: 'tp-row' }, h('button', { class: 'tm-btn', onclick: () => { [2, 3].forEach(n => this.unlock(n)); st.textContent = '已解鎖全部步驟（重新整理就會鎖回）'; } }, '解鎖全部步驟')),
      h('div', { class: 'tp-row' }, h('button', { class: 'tm-btn', onclick: () => busy('自動挑圖、訓練、上傳中', () => Trainer.demo()) }, '一鍵示範：自動挑圖＋訓練＋上傳')),
      h('div', { class: 'tp-row' }, h('button', { class: 'tm-btn', onclick: () => busy('載入示範積木', async () => {
        if (!Trainer.shareUrl) throw new Error('請先做好模型（可用上一顆按鈕）');
        await RT.tmLoad(Trainer.shareUrl); Blocks.ws.clear(); Blocks.loadDemo(Trainer.shareUrl); this.go(2); Modal.close();
      }) }, '載入示範積木（會清掉目前的積木）')),
      h('div', { class: 'tp-row' }, h('label', {}, '每類最少張數 ', minI), h('label', {}, '　每類最多錯圖 ', wrongI),
        h('button', { class: 'tm-btn ghost', onclick: () => { Trainer.minCount = Math.max(1, +minI.value || 8); Trainer.maxWrong = Math.max(0, +wrongI.value || 0); st.textContent = `已設定：最少 ${Trainer.minCount} 張、最多錯 ${Trainer.maxWrong} 張`; } }, '套用')),
      st,
      h('div', { class: 'modal-actions' }, h('button', { class: 'big-btn', onclick: () => Modal.close() }, '關閉')));
    Modal.open(box, 'narrow');
  },

  /* ---------- mission check ---------- */
  async mission() {
    const out = $('#missionResult'), btn = $('#missionBtn');
    out.innerHTML = '';
    const fail = html => { const d = h('div', { class: 'm-fail' }); d.innerHTML = html; out.append(d); };
    if (!Blocks.ws.getTopBlocks(false).some(b => b.type === 'event_whenflagclicked')) return fail('找不到「當綠旗被點擊」積木。回到「2 排列積木」把程式排好。');
    btn.disabled = true; btn.textContent = '檢查中…';
    try {
      RT.input.mode = 'none'; RT.input.photo = null; RT.tm.probs = []; RT.renderInput();
      RT.resetSprite(); RT.greenFlag();
      out.append(h('div', { class: 'm-step' }, '🏁 按下綠旗，載入模型…'));
      await sleep(1600);
      if (!RT.tm.model) return fail('角色沒有載入模型。檢查「影像分類模型網址」積木是不是接在「當綠旗被點擊」下面，網址是不是完整貼上。');
      const m = RT.tm.model;
      // choose, for each gesture, the test photo the model is most sure about
      const plan = [];
      for (const g of ['scissors', 'rock', 'paper']) {
        let best = null;
        for (const d of DS.test.filter(t => t.c === g)) {
          const p = m.predict(await DS.ready(d)); let bi = 0; p.forEach((v, i) => { if (v > p[bi]) bi = i; });
          if (!best || p[bi] > best.conf) best = { d, label: m.labels[bi], conf: p[bi] };
        }
        plan.push(Object.assign({ g }, best));
      }
      const labs = plan.map(p => p.label);
      if (new Set(labs).size < 3) {
        return fail(`AI 模型分不清楚手勢：剪刀→「${labs[0]}」、石頭→「${labs[1]}」、布→「${labs[2]}」。<br>回到「1 訓練模型」檢查照片，重新訓練、重新上傳。`);
      }
      const results = [];
      for (const p of plan) {
        RT.input.mode = 'none'; RT.tm.probs = []; RT.renderInput();
        await sleep(1300);                 // label becomes empty -> hats can fire again
        const t0 = performance.now();
        RT.setPhoto(p.d);
        const row = h('div', { class: 'm-row' }, h('img', { src: p.d.src }), h('span', { class: 'm-g' }, `${CLASS_ZH[p.g]}（AI：${p.label}）`), h('span', { class: 'm-said' }, '等待角色反應…'));
        out.append(row);
        let said = '';
        const end = t0 + 4000;
        while (performance.now() < end) {
          await sleep(100);
          const e = RT.sayLog.find(x => x.t >= t0);
          if (e) { said = e.text; await sleep(300); break; }
        }
        results.push(said);
        $('.m-said', row).textContent = said ? `角色說：「${said}」` : '角色沒有說話 ✘';
        row.classList.add(said ? 'ok' : 'bad');
      }
      const distinct = new Set(results.filter(Boolean)).size === 3;
      if (results.every(Boolean) && distinct) {
        out.append(h('div', { class: 'm-pass' }, '🎉 任務完成！你的 AI 角色看得懂剪刀、石頭、布了！'));
      } else if (results.every(Boolean)) {
        fail('三個手勢都有反應，但說的話有重複。讓剪刀、石頭、布各說不一樣的話吧！');
      } else {
        fail('有手勢沒有反應。檢查「接收到影像標籤:（　）時」積木：剪刀、石頭、布是不是都有一個，而且下面都接了「說出」。');
      }
    } finally {
      btn.disabled = false; btn.textContent = '再檢查一次';
      RT.input.mode = 'photo'; RT.renderInput();
    }
  },

  init() {
    Trainer.init();
    Blocks.init();
    RT.init();
    $$('.step').forEach(b => b.addEventListener('click', () => this.go(+b.dataset.step)));
    $('#hintBtn').addEventListener('click', () => this.showHint());
    $('#teacherBtn').addEventListener('click', () => this.teacher());
    $('#missionBtn').addEventListener('click', () => this.mission());
    window.addEventListener('resize', () => { Blocks.resize(); });
    this.go(1);
  }
};
window.addEventListener('DOMContentLoaded', () => App.init());
