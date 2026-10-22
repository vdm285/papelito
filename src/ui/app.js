// <papel-app>: the sheet of paper and everything that happens on it.
// Light DOM (one global stylesheet). State lives in the store; this component renders it and
// turns gestures into store calls. Cards (menus, share, an item) are in cards.js.

import { LitElement, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { live } from 'lit/directives/live.js';
import { store } from '../app/store.js';
import { t } from '../app/i18n.js';
import { isDone } from '../model/doc.js';
import { aisleOf, splitHint, AISLES, keyOf, fold } from '../model/aisles.js';
import { dictIndex, completions } from '../data/dict.js';
import { drawStrike, drawMarker, strikeProgress, revealWriting, touchPulse } from './ink.js';
import { icons } from './icons.js';
import { renderCard } from './cards.js';
import { sync } from '../app/sync-control.js';
import { install } from '../app/install.js';

const LINGER_MS = 1400; // a struck item stays where it was long enough to see the ink, then settles
const LONG_PRESS_MS = 520;

export class PapelApp extends LitElement {
  static properties = {
    rev: { state: true },
    card: { state: true },
    toast: { state: true },
    hint: { state: true },
    wide: { state: true },
    composerFocus: { state: true },
  };

  constructor() {
    super();
    this.rev = 0;
    this.card = null; // { kind, ...args }
    this.toast = null; // { label, undo }
    this.hint = null; // { id, pieces }
    this.composerFocus = false;
    this.draft = '';
    this.lingering = new Set();
    this.pendingAnim = new Map(); // id → 'draw' | 'remote' | 'erase'
    this.remoteAdded = new Set();
    this.remoteTouched = new Set();
    this.drawn = new WeakSet();
    this.rects = new Map();
    this.press = null;
    this.wideMq = matchMedia('(min-width: 1100px)');
    this.wide = this.wideMq.matches;
    this.typingAt = 0;
    this.announce = '';
  }

  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    this.off = store.on((kind, d) => this.onStore(kind, d));
    this.offSync = sync.on(() => this.requestUpdate());
    this.wideMq.addEventListener('change', (e) => { this.wide = e.matches; });
    this.ro = new ResizeObserver(() => this.redrawStrikes());
    addEventListener('keydown', (e) => this.onKey(e));
    addEventListener('popstate', () => { if (this.card) { sync.holdUrl(); this.card = null; this.focusBack = true; } });
    addEventListener('scroll', () => { if (!this.stuckFrame) this.stuckFrame = requestAnimationFrame(() => { this.stuckFrame = 0; this.markStuck(); }); }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.seenSoon(5000); });
    this.loadDraft();
    this.seenSoon(6000);
  }

  disconnectedCallback() { super.disconnectedCallback(); this.off(); this.offSync(); this.ro.disconnect(); }

  firstUpdated() {
    // notices go once you start writing or striking (see onStore): a timer would move every row
    // up under a finger about to tap one
    // strikes are measured on the text: measure again once the handwriting font has arrived
    document.fonts.ready.then(() => this.redrawStrikes());
    document.fonts.addEventListener('loadingdone', () => this.redrawStrikes());
    // desktop: a real keyboard is there, so the first frame is ready to write
    if (matchMedia('(pointer: fine)').matches && !this.card) this.focusComposer();
    if (install.pendingHint()) setTimeout(() => install.showHint(this), 600);
  }

  // ---------- store events ----------
  onStore(kind, d) {
    this.typingOnly = false; // anything from the store may move the sheet: measure
    if (kind === 'list') {
      this.lingering.clear(); this.pendingAnim.clear(); this.hint = null; this.loadDraft(); this.seenSoon(6000);
      this.swapSheet = true; // the next render places the new sheet on top, like a fresh page
    }
    if (kind === 'remote' && d) this.onRemote(d);
    // the first thing you do on the sheet puts away the notes about how you got here; the ones
    // about something still true stay (the link moved, nothing can be saved)
    if (kind === 'change' && store.notices.length) store.notices = store.notices.filter(lasting);
    if (kind === 'undoable') this.showToast(d.label, true);
    if (kind === 'storageFull' && !store.notices.some((n) => n.kind === 'storageFull')) { store.notices.push({ kind: 'storageFull' }); this.showToast(t.storageFull, false); }
    this.rev++;
  }

  onRemote(ch) {
    for (const id of ch.struck) { this.pendingAnim.set(id, 'remote'); this.linger(id); }
    for (const id of ch.unstruck) this.pendingAnim.set(id, 'erase');
    for (const id of ch.added) this.remoteAdded.add(id);
    for (const id of ch.edited) this.remoteTouched.add(id);
    if (ch.joined && ch.joined.length && Object.keys(store.doc.items).length) {
      this.showToast(t.joined((t.inks[store.inkOf(ch.joined[0])] || '').toLowerCase()), false);
    }
    if (ch.removed.length) {
      const it = store.doc.items[ch.removed[0]];
      const who = it ? this.whoName(it.x[1].slice(13)) : t.someone;
      // deletions arriving one record at a time (someone clearing items one by one) add up
      const before = this.toast && this.toast.removed && this.toast.who === who ? this.toast.removed : [];
      const ids = [...new Set([...before, ...ch.removed])];
      const one = ids.length === 1 && store.doc.items[ids[0]];
      const label = one ? t.removedBy(who, one.t[0]) : t.removedByN(who, ids.length);
      this.showToast(label, true, () => store.restore(ids), { removed: ids, who });
    }
    // one polite sentence for screen readers: who did what on the other phone
    if (ch.added.length || ch.struck.length || ch.unstruck.length) {
      const any = ch.added[0] || ch.struck[0] || ch.unstruck[0];
      const it = store.doc.items[any];
      const dev = ch.added.length ? it && it.by : it && (it.d[0] || it.d[1].slice(13));
      const names = (ids) => ids.map((id) => store.doc.items[id] && store.doc.items[id].t[0]).filter(Boolean);
      this.say(t.remoteSummary(this.whoName(dev || ''), names(ch.added), names(ch.struck), names(ch.unstruck)));
    }
    if (document.visibilityState === 'visible') this.seenSoon(7000);
  }

  /** Polite announcement; cleared first so the same sentence twice is read twice. */
  say(text) {
    this.announce = '';
    this.rev++;
    clearTimeout(this.sayTimer);
    this.sayTimer = setTimeout(() => { this.announce = text; this.rev++; }, 80);
  }

  whoName(device) {
    if (device === store.device) return t.you;
    const n = store.nameOf(device);
    if (n) return n;
    return `${t.someone} (${(t.inks[store.inkOf(device)] || '').toLowerCase()})`;
  }

  seenSoon(ms) {
    clearTimeout(this.seenTimer);
    this.seenTimer = setTimeout(() => { if (document.visibilityState === 'visible') store.markSeen(); }, ms);
  }

  linger(id) {
    this.lingering.add(id);
    // one timer for every strike made in a row: while you keep striking, nothing moves under your
    // finger; a moment after the last one, all the struck rows settle in one glide
    clearTimeout(this.lingerTimer);
    this.lingerTimer = setTimeout(() => { this.lingering.clear(); this.rev++; }, LINGER_MS);
  }

  // ---------- toast ----------
  showToast(label, undo, fn, extra = {}) {
    this.toast = { label, undo, fn, ...extra };
    this.toastLater(undo ? 8000 : 4500);
  }
  toastLater(ms) {
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toast = null; }, ms);
  }
  doUndo() {
    const fn = this.toast && this.toast.fn;
    this.toast = null;
    if (fn) fn(); else store.undo();
  }

  // ---------- keyboard ----------
  onKey(e) {
    if (e.key === 'Escape' && this.card) { e.preventDefault(); this.closeCard(); return; }
    // on a desk, typing anywhere writes on the paper (as in Notepad)
    if (!this.card && !isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && !(e.key === ' ' && e.target.closest && e.target.closest('.row'))) {
      const ta = this.querySelector('.composer textarea');
      if (ta) { ta.focus(); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !this.card && !isTyping(e.target)) { e.preventDefault(); if (this.toast && this.toast.undo) this.doUndo(); else store.undo(); }
  }

  // ---------- cards ----------
  openCard(kind, args = {}) {
    if (!this.card) { this.cardOpener = document.activeElement; history.pushState({ card: kind }, ''); }
    this.card = { kind, ...args };
  }
  closeCard() {
    if (!this.card) return;
    this.card = null;
    this.focusBack = true;
    if (history.state && history.state.card) { sync.holdUrl(); history.back(); }
  }

  // ---------- the writing line ----------
  loadDraft() {
    if (!store.rec) return;
    try { this.draft = localStorage.getItem(`ll.draft.${store.rec.id}`) || ''; } catch { this.draft = ''; }
  }
  saveDraft(v) {
    this.draft = v;
    try { if (v) localStorage.setItem(`ll.draft.${store.rec.id}`, v); else localStorage.removeItem(`ll.draft.${store.rec.id}`); } catch { /* ignore */ }
  }

  focusComposer() {
    const ta = this.querySelector('.composer textarea');
    if (ta) ta.focus({ preventScroll: false });
  }

  onComposerInput(e) {
    const ta = e.target;
    this.saveDraft(ta.value);
    this.autosize(ta);
    // pasted lines become items at once
    if (/\n/.test(ta.value) && e.inputType === 'insertFromPaste') { this.commit(ta); return; }
    const now = Date.now();
    if (now - this.typingAt > 350) { this.typingAt = now; sync.typing(ta.value); }
    else { clearTimeout(this.typingTimer); this.typingTimer = setTimeout(() => sync.typing(ta.value), 360); }
    this.typingOnly = true; // the suggestions follow the text; nothing on the sheet moves
    this.rev++;
  }

  onComposerKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.commit(e.target); }
    if (e.key === 'ArrowUp' && !e.target.value) { const rows = this.querySelectorAll('.pending .row'); if (rows.length) { e.preventDefault(); rows[rows.length - 1].focus(); } }
  }

  onComposerBlur(e) {
    this.composerFocus = false;
    // Notepad rule: what is written on the paper stays on the paper
    if (e.target.value.trim()) this.commit(e.target, true);
    sync.typing('');
  }

  commit(ta, blur = false) {
    const text = ta.value;
    const ids = store.add(text);
    ta.value = '';
    this.saveDraft('');
    this.autosize(ta);
    sync.typing('');
    if (ids.length === 1) {
      const pieces = dictIndex() && splitHint(store.doc.items[ids[0]].t[0], dictIndex());
      if (pieces) { this.hint = { id: ids[0], pieces }; clearTimeout(this.hintTimer); this.hintTimer = setTimeout(() => { this.hint = null; }, 12000); }
      else this.hint = null;
    } else this.hint = null;
    if (!blur) requestAnimationFrame(() => {
      // the new row (in the by-aisle view it may be anywhere), then the writing line
      const row = ids.length ? this.querySelector(`.row[data-id="${ids[ids.length - 1]}"]`) : null;
      if (row) row.scrollIntoView({ block: 'nearest' });
      this.querySelector('.writing')?.scrollIntoView({ block: 'nearest' });
    });
  }

  autosize(ta) {
    ta.style.height = 'auto';
    const line = parseFloat(getComputedStyle(ta).lineHeight) || 56;
    ta.style.height = `${Math.max(1, Math.round(ta.scrollHeight / line)) * line}px`;
  }

  addChip(text) {
    store.add(text);
    this.rev++;
  }

  // ---------- rows: tap, swipe, long press ----------
  onRowDown(e, id) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const row = e.currentTarget;
    const edge = e.clientX < 24 || e.clientX > innerWidth - 24; // Android's Back gesture lives there
    this.press = { id, row, x: e.clientX, y: e.clientY, t: performance.now(), swipe: false, long: false, edge, done: row.classList.contains('done'), pointerId: e.pointerId };
    clearTimeout(this.pressTimer);
    this.pressTimer = setTimeout(() => {
      if (!this.press || this.press.swipe) return;
      this.press.long = true;
      this.quietClick();
      if (navigator.vibrate) navigator.vibrate(12);
      this.openCard('item', { id });
    }, LONG_PRESS_MS);
  }

  onRowMove(e) {
    const p = this.press;
    if (!p || p.long) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.swipe) {
      if (Math.abs(dy) > 10) { clearTimeout(this.pressTimer); this.press = null; return; } // a scroll
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4 && !p.edge && !p.done && dx > 0) {
        p.swipe = true;
        clearTimeout(this.pressTimer);
        try { p.row.setPointerCapture(p.pointerId); } catch { /* ignore */ }
      } else return;
    }
    const w = p.row.querySelector('.txt').getBoundingClientRect().width + 24;
    p.k = Math.max(0, Math.min(1.05, dx / w));
    strikeProgress(p.row, p.k);
  }

  onRowUp(e) {
    const p = this.press;
    clearTimeout(this.pressTimer);
    this.press = null;
    if (!p || p.long) return;
    if (p.swipe) {
      this.quietClick();
      if (p.k > 0.55) { this.pendingAnim.set(p.id, 'finish'); this.toggle(p.id); }
      else strikeProgress(p.row, 0);
    }
    // a plain tap strikes through the click that follows (also what a screen reader sends)
  }

  /** The click after a swipe or a long press is not a tap. */
  quietClick() {
    this.noClick = true;
    clearTimeout(this.noClickTimer);
    this.noClickTimer = setTimeout(() => { this.noClick = false; }, 450);
  }

  onRowClick(e, id) {
    if (this.noClick) { this.noClick = false; return; }
    this.toggle(id);
  }

  onRowCancel() {
    const p = this.press;
    clearTimeout(this.pressTimer);
    this.press = null;
    if (p && p.swipe) strikeProgress(p.row, 0);
  }

  onRowKey(e, id) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.toggle(id); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); store.remove(id); }
    else if (e.key === 'F2' || e.key === 'ContextMenu') { e.preventDefault(); this.openCard('item', { id }); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const rows = [...this.querySelectorAll('.row[data-id]')];
      const i = rows.indexOf(e.currentTarget);
      const next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) next.focus(); else if (e.key === 'ArrowDown') this.focusComposer();
    }
  }

  toggle(id) {
    const it = store.doc.items[id];
    if (!it) return;
    const willBeDone = !isDone(it);
    if (!this.pendingAnim.has(id)) this.pendingAnim.set(id, willBeDone ? 'draw' : 'erase');
    if (willBeDone) { this.linger(id); if (navigator.vibrate) navigator.vibrate(8); }
    store.toggle(id);
  }

  // ---------- after each render: ink and motion ----------
  willUpdate() {
    const sh = this.querySelector('.sheet');
    this.sheetX = sh ? sh.getBoundingClientRect().left : null;
    const a = document.activeElement;
    const row = a && a.closest ? a.closest('.row[data-id]') : null;
    this.focusRow = row ? { id: row.dataset.id, index: [...this.querySelectorAll('.row[data-id]')].indexOf(row) } : null;
    this.rects.clear();
    // a render caused only by typing moves nothing: skip measuring every row (a layout per key)
    if (this.typingOnly) return;
    for (const el of this.querySelectorAll('.body [data-id], .body [data-flip]')) this.rects.set(flipKey(el), el.getBoundingClientRect().top);
  }

  updated(changed) {
    this.keepFocus(changed);
    if (this.typingOnly) { this.typingOnly = false; return; }
    this.welcome();
    this.markStuck();
    if (changed.has('card') && !!changed.get('card') !== !!this.card) this.slideSheet();
    if (this.swapSheet) {
      this.swapSheet = false;
      const sheet = this.querySelector('.sheet');
      const reduce = !store.prefs.motion || matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (sheet && !reduce) {
        const base = getComputedStyle(sheet).transform;
        const tilt = base && base !== 'none' ? base : '';
        sheet.animate([{ opacity: 0, transform: `translateY(18px) ${tilt}` }, { opacity: 1, transform: tilt || 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    const sheet = this.querySelector('.sheet');
    if (sheet && this.observed !== sheet) { this.observed = sheet; this.ro.disconnect(); this.ro.observe(sheet); }
    const reduce = !store.prefs.motion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const row of this.querySelectorAll('.row[data-id]')) {
      const id = row.dataset.id;
      const mode = this.pendingAnim.get(id);
      const done = row.classList.contains('done');
      if (mode) {
        this.pendingAnim.delete(id);
        if (mode === 'finish') drawStrike(row, 'still');
        else drawStrike(row, mode, { reduce });
        this.drawn.add(row);
      } else if (done && !this.drawn.has(row)) { drawStrike(row, 'still'); this.drawn.add(row); }
      else if (!done && this.drawn.has(row)) { drawStrike(row, 'none'); this.drawn.delete(row); }
      if (row.classList.contains('new') && row.dataset.marked !== row.querySelector('.txt').textContent) { drawMarker(row); row.dataset.marked = row.querySelector('.txt').textContent; }
      if (this.remoteAdded.has(id)) { this.remoteAdded.delete(id); revealWriting(row, reduce); }
      if (this.remoteTouched.has(id)) { this.remoteTouched.delete(id); touchPulse(row, reduce); }
    }
    // everything in the sheet's flow glides to its new place together (rows, the writing line,
    // suggestions, the fold, aisle headings), so nothing overlaps while rows settle
    if (!reduce) {
      for (const el of this.querySelectorAll('.body [data-id], .body [data-flip]')) {
        const before = this.rects.get(flipKey(el));
        if (before === undefined) continue;
        const dy = before - el.getBoundingClientRect().top;
        if (Math.abs(dy) > 2) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
  }

  /** On a desk without room beside the paper, the paper moves aside for a card: glide, not jump. */
  slideSheet() {
    const sheet = this.querySelector('.sheet');
    if (!sheet || this.sheetX === null) return;
    const dx = this.sheetX - sheet.getBoundingClientRect().left;
    if (Math.abs(dx) < 2 || !store.prefs.motion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tilt = getComputedStyle(sheet).transform;
    const base = tilt && tilt !== 'none' ? tilt : '';
    sheet.animate([{ transform: `translateX(${dx}px) ${base}` }, { transform: base || 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  keepFocus(changed) {
    const lost = !document.activeElement || document.activeElement === document.body;
    const fine = matchMedia('(pointer: fine)').matches;
    if (changed.has('card') && this.card && (!changed.get('card') || changed.get('card').kind !== this.card.kind)) {
      // a card opened: focus the dialog itself (a text field would pop the phone's keyboard)
      this.querySelector('.card')?.focus({ preventScroll: true });
      return;
    }
    if (this.focusBack && !this.card) {
      this.focusBack = false;
      const o = this.cardOpener;
      this.cardOpener = null;
      if (o && o.isConnected && o !== document.body) { o.focus({ preventScroll: true }); return; }
      if (fine) this.focusComposer();
      return;
    }
    if (this.focusRow && lost && !this.card) {
      const rows = [...this.querySelectorAll('.row[data-id]')];
      const el = rows.find((r) => r.dataset.id === this.focusRow.id) || rows[Math.min(this.focusRow.index, rows.length - 1)];
      if (el) el.focus({ preventScroll: true }); else if (fine) this.focusComposer();
    }
  }

  /** The writing line is stuck to the bottom when its natural place is below the screen: only then do rows fade under it. */
  markStuck() {
    const w = this.querySelector('.writing.sticky');
    if (!w) return;
    const kb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kb')) || 0;
    const mark = w.nextElementSibling;
    w.toggleAttribute('data-stuck', !!mark && mark.getBoundingClientRect().top > innerHeight - kb + 1);
  }

  /** The very first visit: the pencil note writes itself, once. */
  welcome() {
    const note = this.querySelector('.empty-note');
    if (!note || this.welcomed) return;
    this.welcomed = true;
    let first = false;
    try { first = !localStorage.getItem('ll.welcomed'); localStorage.setItem('ll.welcomed', '1'); } catch { /* ignore */ }
    if (!first || !store.prefs.motion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    note.classList.add('writing'); // CSS staggers the words (lit does not bind this class)
  }

  redrawStrikes() {
    for (const row of this.querySelectorAll('.row.done[data-id]')) drawStrike(row, 'still');
    for (const row of this.querySelectorAll('.row.new[data-id]')) drawMarker(row);
  }

  // ---------- render ----------
  render() {
    const rec = store.rec;
    if (!rec) return nothing;
    const items = store.items();
    const pending = items.filter((i) => !isDone(i) || this.lingering.has(i.id));
    const struck = items.filter((i) => isDone(i) && !this.lingering.has(i.id)).sort((a, b) => (a.d[1] < b.d[1] ? 1 : -1));
    const myInk = store.inkOf(store.device);
    const idx = dictIndex();
    const fixes = store.fixes();
    const byAisle = rec.aisles && idx;
    const showStruck = store.prefs.showStruck !== false;
    const others = sync.others();
    return html`
      <div class="desk ${store.prefs.hand === 'molde' ? 'hand-molde' : ''} ${this.card ? 'card-open' : ''}" ?inert=${!!this.card}>
        ${this.wide ? this.renderStack() : nothing}
        <main class="sheet" style="--my-ink: var(--ink-${myInk})" aria-label=${store.title() || t.untitled}>
          ${this.renderHead(rec, others)}
          <section class="body">
            ${this.renderStatus(rec)}
            ${byAisle ? this.renderByAisle(pending, idx, fixes) : html`<ol class="rows pending" role="list">${repeat(pending, (i) => i.id, (i) => this.renderRow(i, idx, fixes, false))}</ol>`}
            ${others.filter((o) => o.typing).map((o) => this.renderGhost(o))}
            <div class="writing ${this.isLong ? 'sticky' : ''}" data-flip="writing">
              ${this.renderComposer(myInk, items.length)}
              ${this.renderHint()}
              ${this.renderSuggestions(pending.length)}
            </div>
            <div class="stick-mark" aria-hidden="true"></div>
            ${struck.length ? html`
              <div class="fold" data-flip="fold" aria-expanded=${showStruck}>
                <button @click=${() => store.savePrefs({ showStruck: !showStruck })}>${icons.chevron} ${t.struck(struck.length)}</button>
                <button class="link" @click=${() => store.clearStruck()}>${t.clearStruck}</button>
              </div>
              ${showStruck ? html`<ol class="rows struck" role="list">${repeat(struck, (i) => i.id, (i) => this.renderRow(i, idx, fixes, true))}</ol>` : nothing}` : nothing}
            ${!items.length ? html`<p class="empty-note">${(rec.secret ? t.emptyNoteShared : this.wide ? t.emptyNoteDesk : t.emptyNote).split(' ').map((w, i) => html`<span class="w" style="--i:${i}">${w} </span>`)}</p>` : nothing}
            <div class="write-zone" @click=${() => this.focusComposer()} aria-hidden="true"></div>
          </section>
        </main>
        ${this.wide ? this.renderNote(rec) : nothing}
      </div>
      ${this.card ? renderCard(this, this.card) : nothing}
      ${this.toast ? html`<div class="toast" role="status" aria-live="polite"
        @pointerenter=${() => clearTimeout(this.toastTimer)} @pointerleave=${() => this.toastLater(4000)}
        @focusin=${() => clearTimeout(this.toastTimer)} @focusout=${() => this.toastLater(4000)}><span>${this.toast.label}</span>${this.toast.undo ? html`<button @click=${() => this.doUndo()}>${t.undo}</button>` : nothing}</div>` : nothing}
      <div class="sr" aria-live="polite">${this.announce}</div>
    `;
  }

  renderHead(rec, others) {
    const shared = !!rec.secret;
    const st = sync.state.status;
    return html`
      <header class="head">
        <input class="title" style="--ink: var(--ink-${store.titleInk()})" aria-label=${t.titleAria} placeholder=${t.untitled} maxlength="60" enterkeyhint="next"
          .value=${this.titleEditing ? this.titleDraft : live(store.title())}
          @focus=${(e) => { this.titleEditing = true; this.titleDraft = e.target.value; }}
          @input=${(e) => { this.titleDraft = e.target.value; clearTimeout(this.titleTimer); const v = e.target.value; this.titleTimer = setTimeout(() => store.setTitle(v), 500); }}
          @blur=${(e) => { this.titleEditing = false; clearTimeout(this.titleTimer); store.setTitle(e.target.value); }}
          @keydown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); this.focusComposer(); } }} />
        <div class="head-tools">
          ${shared ? html`
            <button class="pill sync-${st}" @click=${() => this.openCard('share')} aria-label=${`${t.shared}: ${statusWord(st)}. ${others.length ? t.othersHere(others.length) : ''}`} title=${statusWord(st)}>
              <span class="sync-icon">${OFF.has(st) ? icons.linkOff : icons.link}</span>
              ${st === 'moved' ? t.movedShort : others.length ? html`<span class="presence">${others.slice(0, 4).map((o) => html`<span class="dot here" style="--c: var(--ink-${o.ink || 'azul'})"></span>`)}</span>` : t.shared}
            </button>` : this.wide ? nothing : html`
            <button class="pill" @click=${() => sync.share(this)}>${icons.share} ${t.share}</button>`}
          <button class="icon-btn" aria-label=${t.menu} @click=${() => this.openCard('menu')}>${icons.dots}</button>
        </div>
      </header>`;
  }

  renderStatus(rec) {
    const notes = [];
    if (rec.wasShared) notes.push(t.legacyShared);
    const st = sync.state.status;
    if (rec.secret && st === 'offline') notes.push(t.offline);
    else if (rec.secret && st === 'trouble') notes.push(t.syncTrouble);
    else if (rec.secret && st === 'clock') notes.push(t.clockOff);
    for (const n of store.notices) {
      if (n.kind === 'firstShared' && st !== 'moved') notes.push(t.firstShared);
      if (n.kind === 'legacy') notes.push(t.legacyImported(n.n));
      if (n.kind === 'legacyMissing') notes.push(t.legacyLinkMissing);
      if (n.kind === 'badLink') notes.push(t.badLink);
      if (n.kind === 'noStorage') notes.push(t.noStorage);
      if (n.kind === 'storageFull') notes.push(t.storageFull);
      if (n.kind === 'moved') notes.push(`${t.linkMoved} ${t.movedHow}`);
    }
    return notes.length ? html`<p class="status-line" data-flip="status"><span class="margin" aria-hidden="true">${icons.pen}</span><span class="words">${notes.join(' ')}</span></p>` : nothing;
  }

  renderByAisle(pending, idx, fixes) {
    const order = (store.doc.order[0] && store.doc.order[0].length ? store.doc.order[0] : AISLES).filter((a) => AISLES.includes(a));
    for (const a of AISLES) if (!order.includes(a)) order.push(a);
    const groups = new Map(order.map((a) => [a, []]));
    // an aisle id this version does not know (a newer phone's fix) files under Otros, never nowhere
    for (const it of pending) (groups.get(aisleOf(it.t[0], idx, fixes).aisle) || groups.get('otr')).push(it);
    return html`${order.filter((a) => groups.get(a).length).map((a) => html`
      <div class="aisle-head" data-flip=${`aisle-${a}`} aria-hidden="true"><span class="margin">${store.prefs.doodles && idx.aisleEmoji && idx.aisleEmoji[a] ? html`<span class="doodle-glyph">${idx.aisleEmoji[a].replace(/\uFE0F/g, '')}\uFE0E</span>` : nothing}</span>${t.aisles[a]}<span class="n">${groups.get(a).length}</span></div>
      <ol class="rows pending" role="list" aria-label=${t.aisles[a]}>${repeat(groups.get(a), (i) => i.id, (i) => this.renderRow(i, idx, fixes, false))}</ol>`)}`;
  }

  renderRow(item, idx, fixes, inStruck) {
    const done = isDone(item);
    const ink = store.inkOf(item.by);
    const strikeInk = done ? store.inkOf(item.d[0]) : ink;
    const text = item.t[0];
    const a = idx ? aisleOf(text, idx, fixes) : null;
    // a pencil doodle: the emoji in text presentation, drawn by the monochrome doodle font
    const doodle = store.prefs.doodles && a && a.emoji ? `${a.emoji.replace(/\uFE0F/g, '')}\uFE0E` : '';
    const fresh = store.isNew(item);
    return html`
      <li class="row ${done ? 'done' : ''} ${fresh ? 'new' : ''}" data-id=${item.id} role="checkbox" aria-checked=${done ? 'true' : 'false'} tabindex="0"
        style="--ink: var(--ink-${ink}); --strike-ink: var(--ink-${strikeInk})"
        @pointerdown=${(e) => this.onRowDown(e, item.id)} @pointermove=${(e) => this.onRowMove(e)} @pointerup=${(e) => this.onRowUp(e)} @pointercancel=${() => this.onRowCancel()}
        @click=${(e) => this.onRowClick(e, item.id)}
        @contextmenu=${(e) => { e.preventDefault(); this.onRowCancel(); this.quietClick(); this.openCard('item', { id: item.id }); }}
        @keydown=${(e) => this.onRowKey(e, item.id)}>
        <svg class="marker" aria-hidden="true"><path></path></svg>
        <span class="margin" aria-hidden="true">${doodle ? html`<span class="doodle-glyph">${doodle}</span>` : nothing}</span>
        <span class="words"><span class="txt">${text}</span>${this.rowDetails(item, done, fresh)}</span>
        ${store.rec.aisles && a && a.guess && !inStruck ? html`<span class="aisle-tag" title=${t.aisleGuess}>?</span>` : nothing}
        <svg class="strike" aria-hidden="true"><path></path></svg>
      </li>`;
  }

  /** What the ink colour tells a sighted person, in words for a screen reader. */
  rowDetails(item, done, fresh) {
    const bits = [];
    if (item.by !== store.device) bits.push(t.byWho(this.whoName(item.by)));
    if (fresh) bits.push(t.isNew);
    if (done && item.d[0] && item.d[0] !== store.device) bits.push(t.struckByWho(this.whoName(item.d[0])));
    return bits.length ? html`<span class="sr">, ${bits.join(', ')}</span>` : nothing;
  }

  renderGhost(o) {
    return html`<div class="row ghost" data-flip=${`ghost-${o.dev}`} style="--ink: var(--ink-${o.ink || 'azul'})" aria-hidden="true">
      <span class="margin" aria-hidden="true">${icons.pen}</span>
      <span class="words"><span class="txt">${o.typing}</span><span class="ghost-nib"></span></span>
    </div>`;
  }

  renderComposer(myInk, n) {
    return html`
      <div class="composer">
        <span class="margin" aria-hidden="true"></span>
        <textarea rows="1" aria-label=${t.writeAria} placeholder=${n ? t.writeMore : t.write} enterkeyhint="enter" autocomplete="off" autocapitalize="sentences" spellcheck="false"
          .value=${live(this.draft)}
          @input=${(e) => this.onComposerInput(e)} @keydown=${(e) => this.onComposerKey(e)}
          @focus=${() => { this.composerFocus = true; }} @blur=${(e) => this.onComposerBlur(e)}></textarea>
      </div>`;
  }

  renderHint() {
    const h = this.hint;
    if (!h || !store.doc.items[h.id]) return nothing;
    return html`<div class="hint-chip">
      <span class="margin" aria-hidden="true"></span>
      <button class="chip" @click=${() => { store.split(h.id, h.pieces); this.hint = null; }}>${t.splitAsk(h.pieces.length)}</button>
      <span class="pieces">${h.pieces.join(' · ')}</span>
      <button class="icon-btn" aria-label=${t.close} @click=${() => { this.hint = null; }}>${icons.close}</button>
    </div>`;
  }

  renderSuggestions(pendingCount) {
    const typed = this.draft.trim();
    if (typed.length >= 2) {
      const f = fold(typed);
      const seen = new Set();
      const fromHistory = Object.values(store.history).filter((h) => fold(h.text).startsWith(f)).sort((a, b) => b.n - a.n).map((h) => h.text);
      const list = [...fromHistory, ...completions(typed, 4)].filter((x) => { const k = keyOf(x); if (seen.has(k) || fold(x) === f) return false; seen.add(k); return true; }).slice(0, 3);
      if (!list.length) return nothing;
      return html`<div class="usual" role="group" aria-label=${t.usual}><span class="margin" aria-hidden="true">+</span><span class="usual-words">${list.map((s, i) => html`${i ? html`<span class="sep" aria-hidden="true">·</span>` : nothing}<button class="pencil" @pointerdown=${(e) => e.preventDefault()} @click=${() => { const ta = this.querySelector('.composer textarea'); ta.value = s; this.commit(ta); }}>${s}</button>`)}</span></div>`;
    }
    if (!(this.composerFocus || pendingCount === 0)) return nothing;
    const usual = store.usual(8);
    if (!usual.length) return nothing;
    return html`<div class="usual" role="group" aria-label=${t.usual}><span class="margin" aria-hidden="true">+</span><span class="usual-words"><span class="usual-label">${t.usual}:</span>${usual.map((u, i) => html`${i ? html`<span class="sep" aria-hidden="true">·</span>` : nothing}<button class="pencil" @pointerdown=${(e) => e.preventDefault()} @click=${() => this.addChip(u.text)}>${u.text}</button>`)}</span></div>`;
  }

  renderStack() {
    const lists = [...store.index].sort((a, b) => b.updated - a.updated).slice(0, 8);
    return html`<aside class="side-left stack" aria-label=${t.lists}>
      <p class="label">${t.lists}</p>
      ${lists.map((l) => html`<button class=${l.id === store.rec.id ? 'on' : ''} @click=${() => sync.openList(l.id)}>${l.title || t.untitled}<span class="meta">${l.shared ? t.shared : ''}${l.shared ? ' · ' : ''}${t.ago(Date.now() - l.updated)}</span></button>`)}
      <button @click=${() => sync.newList()} style="font-family: var(--font-ui); font-size: 15px; font-weight: 650">${t.newList}</button>
    </aside>`;
  }

  renderNote(rec) {
    return html`<aside class="side">${rec.secret && sync.state.status === 'moved' ? html`
      <div class="note">
        <h4>${t.movedShort}</h4>
        <p>${t.linkMoved}</p>
        <p style="margin-top:8px">${t.movedHow}</p>
      </div>` : rec.secret ? html`
      <div class="note">
        <h4>${t.noteTitle}</h4>
        <div class="qr">${sync.qr(rec)}</div>
        <p>${t.noteShared}</p>
      </div>` : html`
      <div class="note">
        <h4>${t.noteTitle}</h4>
        <p>${t.noteLocal}</p>
        <p style="margin-top:12px"><button class="btn" @click=${() => sync.share(this)}>${icons.share} ${t.share}</button></p>
      </div>`}
    </aside>`;
  }

  get isLong() { return store.items().length > 9; }
}

const lasting = (n) => n.kind === 'moved' || n.kind === 'noStorage' || n.kind === 'storageFull';

const flipKey = (el) => (el.dataset.id ? `row-${el.dataset.id}` : el.dataset.flip);

const statusWord = (st) => (st === 'synced' ? t.synced : st === 'offline' ? t.offline : st === 'trouble' ? t.syncTrouble : st === 'clock' ? t.clockOff : st === 'moved' ? t.movedShort : t.syncing);
const OFF = new Set(['offline', 'trouble', 'clock', 'moved']);

const isTyping = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable);

customElements.define('papel-app', PapelApp);
