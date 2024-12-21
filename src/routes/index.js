import {hiopos} from "./hiopos.routes.js";

const currentVersion = 'v1'
export const routes = (server) => {
    server.use(`/api/${currentVersion}/hiopos`, hiopos);
}