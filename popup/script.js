import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

let ffmpeg = null;

// Default settings
const DEFAULTS = {
  format: "gif",
  colors: "256",
  dither: "sierra2_4a",
  statsMode: "full",
  fps: "auto",
  scale: "1",
  autoDownload: true,
};

let settings = { ...DEFAULTS };

// --- Settings persistence ---

async function loadSettings() {
  try {
    const result = await browser.storage.local.get("settings");
    if (result.settings) {
      settings = { ...DEFAULTS, ...result.settings };
    }
  } catch (e) {
    console.warn("Could not load settings, using defaults:", e);
  }
  applySettingsToUI();
}

async function saveSettings() {
  readSettingsFromUI();
  try {
    await browser.storage.local.set({ settings });
  } catch (e) {
    console.warn("Could not save settings:", e);
  }
}

function applySettingsToUI() {
  document.querySelector("#setting-format").value = settings.format;
  document.querySelector("#setting-colors").value = settings.colors;
  document.querySelector("#setting-dither").value = settings.dither;
  document.querySelector("#setting-stats-mode").value = settings.statsMode;
  document.querySelector("#setting-fps").value = settings.fps;
  document.querySelector("#setting-scale").value = settings.scale;
  document.querySelector("#setting-auto-download").checked =
    settings.autoDownload;
}

function readSettingsFromUI() {
  settings.format = document.querySelector("#setting-format").value;
  settings.colors = document.querySelector("#setting-colors").value;
  settings.dither = document.querySelector("#setting-dither").value;
  settings.statsMode = document.querySelector("#setting-stats-mode").value;
  settings.fps = document.querySelector("#setting-fps").value;
  settings.scale = document.querySelector("#setting-scale").value;
  settings.autoDownload = document.querySelector(
    "#setting-auto-download",
  ).checked;
}

// --- UI helpers ---

function showStatus(message) {
  document.querySelector("#popup-content").classList.add("hidden");
  document.querySelector("#settings-content").classList.add("hidden");
  document.querySelector("#error-content").classList.add("hidden");
  document.querySelector("#download-content").classList.add("hidden");
  document.querySelector("#status-content").classList.remove("hidden");
  document.querySelector("#status-text").textContent = message;
}

function showError(message) {
  document.querySelector("#popup-content").classList.add("hidden");
  document.querySelector("#settings-content").classList.add("hidden");
  document.querySelector("#status-content").classList.add("hidden");
  document.querySelector("#download-content").classList.add("hidden");
  document.querySelector("#error-content").classList.remove("hidden");
  document.querySelector("#error-content p").textContent = message;
}

function showDownload(blobUrl, filename) {
  document.querySelector("#status-content").classList.add("hidden");
  document.querySelector("#download-content").classList.remove("hidden");
  const link = document.querySelector("#download-link");
  link.href = blobUrl;
  link.download = filename;
  link.textContent = `Download ${filename}`;
}

// --- FFmpeg ---

async function loadFFmpeg() {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  showStatus("Loading FFmpeg...");
  ffmpeg = new FFmpeg();

  ffmpeg.on("progress", ({ progress }) => {
    const pct = Math.round(progress * 100);
    showStatus(`Converting: ${pct}%`);
  });

  ffmpeg.on("log", ({ message }) => {
    console.log("[ffmpeg]", message);
  });

  const coreURL = await toBlobURL(
    browser.runtime.getURL("ffmpeg/ffmpeg-core.js"),
    "text/javascript",
  );
  const wasmURL = await toBlobURL(
    browser.runtime.getURL("ffmpeg/ffmpeg-core.wasm"),
    "application/wasm",
  );

  await ffmpeg.load({ coreURL, wasmURL });

  return ffmpeg;
}

async function detectFps(ff) {
  let logOutput = "";
  const logHandler = ({ message }) => {
    logOutput += message + "\n";
  };
  ff.on("log", logHandler);

  await ff.exec(["-i", "input.mp4"]).catch(() => {});

  ff.off("log", logHandler);

  const fpsMatch = logOutput.match(/(\d+(?:\.\d+)?)\s*fps/);
  if (fpsMatch) {
    const fps = parseFloat(fpsMatch[1]);
    console.log(`Detected input FPS: ${fps}`);
    return fps;
  }

  const tbrMatch = logOutput.match(/(\d+(?:\.\d+)?)\s*tbr/);
  if (tbrMatch) {
    const fps = parseFloat(tbrMatch[1]);
    console.log(`Detected input TBR as FPS: ${fps}`);
    return fps;
  }

  console.log("Could not detect FPS, falling back to 30");
  return 30;
}

function buildOutputFilename() {
  const ext =
    { gif: "gif", webp: "webp", apng: "png" }[settings.format] || "gif";
  return `video.${ext}`;
}

