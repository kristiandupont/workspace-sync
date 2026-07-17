import { describe, expect, it, vi } from "vitest";

import { electDriver } from "./driver-election";

// Node's `navigator.locks` is a real Web Locks implementation — mutual
// exclusion, queued handover, AbortError on abort — so these run against the
// actual API rather than a mock of our assumptions about it.

let keySeed = 0;
/** Locks are process-wide and outlive a test, so never reuse a key. */
const uniqueKey = () => `test-${keySeed++}`;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("electDriver", () => {
  it("makes a lone tab the driver", async () => {
    const onBecomeDriver = vi.fn();
    const stop = electDriver({
      key: uniqueKey(),
      onBecomeDriver,
      onResignDriver: vi.fn(),
    });
    await tick();

    expect(onBecomeDriver).toHaveBeenCalledTimes(1);
    stop();
  });

  it("elects only the first of two tabs", async () => {
    const key = uniqueKey();
    const first = vi.fn();
    const second = vi.fn();

    const stopFirst = electDriver({
      key,
      onBecomeDriver: first,
      onResignDriver: vi.fn(),
    });
    await tick();
    const stopSecond = electDriver({
      key,
      onBecomeDriver: second,
      onResignDriver: vi.fn(),
    });
    await tick();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    stopFirst();
    stopSecond();
  });

  // The point of the lock: the surviving tab takes over on its own, with no
  // heartbeat or timeout to get wrong.
  it("hands the role to a waiting tab when the driver goes away", async () => {
    const key = uniqueKey();
    const second = vi.fn();

    const stopFirst = electDriver({
      key,
      onBecomeDriver: vi.fn(),
      onResignDriver: vi.fn(),
    });
    await tick();
    const stopSecond = electDriver({
      key,
      onBecomeDriver: second,
      onResignDriver: vi.fn(),
    });
    await tick();
    expect(second).not.toHaveBeenCalled();

    stopFirst();
    await tick();

    expect(second).toHaveBeenCalledTimes(1);
    stopSecond();
  });

  it("resigns when a driver tears down", async () => {
    const onResignDriver = vi.fn();
    const stop = electDriver({
      key: uniqueKey(),
      onBecomeDriver: vi.fn(),
      onResignDriver,
    });
    await tick();
    stop();

    expect(onResignDriver).toHaveBeenCalledTimes(1);
  });

  it("does not resign a role it never held", async () => {
    const key = uniqueKey();
    const onResignDriver = vi.fn();

    const stopFirst = electDriver({
      key,
      onBecomeDriver: vi.fn(),
      onResignDriver: vi.fn(),
    });
    await tick();
    const stopSecond = electDriver({
      key,
      onBecomeDriver: vi.fn(),
      onResignDriver,
    });
    await tick();

    stopSecond();
    await tick();

    expect(onResignDriver).not.toHaveBeenCalled();
    stopFirst();
  });

  // A tab torn down while queued must not quietly become the driver when the
  // lock frees up — it would poll on behalf of a provider that is gone.
  it("does not take the role after being torn down while queued", async () => {
    const key = uniqueKey();
    const second = vi.fn();

    const stopFirst = electDriver({
      key,
      onBecomeDriver: vi.fn(),
      onResignDriver: vi.fn(),
    });
    await tick();
    const stopSecond = electDriver({
      key,
      onBecomeDriver: second,
      onResignDriver: vi.fn(),
    });
    await tick();

    stopSecond();
    stopFirst();
    await tick();

    expect(second).not.toHaveBeenCalled();
  });

  describe("without Web Locks", () => {
    // Android WebView before Web Locks: nobody can be elected, so everybody
    // drives themselves — which is what tabs did before this existed.
    it("makes every tab its own driver", async () => {
      vi.stubGlobal("navigator", {});
      const key = uniqueKey();
      const first = vi.fn();
      const second = vi.fn();

      const stopFirst = electDriver({
        key,
        onBecomeDriver: first,
        onResignDriver: vi.fn(),
      });
      const stopSecond = electDriver({
        key,
        onBecomeDriver: second,
        onResignDriver: vi.fn(),
      });

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);

      stopFirst();
      stopSecond();
      vi.unstubAllGlobals();
    });
  });
});
