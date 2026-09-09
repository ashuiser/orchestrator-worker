import { spawn } from "node:child_process";

export function getKeyframes(inputVideoPath: string) {
	return new Promise<number[]>((resolve, reject) => {
		console.log("starting ffprobe analysis.");

		const ffprobe = spawn("ffprobe", [
			"-reconnect",
			"1",
			"-reconnect_streamed",
			"1",
			"-reconnect_delay_max",
			"5",
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-skip_frame",
			"nokey",
			"-show_entries",
			"frame=best_effort_timestamp_time",
			"-of",
			"csv=p=0",
			inputVideoPath,
		]);

		let buffer = "";
		let stderrOutput = "";
		const keyframes: number[] = [];

		ffprobe.stdout.on("data", (chunk) => {
			buffer += chunk.toString();

			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			for (const line of lines) {
				const timestamp = Number(line.trim());

				if (Number.isFinite(timestamp)) {
					keyframes.push(timestamp);
				}
			}
		});

		// log FFprobe errors
		ffprobe.stderr.on("data", (chunk) => {
			const text = chunk.toString();
			stderrOutput += text;
			console.error(text);
		});

		ffprobe.on("close", (code) => {
			const looksTruncated =
				/partial file|IO error|pull function|Error number -\d+/i.test(
					stderrOutput,
				);
			if (code !== 0 || looksTruncated) {
				reject(
					new Error(
						`ffprobe read was incomplete (code=${code}): ${stderrOutput || "no stderr"}`,
					),
				);
				return;
			}

			// Process final incomplete line
			if (buffer.trim()) {
				const timestamp = Number(buffer.trim());

				if (Number.isFinite(timestamp)) {
					keyframes.push(timestamp);
				}
			}

			resolve(keyframes);
		});

		ffprobe.on("error", reject);
	});
}

export function selectKeyframes(keyframes: number[], minInterval = 6) {
	const result = [0];
	let previous = 0;

	for (const timestamp of keyframes) {
		if (timestamp > previous + minInterval) {
			result.push(timestamp);
			previous = timestamp;
		}
	}

	return result;
}
