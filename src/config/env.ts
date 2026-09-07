import z from "zod";

export const reqEnvVarsSchema = z.object({
	DATABASE_URL: z.url(),
	REDIS_URL: z.url(),
	S3_REGION: z.string().default("auto"),
	S3_ENDPOINT: z.url(),
	S3_ACCESS_KEY_ID: z.string(),
	S3_SECRET_ACCESS_KEY: z.string(),
	UNSANITIZED_BUCKET_NAME: z.string(),
	ORCHESTRATOR_QUEUE_URL: z.url(),
	TRANSCODER_QUEUE_URL: z.url(),
	THUMBNAIL_QUEUE_URL: z.url(),
	AWS_REGION: z.string(),
	MAX_CHUNKS_ALLOWED: z.coerce.number().default(18000), // Allow max 10hrs of video with 2 sec keyframe interval.
	MIN_INTERVAL: z.coerce.number().default(60), // Minimum keyframe interval.
});

const envVars = reqEnvVarsSchema.safeParse(process.env);

if (!envVars.success) {
	console.error("Missing required environment variables:", envVars.error);
	process.exit(1);
}
export const env = envVars.data;
