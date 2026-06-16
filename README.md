# OpenStream

OpenStream is a lightweight desktop app for creating livestreams with one click. Streams can include
a selected screen or window, webcam video, microphone audio, and system audio. Supported
destinations are YouTube Live and custom RTMP/RTMPS endpoints.

<img src="public/demo.gif" alt="OpenStream demo" width="100%">

## Features

- Pick a screen or window as the live source.
- Stream to YouTube Live after Google sign-in.
- Stream to custom RTMP/RTMPS destinations with a server URL and stream key.
- Show and copy the YouTube watch URL as soon as the broadcast is created.
- Include system audio, microphone audio, and webcam video.
- Choose 16:9, 9:16, or 1:1 output presets.
- Position and size the webcam overlay before going live.
- Persist non-secret launch settings across restarts.
- Runs as a compact floating Electron HUD.

## Installation

Download the latest build for your platform from the
[GitHub Releases page](https://github.com/marcusschiesser/openstream/releases).

### macOS

Download the macOS DMG for your CPU architecture:

- Apple Silicon Macs: `Openscreen-Mac-arm64-*.dmg`
- Intel Macs: `Openscreen-Mac-x64-*.dmg`

Open the DMG and drag `OpenStream.app` into `/Applications`.

Current macOS release builds are ad-hoc signed and not notarized. After downloading from GitHub,
macOS Gatekeeper can show a message that the app is damaged or corrupt. Remove the download
quarantine attribute once after installing:

```sh
xattr -dr com.apple.quarantine /Applications/OpenStream.app
```

Then open OpenStream from `/Applications`.

### Windows and Linux

Download the Windows installer or Linux package from the GitHub release assets and install it with
the normal platform flow.

## Development

```sh
npm install
npm run dev
```

### YouTube Live setup

YouTube Live creation uses the YouTube Data API and Google OAuth for desktop apps. OpenStream
requires a Google OAuth desktop client ID and client secret at build time. Users still sign in with
their own Google account.

For local development, put the values in a local `.env` file. This file is ignored by git:

```sh
cp .env.example .env
# edit .env and set:
# YOUTUBE_CLIENT_ID="your-google-oauth-client-id"
# YOUTUBE_CLIENT_SECRET="your-google-oauth-client-secret"
npm run dev
```

Local production builds use the same `.env` file and embed the values into the Electron main bundle:

```sh
npm run build
```

## Contributing

Contributions are welcome - please include screenshots or a short video for any UI change or new user-facing feature. If it touches what users see or do, show it. Skip only when it genuinely doesn't apply. PRs that don't follow this will be closed.

## Permissions

OpenStream needs screen capture permission to detect and stream screens or windows. Microphone and camera permissions are required only when those inputs are enabled.

## License

MIT
