// @ts-check

const path = require("node:path");
const { recase } = require("@kristiandupont/recase");
const { generateWorkspaceType } = require("./generateWorkspaceType");
const {
  generateWorkspaceDefinition,
} = require("./generateWorkspaceDefinition");
const { useKanelContext } = require("kanel");

const toPascalCase = recase(null, "pascal");
exports.toPascalCase = toPascalCase;
const toCamelCase = recase(null, "camel");
exports.toCamelCase = toCamelCase;

/**
 * @param {import("./WorkspaceConfig").WorkspaceConfig[]} workspaces
 * @returns {import("kanel").PreRenderHookV4}
 */
function makeGenerateWorkspace(workspaces) {
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
