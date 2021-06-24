#/bin/sh

echo "Compiling typescript files"
(cd .. && npm run build)

echo "Embedding language server into extension"
(cd embedded-language-server && npm ci --production)

ALERT_START="\033[33m"
ALERT_END="\033[0m"
echo -e "${ALERT_START}NOTE:${ALERT_END}"
echo -e "${ALERT_START}Clean installing npm packages for production. This will remove dev dependencies from node_modules${ALERT_END}"
echo -e "${ALERT_START}If publishing from your local machine make sure to rerun 'npm install' to retrieve your dev dependencies${ALERT_END}"
npm ci --production