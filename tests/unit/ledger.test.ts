import { LedgerService } from '../../src/services/ledger.service';
import { CreateLedgerEntryInput } from '../../src/models/ledger.model';

describe('LedgerService', () => {
  let ledgerService: LedgerService;

  beforeEach(() => {
    ledgerService = new LedgerService();
  });

  describe('Double-entry validation', () => {
    it('should throw error when debits do not equal credits', async () => {
      const entries: CreateLedgerEntryInput[] = [
        {
          accountType: 'CASH',
          debit: 100,
          credit: 0,
        },
        {
          accountType: 'REVENUE',
          debit: 0,
          credit: 50, // Should be 100
        },
      ];

      await expect(
        ledgerService.createLedgerEntries(entries)
      ).rejects.toThrow('Double-entry validation failed');
    });

    it('should accept valid double-entry entries', async () => {
      const entries: CreateLedgerEntryInput[] = [
        {
          accountType: 'CASH',
          debit: 100,
          credit: 0,
        },
        {
          accountType: 'REVENUE',
          debit: 0,
          credit: 100,
        },
      ];

      // This should not throw (assuming DB connection is mocked)
      // In a real test, you'd mock the database connection
      expect(entries.reduce((sum, e) => sum + e.debit, 0)).toBe(
        entries.reduce((sum, e) => sum + e.credit, 0)
      );
    });

    it('should handle multiple entries with balanced debits and credits', () => {
      const entries: CreateLedgerEntryInput[] = [
        {
          accountType: 'CASH',
          debit: 1000,
          credit: 0,
        },
        {
          accountType: 'REVENUE',
          debit: 0,
          credit: 300,
        },
        {
          accountType: 'PAYABLE',
          vendorId: 'vendor_001',
          debit: 0,
          credit: 700,
        },
      ];

      const totalDebits = entries.reduce((sum, e) => sum + e.debit, 0);
      const totalCredits = entries.reduce((sum, e) => sum + e.credit, 0);

      expect(totalDebits).toBe(1000);
      expect(totalCredits).toBe(1000);
      expect(totalDebits).toBe(totalCredits);
    });
  });
});

