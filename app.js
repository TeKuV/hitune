import { ANC_LEVEL, ANC_MODE } from './protocol.js';
import { Headset } from './headset.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const EQ = ['Standard', 'Basses renforcées', 'Voix', 'Folk', 'Électro', 'Pop', 'Classique', 'Rock'];
const GESTURES = [
  [8, 'Contrôle du bruit'], [11, 'Son spatial'], [7, 'Mode jeu'], [6, 'Assistant vocal'], [1, 'Lecture et pause'], [0, 'Aucune action'],
];
const WEAR = [
  [0, 'Désactivée', null],
  [1, 'Pause de la musique', 'La musique s’arrête quand vous retirez le casque et reprend quand vous le remettez.'],
  [2, 'Sans effet sur la musique', 'Le casque détecte le port sans toucher à la lecture.'],
];
const VOICE = [
  [1, 'Chinois', null],
  [0, 'Anglais', 'Muet sur ce firmware : aucune annonce ne sera jouée.'],
  [2, 'Bips', 'Des sons courts à la place des voix.'],
];

/* Ressort critique ou sous-amorti, parametre comme chez Apple : amortissement et reponse (s). */
class Spring {
  constructor(value, { damping = 1, response = 0.35 } = {}) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.k = (2 * Math.PI / response) ** 2;
    this.c = 4 * Math.PI * damping / response;
    this.frame = 0;
  }

  to(target, onFrame, velocity = this.velocity) {
    this.target = target;
    this.velocity = velocity;
    if (reduceMotion.matches) {
      this.set(target, onFrame);
      return;
    }
    cancelAnimationFrame(this.frame);
    let last = performance.now();
    const tick = (now) => {
      let dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      while (dt > 0) {
        const h = Math.min(dt, 1 / 240);
        const a = -this.k * (this.value - this.target) - this.c * this.velocity;
        this.velocity += a * h;
        this.value += this.velocity * h;
        dt -= h;
      }
      if (Math.abs(this.value - this.target) < 0.05 && Math.abs(this.velocity) < 0.5) {
        this.value = this.target;
        this.velocity = 0;
        onFrame(this.value);
        return;
      }
      onFrame(this.value);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  set(value, onFrame) {
    cancelAnimationFrame(this.frame);
    this.value = this.target = value;
    this.velocity = 0;
    onFrame(value);
  }

  stop() {
    cancelAnimationFrame(this.frame);
  }
}

/** Projection de l'elan (Designing Fluid Interfaces, WWDC 2018). */
const project = (velocity, rate = 0.998) => (velocity / 1000) * rate / (1 - rate);

/** Suivi de vitesse sur les derniers evenements de pointeur. */
class Tracker {
  points = [];

  add(x) {
    const t = performance.now();
    this.points.push([x, t]);
    this.points = this.points.filter(([, pt]) => t - pt < 100);
  }

  velocity() {
    if (this.points.length < 2) {
      return 0;
    }
    const [x0, t0] = this.points[0];
    const [x1, t1] = this.points.at(-1);
    return t1 === t0 ? 0 : ((x1 - x0) / (t1 - t0)) * 1000;
  }
}

const headset = new Headset();
const ui = {
  connect: $('#connect'),
  app: $('#app'),
  toast: $('#toast'),
};

/* Messages */

let toastTimer = 0;
function toast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('is-on'), 2600);
}

/* Controle du bruit : la pastille suit le doigt, puis le ressort la pose ; elle reste en attente jusqu'a ce que le casque confirme. */

