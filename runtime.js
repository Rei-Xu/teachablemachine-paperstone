/* runtime.js — stage, sprite, Scratch-like threads, TM2Scratch behaviour */
'use strict';

/* ---------- sprite costumes (original robot "小Q") ---------- */
function robotSVG(sign, mood) {
  const mouth = mood === 'happy' ? '<path d="M50 62 q10 9 20 0" stroke="#24323f" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
    : '<rect x="51" y="60" width="18" height="4" rx="2" fill="#24323f"/>';
  const signBox = sign ? `<g transform="translate(78 78) rotate(8)"><rect x="0" y="0" width="44" height="44" rx="9" fill="#fff" stroke="#3a7bd5" stroke-width="3"/><text x="22" y="32" font-size="27" text-anchor="middle">${sign}</text></g>` : '';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 150">
  <line x1="60" y1="8" x2="60" y2="24" stroke="#3a7bd5" stroke-width="4"/><circle cx="60" cy="8" r="6" fill="#ff7a59"/>
  <rect x="22" y="22" width="76" height="56" rx="18" fill="#7fc4ff" stroke="#3a7bd5" stroke-width="4"/>
  <rect x="32" y="33" width="56" height="36" rx="12" fill="#eaf6ff"/>
  <circle cx="47" cy="49" r="6" fill="#24323f"/><circle cx="73" cy="49" r="6" fill="#24323f"/>
  <circle cx="49" cy="47" r="2" fill="#fff"/><circle cx="75" cy="47" r="2" fill="#fff"/>
  ${mouth}
  <rect x="30" y="82" width="60" height="50" rx="14" fill="#7fc4ff" stroke="#3a7bd5" stroke-width="4"/>
  <circle cx="60" cy="104" r="8" fill="#ffd166" stroke="#3a7bd5" stroke-width="3"/>
  <rect x="34" y="132" width="16" height="14" rx="5" fill="#3a7bd5"/><rect x="70" y="132" width="16" height="14" rx="5" fill="#3a7bd5"/>
  <path d="M30 92 q-16 8 -12 26" stroke="#3a7bd5" stroke-width="7" fill="none" stroke-linecap="round"/>
  ${sign ? '' : '<path d="M90 92 q16 8 12 26" stroke="#3a7bd5" stroke-width="7" fill="none" stroke-linecap="round"/>'}
  ${signBox}</svg>`);
}
const COSTUMES = [
  { name: '待機', src: robotSVG('', 'normal') },
  { name: '剪刀', src: robotSVG('✌️', 'happy') },
  { name: '石頭', src: robotSVG('✊', 'happy') },
  { name: '布', src: robotSVG('✋', 'happy') }
];

class StopThread extends Error {}

const RT = {
  gen: 0, threads: new Set(), edges: new Map(), sayLog: [],
  sprite: { x: 140, y: -60, dir: 90, size: 100, costume: 0, visible: true, say: null, sayKind: 'say', sayToken: 0 },
  tm: { url: null, model: null, labels: [], probs: [], interval: 1, threshold: 0.5, on: true, video: 'on', last: 0, busy: false },
  input: { mode: 'none', photo: null },   // mode: camera | photo | none

  /* ---------- stage DOM ---------- */
  buildStage() {
    const st = h('div', { class: 'stage', id: 'stage' },
      h('video', { id: 'stageVideo', muted: true, playsinline: true }),
      h('img', { id: 'stagePhoto', alt: '' }),
      h('div', { id: 'stageNoInput', class: 'stage-noinput' }, '（鏡頭沒有畫面）'),
      h('img', { id: 'spriteImg', class: 'sprite', alt: '小Q', draggable: 'false' }),
      h('div', { id: 'bubble', class: 'bubble hidden' }, h('span', {})));
    $('#stageVideo', st).muted = true;
    this.stageEl = st;
    st.addEventListener('dragover', e => e.preventDefault());
    st.addEventListener('drop', e => {
      e.preventDefault();
      const v = e.dataTransfer.getData('text/plain');
      if (v.startsWith('test:')) this.setPhoto(DS.test[+v.slice(5)]);
    });
    $('#spriteImg', st).addEventListener('mousedown', () => this.fireHats('event_whenthisspriteclicked'));
    $('#spriteThumb').src = COSTUMES[0].src;
    $('#stageHost2').append(st);
    this.renderSprite();
  },
  mountStage(host) {
    host.append(this.stageEl); this.fitStage();
  },
  fitStage() {
    const host = this.stageEl.parentElement; if (!host) return;
    const s = Math.min(host.clientWidth / 480, host.clientHeight / 360);
    this.stageEl.style.transform = `scale(${s})`;
    host.style.setProperty('--stage-w', (480 * s) + 'px');
    this.stageEl.style.left = ((host.clientWidth - 480 * s) / 2) + 'px';
  },
  renderInput() {
    const v = $('#stageVideo'), p = $('#stagePhoto'), none = $('#stageNoInput');
    const show = this.tm.video !== 'off';
    const cam = this.input.mode === 'camera' && Cam.stream;
    v.classList.toggle('hidden', !(show && cam));
    v.classList.toggle('mirror', this.tm.video === 'on');
    p.classList.toggle('hidden', !(show && this.input.mode === 'photo' && this.input.photo));
    none.classList.toggle('hidden', !(show && !cam && !(this.input.mode === 'photo' && this.input.photo)));
    $$('.src-btn').forEach(b => b.classList.toggle('on', b.dataset.src === this.input.mode));
  },
  async useCamera() {
    try { await Cam.start(); } catch (e) { return this.useMode('photo'); }
    Cam.attach($('#stageVideo')); this.input.mode = 'camera'; this.tm.last = 0; this.renderInput();
  },
  useMode(m) { if (m === 'camera') return this.useCamera(); this.input.mode = m; this.tm.last = 0; this.renderInput(); },
  setPhoto(d) {
    this.input.mode = 'photo'; this.input.photo = d;
    if (d) $('#stagePhoto').src = d.src;
    this.tm.last = 0; this.tm.probs = []; this.renderInput();
    $$('.photo-strip').forEach(s => { if (s.id !== 'previewStrip') markStrip(s, d); });
  },
  inputEl() {
    if (this.input.mode === 'camera') { const v = $('#stageVideo'); return Cam.ready(v) ? v : null; }
    if (this.input.mode === 'photo' && this.input.photo) { const im = DS.img(this.input.photo); return im.complete && im.naturalWidth > 0 ? im : null; }
    return null;
  },

  renderSprite() {
    const s = this.sprite, im = $('#spriteImg'), b = $('#bubble');
    im.src = COSTUMES[s.costume].src;
    const w = 130 * s.size / 100, hgt = 150 * s.size / 100;
    im.style.width = w + 'px'; im.style.height = hgt + 'px';
    im.style.left = (240 + s.x - w / 2) + 'px'; im.style.top = (180 - s.y - hgt / 2) + 'px';
    im.style.transform = `rotate(${s.dir - 90}deg)`;
    im.style.display = s.visible ? '' : 'none';
    if (s.say && s.visible) {
      b.classList.remove('hidden'); b.classList.toggle('think', s.sayKind === 'think');
      $('span', b).textContent = s.say;
      const right = s.x > 0; // sprite on right half -> bubble to its left
      b.classList.toggle('left', right);
      const bw = b.offsetWidth, bh = b.offsetHeight;
      let left = right ? 240 + s.x - w * 0.15 - bw : 240 + s.x + w * 0.15;
      let top = 180 - s.y - hgt / 2 - bh - 4;
      left = Math.max(2, Math.min(478 - bw, left)); top = Math.max(2, top);
      b.style.left = left + 'px'; b.style.top = top + 'px';
    } else b.classList.add('hidden');
  },
  say(text, kind = 'say') {
    const s = this.sprite; text = text === null || text === undefined ? '' : String(text);
    s.say = text === '' ? null : text; s.sayKind = kind; s.sayToken++;
    if (s.say) this.sayLog.push({ t: performance.now(), text: s.say });
    this.renderSprite(); return s.sayToken;
  },
  resetSprite() {
    Object.assign(this.sprite, { x: 140, y: -60, dir: 90, size: 100, costume: 0, visible: true, say: null });
    this.renderSprite();
  },

  /* ---------- TM2Scratch ---------- */
  async tmLoad(url) {
    url = String(url).trim();
    await sleep(700); // network fetch of metadata.json + model.json
    const m = Trainer.lookup(url);
    if (!m) { console.warn('[TM2Scratch] 讀不到模型：', url); this.tm.lastFail = url; return; }
    this.tm.lastFail = null;
    if (this.tm.model !== m) { this.tm.model = m; this.tm.url = url; this.tm.labels = m.labels.slice(); this.tm.probs = []; }
  },
  classifyNow() {
    const el = this.inputEl();
    if (!this.tm.model || !el) { this.tm.probs = []; return; }
    this.tm.probs = this.tm.model.predict(el);
    this.tm.last = performance.now();
  },
  tmLabel() {
    const p = this.tm.probs; if (!p.length) return '';
    let bi = 0; p.forEach((v, i) => { if (v > p[bi]) bi = i; });
    return p[bi] >= this.tm.threshold ? this.tm.labels[bi] : '';
  },
  tmMatch(label) { const l = this.tmLabel(); return label === '任何' ? l !== '' : l === label; },

  /* ---------- threads ---------- */
  check(th) { if (th.dead || th.gen !== this.gen) throw new StopThread(); },
  tick(th) { return new Promise(r => setTimeout(r, 33)).then(() => this.check(th)); },
  async wait(secs, th) { const end = performance.now() + Math.max(0, secs) * 1000; do { await this.tick(th); } while (performance.now() < end); },
  start(top, first) {
    if (!first) return null;
    const th = { top, gen: this.gen, dead: false };
    this.threads.add(th); this.glow();
    (async () => {
      try { await this.execStack(first, th); }
      catch (e) { if (!(e instanceof StopThread)) console.error(e); }
      finally { this.threads.delete(th); this.glow(); }
    })();
    return th;
  },
  running(top) { for (const t of this.threads) if (t.top === top) return true; return false; },
  glow() {
    if (!Blocks.ws) return;
    for (const b of Blocks.ws.getTopBlocks(false)) { try { b.setHighlighted(this.running(b)); } catch (e) {} }
  },
  stopAll() {
    this.gen++; this.threads.clear(); this.glow();
    this.say(null);
  },
  greenFlag() {
    this.stopAll();
    for (const b of Blocks.ws.getTopBlocks(true)) if (b.type === 'event_whenflagclicked' && b.isEnabled()) this.start(b, b.getNextBlock());
  },
  fireHats(type, test = () => true) {
    for (const b of Blocks.ws.getTopBlocks(true)) {
      if (b.type !== type || !b.isEnabled() || !test(b)) continue;
      if (this.running(b)) { for (const t of this.threads) if (t.top === b) t.dead = true; }
      this.start(b, b.getNextBlock());
    }
  },
  /** edge-triggered hats ("接收到影像標籤:…時"), checked every frame like Scratch */
  pollHats() {
    if (!Blocks.ws) return;
    for (const b of Blocks.ws.getTopBlocks(false)) {
      if (b.type !== 'tm_whenreceived' || !b.isEnabled()) continue;
      const now = this.tmMatch(b.getFieldValue('LABEL'));
      const prev = this.edges.get(b.id) || false;
      this.edges.set(b.id, now);
      if (now && !prev && !this.running(b)) this.start(b, b.getNextBlock());
    }
  },

  async execStack(b, th) {
    while (b) {
      if (b.isEnabled()) await this.exec(b, th);
      this.check(th);
      b = b.getNextBlock();
    }
  },
  inp(b, name) { return this.val(b.getInputTargetBlock(name)); },
  num(b, name) { const n = Number(this.inp(b, name)); return isFinite(n) ? n : 0; },
  bool(b, name) { const v = this.inp(b, name); return v === true || v === 'true'; },
  async exec(b, th) {
    const s = this.sprite;
    switch (b.type) {
      case 'motion_movesteps': { const n = this.num(b, 'STEPS'), r = s.dir * Math.PI / 180; s.x = clamp(s.x + n * Math.sin(r), -240, 240); s.y = clamp(s.y + n * Math.cos(r), -180, 180); this.renderSprite(); break; }
      case 'motion_turnright': s.dir += this.num(b, 'DEGREES'); this.renderSprite(); break;
      case 'motion_turnleft': s.dir -= this.num(b, 'DEGREES'); this.renderSprite(); break;
      case 'motion_gotoxy': s.x = clamp(this.num(b, 'X'), -240, 240); s.y = clamp(this.num(b, 'Y'), -180, 180); this.renderSprite(); break;
      case 'looks_say': this.say(this.inp(b, 'MESSAGE')); break;
      case 'looks_think': this.say(this.inp(b, 'MESSAGE'), 'think'); break;
      case 'looks_sayforsecs': case 'looks_thinkforsecs': {
        const tok = this.say(this.inp(b, 'MESSAGE'), b.type === 'looks_say' || b.type === 'looks_sayforsecs' ? 'say' : 'think');
        await this.wait(this.num(b, 'SECS'), th);
        if (s.sayToken === tok) this.say(null);
        break;
      }
      case 'looks_switchcostumeto': { const i = COSTUMES.findIndex(c => c.name === b.getFieldValue('COSTUME')); if (i >= 0) s.costume = i; this.renderSprite(); break; }
      case 'looks_nextcostume': s.costume = (s.costume + 1) % COSTUMES.length; this.renderSprite(); break;
      case 'looks_setsizeto': s.size = clamp(this.num(b, 'SIZE'), 10, 300); this.renderSprite(); break;
      case 'looks_show': s.visible = true; this.renderSprite(); break;
      case 'looks_hide': s.visible = false; this.renderSprite(); break;
      case 'control_wait': await this.wait(this.num(b, 'DURATION'), th); break;
      case 'control_repeat': { const n = Math.round(this.num(b, 'TIMES')); for (let i = 0; i < n; i++) { await this.execStack(b.getInputTargetBlock('SUBSTACK'), th); await this.tick(th); } break; }
      case 'control_forever': for (;;) { await this.execStack(b.getInputTargetBlock('SUBSTACK'), th); await this.tick(th); }
      case 'control_if': if (this.bool(b, 'CONDITION')) await this.execStack(b.getInputTargetBlock('SUBSTACK'), th); break;
      case 'control_if_else': await this.execStack(b.getInputTargetBlock(this.bool(b, 'CONDITION') ? 'SUBSTACK' : 'SUBSTACK2'), th); break;
      case 'control_wait_until': while (!this.bool(b, 'CONDITION')) await this.tick(th); break;
      case 'control_stop': if (b.getFieldValue('STOP_OPTION') === 'all') { this.gen++; this.threads.clear(); this.glow(); } th.dead = true; throw new StopThread();
      case 'tm_modelurl': await this.tmLoad(this.inp(b, 'URL')); break;
      case 'tm_classify': this.classifyNow(); break;
      case 'tm_toggle': this.tm.on = b.getFieldValue('STATE') === 'on'; break;
      case 'tm_interval': this.tm.interval = Number(b.getFieldValue('SECS')) || 1; break;
      case 'tm_setthreshold': this.tm.threshold = clamp(this.num(b, 'TH'), 0, 1); break;
      case 'tm_video': this.tm.video = b.getFieldValue('STATE'); this.renderInput(); break;
      default: break; // reporters dropped as statements do nothing
    }
  },
  val(b) {
    if (!b) return '';
    switch (b.type) {
      case 'sh_text': return b.getFieldValue('TEXT');
      case 'sh_num': return Number(b.getFieldValue('NUM'));
      case 'operator_join': return String(this.inp(b, 'STRING1')) + String(this.inp(b, 'STRING2'));
      case 'operator_equals': {
        const a = this.inp(b, 'OPERAND1'), c = this.inp(b, 'OPERAND2');
        const na = Number(a), nc = Number(c);
        if (String(a).trim() !== '' && String(c).trim() !== '' && isFinite(na) && isFinite(nc)) return na === nc;
        return String(a).toLowerCase() === String(c).toLowerCase();
      }
      case 'operator_and': return this.bool(b, 'OPERAND1') && this.bool(b, 'OPERAND2');
      case 'operator_or': return this.bool(b, 'OPERAND1') || this.bool(b, 'OPERAND2');
      case 'operator_not': return !this.bool(b, 'OPERAND');
      case 'operator_random': {
        const f = this.num(b, 'FROM'), t = this.num(b, 'TO'), lo = Math.min(f, t), hi = Math.max(f, t);
        if (Number.isInteger(lo) && Number.isInteger(hi)) return lo + Math.floor(Math.random() * (hi - lo + 1));
        return lo + Math.random() * (hi - lo);
      }
      case 'tm_label': return this.tmLabel();
      case 'tm_isdetected': return this.tmMatch(b.getFieldValue('LABEL'));
      case 'tm_confidence': { const i = this.tm.labels.indexOf(b.getFieldValue('LABEL')); return i >= 0 && this.tm.probs[i] !== undefined ? this.tm.probs[i] : 0; }
      case 'tm_threshold': return this.tm.threshold;
      default: return '';
    }
  },

  /* ---------- click a block in the editor = run it (like Scratch) ---------- */
  onClick(e) {
    if (e.type !== Blockly.Events.CLICK || e.targetType !== 'block' || !e.blockId) return;
    const ws = Blockly.Workspace.getById(e.workspaceId); if (!ws) return;
    const blk = ws.getBlockById(e.blockId); if (!blk) return;
    if (ws.isFlyout) {
      if (blk.outputConnection) return this.showValue(blk);
      if (!blk.previousConnection && blk.type !== 'event_whenflagclicked') return;
      if (blk.previousConnection) return this.runLoose(blk, true);
      return;
    }
    const root = blk.getRootBlock();
    if (root.outputConnection) return this.showValue(root);
    if (this.running(root)) { for (const t of this.threads) if (t.top === root) t.dead = true; this.glow(); return; }
    if (!root.previousConnection) this.start(root, root.getNextBlock()); // hat: run its body
    else this.start(root, root);
  },
  runLoose(blk) {
    // run a single flyout block once
    const th = { top: null, gen: this.gen, dead: false };
    this.exec(blk, th).catch(err => { if (!(err instanceof StopThread)) console.error(err); });
  },
  showValue(blk) {
    let v = this.val(blk);
    if (typeof v === 'boolean') v = v ? 'true' : 'false';
    if (typeof v === 'number') v = Math.round(v * 1000) / 1000;
    const svg = blk.getSvgRoot().getBoundingClientRect();
    const tip = h('div', { class: 'value-tip' }, String(v));
    document.body.append(tip);
    tip.style.left = (svg.left + svg.width / 2 - tip.offsetWidth / 2) + 'px';
    tip.style.top = (svg.bottom + 8) + 'px';
    setTimeout(() => tip.remove(), 1600);
  },

  init() {
    this.buildStage();
    $$('.flag-btn').forEach(b => b.addEventListener('click', () => this.greenFlag()));
    $$('.stop-btn').forEach(b => b.addEventListener('click', () => this.stopAll()));
    $$('.src-btn').forEach(b => b.addEventListener('click', () => this.useMode(b.dataset.src)));
    makePhotoStrip($('#stripStage2'), d => this.setPhoto(d));
    makePhotoStrip($('#stripStage3'), d => this.setPhoto(d));
    Blocks.ws.addChangeListener(e => this.onClick(e));
    const fl = Blocks.ws.getFlyout(); if (fl) fl.getWorkspace().addChangeListener(e => this.onClick(e));
    document.addEventListener('keydown', e => {
      if (App.step < 2 || Modal.isOpen()) return;
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.querySelector('.blocklyWidgetDiv input')) return;
      const key = e.key === ' ' ? 'space' : e.key;
      this.fireHats('event_whenkeypressed', b => b.getFieldValue('KEY') === key);
    });
    // classification loop (TM2Scratch keeps classifying in the background)
    setInterval(() => {
      if (!this.tm.on || !this.tm.model || this.tm.busy) return;
      if (performance.now() - this.tm.last < this.tm.interval * 1000) return;
      this.tm.busy = true;
      try { this.classifyNow(); } catch (e) { console.error(e); }
      this.tm.last = performance.now(); this.tm.busy = false;
    }, 100);
    setInterval(() => { if (App.step >= 2) this.pollHats(); }, 33);
    window.addEventListener('resize', () => this.fitStage());
    this.renderInput();
  }
};
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
