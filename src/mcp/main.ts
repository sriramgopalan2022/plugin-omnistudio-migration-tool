/**
 * Main exports for the Salesforce MCP Server package
 *
 * This should be saved as: src/main.ts
 *
 * Provides easy imports for all the main classes and interfaces
 */

// Core authentication
export { AuthenticationManager, type SalesforceConfig, type SessionData, type AuthResult } from './auth-manager';

// Salesforce client
export { SalesforceClient, type QueryResult, type SObjectDescription, type CRUDResult } from './salesforce-client';

// Configuration utilities
export { ConfigLoader } from './config-loader';

// MCP server
export { SalesforceMCPServer } from './mcp-server';
