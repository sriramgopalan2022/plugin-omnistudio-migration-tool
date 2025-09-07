/**
 * Salesforce Authentication Manager
 *
 * Handles all authentication-related operations including OAuth flows,
 * session persistence, and token management.
 */

import { promises as fs } from 'fs';
import { homedir } from 'os';
import path from 'path';
import jsforce from 'jsforce';

export interface SalesforceConfig {
  loginUrl?: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  username?: string;
  password?: string;
  securityToken?: string;
}

export interface SessionData {
  accessToken: string;
  instanceUrl: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface AuthResult {
  connection: jsforce.Connection;
  sessionData: SessionData;
}

export class AuthenticationManager {
  private config: SalesforceConfig;
  private sessionFile: string;
  private verbose: boolean;
  private currentSession: SessionData | null = null;

  public constructor(config: SalesforceConfig, options: { sessionFile?: string; verbose?: boolean } = {}) {
    this.config = config;
    this.sessionFile = options.sessionFile || path.join(homedir(), '.salesforce-auth-session.json');
    this.verbose = options.verbose || false;
  }

  /**
   * Validate configuration
   */
  public static validateConfig(config: SalesforceConfig): void {
    if (!config.clientId) {
      throw new Error('clientId is required');
    }
    if (!config.clientSecret) {
      throw new Error('clientSecret is required');
    }
    if (!config.redirectUri) {
      throw new Error('redirectUri is required');
    }
  }

  /**
   * Setup OAuth connection and return authorization URL
   */
  public getOAuthUrl(): string {
    this.log('Generating OAuth authorization URL...');

    const tempConnection = new jsforce.Connection({
      oauth2: {
        loginUrl: this.config.loginUrl || 'https://login.salesforce.com',
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        redirectUri: this.config.redirectUri,
      },
    });

    return tempConnection.oauth2.getAuthorizationUrl({
      scope: 'api refresh_token',
    });
  }

  /**
   * Complete OAuth authentication with authorization code
   */
  public async completeOAuth(authorizationCode: string): Promise<AuthResult> {
    this.log('Completing OAuth authentication...');

    const connection = new jsforce.Connection({
      oauth2: {
        loginUrl: this.config.loginUrl || 'https://login.salesforce.com',
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        redirectUri: this.config.redirectUri,
      },
    });

    const userInfo = await connection.oauth2.requestToken(authorizationCode);

    this.log(`OAuth Response - accessToken: ${connection.accessToken ? 'present' : 'missing'}`);
    this.log(`OAuth Response - instanceUrl: ${connection.instanceUrl || 'missing'}`);
    this.log(`OAuth Response - userInfo: ${JSON.stringify(userInfo, null, 2)}`);

    const sessionData: SessionData = {
      accessToken: userInfo.access_token, // Use access_token from userInfo response
      // eslint-disable-next-line camelcase
      instanceUrl: (userInfo as { instance_url?: string }).instance_url || connection.instanceUrl || '', // Use instance_url from userInfo or connection
      refreshToken: userInfo.refresh_token,
      expiresAt: Date.now() + 7200000, // 2 hours
    };

    await this.saveSession(sessionData);
    this.log('OAuth authentication successful');

    return { connection, sessionData };
  }

  /**
   * Refresh access token using refresh token
   */
  public async refreshAccessToken(sessionData: SessionData): Promise<AuthResult> {
    if (!sessionData.refreshToken) {
      throw new Error('No refresh token available for token refresh');
    }

    this.log('Refreshing access token...');

    const connection = new jsforce.Connection({
      oauth2: {
        loginUrl: this.config.loginUrl || 'https://login.salesforce.com',
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        redirectUri: this.config.redirectUri,
      },
    });

    // Use refresh token to get new access token
    const userInfo = await connection.oauth2.refreshToken(sessionData.refreshToken);

    this.log(`Refresh Response - userInfo: ${JSON.stringify(userInfo, null, 2)}`);
    this.log(`Connection accessToken: ${connection.accessToken || 'missing'}`);
    this.log(`Connection instanceUrl: ${connection.instanceUrl || 'missing'}`);

    const newSessionData: SessionData = {
      accessToken: userInfo.access_token, // Use access_token from userInfo response
      // eslint-disable-next-line camelcase
      instanceUrl:
        // eslint-disable-next-line camelcase
        (userInfo as { instance_url?: string }).instance_url || connection.instanceUrl || sessionData.instanceUrl, // Use instance_url from userInfo, connection, or fallback to existing
      refreshToken: userInfo.refresh_token || sessionData.refreshToken,
      expiresAt: Date.now() + 7200000, // 2 hours
    };

    this.log(`New session data: ${JSON.stringify(newSessionData, null, 2)}`);

    await this.saveSession(newSessionData);
    this.log('Access token refreshed successfully');

    // Create a proper connection object with the correct instanceUrl
    const refreshedConnection = this.createConnectionFromSession(newSessionData);

    return { connection: refreshedConnection, sessionData: newSessionData };
  }

