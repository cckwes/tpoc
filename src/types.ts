export type TransferQueueBody = {
  transferId: string;
};

export type CheckTransferQueueBody = {
  transferId: string;
  transactionHash: string;
};

export type Transfer = {
  id: string;
  destination_address: string;
  transaction_hash?: string;
  amount: string;
  status: string;
  employeeId: string;
  createdAt: string;
};

export type Employee = {
  id: string;
  wallet_address: string;
};
