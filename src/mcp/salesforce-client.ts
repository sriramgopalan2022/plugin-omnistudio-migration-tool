/**
 * Salesforce Client
 *
 * Standalone Salesforce client that uses AuthenticationManager for authentication
 * and focuses on Salesforce API operations.
 */

import jsforce from 'jsforce';
import { AuthenticationManager, SalesforceConfig, SessionData } from './auth-manager.js';

export interface QueryResult {
  totalSize: number;
  done: boolean;
  records: Array<Record<string, unknown>>;
}

export interface SObjectDescription {
  [key: string]: unknown;
  name: string;
  label: string;
  fields: Array<Record<string, unknown>>;
}

export interface CRUDResult {
  [key: string]: unknown;
  id?: string;
  success: boolean;
  errors?: Array<Record<string, unknown>>;
}

export class SalesforceClient {
  private authManager: AuthenticationManager;
  private currentConnection: jsforce.Connection | null = null;
  private verbose: boolean;

  public constructor(config: SalesforceConfig, options: { sessionFile?: string; verbose?: boolean } = {}) {
    AuthenticationManager.validateConfig(config);

    this.authManager = new AuthenticationManager(config, {
      sessionFile: options.sessionFile,
      verbose: options.verbose,
    });

    this.verbose = options.verbose || false;
  }

  /**
   * Get OAuth authorization URL for manual authentication
   */
  public getOAuthUrl(): string {
    return this.authManager.getOAuthUrl();
  }

  /**
   * Complete OAuth authentication with authorization code
   */
  public async completeOAuth(authorizationCode: string): Promise<void> {
    this.log('Completing OAuth authentication...');
    const authResult = await this.authManager.completeOAuth(authorizationCode);
    this.currentConnection = authResult.connection;
  }

  /**
   * Force authentication (useful for initial setup or testing)
   */
  public async authenticate(): Promise<void> {
    this.log('Forcing authentication...');
    const authResult = await this.authManager.getAuthenticatedConnection();
    this.currentConnection = authResult.connection;
  }

  /**
   * Clear session and force re-authentication
   */
  public async clearSession(): Promise<void> {
    this.log('Clearing session...');
    this.currentConnection = null;
    await this.authManager.clearSession();
  }

  /**
   * Check if client is authenticated
   */
  public isAuthenticated(): boolean {
    return this.authManager.hasValidSession() && this.currentConnection !== null;
  }

  /**
   * Get current session info
   */
  public getSessionInfo(): SessionData | null {
    return this.authManager.getCurrentSession();
  }

  /**
   * Get authentication status
   */
  public getAuthStatus(): {
    hasSession: boolean;
    isValid: boolean;
    expiresAt: string | null;
    hasRefreshToken: boolean;
    authMethod: 'username-password' | 'oauth' | 'none';
  } {
    return this.authManager.getAuthStatus();
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<SalesforceConfig>): void {
    this.authManager.updateConfig(newConfig);
    // Clear current connection to force re-authentication with new config
    this.currentConnection = null;
  }

  /**
   * Execute SOQL query
   */
  public async query(soql: string): Promise<QueryResult> {
    const conn = await this.ensureAuthenticated();

    this.log(`Executing query: ${soql.substring(0, 100)}${soql.length > 100 ? '...' : ''}`);

    const result = await conn.query(soql);
    return {
      totalSize: result.totalSize,
      done: result.done,
      records: result.records as Array<Record<string, unknown>>,
    };
  }

  /**
   * Execute SOQL query with all records (handles pagination automatically)
   */
  public async queryAll(soql: string): Promise<QueryResult> {
    const conn = await this.ensureAuthenticated();

    this.log(`Executing queryAll: ${soql.substring(0, 100)}${soql.length > 100 ? '...' : ''}`);

    const result = await conn.query(soql);
    let allRecords = [...result.records];
    let nextRecordsUrl = result.nextRecordsUrl;

    // Fetch all remaining records if there are more
    while (nextRecordsUrl && !result.done) {
      const moreResult = await conn.queryMore(nextRecordsUrl);
      allRecords = allRecords.concat(moreResult.records);
      nextRecordsUrl = moreResult.nextRecordsUrl;

      if (moreResult.done) break;
    }

    return {
      totalSize: allRecords.length,
      done: true,
      records: allRecords as Array<Record<string, unknown>>,
    };
  }

  /**
   * Get list of all SObjects
   */
  public async getSObjects(): Promise<Array<Record<string, unknown>>> {
    const conn = await this.ensureAuthenticated();

    this.log('Fetching SObjects list...');

    const sobjects = await conn.describeGlobal();
    return sobjects.sobjects.map((obj) => ({
      name: obj.name,
      label: obj.label,
      keyPrefix: obj.keyPrefix,
      createable: obj.createable,
      updateable: obj.updateable,
      deletable: obj.deletable,
      queryable: obj.queryable,
    }));
  }

  /**
   * Describe specific SObject
   */
  public async describeSObject(sobjectName: string): Promise<SObjectDescription> {
    const conn = await this.ensureAuthenticated();

    this.log(`Describing SObject: ${sobjectName}`);

    return (await conn.describe(sobjectName)) as unknown as SObjectDescription;
  }

  /**
   * Get record by ID
   */
  public async getRecord(sobjectName: string, id: string, fields?: string[]): Promise<Record<string, unknown>> {
    const conn = await this.ensureAuthenticated();

    this.log(`Getting ${sobjectName} record: ${id}`);

    return await conn.sobject(sobjectName).retrieve(id, fields);
  }

