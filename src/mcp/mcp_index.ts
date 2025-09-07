#!/usr/bin/env node
/**
 * Omni Migration MCP STDIO Server Entry Point
 *
 * This should be saved as: src/index.ts
 *
 * Main entry point for the Omni Migration MCP STDIO server
 */

import { SalesforceMCPServer } from './mcp-server';
import { ConfigLoader } from './config-loader';

async function main(): Promise<void> {
  try {
    // Load and validate configuration
    const config = await ConfigLoader.loadAndValidateConfig();

    // Check for verbose mode
    const verbose = process.argv.includes('--verbose') || process.env.SF_VERBOSE === 'true';

    if (verbose) {
      // eslint-disable-next-line no-console
      console.error('Starting Omni Migration MCP STDIO server with verbose logging...');
    }

    // Create and run server
    const server = new SalesforceMCPServer(config, verbose);
    await server.run();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      'Failed to start Omni Migration MCP STDIO server:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Handle process signals gracefully
process.on('SIGINT', () => {
  // eslint-disable-next-line no-console
  console.error('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  // eslint-disable-next-line no-console
  console.error('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

void main();
