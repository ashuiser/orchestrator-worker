import {
	ChangeMessageVisibilityCommand,
	DeleteMessageCommand,
	SendMessageBatchCommand,
	SendMessageCommand,
	SQSClient,
} from "@aws-sdk/client-sqs";
import { env } from "../config/env.js";
import type { TTranscodeMessage } from "../types/messageTypes.js";

type TTranscodeMessageState = {
	message: TTranscodeMessage;
	index: string;
};

const client = new SQSClient({ region: env.AWS_REGION });

export async function deleteMessage(queueUrl: string, receiptHandle: string) {
	const command = new DeleteMessageCommand({
		QueueUrl: queueUrl,
		ReceiptHandle: receiptHandle,
	});

	await client.send(command);
}

export function keepVisibilityTimeout(
	queueUrl: string,
	receiptHandle: string,
	visibilityTimeout = 60, // Default 1 min
	delay = 20, // in sec
) {
	const command = new ChangeMessageVisibilityCommand({
		QueueUrl: queueUrl,
		ReceiptHandle: receiptHandle,
		VisibilityTimeout: visibilityTimeout,
	});
	let requestInprogress = false;
	const intervalId = setInterval(async () => {
		if (requestInprogress) return;
		requestInprogress = true;
		try {
			await client.send(command);
		} catch (err) {
			console.error(err);
		} finally {
			requestInprogress = false;
		}
	}, delay * 1000);

	return () => {
		clearInterval(intervalId);
	};
}

export async function sendSingleMessage(
	queueUrl: string,
	message: Record<string, unknown>,
) {
	const command = new SendMessageCommand({
		QueueUrl: queueUrl,
		MessageBody: JSON.stringify(message),
	});
	await client.send(command);
}

export async function sendBatchMessage(
	queueUrl: string,
	messages: TTranscodeMessage[],
	batchSize = 10,
	concurrency = 5,
	maxRetries = 3,
	beforeBatchSend?: (batch: TTranscodeMessage[]) => Promise<TTranscodeMessage[]>,
	onBatchSuccess?: (successfulMessages: TTranscodeMessage[]) => Promise<void>,
) {
	if (batchSize > 10) {
		throw new Error("Batch size cannot be greater than 10");
	}
	const pending = messages.map((message, index) => ({
		message,
		index: String(index),
	}));

	const retryMap = new Map<string, number>();

	const permanentlyFailed: TTranscodeMessageState[] = [];

	let cursor = 0;

	async function worker(start: number) {
		const rawBatch = pending.slice(start, start + batchSize);

		if (rawBatch.length === 0) return;

		let batch = rawBatch;
		if (beforeBatchSend) {
			const batchMessages = rawBatch.map((item) => item.message);
			const filteredMessages = await beforeBatchSend(batchMessages);
			batch = rawBatch.filter((item) => filteredMessages.includes(item.message));
		}

		if (batch.length === 0) return;

		try {
			const command = new SendMessageBatchCommand({
				QueueUrl: queueUrl,
				Entries: [
					...batch.map((item) => ({
						Id: String(item.index),
						MessageBody: JSON.stringify(item.message),
					})),
				],
			});
			const result = await client.send(command);

			if (result.Successful && result.Successful.length > 0 && onBatchSuccess) {
				const successfulMessages = result.Successful.map(
					(res) => batch.find((item) => item.index === res.Id)?.message,
				).filter(Boolean) as TTranscodeMessage[];
				
				if (successfulMessages.length > 0) {
					await onBatchSuccess(successfulMessages);
				}
			}

			if (result.Failed) {
				for (const failedMessageRes of result.Failed) {
					const retryCnt = retryMap.get(failedMessageRes.Id as string) || 0;
					const failedMessage = batch.find(
						(item) => item.index === failedMessageRes.Id,
					);
					if (!failedMessage) {
						console.error(
							"Received invalid Id in the failed response from sqs batch send request",
							failedMessageRes,
						);
						continue;
					}
					if (retryCnt < maxRetries) {
						retryMap.set(failedMessage.index, retryCnt + 1);
						pending.push(failedMessage);
					} else {
						permanentlyFailed.push(failedMessage);
					}
				}
			}
		} catch (err) {
			// Entire batch request failed.
			console.error("Entire batch message failed to send", err);
			for (const failedMessage of batch) {
				const retryCnt = retryMap.get(failedMessage.index) || 0;
				if (retryCnt < maxRetries) {
					retryMap.set(failedMessage.index, retryCnt + 1);
					pending.push(failedMessage);
				} else {
					permanentlyFailed.push(failedMessage);
				}
			}
		}
	}

	while (cursor < pending.length) {
		const workers = Array.from(
			{
				length: Math.min(
					concurrency,
					Math.ceil((pending.length - cursor) / batchSize),
				),
			},
			(_, idx) => {
				const offset = idx * batchSize;
				const start = cursor + offset;
				return worker(start);
			},
		);

		await Promise.all(workers);
		cursor += concurrency * batchSize;
	}

	return {
		failedCount: permanentlyFailed.length,
		failed: permanentlyFailed,
	};
}
