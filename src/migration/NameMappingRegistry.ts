/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Stringutil } from '../utils/StringValue/stringutil';

export interface ComponentNameMapping {
  originalName: string;
  cleanedName: string;
  componentType: 'DataMapper' | 'OmniScript' | 'IntegrationProcedure' | 'FlexCard';
  recordId: string;
  migratedId?: string;
}

export interface DependencyReference {
  parentComponentId: string;
  parentComponentType: string;
  fieldPath: string; // JSON path to the field that needs updating
  referencedOriginalName: string;
  referencedComponentType: string;
}

/**
 * Centralized registry for tracking name mappings and managing dependency updates
 * during Omnistudio component migration.
 */
export class NameMappingRegistry {
  private static instance: NameMappingRegistry;
  private nameMappings: Map<string, ComponentNameMapping> = new Map();
  private dependencyReferences: DependencyReference[] = [];

  // Type-specific mappings for quick lookup
  private dataMapperMappings: Map<string, string> = new Map(); // original -> cleaned
  private omniScriptMappings: Map<string, string> = new Map(); // original -> cleaned
  private integrationProcedureMappings: Map<string, string> = new Map(); // original -> cleaned
  private flexCardMappings: Map<string, string> = new Map(); // original -> cleaned

  // Track Angular OmniScripts that should be skipped (Type_SubType_Language format)
  private angularOmniScriptRefs: Set<string> = new Set();

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  public static getInstance(): NameMappingRegistry {
    if (!NameMappingRegistry.instance) {
      NameMappingRegistry.instance = new NameMappingRegistry();
    }
    return NameMappingRegistry.instance;
  }

  /**
   * Register a component name mapping before migration
   */
  public registerNameMapping(mapping: ComponentNameMapping): void {
    const key = `${mapping.componentType}:${mapping.originalName}`;
    this.nameMappings.set(key, mapping);

    // Store in type-specific maps for quick lookup
    switch (mapping.componentType) {
      case 'DataMapper':
        this.dataMapperMappings.set(mapping.originalName, mapping.cleanedName);
        break;
      case 'OmniScript':
        this.omniScriptMappings.set(mapping.originalName, mapping.cleanedName);
        break;
      case 'IntegrationProcedure':
        this.integrationProcedureMappings.set(mapping.originalName, mapping.cleanedName);
        break;
      case 'FlexCard':
        this.flexCardMappings.set(mapping.originalName, mapping.cleanedName);
        break;
    }
  }

  /**
   * Register a dependency reference that needs to be updated
   */
  public registerDependencyReference(reference: DependencyReference): void {
    this.dependencyReferences.push(reference);
  }

  /**
   * Get the cleaned name for a component
   */
  public getCleanedName(originalName: string, componentType: string): string {
    const key = `${componentType}:${originalName}`;
    const mapping = this.nameMappings.get(key);
    if (mapping) {
      return mapping.cleanedName;
    }

    // Fallback to direct cleaning if not registered
    return Stringutil.cleanName(originalName);
  }

  /**
   * Check if a DataMapper mapping exists in the registry
   */
  public hasDataMapperMapping(originalName: string): boolean {
    return this.dataMapperMappings.has(originalName);
  }

  /**
   * Check if an Integration Procedure mapping exists in the registry
   */
  public hasIntegrationProcedureMapping(originalName: string): boolean {
    return this.integrationProcedureMappings.has(originalName);
  }

  /**
   * Check if an OmniScript mapping exists in the registry
   */
  public hasOmniScriptMapping(originalName: string): boolean {
    return this.omniScriptMappings.has(originalName);
  }

  /**
   * Check if a FlexCard mapping exists in the registry
   */
  public hasFlexCardMapping(originalName: string): boolean {
    return this.flexCardMappings.has(originalName);
  }

  /**
   * Get available Integration Procedure mapping keys for debugging
   */
  public getIntegrationProcedureMappingKeys(): string[] {
    return Array.from(this.integrationProcedureMappings.keys());
  }

  /**
   * Get available OmniScript mapping keys for debugging
   */
  public getOmniScriptMappingKeys(): string[] {
    return Array.from(this.omniScriptMappings.keys());
  }

  /**
   * Get DataMapper cleaned name
   */
  public getDataMapperCleanedName(originalName: string): string {
    return this.dataMapperMappings.get(originalName) || Stringutil.cleanName(originalName);
  }

