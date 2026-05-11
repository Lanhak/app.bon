@echo off
set DIR=%~dp0
set WRAPPER_JAR=%DIR%gradle\wrapper\gradle-wrapper.jar
set WRAPPER_SHARED=%DIR%gradle\wrapper\gradle-wrapper-shared.jar
set WRAPPER_CLI=%DIR%gradle\wrapper\gradle-cli.jar

if not exist "%WRAPPER_JAR%" (
  echo gradle-wrapper.jar is missing.
  exit /b 1
)

if not exist "%WRAPPER_SHARED%" (
  echo gradle-wrapper-shared.jar is missing.
  exit /b 1
)

if not exist "%WRAPPER_CLI%" (
  echo gradle-cli.jar is missing.
  exit /b 1
)

java -Xmx1024m -classpath "%WRAPPER_JAR%;%WRAPPER_SHARED%;%WRAPPER_CLI%" org.gradle.wrapper.GradleWrapperMain %*
