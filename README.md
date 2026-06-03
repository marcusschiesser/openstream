# OpenStream

OpenStream is a lightweight desktop livestreaming app for sending a selected screen or window to an RTMP/RTMPS destination.

<video src="public/demo.mp4" controls width="100%"></video>

## Features

- Pick a screen or window as the live source.
- Stream to RTMP/RTMPS endpoints with a stream key.
- Include system audio, microphone audio, and webcam video.
- Choose 16:9, 9:16, or 1:1 output presets.
- Arrange webcam layouts before going live.
- Runs as a compact floating Electron HUD.

## Development

```sh
npm install
npm run dev
```

## Build

```sh
npm run build-vite
npm run build
```

Platform-specific packaged builds:

```sh
npm run build:mac
npm run build:win
npm run build:linux
```

## Permissions

OpenStream needs screen capture permission to detect and stream screens or windows. Microphone and camera permissions are required only when those inputs are enabled.

## License

MIT
