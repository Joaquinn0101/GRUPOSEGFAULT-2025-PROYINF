require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db");
const loans = require("./loans.routes");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// CORS para Vite dev y preview
app.use(cors({
    origin: [
        "http://localhost:5173", // Vite dev
        "http://localhost:4173"  // vite preview
    ]
}));

// Healthcheck (útil para verificar DB)
app.get("/health", async (_req, res) => {
    try { await pool.query("SELECT 1"); res.send("ok"); }
    catch { res.status(500).send("db-down"); }
});

// Rutas de negocio
app.use("/loans", loans);

// 404 + error handler
app.use((_req, res) => res.status(404).json({ error: "not_found" }));
app.use((err, _req, res, _next) => {
    console.error("Unhandled", err);
    res.status(500).json({ error: "internal_error" });
});

app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
});
