# The Ruby oracle: stock Decko 0.20.0 (card 1.110.0) on SQLite, with the
# harness's deck builder and adapter. Build from reference-harness/oracle:
#
#   docker build -t decko-reference-oracle:0.20.0 reference-harness/oracle
#
# The image holds no deck; the runner mounts a session directory per run.
FROM ruby:3.3-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential git libsqlite3-dev libyaml-dev imagemagick \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /oracle
COPY app/Gemfile app/Gemfile.lock app/
# The lockfile was resolved on Windows; add the Linux platform without
# changing any pinned version.
RUN cd app \
 && bundle lock --add-platform x86_64-linux aarch64-linux \
 && bundle config set --local without "development test" \
 && bundle install --jobs 4

COPY . .
RUN chmod +x build-deck.sh run-adapter.sh
