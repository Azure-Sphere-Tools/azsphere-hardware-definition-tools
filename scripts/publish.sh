#!/bin/bash

publish() {
  PROJECT=$(cat $1/package.json 2>/dev/null | jq -r '.name')
  PUBLISHER=$(cat $1/package.json 2>/dev/null | jq -r '.publisher')

  if [ -z "${PROJECT}" ] \
  || [ "${PROJECT}" == "null" ] \
  || [ -z "${PUBLISHER}" ] \
  || [ "${PUBLISHER}" == "null" ]
  then
    echo "Project name and/or publisher is missing in $1/package.json"
    return 1
  fi

  VERSION=$(cat $1/package.json 2>/dev/null | jq -r '.version')
  PUBLIC_VERSION=$(npx vsce show ${PUBLISHER}.${PROJECT} --json | jq -r '.versions[0].version' 2>/dev/null)

  printf '%s\n%s\n' ${VERSION} ${PUBLIC_VERSION} | sort --check=quiet --version-sort
  OUTDATED=$?

  # printf '%s - %s : %s\n' ${VERSION} ${PUBLIC_VERSION} ${OUTDATED}

  if [ ${OUTDATED} -ne 0 ]
  then
    echo 'Publishing VSCode extension to Marketplace'

    # Publish existing package if it exists
    if [ -f $1/${PROJECT}-${VERSION}.vsix ]
    then
      cd $1; npx vsce publish --packagePath ${PROJECT}-${VERSION}.vsix -p $2 2>/dev/null 2>/dev/null
    else
      cd $1; npx vsce publish -p $2 2>/dev/null
    fi

    return 0
  fi

  echo "Skipped"
  echo "Update version in $1/package.json to publish"
}

if [ "$#" -ne 2 ]; then
  echo "usage: publish.sh PATH TOKEN"
  echo "Build and publish extension under PATH to Visual Studio Marketplace."
  exit
fi

publish $1 $2
