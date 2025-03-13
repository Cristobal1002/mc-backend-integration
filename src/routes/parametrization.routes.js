import express from "express";
import {parametrizationController} from "../controllers/index.js";
import {validateRequestMiddleware} from "../middleware/index.js";

export const parametrization = express.Router()

parametrization.get(`/get-params`, validateRequestMiddleware.validateRequest, parametrizationController.getParametrization)
parametrization.put(`/update-params`, validateRequestMiddleware.validateRequest, parametrizationController.updateParametrization)