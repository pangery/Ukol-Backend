require("dotenv").config();
const express = require("express");
const cors = require("cors");

require("./db");
const authRoutes = require("./routes/auth");
const tripGoalRoutes = require("./routes/tripGoals");
const { requireAuth } = require("./middleware/auth");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/v1", authRoutes);
app.use("/v1", requireAuth, tripGoalRoutes);

const port = Number(process.env.PORT || 8766);
app.listen(port, () => {
  console.log(`TripAI Express API listening on :${port}`);
});
