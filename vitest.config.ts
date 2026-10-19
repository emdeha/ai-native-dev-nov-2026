import { defineConfig } from "vitest/config";

type RunObservation = {
  readonly observed: number;
  readonly assertionsFailed: number;
  readonly setupFailed: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isIterable = (value: unknown): value is Iterable<unknown> =>
  typeof value === "object" &&
  value !== null &&
  Symbol.iterator in value &&
  typeof Reflect.get(value, Symbol.iterator) === "function";

const callMethod = (host: Record<string, unknown>, name: string): unknown => {
  const method = host[name];
  if (typeof method !== "function") {
    return undefined;
  }
  return Reflect.apply(method, host, []);
};

const readMember = (host: Record<string, unknown>, name: string): unknown => {
  const member = host[name];
  if (typeof member === "function") {
    return callMethod(host, name);
  }
  return member;
};

const listOf = (value: unknown): readonly unknown[] =>
  isIterable(value) ? [...value] : [];

const looksLikeAnAssertion = (error: unknown, depth: number): boolean => {
  if (!isRecord(error) || depth > 3) {
    return false;
  }
  const name = typeof error["name"] === "string" ? error["name"] : "";
  const message = typeof error["message"] === "string" ? error["message"] : "";
  const stack = typeof error["stack"] === "string" ? error["stack"] : "";
  const named =
    name.includes("AssertionError") ||
    message.includes("AssertionError") ||
    stack.includes("AssertionError");
  const compared = "expected" in error && "actual" in error;
  return named || compared || looksLikeAnAssertion(error["cause"], depth + 1);
};

const testsOfModule = (module: unknown): readonly unknown[] => {
  if (!isRecord(module)) {
    return [];
  }
  const children = module["children"];
  if (isRecord(children)) {
    const declared = callMethod(children, "allTests");
    if (isIterable(declared)) {
      return [...declared];
    }
  }
  const tasks = module["tasks"];
  if (!isIterable(tasks)) {
    return [];
  }
  return [...tasks].flatMap((task) => {
    if (!isRecord(task)) {
      return [];
    }
    return task["type"] === "test" ? [task] : testsOfModule(task);
  });
};

const stateOfTest = (test: unknown): { state: string; errors: readonly unknown[] } => {
  if (!isRecord(test)) {
    return { state: "unknown", errors: [] };
  }
  const result = readMember(test, "result");
  if (!isRecord(result)) {
    return { state: "unknown", errors: [] };
  }
  const state = typeof result["state"] === "string" ? result["state"] : "unknown";
  return { state, errors: listOf(result["errors"]) };
};

const observe = (modules: unknown, unhandled: unknown): RunObservation => {
  const moduleList = listOf(modules);
  const perModule = moduleList.map((module) => {
    const tests = testsOfModule(module);
    const moduleErrors = isRecord(module) ? listOf(readMember(module, "errors")) : [];
    const outcomes = tests.map(stateOfTest);
    const ran = outcomes.filter(
      (outcome) => outcome.state === "passed" || outcome.state === "pass" || outcome.state === "failed" || outcome.state === "fail",
    );
    const failed = outcomes.filter((outcome) => outcome.state === "failed" || outcome.state === "fail");
    const assertionFailures = failed.filter((outcome) =>
      outcome.errors.some((error) => looksLikeAnAssertion(error, 0)),
    );
    const collectionFailures = tests.length === 0 && moduleErrors.length > 0 ? 1 : 0;
    return {
      observed: ran.length,
      assertionsFailed: assertionFailures.length,
      setupFailed: failed.length - assertionFailures.length + collectionFailures,
    };
  });
  return perModule.reduce(
    (total, module) => ({
      observed: total.observed + module.observed,
      assertionsFailed: total.assertionsFailed + module.assertionsFailed,
      setupFailed: total.setupFailed + module.setupFailed,
    }),
    { observed: 0, assertionsFailed: 0, setupFailed: listOf(unhandled).length },
  );
};

const alreadyReported = { value: false };

const report = (modules: unknown, unhandled: unknown): void => {
  if (alreadyReported.value) {
    return;
  }
  alreadyReported.value = true;
  const observation = observe(modules, unhandled);
  const line = JSON.stringify({
    version: 1,
    observed: observation.observed,
    assertions_failed: observation.assertionsFailed,
    setup_failed: observation.setupFailed,
  });
  process.stdout.write(`DES-ORACLE-OBSERVATION: ${line}\n`);
};

const observationReporter = {
  onTestRunEnd(testModules: unknown, unhandledErrors: unknown): void {
    report(testModules, unhandledErrors);
  },
  onFinished(files: unknown, errors: unknown): void {
    report(files, errors);
  },
};

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    reporters: ["default", observationReporter],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
