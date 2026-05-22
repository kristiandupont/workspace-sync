/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";

import { getWorkspaceDelta, parseInitialWorkspace } from "../delta";
import { buildInitialQuery } from "../queries";
import type { WorkspaceDefinition } from "../types";

interface KnexLike {
  raw(sql: string, bindings: (string | number | Date)[]): Promise<{ rows: any[] }>;
}

export function createWorkspaceRouter<TFoundation>(
  foundationDefinition: WorkspaceDefinition,
  options: {
    router: (routes: Record<string, any>) => any;
    protectedProcedure: any;
    getTrx: () => KnexLike;
    getUserId: (ctx: any) => number | string;
  },
) {
  const { router, protectedProcedure, getTrx, getUserId } = options;

  return router({
    getFoundation: protectedProcedure.query(async ({ ctx }: { ctx: any }) => {
      const trx = getTrx();
      const { sql, bindings } = buildInitialQuery(
        foundationDefinition,
        getUserId(ctx),
      );
      const response = await trx.raw(sql, bindings);
      if (!response.rows?.length || !response.rows[0]) {
        throw new Error(
          `No foundation workspace found for user ${String(getUserId(ctx))}`,
        );
      }
      return parseInitialWorkspace<TFoundation>(
        foundationDefinition,
        response.rows[0][`${foundationDefinition.name}_workspace`],
      );
    }),

    getFoundationDelta: protectedProcedure
      .input(z.object({ since: z.date() }))
      .query(async ({ ctx, input }: { ctx: any; input: { since: Date } }) => {
        const trx = getTrx();
        return getWorkspaceDelta(
          trx,
          foundationDefinition,
          getUserId(ctx),
          input.since,
        );
      }),
  });
}
