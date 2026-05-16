// @ts-check

function toCamelCase(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * @typedef {Object} EnrichedWorkspaceTableConfig
 * @property {string} link
 * @property {string[]} omittedColumns
 * @property {string[]} timestampColumns
 */

/**
 * @typedef {Object} EnrichedWorkspaceConfig
 * @property {string} name
 * @property {string} schema
 * @property {string} anchor
 * @property {Record<string, EnrichedWorkspaceTableConfig>} tables
 */

/**
 * @param {import("./WorkspaceConfig").WorkspaceConfig} workspace
 * @param {import('extract-pg-schema').Schema} schema
 * @returns {import('kanel').ConstantDeclaration}
 */
function generateWorkspaceDefinition(workspace, schema) {
  const enrichedWorkspace = {
    ...workspace,
    tables: Object.fromEntries(
      Object.entries(workspace.tables).map(([tableName, tableConfig]) => {
        const tableSchema = schema.tables.find((t) => t.name === tableName);
        if (!tableSchema) {
          throw new Error(
            `Workspace table "${tableName}" not found in schema "${schema.name}"`,
          );
        }
        const timestampColumns = tableSchema.columns.filter(
          (c) => c.type.fullName === "pg_catalog.timestamptz",
        );
        return [
          tableName,
          {
            link: tableConfig.link,
            omittedColumns: tableConfig.omittedColumns || [],
            timestampColumns: timestampColumns.map((c) => c.name),
          },
        ];
      }),
    ),
  };
  /** @type {import('kanel').ConstantDeclaration} */
  const workspaceDefinition = {
    declarationType: "constant",
    name: toCamelCase(workspace.name) + "Definition",
    exportAs: "named",
    type: undefined,
    value: JSON.stringify(enrichedWorkspace, null, 2).split("\n"),
  };
  return workspaceDefinition;
}

exports.generateWorkspaceDefinition = generateWorkspaceDefinition;
