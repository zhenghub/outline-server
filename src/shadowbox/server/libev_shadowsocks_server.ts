// Copyright 2018 The Outline Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as child_process from 'child_process';
import * as dgram from 'dgram';
import * as dns from 'dns';
import * as events from 'events';
import {makeConfig, SIP002_URI} from 'ShadowsocksConfig/shadowsocks_config';

import * as logging from '../infrastructure/logging';
import {ShadowsocksInstance, ShadowsocksServer} from '../model/shadowsocks_server';

// Runs shadowsocks-libev server instances.
export class LibevShadowsocksServer implements ShadowsocksServer {
  // Old shadowsocks instances had been started with the aes-128-cfb encryption
  // method, while new instances specify which method to use.
  private DEFAULT_METHOD = 'aes-128-cfb';

  private portProcesses = new Map<number, child_process.ChildProcess>();
  private portKeys = new Map<number, Set<string>>();

  constructor(private publicAddress: string, private verbose: boolean) {}

  private startPort(portNumber: number, keys: Set<string>) {
    let portProcess = this.portProcesses.get(portNumber);
    if (portProcess) {
      portProcess.kill();
    }
    if (keys.size === 0) {
      return;
    }
    // TODO(fortuna): Pass keys in a safer way that doesn't show on process listing.
    // TODO(fortuna): Bind monitor to a unix domain socket.
    const commandArguments = ['-s', `:${portNumber.toString()}`, '-metrics', 'localhost:8080'];
    for (const key of this.portKeys.get(portNumber)) {
      commandArguments.push('-u', key);
    }


    logging.info('starting ss-example with args: ' + commandArguments.join(' '));
    // TODO(fortuna): Re-add this on the final binary
    // if (this.verbose) {
    //   // Make the Shadowsocks output verbose in debug mode.
    //   commandArguments.push('-v');
    // }
    portProcess = child_process.spawn('/root/shadowbox/ss-example', commandArguments);
    this.portProcesses.set(portNumber, portProcess);

    portProcess.on('error', (error) => {
      logging.error(`Error spawning server on port ${portNumber}: ${error}`);
    });
    // TODO(fortuna): Add restart logic.
    portProcess.on('exit', (code, signal) => {
      logging.info(`Server on port ${portNumber} has exited. Code: ${code}, Signal: ${signal}`);
    });
    // TODO(fortuna): Disable this for production.
    // TODO(fortuna): Consider saving the output and expose it through the manager service.
    portProcess.stdout.pipe(process.stdout);
    portProcess.stderr.pipe(process.stderr);
  }

  public startInstance(
      portNumber: number, password: string, statsSocket: dgram.Socket,
      encryptionMethod = this.DEFAULT_METHOD): Promise<ShadowsocksInstance> {
    logging.info(`Starting server on port ${portNumber}`);

    const statsAddress = statsSocket.address();
    let keys = this.portKeys.get(portNumber);
    if (!keys) {
      keys = new Set<string>();
      this.portKeys.set(portNumber, keys);
    }
    const key = `${encryptionMethod}:${password}`;
    keys.add(key);
    this.startPort(portNumber, keys);
    // Generate a SIP002 access url.
    const accessUrl = SIP002_URI.stringify(makeConfig({
      host: this.publicAddress,
      port: portNumber,
      method: encryptionMethod,
      password,
      outline: 1,
    }));

    const stopFn = () => {
      this.stopInstance(portNumber, key);
    };
    return Promise.resolve(new PortShadowsocksServerInstance(
        stopFn, portNumber, password, encryptionMethod, accessUrl, statsSocket));
  }

  public stopInstance(portNumber: number, key: string) {
    const keys = this.portKeys.get(portNumber);
    keys.delete(key);
    this.startPort(portNumber, keys);
  }
}

class PortShadowsocksServerInstance implements ShadowsocksInstance {
  private eventEmitter = new events.EventEmitter();
  private INBOUND_BYTES_EVENT = 'inboundBytes';

