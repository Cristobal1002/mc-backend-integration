import {taskQueue} from "../config/bullmq.js";
export const addTask = async (req, res, next) => {
    const {name, data} = req.body;
    try {
        const job = await taskQueue.add(name, data)
        return res.status(200).json({ message: 'Tarea agregada a la cola', jobId: job.id });
    } catch (error) {
        next(error)
    }
}