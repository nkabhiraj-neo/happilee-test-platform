/**
 * cucumber-js does not accept `--config` with a `.ts` extension.
 * Options here must stay in sync with `e2e/cucumber.config.ts`.
 */
module.exports = {
  default: {
    require: [
      "e2e/register-ts.cjs",
      "e2e/support/world.ts",
      "e2e/support/hooks.ts",
      "e2e/steps/**/*.ts",
    ],
    paths: ["e2e/features/**/*.feature"],
    format: ["progress"],
    failFast: true,
    timeout: 60000,
  },
};
