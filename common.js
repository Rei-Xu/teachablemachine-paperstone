/* common.js — shared helpers: DOM, modal, toast, camera, photo strips */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}

/* ---------- toast ---------- */
let toastTimer = 0;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

/* ---------- modal ---------- */
const Modal = {
  onClose: null,
  open(content, cls = '') {
    const box = $('#modalBox');
    box.className = 'modal-box ' + cls; box.innerHTML = '';
    box.append(content);
    $('#modal').classList.remove('hidden');
  },
  close() {
    $('#modal').classList.add('hidden'); $('#modalBox').innerHTML = '';
    const f = this.onClose; this.onClose = null; if (f) f();
  },
  isOpen() { return !$('#modal').classList.contains('hidden'); }
};
function messageBox(title, html, btnText = '我知道了') {
  return new Promise(res => {
    const body = h('div', { class: 'msg' }, h('h2', {}, title));
    const p = h('div', { class: 'msg-text' }); p.innerHTML = html; body.append(p);
    body.append(h('div', { class: 'modal-actions' }, h('button', { class: 'big-btn', onclick: () => { Modal.close(); } }, btnText)));
    Modal.onClose = res;
    Modal.open(body, 'narrow');
  });
}

/* ---------- camera (one shared stream) ---------- */
const Cam = {
  stream: null, state: 'idle', explained: false, // idle | on | denied | none
  async start() {
    if (this.stream) return this.stream;
    if (this.state === 'denied' || this.state === 'none') { await this.explainFail(); throw new Error(this.state); }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.state = 'none'; await this.explainFail(); throw new Error('none'); }
    if (!this.explained) {
      this.explained = true;
      await messageBox('📷 要打開鏡頭囉', '等一下畫面<b>左上角</b>會跳出一個小視窗，<br>問你「要不要讓這個網頁使用攝影機」。<br><br><span class="big-em">請按「允許」</span>', '好，我知道了');
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      this.state = 'on';
      return this.stream;
    } catch (e) {
      this.state = (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError' || e.name === 'NotReadableError')) ? 'none' : 'denied';
      await this.explainFail(); throw e;
    }
  },
  explainFail() {
    const why = this.state === 'denied' ? '鏡頭被拒絕使用了（可能按到「封鎖」）。' : '這台電腦找不到鏡頭，或鏡頭正在被別的程式使用。';
    return messageBox('😅 鏡頭打不開', why + '<br><br>沒關係！改用 <b>🖼️ 圖庫</b> 和 <b>測試照片</b> 一樣可以完成任務。');
  },
  attach(video) {
    if (!this.stream) return;
    if (video.srcObject !== this.stream) video.srcObject = this.stream;
    video.play().catch(() => {});
  },
  ready(video) { return !!this.stream && video.readyState >= 2 && video.videoWidth > 0; },
  /** grab a mirrored, centre-cropped 224x224 canvas from a playing video */
  grab(video) {
    const c = document.createElement('canvas'); c.width = c.height = 224;
    const g = c.getContext('2d');
    const vw = video.videoWidth, vh = video.videoHeight, s = Math.min(vw, vh);
    g.translate(224, 0); g.scale(-1, 1);
    g.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, 224, 224);
    return c;
  }
};

/* ---------- dataset images (preloaded Image elements) ---------- */
const DS = {
  lib: window.DATASET.lib.map((d, i) => Object.assign({ idx: i, src: 'assets/lib/' + d.f }, d)),
  test: window.DATASET.test.map((d, i) => Object.assign({ idx: i, src: 'assets/test/' + d.f }, d)),
  img(d) {
    if (!d.el) { d.el = new Image(); d.el.src = d.src; }
    return d.el;
  },
  /** wait until loaded; retry twice if the network dropped it */
  async ready(d) {
    for (let k = 0; k < 3; k++) {
      const im = this.img(d);
      if (!im.complete) await new Promise(r => { im.onload = im.onerror = r; });
      if (im.naturalWidth > 0) return im;
      await sleep(300 * (k + 1));
      d.el = new Image(); d.el.src = d.src + '?r=' + (k + 1);
    }
    throw new Error('圖片載入失敗：' + d.src);
  }
};

/** Render clickable / draggable test photo thumbnails. onPick(testItem) */
function makePhotoStrip(container, onPick) {
  container.innerHTML = '';
  for (const d of DS.test) {
    const im = h('img', { src: d.src, draggable: 'true', title: '點一下當作鏡頭畫面', 'data-t': d.idx });
    im.addEventListener('click', () => onPick(d));
    im.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', 'test:' + d.idx); });
    container.append(im);
  }
}
function markStrip(container, d) {
  $$('img', container).forEach(i => i.classList.toggle('sel', !!d && +i.dataset.t === d.idx));
}

const CLASS_ZH = { scissors: '剪刀', rock: '石頭', paper: '布', trap: '其他' };
