import { createConnection, ProposedFeatures } from "vscode-languageserver/node";
import { startLanguageServer } from "./server";

// if communicating with language server via standard input/output
// modify console.log to use warn instead to avoid sending log messages that the client might interpret as commands
if (process.argv.includes('--stdio')) {
  console.log = console.warn;
}

// do not reference connection in other files/modules as it is expensive to create and can prevent tests from running in parallel
const connection = createConnection(ProposedFeatures.all);
startLanguageServer(connection);