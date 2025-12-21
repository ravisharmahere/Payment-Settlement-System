export type AccountType = 'CASH' | 'REVENUE' | 'PAYABLE';

export interface LedgerEntry {
  id: number;
  settlementId?: number;
  paymentId?: number;
  accountType: AccountType;
  vendorId?: string;
  debit: number;
  credit: number;
  description?: string;
  createdAt: Date;
}

export interface CreateLedgerEntryInput {
  settlementId?: number;
  paymentId?: number;
  accountType: AccountType;
  vendorId?: string;
  debit: number;
  credit: number;
  description?: string;
}

