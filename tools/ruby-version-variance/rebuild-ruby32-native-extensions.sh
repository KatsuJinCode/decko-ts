#!/usr/bin/env bash
# Rebuilds the native extensions under Ruby 3.2.11 that ship with mismatched
# toolchain DLL imports.
#
# Mechanism: RubyInstaller 3.2.11-1's prebuilt gems were compiled against a GCC
# whose runtime DLLs are named libssp-0.dll and libgcc_s_dw2-1.dll. The MSYS2
# toolchain this machine has (and the one rbs/date were rebuilt against) ships
# libgcc_s_seh-1.dll instead, so those .so files fail to load with
# "126: The specified module could not be found" even though every DLL name
# resolves inside MSYS2. Rebuilding each extension against the local toolchain
# re-links them to DLLs that are actually present.
#
# Only the compiled artifact changes. No gem version, no gem source, no
# Gemfile.lock entry.
#
#   bash rebuild-ruby32-native-extensions.sh

set -uo pipefail

RUBY_BIN="/c/Ruby32-x64/bin"
MSYS_UCRT="/c/Ruby32-x64/msys64/ucrt64/bin"
MSYS_USR="/c/Ruby32-x64/msys64/usr/bin"
export PATH="$MSYS_UCRT:$MSYS_USR:$RUBY_BIN:$PATH"

GEMDIR="C:/Ruby32-x64/lib/ruby/gems/3.2.0/gems"

# Every .so under 3.2 that imports the DLL names the local toolchain lacks.
AFFECTED="bigdecimal-4.1.3 cgi-0.5.2 erb-6.0.7 eventmachine-1.2.7 io-console-0.9.4 json-3.0.2 prism-1.9.0 racc-1.8.1 rbs-4.1.3 sassc-2.4.0 thin-2.0.1 websocket-driver-0.8.2"

fail=0
for g in $AFFECTED; do
  name="${g%-*}"
  ver="${g##*-}"
  printf '=== rebuilding %s (%s)\n' "$name" "$ver"
  if "$RUBY_BIN/gem.cmd" pristine "$name" --version "$ver" > "/tmp/pristine-$name.log" 2>&1; then
    echo "    ok"
  else
    echo "    FAILED (see /tmp/pristine-$name.log)"
    tail -5 "/tmp/pristine-$name.log"
    fail=1
  fi
done

echo
echo "=== verifying each rebuilt extension loads"
for g in $AFFECTED; do
  name="${g%-*}"
  # Load the extension file directly: requiring the gem would drag in the whole
  # stack, and what is being checked here is only the .so's own imports.
  so=$(find "$GEMDIR/$g" -name '*.so' 2>/dev/null | head -1)
  if [ -n "$so" ]; then
    if "$RUBY_BIN/ruby.exe" -e "require '${so%.so}'" >/dev/null 2>&1; then
      echo "    ok       $g"
    else
      echo "    FAILED   $g ($so)"
      fail=1
    fi
  fi
done

exit $fail