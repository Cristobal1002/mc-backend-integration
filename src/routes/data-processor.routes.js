import express from "express";
import {dataProcessorController} from "../controllers/index.js";

export const dataProcessor =  express.Router();

dataProcessor.post(`/manual-purchases`, dataProcessorController.testLote )
dataProcessor.post(`/manual-sales`, dataProcessorController.testLote )