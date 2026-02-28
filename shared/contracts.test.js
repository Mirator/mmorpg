import { describe, expect, it } from 'vitest';
import {
  getContractOffersForVendor,
  getContractSnapshotForPlayer,
} from './contracts.js';
import { CONTRACT_ROTATION_MS } from './professions.js';

describe('contracts', () => {
  it('rotates vendor offers deterministically by time bucket', () => {
    const first = getContractOffersForVendor('vendor_c_01', 5, 0);
    const sameBucket = getContractOffersForVendor('vendor_c_01', 5, CONTRACT_ROTATION_MS - 1);
    const nextBucket = getContractOffersForVendor('vendor_c_01', 5, CONTRACT_ROTATION_MS);

    expect(first).toEqual(sameBucket);
    expect(first).not.toEqual(nextBucket);
    expect(first.length).toBeLessThanOrEqual(3);
  });

  it('enriches active contracts in the player snapshot', () => {
    const snapshot = getContractSnapshotForPlayer({
      level: 4,
      activeContracts: [
        {
          templateId: 'gather_herbs_for_tonics',
          vendorId: 'vendor_c_01',
          acceptedAt: 100,
          progress: 2,
          completed: false,
          delivered: false,
        },
      ],
    }, 0);

    expect(snapshot.activeContracts).toEqual([
      expect.objectContaining({
        contractId: 'gather_herbs_for_tonics',
        title: 'Gather Healing Herbs',
        progress: 2,
        requiredCount: 4,
      }),
    ]);
    expect(snapshot.offersByVendor.vendor_c_01).toHaveLength(3);
  });
});
