/* trainer.js — Step 1: Teachable-Machine-like image model trainer (real training in browser) */
'use strict';
const Trainer = {
  net: null, netReady: null, embDim: 0,
  classes: [], nextId: 1,
  model: null,          // last trained model
  dirty: true,          // samples changed since last training
  training: false,
  shareId: null,        // fixed per session, like TM "update cloud model"
  shareUrl: null,
  registry: {},         // url -> model ("the cloud")
  minCount: 8, maxWrong: 1,
  camCard: null, recTimer: 0,
  previewSel: null, previewTimer: 0,

  /* ---------- engine ---------- */
  loadNet() {
    if (this.netReady) return this.netReady;
    this.netReady = (async () => {
      await tf.ready();
      this.net = await mobilenet.load({ version: 2, alpha: 0.5, modelUrl: 'lib/mobilenet/model.json' });
      const im = await DS.ready(DS.lib[0]);
      const e = this.net.infer(im, true); this.embDim = e.shape[1]; e.dispose();
      const s = $('#engineState'); s.textContent = '✅ AI 引擎就緒'; s.classList.add('ok');
      return this.net;
    })().catch(err => {
      console.error(err);
      const s = $('#engineState'); s.textContent = '❌ AI 引擎載入失敗，請重新整理'; s.classList.add('bad');
      throw err;
    });
    return this.netReady;
  },
  embed(el) { return tf.tidy(() => this.net.infer(el, true)); },

  /* ---------- classes ---------- */
  addClass(name) {
    const c = { id: this.nextId++, name, samples: [] };
    this.classes.push(c); this.markDirty(); return c;
  },
  removeSample(c, s) {
    c.samples.splice(c.samples.indexOf(s), 1);
    if (s.kind !== 'lib' && s.emb) s.emb.dispose();
    this.markDirty();
  },
  markDirty() {
    this.dirty = true;
    if (this.model) $('#trainStatus').textContent = '照片有變動，要重新訓練模型';
    this.renderTrainBtn();
  },
  libOwner(d) { return this.classes.find(c => c.samples.some(s => s.kind === 'lib' && s.d === d)); },

  /* ---------- render class cards ---------- */
  render() {
    const list = $('#classList'); list.innerHTML = '';
    for (const c of this.classes) list.append(this.renderCard(c));
    list.append(h('button', { class: 'add-class', onclick: () => {
      if (this.classes.length >= 5) return toast('最多 5 個類別');
      this.addClass('類別 ' + (this.classes.length + 1)); this.render();
      list.scrollTop = list.scrollHeight;
    } }, '⊕ 新增類別'));
    this.renderTrainBtn();
  },
  renderCard(c) {
    const card = h('div', { class: 'card cls' + (this.camCard === c ? ' cam-on' : '') });
    const name = h('input', { class: 'cls-name', value: c.name, maxlength: 12, spellcheck: 'false' });
    name.addEventListener('change', () => {
      const v = name.value.trim();
      if (!v) { name.value = c.name; return; }
      c.name = v; this.markDirty();
    });
    const menuBtn = h('button', { class: 'cls-menu', title: '更多' }, '⋮');
    menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      const m = h('div', { class: 'pop-menu' },
        h('button', { onclick: () => { c.samples.slice().forEach(s => this.removeSample(c, s)); this.render(); } }, '移除所有樣本'),
        h('button', { onclick: () => {
          if (this.classes.length <= 2) return toast('至少要保留 2 個類別');
          c.samples.slice().forEach(s => this.removeSample(c, s));
          this.classes.splice(this.classes.indexOf(c), 1); if (this.camCard === c) this.stopCam(); this.markDirty(); this.render();
        } }, '刪除類別'));
      card.append(m);
      setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }));
    });
    card.append(h('div', { class: 'cls-head' }, name, h('span', { class: 'pencil' }, '✎'), menuBtn));
    card.append(h('div', { class: 'cls-sub' }, `${c.samples.length} 個圖片樣本`));

    const body = h('div', { class: 'cls-body' });
    if (this.camCard === c) {
      const v = h('video', { class: 'cam-video', muted: true, playsinline: true });
      v.muted = true; Cam.attach(v);
      const rec = h('button', { class: 'rec-btn' }, '按住即可錄製');
      const startRec = e => {
        e.preventDefault();
        if (!Cam.ready(v)) return;
        rec.classList.add('on');
        const take = () => {
          if (!Cam.ready(v)) return;
          const cv = Cam.grab(v);
          c.samples.push({ kind: 'cam', el: cv, thumb: cv.toDataURL('image/jpeg', 0.7) });
          this.markDirty(); this.updateCardCount(card, c);
        };
        take(); this.recTimer = setInterval(take, 150);
      };
      const stopRec = () => { rec.classList.remove('on'); clearInterval(this.recTimer); this.recTimer = 0; this.render(); };
      rec.addEventListener('pointerdown', startRec);
      rec.addEventListener('pointerup', stopRec);
      rec.addEventListener('pointerleave', () => { if (this.recTimer) stopRec(); });
      body.append(h('div', { class: 'cam-panel-in' },
        h('div', { class: 'cam-left' }, h('div', { class: 'cam-top' }, h('span', {}, '網路攝影機'), h('button', { class: 'x', onclick: () => this.stopCam() }, '✕')), v, rec)));
    } else {
      body.append(h('div', { class: 'cls-add' },
        h('span', { class: 'lbl' }, '新增圖片樣本：'),
        h('button', { class: 'src', onclick: () => this.startCam(c) }, h('i', {}, '📷'), '網路攝影機'),
        h('button', { class: 'src', onclick: () => this.openGallery(c) }, h('i', {}, '🖼️'), '圖庫'),
        h('button', { class: 'src', onclick: () => this.upload(c) }, h('i', {}, '⬆'), '上傳')));
    }
    const thumbs = h('div', { class: 'thumbs' });
    for (const s of c.samples.slice().reverse()) {
      const t = h('div', { class: 'thumb' }, h('img', { src: s.kind === 'lib' ? s.d.src : s.thumb, alt: '' }),
        h('button', { class: 'del', title: '刪除', onclick: () => { this.removeSample(c, s); this.render(); } }, '✕'));
      thumbs.append(t);
    }
    body.append(thumbs);
    card.append(body);
    return card;
  },
  updateCardCount(card, c) {
    const sub = $('.cls-sub', card); if (sub) sub.textContent = `${c.samples.length} 個圖片樣本`;
  },
  async startCam(c) {
    try { await Cam.start(); } catch (e) { return; }
    this.camCard = c; this.render();
  },
  stopCam() { this.camCard = null; this.render(); },

  /* ---------- gallery ---------- */
  openGallery(c) {
    const box = h('div', { class: 'gallery' });
    const count = h('b', {});
    const updCount = () => { count.textContent = c.samples.filter(s => s.kind === 'lib').length; };
    box.append(h('div', { class: 'gal-head' },
      h('div', {}, h('h2', {}, `🖼️ 從圖庫挑照片，放進「${c.name}」`),
        h('div', { class: 'gal-tip' }, '只挑「', h('b', {}, c.name), '」的照片。看不清楚、太暗、只拍到一半的照片，AI 會學錯喔！')),
      h('div', { class: 'gal-right' }, h('span', {}, '已選 ', count, ' 張'), h('button', { class: 'big-btn', onclick: () => Modal.close() }, '完成'))));
    const grid = h('div', { class: 'gal-grid' });
    const tiles = [];
    const paint = () => {
      tiles.forEach(({ t, d }) => {
        const own = this.libOwner(d);
        t.classList.toggle('mine', own === c);
        t.classList.toggle('other', !!own && own !== c);
        $('.tag', t).textContent = own && own !== c ? own.name : '';
      });
      updCount();
    };
    for (const d of DS.lib) {
      const t = h('div', { class: 'gal-tile' }, h('img', { src: d.src, alt: '', loading: 'lazy' }), h('span', { class: 'tag' }), h('span', { class: 'chk' }, '✓'));
      t.addEventListener('click', () => {
        const own = this.libOwner(d);
        if (own === c) { this.removeSample(c, own.samples.find(s => s.kind === 'lib' && s.d === d)); }
        else {
          if (own) this.removeSample(own, own.samples.find(s => s.kind === 'lib' && s.d === d));
          c.samples.push({ kind: 'lib', d, el: DS.img(d) }); this.markDirty();
        }
        paint();
      });
      tiles.push({ t, d }); grid.append(t);
    }
    box.append(grid);
    Modal.onClose = () => this.render();
    Modal.open(box, 'wide');
    paint();
  },

  /* ---------- upload from file (stays local) ---------- */
  upload(c) {
    const inp = h('input', { type: 'file', accept: 'image/*', multiple: true });
    inp.addEventListener('change', async () => {
      for (const f of inp.files) {
        const url = URL.createObjectURL(f);
        const im = new Image(); im.src = url;
        await new Promise(r => { im.onload = im.onerror = r; });
        if (!im.naturalWidth) continue;
        const cv = document.createElement('canvas'); cv.width = cv.height = 224;
        const s = Math.min(im.naturalWidth, im.naturalHeight);
        cv.getContext('2d').drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, 224, 224);
        URL.revokeObjectURL(url);
        c.samples.push({ kind: 'upload', el: cv, thumb: cv.toDataURL('image/jpeg', 0.7) });
      }
      this.markDirty(); this.render();
    });
    inp.click();
  },

  /* ---------- training ---------- */
  renderTrainBtn() {
    const b = $('#trainBtn'); if (!b) return;
    b.disabled = this.training;
    b.textContent = this.training ? '訓練中…' : (this.model && !this.dirty ? '模型已訓練完成' : '訓練模型');
    b.classList.toggle('done', !!this.model && !this.dirty && !this.training);
  },
  async train() {
    if (this.training) return;
    const names = this.classes.map(c => c.name.trim());
    if (new Set(names).size !== names.length) return messageBox('類別名字重複了', '每個類別要取不同的名字，AI 才分得出來。');
    const few = this.classes.filter(c => c.samples.length < this.minCount);
    if (few.length) return messageBox('照片還不夠', `每個類別至少要 <b>${this.minCount}</b> 張照片。<br>還不夠的類別：<b>${few.map(c => c.name).join('、')}</b>`);
    this.training = true; this.renderTrainBtn();
    const st = $('#trainStatus'), bar = $('#trainBar');
    try {
      st.textContent = '正在準備 AI 引擎…'; bar.style.width = '0%';
      await this.loadNet();
      st.textContent = '正在準備訓練資料…';
      const all = this.classes.flatMap((c, ci) => c.samples.map(s => ({ s, ci })));
      let n = 0;
      for (const { s } of all) {
        if (!s.emb) {
          if (s.kind === 'lib') { const im = await DS.ready(s.d); if (!s.d.emb) s.d.emb = this.embed(im); s.emb = s.d.emb; }
          else s.emb = this.embed(s.el);
        }
        if (++n % 6 === 0) { bar.style.width = (n / all.length * 30) + '%'; await tf.nextFrame(); }
      }
      const epochs = Math.max(5, Math.min(200, +$('#advEpochs').value || 50));
      const batchSize = +$('#advBatch').value || 16;
      const lr = Math.max(0.0001, Math.min(0.1, +$('#advLr').value || 0.001));
      const k = this.classes.length;
      const X = tf.concat(all.map(a => a.s.emb));
      const Y = tf.tidy(() => tf.oneHot(tf.tensor1d(all.map(a => a.ci), 'int32'), k));
      const head = tf.sequential({ layers: [
        tf.layers.dense({ inputShape: [this.embDim], units: 100, activation: 'relu' }),
        tf.layers.dense({ units: k, activation: 'softmax' })] });
      head.compile({ optimizer: tf.train.adam(lr), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
      await head.fit(X, Y, { epochs, batchSize, shuffle: true, callbacks: { onEpochEnd: async (ep) => {
        st.textContent = `訓練中：第 ${ep + 1} / ${epochs} 週期`; bar.style.width = (30 + (ep + 1) / epochs * 70) + '%';
        await tf.nextFrame();
      } } });
      X.dispose(); Y.dispose();
      const labels = names.slice();
      this.model = {
        labels, head, trainedAt: Date.now(),
        snapshot: this.snapshot(),
        predict: el => tf.tidy(() => Array.from(head.predict(Trainer.net.infer(el, true)).dataSync()))
      };
      this.dirty = false;
      st.textContent = '✅ 模型已完成訓練';
      $('#exportBtn').disabled = false;
      this.showPreview();
    } catch (e) {
      console.error(e); st.textContent = '訓練失敗：' + e.message;
    } finally {
      this.training = false; this.renderTrainBtn();
    }
  },
  /** record what data the model was trained with (for the data-quality gate) */
  snapshot() {
    return this.classes.map(c => ({ name: c.name, total: c.samples.length, lib: c.samples.filter(s => s.kind === 'lib').map(s => s.d.c) }));
  },

  /* ---------- data quality gate ---------- */
  gate(snap) {
    const msgs = []; const majors = {};
    for (const c of snap) {
      if (c.total < this.minCount) msgs.push(`「${c.name}」的照片少於 ${this.minCount} 張。`);
      if (!c.lib.length) continue;
      const cnt = {}; c.lib.forEach(t => { cnt[t] = (cnt[t] || 0) + 1; });
      const major = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
      const wrong = c.lib.length - cnt[major];
      if (wrong > this.maxWrong) msgs.push(`「${c.name}」這一類好像混進了奇怪的照片，再檢查一次。`);
      if (major !== 'trap') {
        if (majors[major]) msgs.push(`「${majors[major]}」和「${c.name}」好像放的是同一種手勢。`);
        else majors[major] = c.name;
      }
    }
    const libUsed = snap.some(c => c.lib.length);
    if (libUsed) {
      const hasCam = snap.some(c => c.lib.length === 0 && c.total > 0);
      const missing = ['scissors', 'rock', 'paper'].filter(g => !majors[g]);
      if (missing.length && !hasCam) msgs.push(`還缺少「${missing.map(g => CLASS_ZH[g]).join('、')}」的類別。`);
    }
    if (snap.length < 3) msgs.push('猜拳需要「剪刀、石頭、布」三個類別。');
    return { ok: msgs.length === 0, msgs };
  },

  /* ---------- preview ---------- */
  showPreview() {
    $('#previewEmpty').classList.add('hidden'); $('#previewBody').classList.remove('hidden');
    const bars = $('#previewBars'); bars.innerHTML = '';
    this.model.labels.forEach((l, i) => bars.append(h('div', { class: 'bar-row c' + (i % 5) },
      h('span', { class: 'bl' }, l), h('div', { class: 'bt' }, h('div', { class: 'bf' }, h('span', {}, '0%'))))));
    if (!this.previewTimer) this.previewTimer = setInterval(() => this.previewTick(), 200);
  },
  previewEl() {
    const src = $('#previewSource').value, v = $('#previewVideo');
    if (src === 'camera') return Cam.ready(v) ? v : null;
    return this.previewSel ? DS.img(this.previewSel) : null;
  },
  previewTick() {
    if (!this.model || $('#page1').classList.contains('hidden') || Modal.isOpen()) return;
    const el = this.previewEl();
    $('#previewNone').classList.toggle('hidden', !!el);
    if (!el || (el.tagName === 'IMG' && !(el.complete && el.naturalWidth > 0))) return;
    const p = this.model.predict(el);
    $$('#previewBars .bar-row').forEach((r, i) => {
      const v = Math.round((p[i] || 0) * 100);
      $('.bf', r).style.width = v + '%'; $('.bf span', r).textContent = v + '%';
    });
  },
  async setPreviewSource(src) {
    const v = $('#previewVideo'), ph = $('#previewPhoto');
    if (src === 'camera') {
      try { await Cam.start(); } catch (e) { $('#previewSource').value = 'photo'; return this.setPreviewSource('photo'); }
      Cam.attach(v); v.classList.remove('hidden'); ph.classList.add('hidden'); $('#previewStrip').classList.add('hidden');
    } else {
      v.classList.add('hidden'); ph.classList.remove('hidden'); $('#previewStrip').classList.remove('hidden');
    }
  },

  /* ---------- export ("upload to cloud") ---------- */
  openExport() {
    if (!this.model) return;
    const box = h('div', { class: 'export' });
    box.append(h('h2', {}, '匯出模型，在專案中使用。'));
    box.append(h('div', { class: 'exp-tabs' }, h('span', { class: 'on' }, 'Tensorflow.js'), h('span', {}, 'Tensorflow'), h('span', {}, 'Tensorflow Lite')));
    const area = h('div', { class: 'exp-area' });
    area.append(h('div', { class: 'exp-radio' }, h('label', {}, h('input', { type: 'radio', name: 'exp', checked: true }), ' 上傳（可共用的連結）'),
      h('label', { class: 'dis' }, h('input', { type: 'radio', name: 'exp', disabled: true }), ' 下載')));
    const upBtn = h('button', { class: 'tm-btn' }, this.shareUrl ? '⬆ 更新雲端模型' : '⬆ 上傳我的模型');
    const msg = h('div', { class: 'exp-msg' });
    const linkRow = h('div', { class: 'exp-link' + (this.shareUrl ? '' : ' hidden') });
    const linkInp = h('input', { readonly: true, value: this.shareUrl || '', spellcheck: 'false' });
    const copyBtn = h('button', { class: 'tm-btn ghost' }, '📋 複製');
    linkRow.append(h('div', { class: 'lbl' }, '你的可共用連結：'), h('div', { class: 'row' }, linkInp, copyBtn));
    copyBtn.addEventListener('click', () => copyText(linkInp));
    linkInp.addEventListener('focus', () => linkInp.select());
    upBtn.addEventListener('click', async () => {
      msg.className = 'exp-msg';
      if (this.dirty) { msg.classList.add('bad'); msg.textContent = '照片改過了，請先關掉這個視窗，再按一次「訓練模型」。'; return; }
      const g = this.gate(this.model.snapshot);
      if (!g.ok) { msg.classList.add('bad'); msg.innerHTML = '❌ 上傳失敗：模型的資料有問題<br>' + g.msgs.map(m => '・' + m).join('<br>'); return; }
      upBtn.disabled = true; upBtn.textContent = '上傳中…';
      await sleep(1400);
      this.publish();
      upBtn.disabled = false; upBtn.textContent = '⬆ 更新雲端模型';
      linkInp.value = this.shareUrl; linkRow.classList.remove('hidden');
      msg.classList.add('good'); msg.textContent = '✅ 上傳完成！複製下面的連結，貼到 Scratch 的「影像分類模型網址」積木裡。';
    });
    area.append(h('div', { class: 'exp-up' }, upBtn), msg, linkRow);
    area.append(h('pre', { class: 'exp-code' }, '<div>Teachable Machine Image Model</div>\n<script src="…/tf.min.js"></script>\n<script>\n  const URL = "' + (this.shareUrl || '{{URL}}') + '";\n  …\n</script>'));
    box.append(area);
    box.append(h('div', { class: 'modal-actions' }, h('button', { class: 'tm-btn ghost', onclick: () => Modal.close() }, '關閉')));
    Modal.open(box, 'mid');
  },
  publish() {
    if (!this.model || this.dirty) throw new Error('模型還沒訓練好');
    if (!this.shareId) {
      const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789_-';
      this.shareId = Array.from({ length: 9 }, () => ch[Math.floor(Math.random() * ch.length)]).join('');
    }
    this.shareUrl = `https://teachable.sim/models/${this.shareId}/`;
    this.registry[this.shareUrl] = this.model;
    App.unlock(2); App.unlock(3);
  },
  lookup(url) { return this.registry[url] || null; },

  /* ---------- teacher demo: pick correct images, train, publish ---------- */
  async demo() {
    const want = ['scissors', 'rock', 'paper'], zh = ['剪刀', '石頭', '布'];
    this.classes.forEach(c => c.samples.slice().forEach(s => this.removeSample(c, s)));
    this.classes = []; this.nextId = 1;
    want.forEach((g, i) => {
      const c = this.addClass(zh[i]);
      DS.lib.filter(d => d.c === g).slice(0, 14).forEach(d => c.samples.push({ kind: 'lib', d, el: DS.img(d) }));
    });
    this.render();
    await this.train();
    this.publish(); // throws if training failed
  },

  init() {
    ['剪刀', '石頭', '布'].forEach(n => this.addClass(n));
    this.render();
    $('#trainBtn').addEventListener('click', () => this.train());
    $('#exportBtn').addEventListener('click', () => this.openExport());
    $('#previewSource').addEventListener('change', e => this.setPreviewSource(e.target.value));
    makePhotoStrip($('#previewStrip'), d => {
      this.previewSel = d; $('#previewPhoto').src = d.src; markStrip($('#previewStrip'), d);
    });
    this.loadNet();
  }
};

function copyText(inp) {
  inp.focus(); inp.select();
  const done = () => toast('✅ 已複製！到 Scratch 的積木裡按 Ctrl+V 貼上');
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(inp.value).then(done, () => { document.execCommand('copy'); done(); });
  else { document.execCommand('copy'); done(); }
}
