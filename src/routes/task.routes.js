import express from "express";
import {taskController} from "../controllers/index.js";

export const task = express.Router()

task.post('/add-task', taskController.addTask )
