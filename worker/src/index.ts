import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { auth } from "./middleware/auth";
import { health } from "./routes/health";
import { manifest } from "./routes/manifest";
import { files } from "./routes/files";

const app = new Hono<{ Bindings: Env }>();

// CORS for Obsidian plugin requests
app.use("*", cors());

// Health check is public
app.route("/", health);

// All other routes require auth
app.use("*", auth());
app.route("/", manifest);
app.route("/", files);

export default app;
