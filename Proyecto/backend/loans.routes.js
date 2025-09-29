const express = require("express");
const pool = require("./db");
const { z } = require("zod");

const router = express.Router();

// Crea la tabla si no existe
async function ensureTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS loan_requests (
                                                     id SERIAL PRIMARY KEY,
                                                     rut VARCHAR(12) NOT NULL,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL,
            amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
            term_months INT NOT NULL CHECK (term_months > 0),
            income NUMERIC(14,2),
            status VARCHAR(20) NOT NULL DEFAULT 'pendiente', -- pendiente|inadmisible|rechazada|aprobada
            scoring INT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        CREATE INDEX IF NOT EXISTS idx_loan_requests_status ON loan_requests(status);
    `);
}

// Validación del payload (el front ya manda números)
const ApplySchema = z.object({
    rut: z.string().min(3),
    full_name: z.string().min(3),
    email: z.string().email(),
    amount: z.number().positive(),
    term_months: z.number().int().positive(),
    income: z.number().positive().optional()
});

// Reglas mock: admisibilidad + score
function isAdmissible({ income = 0, amount }) {
    if (!income) return false;
    return amount <= income * 20;
}

function computeScore({ income = 0, amount, term_months }) {
    const term = term_months || 24;
    const base = 60 + income / (amount / term);
    const s = Math.round(Math.max(1, Math.min(100, base))); // [1,100]
    return s;
}

// POST /loans/apply
router.post("/apply", async (req, res) => {
    try {
        await ensureTables();

        const parsed = ApplySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
        }
        const payload = parsed.data;

        // Registrar solicitud en estado pendiente
        const { rows } = await pool.query(
            `INSERT INTO loan_requests (rut, full_name, email, amount, term_months, income, status)
             VALUES ($1,$2,$3,$4,$5,$6,'pendiente') RETURNING *`,
            [payload.rut, payload.full_name, payload.email, payload.amount, payload.term_months, payload.income ?? null]
        );
        const reqRow = rows[0];

        // Decisión: admisibilidad + scoring
        let status = "inadmisible";
        let scoring = null;

        if (isAdmissible(payload)) {
            scoring = computeScore(payload);
            status = scoring >= 55 ? "aprobada" : "rechazada";
        }

        // Guardar resultado
        const { rows: updated } = await pool.query(
            `UPDATE loan_requests
             SET status=$1, scoring=$2, updated_at=NOW()
             WHERE id=$3
                 RETURNING id, status, scoring, updated_at`,
            [status, scoring, reqRow.id]
        );

        return res.status(201).json({
            id: reqRow.id,
            status: updated[0].status,
            scoring: updated[0].scoring
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "internal_error" });
    }
});

// GET /loans/:id/status
router.get("/:id/status", async (req, res) => {
    try {
        await ensureTables();
        const { rows } = await pool.query(
            `SELECT id, status, scoring, updated_at
             FROM loan_requests
             WHERE id = $1`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: "not_found" });
        return res.json(rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "internal_error" });
    }
});

module.exports = router;
