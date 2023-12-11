import { createServer } from "@replit/river";
import { WebSocketServerTransport } from "@replit/river/transport/ws/server";
import { WebSocketServer } from "ws";
import { YjsServiceConstructor } from "./services/yjs";

// Setup basic river server with wss transport and services
const wss = new WebSocketServer({ port: 3002 });
const transport = new WebSocketServerTransport(wss, "SERVER");
const services = { yjs: YjsServiceConstructor() };
const riverServer = await createServer(transport, services);
export type Server = typeof riverServer;