  constructor(
      private stopFn: Function, public portNumber: number, public password,
      public encryptionMethod: string, public accessUrl: string,
      private statsSocket: dgram.Socket) {}

  public stop() {
    logging.info(`Stopping server on port ${this.portNumber}`);
    this.stopFn();
  }

  // onInboundBytes only reports inbound bytes, received from the client or from the target.
  //
  // This measure under-estimates outbound traffic because:
  // 1) The traffic to and from the client has overhead from Shadowsocks
  // 2) The overhead on the traffic to the client is larger than on the traffic from the client
  //    because, from the client perspective, download traffic is usually larger than upload.
  //
  // The measure is calculated here:
  // https://github.com/shadowsocks/shadowsocks-libev/blob/a16826b83e73af386806d1b51149f8321820835e/src/server.c#L172
  public onInboundBytes(callback: (bytes: number, ipAddresses: string[]) => void) {
    if (this.eventEmitter.listenerCount(this.INBOUND_BYTES_EVENT) === 0) {
      this.createStatsListener();
    }
    this.eventEmitter.on(this.INBOUND_BYTES_EVENT, callback);
  }

  private createStatsListener() {
    let lastInboundBytes = 0;
    this.statsSocket.on('message', (buf: Buffer) => {
      let statsMessage;
      try {
        statsMessage = parseStatsMessage(buf);
      } catch (err) {
        logging.error('error parsing stats: ' + buf + ', ' + err);
        return;
      }
      if (statsMessage.portNumber !== this.portNumber) {
        // Ignore stats for other ss-servers, which post to the same statsSocket.
        return;
      }
      const delta = statsMessage.totalInboundBytes - lastInboundBytes;
      if (delta > 0) {
        this.getConnectedClientIPAddresses()
          .then((ipAddresses: string[]) => {
            lastInboundBytes = statsMessage.totalBytesTransferred;
            this.eventEmitter.emit(this.INBOUND_BYTES_EVENT, delta, ipAddresses);
          })
          .catch((err) => {
            logging.error(`Unable to get client IP addresses ${err}`);
          });
      }
    });
  }

  private getConnectedClientIPAddresses(): Promise<string[]> {
    const lsofCommand = `lsof -i tcp:${this.portNumber} -n -P -Fn ` +
      " | grep '\\->'" +        // only look at connection lines (e.g. skips "p8855" and "f60")
      " | sed 's/:\\d*$//g'" +  // remove p
      " | sed 's/n\\S*->//g'" + // remove first part of address
      " | sed 's/\\[//g'" +     // remove [] (used by ipv6)
      " | sed 's/\\]//g'" +     // remove ] (used by ipv6)
      " | sort | uniq";         // remove duplicates
    return this.execCmd(lsofCommand).then((output: string) => {
      return output.split('\n');
    });
  }

  private execCmd(cmd: string): Promise<string> {
    return new Promise((fulfill, reject) => {
      child_process.exec(cmd, (error: child_process.ExecError, stdout: string, stderr: string) => {
        if (error) {
          reject(error);
        } else {
          fulfill(stdout.trim());
        }
      });
    });
  }
}

interface StatsMessage {
  portNumber: number;
  totalInboundBytes: number;
}

function parseStatsMessage(buf): StatsMessage {
  const jsonString = buf.toString()
                         .substr('stat: '.length)  // remove leading "stat: "
                         .replace(/\0/g, '');      // remove trailing null terminator
  // statObj is in the form {"port#": totalBytesTransferred}, where
  // there is always only 1 port# per JSON object. If there are multiple
  // ss-servers communicating to the same manager, we will get multiple
  // message events.
  const statObj = JSON.parse(jsonString);
  // Object.keys is used here because node doesn't support Object.values.
  const portNumber = parseInt(Object.keys(statObj)[0], 10);
  const totalInboundBytes = statObj[portNumber];
  return { portNumber, totalInboundBytes };
}
