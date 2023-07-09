import { SQS } from 'aws-sdk';

const sqs = new SQS();

export const getQueueUrl = async (queueName: string) => {
  const response = await sqs.getQueueUrl({ QueueName: queueName }).promise();
  return response.QueueUrl;
};
