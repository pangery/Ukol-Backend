const path = require("path");
const Database = require("better-sqlite3");

const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data", "tripai.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const hasTripGoalUserId = db
  .prepare("SELECT 1 FROM pragma_table_info('trip_goals') WHERE name = 'user_id'")
  .get();

if (hasTripGoalUserId) {
  db.pragma("foreign_keys = OFF");
  const migrate = db.transaction(() => {
    db.exec(`
    CREATE TABLE destinations_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_goal_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      estimated_duration_days INTEGER NOT NULL,
      daily_budget REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO destinations_new (id, trip_goal_id, name, estimated_duration_days, daily_budget, created_at)
    SELECT id, trip_goal_id, name, estimated_duration_days, daily_budget, created_at
    FROM destinations;

    DROP TABLE destinations;

    CREATE TABLE trip_goals_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      focus TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO trip_goals_new (id, name, focus, difficulty, created_at)
    SELECT id, name, focus, difficulty, created_at
    FROM trip_goals;

    DROP TABLE trip_goals;
    ALTER TABLE trip_goals_new RENAME TO trip_goals;
    ALTER TABLE destinations_new RENAME TO destinations;
    `);
  });
  migrate();
  db.exec(
    "CREATE TABLE IF NOT EXISTS destinations (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_goal_id INTEGER NOT NULL, name TEXT NOT NULL, estimated_duration_days INTEGER NOT NULL, daily_budget REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(trip_goal_id) REFERENCES trip_goals(id) ON DELETE CASCADE);"
  );
  db.pragma("foreign_keys = ON");
}

db.exec(`
CREATE TABLE IF NOT EXISTS trip_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  focus TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS destinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_goal_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  estimated_duration_days INTEGER NOT NULL,
  daily_budget REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(trip_goal_id) REFERENCES trip_goals(id) ON DELETE CASCADE
);
`);

module.exports = db;
