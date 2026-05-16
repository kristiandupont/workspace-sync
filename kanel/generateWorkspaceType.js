// @ts-check

const path = require("path");

function toCamelCase(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function toPascalCase(s) {
  const c = toCamelCase(s);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/**
 * @param {import("./WorkspaceConfig").WorkspaceConfig} config
 * @param {import('extract-pg-schema').Schema} schema
 * @param {string} outputPath
 * @returns {import('kanel').InterfaceDeclaration}
 */
const generateWorkspaceType = (config, schema, outputPath) => {
  const { name, anchor, tables } = config;
  const tableNames = [anchor, ...Object.keys(tables)];

  const typeName = toPascalCase(name);
  return {
    declarationType: "interface",
    exportAs: "named",
    name: typeName,
    properties: [
      ...tableNames.map((tableName) => {
        let propertyTypeName = toPascalCase(tableName);
        const omittedTypes = tables[tableName]?.omittedColumns;
        if (omittedTypes) {
          propertyTypeName = `Omit<${propertyTypeName}, ${omittedTypes
            .map((t) => `'${t}'`)
            .join(" | ")}>`;
        }

        return {
          name: `${toCamelCase(tableName)}s`,
          typeName: propertyTypeName,
          dimensions: 1,
          isNullable: false,
          isOptional: false,
        };
      }),
      {
        name: "version",
        typeName: "Date",
        dimensions: 0,
        isNullable: false,
        isOptional: false,
      },
    ],
    typeImports: tableNames.map((tableName) => ({
      name: toPascalCase(tableName),
      isDefault: true,
      path: path.join(outputPath, schema.name, toPascalCase(tableName)),
      importAsType: true,
      isAbsolute: false,
    })),
  };
};

exports.generateWorkspaceType = generateWorkspaceType;
