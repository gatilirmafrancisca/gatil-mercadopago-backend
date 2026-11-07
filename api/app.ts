import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middlewares/errors.middleware.js";
import mercadoPagoRoute from "./routes/mercadoPago.route.js";
import rifaRoute from "./routes/rifa.route.js";
import doacaoRoute from "./routes/doacao.route.js";

export const app = express();

// Na Vercel a requisição chega via proxy — sem isso req.ip é o IP do
// proxy e o rate limit trataria todos os usuários como um só.
app.set("trust proxy", 1);

// A API só devolve JSON: CSP fechada, sem iframe, sem X-Powered-By.
app.use(helmet());
// Os corpos da API são pequenos (e-mail, números, UTMs). O webhook do
// Mercado Pago também é pequeno: só traz o id do pagamento.
app.use(express.json({ limit: "20kb" }));
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