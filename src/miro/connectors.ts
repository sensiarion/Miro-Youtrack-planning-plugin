/**
 * Metadata key for identifying plugin-managed connectors
 */
const CONNECTOR_METADATA_KEY = 'youtrack-connector';

/**
 * Check if a link type represents a dependency (blocked by, depends on, etc.)
 */
function isDependencyLink(linkTypeName: string, sourceToTarget: string): boolean {
  const lowerName = linkTypeName.toLowerCase();
  const lowerDirection = sourceToTarget.toLowerCase();
  
  // Common dependency link types
  return (
    lowerName.includes('depend') ||
    lowerName.includes('block') ||
    lowerDirection.includes('depend') ||
    lowerDirection.includes('block') ||
    lowerDirection.includes('required')
  );
}

/**
 * Create a connector between two shapes based on YouTrack link type
 */
export async function createIssueConnector(
  startItem: any,
  endItem: any,
  linkTypeName: string,
  sourceToTarget: string,
  connectorId?: string // Optional: ID of existing connector to update
): Promise<any> {
  const isDependency = isDependencyLink(linkTypeName, sourceToTarget);
  
  // For dependencies: solid line with arrow pointing to blocked task
  // For regular links: dotted line
  const connectorStyle = {
    strokeStyle: isDependency ? 'normal' : 'dashed', // 'normal' = solid, 'dashed' = dotted
    strokeWidth: 2,
    strokeColor: '#1a1a1a', // Dark gray/black
    endStrokeCap: isDependency ? 'stealth' : 'none', // Arrow for dependencies
    startStrokeCap: 'none',
  };
  
  // Create connector configuration
  const connectorConfig: any = {
    shape: 'curved',
    style: connectorStyle,
    start: {
      item: startItem.id,
      snapTo: 'auto', // Let Miro determine best connection point
    },
    end: {
      item: endItem.id,
      snapTo: 'auto',
    },
  };
  
  let connector;
  
  if (connectorId) {
    // Update existing connector
    try {
      const existingConnector = await miro.board.get({ id: connectorId });
      if (existingConnector && existingConnector.length > 0) {
        connector = existingConnector[0];
        (connector as any).style = connectorStyle;
        await connector.sync();
        return connector;
      }
    } catch (error) {
      console.warn('Failed to update connector, creating new one:', error);
    }
  }
  
  // Create new connector
  connector = await miro.board.createConnector(connectorConfig);
  
  // Mark as plugin-managed via metadata
  await connector.setMetadata(CONNECTOR_METADATA_KEY, {
    linkType: linkTypeName,
    sourceToTarget,
    isDependency,
    startIssueId: startItem.id,
    endIssueId: endItem.id,
  });
  
  return connector;
}

/**
 * Get all plugin-managed connectors from the board
 */
export async function getPluginConnectors(): Promise<any[]> {
  try {
    const connectors = await miro.board.get({ type: 'connector' });
    const pluginConnectors: any[] = [];
    
    for (const connector of connectors) {
      try {
        const metadata = await connector.getMetadata(CONNECTOR_METADATA_KEY);
        if (metadata) {
          pluginConnectors.push(connector);
        }
      } catch (e) {
        // Not a plugin-managed connector, skip
      }
    }
    
    return pluginConnectors;
  } catch (error) {
    console.error('Failed to get connectors:', error);
    return [];
  }
}

/**
 * Check if a connector connects two task nodes (both have plugin metadata)
 */
export async function isConnectorBetweenTaskNodes(
  connector: any,
  taskNodeIds: Set<string>
): Promise<boolean> {
  try {
    const metadata = await connector.getMetadata(CONNECTOR_METADATA_KEY);
    if (!metadata || !metadata.startIssueId || !metadata.endIssueId) {
      return false;
    }
    
    // Check if both start and end are task nodes
    return taskNodeIds.has(metadata.startIssueId) && taskNodeIds.has(metadata.endIssueId);
  } catch (e) {
    return false;
  }
}

/**
 * Remove a connector from the board
 */
export async function removeConnector(connector: any): Promise<void> {
  try {
    await miro.board.remove(connector);
  } catch (error) {
    console.error('Failed to remove connector:', error);
  }
}

/**
 * Find a connector between two items (checks both directions for bidirectional links)
 */
export async function findConnectorBetween(
  startItemId: string,
  endItemId: string,
  linkTypeName?: string
): Promise<any | null> {
  const connectors = await getPluginConnectors();
  
  for (const connector of connectors) {
    try {
      const metadata = await connector.getMetadata(CONNECTOR_METADATA_KEY);
      if (metadata) {
        // Check both directions (A->B or B->A) for bidirectional links
        const matchesDirection = 
          (metadata.startIssueId === startItemId && metadata.endIssueId === endItemId) ||
          (metadata.startIssueId === endItemId && metadata.endIssueId === startItemId);
        
        if (matchesDirection && (!linkTypeName || metadata.linkType === linkTypeName)) {
          return connector;
        }
      }
    } catch (e) {
      // Skip connectors without metadata
    }
  }
  
  return null;
}
