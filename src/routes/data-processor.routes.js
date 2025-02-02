import express from "express";
import {dataProcessorController} from "../controllers/index.js";

export const dataProcessor =  express.Router();

dataProcessor.post(`/test-purchases`, dataProcessorController.testLote )
dataProcessor.post(`/test-sales`, dataProcessorController.testLote )