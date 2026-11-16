export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { getServerEnv } = await import("./server/env");
    try {
      getServerEnv();
    } catch (error) {
      // Next can keep listening after a rejected instrumentation hook.
      // A bad configuration must terminate the server before accepting requests.
      console.error(
        error instanceof Error
          ? error.message
          : "Invalid server configuration.",
      );
      process.exit(1);
    }
  }
}
