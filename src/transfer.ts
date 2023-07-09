import { SQSEvent } from "aws-lambda";
import { Client } from 'pg';
import * as ethers from 'ethers';
import { SQS } from 'aws-sdk';
import { usdtContractAddress, usdtContractAbi } from './data';
import { CheckTransferQueueBody, Transfer, TransferQueueBody } from "./types";

const accountPrivateKey = process.env.ACCOUNT_PRIVATE_KEY;
const databaseUrl = process.env.DATABASE_URL;
const infuraUrl = process.env.INFURA_URL;
const sqs = new SQS();
const checkTransferQueueUrl = process.env.CHECK_TRANSFER_QUEUE;
const network = 'sepolia';

export const processTransfer = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const { transferId } = JSON.parse(record.body) as TransferQueueBody;

    const client = new Client(databaseUrl);
    await client.connect();
    const result = await client.query({
      text: 'SELECT * FROM public.transfer WHERE id = $1',
      values: [transferId],
    });

    if (result.rowCount === 0) {
      console.error(`Cannot find transfer with id ${transferId}`);
      return;
    }

    const transfer = result.rows[0] as Transfer;
    const wallet = new ethers.Wallet(accountPrivateKey);
    const provider = new ethers.JsonRpcProvider(infuraUrl, network);
    const account = wallet.connect(provider);
    const usdt = new ethers.Contract(usdtContractAddress, usdtContractAbi, account);
    const to = ethers.getAddress(transfer.destinationAddress);
    const value = ethers.parseUnits(transfer.amount, 6);

    const walletBalance = await usdt.balanceOf(account.address);

    if (walletBalance.lt(value)) {
      await client.query({
        text: 'UPDATE public.transfer SET status = $1 WHERE id = $2',
        values: ['INSUFFICIENT_BALANCE', transferId],
      });
      console.error(`Can not create transaction for id ${transferId} because insufficient wallet balance`);

      return;
    }

    const tx = await usdt.transfer(to, value, { gasLimit: 3e6 });

    await client.query({
      text: 'UPDATE public.transfer SET status = $1, transactionHash = $2 WHERE id = $3',
      values: ['CREATED', tx.hash, transferId],
    });

    await sqs.sendMessage({
      MessageBody: JSON.stringify({
        transferId,
        transactionHash: tx.hash,
      }),
      QueueUrl: checkTransferQueueUrl,
      DelaySeconds: 60,
    }).promise();
  }
}

export const checkTransfer = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const { transferId, transactionHash } = JSON.parse(record.body) as CheckTransferQueueBody;

    const client = new Client(databaseUrl);
    await client.connect();
    const provider = new ethers.JsonRpcProvider(infuraUrl, network);
    const transactionReceipt = await provider.getTransactionReceipt(transactionHash);

    if (transactionReceipt == null) {
      await sqs.sendMessage({
        MessageBody: JSON.stringify({
          transferId,
          transactionHash,
        }),
        QueueUrl: checkTransferQueueUrl,
        DelaySeconds: 60,
      }).promise();

      return;
    }

    const transactionStatus = ((!!transactionReceipt.status && transactionReceipt.status === 1) || !!transactionReceipt.blockNumber) ? 'CONFIRMED' : 'REVERTED';

    await client.query({
      text: 'UPDATE public.transfer SET status = $1, WHERE id = $2',
      values: [transactionStatus, transferId],
    })
  }
}
