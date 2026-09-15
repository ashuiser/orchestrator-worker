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

export type TChunkTranscodeMessage = {
	type: "CHUNK";
	mediaId: string;
	chunkIdx: number;
	start: number;
	end: number;
	res: number;
	videoCodec: string;
};
export type TInitTranscodeMessage = {
	type: "INIT";
	mediaId: string;
	res: number;
	videoCodec: string;
};
export type TTranscodeMessage = TInitTranscodeMessage | TChunkTranscodeMessage;
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
	status: "UPLOADING" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
	height: number;
	width: number;
	duration: number;
	ownerId: number;
};
