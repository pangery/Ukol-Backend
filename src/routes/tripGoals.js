const express = require("express");
const db = require("../db");

const router = express.Router();
const ALLOWED_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const NAME_MAX_LENGTH = 120;
const FOCUS_MAX_LENGTH = 160;

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function normalizeDifficulty(value) {
  const cleaned = trimValue(value);
  if (!cleaned) return "";
  const normalized = cleaned.toLowerCase();
  if (!ALLOWED_DIFFICULTIES.has(normalized)) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function validateTripGoalPayload(body) {
  const name = trimValue(body.name);
  const focus = trimValue(body.focus);
  const difficulty = normalizeDifficulty(body.difficulty);

  if (!name || !focus || !difficulty) {
    return { error: "Vyplňte všechna povinná pole." };
  }
  if (name.length > NAME_MAX_LENGTH) {
    return { error: `Název může mít maximálně ${NAME_MAX_LENGTH} znaků.` };
  }
  if (focus.length > FOCUS_MAX_LENGTH) {
    return { error: `Zaměření může mít maximálně ${FOCUS_MAX_LENGTH} znaků.` };
  }

  return { name, focus, difficulty };
}

function validateDestinationPayload(body) {
  const name = trimValue(body.name);
  const estimatedDurationDays = Number(body.estimatedDurationDays);
  const dailyBudget = Number(body.dailyBudget);

  if (!name || !isPositiveInteger(estimatedDurationDays) || !Number.isFinite(dailyBudget) || dailyBudget <= 0) {
    return { error: "Neplatná data destinace." };
  }
  if (name.length > NAME_MAX_LENGTH) {
    return { error: `Název může mít maximálně ${NAME_MAX_LENGTH} znaků.` };
  }

  return {
    name,
    estimatedDurationDays,
    dailyBudget: Number(dailyBudget.toFixed(2)),
  };
}

function parseId(value) {
  const id = Number(value);
  return isPositiveInteger(id) ? id : null;
}

function getTripGoalById(tripGoalId) {
  return db.prepare("SELECT id, name, focus, difficulty FROM trip_goals WHERE id = ?").get(tripGoalId);
}

function trimValue(value) {
  return String(value || "").trim();
}

function mapDestination(row) {
  return {
    id: row.id,
    tripGoalId: row.trip_goal_id,
    name: row.name,
    estimatedDurationDays: row.estimated_duration_days,
    dailyBudget: row.daily_budget,
  };
}

router.post("/trip-goals", (req, res) => {
  const parsed = validateTripGoalPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ detail: parsed.error });
  }

  const { name, focus, difficulty } = parsed;
  const result = db
    .prepare("INSERT INTO trip_goals (name, focus, difficulty) VALUES (?, ?, ?)")
    .run(name, focus, difficulty);

  return res.status(201).json({
    id: result.lastInsertRowid,
    name,
    focus,
    difficulty,
  });
});

router.get("/trip-goals", (req, res) => {
  const difficultyFilter = normalizeDifficulty(req.query.difficulty);
  const search = trimValue(req.query.search);

  if (req.query.difficulty && !difficultyFilter) {
    return res.status(400).json({ detail: "Neplatná obtížnost filtru." });
  }

  const where = [];
  const params = [];
  if (difficultyFilter) {
    where.push("difficulty = ?");
    params.push(difficultyFilter);
  }
  if (search) {
    where.push("(name LIKE ? OR focus LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT id, name, focus, difficulty FROM trip_goals ${whereSql} ORDER BY id DESC`)
    .all(...params);
  return res.json(rows);
});

router.get("/trip-goals/:tripGoalId", (req, res) => {
  const tripGoalId = parseId(req.params.tripGoalId);
  if (!tripGoalId) {
    return res.status(400).json({ detail: "Neplatné ID Trip Goal." });
  }
  const goal = getTripGoalById(tripGoalId);

  if (!goal) {
    return res.status(404).json({ detail: "Trip Goal nebyl nalezen." });
  }

  const destinations = db
    .prepare(
      "SELECT id, trip_goal_id, name, estimated_duration_days, daily_budget FROM destinations WHERE trip_goal_id = ? ORDER BY id DESC"
    )
    .all(tripGoalId)
    .map(mapDestination);

  return res.json({ ...goal, destinations });
});

router.put("/trip-goals/:tripGoalId", (req, res) => {
  const tripGoalId = parseId(req.params.tripGoalId);
  if (!tripGoalId) {
    return res.status(400).json({ detail: "Neplatné ID Trip Goal." });
  }

  const existing = getTripGoalById(tripGoalId);
  if (!existing) {
    return res.status(404).json({ detail: "Trip Goal nebyl nalezen." });
  }

  const parsed = validateTripGoalPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ detail: parsed.error });
  }

  const { name, focus, difficulty } = parsed;
  db.prepare("UPDATE trip_goals SET name = ?, focus = ?, difficulty = ? WHERE id = ?").run(
    name,
    focus,
    difficulty,
    tripGoalId
  );

  return res.json({
    id: tripGoalId,
    name,
    focus,
    difficulty,
  });
});

