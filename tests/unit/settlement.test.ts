import { SettlementService } from '../../src/services/settlement.service';

describe('SettlementService', () => {
  let settlementService: SettlementService;

  beforeEach(() => {
    settlementService = new SettlementService();
  });

  describe('Split calculation', () => {
    it('should calculate splits correctly for 70/30 split', () => {
      const vendors = [
        { id: 'vendor_001', name: 'Vendor A', splitPercentage: 70 },
      ];

      // Access private method via type assertion for testing
      const calculateSplits = (settlementService as any).calculateSplits.bind(
        settlementService
      );

      const splits = calculateSplits(1000, vendors, 'vendor_001');

      expect(splits).toHaveLength(2);
      
      const platformSplit = splits.find((s: any) => s.vendorId === 'PLATFORM');
      const vendorSplit = splits.find((s: any) => s.vendorId === 'vendor_001');

      expect(platformSplit).toBeDefined();
      expect(platformSplit.amount).toBe(300); // 30% of 1000
      expect(platformSplit.percentage).toBe(30);

      expect(vendorSplit).toBeDefined();
      expect(vendorSplit.amount).toBe(700); // 70% of 1000
      expect(vendorSplit.percentage).toBe(70);

      // Total should equal original amount
      const total = splits.reduce((sum: number, s: any) => sum + s.amount, 0);
      expect(total).toBe(1000);
    });

    it('should calculate splits correctly for 50/50 split', () => {
      const vendors = [
        { id: 'vendor_002', name: 'Vendor B', splitPercentage: 50 },
      ];

      const calculateSplits = (settlementService as any).calculateSplits.bind(
        settlementService
      );

      const splits = calculateSplits(2000, vendors, 'vendor_002');

      const platformSplit = splits.find((s: any) => s.vendorId === 'PLATFORM');
      const vendorSplit = splits.find((s: any) => s.vendorId === 'vendor_002');

      expect(platformSplit.amount).toBe(1000); // 50% of 2000
      expect(vendorSplit.amount).toBe(1000); // 50% of 2000

      const total = splits.reduce((sum: number, s: any) => sum + s.amount, 0);
      expect(total).toBe(2000);
    });

    it('should handle decimal amounts correctly', () => {
      const vendors = [
        { id: 'vendor_001', name: 'Vendor A', splitPercentage: 33.33 },
      ];

      const calculateSplits = (settlementService as any).calculateSplits.bind(
        settlementService
      );

      const splits = calculateSplits(100, vendors, 'vendor_001');

      const total = splits.reduce((sum: number, s: any) => sum + s.amount, 0);
      // Should be approximately 100 (allowing for floating point precision)
      expect(total).toBeCloseTo(100, 2);
    });
  });
});