const noise = {
  track: $('#noise'),
  pill: $('.noise-pill'),
  opts: $$('.noise-opt'),
  spring: null,
  confirmed: ANC_MODE.OFF,
  pending: null,

  width() {
    return (this.track.clientWidth - 8) / 3;
  },

  paint(x) {
    this.pill.style.transform = `translateX(${x}px)`;
  },

  show(mode, velocity) {
    const x = mode * this.width();
    if (!this.spring) {
      this.spring = new Spring(x, { damping: 1, response: 0.32 });
      this.paint(x);
      return;
    }
    this.spring.to(x, (v) => this.paint(v), velocity);
  },

  mark(mode) {
    this.opts.forEach((o) => o.setAttribute('aria-checked', String(Number(o.dataset.mode) === mode)));
    if (ui.app.dataset.anc !== String(mode)) {
      stages.forEach((s) => s.setMode(mode));
    }
    ui.app.dataset.anc = String(mode);
    $('#anc-level').setAttribute('aria-disabled', String(mode !== ANC_MODE.ON));
  },

  async choose(mode, velocity = 0) {
    this.mark(mode);
    this.show(mode, velocity);
    if (mode === this.confirmed && this.pending === null) {
      return;
    }
    this.pending = mode;
    this.track.classList.add('is-pending');
    const level = headset.state.anc.level || ANC_LEVEL.AUTO;
    try {
      await headset.set('anc', mode, level);
    } catch (e) {
      toast(e.message);
    }
    this.pending = null;
    this.track.classList.remove('is-pending');
    this.render(headset.state.anc.mode);
  },

  render(mode) {
    this.confirmed = mode;
    if (this.pending !== null) {
      return;
    }
    this.mark(mode);
    this.show(mode);
  },

  bind() {
    const tracker = new Tracker();
    let drag = null;
    this.track.addEventListener('pointerdown', (e) => {
      if (!headset.state) {
        return;
      }
      const rect = this.track.getBoundingClientRect();
      const w = this.width();
      const x = e.clientX - rect.left - 4;
      const current = this.spring.value;
      const onPill = x >= current && x <= current + w;
      drag = { id: e.pointerId, startX: e.clientX, offset: x - current, onPill, moved: false, rect };
      tracker.points = [];
      tracker.add(e.clientX);
      const opt = e.target.closest('.noise-opt');
      opt?.classList.add('is-press');
    });
    this.track.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) {
        return;
      }
      if (!drag.moved && Math.abs(e.clientX - drag.startX) < 8) {
        return;
      }
      if (!drag.moved) {
        if (!drag.onPill) {
          drag = null;
          return;
        }
        drag.moved = true;
        this.track.setPointerCapture(e.pointerId);
        this.spring.stop();
      }
      tracker.add(e.clientX);
      const max = this.width() * 2;
      let x = e.clientX - drag.rect.left - 4 - drag.offset;
      if (x < 0) {
        x = -rubberband(-x, this.width());
      } else if (x > max) {
        x = max + rubberband(x - max, this.width());
      }
      this.spring.value = x;
      this.paint(x);
    });
    const end = (e) => {
      if (!drag || drag.id !== e.pointerId) {
        return;
      }
      $$('.noise-opt.is-press').forEach((o) => o.classList.remove('is-press'));
      if (drag.moved) {
        const v = tracker.velocity();
        const landing = this.spring.value + project(v, 0.99);
        const mode = Math.max(0, Math.min(2, Math.round(landing / this.width())));
        this.choose(mode, v);
      }
      drag = null;
    };
    this.track.addEventListener('pointerup', end);
    this.track.addEventListener('pointercancel', end);
    this.opts.forEach((o) => o.addEventListener('click', () => {
      if (o.closest('.noise-track') && !this.track.hasPointerCapture?.(0)) {
        this.choose(Number(o.dataset.mode));
      }
    }));
    new ResizeObserver(() => this.spring && this.spring.set(this.confirmed * this.width(), (v) => this.paint(v))).observe(this.track);
  },
};

function rubberband(over, dim, c = 0.55) {
  return (over * dim * c) / (dim + c * over);
}

/* Feuilles : montent du bas, se tirent vers le bas pour fermer, avec l'elan du doigt. */

