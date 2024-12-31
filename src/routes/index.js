import {hiopos} from "./hiopos.routes.js";
import {siigo} from "./siigo.routes.js";
import {task} from "./task.routes.js";

const currentVersion = 'v1'
export const routes = (server) => {
    server.use(`/api/${currentVersion}/hiopos`, hiopos);
    server.use(`/api/${currentVersion}/siigo`, siigo);
    server.use(`/api/${currentVersion}/task`, task);
}