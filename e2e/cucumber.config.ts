/**
 * Mirror of `e2e/cucumber.config.cjs`. cucumber-js only loads `.cjs`/`.js`/`.json` for `--config`.
 * npm scripts use: `cucumber-js --config e2e/cucumber.config.cjs`
 */
const config = {
  default: {
    require: [
      "e2e/register-ts.cjs",
      "e2e/support/world.ts",
      "e2e/support/hooks.ts",
      "e2e/steps/**/*.ts",
    ],
    paths: ["e2e/features/**/*.feature"],
    format: ["progress"],
    timeout: 60000,
  },
} as const;

export default config;
