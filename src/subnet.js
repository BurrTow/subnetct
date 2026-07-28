// Pure subnetting logic — no DOM here, so it's easy to unit test.

/** Parse "192.168.1.10" into [192,168,1,10]. Throws on bad input. */
export function parseIp(ipStr) {
  const parts = ipStr.trim().split('.');
  if (parts.length !== 4) throw new Error('IPv4 address needs exactly 4 octets');
  const octets = parts.map((p) => {
    if (!/^\d{1,3}$/.test(p)) throw new Error(`"${p}" is not a valid octet`);
    const n = Number(p);
    if (n < 0 || n > 255) throw new Error(`"${p}" is out of range (0-255)`);
    return n;
  });
  return octets;
}

export function ipToInt([a, b, c, d]) {
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

export function intToIp(int) {
  return [24, 16, 8, 0].map((shift) => (int >>> shift) & 255).join('.');
}

export function parseCidr(cidrStr) {
  const n = Number(cidrStr);
  if (!Number.isInteger(n) || n < 0 || n > 32) {
    throw new Error('Prefix length must be an integer from 0 to 32');
  }
  return n;
}

/** Given a CIDR prefix length, return the 32-bit mask as an unsigned int. */
export function maskFromCidr(cidr) {
  return cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
}

/**
 * Full subnet breakdown for an IP + prefix length.
 * Returns network/broadcast addresses, usable host range, host counts,
 * and the subnet/wildcard masks — everything a `show ip route`-style
 * summary would give you.
 */
export function calculateSubnet(ipStr, cidrStr) {
  const octets = parseIp(ipStr);
  const cidr = parseCidr(cidrStr);
  const ipInt = ipToInt(octets);
  const mask = maskFromCidr(cidr);
  const wildcard = (~mask) >>> 0;

  const networkInt = (ipInt & mask) >>> 0;
  const broadcastInt = (networkInt | wildcard) >>> 0;

  const totalHosts = 2 ** (32 - cidr);
  const usableHosts = cidr >= 31 ? 0 : totalHosts - 2;

  const firstHostInt = cidr >= 31 ? networkInt : networkInt + 1;
  const lastHostInt = cidr >= 31 ? broadcastInt : broadcastInt - 1;

  return {
    ip: octets.join('.'),
    cidr,
    subnetMask: intToIp(mask),
    wildcardMask: intToIp(wildcard),
    network: intToIp(networkInt),
    broadcast: intToIp(broadcastInt),
    firstHost: intToIp(firstHostInt),
    lastHost: intToIp(lastHostInt),
    totalHosts,
    usableHosts,
  };
}
