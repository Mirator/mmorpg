import { describe, it, expect } from 'vitest';
import { parseClientMessage, sanitizeInputKeys } from './protocol.js';

describe('protocol validation', () => {
  it('sanitizes input keys', () => {
    expect(sanitizeInputKeys({ w: 1, a: 0, s: true, d: null })).toEqual({
      w: true,
      a: false,
      s: true,
      d: false,
    });
  });

  it('accepts input message', () => {
    const msg = parseClientMessage({ type: 'input', keys: { w: true }, seq: 3 });
    expect(msg).toEqual({
      type: 'input',
      keys: { w: true, a: false, s: false, d: false },
      seq: 3,
    });
  });

  it('accepts moveTarget message', () => {
    const msg = parseClientMessage({ type: 'moveTarget', x: 1, z: -2, seq: 1 });
    expect(msg).toEqual({ type: 'moveTarget', x: 1, z: -2, seq: 1 });
  });

  it('rejects invalid moveTarget message', () => {
    expect(parseClientMessage({ type: 'moveTarget', x: 'nope', z: 1 })).toBe(null);
  });

  it('accepts action messages', () => {
    expect(parseClientMessage({ type: 'action', kind: 'interact' })).toEqual({
      type: 'action',
      kind: 'interact',
      seq: undefined,
    });
    expect(parseClientMessage({ type: 'action', kind: 'ability', slot: 1, seq: 2 })).toEqual({
      type: 'action',
      kind: 'ability',
      slot: 1,
      seq: 2,
    });
  });

  it('rejects invalid ability slot', () => {
    expect(parseClientMessage({ type: 'action', kind: 'ability', slot: 0 })).toBe(null);
  });

  it('accepts inventorySwap message', () => {
    expect(parseClientMessage({ type: 'inventorySwap', from: 0, to: 1, seq: 4 })).toEqual({
      type: 'inventorySwap',
      from: 0,
      to: 1,
      seq: 4,
    });
  });

  it('accepts vendorSell message', () => {
    expect(parseClientMessage({ type: 'vendorSell', vendorId: 'vendor-1', slot: 2 })).toEqual({
      type: 'vendorSell',
      vendorId: 'vendor-1',
      slot: 2,
      seq: undefined,
    });
  });

  it('rejects invalid classSelect message', () => {
    expect(parseClientMessage({ type: 'classSelect', classId: '' })).toBe(null);
  });

  it('accepts hello message', () => {
    expect(parseClientMessage({ type: 'hello' })).toEqual({ type: 'hello', seq: undefined });
  });
});
