/**
 * Configuration Loader
 *
 * Utility to load Salesforce configuration from file or environment variables
 */

import { promises as fs } from 'fs';
import path from 'path';
import { SalesforceConfig, AuthenticationManager } from './auth-manager';

// __dirname is available in CommonJS by default

export class ConfigLoader {
  /**
   * Load configuration from file or environment variables
   */
  public static async loadConfig(configPath?: string): Promise<SalesforceConfig> {
    // Try to load from file first - check multiple locations
    const possiblePaths = configPath
      ? [configPath]
      : [
          path.join(process.cwd(), 'salesforce-config.json'),
          path.join(__dirname, 'salesforce-config.json'),
          path.join(__dirname, '..', 'salesforce-config.json'),
          path.join(process.cwd(), 'dist', 'salesforce-config.json'),
        ];

    for (const currentConfigPath of possiblePaths) {
      try {
        const configData = await fs.readFile(currentConfigPath, 'utf8');
        const config = JSON.parse(configData) as SalesforceConfig;
        // eslint-disable-next-line no-console
        console.error(`Loaded configuration from ${currentConfigPath}`);
        return config;
      } catch (error) {
        // Continue to next path
      }
    }

    // eslint-disable-next-line no-console
    console.error('No config file found in any location, trying environment variables...');

    // Fallback to environment variables
    const config: SalesforceConfig = {
      loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
      clientId: process.env.SF_CLIENT_ID || '',
      clientSecret: process.env.SF_CLIENT_SECRET || '',
      redirectUri: process.env.SF_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
      username: process.env.SF_USERNAME,
      password: process.env.SF_PASSWORD,
      securityToken: process.env.SF_SECURITY_TOKEN,
    };

    if (!config.clientId || !config.clientSecret) {
      throw new Error(
        'Salesforce configuration not found. Please provide:\n' +
          '1. salesforce-config.json file, or\n' +
          '2. Environment variables: SF_CLIENT_ID, SF_CLIENT_SECRET\n\n' +
          'See README.md for setup instructions.'
      );
    }

    // eslint-disable-next-line no-console
    console.error('Loaded configuration from environment variables');
    return config;
  }

  /**
   * Validate configuration
   */
  public static validateConfig(config: SalesforceConfig): void {
    AuthenticationManager.validateConfig(config);
  }

  /**
   * Create a sample configuration file
   */
  public static async createSampleConfig(outputPath?: string): Promise<void> {
    const sampleConfig: SalesforceConfig = {
      loginUrl: 'https://login.salesforce.com',
      clientId: 'your_connected_app_client_id',
      clientSecret: 'your_connected_app_client_secret',
      redirectUri: 'http://localhost:3000/oauth/callback',
      username: 'your_salesforce_username',
      password: 'your_salesforce_password',
      securityToken: 'your_security_token_if_required',
    };

    const filePath = outputPath || path.join(process.cwd(), 'salesforce-config.json.sample');
    await fs.writeFile(filePath, JSON.stringify(sampleConfig, null, 2));
    // eslint-disable-next-line no-console
    console.error(`Sample configuration created at: ${filePath}`);
  }

  /**
   * Load and validate configuration in one call
   */
  public static async loadAndValidateConfig(configPath?: string): Promise<SalesforceConfig> {
    const config = await this.loadConfig(configPath);
    this.validateConfig(config);
    return config;
  }
}
