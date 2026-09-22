// Vercel serverless entry for the HOODFLOW API.
// Imports the compiled app (dist/, produced by the build step) and forwards
// every request to Fastify. The app is created once per warm instance.
import { createApp } from "../dist/create-app.js";

let appPromise;

function getApp() {
  if (!appPromise) {
    appPromise = createApp(undefined, { trustProxy: true }).then(async (app) => {
      await app.ready();
      return app;
    });
    // Don't cache a failed boot forever — let the next request retry.
    appPromise.catch(() => { appPromise = undefined; });
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  app.server.emit("request", req, res);
}
