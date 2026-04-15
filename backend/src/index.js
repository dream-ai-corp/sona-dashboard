require("dotenv").config();
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;
const SONA_API = process.env.SONA_API_URL || "http://localhost:8080";

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => res.json({ ok: true, upstream: SONA_API }));

// Proxy all /api/* calls to Sona agent
app.use("/api", createProxyMiddleware({
  target: SONA_API,
  changeOrigin: true,
  pathRewrite: { "^\/api": "/api" },
}));

// Proxy /chat to Sona agent
app.use("/chat", createProxyMiddleware({
  target: SONA_API,
  changeOrigin: true,
}));

// Proxy /tool to Sona agent
app.use("/tool", createProxyMiddleware({
  target: SONA_API,
  changeOrigin: true,
}));

app.listen(PORT, () => console.log("Sona dashboard backend running on port " + PORT + " -> proxying to " + SONA_API));
