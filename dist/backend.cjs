Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_delta = require("./delta-BEC7s1R_.cjs");
let zod = require("zod");
//#region src/backend/index.ts
function createWorkspaceRouter(foundationDefinition, options) {
	const { router, protectedProcedure, getTrx, getUserId } = options;
	return router({
		getFoundation: protectedProcedure.query(async ({ ctx }) => {
			const trx = getTrx();
			const { sql, bindings } = require_delta.buildInitialQuery(foundationDefinition, getUserId(ctx));
			const response = await trx.raw(sql, bindings);
			if (!response.rows?.length || !response.rows[0]) throw new Error(`No foundation workspace found for user ${String(getUserId(ctx))}`);
			return require_delta.parseInitialWorkspace(foundationDefinition, response.rows[0][`${foundationDefinition.name}_workspace`]);
		}),
		getFoundationDelta: protectedProcedure.input(zod.z.object({ since: zod.z.date() })).query(async ({ ctx, input }) => {
			return require_delta.getWorkspaceDelta(getTrx(), foundationDefinition, getUserId(ctx), input.since);
		})
	});
}
//#endregion
exports.createWorkspaceRouter = createWorkspaceRouter;

//# sourceMappingURL=backend.cjs.map