  /**
   * Get OmniScript cleaned name (Type_SubType_Language format)
   */
  public getOmniScriptCleanedName(type: string, subType: string, language: string | 'English'): string {
    const originalName = `${type}_${subType}_${language}`;
    // Check if we have a mapping for this OmniScript first
    const mappedName = this.omniScriptMappings.get(originalName);
    if (mappedName !== undefined) {
      return mappedName;
    }
    // Fallback to cleaning individual parts
    const cleanedType = Stringutil.cleanName(type);
    const cleanedSubType = Stringutil.cleanName(subType);
    return `${cleanedType}_${cleanedSubType}_${language}`;
  }

  /**
   * Get Integration Procedure cleaned name
   */
  public getIntegrationProcedureCleanedName(originalName: string): string {
    return this.integrationProcedureMappings.get(originalName) || Stringutil.cleanName(originalName, true);
  }

  /**
   * Get FlexCard cleaned name
   */
  public getFlexCardCleanedName(originalName: string): string {
    return this.flexCardMappings.get(originalName) || Stringutil.cleanName(originalName);
  }

  /**
   * Get all name mappings for reporting
   */
  public getAllNameMappings(): ComponentNameMapping[] {
    return Array.from(this.nameMappings.values());
  }

  /**
   * Get warnings for name changes
   */
  public getNameChangeWarnings(): string[] {
    const warnings: string[] = [];

    for (const mapping of this.nameMappings.values()) {
      if (mapping.originalName !== mapping.cleanedName) {
        warnings.push(
          `${mapping.componentType} name will change: "${mapping.originalName}" → "${mapping.cleanedName}"`
        );
      }
    }

    return warnings;
  }

  /**
   * Get warnings for a specific component type
   */
  public getNameChangeWarningsForType(componentType: string): string[] {
    const warnings: string[] = [];

    for (const mapping of this.nameMappings.values()) {
      if (mapping.componentType === componentType && mapping.originalName !== mapping.cleanedName) {
        warnings.push(`"${mapping.originalName}" → "${mapping.cleanedName}"`);
      }
    }

    return warnings;
  }

