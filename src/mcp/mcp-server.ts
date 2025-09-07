/**
 * Salesforce MCP Server
 *
 * MCP server implementation that uses the SalesforceClient for all Salesforce operations
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SalesforceClient } from './salesforce-client.js';
import { SalesforceConfig } from './auth-manager.js';

export class SalesforceMCPServer {
  private server: Server;
  private client: SalesforceClient;

  public constructor(config: SalesforceConfig, verbose = false) {
    this.server = new Server(
      {
        name: 'omni-migration-mcp-stdio-server',
        version: '1.0.0',
        description: 'MCP STDIO server for Salesforce Omni Studio artifacts migration with OAuth authentication',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.client = new SalesforceClient(config, {
      sessionFile: undefined, // Use default
      verbose,
    });

    this.setupHandlers();
  }

  public async run(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      // eslint-disable-next-line no-console
      console.error('Omni Migration MCP STDIO server running on stdio');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private setupHandlers(): void {
    // Resources
    this.server.setRequestHandler(ListResourcesRequestSchema, () => {
      return {
        resources: [
          {
            uri: 'salesforce://sobjects',
            name: 'Salesforce SObjects',
            description: 'List of all available Salesforce SObjects',
            mimeType: 'application/json',
          },
          {
            uri: 'salesforce://limits',
            name: 'Salesforce Org Limits',
            description: 'Current org limits and usage',
            mimeType: 'application/json',
          },
          {
            uri: 'salesforce://omni-studio',
            name: 'Omni Studio Artifacts',
            description: 'List of Omni Studio artifacts (FlexCards, OmniScripts, etc.)',
            mimeType: 'application/json',
          },
          {
            uri: 'salesforce://org-info',
            name: 'Salesforce Org Info',
            description: 'Organization information',
            mimeType: 'application/json',
          },
        ],
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      try {
        switch (request.params.uri) {
          case 'salesforce://sobjects': {
            const sobjects = await this.client.getSObjects();
            return {
              contents: [
                {
                  uri: request.params.uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(sobjects, null, 2),
                },
              ],
            };
          }

          case 'salesforce://limits': {
            const limits = await this.client.getOrgLimits();
            return {
              contents: [
                {
                  uri: request.params.uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(limits, null, 2),
                },
              ],
            };
          }

          case 'salesforce://omni-studio': {
            // Query for Omni Studio artifacts
            const flexCards = await this.client.query(
              'SELECT Id, Name, VersionNumber, IsActive FROM OmniUiCard ORDER BY Name'
            );
            const omniScripts = await this.client.query(
              "SELECT Id, Name, VersionNumber, IsActive FROM OmniProcess WHERE Type = 'OmniScript' ORDER BY Name"
            );
            const integrationProcedures = await this.client.query(
              "SELECT Id, Name, VersionNumber, IsActive FROM OmniProcess WHERE Type = 'Integration Procedure' ORDER BY Name"
            );
            const dataRaptors = await this.client.query(
              'SELECT Id, Name, VersionNumber, IsActive FROM OmniDataTransform ORDER BY Name'
            );

            const omniArtifacts = {
              flexCards: flexCards.records,
              omniScripts: omniScripts.records,
              integrationProcedures: integrationProcedures.records,
              dataRaptors: dataRaptors.records,
              summary: {
                totalFlexCards: flexCards.totalSize,
                totalOmniScripts: omniScripts.totalSize,
                totalIntegrationProcedures: integrationProcedures.totalSize,
                totalDataRaptors: dataRaptors.totalSize,
              },
            };

            return {
              contents: [
                {
                  uri: request.params.uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(omniArtifacts, null, 2),
                },
              ],
            };
          }

          case 'salesforce://org-info': {
            const orgInfo = await this.client.getOrgInfo();
            return {
              contents: [
                {
                  uri: request.params.uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(orgInfo, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${request.params.uri}`);
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Resource read failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // Tools
    this.server.setRequestHandler(ListToolsRequestSchema, () => {
      return {
        tools: [
          {
            name: 'soql_query',
            description: 'Execute a SOQL query against Salesforce',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The SOQL query to execute',
                },
                queryAll: {
                  type: 'boolean',
                  description: 'Whether to fetch all records including those in pagination (default: false)',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'sosl_search',
            description: 'Execute a SOSL search against Salesforce',
            inputSchema: {
              type: 'object',
              properties: {
                search: {
                  type: 'string',
                  description: 'The SOSL search query to execute',
                },
              },
              required: ['search'],
            },
          },
          {
            name: 'describe_sobject',
            description: 'Get detailed metadata for a specific SObject',
            inputSchema: {
              type: 'object',
              properties: {
                sobject: {
                  type: 'string',
                  description: 'The API name of the SObject to describe',
                },
              },
              required: ['sobject'],
            },
          },
          {
            name: 'get_record',
            description: 'Retrieve a specific record by ID',
            inputSchema: {
              type: 'object',
              properties: {
                sobject: {
                  type: 'string',
                  description: 'The API name of the SObject',
                },
                id: {
                  type: 'string',
                  description: 'The record ID',
                },
                fields: {
                  type: 'string',
                  description: 'Comma-separated list of fields to retrieve (optional)',
                },
              },
              required: ['sobject', 'id'],
            },
          },
          {
            name: 'create_record',
            description: 'Create a new record',
            inputSchema: {
              type: 'object',
              properties: {
                sobject: {
                  type: 'string',
                  description: 'The API name of the SObject',
                },
                data: {
                  type: 'object',
                  description: 'The field data for the new record',
                },
              },
              required: ['sobject', 'data'],
            },
          },
          {
            name: 'create_records',
            description: 'Create multiple records',
            inputSchema: {
              type: 'object',
              properties: {
                sobject: {
                  type: 'string',
                  description: 'The API name of the SObject',
                },
                records: {
                  type: 'array',
                  items: {
                    type: 'object',
                  },
                  description: 'Array of record data objects to create',
                },
              },
              required: ['sobject', 'records'],
            },
          },
          {
            name: 'update_record',
            description: 'Update an existing record',
            inputSchema: {
              type: 'object',
              properties: {
                sobject: {
                  type: 'string',
                  description: 'The API name of the SObject',
                },
                id: {
                  type: 'string',
                  description: 'The record ID',
                },
                data: {
                  type: 'object',
                  description: 'The field data to update',
                },
              },
              required: ['sobject', 'id', 'data'],
            },
          },
          {
            name: 'update_records',
            description: 'Update multiple records',
            inputSchema: {
              type: 'object',
              properties: {
                sobject: {
                  type: 'string',
                  description: 'The API name of the SObject',
                },
                records: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      Id: { type: 'string' },
                    },
                    required: ['Id'],
                  },
                  description: 'Array of record data objects with Id field to update',
                },
              },
              required: ['sobject', 'records'],
            },
          },
          {
            name: 'upsert_record',
            description: 'Upsert a record (create or update based on external ID)',
            inputSchema: {
              type: 'object',
              properties: {
                sobject: {
                  type: 'string',
                  description: 'The API name of the SObject',
                },
                externalIdField: {
                  type: 'string',
                  description: 'The external ID field name',
                },
                data: {
                  type: 'object',
                  description: 'The record data including the external ID value',
                },
              },
              required: ['sobject', 'externalIdField', 'data'],
            },
          },
          {
            name: 'delete_record',
            description: 'Delete a record',
            inputSchema: {
              type: 'object',
              properties: {
                sobject: {
                  type: 'string',
                  description: 'The API name of the SObject',
                },
                id: {
                  type: 'string',
                  description: 'The record ID',
                },
              },
              required: ['sobject', 'id'],
            },
          },
          {
            name: 'delete_records',
            description: 'Delete multiple records',
            inputSchema: {
              type: 'object',
              properties: {
                sobject: {
                  type: 'string',
                  description: 'The API name of the SObject',
                },
                ids: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  description: 'Array of record IDs to delete',
                },
              },
              required: ['sobject', 'ids'],
            },
          },
          {
            name: 'get_recent_items',
            description: 'Get recently viewed items for an SObject',
            inputSchema: {
              type: 'object',
              properties: {
                sobject: {
                  type: 'string',
                  description: 'The API name of the SObject',
                },
                limit: {
                  type: 'integer',
                  description: 'Maximum number of items to return (default: 10)',
                },
              },
              required: ['sobject'],
            },
          },
          {
            name: 'get_updated_records',
            description: 'Get records updated since a specific date',
            inputSchema: {
              type: 'object',
              properties: {
                sobject: {
                  type: 'string',
                  description: 'The API name of the SObject',
                },
                startDate: {
                  type: 'string',
                  description: "Start date in ISO format (e.g., '2024-01-01T00:00:00Z')",
                },
                endDate: {
                  type: 'string',
                  description: 'End date in ISO format (optional, defaults to now)',
                },
              },
              required: ['sobject', 'startDate'],
            },
          },
          {
            name: 'get_deleted_records',
            description: 'Get records deleted since a specific date',
            inputSchema: {
              type: 'object',
              properties: {
                sobject: {
                  type: 'string',
                  description: 'The API name of the SObject',
                },
                startDate: {
                  type: 'string',
                  description: "Start date in ISO format (e.g., '2024-01-01T00:00:00Z')",
                },
                endDate: {
                  type: 'string',
                  description: 'End date in ISO format (optional, defaults to now)',
                },
              },
              required: ['sobject', 'startDate'],
            },
          },
          {
            name: 'export_flexcard',
            description: 'Export a FlexCard definition for migration',
            inputSchema: {
              type: 'object',
              properties: {
                flexCardId: {
                  type: 'string',
                  description: 'The ID of the FlexCard to export',
                },
                includeLayout: {
                  type: 'boolean',
                  description: 'Whether to include layout information (default: true)',
                },
              },
              required: ['flexCardId'],
            },
          },
          {
            name: 'import_flexcard',
            description: 'Import a FlexCard definition to target org',
            inputSchema: {
              type: 'object',
              properties: {
                flexCardDefinition: {
                  type: 'object',
                  description: 'The FlexCard definition JSON to import',
                },
                activate: {
                  type: 'boolean',
                  description: 'Whether to activate after import (default: false)',
                },
              },
              required: ['flexCardDefinition'],
            },
          },
          {
            name: 'export_omniscript',
            description: 'Export an OmniScript definition for migration',
            inputSchema: {
              type: 'object',
              properties: {
                omniScriptId: {
                  type: 'string',
                  description: 'The ID of the OmniScript to export',
                },
                includeElements: {
                  type: 'boolean',
                  description: 'Whether to include all script elements (default: true)',
                },
              },
              required: ['omniScriptId'],
            },
          },
          {
            name: 'import_omniscript',
            description: 'Import an OmniScript definition to target org',
            inputSchema: {
              type: 'object',
              properties: {
                omniScriptDefinition: {
                  type: 'object',
                  description: 'The OmniScript definition JSON to import',
                },
                activate: {
                  type: 'boolean',
                  description: 'Whether to activate after import (default: false)',
                },
              },
              required: ['omniScriptDefinition'],
            },
          },
          {
            name: 'export_integration_procedure',
            description: 'Export an Integration Procedure for migration',
            inputSchema: {
              type: 'object',
              properties: {
                integrationProcedureId: {
                  type: 'string',
                  description: 'The ID of the Integration Procedure to export',
                },
                includeElements: {
                  type: 'boolean',
                  description: 'Whether to include all procedure elements (default: true)',
                },
              },
              required: ['integrationProcedureId'],
            },
          },
          {
            name: 'import_integration_procedure',
            description: 'Import an Integration Procedure to target org',
            inputSchema: {
              type: 'object',
              properties: {
                integrationProcedureDefinition: {
                  type: 'object',
                  description: 'The Integration Procedure definition JSON to import',
                },
                activate: {
                  type: 'boolean',
                  description: 'Whether to activate after import (default: false)',
                },
              },
              required: ['integrationProcedureDefinition'],
            },
          },
          {
            name: 'export_dataraptor',
            description: 'Export a DataRaptor definition for migration',
            inputSchema: {
              type: 'object',
              properties: {
                dataRaptorId: {
                  type: 'string',
                  description: 'The ID of the DataRaptor to export',
                },
                includeTransformations: {
                  type: 'boolean',
                  description: 'Whether to include transformation mappings (default: true)',
                },
              },
              required: ['dataRaptorId'],
            },
          },
          {
            name: 'import_dataraptor',
            description: 'Import a DataRaptor definition to target org',
            inputSchema: {
              type: 'object',
              properties: {
                dataRaptorDefinition: {
                  type: 'object',
                  description: 'The DataRaptor definition JSON to import',
                },
                activate: {
                  type: 'boolean',
                  description: 'Whether to activate after import (default: false)',
                },
              },
              required: ['dataRaptorDefinition'],
            },
          },
          {
            name: 'analyze_dependencies',
            description: 'Analyze dependencies for Omni Studio artifacts',
            inputSchema: {
              type: 'object',
              properties: {
                artifactType: {
                  type: 'string',
                  enum: ['FlexCard', 'OmniScript', 'IntegrationProcedure', 'DataRaptor'],
                  description: 'Type of artifact to analyze',
                },
                artifactId: {
                  type: 'string',
                  description: 'ID of the artifact to analyze dependencies for',
                },
              },
              required: ['artifactType', 'artifactId'],
            },
          },
          {
            name: 'bulk_export_omni_artifacts',
            description: 'Export multiple Omni Studio artifacts in batch',
            inputSchema: {
              type: 'object',
              properties: {
                artifactTypes: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['FlexCard', 'OmniScript', 'IntegrationProcedure', 'DataRaptor'],
                  },
                  description: 'Types of artifacts to export',
                },
                filter: {
                  type: 'string',
                  description: 'Optional SOQL WHERE clause filter (e.g., "IsActive = true")',
                },
              },
              required: ['artifactTypes'],
            },
          },
          {
            name: 'oauth_callback',
            description: 'Complete OAuth authentication with authorization code',
            inputSchema: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'The authorization code from Salesforce OAuth callback',
                },
              },
              required: ['code'],
            },
          },
          {
            name: 'get_oauth_url',
            description: 'Get OAuth authorization URL for manual authentication',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
          {
            name: 'refresh_session',
            description: 'Manually refresh the authentication session',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
          {
            name: 'session_info',
            description: 'Get current session and authentication information',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
          {
            name: 'custom_request',
            description: 'Execute a custom REST API request',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'The REST API endpoint URL (relative to instance URL)',
                },
                method: {
                  type: 'string',
                  enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
                  description: 'HTTP method (default: GET)',
                },
                body: {
                  type: 'object',
                  description: 'Request body for POST/PUT/PATCH requests',
                },
              },
              required: ['url'],
            },
          },
        ],
      };
    });

    // Tool execution
    // eslint-disable-next-line complexity
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'oauth_callback': {
            const { code } = request.params.arguments as { code: string };
            await this.client.completeOAuth(code);

            return {
              content: [
                {
                  type: 'text',
                  text: 'OAuth authentication successful! You can now use Salesforce tools.',
                },
              ],
            };
          }

          case 'get_oauth_url': {
            const authUrl = this.client.getOAuthUrl();
            return {
              content: [
                {
                  type: 'text',
                  text: `Please visit this URL to authorize the application:\n\n${authUrl}\n\nThen use the 'oauth_callback' tool with the authorization code.`,
                },
              ],
            };
          }

          case 'refresh_session': {
            await this.client.clearSession();

            try {
              await this.client.authenticate();
              return {
                content: [
                  {
                    type: 'text',
                    text: 'Session refreshed successfully!',
                  },
                ],
              };
            } catch (error) {
              if (error instanceof Error && error.message.includes('OAuth required')) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: `Session cleared. ${error.message}`,
                    },
                  ],
                };
              }
              throw error;
            }
          }

          case 'session_info': {
            const sessionInfo = this.client.getSessionInfo();
            const authStatus = this.client.getAuthStatus();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      authenticated: this.client.isAuthenticated(),
                      authStatus,
                      sessionInfo: sessionInfo
                        ? {
                            instanceUrl: sessionInfo.instanceUrl,
                            expiresAt: new Date(sessionInfo.expiresAt).toISOString(),
                            hasRefreshToken: !!sessionInfo.refreshToken,
                          }
                        : null,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'soql_query': {
            const { query, queryAll } = request.params.arguments as {
              query: string;
              queryAll?: boolean;
            };

            const result = queryAll ? await this.client.queryAll(query) : await this.client.query(query);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'sosl_search': {
            const { search } = request.params.arguments as { search: string };
            const result = await this.client.search(search);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'describe_sobject': {
            const { sobject } = request.params.arguments as { sobject: string };
            const description = await this.client.describeSObject(sobject);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(description, null, 2),
                },
              ],
            };
          }

          case 'get_record': {
            const { sobject, id, fields } = request.params.arguments as {
              sobject: string;
              id: string;
              fields?: string;
            };

            const record = await this.client.getRecord(
              sobject,
              id,
              fields ? fields.split(',').map((f) => f.trim()) : undefined
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(record, null, 2),
                },
              ],
            };
          }

          case 'create_record': {
            const { sobject, data } = request.params.arguments as {
              sobject: string;
              data: Record<string, unknown>;
            };

            const result = await this.client.createRecord(sobject, data);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'create_records': {
            const { sobject, records } = request.params.arguments as {
              sobject: string;
              records: Array<Record<string, unknown>>;
            };

            const result = await this.client.createRecords(sobject, records);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'update_record': {
            const { sobject, id, data } = request.params.arguments as {
              sobject: string;
              id: string;
              data: Record<string, unknown>;
            };

            const result = await this.client.updateRecord(sobject, id, data);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'update_records': {
            const { sobject, records } = request.params.arguments as {
              sobject: string;
              records: Array<{ [key: string]: unknown; Id: string }>;
            };

            const result = await this.client.updateRecords(sobject, records);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'upsert_record': {
            const { sobject, externalIdField, data } = request.params.arguments as {
              sobject: string;
              externalIdField: string;
              data: Record<string, unknown>;
            };

            const result = await this.client.upsertRecord(sobject, externalIdField, data);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'delete_record': {
            const { sobject, id } = request.params.arguments as {
              sobject: string;
              id: string;
            };

            const result = await this.client.deleteRecord(sobject, id);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'delete_records': {
            const { sobject, ids } = request.params.arguments as {
              sobject: string;
              ids: string[];
            };

            const result = await this.client.deleteRecords(sobject, ids);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_recent_items': {
            const { sobject, limit } = request.params.arguments as {
              sobject: string;
              limit?: number;
            };

            const result = await this.client.getRecentItems(sobject, limit);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_updated_records': {
            const { sobject, startDate, endDate } = request.params.arguments as {
              sobject: string;
              startDate: string;
              endDate?: string;
            };

            const result = await this.client.getUpdated(
              sobject,
              new Date(startDate),
              endDate ? new Date(endDate) : undefined
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_deleted_records': {
            const { sobject, startDate, endDate } = request.params.arguments as {
              sobject: string;
              startDate: string;
              endDate?: string;
            };

            const result = await this.client.getDeleted(
              sobject,
              new Date(startDate),
              endDate ? new Date(endDate) : undefined
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'export_flexcard': {
            const { flexCardId, includeLayout = true } = request.params.arguments as {
              flexCardId: string;
              includeLayout?: boolean;
            };

            // Get FlexCard and its related data
            const flexCard = await this.client.getRecord('OmniUiCard', flexCardId);
            const flexCardData: Record<string, unknown> = { flexCard };

            if (includeLayout) {
              const layouts = await this.client.query(
                `SELECT Id, Name, Definition FROM OmniUiCardLayout WHERE OmniUiCardId = '${flexCardId}'`
              );
              flexCardData.layouts = layouts.records;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(flexCardData, null, 2),
                },
              ],
            };
          }

          case 'import_flexcard': {
            const { flexCardDefinition, activate = false } = request.params.arguments as {
              flexCardDefinition: Record<string, unknown>;
              activate?: boolean;
            };

            // Create FlexCard
            const createResult = await this.client.createRecord('OmniUiCard', {
              Name: (flexCardDefinition.flexCard as Record<string, unknown>).Name,
              Definition: (flexCardDefinition.flexCard as Record<string, unknown>).Definition,
              IsActive: activate,
            });

            // Create layouts if included
            if (flexCardDefinition.layouts) {
              for (const layout of flexCardDefinition.layouts as Array<Record<string, unknown>>) {
                await this.client.createRecord('OmniUiCardLayout', {
                  Name: layout.Name,
                  Definition: layout.Definition,
                  OmniUiCardId: createResult.id,
                });
              }
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      flexCardId: createResult.id,
                      activated: activate,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'export_omniscript': {
            const { omniScriptId, includeElements = true } = request.params.arguments as {
              omniScriptId: string;
              includeElements?: boolean;
            };

            // Get OmniScript and its related data
            const omniScript = await this.client.getRecord('OmniProcess', omniScriptId);
            const omniScriptData: Record<string, unknown> = { omniScript };

            if (includeElements) {
              const elements = await this.client.query(
                `SELECT Id, Name, Definition, ElementTypeId FROM OmniProcessElement WHERE OmniProcessId = '${omniScriptId}'`
              );
              omniScriptData.elements = elements.records;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(omniScriptData, null, 2),
                },
              ],
            };
          }

          case 'import_omniscript': {
            const { omniScriptDefinition, activate = false } = request.params.arguments as {
              omniScriptDefinition: Record<string, unknown>;
              activate?: boolean;
            };

            // Create OmniScript
            const createResult = await this.client.createRecord('OmniProcess', {
              Name: (omniScriptDefinition.omniScript as Record<string, unknown>).Name,
              Type: 'OmniScript',
              Definition: (omniScriptDefinition.omniScript as Record<string, unknown>).Definition,
              IsActive: activate,
            });

            // Create elements if included
            if (omniScriptDefinition.elements) {
              for (const element of omniScriptDefinition.elements as Array<Record<string, unknown>>) {
                await this.client.createRecord('OmniProcessElement', {
                  Name: element.Name,
                  Definition: element.Definition,
                  ElementTypeId: element.ElementTypeId,
                  OmniProcessId: createResult.id,
                });
              }
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      omniScriptId: createResult.id,
                      activated: activate,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'export_integration_procedure': {
            const { integrationProcedureId, includeElements = true } = request.params.arguments as {
              integrationProcedureId: string;
              includeElements?: boolean;
            };

            // Get Integration Procedure and its related data
            const integrationProcedure = await this.client.getRecord('OmniProcess', integrationProcedureId);
            const integrationProcedureData: Record<string, unknown> = { integrationProcedure };

            if (includeElements) {
              const elements = await this.client.query(
                `SELECT Id, Name, Definition, ElementTypeId FROM OmniProcessElement WHERE OmniProcessId = '${integrationProcedureId}'`
              );
              integrationProcedureData.elements = elements.records;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(integrationProcedureData, null, 2),
                },
              ],
            };
          }

          case 'import_integration_procedure': {
            const { integrationProcedureDefinition, activate = false } = request.params.arguments as {
              integrationProcedureDefinition: Record<string, unknown>;
              activate?: boolean;
            };

            // Create Integration Procedure
            const createResult = await this.client.createRecord('OmniProcess', {
              Name: (integrationProcedureDefinition.integrationProcedure as Record<string, unknown>).Name,
              Type: 'Integration Procedure',
              Definition: (integrationProcedureDefinition.integrationProcedure as Record<string, unknown>).Definition,
              IsActive: activate,
            });

            // Create elements if included
            if (integrationProcedureDefinition.elements) {
              for (const element of integrationProcedureDefinition.elements as Array<Record<string, unknown>>) {
                await this.client.createRecord('OmniProcessElement', {
                  Name: element.Name,
                  Definition: element.Definition,
                  ElementTypeId: element.ElementTypeId,
                  OmniProcessId: createResult.id,
                });
              }
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      integrationProcedureId: createResult.id,
                      activated: activate,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'export_dataraptor': {
            const { dataRaptorId, includeTransformations = true } = request.params.arguments as {
              dataRaptorId: string;
              includeTransformations?: boolean;
            };

            // Get DataRaptor and its related data
            const dataRaptor = await this.client.getRecord('OmniDataTransform', dataRaptorId);
            const dataRaptorData: Record<string, unknown> = { dataRaptor };

            if (includeTransformations) {
              const transformations = await this.client.query(
                `SELECT Id, Name, Definition FROM OmniDataTransformItem WHERE OmniDataTransformId = '${dataRaptorId}'`
              );
              dataRaptorData.transformations = transformations.records;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(dataRaptorData, null, 2),
                },
              ],
            };
          }

          case 'import_dataraptor': {
            const { dataRaptorDefinition, activate = false } = request.params.arguments as {
              dataRaptorDefinition: Record<string, unknown>;
              activate?: boolean;
            };

            // Create DataRaptor
            const createResult = await this.client.createRecord('OmniDataTransform', {
              Name: (dataRaptorDefinition.dataRaptor as Record<string, unknown>).Name,
              Definition: (dataRaptorDefinition.dataRaptor as Record<string, unknown>).Definition,
              IsActive: activate,
            });

            // Create transformations if included
            if (dataRaptorDefinition.transformations) {
              for (const transformation of dataRaptorDefinition.transformations as Array<Record<string, unknown>>) {
                await this.client.createRecord('OmniDataTransformItem', {
                  Name: transformation.Name,
                  Definition: transformation.Definition,
                  OmniDataTransformId: createResult.id,
                });
              }
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      dataRaptorId: createResult.id,
                      activated: activate,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'analyze_dependencies': {
            const { artifactType, artifactId } = request.params.arguments as {
              artifactType: string;
              artifactId: string;
            };

            const dependencies: Record<string, unknown> = { artifactType, artifactId, dependencies: [] };

            // Analyze dependencies based on artifact type
            switch (artifactType) {
              case 'FlexCard': {
                // Check for OmniScript dependencies
                const flexCardRecord = await this.client.getRecord('OmniUiCard', artifactId, ['Definition']);
                if (flexCardRecord.Definition) {
                  // Parse definition to extract dependencies
                  const definition = JSON.parse(flexCardRecord.Definition as string) as Record<string, unknown>;
                  // TODO: Implement proper FlexCard dependency analysis
                  // This would involve parsing the definition JSON structure to find OmniScript references
                  (dependencies.dependencies as Array<Record<string, unknown>>).push({
                    type: 'Analysis',
                    message: `FlexCard dependency analysis not yet implemented. Definition contains ${
                      Object.keys(definition).length
                    } top-level properties.`,
                  });
                }
                break;
              }

              case 'OmniScript': {
                // Check for Integration Procedure and DataRaptor dependencies
                const omniScriptElements = await this.client.query(
                  `SELECT Id, Definition FROM OmniProcessElement WHERE OmniProcessId = '${artifactId}'`
                );
                (dependencies.dependencies as Array<Record<string, unknown>>).push({
                  type: 'Elements',
                  count: omniScriptElements.totalSize,
                  elements: omniScriptElements.records,
                });
                break;
              }

              default:
                (dependencies.dependencies as Array<Record<string, unknown>>).push({
                  type: 'Info',
                  message: `Dependency analysis for ${artifactType} not yet implemented`,
                });
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(dependencies, null, 2),
                },
              ],
            };
          }

          case 'bulk_export_omni_artifacts': {
            const { artifactTypes, filter } = request.params.arguments as {
              artifactTypes: string[];
              filter?: string;
            };

            const exportResults: Record<string, unknown> = { exportedArtifacts: {} };
            const whereClause = filter ? ` WHERE ${filter}` : '';

            for (const artifactType of artifactTypes) {
              switch (artifactType) {
                case 'FlexCard': {
                  const flexCards = await this.client.query(
                    `SELECT Id, Name, Definition FROM OmniUiCard${whereClause}`
                  );
                  (exportResults.exportedArtifacts as Record<string, unknown>).flexCards = flexCards.records;
                  break;
                }

                case 'OmniScript': {
                  const omniScripts = await this.client.query(
                    `SELECT Id, Name, Definition FROM OmniProcess WHERE Type = 'OmniScript'${
                      filter ? ` AND ${filter}` : ''
                    }`
                  );
                  (exportResults.exportedArtifacts as Record<string, unknown>).omniScripts = omniScripts.records;
                  break;
                }

                case 'IntegrationProcedure': {
                  const integrationProcedures = await this.client.query(
                    `SELECT Id, Name, Definition FROM OmniProcess WHERE Type = 'Integration Procedure'${
                      filter ? ` AND ${filter}` : ''
                    }`
                  );
                  (exportResults.exportedArtifacts as Record<string, unknown>).integrationProcedures =
                    integrationProcedures.records;
                  break;
                }

                case 'DataRaptor': {
                  const dataRaptors = await this.client.query(
                    `SELECT Id, Name, Definition FROM OmniDataTransform${whereClause}`
                  );
                  (exportResults.exportedArtifacts as Record<string, unknown>).dataRaptors = dataRaptors.records;
                  break;
                }
              }
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(exportResults, null, 2),
                },
              ],
            };
          }

          case 'custom_request': {
            const {
              url,
              method = 'GET',
              body,
            } = request.params.arguments as {
              url: string;
              method?: string;
              body?: Record<string, unknown>;
            };

            const result = await this.client.request(url, {
              method,
              body: body ? JSON.stringify(body) : undefined,
              headers: body ? { 'Content-Type': 'application/json' } : undefined,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        // Handle authentication errors specially
        if (error instanceof Error && error.message.includes('OAuth required')) {
          throw new McpError(ErrorCode.InternalError, error.message);
        }

        // eslint-disable-next-line no-console
        console.error('Tool execution error:', error);

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }
}
