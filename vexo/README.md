# vexo

The band side: Vexo band microphone → live speech-to-text → backend ingest.

```
band (Web Bluetooth) or pretend band
  -> kit's BandAudio: Opus -> Float32 PCM at 24 kHz        src/band-source.ts
  -> segmenter: where each spoken line ends                src/segmenter.ts
  -> OpenAI Realtime (gpt-live-transcribe) over WebSocket  src/openai-stt.ts
       append PCM16 every 100 ms, commit at each line end, keep .completed text
  -> contract createListener: batch, appendSegments, retry -> backend
```

The kit's browser library is vendored in `kit/` (see `kit/README.md`) so this builds without
the kit checked out. `public/sample-speech.opus` is the kit's recording for the pretend band.

## Run it

    npm run dev -w backend   # backend on :3001 (OPENAI_API_KEY in backend/.env.local)
    npm run dev -w vexo      # listen page on http://localhost:5173 (proxies /api)

Open the page in **Chrome or Edge**, enter your band number, your email and who wears the
band, tick consent, press Start. Double-tap the band first so it shows up in the chooser.
Tick **Pretend band** to test with no band: it plays a recording of someone reading aloud.
Point it at a deployed backend with the Backend field (`BACKEND_URL=... npm run dev` for
the proxy), or open the page with `?band=<n>&pretend=1`.

The backend decides the STT provider: with `OPENAI_API_KEY` it mints a short-lived
OpenAI client secret (the key never reaches the browser); without one it hands out `fake`
tokens and the page plays a scripted conversation.

## Test

    npm test -w vexo   # segmenter, PCM16 encoding, turn ordering

Notes: the live model gives no speaker labels or confidence, so segments carry
`speaker: null` and `confidence: 0.9`. It also has no server VAD, which is why the page
decides where lines end.
