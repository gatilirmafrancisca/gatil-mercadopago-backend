import express, { type Request, type Response } from "express";
import cors from "cors";
import { errorHandler } from "./middlewares/errors.middleware.js";
import mercadoPagoRoute from "./routes/mercadoPago.route.js";
import rifaRoute from "./routes/rifa.route.js";
import doacaoRoute from "./routes/doacao.route.js";

export const app = express();

app.use(express.json());
app.use(
  cors({ origin: process.env.FRONTEND_URL, credentials: true })
);

app.use("/mercadopago", mercadoPagoRoute);
app.use("/api/rifa", rifaRoute);
app.use("/api/doacao", doacaoRoute);

app.get("/", (req: Request, res: Response) => {
  res.send({ message: "App Working" });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ message: `Cannot ${req.method} ${req.path}` });
});

app.use(errorHandler);