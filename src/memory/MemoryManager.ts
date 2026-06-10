import * as fs from "fs";
import * as path from "path";
import initSqlJs from "sql.js";
import type { ProjectSummary } from "../tools/ContextBuilder";

export interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
  sessionId?: string;
}

export interface Session {
  id: string;
  label: string;
  createdAt: number;
  lastActive: number;
  messageCount: number;
}

type Database = initSqlJs.Database;
type SqlValueMap = Record<string, initSqlJs.SqlValue>;

export default class MemoryManager {
  private currentSessionId = "";

  private constructor(
    private readonly storagePath: string,
    private readonly dbPath: string,
    private readonly db: Database,
  ) {}

  public static async create(storagePath: string): Promise<MemoryManager> {
    fs.mkdirSync(storagePath, { recursive: true });

    const SQL = await initSqlJs();
    const dbPath = path.join(storagePath, "codex-local.db");
    const db = fs.existsSync(dbPath)
      ? new SQL.Database(fs.readFileSync(dbPath))
      : new SQL.Database();
    const memory = new MemoryManager(storagePath, dbPath, db);

    memory.initSchema();

    return memory;
  }

  public get sessionId(): string {
    return this.currentSessionId;
  }

  public newSession(): string {
    const sessionId = this.generateSessionId();
    const timestamp = Date.now();
    const label = `Session ${new Date().toLocaleString()}`;

    this.db.run(
      "INSERT INTO sessions (id, label, created_at, last_active) VALUES (?, ?, ?, ?)",
      [sessionId, label, timestamp, timestamp],
    );
    this.currentSessionId = sessionId;
    this.persistToDisk();

    return sessionId;
  }

  public saveMessage(role: "user" | "assistant", content: string): void {
    const timestamp = Date.now();

    this.db.run(
      "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
      [this.currentSessionId, role, content, timestamp],
    );
    this.db.run(
      "UPDATE sessions SET last_active = ? WHERE id = ?",
      [timestamp, this.currentSessionId],
    );
    this.persistToDisk();
  }

  public getRecentMessages(limit: number = 50): Message[] {
    const rows = this.all(
      "SELECT id, session_id, role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?",
      [this.currentSessionId, limit],
    );

    return rows.map((row) => this.toMessage(row)).reverse();
  }

  public getMessageCount(): number {
    const row = this.get(
      "SELECT COUNT(*) AS messageCount FROM messages WHERE session_id = ?",
      [this.currentSessionId],
    );

    return this.numberValue(row.messageCount);
  }

  public getSessions(): Session[] {
    const rows = this.all(
      `SELECT
        s.id,
        s.label,
        s.created_at AS createdAt,
        s.last_active AS lastActive,
        COUNT(m.id) AS messageCount
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      GROUP BY s.id, s.label, s.created_at, s.last_active
      ORDER BY s.last_active DESC
      LIMIT 30`,
    );

    return rows.map((row) => this.toSession(row));
  }

  public loadSession(sessionId: string): Message[] {
    this.currentSessionId = sessionId;

    return this.getRecentMessages(100);
  }

  public clearCurrentSession(): void {
    this.db.run(
      "DELETE FROM messages WHERE session_id = ?",
      [this.currentSessionId],
    );
    this.persistToDisk();
  }

  public renameSession(sessionId: string, label: string): void {
    this.db.run(
      "UPDATE sessions SET label = ? WHERE id = ?",
      [label, sessionId],
    );
    this.persistToDisk();
  }

  public deleteSession(sessionId: string): void {
    this.db.run(
      "DELETE FROM messages WHERE session_id = ?",
      [sessionId],
    );
    this.db.run(
      "DELETE FROM sessions WHERE id = ?",
      [sessionId],
    );

    if (sessionId === this.currentSessionId) {
      this.newSession();
      return;
    }

    this.persistToDisk();
  }

  public close(): void {
    this.db.close();
  }

  public saveProjectSummary(summary: ProjectSummary): void {
    this.db.run(
      "INSERT OR REPLACE INTO project_cache (key, value, updated_at) VALUES (?, ?, ?)",
      ["project_summary", JSON.stringify(summary), Date.now()],
    );
    this.persistToDisk();
  }

  public getProjectSummary(): ProjectSummary | null {
    const row = this.get(
      "SELECT value FROM project_cache WHERE key = ?",
      ["project_summary"],
    );

    if (!row.value || typeof row.value !== "string") {
      return null;
    }

    try {
      return JSON.parse(row.value) as ProjectSummary;
    } catch {
      return null;
    }
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_active INTEGER NOT NULL
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)");
    this.db.run(`
      CREATE TABLE IF NOT EXISTS project_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.ensureActiveSession();
  }

  private ensureActiveSession(): void {
    const row = this.get("SELECT id FROM sessions ORDER BY last_active DESC LIMIT 1");
    const sessionId = row.id;

    if (typeof sessionId === "string") {
      this.currentSessionId = sessionId;
      return;
    }

    this.newSession();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private persistToDisk(): void {
    fs.mkdirSync(this.storagePath, { recursive: true });
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
  }

  private all(sql: string, params?: initSqlJs.BindParams): SqlValueMap[] {
    const statement = this.db.prepare(sql);
    const rows: SqlValueMap[] = [];

    try {
      if (params !== undefined) {
        statement.bind(params);
      }

      while (statement.step()) {
        rows.push(statement.getAsObject());
      }
    } finally {
      statement.free();
    }

    return rows;
  }

  private get(sql: string, params?: initSqlJs.BindParams): SqlValueMap {
    const statement = this.db.prepare(sql);

    try {
      if (params !== undefined) {
        statement.bind(params);
      }

      if (!statement.step()) {
        return {};
      }

      return statement.getAsObject();
    } finally {
      statement.free();
    }
  }

  private toMessage(row: SqlValueMap): Message {
    const role = row.role;

    if (role !== "user" && role !== "assistant") {
      throw new Error("Invalid message role in database");
    }

    return {
      id: this.numberValue(row.id),
      role,
      content: this.stringValue(row.content),
      timestamp: this.numberValue(row.timestamp),
      sessionId: this.stringValue(row.session_id),
    };
  }

  private toSession(row: SqlValueMap): Session {
    return {
      id: this.stringValue(row.id),
      label: this.stringValue(row.label),
      createdAt: this.numberValue(row.createdAt),
      lastActive: this.numberValue(row.lastActive),
      messageCount: this.numberValue(row.messageCount),
    };
  }

  private stringValue(value: initSqlJs.SqlValue): string {
    if (typeof value !== "string") {
      throw new Error("Expected string value from database");
    }

    return value;
  }

  private numberValue(value: initSqlJs.SqlValue): number {
    if (typeof value !== "number") {
      throw new Error("Expected number value from database");
    }

    return value;
  }
}
