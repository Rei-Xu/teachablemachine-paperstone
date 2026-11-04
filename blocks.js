/* blocks.js — Scratch-3-like block editor (Blockly zelos) with TM2Scratch extension blocks */
'use strict';
const FLAG_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 3v19" stroke="#45993d" stroke-width="2.4" stroke-linecap="round"/><path d="M6 4c4-2.5 7 2 12-.5v9c-5 2.5-8-2-12 .5z" fill="#4cbf56" stroke="#45993d" stroke-width="1.2" stroke-linejoin="round"/></svg>');
const TM_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="4" y="9" width="32" height="22" rx="5" fill="#fff"/><circle cx="20" cy="20" r="7" fill="#0FBD8C"/><circle cx="20" cy="20" r="3" fill="#fff"/><path d="M8 6l4 4M32 6l-4 4" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>');

const CATS = [
  { id: 'motion', name: '動作', c: ['#4C97FF', '#4280D7', '#3373CC'] },
  { id: 'looks', name: '外觀', c: ['#9966FF', '#855CD6', '#774DCB'] },
  { id: 'event', name: '事件', c: ['#FFBF00', '#E6AC00', '#CC9900'] },
  { id: 'control', name: '控制', c: ['#FFAB19', '#EC9C13', '#CF8B17'] },
  { id: 'operator', name: '運算', c: ['#59C059', '#46B946', '#389438'] },
  { id: 'tm', name: 'TM2Scratch', c: ['#0FBD8C', '#0DA57A', '#0B8E69'], ext: true }
];

