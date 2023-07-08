import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Client } from 'pg';
import { SQS } from 'aws-sdk';

const sqs = new SQS();
const QUEUE_URL = process.env.TRANSFER_QUEUE
const databaseURL = 'postgres://hzwkzwsk:ceueN7oQTORFeSVP_IxkuJnqwQH3xt7q@satao.db.elephantsql.com/hzwkzwsk';

const returnError = (statusCode: number, message: string) => {
  return {
    statusCode,
    body: JSON.stringify({
      message,
    })
  }
}

const returnResult = <T>(result: T) => {
  return {
    statusCode: 200,
    body: JSON.stringify(result)
  }
}

const returnUnchanged = () => {
  return {
    statusCode: 304,
    body: JSON.stringify({
      message: 'OK',
    })
  }
}

export const getTransferById = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { transferId } = event.pathParameters;

  const client = new Client(databaseURL);
  await client.connect();

  const result = await client.query({
    text: 'SELECT * FROM public.transfer WHERE id = $1',
    values: [transferId]
  });

  if (result.rowCount === 0) {
    return returnError(404, 'Transaction not found');
  }

  return returnResult(result.rows[0]);
}

export const createTransfer = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const headers = event.headers;
  const idempotencyKey = headers['X-Idempotency-Key'];
  const parsedBody = JSON.parse(event.body);
  const { employeeId, amount } = parsedBody;

  const client = new Client(databaseURL);
  await client.connect();

  let isRetry = false;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    const result = await client.query({text: 'SELECT * FROM public.idempotency WHERE key = $1', values: [idempotencyKey]})

    if (result.rowCount === 0) {
      await client.query({
        text: 'INSERT INTO public.idempotency(key) VALUES($1)',
        values: [idempotencyKey],
      })
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
    values: [employeeId]
  });
  if (employees.rowCount === 0) {
    return returnError(404, 'Employee not found');
  }
  const [employee] = employees.rows;

  const destinationAddress = employee.walletAddress;
  const insertResult = await client.query({
    text: 'INSERT INTO public.transfer(employeeId, createdAt, status, destinationAddress, amount) VALUES($1, $2, $3, $4, $5) RETURNING id',
    values: [employeeId, new Date().toISOString(), 'PENDING', destinationAddress, amount],
  })
  const transferId = insertResult.rows[0].id;

  await sqs.sendMessage({
    MessageBody: JSON.stringify({
      transferId,
    }),
    QueueUrl: QUEUE_URL,
  }).promise();


  return returnResult({ transferId })
}
