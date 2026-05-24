import { t as WorkspaceDefinition } from "./types-D6ODtdDM.cjs";

//#region src/backend/index.d.ts
interface KnexLike {
  raw(sql: string, bindings: (string | number | Date)[]): Promise<{
    rows: any[];
  }>;
}
declare function createWorkspaceRouter<TFoundation>(foundationDefinition: WorkspaceDefinition, options: {
  router: (routes: Record<string, any>) => any;
  protectedProcedure: any;
  getTrx: () => KnexLike;
  getUserId: (ctx: any) => number | string;
}): any;
//#endregion
export { createWorkspaceRouter };
//# sourceMappingURL=backend.d.cts.map