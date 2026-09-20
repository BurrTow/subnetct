// Pure IPv6 subnetting logic — no DOM here, so it's easy to unit test.
// Mirrors subnet.js: parse helpers, integer conversion, then one
// calculateSubnet6() that assembles the full breakdown. Errors are thrown.

import { parseIp } from './subnet.js';

const GROUPS = 8;
const BITS = 128;
const HEXTET = /^[0-9a-fA-F]{1,4}$/;
const FULL_MASK = (1n << 128n) - 1n;

/**
 * Well-known prefixes, most specific first, used to label an address.
 * Each entry is [network, prefix length, label].
 */
const ADDRESS_TYPES = [
  ['::', 128, 'Unspecified'],
  ['::1', 128, 'Loopback'],
  ['::ffff:0:0', 96, 'IPv4-mapped'],
  ['64:ff9b::', 96, 'IPv4/IPv6 translation'],
  ['2001:db8::', 32, 'Documentation'],
  ['fe80::', 10, 'Link-local unicast'],
  ['ff00::', 8, 'Multicast'],
  ['fc00::', 7, 'Unique local'],
  ['2000::', 3, 'Global unicast'],
];

/**
 * Parse an IPv6 address in any valid form — full, compressed with "::", or
 * with a trailing dotted-quad (::ffff:192.168.1.1) — into 8 hextet numbers.
 * Throws on bad input.
 */
