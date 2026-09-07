import {
	ReceiveMessageCommand,
	type ReceiveMessageCommandInput,
	SQSClient,
} from "@aws-sdk/client-sqs";
import "dotenv/config";
import { eq } from "drizzle-orm";
import { env } from "./config/env.js";
import redisClient from "./config/redis.js";
import { db } from "./db/index.js";
import { mediaTable } from "./db/schema.js";
import type {
	TMediaType,
	// TReceivedMessageBody,
	TTranscodeMessage,
} from "./types/messageTypes.js";
import { getKeyframes, selectKeyframes } from "./utils/ffprobe.js";
import { getPresignedUrl } from "./utils/getPresignedUrl.js";
import {
	deleteMessage,
	keepVisibilityTimeout,
	sendBatchMessage,
	sendSingleMessage,
} from "./utils/queueUtils.js";

const client = new SQSClient({ region: env.AWS_REGION });

const receiveCommandInput: ReceiveMessageCommandInput = {
	QueueUrl: env.ORCHESTRATOR_QUEUE_URL,
	MaxNumberOfMessages: 1,
	// Using default visibility timeout (1 min) and wait time (20 sec)
};

const receiveCommand = new ReceiveMessageCommand(receiveCommandInput);

const videoCodecs = ["av1", "h264"];

function getTranscodeTiers(width: number, height: number) {
	const tiers = [360, 480, 720, 1080, 1440, 2160];

	const smallestSide = Math.min(width, height);

	const transcodeTiers = tiers.filter((tier) => tier <= smallestSide);

	return transcodeTiers;
}

