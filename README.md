# OpenStream

OpenStream is a lightweight desktop livestreaming app for sending a selected screen or window to an RTMP/RTMPS destination like Youtube Live.

<img src="public/demo.gif" alt="OpenStream demo" width="100%">

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

## Installation

Download the latest installer for your platform from the [GitHub Releases page](https://github.com/marcusschiesser/openstream/releases).

## Contributing

Contributions are welcome - please include screenshots or a short video for any UI change or new user-facing feature. If it touches what users see or do, show it. Skip only when it genuinely doesn't apply. PRs that don't follow this will be closed.

## Permissions

OpenStream needs screen capture permission to detect and stream screens or windows. Microphone and camera permissions are required only when those inputs are enabled.

## License

MIT