const Blocks = {
  ws: null, tmAdded: false,

  defineTheme() {
    const blockStyles = { shadow: { colourPrimary: '#FFFFFF', colourSecondary: '#FFFFFF', colourTertiary: '#C6C6C6' } };
    for (const c of CATS) {
      blockStyles[c.id] = { colourPrimary: c.c[0], colourSecondary: c.c[1], colourTertiary: c.c[2] };
      blockStyles[c.id + '_hat'] = { colourPrimary: c.c[0], colourSecondary: c.c[1], colourTertiary: c.c[2], hat: 'cap' };
    }
    return Blockly.Theme.defineTheme('scratchlike', {
      base: Blockly.Themes.Classic,
      blockStyles,
      componentStyles: {
        workspaceBackgroundColour: '#F9F9F9', toolboxBackgroundColour: '#FFFFFF', flyoutBackgroundColour: '#F9F9F9',
        flyoutOpacity: 1, scrollbarColour: '#CECDCE', scrollbarOpacity: 0.6, insertionMarkerColour: '#000', insertionMarkerOpacity: 0.2
      },
      fontStyle: { family: '"Helvetica Neue", Helvetica, Arial, "Microsoft JhengHei", "PingFang TC", sans-serif', weight: '500', size: 12 },
      startHats: false
    });
  },

  defineBlocks() {
    const num = (name, v) => ({ type: 'input_value', name, check: null, _shadow: { type: 'sh_num', fields: { NUM: v } } });
    const txt = (name, v) => ({ type: 'input_value', name, _shadow: { type: 'sh_text', fields: { TEXT: v } } });
    const boolIn = name => ({ type: 'input_value', name, check: 'Boolean' });
    const defs = [
      { type: 'sh_num', message0: '%1', args0: [{ type: 'field_number', name: 'NUM', value: 0 }], output: null, style: 'shadow' },
      { type: 'sh_text', message0: '%1', args0: [{ type: 'field_input', name: 'TEXT', text: '' }], output: null, style: 'shadow' },
      // motion
      { type: 'motion_movesteps', message0: '移動 %1 點', args0: [num('STEPS', 10)], previousStatement: null, nextStatement: null, style: 'motion' },
      { type: 'motion_turnright', message0: '右轉 ↻ %1 度', args0: [num('DEGREES', 15)], previousStatement: null, nextStatement: null, style: 'motion' },
      { type: 'motion_turnleft', message0: '左轉 ↺ %1 度', args0: [num('DEGREES', 15)], previousStatement: null, nextStatement: null, style: 'motion' },
      { type: 'motion_gotoxy', message0: '定位到 x: %1 y: %2', args0: [num('X', 0), num('Y', 0)], previousStatement: null, nextStatement: null, style: 'motion' },
      // looks
      { type: 'looks_sayforsecs', message0: '說出 %1 持續 %2 秒', args0: [txt('MESSAGE', '你好！'), num('SECS', 2)], previousStatement: null, nextStatement: null, style: 'looks' },
      { type: 'looks_say', message0: '說出 %1', args0: [txt('MESSAGE', '你好！')], previousStatement: null, nextStatement: null, style: 'looks' },
      { type: 'looks_thinkforsecs', message0: '想著 %1 持續 %2 秒', args0: [txt('MESSAGE', '嗯……'), num('SECS', 2)], previousStatement: null, nextStatement: null, style: 'looks' },
      { type: 'looks_think', message0: '想著 %1', args0: [txt('MESSAGE', '嗯……')], previousStatement: null, nextStatement: null, style: 'looks' },
      { type: 'looks_switchcostumeto', message0: '造型換成 %1', args0: [{ type: 'field_dropdown', name: 'COSTUME', options: [['待機', '待機'], ['剪刀', '剪刀'], ['石頭', '石頭'], ['布', '布']] }], previousStatement: null, nextStatement: null, style: 'looks' },
      { type: 'looks_nextcostume', message0: '下一個造型', previousStatement: null, nextStatement: null, style: 'looks' },
      { type: 'looks_setsizeto', message0: '尺寸設為 %1 %%', args0: [num('SIZE', 100)], previousStatement: null, nextStatement: null, style: 'looks' },
      { type: 'looks_show', message0: '顯示', previousStatement: null, nextStatement: null, style: 'looks' },
      { type: 'looks_hide', message0: '隱藏', previousStatement: null, nextStatement: null, style: 'looks' },
      // events
      { type: 'event_whenflagclicked', message0: '當 %1 被點擊', args0: [{ type: 'field_image', src: FLAG_SVG, width: 24, height: 24, alt: '綠旗' }], nextStatement: null, style: 'event_hat' },
      { type: 'event_whenthisspriteclicked', message0: '當角色被點擊', nextStatement: null, style: 'event_hat' },
      { type: 'event_whenkeypressed', message0: '當 %1 鍵被按下', args0: [{ type: 'field_dropdown', name: 'KEY', options: [['空白', 'space'], ['向上', 'ArrowUp'], ['向下', 'ArrowDown'], ['向右', 'ArrowRight'], ['向左', 'ArrowLeft'], ['a', 'a'], ['b', 'b']] }], nextStatement: null, style: 'event_hat' },
      // control
      { type: 'control_wait', message0: '等待 %1 秒', args0: [num('DURATION', 1)], previousStatement: null, nextStatement: null, style: 'control' },
      { type: 'control_repeat', message0: '重複 %1 次', args0: [num('TIMES', 10)], message1: '%1', args1: [{ type: 'input_statement', name: 'SUBSTACK' }], message2: '↻', previousStatement: null, nextStatement: null, style: 'control' },
      { type: 'control_forever', message0: '重複無限次', message1: '%1', args1: [{ type: 'input_statement', name: 'SUBSTACK' }], message2: '↻', previousStatement: null, style: 'control' },
      { type: 'control_if', message0: '如果 %1 那麼', args0: [boolIn('CONDITION')], message1: '%1', args1: [{ type: 'input_statement', name: 'SUBSTACK' }], previousStatement: null, nextStatement: null, style: 'control' },
      { type: 'control_if_else', message0: '如果 %1 那麼', args0: [boolIn('CONDITION')], message1: '%1', args1: [{ type: 'input_statement', name: 'SUBSTACK' }], message2: '否則', message3: '%1', args3: [{ type: 'input_statement', name: 'SUBSTACK2' }], previousStatement: null, nextStatement: null, style: 'control' },
      { type: 'control_wait_until', message0: '等待直到 %1', args0: [boolIn('CONDITION')], previousStatement: null, nextStatement: null, style: 'control' },
      { type: 'control_stop', message0: '停止 %1', args0: [{ type: 'field_dropdown', name: 'STOP_OPTION', options: [['全部', 'all'], ['這個程式', 'this script']] }], previousStatement: null, style: 'control' },
      // operators
      { type: 'operator_equals', message0: '%1 = %2', args0: [txt('OPERAND1', ''), txt('OPERAND2', '50')], output: 'Boolean', inputsInline: true, style: 'operator' },
      { type: 'operator_and', message0: '%1 且 %2', args0: [boolIn('OPERAND1'), boolIn('OPERAND2')], output: 'Boolean', inputsInline: true, style: 'operator' },
      { type: 'operator_or', message0: '%1 或 %2', args0: [boolIn('OPERAND1'), boolIn('OPERAND2')], output: 'Boolean', inputsInline: true, style: 'operator' },
      { type: 'operator_not', message0: '%1 不成立', args0: [boolIn('OPERAND')], output: 'Boolean', inputsInline: true, style: 'operator' },
      { type: 'operator_join', message0: '字串組合 %1 %2', args0: [txt('STRING1', '蘋果'), txt('STRING2', '香蕉')], output: null, inputsInline: true, style: 'operator' },
      { type: 'operator_random', message0: '隨機取數 %1 到 %2', args0: [num('FROM', 1), num('TO', 10)], output: null, inputsInline: true, style: 'operator' },
      // TM2Scratch (texts follow the extension's zh-tw locale)
      { type: 'tm_modelurl', message0: '%1 影像分類模型網址 %2', args0: [{ type: 'field_image', src: TM_ICON, width: 26, height: 26, alt: '' }, txt('URL', 'https://teachable.sim/models/0rX_3hoH/')], previousStatement: null, nextStatement: null, inputsInline: true, style: 'tm' },
      { type: 'tm_classify', message0: '%1 影像分類', args0: [{ type: 'field_image', src: TM_ICON, width: 26, height: 26, alt: '' }], previousStatement: null, nextStatement: null, style: 'tm' },
      { type: 'tm_label', message0: '%1 影像標籤', args0: [{ type: 'field_image', src: TM_ICON, width: 26, height: 26, alt: '' }], output: null, style: 'tm' },
      { type: 'tm_toggle', message0: '%1 %2 分類', args0: [{ type: 'field_image', src: TM_ICON, width: 26, height: 26, alt: '' }, { type: 'field_dropdown', name: 'STATE', options: [['關閉', 'off'], ['開啟', 'on']] }], previousStatement: null, nextStatement: null, style: 'tm' },
      { type: 'tm_interval', message0: '%1 每隔 %2 秒標記一次', args0: [{ type: 'field_image', src: TM_ICON, width: 26, height: 26, alt: '' }, { type: 'field_dropdown', name: 'SECS', options: [['1', '1'], ['0.5', '0.5'], ['0.2', '0.2'], ['0.1', '0.1']] }], previousStatement: null, nextStatement: null, style: 'tm' },
      { type: 'tm_setthreshold', message0: '%1 設定置信度閾值 %2', args0: [{ type: 'field_image', src: TM_ICON, width: 26, height: 26, alt: '' }, num('TH', 0.5)], previousStatement: null, nextStatement: null, inputsInline: true, style: 'tm' },
      { type: 'tm_threshold', message0: '%1 置信度閾值', args0: [{ type: 'field_image', src: TM_ICON, width: 26, height: 26, alt: '' }], output: null, style: 'tm' },
      { type: 'tm_video', message0: '%1 視訊設為 %2', args0: [{ type: 'field_image', src: TM_ICON, width: 26, height: 26, alt: '' }, { type: 'field_dropdown', name: 'STATE', options: [['關閉', 'off'], ['開啟', 'on'], ['翻轉', 'on-flipped']] }], previousStatement: null, nextStatement: null, style: 'tm' }
    ];
    // strip private _shadow keys (shadows are added in the toolbox definition)
    this.shadowSpec = {};
    for (const d of defs) {
      for (const key of Object.keys(d)) if (/^args\d$/.test(key)) d[key].forEach(a => {
        if (a._shadow) { (this.shadowSpec[d.type] = this.shadowSpec[d.type] || {})[a.name] = a._shadow; delete a._shadow; }
      });
    }
    Blockly.defineBlocksWithJsonArray(defs);

    // dynamic label dropdowns (labels appear after the model URL block has loaded a model)
    const labelOpts = withAny => () => {
      const ls = (RT && RT.tm.labels) || [];
      const o = withAny ? [['任何', '任何']] : [];
      ls.forEach(l => o.push([l, l]));
      return o.length ? o : [['', '']];
    };
    const icon = () => new Blockly.FieldImage(TM_ICON, 26, 26, '');
    Blockly.Blocks.tm_whenreceived = { init() {
      this.appendDummyInput().appendField(icon()).appendField('接收到影像標籤:').appendField(new Blockly.FieldDropdown(labelOpts(true)), 'LABEL').appendField('時');
      this.setNextStatement(true); this.setStyle('tm_hat');
    } };
    Blockly.Blocks.tm_isdetected = { init() {
      this.appendDummyInput().appendField(icon()).appendField('影像').appendField(new Blockly.FieldDropdown(labelOpts(true)), 'LABEL').appendField('被偵測？');
      this.setOutput(true, 'Boolean'); this.setStyle('tm');
    } };
    Blockly.Blocks.tm_confidence = { init() {
      this.appendDummyInput().appendField(icon()).appendField('影像置信度').appendField(new Blockly.FieldDropdown(labelOpts(false)), 'LABEL');
      this.setOutput(true, null); this.setStyle('tm');
    } };
  },

  blk(type, extra = {}) {
    const b = Object.assign({ kind: 'block', type }, extra);
    const sh = this.shadowSpec[type];
    if (sh) { b.inputs = {}; for (const [n, s] of Object.entries(sh)) b.inputs[n] = { shadow: { type: s.type, fields: s.fields } }; }
    return b;
  },
  toolbox() {
    const B = t => this.blk(t);
    const contents = [
      { kind: 'label', text: '動作' }, ...['motion_movesteps', 'motion_turnright', 'motion_turnleft', 'motion_gotoxy'].map(B),
      { kind: 'label', text: '外觀' }, ...['looks_sayforsecs', 'looks_say', 'looks_thinkforsecs', 'looks_think', 'looks_switchcostumeto', 'looks_nextcostume', 'looks_setsizeto', 'looks_show', 'looks_hide'].map(B),
      { kind: 'label', text: '事件' }, ...['event_whenflagclicked', 'event_whenthisspriteclicked', 'event_whenkeypressed'].map(B),
      { kind: 'label', text: '控制' }, ...['control_wait', 'control_repeat', 'control_forever', 'control_if', 'control_if_else', 'control_wait_until', 'control_stop'].map(B),
      { kind: 'label', text: '運算' }, ...['operator_random', 'operator_equals', 'operator_and', 'operator_or', 'operator_not', 'operator_join'].map(B)
    ];
    if (this.tmAdded) contents.push({ kind: 'label', text: 'TM2Scratch' },
      ...['tm_whenreceived', 'tm_isdetected', 'tm_confidence', 'tm_modelurl', 'tm_classify', 'tm_label', 'tm_toggle', 'tm_interval', 'tm_setthreshold', 'tm_threshold', 'tm_video'].map(B));
    return { kind: 'flyoutToolbox', contents };
  },

  renderCats() {
    const col = $('#catColumn'); col.innerHTML = '';
    for (const c of CATS) {
      if (c.ext && !this.tmAdded) continue;
      const b = h('button', { class: 'cat' + (c.ext ? ' ext' : '') },
        c.ext ? h('img', { src: TM_ICON, class: 'cat-icon', style: `background:${c.c[0]};border-color:${c.c[2]}` }) : h('span', { class: 'dot', style: `background:${c.c[0]};border-color:${c.c[2]}` }),
        h('span', { class: 'cn' }, c.name));
      b.addEventListener('click', () => { $$('.cat', col).forEach(x => x.classList.remove('on')); b.classList.add('on'); this.scrollTo(c.id); });
      col.append(b);
    }
  },
  scrollTo(catId) {
    const fl = this.ws.getFlyout(); if (!fl) return;
    const fws = fl.getWorkspace();
    const first = fws.getTopBlocks(true).find(b => b.type.startsWith(catId === 'operator' ? 'operator_' : catId === 'tm' ? 'tm_' : catId + '_'));
    if (!first) return;
    const y = Math.max(0, first.getRelativeToSurfaceXY().y * fws.scale - 40);
    const start = fws.getMetrics().viewTop, t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 250);
      fws.scrollbar.setY(start + (y - start) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  openExtensions() {
    const box = h('div', { class: 'ext-lib' }, h('h2', {}, '選擇一個擴充功能'));
    const grid = h('div', { class: 'ext-grid' });
    const card = (title, desc, color, ok, onclick, img) => h('button', { class: 'ext-card' + (ok ? '' : ' off'), onclick },
      h('div', { class: 'ext-img', style: `background:${color}` }, img || '🧩'), h('b', {}, title), h('span', {}, desc));
    grid.append(card('TM2Scratch', '用 Teachable Machine 訓練的模型辨識影像。', '#0FBD8C', true, () => { this.addTM(); Modal.close(); }, h('img', { src: TM_ICON, style: 'width:80px' })));
    [['音樂', '演奏樂器和鼓。', '#CF63CF', '🎵'], ['畫筆', '用你的角色畫畫。', '#0FBD8C', '🖊️'], ['視訊偵測', '用鏡頭偵測動作。', '#4C97FF', '🎥'], ['文字轉語音', '讓你的專案說話。', '#9966FF', '🗣️'], ['翻譯', '把文字翻成多種語言。', '#5CB1D6', '🌐']]
      .forEach(([t, d, c, e]) => grid.append(card(t, d + '（本練習不開放）', c, false, () => toast('這個練習只會用到 TM2Scratch 喔'), h('span', { class: 'emo' }, e))));
    box.append(grid, h('div', { class: 'modal-actions' }, h('button', { class: 'tm-btn ghost', onclick: () => Modal.close() }, '← 返回')));
    Modal.open(box, 'wide');
  },
  addTM() {
    if (!this.tmAdded) { this.tmAdded = true; this.ws.updateToolbox(this.toolbox()); this.renderCats(); }
    setTimeout(() => { $$('.cat').forEach(x => x.classList.toggle('on', x.classList.contains('ext'))); this.scrollTo('tm'); }, 60);
  },

  /** demo program for teacher mode */
  loadDemo(url) {
    this.addTM();
    const S = (t, v) => ({ shadow: { type: 'sh_text', fields: { TEXT: v } } });
    const say = (txt, next) => ({ type: 'looks_say', inputs: { MESSAGE: S('', txt) }, next });
    const costume = (c, next) => ({ type: 'looks_switchcostumeto', fields: { COSTUME: c }, next: { block: next } });
    const hat = (label, win, line, x, y) => ({ type: 'tm_whenreceived', x, y, fields: { LABEL: label },
      next: { block: costume(win, say(line)) } });
    const labels = RT.tm.labels.length ? RT.tm.labels : ['剪刀', '石頭', '布'];
    const state = { blocks: { languageVersion: 0, blocks: [
      { type: 'event_whenflagclicked', x: 30, y: 30, next: { block: { type: 'tm_modelurl', inputs: { URL: S('', url) },
        next: { block: { type: 'tm_video', fields: { STATE: 'on' }, next: { block: costume('待機', say('來猜拳吧！')) } } } } } },
      hat(labels[0], '石頭', '我出石頭，我贏了！', 30, 300),
      hat(labels[1], '布', '我出布，我贏了！', 30, 470),
      hat(labels[2], '剪刀', '我出剪刀，我贏了！', 30, 640)
    ] } };
    Blockly.serialization.workspaces.load(state, this.ws);
    // scroll so the program sits just right of the always-open flyout
    setTimeout(() => {
      const ws = this.ws, bb = ws.getBlocksBoundingBox(), s = ws.scale;
      ws.scroll(24 - bb.left * s, 16 - bb.top * s);
    }, 50);
  },

  init() {
    this.defineBlocks();
    const theme = this.defineTheme();
    this.ws = Blockly.inject('blocklyDiv', {
      renderer: 'zelos', theme, toolbox: this.toolbox(), media: 'lib/media/', sounds: false,
      trashcan: true, zoom: { controls: true, wheel: false, startScale: 0.8, maxScale: 2, minScale: 0.4 },
      move: { scrollbars: true, drag: true, wheel: true }, grid: false
    });
    this.renderCats();
    $('#extBtn').addEventListener('click', () => this.openExtensions());
  },
  resize() { if (this.ws) Blockly.svgResize(this.ws); }
};
