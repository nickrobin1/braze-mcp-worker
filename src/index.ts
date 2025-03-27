import app from "./app";
import { McpAgent } from "agents/mcp";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import fetch from "node-fetch";

interface Env {
	BRAZE_API_KEY: string;
	BRAZE_REST_ENDPOINT: string;
	OAUTH_KV: KVNamespace;
}

declare const env: Env;

// Setup Braze API Configuration
const BRAZE_API_KEY = env.BRAZE_API_KEY;
const BRAZE_REST_ENDPOINT = env.BRAZE_REST_ENDPOINT;

if (!BRAZE_API_KEY || !BRAZE_REST_ENDPOINT) {
	throw new Error('Missing required Braze API configuration in environment variables');
}

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "BrazeMCPServer",
		version: "1.0.0",
	});

	async init() {
		this.server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
			content: [{ type: "text", text: String(a + b) }],
		}));

		this.server.tool("random", { to: z.number() }, async ({ to }) => {
			const randomNum = Math.floor(Math.random() * to) + 1;
			return {
				content: [{ type: "text", text: String(randomNum) }],
			};
		});

		// Braze integration tool
		this.server.tool("fetch-braze-user", {
			userId: z.string()
		}, async ({ userId }) => {
			const response = await fetch(`${BRAZE_REST_ENDPOINT}/users/export/ids`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${BRAZE_API_KEY}`
				},
				body: JSON.stringify({
					external_ids: [userId],
					fields_to_export: ["email", "first_name", "last_name", "custom_attributes"]
				})
			});

			if (!response.ok) {
				return {
					content: [{ type: "text", text: `Error fetching user data: ${response.statusText}` }],
					isError: true
				};
			}

			const data = await response.json();
			return {
				content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
			};
		});
	}
}

// Export the OAuth handler as the default
export default new OAuthProvider({
	apiRoute: "/sse",
	// TODO: fix these types
	// @ts-ignore
	apiHandler: MyMCP.mount("/sse"),
	// @ts-ignore
	defaultHandler: app,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
	kvNamespace: env.OAUTH_KV
});
