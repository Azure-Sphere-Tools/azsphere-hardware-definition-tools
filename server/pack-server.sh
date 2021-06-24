#/bin/sh

# This script packs the compiled language server into a tarball under 'packed/language-server.tar.gz'
# so that it can be easily referenced as a dependency in the vscode/visualstudio extensions

SCRIPT_DIR="$(dirname $(readlink -f $0))"
cd $SCRIPT_DIR
(cd .. && npm run build)
npm pack
rm -rf ./packed && mkdir -p packed && mv *.tgz packed/language-server.tar.gz