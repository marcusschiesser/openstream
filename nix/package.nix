{
  lib,
  buildNpmPackage,
  nodejs_22,
  electron,
  makeWrapper,
  makeDesktopItem,
  copyDesktopItems,
}:

buildNpmPackage {
  nodejs = nodejs_22;
  pname = "openstream";
  version = "1.0.0";

  src =
    let
      fs = lib.fileset;
      # gitTracked fails when source is already a store path (path: flake inputs).
      # Detect this and fall back to cleanSource which handles both cases.
      isStorePath = builtins.storeDir == builtins.substring 0 (builtins.stringLength builtins.storeDir) (toString ../.);
      baseFiles = if isStorePath then fs.fromSource (lib.cleanSource ../.) else fs.gitTracked ../.;
    in
    fs.toSource {
      root = ../.;
      fileset = fs.difference baseFiles (
        fs.unions [
          ../nix
          ../flake.nix
          ../flake.lock
          (fs.fileFilter (file: file.hasExt "md") ../.)
        ]
      );
    };

  npmDepsHash = "sha256-ivLnkDCmOyv+ZtKcfZkHxCycVMkEnU5+S7vW3q7KIV4=";

  env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";

  # electron-builder is not needed — we wrap system electron directly
  npmFlags = [ "--ignore-scripts" ];
  makeCacheWritable = true;

  # vite-plugin-electron compiles electron/ sources into dist-electron/
  # tsconfig has noEmit — tsc is type-check only
  buildPhase = ''
    runHook preBuild
    npx vite build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/lib/openstream"

    # Renderer build output (index.html, JS chunks, copied public/ assets)
    cp -r dist "$out/lib/openstream/"

    # Main process + preload (compiled by vite-plugin-electron)
    cp -r dist-electron "$out/lib/openstream/"

    # Package manifest (electron reads "main" field to find entry point)
    cp package.json "$out/lib/openstream/"

    # Strip devDependencies (electron, vitest, biome, playwright, etc.)
    npm prune --omit=dev --no-save
    cp -r node_modules "$out/lib/openstream/"

    # Wrap system electron with the app directory
    mkdir -p "$out/bin"
    makeWrapper "${electron}/bin/electron" "$out/bin/openstream" \
      --add-flags "$out/lib/openstream" \
      --set ELECTRON_IS_DEV 0

    # Install icons to hicolor theme
    for size in 16 24 32 48 64 128 256 512 1024; do
      icon="icons/icons/png/''${size}x''${size}.png"
      if [ -f "$icon" ]; then
        install -Dm644 "$icon" \
          "$out/share/icons/hicolor/''${size}x''${size}/apps/openstream.png"
      fi
    done

    runHook postInstall
  '';

  nativeBuildInputs = [
    makeWrapper
    copyDesktopItems
  ];

  desktopItems = [
    (makeDesktopItem {
      name = "openstream";
      desktopName = "OpenStream";
      genericName = "Livestreaming App";
      exec = "openstream %U";
      icon = "openstream";
      comment = "Desktop livestreaming app";
      categories = [
        "AudioVideo"
        "Video"
        "Recorder"
      ];
      startupWMClass = "OpenStream";
      terminal = false;
    })
  ];

  meta = {
    description = "Desktop livestreaming app";
    homepage = "https://github.com/siddharthvaddem/openstream";
    license = lib.licenses.mit;
    mainProgram = "openstream";
    platforms = lib.platforms.linux;
  };
}