export function parseIp6(ipStr) {
  let work = String(ipStr).trim();
  if (!work) throw new Error('IPv6 address is empty');
  if (!work.includes(':')) throw new Error('IPv6 address must contain ":"');

  // A trailing IPv4 literal stands in for the last two hextets.
  const lastColon = work.lastIndexOf(':');
  const tailToken = work.slice(lastColon + 1);
  if (tailToken.includes('.')) {
    const [a, b, c, d] = parseIp(tailToken);
    const high = ((a << 8) | b).toString(16);
    const low = ((c << 8) | d).toString(16);
    work = `${work.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const sides = work.split('::');
  if (sides.length > 2) throw new Error('"::" can only appear once in an IPv6 address');

  const compressed = sides.length === 2;
  const head = sides[0] === '' ? [] : sides[0].split(':');
  const tail = compressed && sides[1] !== '' ? sides[1].split(':') : [];

  const toHextet = (token) => {
    if (token === '') {
      throw new Error('IPv6 address has an empty group — use "::" to compress zeros');
    }
    if (!HEXTET.test(token)) throw new Error(`"${token}" is not a valid hextet`);
    return parseInt(token, 16);
  };

  const headValues = head.map(toHextet);
  const tailValues = tail.map(toHextet);
  const provided = headValues.length + tailValues.length;

  if (!compressed) {
    if (provided !== GROUPS) {
      throw new Error(`IPv6 address needs exactly ${GROUPS} groups (got ${provided})`);
    }
    return headValues;
  }

  if (provided >= GROUPS) {
    throw new Error('"::" must compress at least one group of zeros');
  }
  const zeros = new Array(GROUPS - provided).fill(0);
  return [...headValues, ...zeros, ...tailValues];
}

/** Parse a prefix length, "0" to "128". Throws on anything else. */
export function parsePrefix6(prefixStr) {
  const raw = String(prefixStr).trim();
  if (!/^\d{1,3}$/.test(raw)) {
    throw new Error(`Prefix length must be an integer from 0 to ${BITS}`);
  }
  const n = Number(raw);
  if (n > BITS) throw new Error(`Prefix length must be an integer from 0 to ${BITS}`);
  return n;
}

/**
 * Split "2001:db8::/32" into its address and prefix parts. The prefix is
 * null when the input carries no "/" — callers decide what to default to.
 */
export function splitCidr6(input) {
  const raw = String(input).trim();
  const parts = raw.split('/');
  if (parts.length > 2) throw new Error('Use a single "/" to separate the prefix length');
  return { address: parts[0].trim(), prefix: parts.length === 2 ? parts[1].trim() : null };
}

export function hextetsToBigInt(hextets) {
  let value = 0n;
  for (const hextet of hextets) value = (value << 16n) | BigInt(hextet);
  return value;
}

export function bigIntToHextets(value) {
  const hextets = [];
  for (let i = GROUPS - 1; i >= 0; i--) {
    hextets.push(Number((value >> BigInt(i * 16)) & 0xffffn));
  }
  return hextets;
}

/** Full, zero-padded form: 2001:0db8:0000:0000:0000:0000:0000:0001 */
export function expandIp6(hextets) {
  return hextets.map((h) => h.toString(16).padStart(4, '0')).join(':');
}

/**
 * RFC 5952 form: lowercase, leading zeros dropped, and the longest run of
 * two or more zero groups replaced by "::" (leftmost run wins a tie).
 */
export function compressIp6(hextets) {
  const parts = hextets.map((h) => h.toString(16));

  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  let runLength = 0;

  for (let i = 0; i < GROUPS; i++) {
    if (hextets[i] === 0) {
      if (runStart === -1) runStart = i;
      runLength++;
      if (runLength > bestLength) {
        bestLength = runLength;
        bestStart = runStart;
      }
    } else {
      runStart = -1;
      runLength = 0;
    }
  }

  // A single zero group must not be shortened.
  if (bestLength < 2) return parts.join(':');

  const head = parts.slice(0, bestStart).join(':');
  const tail = parts.slice(bestStart + bestLength).join(':');
  return `${head}::${tail}`;
}

/** Given a prefix length, return the 128-bit mask as a BigInt. */
export function maskFromPrefix6(prefix) {
  if (prefix === 0) return 0n;
  return ((1n << BigInt(prefix)) - 1n) << BigInt(BITS - prefix);
}

/** Label an address by the well-known prefix it falls inside. */
export function addressType(hextets) {
  const value = hextetsToBigInt(hextets);
  for (const [network, prefix, label] of ADDRESS_TYPES) {
    const mask = maskFromPrefix6(prefix);
    if ((value & mask) === (hextetsToBigInt(parseIp6(network)) & mask)) return label;
  }
  return 'Reserved or unassigned';
}

/** The dotted-quad inside an IPv4-mapped or translation address, else null. */
export function embeddedIpv4(hextets) {
  const type = addressType(hextets);
  if (type !== 'IPv4-mapped' && type !== 'IPv4/IPv6 translation') return null;
  const [a, b] = [hextets[6], hextets[7]];
  return [a >> 8, a & 255, b >> 8, b & 255].join('.');
}

/**
 * Full breakdown for an IPv6 address + prefix length.
 *
 * IPv6 has no broadcast address and no "usable hosts minus two" convention,
 * so this deliberately returns only what's meaningful: the network (prefix)
 * address, the last address in the block, the address type, the size of the
 * block as a BigInt, and — for a /64 — the interface ID.
 */
export function calculateSubnet6(addressStr, prefixStr) {
  const hextets = parseIp6(addressStr);
  const prefix = parsePrefix6(prefixStr);

  const value = hextetsToBigInt(hextets);
  const mask = maskFromPrefix6(prefix);
  const networkInt = value & mask;
  const lastInt = networkInt | (FULL_MASK ^ mask);

  const networkHextets = bigIntToHextets(networkInt);
  const lastHextets = bigIntToHextets(lastInt);
  const hostBits = BITS - prefix;

  return {
    address: compressIp6(hextets),
    expanded: expandIp6(hextets),
    prefix,
    network: compressIp6(networkHextets),
    networkExpanded: expandIp6(networkHextets),
    networkCidr: `${compressIp6(networkHextets)}/${prefix}`,
    lastAddress: compressIp6(lastHextets),
    addressType: addressType(hextets),
    totalAddresses: 1n << BigInt(hostBits),
    hostBits,
    interfaceId: prefix === 64 ? expandIp6(hextets).split(':').slice(4).join(':') : null,
    embeddedIpv4: embeddedIpv4(hextets),
  };
}
