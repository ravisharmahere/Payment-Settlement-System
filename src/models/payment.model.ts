export interface Payment {
  id: number;
  customerId: string;
  vendorId: string;
  amount: number;
  currency: string;
  description?: string;
  status: 'PENDING' | 'CAPTURED' | 'FAILED' | 'REFUNDED';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentInput {
  customerId: string;
  vendorId: string;
  amount: number;
  currency?: string;
  description?: string;
}