router.delete("/trip-goals/:tripGoalId", (req, res) => {
  const tripGoalId = parseId(req.params.tripGoalId);
  if (!tripGoalId) {
    return res.status(400).json({ detail: "Neplatné ID Trip Goal." });
  }

  const existing = getTripGoalById(tripGoalId);
  if (!existing) {
    return res.status(404).json({ detail: "Trip Goal nebyl nalezen." });
  }

  db.prepare("DELETE FROM trip_goals WHERE id = ?").run(tripGoalId);
  return res.status(204).send();
});

router.post("/trip-goals/:tripGoalId/destinations", (req, res) => {
  const tripGoalId = parseId(req.params.tripGoalId);
  if (!tripGoalId) {
    return res.status(400).json({ detail: "Neplatné ID Trip Goal." });
  }
  const goal = getTripGoalById(tripGoalId);
  if (!goal) {
    return res.status(404).json({ detail: "Trip Goal nebyl nalezen." });
  }

  const parsed = validateDestinationPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ detail: parsed.error });
  }
  const { name, estimatedDurationDays, dailyBudget } = parsed;

  const result = db
    .prepare(
      "INSERT INTO destinations (trip_goal_id, name, estimated_duration_days, daily_budget) VALUES (?, ?, ?, ?)"
    )
    .run(tripGoalId, name, estimatedDurationDays, dailyBudget);

  return res.status(201).json({
    id: result.lastInsertRowid,
    tripGoalId,
    name,
    estimatedDurationDays,
    dailyBudget,
  });
});

router.post("/destinations", (req, res) => {
  const tripGoalId = parseId(req.body.tripGoalId);
  if (!tripGoalId) {
    return res.status(400).json({ detail: "Před uložením prosím vyberte cíl výletu." });
  }

  const goal = getTripGoalById(tripGoalId);
  if (!goal) {
    return res.status(404).json({ detail: "Trip Goal nebyl nalezen." });
  }

  const parsed = validateDestinationPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ detail: parsed.error });
  }
  const { name, estimatedDurationDays, dailyBudget } = parsed;

  const result = db
    .prepare(
      "INSERT INTO destinations (trip_goal_id, name, estimated_duration_days, daily_budget) VALUES (?, ?, ?, ?)"
    )
    .run(tripGoalId, name, estimatedDurationDays, dailyBudget);

  return res.status(201).json({
    id: result.lastInsertRowid,
    tripGoalId,
    name,
    estimatedDurationDays,
    dailyBudget,
  });
});

router.put("/destinations/:destinationId", (req, res) => {
  const destinationId = parseId(req.params.destinationId);
  if (!destinationId) {
    return res.status(400).json({ detail: "Neplatné ID Destination." });
  }
  const destination = db
    .prepare("SELECT id, trip_goal_id FROM destinations WHERE id = ?")
    .get(destinationId);
  if (!destination) {
    return res.status(404).json({ detail: "Destination nebyla nalezena." });
  }

  const parsed = validateDestinationPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ detail: parsed.error });
  }
  const { name, estimatedDurationDays, dailyBudget } = parsed;

  db.prepare("UPDATE destinations SET name = ?, estimated_duration_days = ?, daily_budget = ? WHERE id = ?").run(
    name,
    estimatedDurationDays,
    dailyBudget,
    destinationId
  );

  return res.json({
    id: destinationId,
    tripGoalId: destination.trip_goal_id,
    name,
    estimatedDurationDays,
    dailyBudget,
  });
});

router.delete("/destinations/:destinationId", (req, res) => {
  const destinationId = parseId(req.params.destinationId);
  if (!destinationId) {
    return res.status(400).json({ detail: "Neplatné ID Destination." });
  }
  const destination = db
    .prepare("SELECT id FROM destinations WHERE id = ?")
    .get(destinationId);
  if (!destination) {
    return res.status(404).json({ detail: "Destination nebyla nalezena." });
  }

  db.prepare("DELETE FROM destinations WHERE id = ?").run(destinationId);
  return res.status(204).send();
});

module.exports = router;
