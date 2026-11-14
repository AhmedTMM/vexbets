// The band's microphone as an AudioSource for the OpenAI engine (@vexbets/vexo/openai-stt):
// the kit's BandAudio decodes the band's Opus packets to Float32 PCM at 24 kHz.

import type { AudioSource } from "@vexbets/vexo/openai-stt";

type Band = import("@/vendor/vexo-open/index.js").Band;
type AudioEvent = import("@/vendor/vexo-open/index.js").AudioEvent;

export const STT_RATE = 24_000;

export function bandAudioSource(band: Band, onStatus: (s: string) => void = () => {}): AudioSource {
  let sound: InstanceType<typeof import("@/vendor/vexo-open/index.js").BandAudio> | null = null;
  const onAudio = (a: AudioEvent) => sound?.push(a);
  const onReconnected = () => {
    sound?.restart();
    onStatus("Band link back.");
  };
  return {
    async start(onSamples) {
      const { BandAudio, canDecodeAudio } = await import("@/vendor/vexo-open/index.js");
      if (!(await canDecodeAudio()))
        throw new Error("This browser cannot decode the band's audio: use Chrome or Edge");
      sound = new BandAudio((samples, info) => onSamples(samples, info.rate), {
        rate: STT_RATE,
        onError: (e) => onStatus(`Audio decoder: ${String(e)}`),
      });
      band.on("audio", onAudio);
      band.on("reconnected", onReconnected);
      await band.configure({ audio: true }); // solid blue light: microphone on
    },
    async stop() {
      band.off("audio", onAudio);
      band.off("reconnected", onReconnected);
      await band.configure({ audio: false }).catch(() => {});
      sound?.close();
      sound = null;
    },
  };
}
