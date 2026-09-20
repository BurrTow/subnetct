import './style.css';
import { animate, stagger, utils } from 'animejs';
import { calculateSubnet } from './subnet.js';

/* Defaults live here now — index.html uses placeholders only, so the first
   update() still has something real to calculate. */
const DEFAULTS = { ip: '192.168.1.10', cidr: '24' };
const STORAGE_KEY = 'subnetctl:last-query';

const ipInput = document.querySelector('#ip');
const cidrInput = document.querySelector('#cidr');
const errorEl = document.querySelector('#error');
const resultsEl = document.querySelector('#results');
const resultsCard = document.querySelector('#results-card');
const flashEl = resultsCard.querySelector('.card__flash');
const staleTag = document.querySelector('#stale-tag');
const summaryEl = document.querySelector('#summary');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Static markup only — never interpolated with user input. */
const ICON_COPY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICON_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m20 6-11 11-5-5"/></svg>';

/* Field definitions: `tier` drives visual emphasis, `numeric` opts a value
   into the count-up animation. */
const FIELDS = [
  {
    id: 'network',
    label: 'Network address',
    tier: 'primary',
    accent: 'cyan',
    value: (r) => r.network,
  },
  {
    id: 'broadcast',
    label: 'Broadcast address',
    tier: 'primary',
    accent: 'blue',
    value: (r) => r.broadcast,
  },
  {
    id: 'range',
    label: 'Usable host range',
    tier: 'primary',
    accent: 'green',
    wide: true,
    value: (r) => (r.usableHosts === 0 ? 'none' : `${r.firstHost} – ${r.lastHost}`),
  },
  { id: 'subnetMask', label: 'Subnet mask', value: (r) => r.subnetMask },
  { id: 'wildcardMask', label: 'Wildcard mask', value: (r) => r.wildcardMask },
  { id: 'usableHosts', label: 'Usable hosts', numeric: true, value: (r) => r.usableHosts },
  { id: 'totalHosts', label: 'Total addresses', numeric: true, value: (r) => r.totalHosts },
];

/** Last successfully calculated result — kept so invalid keystrokes can leave
    the rendered breakdown on screen instead of wiping it. */
let lastValid = null;
const copyTimers = new WeakMap();

/* ── Persistence ────────────────────────────────────────────────────────── */

function loadQuery() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.ip === 'string' && typeof parsed?.cidr === 'string') return parsed;
  } catch {
    /* private mode, blocked storage or corrupt JSON — fall back to defaults */
  }
  return null;
}

function saveQuery(ip, cidr) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ip, cidr }));
  } catch {
    /* storage unavailable — persistence is a nicety, not a requirement */
  }
}

/* ── Rendering ──────────────────────────────────────────────────────────── */

function buildCell(field, result) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  if (field.tier === 'primary') cell.classList.add('cell--primary');
  if (field.wide) cell.classList.add('cell--wide');
  if (field.accent) cell.dataset.accent = field.accent;

  const label = document.createElement('div');
  label.className = 'cell__label';
  label.textContent = field.label;

  const value = document.createElement('div');
  value.className = 'cell__value mono';
  value.dataset.cell = field.id;

  const raw = field.value(result);
  if (field.numeric) {
    value.dataset.numeric = String(raw);
    value.textContent = raw.toLocaleString();
  } else {
    // textContent, never innerHTML — these are the strings echoed back to the user
    value.textContent = raw;
  }

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'copy';
  copy.dataset.copy = field.numeric ? String(raw) : raw;
  copy.setAttribute('aria-label', `Copy ${field.label.toLowerCase()}`);
  copy.innerHTML = ICON_COPY;

  cell.append(label, value, copy);
  return cell;
}

function countUp(el, from, to) {
  if (reduceMotion || from === to) {
    el.textContent = to.toLocaleString();
    return;
  }
  const proxy = { n: from };
  animate(proxy, {
    n: to,
    duration: 420,
    ease: 'outExpo',
    onUpdate: () => {
      el.textContent = utils.round(proxy.n, 0).toLocaleString();
    },
    onComplete: () => {
      el.textContent = to.toLocaleString();
    },
  });
}

