# Copyright 2018 The Outline Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# See versions at https://hub.docker.com/_/node/
FROM golang:1-alpine as ss-example

RUN apk add --no-cache git
RUN git clone -b ss-lib https://github.com/fortuna/go-shadowsocks2.git $(go env GOPATH)/src/github.com/shadowsocks/go-shadowsocks2
RUN git clone https://github.com/fortuna/ss-example.git $(go env GOPATH)/src/github.com/fortuna/ss-example
RUN go get github.com/fortuna/ss-example

FROM node:8.11.3-alpine

# Save metadata on the software versions we are using.
LABEL shadowbox.node_version=8.11.3

ARG GITHUB_RELEASE
LABEL shadowbox.github.release="${GITHUB_RELEASE}"

# lsof for Shadowbox, curl for detecting our public IP.
RUN apk add --no-cache lsof curl

COPY src/shadowbox/scripts/update_mmdb.sh /etc/periodic/weekly/update_mmdb
RUN /etc/periodic/weekly/update_mmdb

WORKDIR /root/shadowbox

COPY --from=ss-example /go/bin/ss-example .

# Install management service
COPY build/shadowbox/app app/
COPY src/shadowbox/package.json .
COPY yarn.lock .
# TODO: Replace with plain old "yarn" once the base image is fixed:
#       https://github.com/nodejs/docker-node/pull/639
RUN /opt/yarn-v$YARN_VERSION/bin/yarn install --prod

# Create default state directory.
RUN mkdir -p /root/shadowbox/persisted-state

COPY src/shadowbox/docker/cmd.sh /

CMD /cmd.sh
