import * as path from 'path';

import { runTests } from 'vscode-test';
import * as fs from 'fs';

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './index');

		// The VS Code workspace under which the tests will run
		const testsWorkspace = process.env["CODE_TESTS_WORKSPACE"];
		if (!fs.existsSync(testsWorkspace)) {
			fs.mkdirSync(testsWorkspace, {recursive: true});
		}

		// Download VS Code, unzip it and run the integration test
		await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs: [testsWorkspace] });
	} catch (err) {
		console.error('Some tests failed');
		process.exit(1);
	}
}

main();