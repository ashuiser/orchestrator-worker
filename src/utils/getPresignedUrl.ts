import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

const s3 = new S3Client({
	region: env.S3_REGION,
	endpoint: env.S3_ENDPOINT,
	credentials: {
		accessKeyId: env.S3_ACCESS_KEY_ID,
		secretAccessKey: env.S3_SECRET_ACCESS_KEY,
	},
});

export async function getPresignedUrl(srcKey: string) {
	const getUrl = await getSignedUrl(
		s3,
		new GetObjectCommand({ Bucket: env.UNSANITIZED_BUCKET_NAME, Key: srcKey }),
		{ expiresIn: 3600 }, // Valid for 1 hour
	);
	return getUrl;
}
