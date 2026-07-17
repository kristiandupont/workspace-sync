import type { WorkspaceDelta } from "../types";

/**
 * What tabs sharing one workspace say to each other.
 *
 * `since` on a delta is the version it was computed from: a receiver older than
 * that is missing the changes in between, so the delta alone would not make it
 * whole. `postMessage` uses structured clone, so the `Date` fields survive as
 * `Date`s and need no serialization of their own.
 */
export type WorkspaceMessage<T> =
  | { type: "delta"; since: Date; delta: WorkspaceDelta }
  | { type: "state-request" }
  | { type: "state"; version: Date; workspace: T };

export interface WorkspaceChannel<T> {
  post(message: WorkspaceMessage<T>): void;
  close(): void;
}

/**
 * A BroadcastChannel scoped to one workspace key. Messages reach every other
 * tab on the same key but never the sender, so there is no echo to filter.
 * Without BroadcastChannel support the channel is inert and tabs simply stay
 * independent.
 */
export function openWorkspaceChannel<T>(
  key: string,
  onMessage: (message: WorkspaceMessage<T>) => void,
): WorkspaceChannel<T> {
  const ChannelConstructor = globalThis.BroadcastChannel;
  if (!ChannelConstructor) {
    return { post: () => {}, close: () => {} };
  }

  const channel = new ChannelConstructor(`workspace:${key}`);
  channel.onmessage = (event: MessageEvent<WorkspaceMessage<T>>) =>
    onMessage(event.data);

  return {
    post: (message) => channel.postMessage(message),
    close: () => {
      channel.onmessage = null;
      channel.close();
    },
  };
}