const sheet = {
  layer: $('#sheet-layer'),
  el: $('.sheet'),
  scrim: $('#sheet-layer .scrim'),
  spring: null,
  onClose: null,
  returnFocus: null,

  height() {
    return this.el.getBoundingClientRect().height + 40;
  },

  paint(y) {
    this.el.style.transform = `translate(-50%, ${y}px)`;
    this.scrim.style.opacity = String(Math.max(0, 1 - y / this.height()));
  },

  open({ title, options, value, foot = '', onPick }) {
    this.returnFocus = document.activeElement;
    $('#sheet-title').textContent = title;
    $('#sheet-foot').textContent = foot;
    const list = $('#sheet-list');
    list.replaceChildren(...options.map(([v, label, sub]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(v === value));
      b.innerHTML = `<span class="cell-label"></span><svg class="option-check"><use href="#i-check"/></svg>`;
      $('.cell-label', b).textContent = label;
      if (sub) {
        const s = document.createElement('span');
        s.className = 'cell-sub';
        s.textContent = sub;
        $('.cell-label', b).append(s);
      }
      b.addEventListener('click', async () => {
        $$('.cell', list).forEach((c) => c.setAttribute('aria-checked', String(c === b)));
        await onPick(v);
        setTimeout(() => this.close(), 160);
      });
      return b;
    }));
    this.layer.hidden = false;
    const h = this.height();
    this.spring = new Spring(h, { damping: 1, response: 0.38 });
    this.paint(h);
    this.spring.to(0, (y) => this.paint(y));
    ($('[aria-checked="true"]', list) ?? $('.sheet-done')).focus({ preventScroll: true });
  },

  close(velocity = 0) {
    if (this.layer.hidden) {
      return;
    }
    const h = this.height();
    this.spring.to(h, (y) => {
      this.paint(y);
      if (y >= h - 1) {
        this.layer.hidden = true;
        this.returnFocus?.focus({ preventScroll: true });
      }
    }, velocity);
  },

  bind() {
    this.layer.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) {
        this.close();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.layer.hidden) {
        this.close();
      }
    });
    const tracker = new Tracker();
    let drag = null;
    for (const handle of [$('.sheet-grabber'), $('.sheet-head')]) {
      handle.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) {
          return;
        }
        handle.setPointerCapture(e.pointerId);
        this.spring.stop();
        drag = { y: e.clientY, from: this.spring.value };
        tracker.points = [];
        tracker.add(e.clientY);
      });
      handle.addEventListener('pointermove', (e) => {
        if (!drag) {
          return;
        }
        tracker.add(e.clientY);
        let y = drag.from + e.clientY - drag.y;
        if (y < 0) {
          y = -rubberband(-y, this.height());
        }
        this.spring.value = y;
        this.paint(y);
      });
      const end = () => {
        if (!drag) {
          return;
        }
        drag = null;
        const v = tracker.velocity();
        const landing = this.spring.value + project(v);
        if (landing > this.height() / 2) {
          this.close(v);
        } else {
          this.spring.to(0, (y) => this.paint(y), v);
        }
      };
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    }
  },
};

/* Alerte de reinitialisation */

function confirmReset() {
  const layer = $('#alert-layer');
  const box = $('.alert', layer);
  const scrim = $('.scrim', layer);
  layer.hidden = false;
  const s = new Spring(0, { damping: 1, response: 0.3 });
  const paint = (p) => {
    box.style.opacity = String(p);
    box.style.transform = `scale(${1.12 - 0.12 * p})`;
    scrim.style.opacity = String(p);
  };
  s.to(1, paint);
  $('[data-alert="cancel"]', layer).focus();
  return new Promise((resolve) => {
    const done = (ok) => {
      layer.removeEventListener('click', onClick);
      s.to(0, (p) => {
        paint(p);
        if (p <= 0.01) {
          layer.hidden = true;
        }
      });
      resolve(ok);
    };
    const onClick = (e) => {
      const b = e.target.closest('[data-alert]');
      if (b) {
        done(b.dataset.alert === 'ok');
      }
    };
    layer.addEventListener('click', onClick);
  });
}

/* Rendu de l'etat confirme par le casque */

const label = (pairs, v) => (pairs.find(([k]) => k === v)?.[1] ?? '-');

