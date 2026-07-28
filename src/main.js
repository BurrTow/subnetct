import './style.css';
import { calculateSubnet } from './subnet.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="console-bar">
    <span class="console-dot"></span>
    <span class="console-dot"></span>
    <span class="console-dot"></span>
    <span class="console-title">subnetctl — ipv4 subnet calculator</span>
  </div>
  <div class="panel">
    <header class="hero">
      <h1><span class="prompt">&gt;</span> subnetctl</h1>
      <p>Enter an address and prefix length. Get the network, broadcast, usable
      host range, and a bit-level view of exactly where the mask splits network
      from host — the same math a router does on every packet.</p>
    </header>

    <div class="input-row">
      <div class="field">
        <label for="ip">IPv4 address</label>
        <input id="ip" type="text" inputmode="decimal" autocomplete="off"
               spellcheck="false" placeholder="192.168.1.10" value="192.168.1.10" />
      </div>
      <span class="slash">/</span>
      <div class="field cidr">
        <label for="cidr">Prefix</label>
        <input id="cidr" type="text" inputmode="numeric" autocomplete="off"
               spellcheck="false" placeholder="24" value="24" />
      </div>
    </div>

    <p class="error-msg" id="error"></p>

    <div class="bitmap-section">
      <p class="bitmap-caption">
        <span class="accent-dot">■</span> network bits &nbsp;
        <span class="warn-dot">■</span> host bits
      </p>
      <div class="bitmap" id="bitmap"></div>
    </div>

    <div class="results" id="results"></div>
  </div>

  <footer>built for a DevOps/SDLC technical assessment — checked out, tested, built, and deployed by GitHub Actions</footer>
`;

const ipInput = document.querySelector('#ip');
const cidrInput = document.querySelector('#cidr');
const errorEl = document.querySelector('#error');
const bitmapEl = document.querySelector('#bitmap');
const resultsEl = document.querySelector('#results');

function renderBitmap(binaryOctets, cidr) {
  bitmapEl.innerHTML = binaryOctets
    .map((octet, octetIndex) => {
      const bits = octet
        .split('')
        .map((bit, bitIndex) => {
          const globalBitIndex = octetIndex * 8 + bitIndex;
          const cls = globalBitIndex < cidr ? 'network' : 'host';
          return `<span class="bit ${cls}">${bit}</span>`;
        })
        .join('');
      return `<div class="bitmap-octet">${bits}</div>`;
    })
    .join('');
}

function renderResults(r) {
  const cells = [
    ['Network address', r.network, true],
    ['Broadcast address', r.broadcast, false],
    ['Subnet mask', r.subnetMask, false],
    ['Wildcard mask', r.wildcardMask, false],
    ['First usable host', r.firstHost, true],
    ['Last usable host', r.lastHost, true],
    ['Usable hosts', r.usableHosts.toLocaleString(), false],
    ['Total addresses', r.totalHosts.toLocaleString(), false],
  ];

  resultsEl.innerHTML = cells
    .map(
      ([label, value, highlight]) => `
      <div class="result-cell ${highlight ? 'highlight' : ''}">
        <p class="label">${label}</p>
        <p class="value">${value}</p>
      </div>`
    )
    .join('');
}

function update() {
  try {
    const result = calculateSubnet(ipInput.value, cidrInput.value);
    errorEl.textContent = '';
    renderBitmap(result.binaryOctets, result.cidr);
    renderResults(result);
  } catch (err) {
    errorEl.textContent = err.message;
    bitmapEl.innerHTML = '';
    resultsEl.innerHTML = '';
  }
}

ipInput.addEventListener('input', update);
cidrInput.addEventListener('input', update);

update();
