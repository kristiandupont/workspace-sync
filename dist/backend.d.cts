import { t as WorkspaceDefinition } from "./types-CDHUSqEO.cjs";
//#region src/backend/index.d.ts
interface KnexLike {
  raw(sql: string, bindings: (string | number | Date)[]): Promise<{
    rows: any[];
  }>;
}
export declare function createWorkspaceRouter<TFoundation>(foundationDefinition: WorkspaceDefinition, options: {
  router: (routes: Record<string, any>) => any;
  protectedProcedure: any;
  getTrx: () => KnexLike;
  getUserId: (ctx: any) => number | string;
}): any;
//#endregion
//# sourceMappingURL=backend.d.cts.map