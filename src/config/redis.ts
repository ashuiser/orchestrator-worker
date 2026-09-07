import { createClient } from "redis";
import { env } from "./env.js";


const redisClient = createClient({
  url: env.REDIS_URL
});

redisClient.on("connect", () =>
  console.log("Redis Client is initiating a connection..."),
);
redisClient.on("ready", () => console.log("Redis Client is ready to use..."));
redisClient.on("error", (err) => console.log("Redis Client Error: ", err));
redisClient.on("reconnecting", () =>
  console.log("Redis Client is trying to reconnect..."),
);

export default redisClient;
