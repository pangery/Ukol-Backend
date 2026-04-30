const express = require("express");
const db = require("../db");

const router = express.Router();

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
  const name = trimValue(req.body.name);
  const focus = trimValue(req.body.focus);
  const difficulty = trimValue(req.body.difficulty);

  if (!name || !focus || !difficulty) {
    return res.status(400).json({ detail: "Vyplnte vsechna povinna pole." });
  }

  const result = db
    .prepare("INSERT INTO trip_goals (user_id, name, focus, difficulty) VALUES (?, ?, ?, ?)")
    .run(req.user.id, name, focus, difficulty);

  return res.status(201).json({
    id: result.lastInsertRowid,
    name,
    focus,
    difficulty,
  });
});

router.get("/trip-goals", (req, res) => {
  const rows = db
    .prepare("SELECT id, name, focus, difficulty FROM trip_goals WHERE user_id = ? ORDER BY id DESC")
    .all(req.user.id);
  return res.json(rows);
});

router.get("/trip-goals/:tripGoalId", (req, res) => {
  const tripGoalId = Number(req.params.tripGoalId);
  const goal = db
    .prepare("SELECT id, name, focus, difficulty FROM trip_goals WHERE id = ? AND user_id = ?")
    .get(tripGoalId, req.user.id);

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

router.post("/trip-goals/:tripGoalId/destinations", (req, res) => {
  const tripGoalId = Number(req.params.tripGoalId);
  const goal = db.prepare("SELECT id FROM trip_goals WHERE id = ? AND user_id = ?").get(tripGoalId, req.user.id);
  if (!goal) {
    return res.status(404).json({ detail: "Trip Goal nebyl nalezen." });
  }

  const name = trimValue(req.body.name);
  const estimatedDurationDays = Number(req.body.estimatedDurationDays);
  const dailyBudget = Number(req.body.dailyBudget);
  if (!name || !Number.isInteger(estimatedDurationDays) || estimatedDurationDays < 1 || dailyBudget <= 0) {
    return res.status(400).json({ detail: "Neplatna data destinace." });
  }

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
  const tripGoalId = Number(req.body.tripGoalId);
  if (!tripGoalId) {
    return res.status(400).json({ detail: "Pred ulozenim prosim vyberte cil vyletu." });
  }

  const goal = db.prepare("SELECT id FROM trip_goals WHERE id = ? AND user_id = ?").get(tripGoalId, req.user.id);
  if (!goal) {
    return res.status(404).json({ detail: "Trip Goal nebyl nalezen." });
  }

  const name = trimValue(req.body.name);
  const estimatedDurationDays = Number(req.body.estimatedDurationDays);
  const dailyBudget = Number(req.body.dailyBudget);
  if (!name || !Number.isInteger(estimatedDurationDays) || estimatedDurationDays < 1 || dailyBudget <= 0) {
    return res.status(400).json({ detail: "Neplatna data destinace." });
  }

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
  const destinationId = Number(req.params.destinationId);
  const destination = db
    .prepare(
      `
      SELECT d.id, d.trip_goal_id
      FROM destinations d
      JOIN trip_goals tg ON tg.id = d.trip_goal_id
      WHERE d.id = ? AND tg.user_id = ?
      `
    )
    .get(destinationId, req.user.id);
  if (!destination) {
    return res.status(404).json({ detail: "Destination nebyla nalezena." });
  }

  const name = trimValue(req.body.name);
  const estimatedDurationDays = Number(req.body.estimatedDurationDays);
  const dailyBudget = Number(req.body.dailyBudget);
  if (!name || !Number.isInteger(estimatedDurationDays) || estimatedDurationDays < 1 || dailyBudget <= 0) {
    return res.status(400).json({ detail: "Neplatna data destinace." });
  }

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
  const destinationId = Number(req.params.destinationId);
  const destination = db
    .prepare(
      `
      SELECT d.id
      FROM destinations d
      JOIN trip_goals tg ON tg.id = d.trip_goal_id
      WHERE d.id = ? AND tg.user_id = ?
      `
    )
    .get(destinationId, req.user.id);
  if (!destination) {
    return res.status(404).json({ detail: "Destination nebyla nalezena." });
  }

  db.prepare("DELETE FROM destinations WHERE id = ?").run(destinationId);
  return res.status(204).send();
});

module.exports = router;
