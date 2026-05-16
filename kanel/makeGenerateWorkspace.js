// @ts-check

const path = require("node:path");
const { generateWorkspaceType } = require("./generateWorkspaceType");
const {
  generateWorkspaceDefinition,
} = require("./generateWorkspaceDefinition");
function toCamelCase(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
exports.toCamelCase = toCamelCase;

function toPascalCase(s) {
  const c = toCamelCase(s);
  return c.charAt(0).toUpperCase() + c.slice(1);
}
exports.toPascalCase = toPascalCase;

/**
 * @param {import("./WorkspaceConfig").WorkspaceConfig[]} workspaces
 * @returns {import("kanel").PreRenderHookV4}
 */
function makeGenerateWorkspace(workspaces, useKanelContext) {
  return async (outputAcc) => {
    const output = { ...outputAcc };
    const context = useKanelContext();

    for (const workspace of workspaces) {
      const schema = context.schemas[workspace.schema];
      if (!schema) {
        throw new Error(
          `Schema "${workspace.schema}" not found for workspace "${workspace.name}"`,
        );
      }
      console.info("Generating workspace for", schema.name);

      const workspaceDefinition = generateWorkspaceDefinition(
        workspace,
        schema,
      );

      const workspaceType = generateWorkspaceType(
        workspace,
        schema,
        context.config.outputPath,
      );

      const workspacePath = path.join(
        context.config.outputPath,
        "workspace",
        workspace.name,
      );

      output[workspacePath] = {
        fileType: "typescript",
        declarations: [workspaceDefinition, workspaceType],
      };
    }

    return output;
  };
}

exports.makeGenerateWorkspace = makeGenerateWorkspace;
