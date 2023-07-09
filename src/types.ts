export type TransferQueueBody = {
  transferId: string;
}

export type CheckTransferQueueBody = {
  transferId: string;
  transactionHash: string;
}

export type Transfer = {
  id: string;
  destinationAddress: string;
  transactionHash?: string;
  amount: string;
  status: string;
  employeeId: string;
  createdAt: string;
}

export type Employee = {
  id: string;
  walletAddress: string;
}
