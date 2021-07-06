#/bin/sh

# Exit and fail if any commands fail
set -e

SCRIPT_DIR="$(dirname $(readlink -f $0))"

echo "Compiling typescript files"
cd $SCRIPT_DIR
cd .. && npm run build

echo "Embedding language server into extension"
cd $SCRIPT_DIR
cd embedded-language-server
# need to run preinstall manually because of bug with npm ci
npm run preinstall && npm ci --production

cd $SCRIPT_DIR
ALERT_START="\033[33m"
ALERT_END="\033[0m"
echo -e "${ALERT_START}NOTE:${ALERT_END}"
echo -e "${ALERT_START}Clean installing npm packages for production. This will remove dev dependencies from node_modules${ALERT_END}"
echo -e "${ALERT_START}If publishing from your local machine make sure to rerun 'npm install' to retrieve your dev dependencies${ALERT_END}"
npm ci --production