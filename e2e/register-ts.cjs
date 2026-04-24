const path = require("path");
require("ts-node").register({
  project: path.join(__dirname, "..", "tsconfig.e2e.json"),
  transpileOnly: true,
});