function renderResults(result, previous) {
  const fragment = document.createDocumentFragment();
  for (const field of FIELDS) fragment.append(buildCell(field, result));

  // Container and template are a matched pair: plain divs in a div grid.
  resultsEl.replaceChildren(fragment);

  // Header echoes raw-ish input back — textContent keeps it inert.
  summaryEl.textContent = `${result.ip}/${result.cidr}`;

  if (reduceMotion) return;

  animate(resultsEl.querySelectorAll('.cell'), {
    opacity: [0, 1],
    translateY: [12, 0],
    duration: 320,
    delay: stagger(26),
    ease: 'outQuad',
  });

  for (const field of FIELDS) {
    if (!field.numeric) continue;
    const el = resultsEl.querySelector(`[data-cell="${field.id}"]`);
    countUp(el, previous ? field.value(previous) : 0, field.value(result));
  }

  animate(flashEl, {
    opacity: [0, 0.55, 0],
    duration: 420,
    ease: 'outQuad',
  });
}

/* ── Error state ────────────────────────────────────────────────────────── */

function showError(message) {
  const wasHidden = errorEl.hidden;
  errorEl.textContent = message;
  errorEl.hidden = false;
  // Only dim the stale results if there's something rendered to dim.
  if (lastValid) {
    resultsCard.classList.add('is-stale');
    staleTag.hidden = false;
  }
  if (wasHidden && !reduceMotion) {
    animate(errorEl, {
      opacity: [0, 1],
      translateY: [-6, 0],
      duration: 200,
      ease: 'outQuad',
    });
  }
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = '';
  resultsCard.classList.remove('is-stale');
  staleTag.hidden = true;
}

/* ── Update cycle ───────────────────────────────────────────────────────── */

function update() {
  const ip = ipInput.value.trim();
  const cidr = cidrInput.value.trim();

  // Guard the blank case explicitly: Number('') is 0, so an empty prefix would
  // otherwise calculate a silent /0 instead of reporting a problem.
  if (!ip || !cidr) {
    showError('Enter both an IPv4 address and a prefix length.');
    return;
  }

  let result;
  try {
    result = calculateSubnet(ip, cidr);
  } catch (err) {
    // Leave the previous breakdown on screen; only flag the problem.
    showError(err.message);
    return;
  }

  clearError();
  renderResults(result, lastValid);
  lastValid = result;
  saveQuery(ip, cidr);
}

/* ── Events ─────────────────────────────────────────────────────────────── */

ipInput.addEventListener('input', update);
cidrInput.addEventListener('input', update);

// Focus glow, driven through the dedicated overlay layer in each control.
for (const input of [ipInput, cidrInput]) {
  const glow = input.closest('.field__control').querySelector('.field__glow');
  input.addEventListener('focus', () => {
    if (reduceMotion) return;
    animate(glow, { opacity: [0, 1], duration: 180, ease: 'outQuad' });
  });
  input.addEventListener('blur', () => {
    if (reduceMotion) {
      glow.style.opacity = '0';
      return;
    }
    animate(glow, { opacity: 0, duration: 220, ease: 'outQuad' });
  });
}

/* Delegated on the stable #results container: cells are replaced on every
   valid calculation, so per-row listeners would be lost. */
resultsEl.addEventListener('click', async (event) => {
  const button = event.target.closest('.copy');
  if (!button || !resultsEl.contains(button)) return;

  try {
    await navigator.clipboard.writeText(button.dataset.copy);
  } catch {
    return; // clipboard blocked or unavailable (insecure context, denied permission)
  }

  button.innerHTML = ICON_CHECK;
  button.classList.add('is-copied');
  if (!reduceMotion) {
    animate(button, { scale: [0.8, 1], duration: 260, ease: 'outBack' });
  }

  clearTimeout(copyTimers.get(button));
  copyTimers.set(
    button,
    setTimeout(() => {
      button.innerHTML = ICON_COPY;
      button.classList.remove('is-copied');
    }, 1200)
  );
});

/* ── Init ───────────────────────────────────────────────────────────────── */

const saved = loadQuery();
ipInput.value = saved?.ip ?? DEFAULTS.ip;
cidrInput.value = saved?.cidr ?? DEFAULTS.cidr;

update();

if (!reduceMotion) {
  animate('.masthead, .card--query', {
    opacity: [0, 1],
    translateY: [10, 0],
    duration: 380,
    delay: stagger(60),
    ease: 'outQuad',
  });
}
