import './style.css';
import { animate, stagger, utils } from 'animejs';
import { calculateSubnet } from './subnet.js';
import { calculateSubnet6, splitCidr6 } from './subnet6.js';

/* Defaults live here — index.html uses placeholders only, so the first
   update() still has something real to calculate. */
const DEFAULTS = { ip: '192.168.1.10', cidr: '24', ip6: '2001:db8::/32' };
const STORAGE_KEY = 'subnetctl:last-query';

const ipInput = document.querySelector('#ip');
const cidrInput = document.querySelector('#cidr');
const ip6Input = document.querySelector('#ip6');
const errorEl = document.querySelector('#error');
const resultsEl = document.querySelector('#results');
const resultsCard = document.querySelector('#results-card');
const flashEl = resultsCard.querySelector('.card__flash');
const staleTag = document.querySelector('#stale-tag');
const summaryEl = document.querySelector('#summary');
const segEl = document.querySelector('.seg');
const segButtons = document.querySelectorAll('.seg__btn');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Static markup only — never interpolated with user input. */
const ICON_COPY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICON_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m20 6-11 11-5-5"/></svg>';

/*
 * Field definitions drive the shared renderer:
 *   value  — what to display (a number is formatted with toLocaleString)
 *   tier   — 'primary' gets the larger, accented treatment
 *   count  — opt into the count-up animation (safe integers only)
 *   copy   — override what the copy button puts on the clipboard
 *   when   — render this cell only when the predicate passes
 */
const FIELDS_V4 = [
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
  {
    id: 'usableHosts',
    label: 'Usable hosts',
    value: (r) => r.usableHosts,
    count: (r) => r.usableHosts,
  },
  {
    id: 'totalHosts',
    label: 'Total addresses',
    value: (r) => r.totalHosts,
    count: (r) => r.totalHosts,
  },
];

/* IPv6 has no broadcast address and no usable-host convention, so those
   cells are simply absent rather than faked. */
const FIELDS_V6 = [
  {
    id: 'network',
    label: 'Network (prefix) address',
    tier: 'primary',
    accent: 'cyan',
    value: (r) => r.network,
  },
  {
    id: 'type',
    label: 'Address type',
    tier: 'primary',
    accent: 'blue',
    value: (r) => r.addressType,
  },
  {
    id: 'expanded',
    label: 'Full expanded form',
    tier: 'primary',
    accent: 'green',
    wide: true,
    value: (r) => r.expanded,
  },
  { id: 'compressed', label: 'Compressed form', value: (r) => r.address },
  { id: 'lastAddress', label: 'Last address in block', value: (r) => r.lastAddress },
  { id: 'hostBits', label: 'Host bits', value: (r) => r.hostBits, count: (r) => r.hostBits },
  {
    id: 'totalAddresses',
    label: 'Total addresses',
    wide: true,
    // BigInt — far past Number.MAX_SAFE_INTEGER, so no count-up here.
    value: (r) => (r.hostBits === 0 ? '1' : `2^${r.hostBits} (${r.totalAddresses.toLocaleString()})`),
    copy: (r) => r.totalAddresses.toString(),
  },
  {
    id: 'interfaceId',
    label: 'Interface ID',
    when: (r) => r.interfaceId !== null,
    value: (r) => r.interfaceId,
  },
  {
    id: 'embeddedIpv4',
    label: 'Embedded IPv4',
    when: (r) => r.embeddedIpv4 !== null,
    value: (r) => r.embeddedIpv4,
  },
];

const MODES = {
  v4: {
    fields: FIELDS_V4,
    fieldsEl: document.querySelector('[data-fields="v4"]'),
    firstInput: ipInput,
    summary: (r) => `${r.ip}/${r.cidr}`,
    calculate() {
      const ip = ipInput.value.trim();
      const cidr = cidrInput.value.trim();
      // Number('') is 0, so an empty prefix would otherwise become a silent /0.
      if (!ip || !cidr) throw new Error('Enter both an IPv4 address and a prefix length.');
      return calculateSubnet(ip, cidr);
    },
  },
  v6: {
    fields: FIELDS_V6,
    fieldsEl: document.querySelector('[data-fields="v6"]'),
    firstInput: ip6Input,
    summary: (r) => `${r.address}/${r.prefix}`,
    calculate() {
      const raw = ip6Input.value.trim();
      if (!raw) throw new Error('Enter an IPv6 address and prefix, e.g. 2001:db8::/32');
      const { address, prefix } = splitCidr6(raw);
      if (!address) throw new Error('Enter an IPv6 address before the "/"');
      // A bare address with no "/" is a single host.
      return calculateSubnet6(address, prefix ?? '128');
    },
  },
};

