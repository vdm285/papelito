// The cards: a bottom sheet on a phone, a card beside the paper on a wide screen (the paper never
// leaves the screen). Each card is a template function of the app component.

import { html, nothing } from 'lit';
import { store, INKS } from '../app/store.js';
import { t, lang, setLang } from '../app/i18n.js';
import { sync } from '../app/sync-control.js';
import { isDone } from '../model/doc.js';
import { aisleOf, AISLES } from '../model/aisles.js';
import { dictIndex, dictMeta } from '../data/dict.js';
import { stampTime } from '../model/hlc.js';
import { icons } from './icons.js';
import { applyTheme } from './theme.js';
import { CREDITS } from './credits.js';
import { install } from '../app/install.js';

export function renderCard(app, card) {
  const body = CARDS[card.kind] ? CARDS[card.kind](app, card) : nothing;
  return html`
    <div class="scrim ${app.wide ? 'desk-hide' : ''}" @click=${() => app.closeCard()}></div>
    <section class="card" role="dialog" aria-modal="true" aria-label=${card.kind}>${body}</section>`;
}

const head = (app, title) => html`<h2><span>${title}</span><button class="icon-btn" aria-label=${t.close} @click=${() => app.closeCard()}>${icons.close}</button></h2>`;

const toggleItem = (label, on, fn, icon, sub) => html`
  <button class="menu-item" role="switch" aria-checked=${on ? 'true' : 'false'} @click=${fn}>
    ${icon}<span class="grow">${label}${sub ? html`<span class="sub">${sub}</span>` : nothing}</span><span class="switch"></span>
  </button>`;