async function convertToGif(videoUrl) {
  try {
    // Snapshot current settings at conversion start
    const opts = { ...settings };

    const ff = await loadFFmpeg();

    showStatus("Downloading video...");
    const videoData = await fetchFile(videoUrl);

    showStatus("Writing video to FFmpeg...");
    await ff.writeFile("input.mp4", videoData);

    // Detect FPS
    showStatus("Detecting frame rate...");
    let fps;
    if (opts.fps === "auto") {
      fps = await detectFps(ff);
    } else {
      fps = parseInt(opts.fps, 10);
    }

    // Build filter chain
    const filters = [];
    filters.push(`fps=${fps}`);

    if (opts.scale !== "1") {
      const s = parseFloat(opts.scale);
      filters.push(`scale=iw*${s}:ih*${s}:flags=lanczos`);
    }

    const filterChain = filters.join(",");

    const outputFile =
      "output." +
      ({ gif: "gif", webp: "webp", apng: "apng" }[opts.format] || "gif");
    const mimeType =
      { gif: "image/gif", webp: "image/webp", apng: "image/png" }[
        opts.format
      ] || "image/gif";

    if (opts.format === "gif") {
      // Two-pass palette approach for GIF
      const maxColors = parseInt(opts.colors, 10);
      const statsMode = opts.statsMode;
      const dither = opts.dither;

      showStatus("Generating palette...");
      await ff.exec([
        "-i",
        "input.mp4",
        "-vf",
        `${filterChain},palettegen=max_colors=${maxColors}:stats_mode=${statsMode}`,
        "-y",
        "palette.png",
      ]);

      showStatus("Converting to GIF...");
      const ditherOpt =
        dither === "none" ? "paletteuse" : `paletteuse=dither=${dither}`;
      await ff.exec([
        "-i",
        "input.mp4",
        "-i",
        "palette.png",
        "-lavfi",
        `${filterChain} [x]; [x][1:v] ${ditherOpt}`,
        "-f",
        "gif",
        "-y",
        outputFile,
      ]);

      await ff.deleteFile("palette.png");
    } else if (opts.format === "webp") {
      showStatus("Converting to WebP...");
      await ff.exec([
        "-i",
        "input.mp4",
        "-vf",
        filterChain,
        "-vcodec",
        "libwebp",
        "-lossless",
        "0",
        "-quality",
        "90",
        "-loop",
        "0",
        "-y",
        outputFile,
      ]);
    } else if (opts.format === "apng") {
      showStatus("Converting to APNG...");
      await ff.exec([
        "-i",
        "input.mp4",
        "-vf",
        filterChain,
        "-plays",
        "0",
        "-f",
        "apng",
        "-y",
        outputFile,
      ]);
    }

    showStatus("Reading output...");
    const outData = await ff.readFile(outputFile);
    const blob = new Blob([outData], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    // Clean up
    await ff.deleteFile("input.mp4");
    await ff.deleteFile(outputFile);

    const filename = buildOutputFilename();
    showDownload(blobUrl, filename);

    if (opts.autoDownload) {
      browser.downloads
        .download({
          url: blobUrl,
          filename: filename,
          saveAs: false,
        })
        .then(() => {
          console.log("Auto-download triggered");
        })
        .catch((err) => {
          console.warn("Auto-download failed, user can click manually:", err);
        });
    }
  } catch (error) {
    console.error("Conversion failed:", error);
    showError(`Conversion failed: ${error.message}`);
  }
}

function generate(tabs) {
  console.log("Sending generate message to content script");
  browser.tabs
    .sendMessage(tabs[0].id, {
      command: "generate",
    })
    .then((response) => {
      console.log("Response from content script:", response);
      if (response && response.success && response.videoUrl) {
        convertToGif(response.videoUrl);
      } else if (response && !response.success) {
        showError(response.error || "Unknown error");
      }
    })
    .catch((error) => {
      console.error("Error sending message:", error);
      showError("Failed to communicate with page content");
    });
}

function handleError(error) {
  console.error("Query tabs error:", error);
  showError("Could not access current tab");
}

// --- Initialize ---

console.log("Initializing x-gif-dl popup");

loadSettings();

document.addEventListener("click", (e) => {
  if (e.target.id === "generate-btn") {
    e.preventDefault();
    console.log("Generate button clicked");
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then(generate)
      .catch(handleError);
  }

  if (e.target.id === "settings-btn") {
    document.querySelector("#popup-content").classList.add("hidden");
    document.querySelector("#settings-content").classList.remove("hidden");
  }

  if (e.target.id === "settings-back-btn") {
    document.querySelector("#settings-content").classList.add("hidden");
    document.querySelector("#popup-content").classList.remove("hidden");
  }
});

// Save settings immediately on any change
document.querySelector("#settings-content").addEventListener("change", () => {
  saveSettings();
});
