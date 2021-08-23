import * as path from 'path';
import * as cucumber from '@cucumber/cucumber';
import { ICliRunResult } from "@cucumber/cucumber/lib/cli";
import * as stream from "stream";


export async function run(): Promise<void> {
	const extensionDir = path.resolve(__dirname, "../..");
	const featureFilesPath = path.resolve(path.join(__dirname, "../../../features/"));
	const featureStepsPath = path.resolve(path.join(__dirname, "./steps.test.js"));


	// The cucumberRunner will progressively fill the cucumberReport through cucumberStdout.
	// We cannot directly used process.stdout to display the report content because the tests
	// run in a separate process
	let cucumberReport = "";
	const cucumberStdout = new stream.Transform({
		write: function (chunk, encoding, next) {
			cucumberReport += (chunk.toString());
			next();
		}
	});

	const cucumberRunner = new cucumber.Cli({
		argv: [featureFilesPath, '--require', featureFilesPath, '--require', featureStepsPath, '--format', 'html:cucumber-report.html'],
		cwd: extensionDir,
		stdout: cucumberStdout
	});
	
	let result: ICliRunResult;
	try {
		console.log(`Running cucumber tests for features under ${featureFilesPath}`);
		result = await cucumberRunner.run();
	} catch (error) {
		console.error("A fatal error occurred while running cucumber tests:\n" + error);
		process.exit(1);
	} finally {
		// print the report using console.log (this works because 'vscode-test.runTests' 
		// patches console.log to print to the original process instead of the cucumber test process' stdout)
		console.log(cucumberReport);
		console.log(`An html report is also available under ${path.join(extensionDir, "cucumber-report.html")}`);
	}

	if (!result.success) {
		process.exit(1);
	}
}