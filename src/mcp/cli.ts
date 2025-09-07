#!/usr/bin/env node
/**
 * Salesforce CLI Example
 *
 * This should be saved as: src/cli.ts
 *
 * Example of using the SalesforceClient standalone (without MCP)
 */

import { SalesforceClient } from './salesforce-client';
import { ConfigLoader } from './config-loader';

class SalesforceCLI {
  private client: SalesforceClient;

  public constructor(client: SalesforceClient) {
    this.client = client;
  }

  // eslint-disable-next-line complexity
  public async run(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0];

    try {
      switch (command) {
        case 'auth':
          await this.handleAuth();
          break;
        case 'query':
          await this.handleQuery(args.slice(1));
          break;
        case 'queryall':
          await this.handleQueryAll(args.slice(1));
          break;
        case 'search':
          await this.handleSearch(args.slice(1));
          break;
        case 'describe':
          await this.handleDescribe(args.slice(1));
          break;
        case 'sobjects':
          await this.handleSObjects();
          break;
        case 'limits':
          await this.handleLimits();
          break;
        case 'orginfo':
          await this.handleOrgInfo();
          break;
        case 'get':
          await this.handleGet(args.slice(1));
          break;
        case 'create':
          await this.handleCreate(args.slice(1));
          break;
        case 'update':
          await this.handleUpdate(args.slice(1));
          break;
        case 'upsert':
          await this.handleUpsert(args.slice(1));
          break;
        case 'delete':
          await this.handleDelete(args.slice(1));
          break;
        case 'recent':
          await this.handleRecent(args.slice(1));
          break;
        case 'updated':
          await this.handleUpdated(args.slice(1));
          break;
        case 'deleted':
          await this.handleDeleted(args.slice(1));
          break;
        case 'session':
          this.handleSession();
          break;
        case 'clear':
          await this.handleClear();
          break;
        case 'request':
          await this.handleCustomRequest(args.slice(1));
          break;
        default:
          this.showHelp();
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('OAuth required')) {
        // eslint-disable-next-line no-console
        console.log('\n🔐 OAuth Authentication Required');
        // eslint-disable-next-line no-console
        console.log('Please visit the URL above to authorize the application.');
        // eslint-disable-next-line no-console
        console.log('Then run: sf-cli auth <authorization_code>');
      } else {
        // eslint-disable-next-line no-console
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
      }
      process.exit(1);
    }
  }

  private async handleAuth(): Promise<void> {
    const authCode = process.argv[3];

    if (!authCode) {
      const authUrl = this.client.getOAuthUrl();
      // eslint-disable-next-line no-console
      console.log('🔗 Visit this URL to authorize:');
      // eslint-disable-next-line no-console
      console.log(authUrl);
      // eslint-disable-next-line no-console
      console.log('\nThen run: sf-cli auth <authorization_code>');
      return;
    }

    await this.client.completeOAuth(authCode);
    // eslint-disable-next-line no-console
    console.log('✅ Authentication successful!');
  }

  private async handleQuery(args: string[]): Promise<void> {
    if (args.length === 0) {
      // eslint-disable-next-line no-console
      console.log('Usage: sf-cli query "SELECT Id, Name FROM Account LIMIT 10"');
      return;
    }

    const soql = args.join(' ');
    const result = await this.client.query(soql);

    // eslint-disable-next-line no-console
    console.log(`📊 Query Results (${result.totalSize} records, done: ${result.done}):`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result.records, null, 2));
  }

  private async handleQueryAll(args: string[]): Promise<void> {
    if (args.length === 0) {
      // eslint-disable-next-line no-console
      console.log('Usage: sf-cli queryall "SELECT Id, Name FROM Account"');
      return;
    }

    const soql = args.join(' ');
    const result = await this.client.queryAll(soql);

    // eslint-disable-next-line no-console
    console.log(`📊 Query All Results (${result.totalSize} records):`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result.records, null, 2));
  }

  private async handleSearch(args: string[]): Promise<void> {
    if (args.length === 0) {
      // eslint-disable-next-line no-console
      console.log('Usage: sf-cli search "FIND {John} IN ALL FIELDS"');
      return;
    }

    const sosl = args.join(' ');
    const result = await this.client.search(sosl);

    // eslint-disable-next-line no-console
    console.log('🔍 Search Results:');
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
  }

  private async handleDescribe(args: string[]): Promise<void> {
    if (args.length === 0) {
      // eslint-disable-next-line no-console
      console.log('Usage: sf-cli describe Account');
      return;
    }

    const sobject = args[0];
    const description = await this.client.describeSObject(sobject);

    // eslint-disable-next-line no-console
    console.log(`📋 ${sobject} Description:`);
    // eslint-disable-next-line no-console
    console.log(`Label: ${String(description.label)}`);
    // eslint-disable-next-line no-console
    console.log(`Fields: ${String(description.fields.length)}`);
    // eslint-disable-next-line no-console
    console.log(`Createable: ${String(description.createable)}`);
    // eslint-disable-next-line no-console
    console.log(`Updateable: ${String(description.updateable)}`);
    // eslint-disable-next-line no-console
    console.log(`Deletable: ${String(description.deletable)}`);

    if (args.includes('--fields')) {
      // eslint-disable-next-line no-console
      console.log('\nFields:');
      description.fields.forEach((field) => {
        // eslint-disable-next-line no-console
        console.log(`  ${String(field.name)} (${String(field.type)}) - ${String(field.label)}`);
      });
    }
  }

  private async handleSObjects(): Promise<void> {
    const sobjects = await this.client.getSObjects();

    // eslint-disable-next-line no-console
    console.log(`📚 Available SObjects (${sobjects.length}):`);
    sobjects.slice(0, 20).forEach((obj) => {
      // eslint-disable-next-line no-console
      console.log(`  ${String(obj.name)} (${String(obj.label)})`);
    });

    if (sobjects.length > 20) {
      // eslint-disable-next-line no-console
      console.log(`  ... and ${sobjects.length - 20} more`);
      // eslint-disable-next-line no-console
      console.log('\nUse --all flag to see all SObjects');
    }
  }

  private async handleLimits(): Promise<void> {
    const limits = await this.client.getOrgLimits();

    // eslint-disable-next-line no-console
    console.log('📈 Org Limits:');
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(limits, null, 2));
  }

  private async handleOrgInfo(): Promise<void> {
    const orgInfo = await this.client.getOrgInfo();

    // eslint-disable-next-line no-console
    console.log('🏢 Organization Info:');
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(orgInfo, null, 2));
  }

  private async handleGet(args: string[]): Promise<void> {
    if (args.length < 2) {
      // eslint-disable-next-line no-console
      console.log('Usage: sf-cli get Account 001XXXXXXXXX [field1,field2,...]');
      return;
    }

    const [sobject, id, fieldsStr] = args;
    const fields = fieldsStr ? fieldsStr.split(',').map((f) => f.trim()) : undefined;

    const record = await this.client.getRecord(sobject, id, fields);

    // eslint-disable-next-line no-console
    console.log(`📄 ${sobject} Record:`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(record, null, 2));
  }

  private async handleCreate(args: string[]): Promise<void> {
    if (args.length < 2) {
      // eslint-disable-next-line no-console
      console.log('Usage: sf-cli create Contact \'{"FirstName":"John","LastName":"Doe","Email":"john@example.com"}\'');
      return;
    }

    const sobject = args[0];
    const dataStr = args.slice(1).join(' ');
    const data = JSON.parse(dataStr) as Record<string, unknown>;

    const result = await this.client.createRecord(sobject, data);

    // eslint-disable-next-line no-console
    console.log(`✅ Created ${sobject}:`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
  }

  private async handleUpdate(args: string[]): Promise<void> {
    if (args.length < 3) {
      // eslint-disable-next-line no-console
      console.log('Usage: sf-cli update Contact 003XXXXXXXXX \'{"Phone":"+1-555-123-4567"}\'');
      return;
    }

    const sobject = args[0];
    const id = args[1];
    const dataStr = args.slice(2).join(' ');
    const data = JSON.parse(dataStr) as Record<string, unknown>;

    const result = await this.client.updateRecord(sobject, id, data);

    // eslint-disable-next-line no-console
    console.log(`✅ Updated ${sobject}:`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
  }

  private async handleUpsert(args: string[]): Promise<void> {
    if (args.length < 3) {
      // eslint-disable-next-line no-console
      console.log('Usage: sf-cli upsert Contact Email__c \'{"Email__c":"john@example.com","FirstName":"John"}\'');
      return;
    }

    const sobject = args[0];
    const externalIdField = args[1];
    const dataStr = args.slice(2).join(' ');
    const data = JSON.parse(dataStr) as Record<string, unknown>;

    const result = await this.client.upsertRecord(sobject, externalIdField, data);

    // eslint-disable-next-line no-console
    console.log(`✅ Upserted ${sobject}:`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
  }

  private async handleDelete(args: string[]): Promise<void> {
    if (args.length < 2) {
      // eslint-disable-next-line no-console
      console.log('Usage: sf-cli delete Contact 003XXXXXXXXX');
      return;
    }

    const sobject = args[0];
    const id = args[1];

    const result = await this.client.deleteRecord(sobject, id);

    // eslint-disable-next-line no-console
    console.log(`🗑️ Deleted ${sobject}:`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
  }

  private async handleRecent(args: string[]): Promise<void> {
    if (args.length < 1) {
      // eslint-disable-next-line no-console
      console.log('Usage: sf-cli recent Account [limit]');
      return;
    }

    const sobject = args[0];
    const limit = args[1] ? parseInt(args[1], 10) : 10;

    const result = await this.client.getRecentItems(sobject, limit);

    // eslint-disable-next-line no-console
    console.log(`📌 Recent ${sobject} Items:`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
  }

  private async handleUpdated(args: string[]): Promise<void> {
    if (args.length < 2) {
      // eslint-disable-next-line no-console
      console.log('Usage: sf-cli updated Account 2024-01-01T00:00:00Z [endDate]');
      return;
    }

    const sobject = args[0];
    const startDate = new Date(args[1]);
    const endDate = args[2] ? new Date(args[2]) : undefined;

    const result = await this.client.getUpdated(sobject, startDate, endDate);

    // eslint-disable-next-line no-console
    console.log(`📈 Updated ${sobject} Records:`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
  }

  private async handleDeleted(args: string[]): Promise<void> {
    if (args.length < 2) {
      // eslint-disable-next-line no-console
      console.log('Usage: sf-cli deleted Account 2024-01-01T00:00:00Z [endDate]');
      return;
    }

    const sobject = args[0];
    const startDate = new Date(args[1]);
    const endDate = args[2] ? new Date(args[2]) : undefined;

    const result = await this.client.getDeleted(sobject, startDate, endDate);

    // eslint-disable-next-line no-console
    console.log(`🗑️ Deleted ${sobject} Records:`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
  }

  private handleSession(): void {
    const sessionInfo = this.client.getSessionInfo();
    const authStatus = this.client.getAuthStatus();

    // eslint-disable-next-line no-console
    console.log('🔐 Session Info:');
    // eslint-disable-next-line no-console
    console.log(`Authenticated: ${this.client.isAuthenticated()}`);
    // eslint-disable-next-line no-console
    console.log(`Auth Method: ${authStatus.authMethod}`);
    // eslint-disable-next-line no-console
    console.log(`Has Session: ${authStatus.hasSession}`);
    // eslint-disable-next-line no-console
    console.log(`Is Valid: ${authStatus.isValid}`);

    if (sessionInfo) {
      // eslint-disable-next-line no-console
      console.log(`Instance URL: ${sessionInfo.instanceUrl}`);
      // eslint-disable-next-line no-console
      console.log(`Expires: ${authStatus.expiresAt}`);
      // eslint-disable-next-line no-console
      console.log(`Has Refresh Token: ${authStatus.hasRefreshToken}`);
    } else {
      // eslint-disable-next-line no-console
      console.log('No active session');
    }
  }

  private async handleClear(): Promise<void> {
    await this.client.clearSession();
    // eslint-disable-next-line no-console
    console.log('🧹 Session cleared');
  }

  private async handleCustomRequest(args: string[]): Promise<void> {
    if (args.length < 1) {
      // eslint-disable-next-line no-console
      console.log('Usage: sf-cli request "/services/data/v58.0/sobjects" [method] [body]');
      return;
    }

    const url = args[0];
    const method = args[1] || 'GET';
    const bodyStr = args[2];
    const body = bodyStr ? (JSON.parse(bodyStr) as Record<string, unknown>) : undefined;

    const result = await this.client.request(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    });

    // eslint-disable-next-line no-console
    console.log('🔧 Custom Request Result:');
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
  }

  private showHelp(): void {
    // eslint-disable-next-line no-console
    console.log(`
🚀 Salesforce CLI

Usage: sf-cli <command> [options]

Authentication:
  auth [code]                   Get OAuth URL or complete OAuth with authorization code

Querying:
  query "<SOQL>"               Execute a SOQL query
  queryall "<SOQL>"            Execute SOQL query with automatic pagination
  search "<SOSL>"              Execute a SOSL search

Metadata:
  describe <sobject> [--fields] Describe an SObject (add --fields to show field details)
  sobjects                     List all SObjects

Organization:
  limits                       Show org limits
  orginfo                      Show organization information

Record Operations:
  get <sobject> <id> [fields]  Get a record by ID
  create <sobject> '<json>'    Create a new record
  update <sobject> <id> '<json>' Update a record
  upsert <sobject> <field> '<json>' Upsert a record using external ID
  delete <sobject> <id>        Delete a record

Recent Activity:
  recent <sobject> [limit]     Get recently viewed items
  updated <sobject> <start> [end] Get updated records since date
  deleted <sobject> <start> [end] Get deleted records since date

Session Management:
  session                      Show session info
  clear                        Clear session

Advanced:
  request <url> [method] [body] Make custom REST API request

Examples:
  sf-cli auth
  sf-cli query "SELECT Id, Name FROM Account LIMIT 10"
  sf-cli queryall "SELECT Id, Name FROM Contact"
  sf-cli search "FIND {John} IN ALL FIELDS"
  sf-cli describe Account --fields
  sf-cli get Account 001XXXXXXXXX Name,Phone
  sf-cli create Contact '{"FirstName":"John","LastName":"Doe"}'
  sf-cli update Contact 003XXXXXXXXX '{"Phone":"+1-555-123-4567"}'
  sf-cli upsert Contact Email '{"Email":"john@example.com","FirstName":"John"}'
  sf-cli delete Contact 003XXXXXXXXX
  sf-cli recent Account 5
  sf-cli updated Contact 2024-01-01T00:00:00Z
  sf-cli request "/services/data/v58.0/sobjects"
`);
  }
}

async function main(): Promise<void> {
  try {
    // Load and validate configuration
    const config = await ConfigLoader.loadAndValidateConfig();

    // Create client with verbose logging
    const client = new SalesforceClient(config, { verbose: true });

    // Create and run CLI
    const cli = new SalesforceCLI(client);
    await cli.run();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('CLI Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Check if this file is being run directly
// eslint-disable-next-line @typescript-eslint/no-var-requires
if (require.main === module) {
  void main();
}
