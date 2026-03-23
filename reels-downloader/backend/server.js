const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const TEMP_DIR = path.join(__dirname, "temp");

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

app.use(express.json());
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isInstagram(url) {
  return /instagram\.com\/(reel|reels|p|tv)\//i.test(url);
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9_\-\s]/gi, "_").substring(0, 80);
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    exec(
      `yt-dlp ${args}`,
      { maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout.trim());
      }
    );
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
        if (!err && now - stat.mtimeMs > 10 * 60 * 1000) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}
setInterval(cleanupTemp, 5 * 60 * 1000);

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "ReelSave Instagram Downloader API 📸" });
});

// GET video info
app.post("/api/info", async (req, res) => {
  const { url } = req.body;

  if (!url) return res.status(400).json({ error: "URL is required" });

  if (!isInstagram(url)) {
    return res.status(400).json({
      error: "Only Instagram Reels and video links are supported",
    });
  }

  try {
    const jsonStr = await runYtDlp(
      `--dump-json --no-playlist --no-warnings "${url}"`
    );
    const info = JSON.parse(jsonStr);

    res.json({
      platform: "instagram",
      title: info.title || "Instagram Video",
      thumbnail: info.thumbnail || null,
      duration: info.duration || null,
      uploader: info.uploader || info.channel || null,
    });
  } catch (err) {
    console.error("Info error:", err.message);
    res.status(500).json({
      error:
        "Failed to fetch video info. Make sure the link is valid and the account is public.",
    });
  }
});

// Download and stream video
app.get("/api/download", async (req, res) => {
  const { url, quality } = req.query;

  if (!url) return res.status(400).json({ error: "URL is required" });

  if (!isInstagram(url)) {
    return res.status(400).json({ error: "Only Instagram links are supported" });
  }

  const filename = `ig_${Date.now()}.mp4`;
  const outputPath = path.join(TEMP_DIR, filename);

  const formatSelector =
    quality === "best"
      ? "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
      : "best[ext=mp4]/best";

  try {
    let title = "instagram_video";
    try {
      const jsonStr = await runYtDlp(`--dump-json --no-warnings "${url}"`);
      const info = JSON.parse(jsonStr);
      title = sanitizeFilename(info.title || "instagram_video");
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
    readStream.on("close", () => fs.unlink(outputPath, () => {}));
  } catch (err) {
    console.error("Download error:", err.message);
    if (fs.existsSync(outputPath)) fs.unlink(outputPath, () => {});
    res.status(500).json({
      error: "Download failed. The video may be from a private account.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ ReelSave Instagram API running on port ${PORT}`);
});
