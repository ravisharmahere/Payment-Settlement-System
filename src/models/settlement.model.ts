export interface Settlement {
  id: number;
  paymentId: number;
  status: 'PENDING' | 'SETTLED' | 'FAILED';
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SettlementSplit {
  id: number;
  settlementId: number;
  vendorId: string;
  amount: number;
  status: 'PENDING' | 'SETTLED' | 'FAILED';
  createdAt: Date;
  updatedAt: Date;
}

