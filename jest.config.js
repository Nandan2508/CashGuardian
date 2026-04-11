/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  collectCoverageFrom: [
    "utils/**/*.js",
    "agent/**/*.js",
    "services/**/*.js",
    "!tests/**"
  ]
};
