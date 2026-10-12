import { Router } from "express";
import * as doacaoController from "../controllers/doacao.controller.js";
import { criarLimiteCriarPix, criarLimiteStatusPix } from "../middlewares/rateLimitPix.js";

const router = Router();

router.post("/criar-pagamento", doacaoController.criarPagamento);
router.get("/arrecadado-mes", doacaoController.arrecadadoMes);
router.post("/criar-pix", criarLimiteCriarPix(), doacaoController.criarPix);
router.get("/status/:paymentId", criarLimiteStatusPix(), doacaoController.statusPix);

export default router;
