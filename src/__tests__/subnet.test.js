import { describe, it, expect } from 'vitest';
import {
  parseIp,
  parseCidr,
  ipToInt,
  intToIp,
  maskFromCidr,
  calculateSubnet,
} from '../subnet.js';

describe('parseIp', () => {
  it('parses a valid address into octets', () => {
    expect(parseIp('192.168.1.10')).toEqual([192, 168, 1, 10]);
  });

  it('rejects an address with the wrong number of octets', () => {
    expect(() => parseIp('192.168.1')).toThrow();
  });

  it('rejects an out-of-range octet', () => {
    expect(() => parseIp('192.168.1.300')).toThrow();
  });
});

describe('parseCidr', () => {
  it('accepts prefix lengths from 0 to 32', () => {
    expect(parseCidr('0')).toBe(0);
    expect(parseCidr('24')).toBe(24);
    expect(parseCidr('32')).toBe(32);
  });

  it('rejects out-of-range prefix lengths', () => {
    expect(() => parseCidr('33')).toThrow();
    expect(() => parseCidr('-1')).toThrow();
  });
});

describe('ipToInt / intToIp round trip', () => {
  it('converts back and forth without loss', () => {
    const octets = [10, 0, 0, 1];
    expect(intToIp(ipToInt(octets))).toBe('10.0.0.1');
  });
});

describe('maskFromCidr', () => {
  it('produces the correct mask for common prefixes', () => {
    expect(intToIp(maskFromCidr(24))).toBe('255.255.255.0');
    expect(intToIp(maskFromCidr(16))).toBe('255.255.0.0');
    expect(intToIp(maskFromCidr(30))).toBe('255.255.255.252');
  });
});

describe('calculateSubnet', () => {
  it('handles a standard /24', () => {
    const r = calculateSubnet('192.168.1.10', '24');
    expect(r.network).toBe('192.168.1.0');
    expect(r.broadcast).toBe('192.168.1.255');
    expect(r.firstHost).toBe('192.168.1.1');
    expect(r.lastHost).toBe('192.168.1.254');
    expect(r.usableHosts).toBe(254);
  });

  it('handles a point-to-point /30', () => {
    const r = calculateSubnet('10.0.0.5', '30');
    expect(r.network).toBe('10.0.0.4');
    expect(r.broadcast).toBe('10.0.0.7');
    expect(r.usableHosts).toBe(2);
  });

  it('handles a /31 with no usable hosts (RFC 3021)', () => {
    const r = calculateSubnet('10.0.0.0', '31');
    expect(r.usableHosts).toBe(0);
  });

  it('handles a /32 host route', () => {
    const r = calculateSubnet('8.8.8.8', '32');
    expect(r.network).toBe('8.8.8.8');
    expect(r.broadcast).toBe('8.8.8.8');
    expect(r.usableHosts).toBe(0);
  });
});