let mode = 'v4';
/** Last successful result per mode, so invalid keystrokes can leave the
    rendered breakdown on screen instead of wiping it. */
const lastValid = { v4: null, v6: null };
const copyTimers = new WeakMap();

/* ── Persistence ────────────────────────────────────────────────────────── */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    /* private mode, blocked storage or corrupt JSON — fall back to defaults */
    return {};
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode, ip: ipInput.value, cidr: cidrInput.value, ip6: ip6Input.value })
    );
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

  const raw = field.value(result);
  const display = typeof raw === 'number' ? raw.toLocaleString() : String(raw);

  const value = document.createElement('div');
  value.className = 'cell__value mono';
  value.dataset.cell = field.id;
  // textContent, never innerHTML — these are the strings echoed back to the user
  value.textContent = display;

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'copy';
  copy.dataset.copy = field.copy ? field.copy(result) : display;
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

function renderResults(config, result, previous) {
  const visible = config.fields.filter((field) => !field.when || field.when(result));

  const fragment = document.createDocumentFragment();
  for (const field of visible) fragment.append(buildCell(field, result));

  // Container and template are a matched pair: plain divs in a div grid.
  resultsEl.replaceChildren(fragment);

  // Header echoes raw-ish input back — textContent keeps it inert.
  summaryEl.textContent = config.summary(result);

  if (reduceMotion) return;

  animate(resultsEl.querySelectorAll('.cell'), {
    opacity: [0, 1],
    translateY: [12, 0],
    duration: 320,
    delay: stagger(26),
    ease: 'outQuad',
  });

  for (const field of visible) {
    if (!field.count) continue;
    const to = field.count(result);
    const from = previous ? field.count(previous) : 0;
    // Guards the IPv6 case, where block sizes run past Number.MAX_SAFE_INTEGER.
    if (!Number.isSafeInteger(to) || !Number.isSafeInteger(from)) continue;
    countUp(resultsEl.querySelector(`[data-cell="${field.id}"]`), from, to);
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
  if (lastValid[mode]) {
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
  const config = MODES[mode];

  let result;
  try {
    result = config.calculate();
  } catch (err) {
    // Leave the previous breakdown on screen; only flag the problem.
    showError(err.message);
    return false;
  }

  clearError();
  renderResults(config, result, lastValid[mode]);
  lastValid[mode] = result;
  saveState();
  return true;
}

/* ── Mode switching ─────────────────────────────────────────────────────── */

function setMode(next, { animateSwap = true } = {}) {
  if (!MODES[next]) return;
  const changed = next !== mode;
  mode = next;

  for (const button of segButtons) {
    const active = button.dataset.mode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  for (const [key, config] of Object.entries(MODES)) {
    config.fieldsEl.hidden = key !== mode;
  }

  // The results panel is shared, so re-render it from the newly active mode.
  // If that mode has nothing valid to show, clear it rather than leaving the
  // other family's results sitting there under an error banner.
  if (!update() && !lastValid[mode]) {
    resultsEl.replaceChildren();
    summaryEl.textContent = '';
  }

  if (changed && animateSwap && !reduceMotion) {
    animate(MODES[mode].fieldsEl, {
      opacity: [0, 1],
      translateY: [8, 0],
      duration: 240,
      ease: 'outQuad',
    });
  }
  saveState();
}

/* ── Events ─────────────────────────────────────────────────────────────── */

for (const input of [ipInput, cidrInput, ip6Input]) {
  input.addEventListener('input', update);

  // Focus glow, driven through the dedicated overlay layer in each control.
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

// Delegated, matching the results panel's pattern.
segEl.addEventListener('click', (event) => {
  const button = event.target.closest('.seg__btn');
  if (!button) return;
  setMode(button.dataset.mode);
});

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

const saved = loadState();
ipInput.value = typeof saved.ip === 'string' ? saved.ip : DEFAULTS.ip;
cidrInput.value = typeof saved.cidr === 'string' ? saved.cidr : DEFAULTS.cidr;
ip6Input.value = typeof saved.ip6 === 'string' ? saved.ip6 : DEFAULTS.ip6;

setMode(saved.mode === 'v6' ? 'v6' : 'v4', { animateSwap: false });

if (!reduceMotion) {
  animate('.masthead, .card--query', {
    opacity: [0, 1],
    translateY: [10, 0],
    duration: 380,
    delay: stagger(60),
    ease: 'outQuad',
  });
}