  /**
   * Get authenticated connection (main authentication method)
   */
  public async getAuthenticatedConnection(): Promise<AuthResult> {
    // First, try to use existing session
    const sessionData = await this.loadSession();

    if (sessionData) {
      const connection = this.createConnectionFromSession(sessionData);

      // Test if the connection still works
      if (await this.testConnection(connection)) {
        this.log('Existing session is valid');
        return { connection, sessionData };
      }

      // Try to refresh the token if we have a refresh token
      if (sessionData.refreshToken) {
        try {
          this.log('Attempting to refresh expired session...');
          return await this.refreshAccessToken(sessionData);
        } catch (error) {
          this.log('Token refresh failed, will re-authenticate');
        }
      }
    }

    this.log('No valid session found, authenticating...');

    // Try username/password flow first
    if (this.config.username && this.config.password) {
      return await this.authenticateWithPassword();
    } else {
      // OAuth flow - throw error with auth URL
      const authUrl = this.getOAuthUrl();
      throw new Error(`OAuth required. Please visit: ${authUrl}`);
    }
  }

  /**
   * Clear stored session
   */
  public async clearSession(): Promise<void> {
    this.currentSession = null;

    try {
      await fs.unlink(this.sessionFile);
      this.log('Session cleared from file');
    } catch (error) {
      // File doesn't exist, that's fine
      this.log('No session file to clear');
    }
  }

  /**
   * Get current session information
   */
  public getCurrentSession(): SessionData | null {
    return this.currentSession;
  }

  /**
   * Check if we have a valid session
   */
  public hasValidSession(): boolean {
    return this.currentSession !== null && this.currentSession.expiresAt > Date.now() + 300000; // 5 minute buffer
  }

  /**
   * Update configuration (useful for dynamic config changes)
   */
  public updateConfig(newConfig: Partial<SalesforceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.log('Configuration updated');
  }

  /**
   * Get authentication status summary
   */
  public getAuthStatus(): {
    hasSession: boolean;
    isValid: boolean;
    expiresAt: string | null;
    hasRefreshToken: boolean;
    authMethod: 'username-password' | 'oauth' | 'none';
  } {
    const hasSession = this.currentSession !== null;
    const isValid = this.hasValidSession();
    const expiresAt = this.currentSession ? new Date(this.currentSession.expiresAt).toISOString() : null;
    const hasRefreshToken = this.currentSession?.refreshToken !== undefined;

    let authMethod: 'username-password' | 'oauth' | 'none' = 'none';
    if (this.config.username && this.config.password) {
      authMethod = 'username-password';
    } else if (this.config.clientId && this.config.clientSecret) {
      authMethod = 'oauth';
    }

    return {
      hasSession,
      isValid,
      expiresAt,
      hasRefreshToken,
      authMethod,
    };
  }

  private log(message: string): void {
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.error(`[AuthManager] ${message}`);
    }
  }

  /**
   * Load existing session from file
   */
  private async loadSession(): Promise<SessionData | null> {
    try {
      const sessionData = await fs.readFile(this.sessionFile, 'utf8');
      const session: SessionData = JSON.parse(sessionData) as SessionData;

      // Check if session is still valid (with 5 minute buffer)
      if (session && session.expiresAt > Date.now() + 300000) {
        this.log('Loaded valid session from file');
        this.currentSession = session;
        return session;
      } else {
        this.log('Session expired, will need to re-authenticate');
        this.currentSession = null;
        return null;
      }
    } catch (error) {
      this.log('No valid session found');
      this.currentSession = null;
      return null;
    }
  }

  /**
   * Save session to file
   */
  private async saveSession(sessionData: SessionData): Promise<void> {
    await fs.writeFile(this.sessionFile, JSON.stringify(sessionData, null, 2));
    this.currentSession = sessionData;
    this.log('Session saved to file');
  }

  /**
   * Test if a connection is valid
   */
  private async testConnection(connection: jsforce.Connection): Promise<boolean> {
    try {
      await connection.query('SELECT Id FROM User LIMIT 1');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create connection from session data
   */
  private createConnectionFromSession(sessionData: SessionData): jsforce.Connection {
    return new jsforce.Connection({
      instanceUrl: sessionData.instanceUrl,
      accessToken: sessionData.accessToken,
    });
  }

  /**
   * Authenticate using username/password flow
   */
  private async authenticateWithPassword(): Promise<AuthResult> {
    if (!this.config.username || !this.config.password) {
      throw new Error('Username and password are required for password authentication');
    }

    this.log('Authenticating with username/password flow...');

    const connection = new jsforce.Connection({
      loginUrl: this.config.loginUrl || 'https://login.salesforce.com',
    });

    const password = this.config.securityToken
      ? this.config.password + this.config.securityToken
      : this.config.password;

    await connection.login(this.config.username, password);

    const sessionData: SessionData = {
      accessToken: connection.accessToken,
      instanceUrl: connection.instanceUrl,
      expiresAt: Date.now() + 7200000, // 2 hours
    };

    await this.saveSession(sessionData);
    this.log('Successfully authenticated with username/password');

    return { connection, sessionData };
  }
}
