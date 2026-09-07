export const supportedImageType = [
	"image/jpeg",
	"image/jpg",
	"image/png",
	"image/gif",
	"image/webp",
] as const;

export const supportedVideoType = [
	"video/mp4",
	"video/mkv",
	"video/webm",
] as const;

export const supportedMediaTypes = [
	...supportedImageType,
	...supportedVideoType,
] as const;

export type TSupportedMediaTypes = (typeof supportedMediaTypes)[number];

// Receive only mediaId get rest data from db/cache
// export type TReceivedMessageBody = {
// 	event: string;
// 	mediaId: string;
// };

export type TTranscodeMessage = {
	mediaId: string;
	start: number;
	end: number;
	res: number;
	videoCodec: string | undefined;
};

export type TMediaType = {
	fileType:
		| "image/jpeg"
		| "image/jpg"
		| "image/png"
		| "image/gif"
		| "image/webp"
		| "video/mp4"
		| "video/mkv"
		| "video/webm";
	srcKey: string;
	thumbKey: string | null;
	status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
	height: number;
	width: number;
	duration: number;
};
