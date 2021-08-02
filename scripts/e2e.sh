#!/usr/bin/env bash

# Exit and fail if any commands fail
set -e

# Run unit tests
# TODO remove 'LANGUAGE_SERVER_MODE=TEST' when connection issue fixed in server.ts
LANGUAGE_SERVER_MODE=TEST ./node_modules/mocha/bin/mocha --ui tdd --color --timeout 10s server/dist/test/**.test.js

if [ $1 == "ONLY_UNIT_TESTS" ]; then
  exit 0
fi
# Run e2e tests
export CODE_TESTS_PATH="$(pwd)/vscode-extension/dist/test"
export CODE_TESTS_WORKSPACE="$(pwd)/testFixture"

node "$(pwd)/vscode-extension/dist/test/runTestsInVsCode"