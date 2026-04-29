/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  globalTeardown: "<rootDir>/tests/globalTeardown.js",
  collectCoverageFrom: [
    "utils/**/*.js",
    "agent/**/*.js",
    "services/**/*.js",
    "!tests/**"
  ]
};