  /**
   * Get count of components with name changes by type
   */
  public getNameChangeCountByType(): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const mapping of this.nameMappings.values()) {
      if (mapping.originalName !== mapping.cleanedName) {
        counts[mapping.componentType] = (counts[mapping.componentType] || 0) + 1;
      }
    }

    return counts;
  }

  /**
   * Clear all mappings (for testing or new migration runs)
   */
  public clear(): void {
    this.nameMappings.clear();
    this.dependencyReferences = [];
    this.dataMapperMappings.clear();
    this.omniScriptMappings.clear();
    this.integrationProcedureMappings.clear();
    this.flexCardMappings.clear();
    this.angularOmniScriptRefs.clear();
  }

  /**
   * Register an Angular OmniScript that should be skipped during migration
   */
  public registerAngularOmniScript(omniScriptRef: string): void {
    this.angularOmniScriptRefs.add(omniScriptRef);
  }

  /**
   * Check if an OmniScript reference is Angular (should be skipped)
   */
  public isAngularOmniScript(omniScriptRef: string): boolean {
    return this.angularOmniScriptRefs.has(omniScriptRef);
  }

  /**
   * Get all Angular OmniScript references
   */
  public getAngularOmniScriptRefs(): Set<string> {
    return new Set(this.angularOmniScriptRefs);
  }

  /**
   * Pre-process all components to register their name mappings
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public preProcessComponents(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataMappers: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lwcOmniScripts: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    angularOmniScripts: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    integrationProcedures: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    flexCards: any[]
  ): void {
    // Register DataMapper mappings
    for (const dr of dataMappers) {
      this.registerNameMapping({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        originalName: dr.Name,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        cleanedName: Stringutil.cleanName(dr.Name),
        componentType: 'DataMapper',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        recordId: dr.Id,
      });
    }

    // Register OmniScript mappings
    for (const os of lwcOmniScripts) {
      // Extract namespace from field names (e.g., vlocity_ins__Type__c -> vlocity_ins)
      const fieldNames = Object.keys(os);
      const typeField = fieldNames.find((field) => field.endsWith('__Type__c')) || 'Type__c';
      const subTypeField = fieldNames.find((field) => field.endsWith('__SubType__c')) || 'SubType__c';
      const languageField = fieldNames.find((field) => field.endsWith('__Language__c')) || 'Language__c';

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const type = os[typeField];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const subType = os[subTypeField];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const language = os[languageField] || 'English';

      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      const originalName = `${type}_${subType}_${language}`;
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      const cleanedName = `${Stringutil.cleanName(type)}_${Stringutil.cleanName(subType)}_${language}`;

      this.registerNameMapping({
        originalName,
        cleanedName,
        componentType: 'OmniScript',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        recordId: os.Id,
      });
    }

    // Register Angular OmniScript references (to be skipped during migration)
    for (const angularOs of angularOmniScripts) {
      // Extract namespace from field names (e.g., vlocity_ins__Type__c -> vlocity_ins)
      const fieldNames = Object.keys(angularOs);
      const typeField = fieldNames.find((field) => field.endsWith('__Type__c')) || 'Type__c';
      const subTypeField = fieldNames.find((field) => field.endsWith('__SubType__c')) || 'SubType__c';
      const languageField = fieldNames.find((field) => field.endsWith('__Language__c')) || 'Language__c';

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const type = angularOs[typeField];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const subType = angularOs[subTypeField];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const language = angularOs[languageField] || 'English';

      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      const angularRef = `${type}_${subType}_${language}`;
      this.registerAngularOmniScript(angularRef);
    }

    // Register Integration Procedure mappings
    for (const ip of integrationProcedures) {
      // Extract namespace from field names (e.g., vlocity_ins__Type__c -> vlocity_ins)
      const fieldNames = Object.keys(ip);
      const typeField = fieldNames.find((field) => field.endsWith('__Type__c')) || 'Type__c';
      const subTypeField = fieldNames.find((field) => field.endsWith('__SubType__c')) || 'SubType__c';

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const type = ip[typeField];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const subType = ip[subTypeField];

      // Integration Procedures use only Type_SubType format (no language)
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      const originalName = `${type}_${subType}`;
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      const cleanedName = `${Stringutil.cleanName(type)}_${Stringutil.cleanName(subType)}`;

      this.registerNameMapping({
        originalName,
        cleanedName,
        componentType: 'IntegrationProcedure',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        recordId: ip.Id,
      });
    }

    // Register FlexCard mappings
    for (const fc of flexCards) {
      this.registerNameMapping({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        originalName: fc.Name,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        cleanedName: Stringutil.cleanName(fc.Name),
        componentType: 'FlexCard',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        recordId: fc.Id,
      });
    }
  }

  /**
   * Update all dependency references with cleaned names
   */
  public updateDependencyReferences<T>(componentDefinition: T): T {
    // This will be called for each component to update its dependencies
    // Implementation depends on the specific structure of each component type
    return this.updateObjectReferences(componentDefinition) as T;
  }

  /**
   * Recursively update references in an object
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private updateObjectReferences(obj: any): any {
    if (typeof obj === 'string') {
      return this.updateStringReference(obj);
    }

    if (Array.isArray(obj)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return obj.map((item) => this.updateObjectReferences(item)) as unknown[];
    }

    if (obj && typeof obj === 'object') {
      const updated: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        updated[key] = this.updateObjectReferences(value);
      }
      return updated;
    }

    return obj;
  }

  /**
   * Update a string reference if it matches a known component name
   */
  private updateStringReference(str: string): string {
    // Check if this string might be a DataMapper reference
    if (this.dataMapperMappings.has(str)) {
      return this.dataMapperMappings.get(str);
    }

    // Check if this string might be an Integration Procedure reference
    if (this.integrationProcedureMappings.has(str)) {
      return this.integrationProcedureMappings.get(str);
    }

    // Check if this string might be a FlexCard reference
    if (this.flexCardMappings.has(str)) {
      return this.flexCardMappings.get(str);
    }

    // Check if this string might be an OmniScript reference (Type_SubType_Language)
    for (const [originalName, cleanedName] of this.omniScriptMappings.entries()) {
      if (str === originalName) {
        return cleanedName;
      }
    }

    // Return original string unchanged if no mapping found
    // Only registered component names should be cleaned
    return str;
  }
}
