import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { Config } from "../../config/index.ts";
import type { ScriptSection } from "../../types/index.ts";
import { createLogger, withRetry } from "../../utils/index.ts";

const logger = createLogger("publisher:youtube:tts");

interface AudioSegment {
  readonly sectionIndex: number;
  readonly heading: string;
  readonly audioBuffer: Buffer;
  readonly durationEstimate: number;
}

function createElevenLabsClient(config: Config): ElevenLabsClient {
  return new ElevenLabsClient({
    apiKey: config.elevenlabs.apiKey,
  });
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  return Buffer.concat(chunks);
}

async function generateSectionAudio(
  client: ElevenLabsClient,
  config: Config,
  section: ScriptSection,
  sectionIndex: number,
): Promise<AudioSegment> {
  logger.info(`Generating TTS for section ${sectionIndex}: ${section.heading}`);

  const audioStream = await withRetry(
    async () => {
      const result = await client.textToSpeech.convert(config.elevenlabs.voiceId, {
        text: section.narration,
        modelId: config.elevenlabs.model,
        outputFormat: "mp3_44100_128",
      });
      return result;
    },
    `tts:section-${sectionIndex}`,
    { maxRetries: 2, delayMs: 5000 },
  );

  const audioBuffer = await streamToBuffer(audioStream as unknown as ReadableStream<Uint8Array>);

  logger.info(`TTS generated for section ${sectionIndex}: ${audioBuffer.length} bytes`);

  return {
    sectionIndex,
    heading: section.heading,
    audioBuffer,
    durationEstimate: section.durationSeconds,
  };
}

export async function generateAllAudio(
  config: Config,
  sections: readonly ScriptSection[],
): Promise<readonly AudioSegment[]> {
  logger.info(`Generating TTS audio for ${sections.length} sections`);

  const client = createElevenLabsClient(config);
  const segments: AudioSegment[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section) continue;

    const segment = await generateSectionAudio(client, config, section, i);
    segments.push(segment);

    if (i < sections.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  logger.info(`All TTS audio generated: ${segments.length} segments`);
  return segments;
}

export type { AudioSegment };
