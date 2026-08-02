import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import dotenv from "dotenv";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        origin.includes("vercel.app") ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.includes("onrender.com")
      ) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error({ err }, 'Unhandled Express API error');
    res.status(500).json({
      error: 'Internal Server Error',
      message: err?.message || 'An unexpected error occurred',
      cause:
        err?.cause?.message || (err?.cause ? String(err.cause) : undefined),
    });
  },
);
export default app;
