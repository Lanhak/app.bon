#!/usr/bin/env sh
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WRAPPER_JAR="$DIR/gradle/wrapper/gradle-wrapper.jar"
WRAPPER_SHARED="$DIR/gradle/wrapper/gradle-wrapper-shared.jar"
WRAPPER_CLI="$DIR/gradle/wrapper/gradle-cli.jar"

if [ ! -f "$WRAPPER_JAR" ] || [ ! -f "$WRAPPER_SHARED" ] || [ ! -f "$WRAPPER_CLI" ]; then
  echo "Gradle wrapper jars are missing." >&2
  exit 1
fi

exec java -Xmx1024m -classpath "$WRAPPER_JAR:$WRAPPER_SHARED:$WRAPPER_CLI" org.gradle.wrapper.GradleWrapperMain "$@"
