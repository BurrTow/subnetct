import { describe, it, expect } from 'vitest';
import {
  parseIp6,
  parsePrefix6,
  splitCidr6,
  hextetsToBigInt,
  bigIntToHextets,
  expandIp6,
  compressIp6,
  maskFromPrefix6,
  addressType,
  embeddedIpv4,
  calculateSubnet6,
} from '../subnet6.js';

describe('parseIp6', () => {
  it('parses a full 8-group address', () => {
    expect(parseIp6('2001:0db8:0000:0000:0000:0000:0000:0001')).toEqual([
      0x2001, 0xdb8, 0, 0, 0, 0, 0, 1,
    ]);
  });

  it('parses an address compressed with ::', () => {
    expect(parseIp6('2001:db8::1')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
  });

  it('accepts :: at the start, middle and end', () => {
    expect(parseIp6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIp6('2001:db8::8a2e:370:7334')).toEqual([
      0x2001, 0xdb8, 0, 0, 0, 0x8a2e, 0x370, 0x7334,
    ]);
    expect(parseIp6('2001:db8::')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 0]);
  });

  it('parses the all-zero address', () => {
    expect(parseIp6('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('strips leading zeros in a hextet', () => {
    expect(parseIp6('2001:0db8:0000:0000:0000:ff00:0042:8329')).toEqual([
      0x2001, 0xdb8, 0, 0, 0, 0xff00, 0x42, 0x8329,
    ]);
  });

  it('is case insensitive', () => {
    expect(parseIp6('FE80::ABCD')).toEqual(parseIp6('fe80::abcd'));
  });

  it('parses an IPv4-mapped address', () => {
    expect(parseIp6('::ffff:192.168.1.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x101]);
  });

  it('parses a mixed address with no leading ::', () => {
    expect(parseIp6('64:ff9b::192.0.2.33')).toEqual([0x64, 0xff9b, 0, 0, 0, 0, 0xc000, 0x221]);
  });

  it('accepts :: standing in for a single zero group', () => {
    expect(parseIp6('1:2:3:4:5:6::8')).toEqual([1, 2, 3, 4, 5, 6, 0, 8]);
  });

  it('rejects more than one ::', () => {
    expect(() => parseIp6('2001::db8::1')).toThrow(/only appear once/);
  });

  it('rejects a hextet with more than four digits', () => {
    expect(() => parseIp6('2001:db8:12345::1')).toThrow(/not a valid hextet/);
  });

  it('rejects a non-hex hextet', () => {
    expect(() => parseIp6('2001:db8:zzzz::1')).toThrow(/not a valid hextet/);
  });

  it('rejects too few groups without ::', () => {
    expect(() => parseIp6('1:2:3:4:5:6:7')).toThrow(/exactly 8 groups/);
  });

  it('rejects too many groups', () => {
    expect(() => parseIp6('1:2:3:4:5:6:7:8:9')).toThrow(/exactly 8 groups/);
  });

  it('rejects :: that compresses nothing', () => {
    expect(() => parseIp6('1:2:3:4:5:6:7:8::')).toThrow(/at least one group/);
  });

  it('rejects an empty group', () => {
    expect(() => parseIp6('2001:db8::1:')).toThrow(/empty group/);
  });

  it('rejects an empty string', () => {
    expect(() => parseIp6('')).toThrow(/empty/);
  });

  it('rejects an address with no colon at all', () => {
    expect(() => parseIp6('192.168.1.1')).toThrow(/must contain ":"/);
  });

  it('rejects a malformed IPv4 tail', () => {
    expect(() => parseIp6('::ffff:192.168.1.300')).toThrow();
    expect(() => parseIp6('::ffff:192.168.1')).toThrow();
  });
});

describe('parsePrefix6', () => {
  it('accepts prefix lengths from 0 to 128', () => {
    expect(parsePrefix6('0')).toBe(0);
    expect(parsePrefix6('64')).toBe(64);
    expect(parsePrefix6('128')).toBe(128);
  });

  it('rejects out-of-range prefix lengths', () => {
    expect(() => parsePrefix6('129')).toThrow();
    expect(() => parsePrefix6('-1')).toThrow();
  });

  it('rejects non-integer and empty prefixes', () => {
    expect(() => parsePrefix6('')).toThrow();
    expect(() => parsePrefix6('64.5')).toThrow();
    expect(() => parsePrefix6('abc')).toThrow();
  });
});

describe('splitCidr6', () => {
  it('splits an address and prefix', () => {
    expect(splitCidr6('2001:db8::/32')).toEqual({ address: '2001:db8::', prefix: '32' });
  });

  it('reports a null prefix when none is given', () => {
    expect(splitCidr6('2001:db8::1')).toEqual({ address: '2001:db8::1', prefix: null });
  });

  it('rejects more than one slash', () => {
    expect(() => splitCidr6('2001:db8::/32/64')).toThrow(/single "\/"/);
  });
});

describe('hextetsToBigInt / bigIntToHextets round trip', () => {
  it('converts back and forth without loss', () => {
    const hextets = [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1];
    expect(bigIntToHextets(hextetsToBigInt(hextets))).toEqual(hextets);
  });

  it('handles the all-ones address', () => {
    const all = new Array(8).fill(0xffff);
    expect(hextetsToBigInt(all)).toBe((1n << 128n) - 1n);
  });
});

describe('expandIp6', () => {
  it('pads every group to four digits', () => {
    expect(expandIp6(parseIp6('2001:db8::1'))).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
  });

  it('expands the all-zero address', () => {
    expect(expandIp6(parseIp6('::'))).toBe('0000:0000:0000:0000:0000:0000:0000:0000');
  });
});

describe('compressIp6', () => {
  it('drops leading zeros and compresses the zero run', () => {
    expect(compressIp6(parseIp6('2001:0db8:0000:0000:0000:0000:0000:0001'))).toBe('2001:db8::1');
  });

  it('compresses the all-zero address to ::', () => {
    expect(compressIp6(parseIp6('::'))).toBe('::');
  });

  it('compresses loopback to ::1', () => {
    expect(compressIp6(parseIp6('0:0:0:0:0:0:0:1'))).toBe('::1');
  });

  it('compresses a trailing zero run', () => {
    expect(compressIp6(parseIp6('2001:db8:0:0:0:0:0:0'))).toBe('2001:db8::');
  });

  it('leaves a single zero group uncompressed', () => {
    expect(compressIp6(parseIp6('1:2:3:4:5:0:7:8'))).toBe('1:2:3:4:5:0:7:8');
  });

  it('compresses the longest run, not the first', () => {
    expect(compressIp6(parseIp6('1:0:0:4:0:0:0:8'))).toBe('1:0:0:4::8');
  });

  it('picks the leftmost run when two runs tie', () => {
    expect(compressIp6(parseIp6('1:0:0:4:5:0:0:8'))).toBe('1::4:5:0:0:8');
  });

  it('round trips through parse', () => {
    expect(compressIp6(parseIp6('fe80:0000:0000:0000:0202:b3ff:fe1e:8329'))).toBe(
      'fe80::202:b3ff:fe1e:8329'
    );
  });
});

describe('maskFromPrefix6', () => {
  it('produces the correct mask for common prefixes', () => {
    expect(maskFromPrefix6(0)).toBe(0n);
    expect(maskFromPrefix6(128)).toBe((1n << 128n) - 1n);
    expect(compressIp6(bigIntToHextets(maskFromPrefix6(64)))).toBe('ffff:ffff:ffff:ffff::');
    expect(compressIp6(bigIntToHextets(maskFromPrefix6(48)))).toBe('ffff:ffff:ffff::');
  });
});

describe('addressType', () => {
  it('labels global unicast', () => {
    expect(addressType(parseIp6('2606:4700::1111'))).toBe('Global unicast');
  });

  it('labels link-local fe80::/10', () => {
    expect(addressType(parseIp6('fe80::1'))).toBe('Link-local unicast');
    expect(addressType(parseIp6('febf::1'))).toBe('Link-local unicast');
  });

  it('labels unique local fc00::/7', () => {
    expect(addressType(parseIp6('fd00::1'))).toBe('Unique local');
    expect(addressType(parseIp6('fc00::1'))).toBe('Unique local');
  });

  it('labels multicast ff00::/8', () => {
    expect(addressType(parseIp6('ff02::1'))).toBe('Multicast');
  });

  it('labels loopback ::1', () => {
    expect(addressType(parseIp6('::1'))).toBe('Loopback');
  });

  it('labels the unspecified address ::', () => {
    expect(addressType(parseIp6('::'))).toBe('Unspecified');
  });

  it('labels documentation 2001:db8::/32', () => {
    expect(addressType(parseIp6('2001:db8::1'))).toBe('Documentation');
  });

  it('labels IPv4-mapped addresses', () => {
    expect(addressType(parseIp6('::ffff:192.168.1.1'))).toBe('IPv4-mapped');
  });

  it('labels anything outside a known prefix as reserved', () => {
    expect(addressType(parseIp6('100::1'))).toBe('Reserved or unassigned');
  });
});

describe('embeddedIpv4', () => {
  it('extracts the dotted quad from an IPv4-mapped address', () => {
    expect(embeddedIpv4(parseIp6('::ffff:192.168.1.1'))).toBe('192.168.1.1');
  });

  it('returns null for an ordinary address', () => {
    expect(embeddedIpv4(parseIp6('2001:db8::1'))).toBe(null);
  });
});

describe('calculateSubnet6', () => {
  it('handles a standard /64', () => {
    const r = calculateSubnet6('2001:db8:abcd:0012::1', '64');
    expect(r.network).toBe('2001:db8:abcd:12::');
    expect(r.lastAddress).toBe('2001:db8:abcd:12:ffff:ffff:ffff:ffff');
    expect(r.prefix).toBe(64);
    expect(r.hostBits).toBe(64);
    expect(r.totalAddresses).toBe(2n ** 64n);
    expect(r.addressType).toBe('Documentation');
  });

  it('exposes the interface ID for a /64', () => {
    const r = calculateSubnet6('2001:db8::dead:beef', '64');
    expect(r.interfaceId).toBe('0000:0000:dead:beef');
  });

  it('has no interface ID outside a /64', () => {
    expect(calculateSubnet6('2001:db8::1', '48').interfaceId).toBe(null);
  });

  it('handles /0 — the whole address space', () => {
    const r = calculateSubnet6('2001:db8::1', '0');
    expect(r.network).toBe('::');
    expect(r.lastAddress).toBe('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff');
    expect(r.totalAddresses).toBe(2n ** 128n);
  });

  it('handles /128 — a single address', () => {
    const r = calculateSubnet6('2001:db8::1', '128');
    expect(r.network).toBe('2001:db8::1');
    expect(r.lastAddress).toBe('2001:db8::1');
    expect(r.totalAddresses).toBe(1n);
    expect(r.hostBits).toBe(0);
  });

  it('keeps both the expanded and compressed forms of the input', () => {
    const r = calculateSubnet6('2001:0db8:0000:0000:0000:0000:0000:0001', '64');
    expect(r.expanded).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
    expect(r.address).toBe('2001:db8::1');
  });

  it('builds the network address in CIDR form', () => {
    expect(calculateSubnet6('fe80::1', '10').networkCidr).toBe('fe80::/10');
  });

  it('masks a link-local address down to its prefix', () => {
    const r = calculateSubnet6('fe80::202:b3ff:fe1e:8329', '10');
    expect(r.network).toBe('fe80::');
    expect(r.addressType).toBe('Link-local unicast');
  });

  it('surfaces the embedded IPv4 address', () => {
    expect(calculateSubnet6('::ffff:10.0.0.1', '96').embeddedIpv4).toBe('10.0.0.1');
  });

  it('throws on an invalid address', () => {
    expect(() => calculateSubnet6('2001:db8:::1', '64')).toThrow();
  });

  it('throws on an out-of-range prefix', () => {
    expect(() => calculateSubnet6('2001:db8::1', '129')).toThrow();
  });
});