function render(st) {
  const bat = $('#battery');
  if (st.battery) {
    bat.style.setProperty('--level', `${Math.max(6, st.battery.level)}%`);
    bat.classList.toggle('is-low', st.battery.level <= 20 && !st.battery.charging);
    bat.classList.toggle('is-charging', st.battery.charging);
    $('.battery-text', bat).textContent = `${st.battery.level} %${st.battery.charging ? ' · en charge' : ''}`;
  }
  if (st.anc) {
    noise.render(st.anc.mode);
    $$('#anc-level button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.level) === st.anc.level)));
  }
  for (const input of $$('[data-switch]')) {
    if (!input.classList.contains('is-pending')) {
      input.checked = Boolean(st[input.dataset.switch]);
    }
  }
  const value = (key, text) => { $(`[data-value="${key}"]`).textContent = text; };
  value('eq', EQ[st.eq] ?? '-');
  if (st.gestures) {
    value('single', label(GESTURES, st.gestures.single));
    value('double', label(GESTURES, st.gestures.double));
    value('long', label(GESTURES, st.gestures.long));
  }
  value('wear', label(WEAR, st.wear));
  value('voice', label(VOICE, st.voice));
  const tips = $('#tips');
  if (document.activeElement !== tips && st.tipsVolume) {
    tips.value = st.tipsVolume;
    paintSlider(tips);
  }
  value('firmware', st.version?.firmware ?? '-');
  value('name', st.name);
  const codecs = [...new Set(Object.values(st.codecs ?? {}))];
  value('codec', codecs.join(', ') || '-');
  $('#status-line').textContent = st.demo
    ? 'Aperçu : aucun casque connecté'
    : ['Connecté', codecs[0], st.version && `firmware ${st.version.firmware}`].filter(Boolean).join(' · ');
  renderDevices(st);
}

function renderDevices(st) {
  const box = $('#devices');
  const list = Object.values(st.devices ?? {}).sort((a, b) => a.index - b.index);
  box.replaceChildren(...list.map((d) => {
    const row = document.createElement('div');
    row.className = 'cell';
    row.innerHTML = '<span class="cell-label"><span class="device-name"></span><span class="cell-sub"></span></span><button type="button" class="device-action">Déconnecter</button>';
    $('.device-name', row).textContent = d.name || 'Appareil';
    $('.cell-sub', row).textContent = `Connecté${st.codecs?.[d.index] ? ` · ${st.codecs[d.index]}` : ''}`;
    $('.device-action', row).addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try {
        await headset.set('disconnect', d.index, d.mac);
        toast(`${d.name} est déconnecté`);
      } catch (err) {
        toast(err.message);
        e.currentTarget.disabled = false;
      }
    });
    return row;
  }));
}

function paintSlider(input) {
  const p = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--p', `${p}%`);
  $('#tips-out').textContent = input.value;
}

/* Reglages */

async function apply(fn, failText) {
  try {
    const reply = await fn();
    return reply;
  } catch (e) {
    toast(failText ?? e.message);
    return null;
  }
}

