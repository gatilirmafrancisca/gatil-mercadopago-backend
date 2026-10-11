import { Router } from "express";
import * as doacaoController from "../controllers/doacao.controller.js";

const router = Router();

router.post("/criar-pagamento", doacaoController.criarPagamento);
router.get("/arrecadado-mes", doacaoController.arrecadadoMes);

export default router;