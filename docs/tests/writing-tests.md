# Writing Tests

This project uses [Vitest](https://vitest.dev/) for both unit/integration tests and browser tests. There are two separate configs — each targets a different set of files.

## Unit tests

**Config:** `vitest.config.ts`  
**Runs in:** jsdom (simulated DOM, no real browser)  
**File pattern:** `src/**/*.test.ts` — anything that does **not** end in `.browser.test.ts`  
**CI command:** `npm run test`

Use unit tests for pure logic, utility functions, data transformations, and anything that doesn't need real browser APIs (Canvas, WebCodecs, MediaRecorder, etc.).

### File placement

Co-locate the test file next to the source file, or put it in a `__tests__/` folder in the same directory.

```
src/lib/compositeLayout.ts
src/lib/compositeLayout.test.ts        # co-located

src/lib/liveStream.test.ts                 # co-located
```

### Example

```ts
import { describe, expect, it } from "vitest";
import { computeCompositeLayout } from "./compositeLayout";

describe("computeCompositeLayout", () => {
  it("anchors the overlay in the lower-right corner", () => {
    const layout = computeCompositeLayout({
      canvasSize: { width: 1920, height: 1080 },
      screenSize: { width: 1920, height: 1080 },
      webcamSize: { width: 1280, height: 720 },
    });

    expect(layout).not.toBeNull();
    expect(layout!.webcamRect!.x).toBeGreaterThan(1920 / 2);
    expect(layout!.webcamRect!.y).toBeGreaterThan(1080 / 2);
  });
});
```

### Path aliases

The `@/` alias resolves to `src/`. Use it for imports that would otherwise need long relative paths.

```ts
import { SUPPORTED_LOCALES } from "@/i18n/config";
```

### Running locally

```bash
npm run test          # run once
npm run test:watch    # watch mode
```

---

## Browser tests

**Config:** `vitest.browser.config.ts`  
**Runs in:** real Chromium via Playwright (headless)  
**File pattern:** `src/**/*.browser.test.ts`  
**CI commands:** `npm run test:browser:install` then `npm run test:browser`

Use browser tests when the code under test depends on real browser APIs that jsdom doesn't implement, such as `MediaRecorder`, `OffscreenCanvas`, WebGL, or real media-device behavior.

### File placement

Name the file `<subject>.browser.test.ts` and place it next to the source file.

```
src/hooks/useLiveStreamer.ts
src/hooks/useLiveStreamer.browser.test.ts
```

### Example

```ts
import { describe, expect, it } from "vitest";
import { validateLiveStreamDestination } from "./liveStream";

describe("validateLiveStreamDestination", () => {
  it("accepts RTMPS destinations", () => {
    expect(
      validateLiveStreamDestination({
        serverUrl: "rtmps://example.com/live",
        streamKey: "abc123",
      }),
    ).toBeNull();
  });
});
```

For browser tests, mock Electron preload APIs before rendering UI that expects `window.electronAPI`.

```ts
beforeEach(() => {
  window.electronAPI = {
    getSelectedSource: async () => ({
      id: "screen:1:0",
      name: "Display 1",
      display_id: "1",
      thumbnail: null,
      appIcon: null,
    }),
  } as typeof window.electronAPI;
});
```

### Timeouts

Browser tests have a default timeout of 120 seconds per test and 30 seconds per hook (set in `vitest.browser.config.ts`). Keep media tests small and prefer mocked streams unless the browser API itself is under test.

### Running locally

First install the browser (one-time):

```bash
npm run test:browser:install
```

Then run the tests:

```bash
npm run test:browser
```

---

## Choosing the right type

| Situation | Use |
|---|---|
| Pure function / data transformation | Unit test |
| i18n key coverage | Unit test |
| React hook logic (no real browser APIs) | Unit test |
| `MediaRecorder` / device streams | Browser test |
| `OffscreenCanvas` / WebGL rendering | Browser test |
| Livestream setup UI with mocked Electron APIs | Unit or browser test |
