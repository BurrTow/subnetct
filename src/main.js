import './style.css';
import { calculateSubnet } from './subnet.js';

const ipInput = document.querySelector('#ip');
const cidrInput = document.querySelector('#cidr');
const errorEl = document.querySelector('#error');
const resultsEl = document.querySelector('#results');

function renderResults(r) {
  const rows = [
    ['Network address', r.network],
    ['Broadcast address', r.broadcast],
    ['Subnet mask', r.subnetMask],
    ['Wildcard mask', r.wildcardMask],
    ['First usable host', r.firstHost],
    ['Last usable host', r.lastHost],
    ['Usable hosts', r.usableHosts.toLocaleString()],
    ['Total addresses', r.totalHosts.toLocaleString()],
  ];

  resultsEl.innerHTML = rows
    .map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`)
    .join('');
}

function update() {
  try {
    const result = calculateSubnet(ipInput.value, cidrInput.value);
    errorEl.textContent = '';
    renderResults(result);
  } catch (err) {
    errorEl.textContent = err.message;
    resultsEl.innerHTML = '';
  }
}

ipInput.addEventListener('input', update);
cidrInput.addEventListener('input', update);

update();