const CARDS = {
  menu(app) {
    const rec = store.rec;
    return html`
      ${head(app, store.title() || t.untitled)}
      ${toggleItem(t.byAisle, rec.aisles, () => store.setAisleView(!rec.aisles), icons.aisles)}
      <button class="menu-item" @click=${() => app.openCard('order')}>${icons.order}<span class="grow">${t.aisleOrder}</span></button>
      <hr />
      <button class="menu-item" @click=${() => app.openCard('lists')}>${icons.sheets}<span class="grow">${t.lists}<span class="sub">${store.index.length}</span></span></button>
      <button class="menu-item" @click=${() => { app.closeCard(); sync.newList(); }}>${icons.plus}<span class="grow">${t.newList}</span></button>
      <button class="menu-item" @click=${() => app.openCard('open')}>${icons.paste}<span class="grow">${t.openLink}</span></button>
      <hr />
      ${'wakeLock' in navigator ? toggleItem(t.keepAwake, store.prefs.awake, () => { store.savePrefs({ awake: !store.prefs.awake }); install.keepAwake(store.prefs.awake); }, icons.sun) : nothing}
      ${install.canInstall() ? html`<button class="menu-item" @click=${() => install.prompt(app)}>${icons.install}<span class="grow">${t.install}</span></button>` : nothing}
      <button class="menu-item" @click=${() => app.openCard('settings')}>${icons.gear}<span class="grow">${t.settings}</span></button>
      <button class="menu-item" @click=${() => app.openCard('credits')}>${icons.info}<span class="grow">${t.about}</span></button>
      <hr />
      <button class="menu-item danger" ?disabled=${!store.items().length} @click=${() => { app.closeCard(); store.emptyList(); }}>${icons.eraser}<span class="grow">${t.emptyList}</span></button>`;
  },

  share(app) {
    const rec = store.rec;
    const others = sync.others();
    const st = sync.state;
    const mine = store.inkOf(store.device);
    const used = new Set(Object.keys(store.doc.dev).filter((d) => d !== store.device).map((d) => store.inkOf(d)));
    const name = (store.doc.dev[store.device] && store.doc.dev[store.device].name[0]) || '';
    // the old link no longer carries the sheet: showing its QR would hand someone a dead link
    if (st.status === 'moved') return html`
      ${head(app, t.movedShort)}
      <p>${t.linkMoved}</p>
      <p>${t.movedHow}</p>
      <div class="actions" style="justify-content:flex-start">
        <button class="btn solid" @click=${() => app.openCard('open')}>${icons.paste} ${t.openLink}</button>
      </div>`;
    return html`
      ${head(app, t.shareTitle)}
      <p>${t.shareHow}</p>
      <div class="actions" style="justify-content:flex-start;margin-top:4px">
        <button class="btn solid" @click=${() => sync.sendLink(app)}>${icons.share} ${t.shareSend}</button>
        <button class="btn" @click=${() => sync.copyLink(app)}>${icons.copy} ${t.shareCopy}</button>
      </div>
      <h3>${t.shareQr}</h3>
      <div class="qr">${sync.qr(rec)}</div>
      <p style="text-align:center;margin-top:10px">
        <span class="status-dot ${st.status === 'synced' ? 'ok' : ['offline', 'trouble', 'clock'].includes(st.status) ? 'off' : 'busy'}" style="display:inline-block;margin-right:6px"></span>
        ${statusText(st)}${others.length ? html` · ${t.othersHere(others.length)}` : nothing}
      </p>
      <h3>${t.inkLabel}</h3>
      <div class="ink-swatches" role="radiogroup" aria-label=${t.inkLabel}>
        ${INKS.map((ink) => html`<button class="swatch" role="radio" aria-checked=${ink === mine ? 'true' : 'false'} aria-label=${t.inks[ink]} title=${t.inks[ink]} style="--c: var(--ink-${ink})" ?disabled=${used.has(ink) && ink !== mine} @click=${() => store.setInk(ink)}></button>`)}
      </div>
      <h3>${t.nameLabel}</h3>
      <input class="field" maxlength="24" .value=${name} placeholder=${t.inks[mine]} @change=${(e) => store.setName(e.target.value.trim())} />
      <h3>${t.shareRotate}</h3>
      <p>${t.shareRotateHint}</p>
      <button class="btn" @click=${async () => { await sync.rotate(); app.showToast(t.shareRotated, false); app.requestUpdate(); }}>${icons.refresh} ${t.shareRotate}</button>`;
  },

  item(app, card) {
    const it = store.doc.items[card.id];
    if (!it) return head(app, '');
    const idx = dictIndex();
    const a = idx ? aisleOf(it.t[0], idx, store.fixes()) : { aisle: 'otr', guess: false };
    const by = app.whoName(it.by);
    const struckBy = isDone(it) ? app.whoName(it.d[0]) : '';
    const save = (ta) => { store.edit(card.id, ta.value); };
    return html`
      ${head(app, t.edit)}
      <textarea class="field hand" rows="2" style="--ink: var(--ink-${store.inkOf(it.by)})" .value=${it.t[0]} maxlength="160"
        @keydown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(e.target); app.closeCard(); } }}
        @change=${(e) => save(e.target)}></textarea>
      <p>${by} · ${t.ago(Date.now() - stampTime(it.c))}${struckBy ? html` · ✓ ${struckBy}` : nothing}</p>
      <h3>${a.guess ? t.aisleGuess : t.aisle}</h3>
      <div class="chips">
        ${AISLES.map((id) => html`<button class="chip ${a.aisle === id ? 'on' : ''}" @click=${() => { store.setFix(it.t[0], id); app.showToast(t.movedTo(t.aisles[id]), false); }}>${t.aisles[id]}</button>`)}
      </div>
      <div class="actions">
        <button class="btn danger" @click=${() => { app.closeCard(); store.remove(card.id); }}>${icons.trash} ${t.delete}</button>
        <button class="btn solid" @click=${(e) => { save(e.target.closest('.card').querySelector('textarea')); app.closeCard(); }}>${t.done}</button>
      </div>`;
  },

  lists(app) {
    const lists = [...store.index].sort((a, b) => b.updated - a.updated);
    return html`
      ${head(app, t.lists)}
      ${lists.map((l) => html`
        <div style="display:flex;align-items:center;gap:4px">
          <button class="menu-item" style="flex:1" @click=${() => { app.closeCard(); sync.openList(l.id); }}>
            ${icons.sheets}
            <span class="grow"><span style="font: 600 24px/1.1 var(--font-hand)">${l.title || t.untitled}</span>
              <span class="sub">${l.shared ? `${t.shared} · ` : ''}${t.ago(Date.now() - l.updated)}${l.id === store.rec.id ? ' · ✓' : ''}</span></span>
          </button>
          <button class="icon-btn" aria-label=${`${t.delete}: ${l.title || t.untitled}`} @click=${() => { const back = store.forgetList(l.id); sync.follow(); app.showToast(t.removed(l.title || t.untitled), true, () => { back(); sync.follow(); }); }}>${icons.trash}</button>
        </div>`)}
      <div class="actions" style="justify-content:flex-start">
        <button class="btn solid" @click=${() => { app.closeCard(); sync.newList(); }}>${icons.plus} ${t.newList}</button>
        <button class="btn" @click=${() => app.openCard('open')}>${icons.paste} ${t.openLink}</button>
      </div>`;
  },

  open(app, card) {
    return html`
      ${head(app, t.openLink)}
      <p>${t.openLinkHint}</p>
      <input class="field" inputmode="url" autocomplete="off" placeholder="https://…#k=…" @keydown=${(e) => { if (e.key === 'Enter') go(e.target); }} />
      ${card.bad ? html`<p style="color:var(--danger)">${t.openLinkBad}</p>` : nothing}
      <div class="actions"><button class="btn solid" @click=${(e) => go(e.target.closest('.card').querySelector('input'))}>${t.done}</button></div>`;
    async function go(input) {
      const ok = await sync.openLink(input.value);
      if (ok) app.closeCard(); else app.card = { ...app.card, bad: true };
    }
  },

  order(app) {
    const order = (store.doc.order[0] && store.doc.order[0].length ? [...store.doc.order[0]] : [...AISLES]).filter((a) => AISLES.includes(a));
    for (const a of AISLES) if (!order.includes(a)) order.push(a);
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; store.setOrder(order); };
    return html`
      ${head(app, t.aisleOrder)}
      <p>${t.aisleOrderHint}</p>
      <ol class="order-list">
        ${order.map((a, i) => html`<li><span class="n">${i + 1}</span><span class="grow">${t.aisles[a]}</span>
          <button class="icon-btn" aria-label="↑ ${t.aisles[a]}" ?disabled=${i === 0} @click=${() => move(i, -1)}>${icons.up}</button>
          <button class="icon-btn" aria-label="↓ ${t.aisles[a]}" ?disabled=${i === order.length - 1} @click=${() => move(i, 1)}>${icons.down}</button></li>`)}
      </ol>
      <div class="actions">
        <button class="btn" @click=${() => store.setOrder(null)}>${t.reset}</button>
        ${store.rec.aisles ? nothing : html`<button class="btn solid" @click=${() => { store.setAisleView(true); app.closeCard(); }}>${t.byAisle}</button>`}
      </div>`;
  },

  settings(app) {
    const p = store.prefs;
    const choose = (k, v) => { store.savePrefs({ [k]: v }); if (k === 'theme') applyTheme(); if (k === 'lang') { setLang(v); app.requestUpdate(); } };
    const seg = (k, options) => html`<div class="chips">${options.map(([v, label]) => html`<button class="chip ${(p[k] || options[0][0]) === v ? 'on' : ''}" @click=${() => choose(k, v)}>${label}</button>`)}</div>`;
    return html`
      ${head(app, t.settings)}
      <h3>${t.lang}</h3>
      ${seg('lang', [['es', 'Español'], ['en', 'English']])}
      <h3>${t.theme}</h3>
      ${seg('theme', [['auto', t.themes.auto], ['papel', t.themes.papel], ['pizarron', t.themes.pizarron]])}
      <h3>${t.hand}</h3>
      ${seg('hand', [['mano', t.hands.mano], ['molde', t.hands.molde]])}
      <h3>&nbsp;</h3>
      ${toggleItem(t.doodles, p.doodles, () => choose('doodles', !p.doodles), icons.pen)}
      ${toggleItem(t.motion, p.motion, () => { choose('motion', !p.motion); document.documentElement.classList.toggle('no-motion', !store.prefs.motion); }, icons.refresh)}`;
  },

  credits(app) {
    const m = dictMeta();
    return html`
      ${head(app, t.about)}
      <p>${t.tagline}</p>
      <p>${lang === 'es'
        ? 'Sin cuentas y sin servidor propio: la hoja vive en tus teléfonos y viaja cifrada de extremo a extremo por relevos públicos de Nostr, que solo ven datos revueltos.'
        : 'No accounts and no server of its own: the sheet lives on your phones and travels end-to-end encrypted through public Nostr relays, which only see scrambled bytes.'}</p>
      <h3>${t.credits}</h3>
      <ul class="credits">${CREDITS.map((c) => html`<li><a href=${c.url} target="_blank" rel="noopener">${c.name}</a> · ${c.what}. ${c.license}.</li>`)}</ul>
      ${m ? html`
        <h3>${lang === 'es' ? 'Diccionario de pasillos' : 'Aisle dictionary'}</h3>
        <p class="credits">${m.terms} ${lang === 'es' ? 'palabras, armado el' : 'words, built'} ${m.built}.</p>
        <ul class="credits">${m.sources.map((s) => html`<li>${s.url ? html`<a href=${s.url} target="_blank" rel="noopener">${s.name}</a>` : s.name}${s.credit ? html`. ${s.credit}` : nothing}${s.license ? html` (${s.license})` : nothing}</li>`)}</ul>` : nothing}
      <h3>${lang === 'es' ? 'Licencias completas' : 'Full licences'}</h3>
      <p class="credits">${[['OFL-Caveat.txt', 'Caveat'], ['OFL-AtkinsonHyperlegibleNext.txt', 'Atkinson Hyperlegible Next'], ['OFL-NotoEmoji.txt', 'Noto Emoji'], ['Unicode-3.0.txt', 'Unicode CLDR'], ['LICENSE-code.txt', lang === 'es' ? 'el código (dominio público)' : 'the code (public domain)']].map(([f, n], i) => html`${i ? ' · ' : ''}<a href=${`${import.meta.env.BASE_URL}licenses/${f}`} target="_blank" rel="noopener">${n}</a>`)}</p>
      <p class="credits"><a href="https://github.com/vdm285/listolista" target="_blank" rel="noopener">github.com/vdm285/listolista</a></p>`;
  },
};

function statusText(st) {
  if (st.status === 'synced') return t.synced;
  if (st.status === 'offline') return t.offline;
  if (st.status === 'trouble') return t.syncTrouble;
  if (st.status === 'clock') return t.clockOff;
  return t.syncing;
}