  /**
   * Create new record
   */
  public async createRecord(sobjectName: string, data: Record<string, unknown>): Promise<CRUDResult> {
    const conn = await this.ensureAuthenticated();

    this.log(`Creating ${sobjectName} record`);

    return (await conn.sobject(sobjectName).create(data)) as CRUDResult;
  }

  /**
   * Create multiple records
   */
  public async createRecords(sobjectName: string, records: Array<Record<string, unknown>>): Promise<CRUDResult[]> {
    const conn = await this.ensureAuthenticated();

    this.log(`Creating ${records.length} ${sobjectName} records`);

    const result = await conn.sobject(sobjectName).create(records);
    return (Array.isArray(result) ? result : [result]) as CRUDResult[];
  }

  /**
   * Update existing record
   */
  public async updateRecord(sobjectName: string, id: string, data: Record<string, unknown>): Promise<CRUDResult> {
    const conn = await this.ensureAuthenticated();

    this.log(`Updating ${sobjectName} record: ${id}`);

    return (await conn.sobject(sobjectName).update({ Id: id, ...data })) as CRUDResult;
  }

  /**
   * Update multiple records
   */
  public async updateRecords(
    sobjectName: string,
    records: Array<{ [key: string]: unknown; Id: string }>
  ): Promise<CRUDResult[]> {
    const conn = await this.ensureAuthenticated();

    this.log(`Updating ${records.length} ${sobjectName} records`);

    const result = await conn.sobject(sobjectName).update(records);
    return (Array.isArray(result) ? result : [result]) as CRUDResult[];
  }

  /**
   * Upsert record (create or update based on external ID)
   */
  public async upsertRecord(
    sobjectName: string,
    externalIdField: string,
    data: Record<string, unknown>
  ): Promise<CRUDResult> {
    const conn = await this.ensureAuthenticated();

    this.log(`Upserting ${sobjectName} record with ${externalIdField}`);

    return (await conn.sobject(sobjectName).upsert(data, externalIdField)) as CRUDResult;
  }

  /**
   * Delete record
   */
  public async deleteRecord(sobjectName: string, id: string): Promise<CRUDResult> {
    const conn = await this.ensureAuthenticated();

    this.log(`Deleting ${sobjectName} record: ${id}`);

    return (await conn.sobject(sobjectName).destroy(id)) as CRUDResult;
  }

  /**
   * Delete multiple records
   */
  public async deleteRecords(sobjectName: string, ids: string[]): Promise<CRUDResult[]> {
    const conn = await this.ensureAuthenticated();

    this.log(`Deleting ${ids.length} ${sobjectName} records`);

    return (await conn.sobject(sobjectName).destroy(ids)) as CRUDResult[];
  }

  /**
   * Get org limits
   */
  public async getOrgLimits(): Promise<Record<string, unknown>> {
    const conn = await this.ensureAuthenticated();

    this.log('Fetching org limits...');

    return await conn.request('/services/data/v58.0/limits');
  }

  /**
   * Get org info
   */
  public async getOrgInfo(): Promise<Record<string, unknown>> {
    const conn = await this.ensureAuthenticated();

    this.log('Fetching org info...');

    return (await conn.query(
      'SELECT Id, Name, OrganizationType, InstanceName FROM Organization LIMIT 1'
    )) as unknown as Record<string, unknown>;
  }

  /**
   * Execute custom REST API request
   */
  public async request(url: string, options?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const conn = await this.ensureAuthenticated();

    this.log(`Making custom request to: ${url}`);

    return await conn.request(url, options);
  }

  /**
   * Search using SOSL
   */
  public async search(soslQuery: string): Promise<Record<string, unknown>> {
    const conn = await this.ensureAuthenticated();

    this.log(`Executing SOSL search: ${soslQuery.substring(0, 100)}${soslQuery.length > 100 ? '...' : ''}`);

    return (await conn.search(soslQuery)) as unknown as Record<string, unknown>;
  }

  /**
   * Get recent items for an SObject
   */
  public async getRecentItems(sobjectName: string, limit = 10): Promise<Array<Record<string, unknown>>> {
    const conn = await this.ensureAuthenticated();

    this.log(`Getting recent ${sobjectName} items (limit: ${limit})`);

    return (await conn.sobject(sobjectName).recent()) as unknown as Array<Record<string, unknown>>;
  }

  /**
   * Get updated records since a specific date
   */
  public async getUpdated(sobjectName: string, startDate: Date, endDate?: Date): Promise<Record<string, unknown>> {
    const conn = await this.ensureAuthenticated();

    this.log(`Getting updated ${sobjectName} records since ${startDate.toISOString()}`);

    return (await conn.sobject(sobjectName).updated(startDate, endDate || new Date())) as unknown as Record<
      string,
      unknown
    >;
  }

  /**
   * Get deleted records since a specific date
   */
  public async getDeleted(sobjectName: string, startDate: Date, endDate?: Date): Promise<Record<string, unknown>> {
    const conn = await this.ensureAuthenticated();

    this.log(`Getting deleted ${sobjectName} records since ${startDate.toISOString()}`);

    return (await conn.sobject(sobjectName).deleted(startDate, endDate || new Date())) as unknown as Record<
      string,
      unknown
    >;
  }

  private log(message: string): void {
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.error(`[SalesforceClient] ${message}`);
    }
  }

  /**
   * Ensure we have an authenticated connection
   */
  private async ensureAuthenticated(): Promise<jsforce.Connection> {
    if (!this.currentConnection || !this.authManager.hasValidSession()) {
      this.log('Getting authenticated connection...');
      const authResult = await this.authManager.getAuthenticatedConnection();
      this.currentConnection = authResult.connection;
    }

    return this.currentConnection;
  }
}
