// The kit's browser library, vendored in vexo/kit (see kit/README.md).
import { Band, BandAudio, bandName, canDecodeAudio, oggPackets, SimTransport } from "../kit/js/index.js";
import type { AudioSource } from "./openai-stt";

export type { AudioSource };

/** 24 kHz mono: what OpenAI's realtime transcription takes. BandAudio resamples to it. */
export const STT_RATE = 24_000;

export interface BandConnection {
  name: string;
  audio: AudioSource;
  disconnect(): Promise<void>;
}

/** Loads the kit's 16 s sample of someone reading aloud, as Opus packets, for the pretend band. */
export async function samplePackets(url = "/sample-speech.opus"): Promise<Uint8Array[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url}: HTTP ${res.status}`);
  return oggPackets(new Uint8Array(await res.arrayBuffer()));
}

/**
 * Connect to the team's band by its number (from the band's bag), or to the pretend band.
 * Real: Chrome or Edge shows a chooser listing only Vexo-HACK-NN; double-tap the band first.
 * Pretend: `voice` packets play through its microphone, in a loop.
 */
export async function connectBand(opts: {
  number: number;
  pretend?: boolean;
  voice?: Uint8Array[];
  onStatus?: (s: string) => void;
}): Promise<BandConnection> {
  const status = opts.onStatus ?? (() => {});
  bandName(opts.number); // throws a clear error for a number the kit does not accept
  if (!(await canDecodeAudio())) {
    throw new Error("this browser cannot decode the band's audio: use Chrome or Edge, on localhost or https");
  }

  const transport = opts.pretend
    ? new SimTransport(opts.number, { audioPackets: opts.voice, autoTap: false })
    : "ble";
  const band = await Band.connect(opts.number, { transport, autoReconnect: true });
  status(`connected to ${band.name}${opts.pretend ? " (pretend band)" : ""}`);

  let sound: InstanceType<typeof BandAudio> | null = null;
  const onAudio = (a: { seq: number; opus: Uint8Array }) => sound?.push(a);
  const onReconnected = () => {
    sound?.restart();
    status("link back");
  };
  const onReconnecting = () => status("link lost, reconnecting...");

  const audio: AudioSource = {
    async start(onSamples) {
      sound = new BandAudio(
        (samples: Float32Array, info: { rate: number }) => onSamples(samples, info.rate),
        {
          rate: STT_RATE,
          onError: (e: unknown) => status(`audio decoder error: ${String(e)}`),
        },
      );
      band.on("audio", onAudio);
      band.on("reconnected", onReconnected);
      band.on("reconnecting", onReconnecting);
      await band.configure({ audio: true }); // the band's light goes solid blue: microphone on
      status("microphone on (solid blue light)");
    },
    async stop() {
      band.off("audio", onAudio);
      band.off("reconnected", onReconnected);
      band.off("reconnecting", onReconnecting);
      await band.configure({ audio: false }).catch(() => {});
      sound?.close();
      sound = null;
      status("microphone off");
    },
  };

  return {
    name: band.name ?? bandName(opts.number),
    audio,
    disconnect: () => band.disconnect(),
  };
}
