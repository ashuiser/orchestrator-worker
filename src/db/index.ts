import { drizzle } from "drizzle-orm/neon-serverless";
import { env } from "../config/env.js";

export const db = drizzle(env.DATABASE_URL);
