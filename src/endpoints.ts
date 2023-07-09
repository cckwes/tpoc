import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Client } from 'pg';
import { SQS } from 'aws-sdk';
import { Employee } from './types';
import { getQueueUrl } from './helper';

const sqs = new SQS();
const transferQueueName = process.env.TRANSFER_QUEUE;
const databaseUrl = process.env.DATABASE_URL;

const returnError = (statusCode: number, message: string) => {
  return {
    statusCode,
    body: JSON.stringify({
      message,
    }),
  };
};

const returnResult = <T>(result: T) => {
  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
};

const returnUnchanged = () => {
  return {
    statusCode: 304,
    body: JSON.stringify({
      message: 'OK',
    }),
  };
};

export const getTransferById = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const { transferId } = event.pathParameters;

  const client = new Client(databaseUrl);
  await client.connect();

  const result = await client
    .query({
      text: 'SELECT * FROM public.transfer WHERE id = $1',
      values: [transferId],
    })
    .catch(async error => {
      console.error(error);
      await client.end();
      throw error;
    });

  await client.end();

  if (result.rowCount === 0) {
    return returnError(404, 'Transaction not found');
  }

  return returnResult(result.rows[0]);
};

export const createTransfer = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const parsedBody = JSON.parse(event.body);
  const { employeeId, amount, idempotencyKey } = parsedBody;

  if (!employeeId || isNaN(amount) || amount <= 0) {
    return returnError(400, 'Invalid input');
  }

  if (!idempotencyKey) {
    return returnError(400, 'idempotencyKey is required');
  }

  const client = new Client(databaseUrl);
  await client.connect();

  let isRetry = false;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    const result = await client.query({
      text: 'SELECT * FROM public.idempotency WHERE idempotent_key = $1',
      values: [idempotencyKey],
    });

    if (result.rowCount === 0) {
      await client.query({
        text: 'INSERT INTO public.idempotency(idempotent_key) VALUES($1)',
        values: [idempotencyKey],
      });
      await client.query('COMMIT');
    } else {
      isRetry = true;
      await client.query('ROLLBACK');
    }
  } catch (error) {
    console.error(error);
    await client.query('ROLLBACK');
  }

  if (isRetry) {
    return returnUnchanged();
  }

  const employees = await client.query({
    text: 'SELECT * FROM public.employee WHERE id = $1',
    values: [employeeId],
  });
  if (employees.rowCount === 0) {
    return returnError(404, 'Employee not found');
  }
  const [employee] = employees.rows as Array<Employee>;
  console.log({ employee });

  const destinationAddress = employee.wallet_address;
  const insertResult = await client
    .query({
      text: 'INSERT INTO public.transfer(employee_id, created_at, status, destination_address, amount) VALUES($1, $2, $3, $4, $5) RETURNING id',
      values: [
        employeeId,
        new Date().toISOString(),
        'PENDING',
        destinationAddress,
        amount * 1e6,
      ],
    })
    .catch(async error => {
      console.error(error);
      await client.end();
      throw error;
    });

  await client.end();

  const transferId = insertResult.rows[0].id;

  const queueUrl = await getQueueUrl(transferQueueName);
  await sqs
    .sendMessage({
      MessageBody: JSON.stringify({
        transferId,
      }),
      QueueUrl: queueUrl,
    })
    .promise();

  return returnResult({ transferId });
};
