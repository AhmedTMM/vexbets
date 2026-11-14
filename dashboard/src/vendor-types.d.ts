// Types for the parts of the vendored Vexo Open kit (src/vendor/vexo-open, plain JS) that
// the dashboard uses. See docs/api.md in the kit for the full API.

declare module "@/vendor/vexo-open/index.js" {
  export interface AudioEvent {
    seq: number;
    opus: Uint8Array;
    time?: number;
  }
  export class Band {
    static connect(
      number: number | null,
      options?: { transport?: "ble" | "serial" | "sim"; autoReconnect?: boolean },
    ): Promise<Band>;
    readonly number: number | null;
    readonly name: string;
    on(event: "audio", handler: (a: AudioEvent) => void): void;
    on(event: "lost" | "reconnected" | "disconnect", handler: (e: unknown) => void): void;
    on(event: string, handler: (e: unknown) => void): void;
    off(event: string, handler: (e: never) => void): void;
    configure(settings: Record<string, unknown>): Promise<void>;
    disconnect(): Promise<void>;
  }
  export function bandName(n: number): string;
  /** Decodes the band's Opus packets to Float32 PCM at `rate` (Chrome / Edge). */
  export class BandAudio {
    constructor(
      onSamples: (samples: Float32Array, info: { rate: number; lost: number }) => void,
      options?: { rate?: number; onError?: (e: unknown) => void },
    );
    push(a: AudioEvent): void;
    restart(): void;
    close(): void;
  }
  export function canDecodeAudio(): Promise<boolean>;
}

declare module "@/vendor/vexo-open/deepgram.js" {
  export interface DeepgramText {
    final: boolean;
    text: string;
    end: number | null;
  }
  export interface DeepgramLink {
    start(callbacks: {
      onText: (t: DeepgramText) => void;
      onState?: (state: "listening" | "off") => void;
      onError?: (problem: string) => void;
    }): void;
    packet(opus: Uint8Array): void;
    restart(): void;
    stop(): void;
  }
  export function deepgramLink(options: { key: string; scheme?: "token" | "bearer" }): DeepgramLink;
}
