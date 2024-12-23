import {hiopos} from "./hiopos.routes.js";
import {siigo} from "./siigo.routes.js";

const currentVersion = 'v1'
export const routes = (server) => {
    server.use(`/api/${currentVersion}/hiopos`, hiopos);
    server.use(`/api/${currentVersion}/siigo`, siigo);
}