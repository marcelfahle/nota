#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createNotaMcpServer } from "./server.js";

const server = createNotaMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