function bindSettings() {
  for (const input of $$('[data-switch]')) {
    input.addEventListener('change', async () => {
      const key = input.dataset.switch;
      const want = input.checked;
      input.classList.add('is-pending');
      const reply = await apply(() => headset.set(key, want));
      input.classList.remove('is-pending');
      if (key === 'dual' && reply?.data?.[0] === 255) {
        toast('Le casque refuse : coupez d’abord la haute qualité (LDAC).');
      }
      render(headset.state);
    });
  }

  $$('#anc-level button').forEach((b) => b.addEventListener('click', async () => {
    $$('#anc-level button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    await apply(() => headset.set('anc', ANC_MODE.ON, Number(b.dataset.level)));
    render(headset.state);
  }));

  const tips = $('#tips');
  tips.addEventListener('input', () => paintSlider(tips));
  tips.addEventListener('change', async () => {
    await apply(() => headset.set('tipsVolume', Number(tips.value)));
    tips.blur();
    render(headset.state);
  });

  const pickers = {
    eq: () => ({
      title: 'Égaliseur',
      options: EQ.map((name, i) => [i, name, null]),
      value: headset.state.eq,
      onPick: (v) => apply(() => headset.set('eq', v)),
    }),
    voice: () => ({
      title: 'Annonces vocales',
      options: VOICE,
      value: headset.state.voice,
      foot: 'Le casque ne contient pas de voix en français.',
      onPick: (v) => apply(() => headset.set('voice', v)),
    }),
    wear: () => ({
      title: 'Détection du port',
      options: WEAR,
      value: headset.state.wear,
      onPick: (v) => apply(() => headset.set('wear', v)),
    }),
    ...Object.fromEntries([['single', 'Un appui'], ['double', 'Deux appuis'], ['long', 'Appui long']].map(([key, title]) => [key, () => ({
      title,
      options: GESTURES.map(([v, l]) => [v, l, null]),
      value: headset.state.gestures[key],
      foot: 'Action du bouton de contrôle du bruit.',
      onPick: (v) => apply(() => headset.set('gestures', { ...headset.state.gestures, [key]: v })),
    })])),
  };
  $$('[data-picker]').forEach((b) => b.addEventListener('click', () => sheet.open(pickers[b.dataset.picker]())));

  $('#reset-btn').addEventListener('click', async () => {
    if (await confirmReset()) {
      await apply(() => headset.reset());
      toast('Casque réinitialisé. Appairez-le à nouveau.');
    }
  });

  $('#disconnect-btn').addEventListener('click', () => headset.disconnect());
}

/* Connexion */

async function connect(demo) {
  const btn = $('#connect-btn');
  const msg = $('#connect-msg');
  btn.disabled = true;
  msg.className = 'connect-msg is-info';
  msg.textContent = demo ? '' : 'Recherche du casque…';
  try {
    const st = await headset.connect({ demo });
    ui.connect.hidden = true;
    ui.app.hidden = false;
    noise.spring = null;
    render(st);
    msg.textContent = '';
  } catch (e) {
    msg.className = 'connect-msg';
    if (e.name === 'NotFoundError' && /cancel/i.test(e.message)) {
      msg.textContent = '';
    } else if (e.name === 'NotFoundError') {
      msg.textContent = 'Casque introuvable. Éteignez-le, rallumez-le, puis réessayez.';
    } else {
      msg.textContent = e.message || 'La connexion a échoué. Réessayez.';
    }
    headset.disconnect();
  } finally {
    btn.disabled = false;
  }
}

/* Casque 3D : charge apres le premier rendu ; le dessin SVG reste en place si WebGL ou le reseau manquent. */
const stages = [];
async function mount3d() {
  try {
    const { mountHeadphones } = await import('./model3d.js');
    for (const el of $$('[data-stage]')) {
      stages.push(mountHeadphones(el));
      el.classList.add('is-3d');
    }
  } catch (e) {
    console.warn('Casque 3D indisponible', e);
  }
}

function init() {
  requestAnimationFrame(() => setTimeout(mount3d, 0));
  noise.bind();
  sheet.bind();
  bindSettings();

  headset.addEventListener('state', (e) => render(e.detail));
  headset.addEventListener('disconnect', () => {
    const wasDemo = headset.state?.demo;
    sheet.layer.hidden = true;
    ui.app.hidden = true;
    ui.connect.hidden = false;
    if (!wasDemo) {
      toast('Casque déconnecté');
    }
  });

  if (!Headset.supported) {
    const msg = $('#connect-msg');
    msg.className = 'connect-msg';
    msg.textContent = 'Ce navigateur ne gère pas le Bluetooth. Sur iPhone, ouvrez cette page dans Bluefy ; sur PC, dans Edge ou Chrome.';
    $('#connect-btn').disabled = true;
  }
  $('#connect-btn').addEventListener('click', () => connect(false));
  $('#demo-btn').addEventListener('click', () => connect(true));

  const title = $('#title');
  new IntersectionObserver(([entry]) => {
    ui.app.classList.toggle('is-scrolled', !entry.isIntersecting);
  }, { rootMargin: '-44px 0px 0px 0px' }).observe(title);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js');
  }
  if (new URLSearchParams(location.search).has('apercu')) {
    connect(true);
  }
}

init();