async function main() {
	const response = await client.send(receiveCommand);
	console.log("Response: ", response);
	const message = response.Messages ? response.Messages[0] : null;

	if (!message) {
		console.log("No message found.");
		return;
	}

	const stopVisibilityTimer = keepVisibilityTimeout(
		env.ORCHESTRATOR_QUEUE_URL,
		message.ReceiptHandle as string,
	);

	// const parsedBody = message.Body
	// 	? (JSON.parse(message.Body) as TReceivedMessageBody)
	// 	: null;

	// if (!parsedBody) return;

	// const { event, mediaId } = parsedBody;

	// if (event !== "media.uploaded") {
	// 	console.log("Invalid event: ", event);
	// 	return;
	// }

	const mediaId = message.Body;

	if (!mediaId) {
		console.error("Invalid event (No mediaId received): ", message.Body);
		return;
	}

	console.log("Querying db for the mediaId.");

	const mediaCacheKey = `fotto:cache:media:${mediaId}`;
	const cachedMedia = await redisClient.get(mediaCacheKey);

	let media: TMediaType | undefined;
	if (cachedMedia) {
		media = JSON.parse(cachedMedia);
		console.log("Retrieved media from cache.");
	} else {
		[media] = await db
			.select({
				fileType: mediaTable.file_type,
				srcKey: mediaTable.src_key,
				thumbKey: mediaTable.thumb_key,
				status: mediaTable.status,
				height: mediaTable.height,
				width: mediaTable.width,
				duration: mediaTable.duration,
			})
			.from(mediaTable)
			.where(eq(mediaTable.id, mediaId));

		if (media) {
			await redisClient.set(mediaCacheKey, JSON.stringify(media), { EX: 7200 }); // 2 hours
		}
	}

	if (!media) {
		console.error("mediaId not found.");
		return;
	}

	const { fileType, status, srcKey, thumbKey, height, width, duration } = media;

	console.log("Creating thumnail job.");

	try {
		if (thumbKey === null) {
			const thumbJobKey = `fotto:job:thumbnail:${mediaId}`;
			const isThumbPushed = await redisClient.get(thumbJobKey);

			if (!isThumbPushed) {
				await sendSingleMessage(env.THUMBNAIL_QUEUE_URL, {
					event: "media.uploaded",
					mediaId,
				});
				await redisClient.set(thumbJobKey, "pushed", { EX: 345600 }); // 4 days TTL

				console.log("Thumnail job created.");
			} else {
				console.log("Thumbnail job already created.");
			}
		}
	} catch (error) {
		console.log("Error: ", error);
		return;
	}

	if (fileType.startsWith("video/") && status !== "READY") {
		console.log("Media is a video type checking keyframes.");

		const keyframesCacheKey = `fotto:cache:keyframes:${mediaId}`;
		const cachedKeyframes = await redisClient.get(keyframesCacheKey);

		let selectedKeyframes: number[];

		if (cachedKeyframes) {
			selectedKeyframes = JSON.parse(cachedKeyframes);
			console.log("Retrieved selected keyframes from cache.");
		} else {
			const srcPresignedUrl = await getPresignedUrl(srcKey);
			console.log("Created presignedUrl for getting the media.");

			const keyframes = await getKeyframes(srcPresignedUrl);
			console.log("Keyframes count: ", keyframes.length);

			selectedKeyframes = selectKeyframes(keyframes, env.MIN_INTERVAL);
			console.log("Selected Keyframes count: ", selectedKeyframes.length);

			await redisClient.set(
				keyframesCacheKey,
				JSON.stringify(selectedKeyframes),
				{ EX: 7200 },
			); // 2 hours
		}

		if (selectedKeyframes.length > env.MAX_CHUNKS_ALLOWED) {
			console.error("Video is too heavy to process.");
			return;
		}

		console.log("Got keyframes. Creating video processing job.");

		const transcodeTiers = getTranscodeTiers(width, height);

		console.log("Transcode Tiers: ", transcodeTiers);

		for (const codec of videoCodecs) {
			console.log("Processing for codec: ", codec);
			for (const tier of transcodeTiers) {
				console.log("Processing for tier: ", tier);
				const messages: TTranscodeMessage[] = [];
				for (let i = 0; i < selectedKeyframes.length - 1; i++) {
					messages.push({
						mediaId: mediaId,
						start: selectedKeyframes[i] as number,
						end: selectedKeyframes[i + 1] as number,
						res: tier, // smallest side dimension
						videoCodec: codec,
					});
				}

				const lastKeyFrame = selectedKeyframes[
					selectedKeyframes.length - 1
				] as number;

				if (lastKeyFrame + env.MIN_INTERVAL < duration) {
					(messages[messages.length - 1] as TTranscodeMessage).end = duration;
				} else {
					messages.push({
						mediaId: mediaId,
						start: lastKeyFrame,
						end: duration,
						res: tier,
						videoCodec: codec,
					});
				}

				const failed = await sendBatchMessage(
					env.TRANSCODER_QUEUE_URL,
					messages,
					10, // messages per batch
					5, // batch concurrency
					3, // maxRetries
					async (batch) => {
						const keys = batch.map(
							(m) =>
								`fotto:job:transcode:${m.mediaId}:${m.videoCodec}:${m.res}:${m.start}:${m.end}`,
						);
						const existing = await redisClient.mGet(keys);
						return batch.filter((_, idx) => !existing[idx]);
					},
					async (successfulMessages) => {
						if (successfulMessages.length === 0) return;
						const pipeline = redisClient.multi();
						for (const m of successfulMessages) {
							const key = `fotto:job:transcode:${m.mediaId}:${m.videoCodec}:${m.res}:${m.start}:${m.end}`;
							pipeline.set(key, "pushed", { EX: 345600 });
						}
						await pipeline.exec();
					},
				);

				if (failed.failedCount > 0) {
					console.error(
						`Failed to send ${failed.failedCount} messages for mediaId ${mediaId} for codec ${codec} and resolution ${tier}: `,
						failed.failed,
					);
				}
			}
		}

		console.log("Video processing job completed.");
	}

	console.log("Deleting message from queue.");
	await deleteMessage(
		env.ORCHESTRATOR_QUEUE_URL,
		message.ReceiptHandle as string,
	);
	stopVisibilityTimer();
	console.log("All jobs created. Listening for new messages.");
}

try {
	await redisClient.connect();
	console.log("Redis client connected");
} catch (error) {
	console.log("Redis client connection error", error);
	process.exit(1);
}

while (true) {
	await main();
}
