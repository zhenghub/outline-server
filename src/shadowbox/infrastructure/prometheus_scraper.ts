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
import * as fs from 'fs';
import * as jsyaml from 'js-yaml';
import * as mkdirp from 'mkdirp';
import * as path from 'path';

import * as logging from '../infrastructure/logging';

export function runPrometheusScraper(
    args: string[], configFilename: string, configJson: {}): Promise<child_process.ChildProcess> {
  mkdirp.sync(path.dirname(configFilename));
  const ymlTxt = jsyaml.safeDump(configJson, {'sortKeys': true});
  return new Promise((resolve, reject) => {
    fs.writeFile(configFilename, ymlTxt, 'utf-8', (err) => {
      if (err) {
        reject(err);
      }
      const commandArguments = ['--config.file', configFilename];
      commandArguments.push(...args);
      const runProcess = child_process.spawn('/root/shadowbox/bin/prometheus', commandArguments);
      runProcess.on('error', (error) => {
        logging.error(`Error spawning prometheus: ${error}`);
      });
      // TODO(fortuna): Add restart logic.
      runProcess.on('exit', (code, signal) => {
        logging.info(`prometheus has exited with error. Code: ${code}, Signal: ${signal}`);
      });
      // TODO(fortuna): Disable this for production.
      // TODO(fortuna): Consider saving the output and expose it through the manager service.
      runProcess.stdout.pipe(process.stdout);
      runProcess.stderr.pipe(process.stderr);
      resolve(runProcess);
    });
  });
}
