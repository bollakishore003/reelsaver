const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const app = express();
const PORT = process.env.PORT || 3000;
const TEMP_DIR = path.join(__dirname, "temp");

// Create temp directory if it doesn't exist
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(
  cors({
    origin: "*", // Restrict to your GitHub Pages URL in production
    methods: ["GET", "POST"],
  })
);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function detectPlatform(url) {
  if (/instagram\.com\/(reel|reels|p)\//i.test(url)) return "instagram";
  if (/youtube\.com\/shorts\//i.test(url)) return "youtube";
  if (/youtu\.be\//i.test(url)) return "youtube";
  if (/youtube\.com\/watch/i.test(url)) return "youtube";
  return null;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9_\-\s]/gi, "_").substring(0, 80);
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    exec(`yt-dlp ${args}`, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

// Cleanup temp files older than 10 minutes
function cleanupTemp() {
  const now = Date.now();
  fs.readdir(TEMP_DIR, (err, files) => {
    if (err) return;
    files.forEach((file) => {
      const filePath = path.join(TEMP_DIR, file);
      fs.stat(filePath, (err, stat) => {
        if (err) return;
        if (now - stat.mtimeMs > 10 * 60 * 1000) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}
setInterval(cleanupTemp, 5 * 60 * 1000);

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Reels Downloader API is running 🚀" });
});

// GET video info (title, thumbnail, duration)
app.post("/api/info", async (req, res) => {
  const { url } = req.body;

  if (!url) return res.status(400).json({ error: "URL is required" });

  const platform = detectPlatform(url);
  if (!platform) {
    return res.status(400).json({
      error: "Only Instagram Reels and YouTube Shorts/videos are supported",
    });
  }

  try {
    const jsonStr = await runYtDlp(
      `--dump-json --no-playlist --no-warnings "${url}"`
    );
    const info = JSON.parse(jsonStr);

    res.json({
      platform,
      title: info.title || "Video",
      thumbnail: info.thumbnail || null,
      duration: info.duration || null,
      uploader: info.uploader || info.channel || null,
      formats: (info.formats || [])
        .filter((f) => f.ext === "mp4" && f.vcodec !== "none")
        .map((f) => ({
          format_id: f.format_id,
          quality: f.format_note || f.height ? `${f.height}p` : "unknown",
          filesize: f.filesize || null,
        }))
        .slice(-3), // Top 3 quality options
    });
  } catch (err) {
    console.error("Info error:", err.message);
    res.status(500).json({ error: "Failed to fetch video info. Make sure the URL is valid and the video is public." });
  }
});

// Download video and stream it to client
app.get("/api/download", async (req, res) => {
  const { url, quality } = req.query;

  if (!url) return res.status(400).json({ error: "URL is required" });

  const platform = detectPlatform(url);
  if (!platform) {
    return res.status(400).json({ error: "Unsupported platform" });
  }

  const filename = `video_${Date.now()}.mp4`;
  const outputPath = path.join(TEMP_DIR, filename);

  // Format selector: best mp4 video+audio, max 1080p
  const formatSelector =
    quality === "best"
      ? "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
      : "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]/best";

  try {
    // Get title for Content-Disposition header
    let title = "video";
    try {
      const jsonStr = await runYtDlp(`--dump-json --no-warnings "${url}"`);
      const info = JSON.parse(jsonStr);
      title = sanitizeFilename(info.title || "video");
    } catch (_) {}

    console.log(`Downloading: ${url}`);
    await runYtDlp(
      `-f "${formatSelector}" --merge-output-format mp4 -o "${outputPath}" --no-playlist --no-warnings "${url}"`
    );

    if (!fs.existsSync(outputPath)) {
      return res.status(500).json({ error: "Download failed" });
    }

    const stat = fs.statSync(outputPath);
    res.setHeader("Content-Disposition", `attachment; filename="${title}.mp4"`);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", stat.size);

    const readStream = fs.createReadStream(outputPath);
    readStream.pipe(res);

    readStream.on("close", () => {
      fs.unlink(outputPath, () => {});
    });
  } catch (err) {
    console.error("Download error:", err.message);
    if (fs.existsSync(outputPath)) fs.unlink(outputPath, () => {});
    res.status(500).json({ error: "Download failed. The video may be private or geo-restricted." });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Reels Downloader API running on port ${PORT}`);
});
