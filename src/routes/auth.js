const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../db");

const router = express.Router();

function normalizeEmail(email = "") {
  return email.trim().toLowerCase();
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET || "dev-secret-change-me",
    { expiresIn: "30d" }
  );
}

router.post("/auth/register", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!email.includes("@") || password.length < 6) {
    return res.status(400).json({ detail: "Neplatne udaje." });
  }

  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) {
    return res.status(409).json({ detail: "Ucet uz existuje." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run(email, passwordHash);

  const user = { id: result.lastInsertRowid, email };
  return res.status(201).json({ access_token: signToken(user) });
});

router.post("/auth/login", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email);
  if (!user) {
    return res.status(401).json({ detail: "Spatny e-mail nebo heslo." });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ detail: "Spatny e-mail nebo heslo." });
  }

  return res.json({ access_token: signToken(user) });
});

module.exports = router;
