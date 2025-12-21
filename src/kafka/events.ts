export interface PaymentInitiatedEvent {
  type: 'payments.initiated';
  paymentId: number;
  customerId: string;
  vendorId: string;
  amount: number;
  currency: string;
  timestamp: string;
}

export interface PaymentCapturedEvent {
  type: 'payments.captured';
  paymentId: number;
  customerId: string;
  vendorId: string;
  amount: number;
  currency: string;
  timestamp: string;
}

export interface SettlementTaskEvent {
  type: 'settlement.tasks';
  settlementId: number;
  paymentId: number;
  splits: Array<{
    vendorId: string;
    amount: number;
  }>;
  timestamp: string;
}

export interface RefundInitiatedEvent {
  type: 'refunds.initiated';
  refundId: number;
  paymentId: number;
  amount: number;
  currency: string;
  timestamp: string;
}

export type PaymentEvent =
  | PaymentInitiatedEvent
  | PaymentCapturedEvent
  | SettlementTaskEvent
  | RefundInitiatedEvent;

