import { DEFAULT_CONNECTOR_STYLE, type ConnectorStyle } from '../constants';

/** Metadata key for identifying plugin-managed connectors. */
const CONNECTOR_METADATA_KEY = 'youtrack-connector';

/** Resolve connector style for a YouTrack link type. Falls back to the generic default. */
export function getStyleForLinkType(
  linkTypeName: string,
  configMap: Record<string, ConnectorStyle> | undefined,
): ConnectorStyle {
  return configMap?.[linkTypeName] ?? { ...DEFAULT_CONNECTOR_STYLE };
}

/** Default style for a newly-discovered link type. */
export function getDefaultStyleForLinkType(): ConnectorStyle {
  return { ...DEFAULT_CONNECTOR_STYLE };
}

/** Create a connector between two shapes using the provided style. */
export async function createIssueConnector(
  startItem: any,
  endItem: any,
  linkTypeName: string,
  sourceToTarget: string,
  style: ConnectorStyle,
): Promise<any> {
  const connectorStyle = {
    strokeStyle: style.strokeStyle,
    strokeWidth: style.strokeWidth,
    strokeColor: style.strokeColor,
    endStrokeCap: style.endStrokeCap,
    startStrokeCap: 'none' as const,
  };

  const connector = await miro.board.createConnector({
    shape: 'curved',
    style: connectorStyle,
    start: { item: startItem.id, snapTo: 'auto' },
    end: { item: endItem.id, snapTo: 'auto' },
  } as any);

  await connector.setMetadata(CONNECTOR_METADATA_KEY, {
    linkType: linkTypeName,
    sourceToTarget,
    startIssueId: startItem.id,
    endIssueId: endItem.id,
  });

  return connector;
}

/** All plugin-managed connectors on the board. */
export async function getPluginConnectors(): Promise<any[]> {
  const connectors = await miro.board.get({ type: 'connector' });
  const pluginConnectors: any[] = [];
  for (const connector of connectors) {
    const metadata = await connector.getMetadata(CONNECTOR_METADATA_KEY).catch(() => null);
    if (metadata) pluginConnectors.push(connector);
  }
  return pluginConnectors;
}

export async function removeConnector(connector: any): Promise<void> {
  await miro.board.remove(connector);
}

export const PLUGIN_CONNECTOR_METADATA_KEY = CONNECTOR_METADATA_KEY;
