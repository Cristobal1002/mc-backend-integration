import {hiopos} from "./hiopos.routes.js";
import {siigo} from "./siigo.routes.js";
import {dataProcessor} from "./data-processor.routes.js";
import {reports} from "./reports.routes.js"
import {parametrization} from "./parametrization.routes.js";
import {auth} from "./auth.routes.js";
import {users} from "./user.routes.js";

const currentVersion = 'v1'
export const routes = (server) => {
    server.use(`/api/${currentVersion}/auth`, auth);
    server.use(`/api/${currentVersion}/users`, users);
    server.use(`/api/${currentVersion}/hiopos`, hiopos);
    server.use(`/api/${currentVersion}/siigo`, siigo);
    server.use(`/api/${currentVersion}/data-process`, dataProcessor);
    server.use(`/api/${currentVersion}/reports`, reports);
    server.use(`/api/${currentVersion}/parametrization`, parametrization);
}