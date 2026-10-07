import {createRouter, type RouterDeps} from './http/router';
import {routes} from './http/routes';

/** The whole API as one function: request in, response out. lambda.ts and dev-server.ts wrap it. */
export const createApi = (deps: RouterDeps) => createRouter(routes, deps);
