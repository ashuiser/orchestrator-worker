import { drizzle } from "drizzle-orm/neon-serverless";

const db_url = process.env.DATABASE_URL;

if (!db_url) {
	console.error("DATABASE_URL is not defined");
	process.exit(1);
}

export const db = drizzle(db_url);
